import { useEffect, useState } from "react"
import { useLocation } from "react-router-dom"
import * as XLSX from "xlsx"
import { supabase } from "../../lib/supabase"
import { motion, AnimatePresence } from "framer-motion"
import { useAuth } from "../../context/AuthContext"
import { sendBorrowUpdateEmail, sendNewBorrowAdminEmail, sendBorrowStatusAdminEmail, getAdminEmails } from "../../lib/emailService"
import { createNotification, notifyAdmins, notifyUserByIdentifier } from "../../lib/notifications"
import { EmptyState, LoadingSkeleton } from "../../components/EmptyState"
import { getLastNMonths, getYears, matchesMonth } from "../../lib/dateFilters"

function SuccessToast({ message }) {
  if (!message) return null
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 9999,
      background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.4)",
      borderRadius: "12px", padding: "12px 18px",
      display: "flex", alignItems: "center", gap: "10px",
      backdropFilter: "blur(12px)", boxShadow: "0 0 20px rgba(34,197,94,0.2)",
      animation: "slideInFromTop 0.3s ease-out",
    }}>
      <style>{`@keyframes slideInFromTop { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <span>✅</span>
      <span style={{color:"#86efac",fontSize:"14px",fontWeight:500}}>{message}</span>
    </div>
  )
}

const slideInStyle = `@keyframes slideInFromTop { from { transform: translateY(-10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`

function AnimatedError({ message, onDismiss }) {
  if (!message) return null
  return (
    <div style={{animation:"slideInFromTop 0.3s ease-out",background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.4)",borderRadius:"12px",padding:"12px 16px",marginBottom:"16px",display:"flex",alignItems:"center",gap:"10px",boxShadow:"0 0 20px rgba(239,68,68,0.15)"}}>
      <span style={{fontSize:"18px"}}>⚠️</span>
      <span style={{color:"#fca5a5",fontSize:"14px",flex:1}}>{message}</span>
      <button onClick={onDismiss} style={{color:"#9ca3af",background:"none",border:"none",cursor:"pointer",fontSize:"16px"}}>✕</button>
    </div>
  )
}

function borrowLabel(b) {
  if (b.assets?.name) return b.assets.name
  if (b.category) return `${b.quantity || 1}x ${b.category}`
  return "Asset"
}

function formatDate(d) {
  if (!d) return ""
  const date = new Date(d)
  if (isNaN(date)) return ""
  const dd = String(date.getDate()).padStart(2, "0")
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  return `${dd}/${mm}/${date.getFullYear()}`
}

function exportBorrowsToExcel(borrows) {
  const rows = borrows.map(b => ({
    "Asset": borrowLabel(b),
    "Category": b.category || "",
    "Quantity": b.quantity || "",
    "Serial No.": b.assets?.serial_number || "",
    "Borrower": b.borrower_name || "",
    "Signed Off By": b.signed_off_by || "",
    "Date Borrowed": b.borrowed_at ? formatDate(b.borrowed_at) : "",
    "Needed By": b.needed_by_date ? formatDate(b.needed_by_date) : "",
    "Due Date": b.due_date ? formatDate(b.due_date) : "",
    "Returned": b.returned_at ? formatDate(b.returned_at) : "Active",
    "Notes": b.notes || "",
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Borrows")
  XLSX.writeFile(wb, `borrows_${new Date().toISOString().split("T")[0]}.xlsx`)
}

function getDaysRemaining(dueDate) {
  if (!dueDate) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate)
  due.setHours(0, 0, 0, 0)
  return Math.ceil((due - today) / (1000 * 60 * 60 * 24))
}

function DueBadge({ dueDate }) {
  const days = getDaysRemaining(dueDate)
  if (days === null) return null

  let color, label
  if (days < 0) {
    color = "bg-red-500/20 border-red-500/50 text-red-400"
    label = `${Math.abs(days)}d overdue`
  } else if (days === 0) {
    color = "bg-red-500/20 border-red-500/50 text-red-400"
    label = "Due today!"
  } else if (days < 3) {
    color = "bg-red-500/20 border-red-500/50 text-red-400"
    label = `${days}d left`
  } else if (days < 7) {
    color = "bg-yellow-500/20 border-yellow-500/50 text-yellow-400"
    label = `${days}d left`
  } else {
    color = "bg-green-500/20 border-green-500/50 text-green-400"
    label = `${days}d left`
  }

  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${color} font-medium`}>
      ⏱ {label}
    </span>
  )
}

function isOverdueBorrow(borrow) {
  if (borrow.returned_at) return false
  if (!borrow.due_date) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(borrow.due_date) < today
}

export default function Borrow() {
  const { userProfile, canBorrow, isAdmin, isStandardUser } = useAuth()
  const location = useLocation()
  const [borrows, setBorrows] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [borrowSuccess, setBorrowSuccess] = useState(false)
  const [borrowedAssetName, setBorrowedAssetName] = useState("")
  const [dueBorrows, setDueBorrows] = useState([])
  const [dismissedDueAlert, setDismissedDueAlert] = useState(false)
  const [extendingId, setExtendingId] = useState(null)
  const [extendDate, setExtendDate] = useState("")
  const [noteDrafts, setNoteDrafts] = useState({})
  const [filterBorrowStatus, setFilterBorrowStatus] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [monthFilter, setMonthFilter] = useState("")
  const [yearFilter, setYearFilter] = useState("")
  const [formError, setFormError] = useState("")
  const [toast, setToast] = useState("")
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejectReason, setRejectReason] = useState("")
  const [rejectType, setRejectType] = useState("borrow")

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(""), 3000)
  }
  const [form, setForm] = useState({
    category: "", quantity: "1", borrowing_for: "myself", customer_name: "",
    borrower_email: "", notes: "", borrow_date: new Date().toISOString().split("T")[0],
    needed_by_date: "", due_date: ""
  })

  useEffect(() => {
    if (userProfile !== null && userProfile !== undefined) {
      fetchBorrows()
    }
  }, [userProfile])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const category = params.get("category")
    if (!category) return
    setForm(f => (f.category === category ? f : { ...f, category }))
    setShowForm(true)
  }, [location.search])

  const fetchBorrows = async () => {
    let q = supabase.from("borrow_history").select("*, assets(name, serial_number)").order("borrowed_at", { ascending: false })
    if (!isAdmin) {
      q = q.or(`signed_off_by.eq.${userProfile?.name},signed_off_email.eq.${userProfile?.email}`)
    }
    const { data } = await q

    const rows = data || []
    setBorrows(rows)
    setLoading(false)

    const activeRows = rows.filter(b => !b.returned_at && b.status === "approved")
    const overdue = activeRows.filter(b => {
      if (!b.due_date) return false
      return getDaysRemaining(b.due_date) <= 0
    })
    setDueBorrows(overdue)
    setDismissedDueAlert(false)
  }

  const handleBorrow = async (e) => {
    e.preventDefault()
    setFormError("")
    const isForCustomer  = form.borrowing_for === "customer"
    const quantity = parseInt(form.quantity, 10)
    if (!form.category) { setFormError("Please select a category."); return }
    if (!quantity || quantity < 1) { setFormError("Quantity must be at least 1."); return }
    if (!form.needed_by_date) { setFormError("Please set the date assets are needed by."); return }
    if (!form.due_date) { setFormError("Please set a return date."); return }
    if (isForCustomer && !form.borrower_email) { setFormError("Customer email is required."); return }

    const signedOffBy    = userProfile?.name || userProfile?.email || "Unknown"
    const signedOffEmail = userProfile?.email || null

    const borrowerName  = isForCustomer ? form.customer_name : signedOffBy
    const borrowerEmail = isForCustomer ? (form.borrower_email || null) : signedOffEmail

    const notesParts = [`Borrowed by ${signedOffBy}`]
    if (isForCustomer) notesParts.push(`for customer: ${form.customer_name}`)
    if (form.notes) notesParts.push(form.notes)

    const label = `${quantity}x ${form.category}`

    const { error } = await supabase.from("borrow_history").insert([{
      category:         form.category,
      quantity:         quantity,
      needed_by_date:   form.needed_by_date || null,
      borrowed_at:      form.borrow_date ? new Date(form.borrow_date).toISOString() : new Date().toISOString(),
      due_date:         form.due_date || null,
      borrower_name:    borrowerName,
      borrower_email:   borrowerEmail,
      borrowing_for:    form.borrowing_for,
      customer_name:    isForCustomer ? form.customer_name : null,
      signed_off_by:    signedOffBy,
      signed_off_email: signedOffEmail,
      notes:            notesParts.join(" — "),
      status:           "pending",
    }])

    if (!error) {
      createNotification(userProfile?.id, "📦 Borrow Request Submitted", `"${label}" is pending admin approval`, "info", userProfile?.country)
      notifyAdmins(userProfile?.country, "📦 New Borrow Request", `${borrowerName || userProfile?.name || "A user"} requested "${label}"`, "info")
      getAdminEmails(userProfile?.country).then(adminEmails => {
        if (adminEmails?.length) {
          sendNewBorrowAdminEmail(adminEmails, borrowerName || userProfile?.name || "A user", label, form.due_date)
        }
      })
      if (borrowerEmail) sendBorrowUpdateEmail(borrowerEmail, label, "submitted and is pending approval")
      setBorrowedAssetName(label)
      setShowForm(false)
      setForm({ category: "", quantity: "1", borrowing_for: "myself", customer_name: "", borrower_email: "", notes: "", borrow_date: new Date().toISOString().split("T")[0], needed_by_date: "", due_date: "" })
      setBorrowSuccess(true)
      fetchBorrows()
      setTimeout(() => setBorrowSuccess(false), 2500)
    } else {
      setFormError(error.message)
    }
  }

  const handleApprove = async (borrow) => {
    if (borrow.signed_off_email === userProfile?.email) return
    const label = borrowLabel(borrow)
    const { error } = await supabase.from("borrow_history").update({ status: "approved" }).eq("id", borrow.id)
    if (!error) {
      notifyUserByIdentifier(borrow.signed_off_email || borrow.signed_off_by, "✅ Borrow Request Approved", `Your borrow request for "${label}" has been approved`, "info")
      const toEmail = borrow.signed_off_email || borrow.borrower_email
      if (toEmail) sendBorrowUpdateEmail(toEmail, label, "approved")
      showToast("Borrow request approved")
      fetchBorrows()
    } else {
      showToast(error.message)
    }
  }

  const handleReject = async (borrow, reason) => {
    if (borrow.signed_off_email === userProfile?.email) return
    const label = borrowLabel(borrow)
    const { error } = await supabase.from("borrow_history").update({ status: "rejected", admin_comment: reason, rejected_at: new Date().toISOString() }).eq("id", borrow.id)
    if (!error) {
      notifyUserByIdentifier(borrow.signed_off_email || borrow.signed_off_by, "❌ Borrow Request Rejected", `Your borrow request for "${label}" was rejected: "${reason}"`, "info")
      const toEmail = borrow.signed_off_email || borrow.borrower_email
      if (toEmail) sendBorrowUpdateEmail(toEmail, label, "rejected", reason)
      setRejectTarget(null)
      setRejectReason("")
      showToast("Borrow request rejected")
      fetchBorrows()
    } else {
      showToast(error.message)
    }
  }

  const handleSaveNote = async (borrow, note) => {
    const trimmed = note.trim()
    const isUpdate = !!borrow.admin_note
    const { error } = await supabase.from("borrow_history").update({ admin_note: trimmed || null }).eq("id", borrow.id)
    if (!error) {
      if (trimmed) {
        const title = isUpdate ? "📝 Note Updated" : "📝 Admin Note Added"
        const body = isUpdate
          ? "Admin updated the note on your borrow request"
          : `Admin left a note on your borrow request: "${trimmed}"`
        notifyUserByIdentifier(borrow.signed_off_email || borrow.signed_off_by, title, body, "info")
      }
      showToast(isUpdate ? "Note updated" : "Note saved")
      setNoteDrafts(d => { const next = { ...d }; delete next[borrow.id]; return next })
      fetchBorrows()
    } else {
      showToast(error.message)
    }
  }

  const handleReturn = async (borrow) => {
    if (borrow.return_pending) return
    const label = borrowLabel(borrow)
    const { error } = await supabase.from("borrow_history").update({ return_pending: true }).eq("id", borrow.id)
    if (!error) {
      notifyAdmins(userProfile?.country, "🔄 Return Requested", `${borrow.borrower_name || "A user"} requested to return "${label}"`, "info")
      createNotification(userProfile?.id, "🔄 Return Requested", `Your return request for "${label}" is pending admin approval`, "info", userProfile?.country, userProfile?.id)
      getAdminEmails(userProfile?.country).then(adminEmails => {
        if (adminEmails?.length) {
          sendBorrowStatusAdminEmail(adminEmails, borrow.borrower_name || "A user", label, "return requested")
        }
      })
      showToast("Return request submitted — pending admin approval")
      fetchBorrows()
    } else {
      showToast(error.message)
    }
  }

  const handleApproveReturn = async (borrow) => {
    if (borrow.signed_off_email === userProfile?.email) return
    const label = borrowLabel(borrow)
    const { error } = await supabase.from("borrow_history").update({
      returned_at: new Date().toISOString(),
      return_pending: false,
      extension_pending: false,
    }).eq("id", borrow.id)
    if (!error) {
      if (borrow.asset_id) {
        const hadPermanentOwner = borrow.prev_status === "assigned" && borrow.prev_assigned_user
        if (hadPermanentOwner) {
          await supabase.from("assets")
            .update({ status: "assigned", assigned_user: borrow.prev_assigned_user })
            .eq("id", borrow.asset_id)
        } else {
          const { data: assetRow } = await supabase.from("assets")
            .select("prev_borrower").eq("id", borrow.asset_id).single()
          await supabase.from("assets")
            .update({ status: "available", assigned_user: assetRow?.prev_borrower || null, prev_borrower: null })
            .eq("id", borrow.asset_id)
        }
      }
      if (borrow.borrower_name) {
        const { data: matchedAssets } = await supabase.from("assets")
          .select("id, prev_borrower")
          .eq("status", "borrowed")
          .eq("assigned_user", borrow.borrower_name)
        if (matchedAssets?.length) {
          await Promise.all(matchedAssets.map(a =>
            supabase.from("assets")
              .update({ status: "available", assigned_user: a.prev_borrower || null, prev_borrower: null })
              .eq("id", a.id)
          ))
        }
      }
      notifyUserByIdentifier(borrow.signed_off_email || borrow.signed_off_by, "✅ Return Approved", "Your return has been approved", "info")
      const toEmail = borrow.signed_off_email || borrow.borrower_email
      if (toEmail) sendBorrowUpdateEmail(toEmail, label, "returned")
      getAdminEmails(userProfile?.country).then(adminEmails => {
        if (adminEmails?.length) {
          sendBorrowStatusAdminEmail(adminEmails, borrow.borrower_name || "A user", label, "returned")
        }
      })
      showToast("Return approved")
      fetchBorrows()
    } else {
      showToast(error.message)
    }
  }

  const handleRejectReturn = async (borrow, reason) => {
    if (borrow.signed_off_email === userProfile?.email) return
    const label = borrowLabel(borrow)
    const { error } = await supabase.from("borrow_history")
      .update({ return_pending: false, return_comment: reason })
      .eq("id", borrow.id)
    if (!error) {
      notifyUserByIdentifier(borrow.signed_off_email || borrow.signed_off_by, "❌ Return Rejected", `Your return request for "${label}" was rejected: "${reason}"`, "info")
      const toEmail = borrow.signed_off_email || borrow.borrower_email
      if (toEmail) sendBorrowUpdateEmail(toEmail, label, "denied a return", reason)
      setRejectTarget(null)
      setRejectReason("")
      showToast("Return rejected")
      fetchBorrows()
    } else {
      showToast(error.message)
    }
  }

  const handleExtend = async (borrow) => {
    if (!extendDate || borrow.extension_pending) return
    const { error } = await supabase
      .from("borrow_history")
      .update({ requested_due_date: extendDate, extension_pending: true })
      .eq("id", borrow.id)

    if (!error) {
      const label = borrowLabel(borrow)
      notifyAdmins(userProfile?.country, "📅 Extension Requested", `${borrow.borrower_name || "A user"} requested to extend "${label}" to ${formatDate(extendDate)}`, "info")
      createNotification(userProfile?.id, "📅 Extension Requested", `Your extension request for "${label}" is pending admin approval`, "info", userProfile?.country, userProfile?.id)
      getAdminEmails(userProfile?.country).then(adminEmails => {
        if (adminEmails?.length) {
          sendBorrowStatusAdminEmail(adminEmails, borrow.borrower_name || "A user", label, `has requested an extension until ${formatDate(extendDate)}`)
        }
      })
      setExtendingId(null)
      setExtendDate("")
      showToast("Extension request submitted — pending admin approval")
      fetchBorrows()
    } else {
      showToast(error.message)
    }
  }

  const handleApproveExtension = async (borrow) => {
    if (borrow.signed_off_email === userProfile?.email) return
    const label = borrowLabel(borrow)
    const updates = {
      due_date: borrow.requested_due_date,
      extended_at: new Date().toISOString(),
      extension_pending: false,
      requested_due_date: null,
    }
    if (!borrow.original_due_date && borrow.due_date) {
      updates.original_due_date = borrow.due_date
    }
    const { error } = await supabase.from("borrow_history").update(updates).eq("id", borrow.id)
    if (!error) {
      notifyUserByIdentifier(borrow.signed_off_email || borrow.signed_off_by, "✅ Extension Approved", `Your extension has been approved — new return date ${formatDate(borrow.requested_due_date)}`, "info")
      const toEmail = borrow.signed_off_email || borrow.borrower_email
      if (toEmail) sendBorrowUpdateEmail(toEmail, label, `extended until ${formatDate(borrow.requested_due_date)}`)
      showToast("Extension approved")
      fetchBorrows()
    } else {
      showToast(error.message)
    }
  }

  const handleRejectExtension = async (borrow, reason) => {
    if (borrow.signed_off_email === userProfile?.email) return
    const label = borrowLabel(borrow)
    const { error } = await supabase
      .from("borrow_history")
      .update({ extension_pending: false, requested_due_date: null, extension_comment: reason })
      .eq("id", borrow.id)
    if (!error) {
      notifyUserByIdentifier(borrow.signed_off_email || borrow.signed_off_by, "❌ Extension Rejected", `Your extension request for "${label}" was rejected: "${reason}"`, "info")
      const toEmail = borrow.signed_off_email || borrow.borrower_email
      if (toEmail) sendBorrowUpdateEmail(toEmail, label, "denied an extension", reason)
      setRejectTarget(null)
      setRejectReason("")
      showToast("Extension rejected")
      fetchBorrows()
    } else {
      showToast(error.message)
    }
  }

  const activeBorrows = borrows.filter(b => !b.returned_at && !b.rejected_at)
  const returnedBorrows = borrows.filter(b => b.returned_at || b.rejected_at)
  const todayStr = new Date().toISOString().split("T")[0]

  const matchesSearchAndMonth = (b) => {
    if (!matchesMonth(b.borrowed_at, monthFilter, yearFilter)) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const matches = b.assets?.name?.toLowerCase().includes(q) || b.category?.toLowerCase().includes(q) || b.borrower_name?.toLowerCase().includes(q)
      if (!matches) return false
    }
    return true
  }

  const filteredActiveBorrows = activeBorrows.filter(b => {
    let statusMatch
    if (filterBorrowStatus === "all") statusMatch = true
    else if (filterBorrowStatus === "active") statusMatch = !isOverdueBorrow(b)
    else if (filterBorrowStatus === "overdue") statusMatch = isOverdueBorrow(b)
    else statusMatch = false
    return statusMatch && matchesSearchAndMonth(b)
  })

  const filteredReturnedBorrows = returnedBorrows.filter(b => {
    const statusMatch = filterBorrowStatus === "all" || filterBorrowStatus === "returned"
    return statusMatch && matchesSearchAndMonth(b)
  })

  const selectClass = "bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"

  return (
    <div className="p-4 md:p-8">
      <style>{slideInStyle}</style>

      {/* Borrow Success Animation */}
      <AnimatePresence>
        {borrowSuccess && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ type: "spring", stiffness: 200 }}
              className="text-center"
            >
              {["🎊", "📤", "🎊"].map((emoji, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 0 }}
                  animate={{ opacity: [0, 1, 0], y: -60 }}
                  transition={{ delay: i * 0.2, duration: 1 }}
                  className="absolute text-3xl"
                  style={{ left: `${40 + i * 10}%` }}
                >
                  {emoji}
                </motion.div>
              ))}
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 200 }}
                className="inline-flex items-center justify-center w-24 h-24 bg-blue-500/20 border-2 border-blue-500/50 rounded-full mb-4"
                style={{ boxShadow: "0 0 40px rgba(59, 130, 246, 0.4)" }}
              >
                <span className="text-5xl">📤</span>
              </motion.div>
              <h2 className="text-3xl font-bold text-white mb-2">Request Submitted!</h2>
              <p className="text-gray-400">{borrowedAssetName} is pending admin approval</p>
              <div className="mt-4 w-48 mx-auto h-1 bg-gray-800 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 2.5, ease: "linear" }}
                  className="h-full bg-blue-500 rounded-full"
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overdue / Due Today Alert Banner */}
      <AnimatePresence>
        {dueBorrows.length > 0 && !dismissedDueAlert && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-6 bg-red-500/10 border border-red-500/40 rounded-xl p-4 flex items-start gap-3"
          >
            <span className="text-2xl shrink-0">🔔</span>
            <div className="flex-1">
              <p className="text-red-400 font-semibold text-sm">
                {dueBorrows.length === 1
                  ? "1 asset is overdue or due today!"
                  : `${dueBorrows.length} assets are overdue or due today!`}
              </p>
              <ul className="mt-1 space-y-0.5">
                {dueBorrows.map(b => (
                  <li key={b.id} className="text-gray-400 text-xs">
                    • {borrowLabel(b)} — due {formatDate(b.due_date)}
                  </li>
                ))}
              </ul>
            </div>
            <button
              onClick={() => setDismissedDueAlert(true)}
              className="text-gray-500 hover:text-gray-300 text-sm shrink-0"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">Borrow / Return</h1>
          <p className="text-gray-400 mt-1 text-sm">{activeBorrows.length} active borrows</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => exportBorrowsToExcel(borrows)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background: "rgba(30,41,59,0.8)", border: "1px solid rgba(59,130,246,0.4)", color: "#60a5fa" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(59,130,246,0.15)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(30,41,59,0.8)"}
          >
            📥 Export Excel
          </button>
          {canBorrow && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowForm(!showForm)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-all text-sm font-medium"
            >
              + Borrow Asset
            </motion.button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by asset or borrower name..."
          className="bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm flex-1 min-w-[200px]"
        />
        <select value={filterBorrowStatus} onChange={e => setFilterBorrowStatus(e.target.value)} className={selectClass}>
          <option value="all">All Borrows</option>
          <option value="active">Active</option>
          <option value="returned">Returned</option>
          <option value="overdue">Overdue</option>
        </select>
        <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className={selectClass}>
          <option value="">All Months</option>
          {getLastNMonths().map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <select value={yearFilter} onChange={e => setYearFilter(e.target.value)} className={selectClass}>
          <option value="">All Years</option>
          {getYears().map(y => (
            <option key={y} value={String(y)}>{y}</option>
          ))}
        </select>
      </div>

      {/* Borrow Form */}
      <AnimatePresence>
        {showForm && (
          <motion.form
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            onSubmit={handleBorrow}
            className="bg-gray-900/80 rounded-xl border border-gray-800 p-4 mb-6"
          >
            <h2 className="text-white font-semibold mb-4">Borrow an Asset</h2>
            <AnimatedError message={formError} onDismiss={() => setFormError("")} />
            <div className="space-y-3">

              {/* Category */}
              <div>
                <label className="text-gray-400 text-sm mb-2 block">Category *</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  required
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
                >
                  <option value="">Select category…</option>
                  {["Laptop","Monitor","Portable Speaker","Microphone","Clicker","Others"].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Quantity */}
              <div>
                <label className="text-gray-400 text-sm mb-2 block">Quantity *</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, quantity: String(Math.max(1, (parseInt(f.quantity, 10) || 1) - 1)) }))}
                    className="w-11 h-11 shrink-0 bg-gray-800 hover:bg-gray-700 text-white rounded-lg border border-gray-700 text-lg font-medium transition-all"
                  >
                    −
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={form.quantity}
                    required
                    onChange={(e) => setForm({ ...form, quantity: e.target.value.replace(/[^0-9]/g, "") })}
                    onBlur={() => {
                      if (!form.quantity || parseInt(form.quantity, 10) < 1) {
                        setForm(f => ({ ...f, quantity: "1" }))
                      }
                    }}
                    className="flex-1 min-w-0 text-center bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, quantity: String((parseInt(f.quantity, 10) || 0) + 1) }))}
                    className="w-11 h-11 shrink-0 bg-gray-800 hover:bg-gray-700 text-white rounded-lg border border-gray-700 text-lg font-medium transition-all"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Assets Needed By */}
              <div>
                <label className="text-gray-400 text-sm mb-2 block">
                  Assets Needed By <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  value={form.needed_by_date}
                  min={todayStr}
                  required
                  onChange={(e) => setForm({ ...form, needed_by_date: e.target.value })}
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm [color-scheme:dark]"
                />
              </div>

              {/* Borrowing for */}
              <div>
                <label className="text-gray-400 text-sm mb-2 block">Borrowing For *</label>
                <div className="flex gap-2">
                  {[
                    { value: "myself",   label: "👤 Myself" },
                    { value: "customer", label: "🤝 Customer / External" },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm({ ...form, borrowing_for: opt.value, customer_name: "", borrower_email: "" })}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all ${
                        form.borrowing_for === opt.value
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Signed-off by */}
              <div>
                <label className="text-gray-400 text-sm mb-2 block">Signed Off By</label>
                <input
                  type="text"
                  value={userProfile?.name || userProfile?.email || ""}
                  readOnly
                  className="w-full bg-gray-800/50 text-gray-400 rounded-lg px-4 py-3 border border-gray-700/50 text-sm cursor-not-allowed"
                />
              </div>

              <AnimatePresence>
                {form.borrowing_for === "customer" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
                  >
                    <label className="text-gray-400 text-sm mb-2 block">Customer / External Name *</label>
                    <input
                      type="text"
                      value={form.customer_name}
                      onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                      placeholder="e.g. John Smith"
                      required={form.borrowing_for === "customer"}
                      className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {form.borrowing_for === "customer" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
                  >
                    <label className="text-gray-400 text-sm mb-2 block">
                      Customer Email <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="email"
                      value={form.borrower_email}
                      onChange={(e) => setForm({ ...form, borrower_email: e.target.value })}
                      placeholder="e.g. john@customer.com"
                      required={form.borrowing_for === "customer"}
                      className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Date Borrowed */}
              <div>
                <label className="text-gray-400 text-sm mb-2 block">
                  Date Borrowed <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  value={form.borrow_date}
                  required
                  onChange={(e) => setForm({ ...form, borrow_date: e.target.value })}
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm [color-scheme:dark]"
                />
              </div>

              {/* Return date */}
              <div>
                <label className="text-gray-400 text-sm mb-2 block">
                  Return Date <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  value={form.due_date}
                  min={todayStr}
                  required
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm [color-scheme:dark]"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="text-gray-400 text-sm mb-2 block">
                  Notes <span className="text-gray-600">(optional)</span>
                </label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Any additional notes…"
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
                />
              </div>
            </div>
            <div className="mt-4 flex gap-3">
              <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium">
                Submit
              </button>
              <button type="button" onClick={() => { setShowForm(false); setFormError("") }} className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-2 rounded-lg text-sm">
                Cancel
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <SuccessToast message={toast} />

      {/* Reject Reason Modal */}
      <AnimatePresence>
        {rejectTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 200 }}
              className="bg-gray-900 rounded-2xl border border-gray-700 p-6 w-full max-w-sm shadow-2xl"
            >
              <div className="text-center mb-4">
                <div className="text-3xl mb-2">❌</div>
                <h3 className="text-white font-semibold">{rejectType === "extension" ? "Reject Extension Request" : rejectType === "return" ? "Reject Return Request" : "Reject Borrow Request"}</h3>
                <p className="text-gray-400 text-sm mt-1">{borrowLabel(rejectTarget)}</p>
              </div>
              <label className="text-gray-400 text-sm mb-2 block">
                Reason for Rejection <span className="text-red-400">*</span>
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                placeholder="e.g. Item unavailable during requested dates"
                className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm resize-none"
              />
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => { setRejectTarget(null); setRejectReason("") }}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2.5 rounded-xl text-sm font-medium transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const reason = rejectReason.trim()
                    if (rejectType === "extension") handleRejectExtension(rejectTarget, reason)
                    else if (rejectType === "return") handleRejectReturn(rejectTarget, reason)
                    else handleReject(rejectTarget, reason)
                  }}
                  disabled={!rejectReason.trim()}
                  className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white py-2.5 rounded-xl text-sm font-medium transition-all"
                >
                  Confirm Reject
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active Borrows */}
      {(filterBorrowStatus === "all" || filterBorrowStatus === "active" || filterBorrowStatus === "overdue") && (
        <div className="mb-6">
          <h2 className="text-white font-semibold mb-4">Active Borrows</h2>
          {loading ? (
            <LoadingSkeleton rows={3} cols={2} />
          ) : filteredActiveBorrows.length === 0 ? (
            <EmptyState preset="borrows" emoji="📤" title="No active borrows" sub="All assets are currently available" />
          ) : (
            <div className="space-y-3">
              {filteredActiveBorrows.map((borrow) => {
                const overdue = isOverdueBorrow(borrow)
                return (
                  <motion.div
                    key={borrow.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`bg-gray-900/80 rounded-xl border p-4 ${overdue ? "border-l-4 border-red-500 bg-red-500/5 border-red-500/30" : "border-gray-800"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-white font-medium">{borrowLabel(borrow)}</p>
                          {overdue && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 font-medium">
                              Overdue
                            </span>
                          )}
                          {borrow.extension_pending && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-400 font-medium">
                              Extension pending
                            </span>
                          )}
                          {borrow.return_pending && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-400 font-medium">
                              🔄 Return Pending Approval
                            </span>
                          )}
                          {borrow.status === "pending" && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 font-medium">
                              ⏳ Pending Approval
                            </span>
                          )}
                        </div>
                        {borrow.assets?.serial_number ? (
                          <p className="text-gray-500 text-xs mt-1">{borrow.assets.serial_number}</p>
                        ) : borrow.needed_by_date ? (
                          <p className="text-gray-500 text-xs mt-1">Needed by: {formatDate(borrow.needed_by_date)}</p>
                        ) : null}
                        <p className="text-gray-400 text-sm mt-2">{borrow.notes || "—"}</p>
                        {borrow.borrowing_for === "customer" && borrow.customer_name && (
                          <p className="text-xs text-blue-400 mt-1">
                            🤝 For customer: {borrow.customer_name}
                            {borrow.signed_off_by && ` · Signed off by: ${borrow.signed_off_by}`}
                          </p>
                        )}
                        <div className="mt-2 space-y-0.5">
                          <p className="text-gray-500 text-xs">
                            Borrowed: {formatDate(borrow.borrowed_at)}
                          </p>
                          {borrow.original_due_date && (
                            <p className="text-gray-500 text-xs">
                              Original return date: {formatDate(borrow.original_due_date)}
                            </p>
                          )}
                          {borrow.due_date && (
                            <div className="flex items-center gap-2">
                              <p className="text-gray-500 text-xs">
                                {borrow.original_due_date ? "Extended to:" : "Due:"}{" "}
                                {formatDate(borrow.due_date)}
                              </p>
                              <DueBadge dueDate={borrow.due_date} />
                            </div>
                          )}
                          {borrow.extended_at && (
                            <p className="text-gray-600 text-xs">
                              Extended on: {formatDate(borrow.extended_at)}
                            </p>
                          )}
                          {borrow.extension_pending && (
                            <p className="text-purple-400 text-xs">
                              Requested extension to: {formatDate(borrow.requested_due_date)}
                            </p>
                          )}
                        </div>

                        <AnimatePresence>
                          {extendingId === borrow.id && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="mt-3 flex items-center gap-2 flex-wrap"
                            >
                              <input
                                type="date"
                                value={extendDate}
                                min={borrow.due_date || todayStr}
                                onChange={(e) => setExtendDate(e.target.value)}
                                className="bg-gray-800 text-white rounded-lg px-3 py-1.5 border border-gray-700 focus:border-purple-500 focus:outline-none text-sm [color-scheme:dark]"
                              />
                              <button
                                onClick={() => handleExtend(borrow)}
                                disabled={!extendDate}
                                className="bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                              >
                                Confirm Extension
                              </button>
                              <button
                                onClick={() => { setExtendingId(null); setExtendDate("") }}
                                className="text-gray-500 hover:text-gray-300 text-sm"
                              >
                                Cancel
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {(isAdmin || isStandardUser) && borrow.status === "approved" && !borrow.extension_pending && !borrow.return_pending && borrow.signed_off_email === userProfile?.email && (
                        <div className="flex flex-col gap-2 shrink-0">
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleReturn(borrow)}
                            className="text-green-400 hover:text-green-300 text-sm px-3 py-1 rounded border border-green-400/30 transition-all"
                          >
                            Return
                          </motion.button>
                          {borrow.due_date && extendingId !== borrow.id && (
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => { setExtendingId(borrow.id); setExtendDate("") }}
                              className="text-purple-400 hover:text-purple-300 text-sm px-3 py-1 rounded border border-purple-400/30 transition-all"
                            >
                              Extend
                            </motion.button>
                          )}
                        </div>
                      )}

                      {isAdmin && borrow.status === "pending" && borrow.signed_off_email !== userProfile?.email && (
                        <div className="flex flex-col gap-2 shrink-0">
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleApprove(borrow)}
                            className="text-green-400 hover:text-green-300 text-sm px-3 py-1 rounded border border-green-400/30 transition-all"
                          >
                            Approve
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => { setRejectTarget(borrow); setRejectReason(""); setRejectType("borrow") }}
                            className="text-red-400 hover:text-red-300 text-sm px-3 py-1 rounded border border-red-400/30 transition-all"
                          >
                            Reject
                          </motion.button>
                        </div>
                      )}

                      {isAdmin && borrow.extension_pending && borrow.signed_off_email !== userProfile?.email && (
                        <div className="flex flex-col gap-2 shrink-0">
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleApproveExtension(borrow)}
                            className="text-green-400 hover:text-green-300 text-sm px-3 py-1 rounded border border-green-400/30 transition-all"
                          >
                            Approve Extension
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => { setRejectTarget(borrow); setRejectReason(""); setRejectType("extension") }}
                            className="text-red-400 hover:text-red-300 text-sm px-3 py-1 rounded border border-red-400/30 transition-all"
                          >
                            Reject Extension
                          </motion.button>
                        </div>
                      )}

                      {isAdmin && borrow.return_pending && borrow.signed_off_email !== userProfile?.email && (
                        <div className="flex flex-col gap-2 shrink-0">
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleApproveReturn(borrow)}
                            className="text-green-400 hover:text-green-300 text-sm px-3 py-1 rounded border border-green-400/30 transition-all"
                          >
                            Approve Return
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => { setRejectTarget(borrow); setRejectReason(""); setRejectType("return") }}
                            className="text-red-400 hover:text-red-300 text-sm px-3 py-1 rounded border border-red-400/30 transition-all"
                          >
                            Reject Return
                          </motion.button>
                        </div>
                      )}
                    </div>

                    {borrow.status === "approved" && (isAdmin || borrow.admin_note) && (
                      <div className="mt-3 pt-3 border-t border-gray-800">
                        <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2">Admin Note</p>
                        {isAdmin ? (
                          <div className="flex items-center gap-2 flex-wrap">
                            <input
                              type="text"
                              value={noteDrafts[borrow.id] ?? borrow.admin_note ?? ""}
                              onChange={(e) => setNoteDrafts(d => ({ ...d, [borrow.id]: e.target.value }))}
                              placeholder="Add a note for the borrower..."
                              className="flex-1 min-w-[180px] bg-gray-800 text-white rounded-lg px-3 py-1.5 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
                            />
                            <button
                              onClick={() => handleSaveNote(borrow, noteDrafts[borrow.id] ?? borrow.admin_note ?? "")}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                            >
                              Save Note
                            </button>
                          </div>
                        ) : (
                          <p className="text-gray-300 text-sm">{borrow.admin_note}</p>
                        )}
                      </div>
                    )}
                  </motion.div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Return History */}
      {(filterBorrowStatus === "all" || filterBorrowStatus === "returned") && filteredReturnedBorrows.length > 0 && (
        <div>
          <h2 className="text-white font-semibold mb-4">Return History</h2>
          <div className="space-y-3">
            {filteredReturnedBorrows.map((borrow) => (
              <div key={borrow.id} className={"bg-gray-900/80 rounded-xl border border-gray-800 p-4"}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-white font-medium">{borrowLabel(borrow)}</p>
                    {borrow.rejected_at && (
                      <div className="mt-2 rounded-lg px-3 py-2 bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                        ❌ Rejected{borrow.admin_comment ? `: "${borrow.admin_comment}"` : "."}
                      </div>
                    )}
                    {borrow.assets?.serial_number && (
                      <p className="text-gray-500 text-xs mt-1">{borrow.assets.serial_number}</p>
                    )}
                    <p className="text-gray-400 text-sm mt-2">{borrow.notes || "—"}</p>
                    <div className="mt-2 space-y-0.5">
                      <p className="text-gray-500 text-xs">
                        Borrowed: {formatDate(borrow.borrowed_at)}
                      </p>
                      {borrow.original_due_date && (
                        <p className="text-gray-500 text-xs">
                          Original return date: {formatDate(borrow.original_due_date)}
                        </p>
                      )}
                      {borrow.due_date && (
                        <p className="text-gray-500 text-xs">
                          {borrow.original_due_date ? "Extended to:" : "Was due:"}{" "}
                          {formatDate(borrow.due_date)}
                        </p>
                      )}
                      {borrow.extended_at && (
                        <p className="text-gray-600 text-xs">
                          Extended on: {formatDate(borrow.extended_at)}
                        </p>
                      )}
                      {borrow.rejected_at ? (
                        <p className="text-gray-500 text-xs">
                          Rejected: {formatDate(borrow.rejected_at)}
                        </p>
                      ) : (
                        <p className="text-gray-500 text-xs">
                          Returned: {formatDate(borrow.returned_at)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
