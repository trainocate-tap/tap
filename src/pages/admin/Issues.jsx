import { useEffect, useState } from "react"
import { useLocation } from "react-router-dom"
import * as XLSX from "xlsx"
import { supabase } from "../../lib/supabase"
import { motion, AnimatePresence } from "framer-motion"
import { EmptyState, LoadingSkeleton } from "../../components/EmptyState"
import { useTranslation } from "react-i18next"
import { useAuth } from "../../context/AuthContext"
import { createNotification, notifyAdmins, notifyUserByIdentifier, getEmailByIdentifier } from "../../lib/notifications"
import { sendIssueResolvedEmail, sendNewIssueAdminEmail, getAdminEmails, sendEmail } from "../../lib/emailService"
import { getLastNMonths, getYears, matchesMonth } from "../../lib/dateFilters"

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

function exportIssuesToExcel(issues) {
  const rows = issues.map(i => ({
    "Asset": i.assets?.name || "",
    "Serial No.": i.assets?.serial_number || "",
    "Issue Type": i.issue_type || "",
    "Description": i.description || "",
    "Priority": i.priority || "",
    "Status": i.status,
    "Reported At": i.created_at ? new Date(i.created_at).toLocaleString() : "",
    "Resolved At": i.resolved_at ? new Date(i.resolved_at).toLocaleString() : "",
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Issues")
  XLSX.writeFile(wb, `issues_${new Date().toISOString().split("T")[0]}.xlsx`)
}

export default function Issues() {
  const { t } = useTranslation()
  const { isAdmin, isStandardUser, userProfile } = useAuth()
  const location = useLocation()
  const [issues, setIssues] = useState([])
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [resolveSuccess, setResolveSuccess] = useState(false)
  const [filterStatus, setFilterStatus] = useState("all")
  const [filterPriority, setFilterPriority] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [monthFilter, setMonthFilter] = useState("")
  const [yearFilter, setYearFilter] = useState("")
  const [formError, setFormError] = useState("")
  const [form, setForm] = useState({
    asset_id: "", issue_type: "", description: "", priority: "medium"
  })

  useEffect(() => {
    fetchIssues()
  }, [])

  useEffect(() => {
    if (userProfile !== null && userProfile !== undefined) {
      fetchAssets()
    }
  }, [userProfile])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const assetId = params.get("asset_id")
    if (!assetId || assets.length === 0) return
    const match = assets.find(a => a.id === assetId)
    if (!match) return
    setForm(f => (f.asset_id === assetId ? f : { ...f, asset_id: assetId }))
    setShowForm(true)
    setAssets(prev => {
      if (prev[0]?.id === assetId) return prev
      return [match, ...prev.filter(a => a.id !== assetId)]
    })
  }, [assets, location.search])

  const fetchIssues = async () => {
    const { data } = await supabase
      .from("issues")
      .select("*, assets(name, serial_number)")
      .order("created_at", { ascending: false })
    let rows = data || []

    if (isStandardUser && userProfile) {
      rows = rows.filter(i =>
        i.reported_by === userProfile.email ||
        i.reported_by === userProfile.id ||
        i.reported_by === userProfile.name
      )
    }

    setIssues(rows)
    setLoading(false)
  }

  const fetchAssets = async () => {
    let q = supabase.from("assets").select("id, name, serial_number, assigned_user").order("name")
    const { data } = await q
    const all = data || []
    if (isStandardUser && userProfile) {
      const mine = all.filter(a =>
        a.assigned_user === userProfile?.email ||
        a.assigned_user === userProfile?.name ||
        (a.assigned_user && userProfile?.name &&
          a.assigned_user.toLowerCase() === userProfile.name.toLowerCase())
      )
      setAssets(mine)
    } else {
      setAssets(all)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError("")
    if (!form.asset_id) { setFormError("Please select an asset."); return }
    if (!form.issue_type) { setFormError("Please select an issue type."); return }
    if (!form.description.trim()) { setFormError("Please enter a description."); return }

    const { error } = await supabase.from("issues").insert([{
      asset_id: form.asset_id,
      issue_type: form.issue_type,
      description: form.description,
      priority: form.priority,
      status: "open",
      reported_by: userProfile?.name || null,
    }])
    if (!error) {
      const selectedAssetName = assets.find(a => a.id === form.asset_id)?.name || "an asset"
      createNotification(userProfile?.id, "⚠️ Issue Submitted", `Your ${form.issue_type} issue for ${selectedAssetName} was submitted successfully`, "warning", userProfile?.country, userProfile?.id)
      notifyAdmins(userProfile?.country, "⚠️ New Issue Reported", `${userProfile?.name} reported a ${form.issue_type} issue for ${selectedAssetName}`, "warning")
      getAdminEmails(userProfile?.country).then(adminEmails => {
        if (adminEmails?.length) {
          sendNewIssueAdminEmail(adminEmails, userProfile?.name, form.issue_type, selectedAssetName, form.priority, form.description)
        }
      })
      setShowForm(false)
      setForm({ asset_id: "", issue_type: "", description: "", priority: "medium" })
      sendEmail(userProfile?.email, "Issue Submitted Successfully", "<p>Your issue has been submitted and will be reviewed by the IT team shortly.</p>")
      setSubmitSuccess(true)
      fetchIssues()
      setTimeout(() => {
        setSubmitSuccess(false)
      }, 2500)
    } else {
      setFormError(error.message)
    }
  }

  const handleResolve = async (id, reportedBy, assetName, issueType) => {
    await supabase.from("issues").update({
      status: "resolved",
      resolved_at: new Date().toISOString()
    }).eq("id", id)
    const resolvedMessage = `${reportedBy || "Someone"}'s ${issueType || "issue"} issue for ${assetName || "an asset"} has been resolved`
    notifyAdmins(userProfile?.country, "✅ Issue Resolved", resolvedMessage, "success")
    getAdminEmails(userProfile?.country).then(adminEmails => {
      if (adminEmails?.length) {
        sendEmail(adminEmails, "Issue Resolved", `<p>${resolvedMessage}</p>`)
      }
    })
    if (reportedBy) {
      notifyUserByIdentifier(reportedBy, "✅ Issue Resolved", `Your issue for "${assetName || "an asset"}" has been resolved by admin`, "success")
      getEmailByIdentifier(reportedBy).then(email => {
        if (email) sendIssueResolvedEmail(email, assetName || "an asset", userProfile?.name || userProfile?.email || "Admin")
      })
    }
    setResolveSuccess(true)
    setTimeout(() => {
      setResolveSuccess(false)
      fetchIssues()
    }, 2500)
  }

  const statusColor = {
    open: "bg-red-500/20 text-red-400",
    "in-progress": "bg-yellow-500/20 text-yellow-400",
    resolved: "bg-green-500/20 text-green-400",
  }

  const priorityColor = {
    low: "bg-gray-500/20 text-gray-400",
    medium: "bg-yellow-500/20 text-yellow-400",
    high: "bg-orange-500/20 text-orange-400",
    critical: "bg-red-500/20 text-red-400",
  }

  const filteredIssues = issues.filter(i => {
    if (filterStatus !== "all" && i.status !== filterStatus) return false
    if (filterPriority !== "all" && i.priority !== filterPriority) return false
    if (!matchesMonth(i.created_at, monthFilter, yearFilter)) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const matches = i.assets?.name?.toLowerCase().includes(q) || i.reported_by?.toLowerCase().includes(q)
      if (!matches) return false
    }
    return true
  })

  const selectClass = "bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"

  return (
    <div className="p-4 md:p-8">
      <style>{slideInStyle}</style>

      {/* Submit Issue Success */}
      <AnimatePresence>
        {submitSuccess && (
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
              className="text-center px-8"
            >
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 200 }}
                className="inline-flex items-center justify-center w-24 h-24 bg-orange-500/20 border-2 border-orange-500/50 rounded-full mb-4"
                style={{ boxShadow: "0 0 40px rgba(249, 115, 22, 0.4)" }}
              >
                <span className="text-5xl">⚠️</span>
              </motion.div>
              <h2 className="text-3xl font-bold text-white mb-2">{t("issueReported")}</h2>
              <p className="text-gray-400">{t("submitSuccess")}</p>
              <div className="mt-4 w-48 mx-auto h-1 bg-gray-800 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 2.5, ease: "linear" }}
                  className="h-full bg-orange-500 rounded-full"
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Resolve Issue Success */}
      <AnimatePresence>
        {resolveSuccess && (
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
              className="text-center px-8"
            >
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 200 }}
                className="inline-flex items-center justify-center w-24 h-24 bg-green-500/20 border-2 border-green-500/50 rounded-full mb-4"
                style={{ boxShadow: "0 0 40px rgba(34, 197, 94, 0.4)" }}
              >
                <span className="text-5xl">✅</span>
              </motion.div>
              <h2 className="text-3xl font-bold text-white mb-2">{t("issueResolved")}</h2>
              <p className="text-gray-400">{t("issueResolvedMsg")}</p>
              <div className="mt-4 w-48 mx-auto h-1 bg-gray-800 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 2.5, ease: "linear" }}
                  className="h-full bg-green-500 rounded-full"
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">{t("issuesTitle")}</h1>
          <p className="text-gray-400 mt-1 text-sm">
            {issues.filter(i => i.status === "open").length} {t("openIssues")}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => exportIssuesToExcel(filteredIssues)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background: "rgba(30,41,59,0.8)", border: "1px solid rgba(59,130,246,0.4)", color: "#60a5fa" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(59,130,246,0.15)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(30,41,59,0.8)"}
          >
            📥 Export Excel
          </button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg transition-all text-sm font-medium"
          >
            {t("reportIssue")}
          </motion.button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by asset or reporter name..."
          className="bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm flex-1 min-w-[200px]"
        />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={selectClass}>
          <option value="all">All Statuses</option>
          <option value="open">Open</option>
          <option value="in-progress">In Progress</option>
          <option value="resolved">Resolved</option>
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

      <AnimatePresence>
        {showForm && (
          <motion.form
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            onSubmit={handleSubmit}
            className="bg-gray-900/80 rounded-xl border border-gray-800 p-4 mb-6"
          >
            <h2 className="text-white font-semibold mb-4">Report New Issue</h2>
            <AnimatedError message={formError} onDismiss={() => setFormError("")} />
            <div className="space-y-3">
              <div>
                <label className="text-gray-400 text-sm mb-2 block">Asset</label>
                <select
                  value={form.asset_id}
                  onChange={(e) => setForm({ ...form, asset_id: e.target.value })}
                  required
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
                >
                  <option value="">Select asset...</option>
                  {assets.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} {a.serial_number ? `(${a.serial_number})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-2 block">Issue Type</label>
                <select
                  value={form.issue_type}
                  onChange={(e) => setForm({ ...form, issue_type: e.target.value })}
                  required
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
                >
                  <option value="">Select type...</option>
                  <option value="hardware">Hardware</option>
                  <option value="software">Software</option>
                  <option value="network">Network</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-2 block">Priority</label>
                <select
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="text-gray-400 text-sm mb-2 block">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Describe the issue..."
                  rows={3}
                  required
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm resize-none"
                />
              </div>
            </div>
            <div className="mt-4 flex gap-3">
              <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium">
                Submit Issue
              </button>
              <button type="button" onClick={() => { setShowForm(false); setFormError("") }} className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-2 rounded-lg text-sm">
                Cancel
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Mobile Cards */}
      <div className="block md:hidden space-y-3">
        {loading ? (
          <LoadingSkeleton rows={3} cols={2} />
        ) : filteredIssues.length === 0 ? (
          <EmptyState preset="issues" />
        ) : (
          filteredIssues.map((issue) => (
            <motion.div
              key={issue.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={"bg-gray-900/80 rounded-xl border border-gray-800 p-4"}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <p className="text-white font-medium">{issue.assets?.name || "—"}</p>
                  <p className="text-gray-500 text-xs">{issue.assets?.serial_number || ""}</p>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium shrink-0 ml-2 ${statusColor[issue.status] || "bg-gray-500/20 text-gray-400"}`}>
                  {issue.status}
                </span>
              </div>
              {issue.priority && (
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mb-1 ${priorityColor[issue.priority] || "bg-gray-500/20 text-gray-400"}`}>
                  {issue.priority}
                </span>
              )}
              <p className="text-gray-400 text-sm capitalize mb-1">{issue.issue_type}</p>
              <p className="text-gray-400 text-sm mb-3">{issue.description}</p>
              <div className="flex gap-2 flex-wrap">
                {isAdmin && issue.status === "open" && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleResolve(issue.id, issue.reported_by, issue.assets?.name, issue.issue_type)}
                    className="text-green-400 hover:text-green-300 text-sm px-3 py-1 rounded border border-green-400/30 transition-all"
                  >
                    Resolve
                  </motion.button>
                )}
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block bg-gray-900/80 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left text-gray-400 text-sm font-medium px-6 py-4">Asset</th>
              <th className="text-left text-gray-400 text-sm font-medium px-6 py-4">Type</th>
              <th className="text-left text-gray-400 text-sm font-medium px-6 py-4">Description</th>
              <th className="text-left text-gray-400 text-sm font-medium px-6 py-4">Priority</th>
              <th className="text-left text-gray-400 text-sm font-medium px-6 py-4">Status</th>
              <th className="text-left text-gray-400 text-sm font-medium px-6 py-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6}><LoadingSkeleton rows={3} cols={2} /></td></tr>
            ) : filteredIssues.length === 0 ? (
              <tr><td colSpan={6}><EmptyState preset="issues" /></td></tr>
            ) : (
              filteredIssues.map((issue) => (
                <tr key={issue.id} className={"border-b border-gray-800 hover:bg-gray-800/50 transition-all"}>
                  <td className="px-6 py-4">
                    <p className="text-white font-medium">{issue.assets?.name || "—"}</p>
                    <p className="text-gray-500 text-xs">{issue.assets?.serial_number || ""}</p>
                  </td>
                  <td className="px-6 py-4 text-gray-400 text-sm capitalize">{issue.issue_type}</td>
                  <td className="px-6 py-4 text-gray-400 text-sm max-w-xs truncate">{issue.description}</td>
                  <td className="px-6 py-4">
                    {issue.priority && (
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${priorityColor[issue.priority] || "bg-gray-500/20 text-gray-400"}`}>
                        {issue.priority}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColor[issue.status] || "bg-gray-500/20 text-gray-400"}`}>
                      {issue.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      {isAdmin && issue.status === "open" && (
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleResolve(issue.id, issue.reported_by, issue.assets?.name, issue.issue_type)}
                          className="text-green-400 hover:text-green-300 text-sm px-3 py-1 rounded border border-green-400/30 transition-all"
                        >
                          Resolve
                        </motion.button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
