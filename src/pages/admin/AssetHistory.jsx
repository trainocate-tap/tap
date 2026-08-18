import { useEffect, useState } from "react"
import * as XLSX from "xlsx"
import { supabase } from "../../lib/supabase"
import { motion } from "framer-motion"
import { EmptyState, LoadingSkeleton } from "../../components/EmptyState"
import { useTranslation } from "react-i18next"

function formatDetails(details) {
  const d = details || ""
  if (d.startsWith("Condition updated to")) {
    return d.replace("Condition updated to", "").trim()
  }
  return d
}

function exportHistoryToPDF(history) {
  const rows = history.map(h => `
    <tr>
      <td>${h.action || ""}</td>
      <td>${h.assets?.name || "Unknown"}</td>
      <td>${formatDetails(h.details)}</td>
      <td>${h.changed_by || ""}</td>
      <td>${h.created_at ? new Date(h.created_at).toLocaleString() : ""}</td>
    </tr>`).join("")
  const win = window.open("")
  win.document.write(`<html><head><title>History — Trainocate Asset Portal</title>
    <style>body{font-family:Arial,sans-serif;padding:24px;font-size:12px}h1{font-size:18px;margin-bottom:4px}
    table{width:100%;border-collapse:collapse}th{background:#1e293b;color:#fff;text-align:left;padding:8px 10px;font-size:11px}
    td{padding:7px 10px;border-bottom:1px solid #e5e7eb}tr:nth-child(even) td{background:#f8fafc}
    @media print{body{padding:0}}</style></head>
    <body><h1>Asset History — Trainocate Asset Portal</h1>
    <p style="color:#666;font-size:11px;margin-bottom:16px">Exported ${history.length} records on ${new Date().toLocaleDateString("en-SG",{day:"numeric",month:"long",year:"numeric"})}</p>
    <table><thead><tr><th>Action</th><th>Asset</th><th>Asset Status</th><th>By</th><th>Date</th></tr></thead>
    <tbody>${rows}</tbody></table></body></html>`)
  win.document.close()
  win.print()
}

