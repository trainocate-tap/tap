import { useEffect, useState, useRef } from "react"
import { supabase } from "../../lib/supabase"
import { useAuth } from "../../context/AuthContext"
import { motion, AnimatePresence } from "framer-motion"
import { EmptyState, LoadingSkeleton } from "../../components/EmptyState"
import { sendAssetRequestNotification, sendApprovalDecisionEmail, sendNewRequestAdminEmail, getApprovingOfficerProfile, sendEmail } from "../../lib/emailService"
import { createNotification, getUserIdByEmail } from "../../lib/notifications"
import { getLastNMonths, getYears, matchesMonth } from "../../lib/dateFilters"
import { useCurrency } from "../../lib/useCurrency"

const PRIORITY_STYLES = {
  low:    { pill: "bg-gray-500/20 text-gray-400 border-gray-500/30",       label: "Low" },
  medium: { pill: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", label: "Medium" },
  high:   { pill: "bg-red-500/20 text-red-400 border-red-500/30",          label: "High" },
}

const STATUS_STYLES = {
  pending:  { pill: "bg-blue-500/20 text-blue-400 border-blue-500/30",    label: "Pending",  emoji: "⏳" },
  approved: { pill: "bg-green-500/20 text-green-400 border-green-500/30", label: "Approved", emoji: "✅" },
  rejected: { pill: "bg-red-500/20 text-red-400 border-red-500/30",       label: "Rejected", emoji: "❌" },
}

const ASSET_TYPES = ["Laptop", "Desktop", "Monitor", "Phone", "Printer", "Networking Equipment", "Tablet", "Other"]
const LAPTOP_TYPES = ["Standard", "High-performance", "Developer", "Design", "Other"]
const OS_OPTIONS   = ["Windows", "macOS", "Linux"]
const DEPARTMENTS  = ["Sales", "Marketing", "Finance", "IT", "Trainers", "Operations", "Other"]

const EMPTY_FORM = {
  asset_type: "",
  laptop_type: "",
  operating_system: "",
  department: "",
  reason: "",
  cost_per_unit: "",
  priority: "medium",
  notes: "",
}

export default function AssetRequests() {
  const { userProfile, isAdmin, isGlobalAdmin, canSubmitRequests, profileLoading } = useAuth()
  const { symbol: currencySymbol } = useCurrency()
  const [requests, setRequests]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [actionModal, setActionModal] = useState(null)
  const [actionReason, setActionReason] = useState("")
  const [actioning, setActioning]   = useState(false)
  const [tab, setTab]               = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [monthFilter, setMonthFilter] = useState("")
  const [yearFilter, setYearFilter] = useState("")
  const [form, setForm]             = useState(EMPTY_FORM)
  const [docFiles, setDocFiles]     = useState([])
  const [uploadingDocs, setUploadingDocs] = useState(false)
  const fileInputRef = useRef()

  useEffect(() => {
    if (!profileLoading) fetchRequests()
  }, [profileLoading, isAdmin, isGlobalAdmin, userProfile?.id])

  const fetchRequests = async () => {
    let query = supabase
      .from("asset_requests")
      .select("*")
      .order("created_at", { ascending: false })

    if (!isAdmin && !isGlobalAdmin) {
      query = query.or(`requested_by.eq.${userProfile?.name},requested_by_email.eq.${userProfile?.email}`)
    }

    const { data } = await query
    setRequests(data || [])
    setLoading(false)
  }

  // ── Document upload helpers ────────────────────────────────────────────────

  const handleFileAdd = (e) => {
    const picked = Array.from(e.target.files || []).filter(f => f.type === "application/pdf")
    setDocFiles(prev => [...prev, ...picked])
    e.target.value = ""
  }

  const handleFileRemove = (idx) => {
    setDocFiles(prev => prev.filter((_, i) => i !== idx))
  }

  const uploadDocFiles = async () => {
    if (!docFiles.length) return []
    setUploadingDocs(true)
    const urls = []
    for (const file of docFiles) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
      const path = `requests/${Date.now()}_${safeName}`
      const { error } = await supabase.storage
        .from("asset-request-docs")
        .upload(path, file, { contentType: "application/pdf" })
      if (!error) {
        const { data } = supabase.storage.from("asset-request-docs").getPublicUrl(path)
        // Store both url and original filename as JSON so we can display the name
        urls.push(JSON.stringify({ url: data.publicUrl, name: file.name }))
      } else {
        console.error("Document upload error:", error.message)
      }
    }
    setUploadingDocs(false)
    return urls
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)

    const documentUrls = await uploadDocFiles()

    const payload = {
      asset_type:       form.asset_type,
      laptop_type:      form.asset_type === "Laptop" ? form.laptop_type || null : null,
      operating_system: form.asset_type === "Laptop" ? form.operating_system || null : null,
      department:       form.department || null,
      reason:           form.reason,
      cost_per_unit:    form.cost_per_unit ? parseFloat(form.cost_per_unit) : null,
      priority:         form.priority,
      notes:            form.notes || null,
      document_urls:    documentUrls.length ? documentUrls : null,
      status:           "pending",
      requested_by:       userProfile?.name || userProfile?.email || "Unknown",
      requested_by_email: userProfile?.email || null,
    }

    // Fetch approving officer before insert so we can store email + notify them
    const officer = await getApprovingOfficerProfile(userProfile?.country)
    payload.approving_officer_email = officer.email

    const { data: inserted, error } = await supabase
      .from("asset_requests")
      .insert([payload])
      .select("id")
      .single()

    if (!error) {
      setForm(EMPTY_FORM)
      setDocFiles([])
      setShowForm(false)
      setSubmitSuccess(true)

      const requestedBy = userProfile?.name || userProfile?.email || "Unknown"
      const createdAt   = new Date().toISOString()

      // Email to approving officer
      sendAssetRequestNotification({ requestedBy, assetType: form.asset_type, reason: form.reason, priority: form.priority, createdAt, country: userProfile?.country })

      // Confirmation email to submitter
      sendEmail(userProfile?.email, "Asset Request Submitted Successfully", "<p>Your asset request has been submitted and is pending approval.</p>")

      // In-app notification to submitter
      createNotification(
        userProfile?.id,
        "📋 Request Submitted",
        `Your asset request for ${form.asset_type} has been submitted`,
        "info",
        inserted?.id
      )

      // In-app notification to approving officer
      if (officer.id) {
        createNotification(
          officer.id,
          "📋 New Asset Request",
          `${requestedBy} requested ${form.asset_type} (${form.priority} priority)`,
          "request",
          inserted?.id
        )
      }

      // Bell notification + email to ALL admin users
      supabase.from("user_profiles").select("id, email").eq("role", "admin").then(({ data: admins }) => {
        if (!admins?.length) return
        admins.forEach(admin => {
          createNotification(
            admin.id,
            "New Asset Request 📋",
            `${requestedBy} requested ${form.asset_type} — needs your approval`,
            "request",
            inserted?.id,
            admin.id
          )
        })
        sendNewRequestAdminEmail(admins.map(a => a.email).filter(Boolean), requestedBy, form.asset_type)
      })

      setTimeout(() => { setSubmitSuccess(false); fetchRequests() }, 2500)
    } else {
      alert(error.message)
    }
    setSubmitting(false)
  }

  // ── Approve / Reject ───────────────────────────────────────────────────────

  const handleAction = async () => {
    if (!actionModal) return
    setActioning(true)
    const { error } = await supabase
      .from("asset_requests")
      .update({
        status:        actionModal.type === "approve" ? "approved" : "rejected",
        admin_response: actionReason || null,
        actioned_at:   new Date().toISOString(),
        actioned_by:   userProfile?.name || userProfile?.email,
      })
      .eq("id", actionModal.request.id)

    if (!error) {
      // Email to requester
      sendApprovalDecisionEmail({
        status:            actionModal.type === "approve" ? "approved" : "rejected",
        requestedByEmail:  actionModal.request.requested_by_email,
        requestedBy:       actionModal.request.requested_by,
        assetType:         actionModal.request.asset_type,
        adminResponse:     actionReason || null,
        actionedBy:        userProfile?.name || userProfile?.email,
      })

      // In-app notification to requester
      getUserIdByEmail(actionModal.request.requested_by_email).then(requesterId => {
        if (requesterId) {
          const approved = actionModal.type === "approve"
          const adminName = userProfile?.name || userProfile?.email
          createNotification(
            requesterId,
            approved ? "Request Approved ✅" : "Request Rejected ❌",
            `Your request for ${actionModal.request.asset_type} was ${approved ? "approved" : "rejected"} by ${adminName}${actionReason ? `: ${actionReason}` : ""}`,
            approved ? "success" : "warning",
            actionModal.request.id,
            requesterId
          )
        }
      })

      createNotification(userProfile?.id, "✅ Asset Request Actioned", `${actionModal.request.requested_by}'s request for ${actionModal.request.asset_type} has been ${actionModal.type === 'approve' ? 'approved' : 'rejected'}`, "success", userProfile?.country, userProfile?.id)

      setActionModal(null)
      setActionReason("")
      fetchRequests()
    } else {
      alert(error.message)
    }
    setActioning(false)
  }

  const filtered = requests.filter(r => {
    const matchesTab =
      tab === "pending" ? r.status === "pending" :
      tab === "mine"    ? r.requested_by_email === userProfile?.email :
      true
    if (!matchesTab) return false
    if (!matchesMonth(r.created_at, monthFilter, yearFilter)) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const matches = r.asset_type?.toLowerCase().includes(q) || r.requested_by?.toLowerCase().includes(q)
      if (!matches) return false
    }
    return true
  })

  const pendingCount = requests.filter(r => r.status === "pending").length

  const daysPending = (req) => {
    if (req.status !== "pending") return 0
    return Math.floor((Date.now() - new Date(req.created_at)) / 86400000)
  }

  return (
    <div className="p-4 md:p-8">

      {/* ── Submit success overlay ──────────────────────────────────────────── */}
      <AnimatePresence>
        {submitSuccess && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center">
            <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }} transition={{ type: "spring", stiffness: 200 }}
              className="text-center">
              <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 200 }}
                className="inline-flex items-center justify-center w-24 h-24 bg-blue-500/20 border-2 border-blue-500/50 rounded-full mb-4"
                style={{ boxShadow: "0 0 40px rgba(59,130,246,0.4)" }}>
                <span className="text-5xl">📋</span>
              </motion.div>
              <h2 className="text-3xl font-bold text-white mb-2">Request Submitted!</h2>
              <p className="text-gray-400">Your request has been sent to the admin</p>
              <div className="mt-4 w-48 mx-auto h-1 bg-gray-800 rounded-full overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: "100%" }}
                  transition={{ duration: 2.5, ease: "linear" }} className="h-full bg-blue-500 rounded-full" />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Approve / Reject modal ─────────────────────────────────────────── */}
      <AnimatePresence>
        {actionModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }} transition={{ type: "spring", stiffness: 200 }}
              className="bg-gray-900 rounded-2xl border border-gray-700 p-6 w-full max-w-sm shadow-2xl">
              <div className="text-center mb-5">
                <span className="text-4xl">{actionModal.type === "approve" ? "✅" : "❌"}</span>
                <h3 className="text-white font-bold text-lg mt-3">
                  {actionModal.type === "approve" ? "Approve Request?" : "Reject Request?"}
                </h3>
                <p className="text-gray-400 text-sm mt-1">{actionModal.request.asset_type}</p>
              </div>
              <div className="mb-4">
                <label className="text-gray-400 text-sm mb-2 block">
                  {actionModal.type === "approve" ? "Approval note" : "Reason for rejection"}{" "}
                  <span className="text-gray-600">(optional)</span>
                </label>
                <textarea value={actionReason} onChange={e => setActionReason(e.target.value)} rows={3}
                  placeholder={actionModal.type === "approve" ? "e.g. Approved, item ordered" : "e.g. Budget not available this quarter"}
                  className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm resize-none" />
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setActionModal(null); setActionReason("") }}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2.5 rounded-xl text-sm font-medium transition-all">
                  Cancel
                </button>
                <button onClick={handleAction} disabled={actioning}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    actionModal.type === "approve"
                      ? "bg-green-600 hover:bg-green-500 text-white"
                      : "bg-red-600 hover:bg-red-500 text-white"
                  }`}>
                  {actioning ? "..." : actionModal.type === "approve" ? "Approve" : "Reject"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">Asset Requests</h1>
          <p className="text-gray-400 mt-1 text-sm">
            {pendingCount > 0
              ? <span className="text-yellow-400">{pendingCount} pending review</span>
              : "All requests up to date"}
          </p>
        </div>
        {canSubmitRequests && (
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            + New Request
          </motion.button>
        )}
      </div>

      {/* ── New Request Form ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showForm && (
          <motion.form initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }} onSubmit={handleSubmit}
            className="bg-gray-900/80 rounded-xl border border-gray-800 p-5 mb-6">
            <h2 className="text-white font-semibold mb-4">New Asset Request</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Requestor name — read only */}
              <div>
                <label className="text-gray-400 text-sm mb-2 block">Requestor Name</label>
                <input
                  type="text"
                  value={userProfile?.name || userProfile?.email || ""}
                  readOnly
                  className="w-full bg-gray-800/50 text-gray-400 rounded-lg px-4 py-3 border border-gray-700/50 text-sm cursor-not-allowed select-none"
                />
              </div>

              {/* Intended department */}
              <div>
                <label className="text-gray-400 text-sm mb-2 block">Intended Department *</label>
                <select value={form.department}
                  onChange={e => setForm({ ...form, department: e.target.value })}
                  required
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm">
                  <option value="">Select department…</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              {/* Asset type */}
              <div>
                <label className="text-gray-400 text-sm mb-2 block">Asset Type *</label>
                <select value={form.asset_type}
                  onChange={e => setForm({ ...form, asset_type: e.target.value, laptop_type: "", operating_system: "" })}
                  required
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm">
                  <option value="">Select asset type…</option>
                  {ASSET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* Cost per unit */}
              <div>
                <label className="text-gray-400 text-sm mb-2 block">Cost per Unit ({currencySymbol}) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">{currencySymbol}</span>
                  <input type="number" min="0" step="0.01"
                    value={form.cost_per_unit}
                    onChange={e => setForm({ ...form, cost_per_unit: e.target.value })}
                    placeholder="0.00"
                    required
                    className="w-full bg-gray-800 text-white rounded-lg pl-12 pr-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm" />
                </div>
              </div>

              {/* Laptop-specific fields — only shown when Laptop is selected */}
              <AnimatePresence>
                {form.asset_type === "Laptop" && (
                  <>
                    <motion.div
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                      <label className="text-gray-400 text-sm mb-2 block">Laptop Type *</label>
                      <select value={form.laptop_type}
                        onChange={e => setForm({ ...form, laptop_type: e.target.value })}
                        required
                        className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm">
                        <option value="">Select laptop type…</option>
                        {LAPTOP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                      <label className="text-gray-400 text-sm mb-2 block">Operating System *</label>
                      <select value={form.operating_system}
                        onChange={e => setForm({ ...form, operating_system: e.target.value })}
                        required
                        className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm">
                        <option value="">Select OS…</option>
                        {OS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>

              {/* Business justification — full width */}
              <div className="md:col-span-2">
                <label className="text-gray-400 text-sm mb-2 block">Business Justification *</label>
                <textarea value={form.reason}
                  onChange={e => setForm({ ...form, reason: e.target.value })}
                  placeholder="Please explain why this asset is needed"
                  required rows={3}
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm resize-none" />
              </div>

              {/* Priority */}
              <div>
                <label className="text-gray-400 text-sm mb-2 block">Priority</label>
                <select value={form.priority}
                  onChange={e => setForm({ ...form, priority: e.target.value })}
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              {/* Additional notes */}
              <div>
                <label className="text-gray-400 text-sm mb-2 block">Additional Notes <span className="text-gray-600">(optional)</span></label>
                <input type="text" value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  placeholder="e.g. Needed by end of month"
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm" />
              </div>

              {/* Document upload — full width */}
              <div className="md:col-span-2">
                <label className="text-gray-400 text-sm mb-2 block">
                  Supporting Documents <span className="text-gray-600">(PDF only, optional)</span>
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  multiple
                  className="hidden"
                  onChange={handleFileAdd}
                />
                <button type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-600 text-gray-300 px-4 py-2.5 rounded-lg text-sm transition-all">
                  <span>📎</span> Attach PDF files
                </button>

                {/* File list */}
                {docFiles.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {docFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 bg-gray-800/60 rounded-lg px-3 py-2">
                        <span className="text-red-400 text-sm">📄</span>
                        <span className="text-gray-300 text-sm flex-1 truncate">{f.name}</span>
                        <span className="text-gray-600 text-xs shrink-0">
                          {(f.size / 1024).toFixed(0)} KB
                        </span>
                        <button type="button" onClick={() => handleFileRemove(i)}
                          className="text-gray-600 hover:text-red-400 transition-colors ml-1 shrink-0">
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            {/* Form actions */}
            <div className="mt-5 flex gap-3">
              <button type="submit"
                disabled={submitting || uploadingDocs}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
                {(submitting || uploadingDocs) && (
                  <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                )}
                {uploadingDocs ? "Uploading files…" : submitting ? "Submitting…" : "Submit Request"}
              </button>
              <button type="button"
                onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setDocFiles([]) }}
                className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-2 rounded-lg text-sm">
                Cancel
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div className="flex gap-2 mb-4">
        {[
          { key: "all",     label: "All" },
          { key: "pending", label: `Pending${pendingCount > 0 ? ` (${pendingCount})` : ""}` },
          { key: "mine",    label: "My Requests" },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              tab === t.key ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Search + Month filter ─────────────────────────────────────────── */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by asset or requester name..."
          className="bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm flex-1 min-w-[200px]"
        />
        <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)}
          className="bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm">
          <option value="">All Months</option>
          {getLastNMonths().map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <select value={yearFilter} onChange={e => setYearFilter(e.target.value)}
          className="bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm">
          <option value="">All Years</option>
          {getYears().map(y => (
            <option key={y} value={String(y)}>{y}</option>
          ))}
        </select>
      </div>

      {/* ── Requests list ──────────────────────────────────────────────────── */}
      {loading ? (
        <LoadingSkeleton rows={3} cols={2} />
      ) : filtered.length === 0 ? (
        <EmptyState preset="requests" />
      ) : (
        <div className="space-y-3">
          {filtered.map(req => {
            const status   = STATUS_STYLES[req.status]   || STATUS_STYLES.pending
            const priority = PRIORITY_STYLES[req.priority] || PRIORITY_STYLES.medium
            const isOwn    = req.requested_by_email === userProfile?.email
            return (
              <motion.div key={req.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className={`bg-gray-900/80 rounded-xl border p-4 ${
                  req.status === "approved" ? "border-green-500/20" :
                  req.status === "rejected" ? "border-red-500/20"   : "border-gray-800"
                }`}>

                {/* Notification banner for own actioned request */}
                {isOwn && req.status !== "pending" && (
                  <div className={`mb-3 rounded-lg px-3 py-2 flex items-center gap-2 text-sm ${
                    req.status === "approved"
                      ? "bg-green-500/10 border border-green-500/30 text-green-400"
                      : "bg-red-500/10 border border-red-500/30 text-red-400"
                  }`}>
                    <span>{status.emoji}</span>
                    <span className="font-medium">
                      Your request was {req.status}{req.admin_response ? `: "${req.admin_response}"` : "."}
                    </span>
                  </div>
                )}

                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">

                    {/* Title row */}
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <p className="text-white font-medium">{req.asset_type}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${priority.pill}`}>
                        {priority.label}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${status.pill}`}>
                        {status.emoji} {status.label}
                      </span>
                      {daysPending(req) >= 7 && (
                        <span className="text-xs px-2 py-0.5 rounded-full border font-medium bg-red-500/20 text-red-400 border-red-500/30">
                          🚨 {daysPending(req)}d overdue
                        </span>
                      )}
                      {daysPending(req) >= 3 && daysPending(req) < 7 && (
                        <span className="text-xs px-2 py-0.5 rounded-full border font-medium bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                          ⏰ {daysPending(req)}d pending
                        </span>
                      )}
                    </div>

                    {/* Laptop specs */}
                    {(req.laptop_type || req.operating_system) && (
                      <p className="text-gray-500 text-xs mb-1">
                        💻 {[req.laptop_type, req.operating_system].filter(Boolean).join(" · ")}
                      </p>
                    )}

                    {/* Department + cost */}
                    <div className="flex flex-wrap gap-3 mb-1">
                      {req.department && (
                        <span className="text-gray-500 text-xs">🏢 {req.department}</span>
                      )}
                      {req.cost_per_unit != null && (
                        <span className="text-gray-500 text-xs">💰 {currencySymbol}{Number(req.cost_per_unit).toLocaleString("en-SG", { minimumFractionDigits: 2 })}</span>
                      )}
                    </div>

                    {/* Justification */}
                    <p className="text-gray-400 text-sm">{req.reason}</p>
                    {req.notes && <p className="text-gray-500 text-xs mt-1">{req.notes}</p>}

                    {/* Documents */}
                    {req.document_urls?.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {req.document_urls.map((entry, i) => {
                          let url = entry, name = `Document ${i + 1}`
                          try { const parsed = JSON.parse(entry); url = parsed.url; name = parsed.name } catch {}
                          if (!url) return <span key={i} className="text-xs text-gray-500">Document unavailable</span>
                          return (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 border border-blue-500/20 rounded px-2 py-0.5 transition-colors"
                              onError={e => e.currentTarget.replaceWith(Object.assign(document.createElement("span"), { textContent: "Document unavailable", className: "text-xs text-gray-500" }))}>
                              📄 {name}
                            </a>
                          )
                        })}
                      </div>
                    )}

                    {/* Meta row */}
                    <div className="flex flex-wrap gap-3 mt-2">
                      <p className="text-gray-600 text-xs">By {req.requested_by}</p>
                      <p className="text-gray-600 text-xs">{new Date(req.created_at).toLocaleDateString()}</p>
                      {req.actioned_by && (
                        <p className="text-gray-600 text-xs">
                          {req.status === "approved" ? "Approved" : "Rejected"} by {req.actioned_by}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Admin approve / reject buttons */}
                  {(isAdmin || isGlobalAdmin) && req.status === "pending" && (
                    <div className="flex gap-2 shrink-0">
                      <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                        onClick={() => setActionModal({ request: req, type: "approve" })}
                        className="text-green-400 hover:text-green-300 text-sm px-3 py-1 rounded border border-green-400/30 transition-all">
                        Approve
                      </motion.button>
                      <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                        onClick={() => setActionModal({ request: req, type: "reject" })}
                        className="text-red-400 hover:text-red-300 text-sm px-3 py-1 rounded border border-red-400/30 transition-all">
                        Reject
                      </motion.button>
                    </div>
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
