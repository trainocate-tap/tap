import { useEffect, useState, useCallback, useRef } from "react"
import { useLocation } from "react-router-dom"
import * as XLSX from "xlsx"
import { supabase } from "../../lib/supabase"
import { useAuth } from "../../context/AuthContext"
import { motion, AnimatePresence } from "framer-motion"
import { EmptyState, LoadingSkeleton } from "../../components/EmptyState"
import { createNotification, notifyAdmins, notifyUserByIdentifier, getEmailByIdentifier } from "../../lib/notifications"
import { sendMaintenanceCompletedEmail, sendNewMaintenanceAdminEmail, getAdminEmails, sendEmail } from "../../lib/emailService"
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

function exportMaintenanceToExcel(schedules) {
  const rows = schedules.map(s => ({
    "Asset": s.asset_name || "",
    "Type": s.maintenance_type || "",
    "Status": s.status || "",
    "Priority": s.priority || "",
    "Scheduled Date": s.scheduled_date || "",
    "Assigned To": s.assigned_to || "",
    "Recurrence": s.recurrence || "",
    "Notes": s.notes || "",
    "Completed At": s.completed_at ? new Date(s.completed_at).toLocaleDateString() : "",
    "Completed By": s.completed_by || "",
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Maintenance")
  XLSX.writeFile(wb, `maintenance_${new Date().toISOString().split("T")[0]}.xlsx`)
}

const TYPE_STYLES = {
  repair:     { pill: "bg-red-500/20 text-red-400 border-red-500/30",      emoji: "🔧", label: "Repair" },
  service:    { pill: "bg-blue-500/20 text-blue-400 border-blue-500/30",    emoji: "⚙️", label: "Service" },
  inspection: { pill: "bg-purple-500/20 text-purple-400 border-purple-500/30", emoji: "🔍", label: "Inspection" },
}

const STATUS_STYLES = {
  pending:   { pill: "bg-yellow-500/20 text-yellow-400",  label: "Pending" },
  completed: { pill: "bg-green-500/20 text-green-400",    label: "Completed" },
  cancelled: { pill: "bg-gray-500/20 text-gray-400",      label: "Cancelled" },
  overdue:   { pill: "bg-red-500/20 text-red-400",        label: "Overdue" },
}

const PRIORITY_COLOR = {
  low:      "bg-gray-500/20 text-gray-400",
  medium:   "bg-yellow-500/20 text-yellow-400",
  high:     "bg-orange-500/20 text-orange-400",
  critical: "bg-red-500/20 text-red-400",
}

const RECURRENCE_LABELS = {
  none: "One-time",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
}

function isOverdue(schedule) {
  if (schedule.status !== "pending") return false
  return new Date(schedule.scheduled_date) < new Date(new Date().toDateString())
}

function daysUntil(dateStr) {
  const diff = new Date(dateStr) - new Date(new Date().toDateString())
  return Math.round(diff / (1000 * 60 * 60 * 24))
}

export default function Maintenance() {
  const { userProfile, canEdit, canSubmitMaintenance, userCountry, profileLoading, isStandardUser } = useAuth()
  const location = useLocation()
  const [schedules, setSchedules] = useState([])
  const [assets, setAssets] = useState([])
  const [adminUsers, setAdminUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [completeModal, setCompleteModal] = useState(null)
  const [completingNote, setCompletingNote] = useState("")
  const [completing, setCompleting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [filterStatus, setFilterStatus] = useState("all")
  const [filterPriority, setFilterPriority] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [monthFilter, setMonthFilter] = useState("")
  const [yearFilter, setYearFilter] = useState("")
  const [formError, setFormError] = useState("")
  const [toast, setToast] = useState("")

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(""), 3000)
  }
  const [assetSearch, setAssetSearch] = useState("")
  const [assetDropdown, setAssetDropdown] = useState(false)
  const assetDropdownRef = useRef(null)

  useEffect(() => {
    if (!assetDropdown) return
    const handler = (e) => {
      if (assetDropdownRef.current && !assetDropdownRef.current.contains(e.target)) setAssetDropdown(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [assetDropdown])
  const [form, setForm] = useState({
    asset_id: "", asset_name: "",
    maintenance_type: "service",
    scheduled_date: "",
    assigned_to: "",
    recurrence: "none",
    priority: "medium",
    notes: "",
  })

  useEffect(() => {
    if (!profileLoading && userProfile !== null && userProfile !== undefined) fetchAll()
  }, [profileLoading, userProfile, userCountry])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const assetId = params.get("asset_id")
    if (!assetId || assets.length === 0) return
    const match = assets.find(x => x.id === assetId)
    if (!match) return
    setForm(f => (f.asset_id === assetId ? f : { ...f, asset_id: match.id, asset_name: match.name }))
    setShowForm(true)
    setAssets(prev => {
      if (prev[0]?.id === assetId) return prev
      return [match, ...prev.filter(x => x.id !== assetId)]
    })
  }, [assets.length, location.search])

  const fetchAdminUsers = async () => {
    const { data } = await supabase.from("user_profiles").select("id, name, email").eq("role", "admin").order("name")
    setAdminUsers(data || [])
  }

  const fetchAll = async () => {
    fetchAdminUsers()
    const maintenanceQuery = supabase.from("maintenance_schedules").select("*").order("scheduled_date", { ascending: true })

    let assetQuery = supabase.from("assets").select("id, name, category, assigned_user").order("name")
    if (userCountry) assetQuery = assetQuery.eq("country", userCountry)

    const [{ data: s, error: sErr }, { data: a }] = await Promise.all([maintenanceQuery, assetQuery])
    if (sErr) console.error("fetchAll maintenance_schedules error:", sErr)
    let scheduleRows = s || []
    if (isStandardUser && userProfile) {
      scheduleRows = scheduleRows.filter(x =>
        x.created_by === userProfile.name ||
        x.created_by === userProfile.email
      )
    }
    setSchedules(scheduleRows)
    const all = a || []
    if (isStandardUser && userProfile) {
      const mine = all.filter(x =>
        x.assigned_user === userProfile?.email ||
        x.assigned_user === userProfile?.name ||
        (x.assigned_user && userProfile?.name &&
          x.assigned_user.toLowerCase() === userProfile.name.toLowerCase())
      )
      setAssets(mine)
    } else {
      setAssets(all)
    }
    setLoading(false)
  }

  const filteredAssets = assets.filter(a =>
    a.name?.toLowerCase().includes(assetSearch.toLowerCase()) ||
    a.category?.toLowerCase().includes(assetSearch.toLowerCase())
  ).slice(0, 8)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError("")
    if (!form.asset_id) { setFormError("Please select an asset"); return }
    if (!form.assigned_to) { setFormError("Please assign to an admin"); return }
    const { error } = await supabase.from("maintenance_schedules").insert([{
      asset_id: form.asset_id,
      asset_name: form.asset_name,
      maintenance_type: form.maintenance_type,
      scheduled_date: form.scheduled_date,
      assigned_to: form.assigned_to || null,
      recurrence: form.recurrence,
      priority: form.priority,
      notes: form.notes || null,
      status: "pending",
      created_by: userProfile?.name || userProfile?.email,
    }])
    if (!error) {
      createNotification(userProfile?.id, "🔧 Maintenance Scheduled", `Maintenance scheduled for "${form.asset_name}"`, "info", userProfile?.country)
      notifyAdmins(userProfile?.country, "🔧 New Maintenance Request", `${userProfile?.name || userProfile?.email || "A user"} scheduled maintenance for "${form.asset_name}"`, "info")
      getAdminEmails(userProfile?.country).then(adminEmails => {
        if (adminEmails?.length) {
          sendNewMaintenanceAdminEmail(adminEmails, userProfile?.name || userProfile?.email || "A user", form.maintenance_type, form.asset_name, form.priority, form.scheduled_date)
        }
      })
      sendEmail(userProfile?.email, "Maintenance Scheduled Successfully", "<p>Your maintenance request has been submitted and will be reviewed by the IT team shortly.</p>")
      setForm({ asset_id: "", asset_name: "", maintenance_type: "service", scheduled_date: "", assigned_to: "", recurrence: "none", priority: "medium", notes: "" })
      setAssetSearch("")
      setShowForm(false)
      setSubmitSuccess(true)
      setTimeout(() => { setSubmitSuccess(false); fetchAll() }, 2500)
    } else {
      setFormError(error.message)
    }
  }

  const handleComplete = async () => {
    if (!completeModal) return
    setCompleting(true)
    const schedule = completeModal
    await supabase.from("maintenance_schedules").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      completed_by: userProfile?.name || userProfile?.email,
      notes: completingNote || schedule.notes,
    }).eq("id", schedule.id)

    if (schedule.recurrence !== "none") {
      const next = new Date(schedule.scheduled_date)
      if (schedule.recurrence === "monthly")   next.setMonth(next.getMonth() + 1)
      if (schedule.recurrence === "quarterly") next.setMonth(next.getMonth() + 3)
      if (schedule.recurrence === "yearly")    next.setFullYear(next.getFullYear() + 1)
      await supabase.from("maintenance_schedules").insert([{
        asset_id: schedule.asset_id,
        asset_name: schedule.asset_name,
        maintenance_type: schedule.maintenance_type,
        scheduled_date: next.toISOString().split("T")[0],
        assigned_to: schedule.assigned_to,
        recurrence: schedule.recurrence,
        priority: schedule.priority,
        notes: null,
        status: "pending",
        created_by: "Auto (recurring)",
      }])
    }

    const adminName = userProfile?.name || userProfile?.email || "Admin"
    if (schedule.created_by && schedule.created_by !== "Auto (recurring)") {
      notifyUserByIdentifier(schedule.created_by, "✅ Maintenance Completed", `Your maintenance for "${schedule.asset_name}" has been completed by ${adminName}`, "success")
      getEmailByIdentifier(schedule.created_by).then(email => {
        if (email) sendMaintenanceCompletedEmail(email, schedule.asset_name || "an asset")
      })
    }
    notifyAdmins(userProfile?.country, "✅ Maintenance Completed", `${adminName} completed maintenance for "${schedule.asset_name}"`, "success")
    setCompleteModal(null)
    setCompletingNote("")
    setCompleting(false)
    showToast("Maintenance marked as completed!")
    fetchAll()
  }

  const handleCancel = async (schedule) => {
    await supabase.from("maintenance_schedules").update({ status: "cancelled" }).eq("id", schedule.id)
    if (schedule.created_by && schedule.created_by !== "Auto (recurring)") {
      notifyUserByIdentifier(schedule.created_by, "❌ Maintenance Cancelled", `Your maintenance request for "${schedule.asset_name || "an asset"}" was cancelled by admin`, "warning")
    }
    fetchAll()
  }

  const enriched = schedules.map(s => ({
    ...s,
    computedStatus: isOverdue(s) ? "overdue" : s.status,
  }))

  const filtered = enriched.filter(s => {
    if (filterStatus !== "all") {
      if (filterStatus === "pending" && s.computedStatus !== "pending") return false
      if (filterStatus === "overdue" && s.computedStatus !== "overdue") return false
      if (filterStatus === "in_progress" && s.status !== "in_progress") return false
      if (filterStatus === "completed" && s.status !== "completed") return false
    }
    if (filterPriority !== "all" && s.priority !== filterPriority) return false
    if (!matchesMonth(s.scheduled_date, monthFilter, yearFilter)) return false
    if (searchQuery && !s.asset_name?.toLowerCase().includes(searchQuery.toLowerCase())) return false
    return true
  })

  const overdueCount = enriched.filter(s => s.computedStatus === "overdue").length
  const upcomingWeek = enriched.filter(s => {
    if (s.computedStatus !== "pending") return false
    const d = daysUntil(s.scheduled_date)
    return d >= 0 && d <= 7
  }).length

  const selectClass = "bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"

  return (
    <div className="p-4 md:p-8">
      <style>{slideInStyle}</style>

      {/* Submit success */}
      <AnimatePresence>
        {submitSuccess && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center">
            <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} exit={{ scale: 0.5 }}
              transition={{ type: "spring", stiffness: 200 }} className="text-center">
              <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 200 }}
                className="inline-flex items-center justify-center w-24 h-24 bg-blue-500/20 border-2 border-blue-500/50 rounded-full mb-4"
                style={{ boxShadow: "0 0 40px rgba(59,130,246,0.4)" }}>
                <span className="text-5xl">🔧</span>
              </motion.div>
              <h2 className="text-3xl font-bold text-white mb-2">Scheduled!</h2>
              <p className="text-gray-400">Maintenance has been scheduled</p>
              <div className="mt-4 w-48 mx-auto h-1 bg-gray-800 rounded-full overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: "100%" }}
                  transition={{ duration: 2.5, ease: "linear" }} className="h-full bg-blue-500 rounded-full" />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Complete modal */}
      <AnimatePresence>
        {completeModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }} transition={{ type: "spring", stiffness: 200 }}
              className="bg-gray-900 rounded-2xl border border-gray-700 p-6 w-full max-w-sm shadow-2xl">
              <div className="text-center mb-5">
                <span className="text-4xl">✅</span>
                <h3 className="text-white font-bold text-lg mt-3">Mark as Completed</h3>
                <p className="text-gray-400 text-sm mt-1">{completeModal.asset_name}</p>
                {completeModal.recurrence !== "none" && (
                  <p className="text-blue-400 text-xs mt-1">
                    Next {RECURRENCE_LABELS[completeModal.recurrence].toLowerCase()} maintenance will be auto-scheduled
                  </p>
                )}
              </div>
              <div className="mb-4">
                <label className="text-gray-400 text-sm mb-2 block">Completion notes <span className="text-gray-600">(optional)</span></label>
                <textarea value={completingNote} onChange={e => setCompletingNote(e.target.value)}
                  rows={3} placeholder="e.g. Replaced battery, cleaned fans..."
                  className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm resize-none" />
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setCompleteModal(null); setCompletingNote("") }}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2.5 rounded-xl text-sm font-medium transition-all">
                  Cancel
                </button>
                <button onClick={handleComplete} disabled={completing}
                  className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2.5 rounded-xl text-sm font-medium transition-all">
                  {completing ? "..." : "Mark Complete"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">Maintenance</h1>
          <p className="text-gray-400 mt-1 text-sm">
            {overdueCount > 0
              ? <span className="text-red-400">{overdueCount} overdue · </span>
              : null}
            {upcomingWeek > 0
              ? <span className="text-yellow-400">{upcomingWeek} due this week</span>
              : "No upcoming maintenance this week"}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => exportMaintenanceToExcel(filtered)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background: "rgba(30,41,59,0.8)", border: "1px solid rgba(59,130,246,0.4)", color: "#60a5fa" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(59,130,246,0.15)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(30,41,59,0.8)"}
          >
            📥 Export Excel
          </button>
          {canSubmitMaintenance && (
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={() => setShowForm(!showForm)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
              + Schedule
            </motion.button>
          )}
        </div>
      </div>

      {/* Alert banners */}
      {overdueCount > 0 && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="mb-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 flex items-center gap-3">
          <span className="text-red-400 text-lg">⚠️</span>
          <div>
            <p className="text-red-400 font-semibold text-sm">
              {overdueCount} maintenance task{overdueCount !== 1 ? "s" : ""} overdue
            </p>
            <p className="text-red-400/70 text-xs">Please action these as soon as possible</p>
          </div>
        </motion.div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by asset name..."
          className="bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm flex-1 min-w-[200px]"
        />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={selectClass}>
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="overdue">Overdue</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className={selectClass}>
          <option value="all">All Priorities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
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

      {/* Schedule Form */}
      <AnimatePresence>
        {showForm && (
          <motion.form initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }} onSubmit={handleSubmit}
            className="bg-gray-900/80 rounded-xl border border-gray-800 p-5 mb-6">
            <h2 className="text-white font-semibold mb-4">Schedule Maintenance</h2>
            <AnimatedError message={formError} onDismiss={() => setFormError("")} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

              {/* Asset picker */}
              <div className="md:col-span-2 relative" ref={assetDropdownRef}>
                <label className="text-gray-400 text-sm mb-2 block">Asset *</label>
                <input type="text" value={form.asset_id ? form.asset_name : assetSearch}
                  onChange={e => {
                    setAssetSearch(e.target.value)
                    setForm({ ...form, asset_id: "", asset_name: "" })
                    setAssetDropdown(true)
                  }}
                  onFocus={() => setAssetDropdown(true)}
                  placeholder="Search asset by name or category..."
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm" />
                {form.asset_id && (
                  <button type="button" onClick={() => { setForm({ ...form, asset_id: "", asset_name: "" }); setAssetSearch("") }}
                    className="absolute right-3 top-10 text-gray-500 hover:text-gray-300">✕</button>
                )}
                <AnimatePresence>
                  {assetDropdown && !form.asset_id && filteredAssets.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20 overflow-hidden">
                      {filteredAssets.map(a => (
                        <button key={a.id} type="button"
                          onClick={() => {
                            setForm({ ...form, asset_id: a.id, asset_name: a.name })
                            setAssetSearch("")
                            setAssetDropdown(false)
                          }}
                          className="w-full text-left px-4 py-2.5 hover:bg-gray-700 text-white text-sm flex items-center gap-2">
                          <span className="text-gray-400 text-xs">{a.category}</span>
                          <span>{a.name}</span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div>
                <label className="text-gray-400 text-sm mb-2 block">Type *</label>
                <select value={form.maintenance_type} onChange={e => setForm({ ...form, maintenance_type: e.target.value })}
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm">
                  <option value="service">⚙️ Service</option>
                  <option value="repair">🔧 Repair</option>
                  <option value="inspection">🔍 Inspection</option>
                </select>
              </div>

              <div>
                <label className="text-gray-400 text-sm mb-2 block">Priority</label>
                <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              <div>
                <label className="text-gray-400 text-sm mb-2 block">Scheduled Date *</label>
                <input type="date" value={form.scheduled_date} required
                  onChange={e => setForm({ ...form, scheduled_date: e.target.value })}
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm" />
              </div>

              <div>
                <label className="text-gray-400 text-sm mb-2 block">Assign To *</label>
                <select value={form.assigned_to} required
                  onChange={e => setForm({ ...form, assigned_to: e.target.value })}
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm">
                  <option value="">Select admin...</option>
                  {adminUsers.map(u => (
                    <option key={u.id} value={u.name || u.email}>{u.name || u.email}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-gray-400 text-sm mb-2 block">Recurrence</label>
                <select value={form.recurrence} onChange={e => setForm({ ...form, recurrence: e.target.value })}
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm">
                  <option value="none">One-time</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="text-gray-400 text-sm mb-2 block">Notes <span className="text-gray-600">(optional)</span></label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={2} placeholder="e.g. Check thermal paste, replace battery if needed"
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm resize-none" />
              </div>
            </div>
            <div className="mt-4 flex gap-3">
              <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium">
                Schedule
              </button>
              <button type="button" onClick={() => { setShowForm(false); setFormError("") }}
                className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-2 rounded-lg text-sm">
                Cancel
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      <SuccessToast message={toast} />

      {/* List */}
      {loading ? (
        <LoadingSkeleton rows={3} cols={2} />
      ) : filtered.length === 0 ? (
        <EmptyState preset="maintenance" />
      ) : (
        <div className="space-y-3">
          {filtered.map(s => {
            const type = TYPE_STYLES[s.maintenance_type] || TYPE_STYLES.service
            const status = STATUS_STYLES[s.computedStatus] || STATUS_STYLES.pending
            const days = daysUntil(s.scheduled_date)
            const isDue = s.computedStatus === "overdue"

            return (
              <motion.div key={s.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className={`bg-gray-900/80 rounded-xl border p-4 ${
                  isDue ? "border-l-4 border-red-500 bg-red-500/5 border-red-500/30" :
                  s.status === "completed" ? "border-green-500/20" : "border-gray-800"
                }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-lg">{type.emoji}</span>
                      <p className="text-white font-medium">{s.asset_name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${type.pill}`}>
                        {type.label}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.pill}`}>
                        {status.label}
                      </span>
                      {s.priority && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLOR[s.priority] || "bg-gray-500/20 text-gray-400"}`}>
                          {s.priority}
                        </span>
                      )}
                      {s.recurrence !== "none" && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 font-medium">
                          🔄 {RECURRENCE_LABELS[s.recurrence]}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-3 mt-1">
                      <p className={`text-xs font-medium ${
                        isDue ? "text-red-400" :
                        days <= 3 && s.computedStatus === "pending" ? "text-yellow-400" :
                        "text-gray-400"
                      }`}>
                        📅 {new Date(s.scheduled_date).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" })}
                        {s.computedStatus === "pending" && (
                          <span className="ml-1">
                            {isDue
                              ? `(${Math.abs(days)}d overdue)`
                              : days === 0 ? "(today)"
                              : `(in ${days}d)`}
                          </span>
                        )}
                      </p>
                      {s.assigned_to && <p className="text-gray-500 text-xs">👤 {s.assigned_to}</p>}
                      {s.notes && <p className="text-gray-500 text-xs truncate max-w-xs">{s.notes}</p>}
                    </div>
                    {s.status === "completed" && s.completed_at && (
                      <p className="text-green-400/60 text-xs mt-1">
                        ✓ Completed {new Date(s.completed_at).toLocaleDateString("en-SG")}
                        {s.completed_by ? ` by ${s.completed_by}` : ""}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2 shrink-0 flex-wrap">
                    {canEdit && s.status === "pending" && (
                      <>
                        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                          onClick={() => setCompleteModal(s)}
                          className="text-green-400 hover:text-green-300 text-sm px-3 py-1 rounded border border-green-400/30 transition-all">
                          Done
                        </motion.button>
                        <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                          onClick={() => handleCancel(s)}
                          className="text-gray-500 hover:text-gray-300 text-sm px-3 py-1 rounded border border-gray-600/30 transition-all">
                          Cancel
                        </motion.button>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