function exportHistoryToExcel(history) {
  const rows = history.map(h => ({
    "Action": h.action || "",
    "Asset": h.assets?.name || "Unknown",
    "Serial No.": h.assets?.serial_number || "",
    "Asset Status": formatDetails(h.details),
    "By": h.changed_by || "",
    "Date": h.created_at ? new Date(h.created_at).toLocaleString() : "",
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "History")
  XLSX.writeFile(wb, `history_${new Date().toISOString().split("T")[0]}.xlsx`)
}

export default function AssetHistory() {
  const { t } = useTranslation()
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterAction, setFilterAction] = useState("")
  const [filterUser, setFilterUser] = useState("")
  const [filterAsset, setFilterAsset] = useState("")
  const [filterDateFrom, setFilterDateFrom] = useState("")
  const [filterDateTo, setFilterDateTo] = useState("")

  useEffect(() => {
    fetchHistory()
  }, [])

  const fetchHistory = async () => {
    const { data } = await supabase
      .from("asset_history")
      .select("*, assets(name, serial_number)")
      .order("created_at", { ascending: false })
      .limit(500)
    setHistory(data || [])
    setLoading(false)
  }

  const filtered = history.filter(h => {
    if (filterAction && h.action !== filterAction) return false
    if (filterUser && !(h.changed_by || "").toLowerCase().includes(filterUser.toLowerCase())) return false
    if (filterAsset && !(h.assets?.name || "").toLowerCase().includes(filterAsset.toLowerCase())) return false
    if (filterDateFrom && new Date(h.created_at) < new Date(filterDateFrom)) return false
    if (filterDateTo && new Date(h.created_at) > new Date(filterDateTo + "T23:59:59")) return false
    return true
  })

  const uniqueActions = [...new Set(history.map(h => h.action).filter(Boolean))]

  const actionColor = {
    "Created": "bg-green-500/20 text-green-400",
    "Updated": "bg-blue-500/20 text-blue-400",
    "Deleted": "bg-red-500/20 text-red-400",
    "Borrowed": "bg-purple-500/20 text-purple-400",
    "Returned": "bg-yellow-500/20 text-yellow-400",
    "Issue Reported": "bg-orange-500/20 text-orange-400",
    "Issue Resolved": "bg-teal-500/20 text-teal-400",
    "Maintenance Requested": "bg-blue-500/20 text-blue-400",
    "Maintenance Completed": "bg-green-500/20 text-green-400",
    "Request Submitted": "bg-indigo-500/20 text-indigo-400",
    "Request Approved": "bg-green-500/20 text-green-400",
    "Request Rejected": "bg-red-500/20 text-red-400",
    "User Created": "bg-cyan-500/20 text-cyan-400",
    "User Deleted": "bg-red-500/20 text-red-400",
    "Assigned": "bg-blue-500/20 text-blue-400",
  }

  const actionEmoji = {
    "Created": "✅",
    "Updated": "✏️",
    "Deleted": "🗑️",
    "Borrowed": "🔄",
    "Returned": "↩️",
    "Issue Reported": "⚠️",
    "Issue Resolved": "✅",
    "Maintenance Requested": "🔧",
    "Maintenance Completed": "✅",
    "Request Submitted": "🔔",
    "Request Approved": "✅",
    "Request Rejected": "❌",
    "User Created": "👤",
    "User Deleted": "🗑️",
    "Assigned": "👤",
  }

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">{t("historyTitle")}</h1>
          <p className="text-gray-400 mt-1 text-sm">{t("auditTrail")}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => exportHistoryToPDF(filtered)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background: "rgba(30,41,59,0.8)", border: "1px solid rgba(59,130,246,0.4)", color: "#60a5fa" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(59,130,246,0.15)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(30,41,59,0.8)"}
          >
            📥 Export PDF
          </button>
          <button onClick={() => exportHistoryToExcel(filtered)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background: "rgba(30,41,59,0.8)", border: "1px solid rgba(59,130,246,0.4)", color: "#60a5fa" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(59,130,246,0.15)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(30,41,59,0.8)"}
          >
            📥 Export Excel
          </button>
        </div>
      </div>

      {/* Filters */}
      {!loading && history.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-6">
          <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-3">Filter History</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <select
              value={filterAction}
              onChange={e => setFilterAction(e.target.value)}
              className="bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
            >
              <option value="">All Actions</option>
              {uniqueActions.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <input
              type="text"
              placeholder="Filter by user..."
              value={filterUser}
              onChange={e => setFilterUser(e.target.value)}
              className="bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm placeholder-gray-500"
            />
            <input
              type="text"
              placeholder="Filter by asset name..."
              value={filterAsset}
              onChange={e => setFilterAsset(e.target.value)}
              className="bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm placeholder-gray-500"
            />
            <input
              type="date"
              value={filterDateFrom}
              onChange={e => setFilterDateFrom(e.target.value)}
              className="bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
              title="From date"
            />
            <input
              type="date"
              value={filterDateTo}
              onChange={e => setFilterDateTo(e.target.value)}
              className="bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
              title="To date"
            />
            {(filterAction || filterUser || filterAsset || filterDateFrom || filterDateTo) && (
              <button
                onClick={() => { setFilterAction(""); setFilterUser(""); setFilterAsset(""); setFilterDateFrom(""); setFilterDateTo("") }}
                className="px-3 py-2 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 text-sm transition-all"
              >
                ✕ Clear Filters
              </button>
            )}
          </div>
          {(filterAction || filterUser || filterAsset || filterDateFrom || filterDateTo) && (
            <p className="text-gray-500 text-xs mt-2">Showing {filtered.length} of {history.length} records</p>
          )}
        </div>
      )}

      {loading ? (
        <LoadingSkeleton rows={4} cols={2} />
      ) : history.length === 0 ? (
        <EmptyState preset="history" />
      ) : filtered.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center">
          <p className="text-gray-400 text-sm">No history matches your filters.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className="bg-gray-900 rounded-xl border border-gray-800 p-4 flex items-start gap-4"
            >
              <div className="text-2xl shrink-0">
                {actionEmoji[item.action] || "📝"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${actionColor[item.action] || "bg-gray-500/20 text-gray-400"}`}>
                    {item.action}
                  </span>
                  <p className="text-white font-medium text-sm">
                    {item.assets?.name || "Unknown Asset"}
                  </p>
                </div>
                {item.details && (
                  <p className="text-gray-400 text-sm mt-1">
                    {(() => {
                      let d = (item.details || "").replace(/added to ITAMS/gi, "added to Trainocate Asset Portal")
                      if (d.startsWith("Condition updated to")) {
                        return d.replace("Condition updated to", "").trim()
                      }
                      // Normalise "Bulk assigned to" entries — strip surrounding quotes from username
                      const bulkMatch = d.match(/^Bulk assigned to ["']?(.+?)["']?$/)
                      if (bulkMatch) {
                        return <span>Bulk assigned to <span className="text-white font-medium">{bulkMatch[1]}</span></span>
                      }
                      // Old-format entries where only the username was stored and action is "Updated"
                      if (item.action === "Updated" && !d.includes(" ") && d.length > 0 && d.length < 60 && /^[A-Z]/.test(d)) {
                        return <span>Bulk assigned to <span className="text-white font-medium">{d}</span></span>
                      }
                      return d
                    })()}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-2">
                  {item.changed_by && (
                    <p className="text-gray-500 text-xs">By: {item.changed_by}</p>
                  )}
                  <p className="text-gray-600 text-xs">
                    {new Date(item.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}