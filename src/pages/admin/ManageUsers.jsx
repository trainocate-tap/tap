import { useEffect, useState, useRef } from "react"
import * as XLSX from "xlsx"
import { supabase } from "../../lib/supabase"
import { useAuth } from "../../context/AuthContext"
import { motion, AnimatePresence } from "framer-motion"
import { useTranslation } from "react-i18next"
import { createNotification } from "../../lib/notifications"
import { LoadingSkeleton, EmptyState } from "../../components/EmptyState"
import { statusLabel } from "../../lib/statusLabel"

function SuccessToast({ message }) {
  if (!message) return null
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 9999,
      background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.4)",
      borderRadius: "12px", padding: "12px 18px",
      display: "flex", alignItems: "center", gap: "10px",
      backdropFilter: "blur(12px)", boxShadow: "0 0 20px rgba(34,197,94,0.2)",
      animation: "fadeInUp 0.3s ease-out",
    }}>
      <style>{`@keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <span>✅</span>
      <span style={{color:"#86efac",fontSize:"14px",fontWeight:500}}>{message}</span>
    </div>
  )
}

const ROLES = ["admin", "standard_user", "guest"]
const COUNTRIES = ["Singapore", "Malaysia", "Thailand", "Indonesia", "Philippines", "Vietnam", "Taiwan", "Hong Kong", "India", "Japan", "Sri Lanka", "Gulf (UAE)", "United States"]

const roleColors = {
  admin: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  standard_user: "bg-green-500/20 text-green-400 border-green-500/30",
  guest: "bg-gray-500/20 text-gray-400 border-gray-500/30",
}

const roleLabels = {
  admin: "Admin",
  standard_user: "Standard User",
  guest: "Guest",
}

function AnimatedError({ message, onDismiss }) {
  if (!message) return null
  return (
    <div style={{
      animation: "slideInFromTop 0.3s ease-out",
      background: "rgba(239,68,68,0.1)",
      border: "1px solid rgba(239,68,68,0.4)",
      borderRadius: "12px",
      padding: "12px 16px",
      marginBottom: "16px",
      display: "flex",
      alignItems: "center",
      gap: "10px",
      boxShadow: "0 0 20px rgba(239,68,68,0.15)"
    }}>
      <style>{`@keyframes slideInFromTop { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <span style={{fontSize:"18px"}}>⚠️</span>
      <span style={{color:"#fca5a5",fontSize:"14px",flex:1}}>{message}</span>
      <button onClick={onDismiss} style={{color:"#9ca3af",background:"none",border:"none",cursor:"pointer",fontSize:"16px"}}>✕</button>
    </div>
  )
}

export default function ManageUsers() {
  const { t } = useTranslation()
  const { userProfile, isAdmin, isGlobalAdmin } = useAuth()
  const adminCountry = userProfile?.country || "Singapore"

  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [success, setSuccess] = useState("")
  const [error, setError] = useState("")
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "standard_user", country: adminCountry, department: "" })
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [editForm, setEditForm] = useState({ name: "", role: "standard_user", country: "Singapore", marketing_access: false, marketing_role: "" })
  const [saving, setSaving] = useState(false)
  const [detailUser, setDetailUser] = useState(null)
  const [detailAssets, setDetailAssets] = useState([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailBorrows, setDetailBorrows] = useState([])
  const [detailBorrowsLoading, setDetailBorrowsLoading] = useState(false)
  const [detailBorrowHistory, setDetailBorrowHistory] = useState([])
  const [detailBorrowHistoryLoading, setDetailBorrowHistoryLoading] = useState(false)
  const [detailPreparedAssets, setDetailPreparedAssets] = useState([])
  const [detailPreparedAssetsLoading, setDetailPreparedAssetsLoading] = useState(false)
  const [userSearch, setUserSearch] = useState("")
  const fileInputRef = useRef()

  // Country defaults to Singapore for all new users

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    let userQuery = supabase.from("user_profiles").select("*").order("created_at", { ascending: true })
    if (!isGlobalAdmin) userQuery = userQuery.eq("country", adminCountry)
    const [{ data: profileData }, { data: authData }, { data: assetsData }] = await Promise.all([
      userQuery,
      supabase.rpc("get_auth_users"),
      supabase.from("assets").select("assigned_user"),
    ])
const emailMap = {}
    const lastSignInMap = {}
    authData?.forEach(u => {
      emailMap[u.id] = u.email
      lastSignInMap[u.id] = u.last_sign_in_at || null
    })

    // Build asset count map keyed by lowercase name or email
    const assetCountMap = {}
    ;(assetsData || []).forEach(a => {
      if (a.assigned_user) {
        const key = a.assigned_user.trim().toLowerCase()
        assetCountMap[key] = (assetCountMap[key] || 0) + 1
      }
    })

    const merged = (profileData || []).map(u => {
      const email = emailMap[u.id] || u.email
      const nameKey = (u.name || "").trim().toLowerCase()
      const emailKey = (email || "").trim().toLowerCase()
      const assetsCount = (assetCountMap[nameKey] || 0) + (nameKey !== emailKey ? (assetCountMap[emailKey] || 0) : 0)
      return {
        ...u,
        email,
        assetsCount,
        last_login: lastSignInMap[u.id] || u.last_login || null,
      }
    })
    setUsers(merged)
    setLoading(false)
  }

  const showSuccess = (msg) => {
    setSuccess(msg)
    setError("")
    setTimeout(() => setSuccess(""), 4000)
  }

  const showError = (msg) => {
    setError(msg)
    setSuccess("")
    setTimeout(() => setError(""), 6000)
  }

  // Auto-dismiss error after 5 seconds (AnimatedError)
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(""), 5000)
    return () => clearTimeout(t)
  }, [error])

  const handleRoleChange = async (userId, newRole) => {
    if (userId === userProfile?.id && newRole !== "admin") {
      alert("You cannot demote yourself from admin.")
      return
    }
    await supabase.from("user_profiles").update({ role: newRole }).eq("id", userId)
    setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u))
  }

  const handleCreateUser = async (e) => {
    e.preventDefault()
    setError("")
    if (!form.email?.trim()) { showError("Please enter an email address."); return }
    if (!form.name?.trim())  { showError("Please enter the user's name."); return }
    if (!form.password || form.password.length < 8) { showError("Password must be at least 8 characters."); return }
    setCreating(true)

    try {
      // Force a session refresh to avoid "Invalid or expired session" errors
      const { data: refreshed } = await supabase.auth.refreshSession()
      const token = refreshed?.session?.access_token
      if (!token) throw new Error("Session expired — please log out and log in again")

      const { data, error: fnError } = await supabase.functions.invoke("create-user", {
        body: {
          email: form.email,
          password: form.password,
          name: form.name,
          role: form.role,
          country: form.country || "Singapore",
        },
        headers: { Authorization: `Bearer ${token}` },
      })

      // fnError means non-2xx (network error or relay error).
      // The edge function itself always returns 200 with { error } in the body
      // for user-facing errors, so fnError here is truly unexpected.
      if (fnError) {
        // Try to read the actual error body from the response context
        let errorMsg = "Edge function unreachable — please try again"
        try {
          const errBody = await fnError.context?.json?.()
          if (errBody?.error) errorMsg = errBody.error
        } catch {}
        throw new Error(errorMsg)
      }

      // Our edge function returns { error: "..." } in body (status 200) for user errors
      if (data?.error) {
        throw new Error(data.error)
      }

      const createdName = form.name || form.email
      setForm({ name: "", email: "", password: "", role: "standard_user", country: adminCountry, department: "" })
      setShowForm(false)
      showSuccess(`✅ Account created for ${createdName}! Welcome email sent.`)
      fetchUsers()
      // Notify admin
      if (userProfile?.id) {
        createNotification(userProfile.id, "✅ User Created", `New user "${createdName}" was created`, "success", userProfile?.country)
      }
    } catch (err) {
      showError(err.message)
    } finally {
      setCreating(false)
    }
  }

  const handleViewUser = async (u) => {
    setDetailUser(u)
    setDetailAssets([])
    setDetailLoading(true)
    const { data } = await supabase
      .from("assets")
      .select("id, name, asset_tag, category, status")
      .ilike("assigned_user", u.name || u.email)
      .eq("status", "assigned")
    setDetailAssets(data || [])
    setDetailLoading(false)

    setDetailBorrows([])
    setDetailBorrowsLoading(true)
    const { data: borrows } = await supabase
      .from("borrow_history")
      .select("id, category, quantity, borrowed_at, due_date")
      .or(`borrower_name.eq.${u.name},borrower_email.eq.${u.email}`)
      .is("returned_at", null)
      .is("rejected_at", null)
    setDetailBorrows(borrows || [])
    setDetailBorrowsLoading(false)

    setDetailBorrowHistory([])
    setDetailBorrowHistoryLoading(true)
    const { data: history } = await supabase
      .from("borrow_history")
      .select("id, category, quantity, borrowed_at, returned_at, rejected_at")
      .or(`borrower_name.eq.${u.name},borrower_email.eq.${u.email}`)
      .or("returned_at.not.is.null,rejected_at.not.is.null")
    setDetailBorrowHistory(history || [])
    setDetailBorrowHistoryLoading(false)

    setDetailPreparedAssets([])
    setDetailPreparedAssetsLoading(true)
    const { data: prepared } = await supabase
      .from("assets")
      .select("id, name, serial_number, category")
      .eq("status", "borrowed")
      .ilike("assigned_user", u.name || u.email)
    setDetailPreparedAssets(prepared || [])
    setDetailPreparedAssetsLoading(false)
  }

  const handleToggle2FA = async (u) => {
    const newVal = !u.two_factor_enabled
    await supabase.from("user_profiles").update({ two_factor_enabled: newVal }).eq("id", u.id)
    setUsers(users.map(x => x.id === u.id ? { ...x, two_factor_enabled: newVal } : x))
    showSuccess(`2FA ${newVal ? "enabled" : "disabled"} for ${u.name || u.email}`)
  }

  const handleToggleMarketing = async (u) => {
    const newVal = !u.marketing_access
    const { error: updateErr } = await supabase.from("user_profiles").update({ marketing_access: newVal }).eq("id", u.id)
    if (updateErr) {
      showError(`Failed to update marketing access: ${updateErr.message}`)
      return
    }
    setUsers(users.map(x => x.id === u.id ? { ...x, marketing_access: newVal } : x))
    showSuccess(`Marketing access ${newVal ? "granted to" : "removed from"} ${u.name || u.email}`)
  }

  const handleEditUser = (u) => {
    setEditForm({
      name: u.name || "",
      role: u.role || "standard_user",
      country: u.country || "Singapore",
      marketing_access: !!u.marketing_access,
      marketing_role: u.marketing_role || "",
    })
    setEditTarget(u)
  }

  const generatePassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$"
    let pwd = ""
    for (let i = 0; i < 12; i++) pwd += chars[Math.floor(Math.random() * chars.length)]
    setForm(f => ({ ...f, password: pwd }))
  }

  const handleSaveEdit = async () => {
    if (!editTarget) return
    setSaving(true)
    try {
      const updatePayload = {
        name: editForm.name,
        role: editForm.role,
        country: editForm.country,
        marketing_access: editForm.marketing_access,
        marketing_role: editForm.marketing_access ? (editForm.marketing_role || null) : null,
      }
      const { error: updateErr } = await supabase.from("user_profiles").update(updatePayload).eq("id", editTarget.id)

      if (updateErr) throw updateErr

      setUsers(users.map(u => u.id === editTarget.id ? { ...u, ...updatePayload } : u))

      showSuccess(`${editForm.name || editTarget.email}'s profile updated.`)
      setEditTarget(null)
      fetchUsers()
    } catch (err) {
      showError(`Failed to save: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    setImporting(true)
    setImportResult(null)

    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: "array" })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json(ws, { defval: "" })

      if (!raw.length) throw new Error("File is empty or unreadable.")

      const normalise = (obj) => {
        const out = {}
        for (const k of Object.keys(obj)) out[k.trim().toLowerCase()] = String(obj[k]).trim()
        return out
      }
      const rows = raw.map(normalise)

      const col = (row, ...names) => {
        for (const n of names) if (row[n] !== undefined && row[n] !== "") return row[n]
        return ""
      }

      const { data: sessionData } = await supabase.auth.getSession()
      const session = sessionData?.session

      if (!session?.access_token) {
        throw new Error("Session expired — please log out and log in again")
      }

      let ok = 0
      const failed = []

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const name  = col(row, "full name", "name", "fullname")
        const email = col(row, "email", "e-mail", "email address")
        const rawRole = col(row, "role").toLowerCase()
        const role  = rawRole === "admin" ? "admin"
                    : rawRole === "standard_user" || rawRole === "standard" || rawRole === "it" ? "standard_user"
                    : rawRole === "guest" || rawRole === "view" || rawRole === "viewer" ? "guest"
                    : "standard_user"
        const rawCountry = col(row, "country")
        const country = COUNTRIES.includes(rawCountry) ? rawCountry : (rawCountry ? "Other" : adminCountry)

        if (!email || !email.includes("@")) {
          failed.push({ row: i + 2, email: email || "(blank)", reason: "Invalid or missing email" })
          continue
        }

        // Pre-check: skip only if email truly exists in user_profiles
        const normalizedEmail = email.trim().toLowerCase()
        const { data: existing } = await supabase
          .from("user_profiles")
          .select("id, email")
          .ilike("email", normalizedEmail)
          .maybeSingle()
        if (existing) {
          failed.push({ row: i + 2, email, reason: "Account already exists (skipped)" })
          continue
        }

        const tempPassword = Math.random().toString(36).slice(2, 10) + "A1!"

        try {
          const { data: fnData, error: fnError } = await supabase.functions.invoke("create-user", {
            body: { email, password: tempPassword, name, role, country },
            headers: { Authorization: `Bearer ${session.access_token}` },
          })

          // Edge fn always returns 200; errors are in fnData.error
          const errMsg = fnData?.error || (fnError ? "Edge function unreachable" : null)
          if (errMsg) {
            failed.push({ row: i + 2, email, reason: errMsg })
            continue
          }
          ok++
        } catch (err) {
          failed.push({ row: i + 2, email, reason: err.message || "Unknown error" })
        }
      }

      setImportResult({ ok, failed })
      if (ok > 0) {
        showSuccess(`${ok} user${ok !== 1 ? "s" : ""} imported!`)
        fetchUsers()
        if (userProfile?.id) {
          createNotification(userProfile.id, "📥 Users Imported", `${ok} user${ok !== 1 ? "s" : ""} imported successfully via Excel`, "success", userProfile?.country)
        }
      }
    } catch (err) {
      setImportResult({ ok: 0, failed: [{ row: "—", email: "—", reason: err.message }] })
    } finally {
      setImporting(false)
    }
  }

  const handleDeleteUser = (u) => {
    if (u.id === userProfile?.id) {
      alert("You cannot delete your own account.")
      return
    }
    setDeleteTarget(u)
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const deletedLabel = deleteTarget.name || deleteTarget.email
    try {
      const { error } = await supabase.rpc("delete_user", { target_id: deleteTarget.id })
      if (error) throw new Error(error.message)

      await supabase.from("assets")
        .update({ assigned_user: null, status: "available" })
        .eq("assigned_user", deleteTarget.name)

      setUsers(users.filter(x => x.id !== deleteTarget.id))
      showSuccess(`${deletedLabel} has been permanently deleted.`)
      if (userProfile?.id) {
        createNotification(userProfile.id, "🗑️ User Deleted", `User "${deletedLabel}" was deleted`, "info", userProfile?.country)
      }
    } catch (err) {
      setError(`Delete failed: ${err.message}`)
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  if (!isAdmin && !isGlobalAdmin) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-64">
        <span className="text-5xl mb-4">🔒</span>
        <h2 className="text-white text-xl font-bold mb-2">Access Denied</h2>
        <p className="text-gray-400 text-sm">Only admins can manage users.</p>
      </div>
    )
  }

  return (
    <div className="p-3 md:p-8" style={{ width: "100%", maxWidth: "100vw", overflowX: "hidden" }}>

      {/* Success toast — fixed bottom-right */}
      <SuccessToast message={success} />

      {/* Error toast — animated slide-in */}
      <AnimatedError message={error} onDismiss={() => setError("")} />

      {/* ── Delete confirmation modal ─────────────────────────────────────── */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            key="delete-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)" }}
            onClick={() => !deleting && setDeleteTarget(null)}
          >
            <motion.div
              key="delete-card"
              initial={{ scale: 0.82, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.82, opacity: 0, y: 16 }}
              transition={{ type: "spring", stiffness: 280, damping: 22 }}
              onClick={e => e.stopPropagation()}
              style={{
                background: "rgba(9, 13, 28, 0.96)",
                backdropFilter: "blur(18px)",
                border: "0.5px solid rgba(239,68,68,0.65)",
                boxShadow: "0 0 28px rgba(239,68,68,0.22), 0 0 80px rgba(239,68,68,0.08), 0 20px 60px rgba(0,0,0,0.5)",
                borderRadius: "20px",
                padding: "32px 28px",
                maxWidth: "380px",
                width: "100%",
              }}
            >
              <div className="flex justify-center mb-5">
                <motion.div
                  animate={{ scale: [1, 1.13, 1] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 64,
                    height: 64,
                    background: "rgba(239,68,68,0.12)",
                    border: "1.5px solid rgba(239,68,68,0.45)",
                    borderRadius: "50%",
                  }}
                >
                  <span style={{ fontSize: 28 }}>⚠️</span>
                </motion.div>
              </div>

              <h2 className="text-white text-xl font-bold text-center mb-2">Delete Account?</h2>
              <p className="text-gray-400 text-sm text-center leading-relaxed mb-7">
                You are about to delete{" "}
                <span className="text-red-400 font-bold">{deleteTarget.name || deleteTarget.email}</span>
                's account.{" "}
                <span className="text-gray-300">This action cannot be undone!</span>
              </p>

              <div className="flex gap-3">
                <motion.button
                  whileHover={{ boxShadow: "0 0 14px rgba(59,130,246,0.35)", borderColor: "rgba(59,130,246,0.55)" }}
                  onClick={() => !deleting && setDeleteTarget(null)}
                  disabled={deleting}
                  className="flex-1 py-2.5 rounded-xl border border-gray-600 text-gray-300 hover:text-white transition-all font-medium text-sm disabled:opacity-40"
                >
                  Cancel
                </motion.button>
                <motion.button
                  whileHover={!deleting ? {
                    scale: 1.03,
                    x: [0, -4, 4, -3, 3, -2, 2, 0],
                    transition: { x: { duration: 0.4 }, scale: { duration: 0.15 } },
                  } : {}}
                  onClick={handleConfirmDelete}
                  disabled={deleting}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{
                    background: deleting ? "rgba(239,68,68,0.5)" : "linear-gradient(135deg, #dc2626, #ef4444)",
                    boxShadow: "0 0 16px rgba(239,68,68,0.25)",
                  }}
                >
                  {deleting ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Deleting…
                    </>
                  ) : "Delete"}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Edit User Modal ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {editTarget && (
          <motion.div
            key="edit-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)" }}
            onClick={() => !saving && setEditTarget(null)}
          >
            <motion.div
              key="edit-card"
              initial={{ scale: 0.82, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.82, opacity: 0, y: 16 }}
              transition={{ type: "spring", stiffness: 280, damping: 22 }}
              onClick={e => e.stopPropagation()}
              style={{
                background: "rgba(9, 13, 28, 0.96)",
                backdropFilter: "blur(18px)",
                border: "0.5px solid rgba(59,130,246,0.5)",
                boxShadow: "0 0 28px rgba(59,130,246,0.15), 0 20px 60px rgba(0,0,0,0.5)",
                borderRadius: "20px",
                padding: "28px 24px",
                maxWidth: "420px",
                width: "100%",
                maxHeight: "90vh",
                overflowY: "auto",
              }}
            >
              <h2 className="text-white text-lg font-bold mb-1">Edit User</h2>
              <p className="text-gray-500 text-sm mb-5 font-mono">{editTarget.email}</p>

              <div className="space-y-3">
                {/* Full Name */}
                <div>
                  <label className="text-gray-400 text-xs mb-1 block">Full Name</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Sarah Lee"
                    className="w-full bg-gray-800 text-white rounded-lg px-3 py-2.5 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
                  />
                </div>

                {/* Role */}
                <div>
                  <label className="text-gray-400 text-xs mb-1 block">Role</label>
                  <select
                    value={editForm.role}
                    onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
                    className="w-full bg-gray-800 text-white rounded-lg px-3 py-2.5 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
                  >
                    <option value="standard_user">Standard User</option>
                    <option value="guest">Guest</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                {/* Country */}
                <div>
                  <label className="text-gray-400 text-xs mb-1 block">Country</label>
                  <select
                    value={editForm.country}
                    onChange={e => setEditForm(f => ({ ...f, country: e.target.value }))}
                    className="w-full bg-gray-800 text-white rounded-lg px-3 py-2.5 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
                  >
                    {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {/* Marketing Access toggle */}
                <div className="flex items-center justify-between py-2.5 px-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
                  <div>
                    <p className="text-white text-sm font-medium">Marketing Access</p>
                    <p className="text-gray-500 text-xs mt-0.5">Access to Marketing module</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditForm(f => ({ ...f, marketing_access: !f.marketing_access, marketing_role: "" }))}
                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${editForm.marketing_access ? "bg-purple-600" : "bg-gray-600"}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${editForm.marketing_access ? "translate-x-5" : "translate-x-0"}`} />
                  </button>
                </div>

                {/* Marketing Role — only when marketing_access is ON */}
                {editForm.marketing_access && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} style={{ overflow: "hidden" }}
                  >
                    <label className="text-gray-400 text-xs mb-1 block">Marketing Role</label>
                    <select
                      value={editForm.marketing_role}
                      onChange={e => setEditForm(f => ({ ...f, marketing_role: e.target.value }))}
                      className="w-full bg-gray-800 text-white rounded-lg px-3 py-2.5 border border-purple-500/30 focus:border-purple-500 focus:outline-none text-sm"
                    >
                      <option value="">Select role…</option>
                      <option value="marketing_admin">Marketing Admin</option>
                      <option value="marketing_staff">Marketing Staff</option>
                      <option value="bdm">BDM</option>
                      <option value="bdms">BDMS</option>
                    </select>
                  </motion.div>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <motion.button
                  whileHover={{ boxShadow: "0 0 14px rgba(59,130,246,0.25)" }}
                  onClick={() => !saving && setEditTarget(null)}
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl border border-gray-600 text-gray-300 hover:text-white transition-all font-medium text-sm disabled:opacity-40"
                >
                  Cancel
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{
                    background: saving ? "rgba(59,130,246,0.5)" : "linear-gradient(135deg, #2563eb, #3b82f6)",
                    boxShadow: "0 0 16px rgba(59,130,246,0.25)",
                  }}
                >
                  {saving ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Saving…
                    </>
                  ) : "Save Changes"}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-0 mb-4 md:mb-6">
        <div>
          <h1 className="text-lg md:text-3xl font-bold text-white">{t("manageUsersTitle")}</h1>
          <p className="text-gray-400 mt-0.5 text-xs md:text-sm">{users.length} team members</p>
        </div>
        <div className="flex gap-2 self-start md:self-auto">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleImportFile}
          />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white px-3 md:px-4 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium flex items-center gap-1.5"
          >
            {importing ? (
              <>
                <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                <span className="hidden md:inline">Importing…</span>
              </>
            ) : (
              <>
                <span>📥</span>
                <span className="hidden md:inline">Import Users</span>
              </>
            )}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              setForm({ name: "", email: "", password: "", role: "standard_user", country: adminCountry, department: "" })
              setShowForm(v => !v)
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 md:px-4 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium"
          >
            + {t("addNewUser")}
          </motion.button>
        </div>
      </div>

      {/* Import result panel */}
      <AnimatePresence>
        {importResult && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-4 bg-gray-900/80 border border-gray-700 rounded-xl p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-white font-semibold text-sm">Import Results</p>
              <button onClick={() => setImportResult(null)} className="text-gray-500 hover:text-white text-lg leading-none">✕</button>
            </div>
            {importResult.ok > 0 && (
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                <p className="text-green-400 text-sm font-medium">
                  {importResult.ok} user{importResult.ok !== 1 ? "s" : ""} imported successfully — welcome emails sent.
                </p>
              </div>
            )}
            {importResult.failed.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                  <p className="text-red-400 text-sm font-medium">{importResult.failed.length} row{importResult.failed.length !== 1 ? "s" : ""} failed:</p>
                </div>
                <div className="space-y-1 ml-4">
                  {importResult.failed.map((f, i) => (
                    <p key={i} className="text-gray-400 text-xs">
                      Row {f.row} · <span className="text-gray-300">{f.email}</span> — {f.reason}
                    </p>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-3 pt-3 border-t border-gray-800">
              <p className="text-gray-600 text-xs">Expected columns: <span className="text-gray-400">Full Name · Email · Department · Role (admin/standard_user/guest) · Country (optional)</span></p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create User Form */}
      <AnimatePresence>
        {showForm && (
          <motion.form
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            onSubmit={handleCreateUser}
            className="bg-gray-900/80 rounded-xl border border-gray-800 p-4 mb-6"
          >
            <h2 className="text-white font-semibold mb-4">{t("createUser")}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-gray-400 text-sm mb-2 block">{t("userName")}</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Sarah Lee"
                  required
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
                />
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-2 block">{t("userEmail")}</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="e.g. sarah@trainocate.com"
                  required
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
                />
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-2 block">{t("password")}</label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    placeholder="Min 6 characters"
                    minLength={6}
                    required
                    className="flex-1 bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
                  />
                  <button type="button" onClick={generatePassword}
                    className="px-3 py-2 rounded-lg text-sm font-medium border border-blue-500/40 text-blue-400 hover:bg-blue-500/10 transition-all whitespace-nowrap">
                    🔑 Generate
                  </button>
                </div>
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-2 block">{t("userRole")}</label>
                <select
                  value={form.role}
                  onChange={e => setForm({ ...form, role: e.target.value })}
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
                >
                  <option value="standard_user">Standard User — view and submit requests</option>
                  <option value="guest">Guest — view assets and reports only</option>
                  <option value="admin">Admin — full control</option>
                </select>
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-2 block">Department</label>
                <input
                  type="text"
                  value={form.department}
                  onChange={e => setForm({ ...form, department: e.target.value })}
                  placeholder="e.g. IT, Finance, Operations"
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
                />
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-2 block">Country</label>
                {isGlobalAdmin ? (
                  <select
                    value={form.country}
                    onChange={e => setForm({ ...form, country: e.target.value })}
                    className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
                  >
                    {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                ) : (
                  <div className="w-full bg-gray-800/50 text-gray-300 rounded-lg px-4 py-3 border border-gray-700 text-sm flex items-center justify-between">
                    <span>{form.country}</span>
                    <span className="text-gray-600 text-xs">🌏 Your region</span>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-4 flex gap-3">
              <button
                type="submit"
                disabled={creating}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
              >
                {creating ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {t("creatingUser")}
                  </>
                ) : t("createUser")}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-2 rounded-lg text-sm"
              >
                {t("cancel")}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Role legend */}
      <div className="flex flex-wrap gap-1.5 md:gap-2 mb-4 md:mb-6">
        {ROLES.map(r => (
          <span key={r} className={`text-xs px-2 md:px-3 py-0.5 md:py-1 rounded-full border font-medium ${roleColors[r]}`}>
            {r === "admin" && "👑 "}
            {r === "standard_user" && "👤 "}
            {r === "guest" && "👁 "}
            {roleLabels[r]}
          </span>
        ))}
        <span className="text-gray-600 text-xs self-center ml-1 hidden md:inline">— click a role badge on a user to change it</span>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={userSearch}
          onChange={e => setUserSearch(e.target.value)}
          placeholder="Search by name or email..."
          className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
        />
      </div>

      {/* Users List */}
      {loading ? (
        <LoadingSkeleton rows={4} cols={2} />
      ) : users.length === 0 ? (
        <EmptyState preset="users" />
      ) : (
        <div className="space-y-2 md:space-y-3">
          {users.filter(u => {
            if (!userSearch.trim()) return true
            const q = userSearch.toLowerCase()
            return (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q)
          }).map((u) => (
            <motion.div
              key={u.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gray-900/80 rounded-xl border border-gray-800 p-2.5 md:p-4 flex items-center justify-between gap-2 md:gap-4"
            >
              {/* Avatar + name */}
              <div className="flex items-center gap-2 md:gap-3 min-w-0 cursor-pointer" onClick={() => handleViewUser(u)}>
                <div className="w-7 h-7 md:w-10 md:h-10 rounded-full bg-gray-700 flex items-center justify-center text-white font-bold text-xs md:text-sm shrink-0">
                  {(u.name || u.email)[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-white text-xs md:text-sm font-medium truncate">
                    {u.name || "—"}
                    {u.id === userProfile?.id && (
                      <span className="ml-1 text-xs text-gray-500">(you)</span>
                    )}
                  </p>
                  <p className="text-gray-500 text-xs truncate">{u.email}</p>
                  {u.country && (
                    <p className="text-gray-600 text-xs mt-0.5">🌏 {u.country}</p>
                  )}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                    <p className="text-gray-600 text-xs">
                      🕐 {u.last_login ? new Date(u.last_login).toLocaleString("en-GB", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" }) : "Never"}
                    </p>
                    <p className="text-gray-600 text-xs">
                      📦 {u.assetsCount ?? 0} asset{(u.assetsCount ?? 0) !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 md:gap-2 shrink-0">
                {/* Role selector */}
                <div className="flex gap-0.5 md:gap-1">
                  {ROLES.map(r => (
                    <button
                      key={r}
                      onClick={() => handleRoleChange(u.id, r)}
                      className={`text-xs px-1.5 md:px-2 py-0.5 md:py-1 rounded-full border transition-all font-medium ${
                        u.role === r
                          ? roleColors[r]
                          : "bg-transparent border-gray-700 text-gray-600 hover:text-gray-400"
                      }`}
                    >
                      {r === "admin" && "👑"}
                      {r === "standard_user" && "👤"}
                      {r === "guest" && "👁"}
                      <span className="ml-0.5 hidden md:inline">{roleLabels[r]}</span>
                    </button>
                  ))}
                </div>

                {/* 2FA toggle */}
                <button
                  onClick={() => handleToggle2FA(u)}
                  title={u.two_factor_enabled ? "2FA enabled — click to disable" : "2FA disabled — click to enable"}
                  className={`text-xs px-1.5 md:px-2 py-0.5 md:py-1 rounded border transition-all font-medium ${
                    u.two_factor_enabled
                      ? "bg-green-500/20 border-green-500/40 text-green-400 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400"
                      : "bg-gray-800 border-gray-700 text-gray-500 hover:border-blue-500/40 hover:text-blue-400"
                  }`}
                >
                  <span>{u.two_factor_enabled ? "🔐" : "🔓"}</span>
                  <span className="hidden md:inline ml-1">2FA</span>
                </button>

                {/* Marketing access toggle */}
                <button
                  onClick={() => handleToggleMarketing(u)}
                  title={u.marketing_access ? "Marketing access — click to revoke" : "No marketing access — click to grant"}
                  className={`text-xs px-1.5 md:px-2 py-0.5 md:py-1 rounded border transition-all font-medium ${
                    u.marketing_access
                      ? "bg-purple-500/20 border-purple-500/40 text-purple-400 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400"
                      : "bg-gray-800 border-gray-700 text-gray-500 hover:border-purple-500/40 hover:text-purple-400"
                  }`}
                >
                  <span>🎯</span>
                  <span className="hidden md:inline ml-1">Mktg</span>
                </button>

                {/* Edit button */}
                <button
                  onClick={() => handleEditUser(u)}
                  title="Edit user"
                  className="text-xs px-1.5 md:px-2 py-0.5 md:py-1 rounded border transition-all text-blue-400/60 hover:text-blue-400 border-blue-400/20 hover:border-blue-400/50 hover:bg-blue-500/10"
                >
                  ✏️
                </button>

                {/* Delete */}
                {u.id !== userProfile?.id && (
                  <button
                    onClick={() => handleDeleteUser(u)}
                    className="text-red-400/50 hover:text-red-400 text-xs md:text-sm px-1.5 md:px-2 py-0.5 md:py-1 rounded border border-red-400/20 hover:border-red-400/40 transition-all"
                  >
                    ✕
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* User Detail Modal */}
      <AnimatePresence>
        {detailUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
            onClick={() => setDetailUser(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[85vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center text-white font-bold text-lg">
                    {(detailUser.name || detailUser.email)[0].toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-white font-bold text-lg">{detailUser.name || "—"}</h2>
                    <p className="text-gray-400 text-sm">{detailUser.email}</p>
                  </div>
                </div>
                <button onClick={() => setDetailUser(null)} className="text-gray-500 hover:text-white text-xl transition-colors">✕</button>
              </div>

              <div className="space-y-3 mb-5">
                <div className="flex justify-between py-2 border-b border-gray-800">
                  <span className="text-gray-500 text-sm">Role</span>
                  <span className="text-white text-sm font-medium capitalize">{detailUser.role?.replace("_", " ") || "—"}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-800">
                  <span className="text-gray-500 text-sm">Department</span>
                  <span className="text-white text-sm font-medium">{detailUser.department || "Not assigned"}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-800">
                  <span className="text-gray-500 text-sm">Country</span>
                  <span className="text-white text-sm font-medium">🌏 {detailUser.country || "—"}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-800">
                  <span className="text-gray-500 text-sm">Last Login</span>
                  <span className="text-white text-sm font-medium">
                    {detailUser.last_login ? new Date(detailUser.last_login).toLocaleString("en-GB", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" }) : "Never"}
                  </span>
                </div>
              </div>

              <div>
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-3">
                  Assigned Assets ({detailLoading ? "…" : detailAssets.length})
                </p>
                {detailLoading ? (
                  <div className="animate-pulse space-y-2">
                    {[0,1,2].map(i => <div key={i} className="h-10 bg-gray-800 rounded-lg" />)}
                  </div>
                ) : detailAssets.length === 0 ? (
                  <p className="text-gray-600 text-sm text-center py-4">No assets assigned to this user.</p>
                ) : (
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {detailAssets.map(a => (
                      <div key={a.id} className="flex items-center justify-between bg-gray-800/60 rounded-lg px-3 py-2">
                        <div className="min-w-0 mr-2">
                          <p className="text-white text-sm font-medium truncate">{a.name}</p>
                          <p className="text-gray-500 text-xs">{a.category}{a.asset_tag ? ` · ${a.asset_tag}` : ""}</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                          a.status === "assigned" ? "bg-blue-500/20 text-blue-400" :
                          a.status === "available" ? "bg-green-500/20 text-green-400" :
                          a.status === "retired" ? "bg-red-500/20 text-red-400" :
                          "bg-gray-500/20 text-gray-400"
                        }`}>{statusLabel(a.status)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-5">
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-3">
                  Currently Borrowing ({detailBorrowsLoading ? "…" : detailBorrows.length})
                </p>
                {detailBorrowsLoading ? (
                  <div className="animate-pulse space-y-2">
                    {[0,1].map(i => <div key={i} className="h-10 bg-gray-800 rounded-lg" />)}
                  </div>
                ) : detailBorrows.length === 0 ? (
                  <p className="text-gray-600 text-sm text-center py-4">No active borrows for this user.</p>
                ) : (
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {detailBorrows.map(b => (
                      <div key={b.id} className="bg-gray-800/60 rounded-lg px-3 py-2">
                        <p className="text-white text-sm font-medium">{b.quantity || 1}x {b.category || "—"}</p>
                        <p className="text-gray-500 text-xs">
                          Borrowed: {b.borrowed_at ? new Date(b.borrowed_at).toLocaleDateString("en-GB") : "—"}
                          {" · "}
                          Due: {b.due_date ? new Date(b.due_date).toLocaleDateString("en-GB") : "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                {!detailPreparedAssetsLoading && detailPreparedAssets.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-800">
                    <p className="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2">Assets Prepared by Admin</p>
                    <div className="space-y-2">
                      {detailPreparedAssets.map(a => (
                        <div key={a.id} className="bg-gray-800/60 rounded-lg px-3 py-2">
                          <p className="text-white text-sm font-medium">{a.name}</p>
                          <p className="text-gray-500 text-xs">{a.category}{a.serial_number ? ` · ${a.serial_number}` : ""}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-5">
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-3">
                  Borrow History ({detailBorrowHistoryLoading ? "…" : detailBorrowHistory.length})
                </p>
                {detailBorrowHistoryLoading ? (
                  <div className="animate-pulse space-y-2">
                    {[0,1].map(i => <div key={i} className="h-10 bg-gray-800 rounded-lg" />)}
                  </div>
                ) : detailBorrowHistory.length === 0 ? (
                  <p className="text-gray-600 text-sm text-center py-4">No borrow history for this user.</p>
                ) : (
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {detailBorrowHistory.map(b => (
                      <div key={b.id} className="bg-gray-800/60 rounded-lg px-3 py-2">
                        <p className="text-white text-sm font-medium">{b.quantity || 1}x {b.category || "—"}</p>
                        <p className="text-gray-500 text-xs">
                          Borrowed: {b.borrowed_at ? new Date(b.borrowed_at).toLocaleDateString("en-GB") : "—"}
                          {" · "}
                          {b.rejected_at
                            ? `Rejected: ${new Date(b.rejected_at).toLocaleDateString("en-GB")}`
                            : `Returned: ${b.returned_at ? new Date(b.returned_at).toLocaleDateString("en-GB") : "—"}`}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
