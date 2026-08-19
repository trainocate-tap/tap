import { useEffect, useState, useRef } from "react"
import * as XLSX from "xlsx"
import { supabase } from "../../lib/supabase"
import { useNavigate, useSearchParams, useLocation } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { logHistory } from "../../lib/logHistory"
import { notifyUserByIdentifier } from "../../lib/notifications"
import { useAuth } from "../../context/AuthContext"
import { EmptyState, LoadingSkeleton } from "../../components/EmptyState"
import QRLabelModal from "../../components/QRLabelModal"
import { useCurrency } from "../../lib/useCurrency"
import { statusLabel } from "../../lib/statusLabel"
import { DEPARTMENTS } from "../../lib/departments"

const CATEGORIES = ["Laptop","Desktop","Monitor","Printer","Server","Networking","Mobile Device","Tablet","Peripheral","Software License","Furniture","Other"]
const PAGE_SIZE = 20

const STATUS_OPTIONS = ["available", "assigned", "maintenance", "retired"]

function exportToExcel(data, filename = "assets") {
  const rows = data.map(a => ({
    "Asset Name": a.name,
    "Category": a.category || "",
    "Serial No.": a.serial_number || "",
    "Asset Tag": a.asset_tag || "",
    "Assigned To": a.assigned_user || "",
    "Location": a.location || "",
    "Status": statusLabel(a.status),
    "Warranty Expiry": a.warranty_expiry || "",
    "Purchase Price": a.purchase_price || "",
  }))
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Assets")
  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().split("T")[0]}.xlsx`)
}

function exportToPDF(selectedAssets, currencySymbol) {
  const rows = selectedAssets.map(a => `
    <tr>
      <td>${a.name}</td>
      <td>${a.category || "—"}</td>
      <td>${a.serial_number || "—"}</td>
      <td>${a.asset_tag || "—"}</td>
      <td>${a.assigned_user || "—"}</td>
      <td>${a.location || "—"}</td>
      <td>${statusLabel(a.status)}</td>
      <td>${a.purchase_price ? currencySymbol + Number(a.purchase_price).toLocaleString() : "—"}</td>
    </tr>`).join("")

  const win = window.open("")
  win.document.write(`
    <html>
    <head>
      <title>Asset Export — Trainocate Asset Portal</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 24px; font-size: 12px; color: #111; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        p.sub { color: #666; margin-bottom: 16px; font-size: 11px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #1e293b; color: #fff; text-align: left; padding: 8px 10px; font-size: 11px; }
        td { padding: 7px 10px; border-bottom: 1px solid #e5e7eb; }
        tr:nth-child(even) td { background: #f8fafc; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <h1>Trainocate Asset Portal — Asset Export</h1>
      <p class="sub">Exported ${selectedAssets.length} asset${selectedAssets.length !== 1 ? "s" : ""} on ${new Date().toLocaleDateString("en-SG", { day: "numeric", month: "long", year: "numeric" })}</p>
      <table>
        <thead>
          <tr>
            <th>Name</th><th>Category</th><th>Serial No.</th><th>Asset Tag</th>
            <th>Assigned To</th><th>Location</th><th>Status</th><th>Purchase Price</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </body>
    </html>`)
  win.document.close()
  win.print()
}

export default function Assets() {
  const { canEdit, canDelete, isGuest, isStandardUser, isMarketingOnly, isGlobalAdmin, userCountry, profileLoading, userProfile } = useAuth()
  const isMyAssetsView = isStandardUser || isMarketingOnly
  const { symbol: currencySymbol } = useCurrency()
  const [assets, setAssets] = useState([])
  const [maintByAsset, setMaintByAsset] = useState({})
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState(searchParams.get("q") || "")
  const [filterStatus, setFilterStatus] = useState("")
  const [filterCategory, setFilterCategory] = useState("")
  const [filterDepartment, setFilterDepartment] = useState("")
  const [sortCol, setSortCol] = useState("")
  const [sortDir, setSortDir] = useState("asc")
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [deleteModal, setDeleteModal] = useState(null)
  const navigate = useNavigate()
  const location = useLocation()

  // Bulk state
  const [selected, setSelected] = useState(new Set())
  const [bulkModal, setBulkModal] = useState(null) // "assign" | "status" | "delete"
  const [bulkInput, setBulkInput] = useState("")
  const [bulkWorking, setBulkWorking] = useState(false)
  const [assignUsers, setAssignUsers] = useState([])
  const [assignSearch, setAssignSearch] = useState("")
  const [showAssignDropdown, setShowAssignDropdown] = useState(false)
  const assignDropdownRef = useRef(null)
  const [showLabelModal, setShowLabelModal] = useState(false)

  useEffect(() => { if (!profileLoading) fetchAssets() }, [profileLoading, userCountry, isGlobalAdmin, isMyAssetsView, userProfile?.name])
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const statusParam = params.get("status")
    if (statusParam) setFilterStatus(statusParam)
  }, [location.search])
  useEffect(() => setCurrentPage(1), [search, filterStatus, filterCategory, filterDepartment, sortCol])
  useEffect(() => {
    supabase.from("user_profiles").select("id, name, email").order("name").then(({ data }) => setAssignUsers(data || []))
  }, [])
  useEffect(() => {
    if (!showAssignDropdown) return
    const handler = (e) => {
      if (assignDropdownRef.current && !assignDropdownRef.current.contains(e.target)) setShowAssignDropdown(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [showAssignDropdown])

  const fetchAssets = async () => {
    const maintPromise = supabase.from("maintenance_schedules").select("asset_id, status, scheduled_date")

    // Supabase caps each request at 1000 rows by default — page through with
    // .range() until a page comes back short, then combine into one array.
    const PAGE_SIZE = 1000
    let allAssets = []
    let from = 0
    while (true) {
      let assetQuery = supabase.from("assets").select("*").order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1)
      if (userCountry && !isGlobalAdmin) assetQuery = assetQuery.eq("country", userCountry)
      if (isMyAssetsView) assetQuery = assetQuery.eq("assigned_user", userProfile?.name || "")
      const { data: page } = await assetQuery
      if (page?.length) allAssets = allAssets.concat(page)
      if (!page || page.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }

    const { data: m } = await maintPromise
    setAssets(allAssets)
    const byAsset = {}
    ;(m || []).forEach(r => {
      if (!byAsset[r.asset_id]) byAsset[r.asset_id] = []
      byAsset[r.asset_id].push(r)
    })
    setMaintByAsset(byAsset)
    setLoading(false)
  }

  const handleDelete = async () => {
    await logHistory(deleteModal.id, "Deleted", `Asset "${deleteModal.name}" was deleted from Trainocate Asset Portal`, userProfile?.name || userProfile?.email)
    await supabase.from("assets").delete().eq("id", deleteModal.id)
    setAssets(prev => prev.filter(a => a.id !== deleteModal.id))
    setDeleteModal(null)
  }

  // Bulk helpers
  const toggleSelect = (id, e) => {
    e?.stopPropagation()
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(a => a.id)))
    }
  }

  const clearSelected = () => setSelected(new Set())

  const selectedAssets = assets.filter(a => selected.has(a.id))

  const handleBulkAssign = async () => {
    if (!bulkInput.trim()) return
    setBulkWorking(true)
    const ids = [...selected]
    await supabase.from("assets").update({ assigned_user: bulkInput.trim(), status: "assigned" }).in("id", ids)
    await Promise.all(ids.map(id => {
      const a = assets.find(x => x.id === id)
      const label = ids.length === 1 ? "Assigned to" : "Bulk assigned to"
      if (a) notifyUserByIdentifier(bulkInput.trim(), "📦 Asset Assigned", `An asset "${a.name}" has been assigned to you by admin`, "info")
      return logHistory(id, "Updated", `${label} "${bulkInput.trim()}"`, userProfile?.name || userProfile?.email)
    }))
    await fetchAssets()
    setBulkModal(null); setBulkInput(""); clearSelected(); setBulkWorking(false)
  }

  const handleBulkStatus = async () => {
    if (!bulkInput) return
    setBulkWorking(true)
    const ids = [...selected]
    const update = bulkInput === "available"
      ? { status: bulkInput, assigned_user: null }
      : { status: bulkInput }
    await supabase.from("assets").update(update).in("id", ids)
    await Promise.all(ids.map(id => logHistory(id, "Updated", `Bulk status changed to "${bulkInput}"`, userProfile?.name || userProfile?.email)))
    await fetchAssets()
    setBulkModal(null); setBulkInput(""); clearSelected(); setBulkWorking(false)
  }

  const handleBulkDelete = async () => {
    setBulkWorking(true)
    const ids = [...selected]
    await Promise.all(ids.map(id => {
      const a = assets.find(x => x.id === id)
      return logHistory(id, "Deleted", `Asset "${a?.name}" bulk deleted`, userProfile?.name || userProfile?.email)
    }))
    await supabase.from("assets").delete().in("id", ids)
    await fetchAssets()
    setBulkModal(null); clearSelected(); setBulkWorking(false)
  }

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortCol(col); setSortDir("asc") }
  }

  const filtered = assets.filter(a => {
    const q = search.toLowerCase()
    const matchSearch = (
      a.name?.toLowerCase().includes(q) ||
      a.serial_number?.toLowerCase().includes(q) ||
      a.assigned_user?.toLowerCase().includes(q) ||
      a.location?.toLowerCase().includes(q) ||
      a.category?.toLowerCase().includes(q)
    )
    const matchStatus = !filterStatus || a.status?.toLowerCase() === filterStatus?.toLowerCase()
    const matchCat = !filterCategory || a.category === filterCategory
    const matchDept = !filterDepartment || a.department === filterDepartment
    return matchSearch && matchStatus && matchCat && matchDept
  })

  const sorted = [...filtered].sort((a, b) => {
    if (!sortCol) return 0
    let va = "", vb = ""
    if (sortCol === "name")     { va = a.name || ""; vb = b.name || "" }
    if (sortCol === "category") { va = a.category || ""; vb = b.category || "" }
    if (sortCol === "status")   { va = a.status || ""; vb = b.status || "" }
    if (sortCol === "warranty") { va = a.warranty_expiry || ""; vb = b.warranty_expiry || "" }
    return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va)
  })

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const paginated = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const allSelected = filtered.length > 0 && selected.size === filtered.length
  const someSelected = selected.size > 0

  const statusColor = {
    available: "bg-green-500/20 text-green-400",
    assigned:  "bg-blue-500/20 text-blue-400",
    borrowed:  "bg-purple-500/20 text-purple-400",
    maintenance: "bg-yellow-500/20 text-yellow-400",
    retired:   "bg-red-500/20 text-red-400",
  }

  return (
    <div className="w-screen max-w-full overflow-x-hidden px-4 md:px-8 py-4 md:py-8">

      {/* Single delete modal */}
      <AnimatePresence>
        {deleteModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.8, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 20 }} transition={{ type: "spring", stiffness: 200 }}
              className="bg-gray-900 rounded-2xl border border-gray-700 p-6 w-full max-w-sm shadow-2xl"
              style={{ boxShadow: "0 0 40px rgba(239,68,68,0.15)" }}>
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-full mb-4">
                  <span className="text-3xl">🗑️</span>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Delete Asset?</h3>
                <p className="text-gray-400 text-sm">You are about to delete</p>
                <p className="text-white font-semibold mt-1">"{deleteModal.name}"</p>
                <p className="text-gray-500 text-xs mt-2">This action cannot be undone.</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setDeleteModal(null)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-3 rounded-xl font-medium transition-all">Cancel</button>
                <button onClick={handleDelete}
                  className="flex-1 bg-red-600 hover:bg-red-500 text-white py-3 rounded-xl font-medium transition-all"
                  style={{ boxShadow: "0 0 20px rgba(239,68,68,0.3)" }}>Delete</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk action modals */}
      <AnimatePresence>
        {bulkModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }} transition={{ type: "spring", stiffness: 200 }}
              className="bg-gray-900 rounded-2xl border border-gray-700 p-6 w-full max-w-sm shadow-2xl">

              {bulkModal === "delete" ? (
                <>
                  <div className="text-center mb-5">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-full mb-3">
                      <span className="text-3xl">🗑️</span>
                    </div>
                    <h3 className="text-white font-bold text-lg mt-1">Delete {selected.size} Asset{selected.size !== 1 ? "s" : ""}?</h3>
                    <p className="text-gray-400 text-sm mt-2">This will permanently delete all selected assets. This cannot be undone.</p>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setBulkModal(null)}
                      className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2.5 rounded-xl text-sm font-medium transition-all">Cancel</button>
                    <button onClick={handleBulkDelete} disabled={bulkWorking}
                      className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2.5 rounded-xl text-sm font-medium transition-all">
                      {bulkWorking ? "Deleting..." : `Delete ${selected.size}`}
                    </button>
                  </div>
                </>
              ) : bulkModal === "assign" ? (
                <>
                  <h3 className="text-white font-bold text-lg mb-1">Assign {selected.size} Asset{selected.size !== 1 ? "s" : ""}</h3>
                  <p className="text-gray-500 text-sm mb-4">All selected assets will be assigned and set to "assigned" status.</p>
                  <div className="relative mb-4" ref={assignDropdownRef}>
                    <input
                      type="text"
                      value={showAssignDropdown ? assignSearch : bulkInput}
                      onChange={e => { setAssignSearch(e.target.value); setShowAssignDropdown(true) }}
                      onFocus={() => { setAssignSearch(""); setShowAssignDropdown(true) }}
                      placeholder="Search employee..."
                      className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
                    />
                    {bulkInput && !showAssignDropdown && (
                      <button
                        type="button"
                        onClick={() => { setBulkInput(""); setAssignSearch("") }}
                        className="absolute right-3 top-3.5 text-gray-500 hover:text-white text-xs"
                      >✕</button>
                    )}
                    {showAssignDropdown && (
                      <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl max-h-52 overflow-y-auto">
                        {assignUsers
                          .filter(u => {
                            const q = assignSearch.toLowerCase()
                            return !q || (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q)
                          })
                          .map(u => (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => { setBulkInput(u.name || u.email); setShowAssignDropdown(false); setAssignSearch("") }}
                              className="w-full text-left px-4 py-2.5 hover:bg-gray-700 text-sm"
                            >
                              <span className="text-white">{u.name}</span>
                              {u.email && <span className="text-gray-400 ml-2 text-xs">{u.email}</span>}
                            </button>
                          ))
                        }
                        {assignUsers.filter(u => {
                          const q = assignSearch.toLowerCase()
                          return !q || (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q)
                        }).length === 0 && (
                          <div className="px-4 py-3 text-gray-500 text-sm">No users found</div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => { setBulkModal(null); setBulkInput(""); setAssignSearch(""); setShowAssignDropdown(false) }}
                      className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2.5 rounded-xl text-sm font-medium transition-all">Cancel</button>
                    <button onClick={handleBulkAssign} disabled={bulkWorking || !bulkInput.trim()}
                      className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-medium transition-all">
                      {bulkWorking ? "Assigning..." : "Assign"}
                    </button>
                  </div>
                </>
              ) : bulkModal === "status" ? (
                <>
                  <h3 className="text-white font-bold text-lg mb-1">Change Status</h3>
                  <p className="text-gray-500 text-sm mb-4">Set status for {selected.size} selected asset{selected.size !== 1 ? "s" : ""}.</p>
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {STATUS_OPTIONS.map(s => (
                      <button key={s} onClick={() => setBulkInput(s)}
                        className={`py-2.5 rounded-xl text-sm font-medium capitalize transition-all border ${
                          bulkInput === s ? "bg-blue-600 border-blue-500 text-white" : "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500"
                        }`}>{statusLabel(s)}</button>
                    ))}
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => { setBulkModal(null); setBulkInput("") }}
                      className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2.5 rounded-xl text-sm font-medium transition-all">Cancel</button>
                    <button onClick={handleBulkStatus} disabled={bulkWorking || !bulkInput}
                      className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-medium transition-all">
                      {bulkWorking ? "Updating..." : "Apply"}
                    </button>
                  </div>
                </>
              ) : null}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex flex-col gap-2 mb-4 w-full">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">{isMyAssetsView ? "My Assets" : "All Assets"}</h1>
          <p className="text-gray-400 mt-1 text-sm">{assets.length} total assets</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => exportToExcel(filtered)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background: "rgba(30,41,59,0.8)", border: "1px solid rgba(59,130,246,0.4)", color: "#60a5fa" }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(59,130,246,0.15)" }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(30,41,59,0.8)" }}
          >
            📥 Export Excel
          </button>
          {canEdit && !isGuest && (
            <button onClick={() => navigate("/admin/add-asset")}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg transition-all text-sm">
              + Add
            </button>
          )}
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col md:flex-row gap-2 mb-4">
        <input type="text" placeholder="Search assets..." value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-gray-900 text-white rounded-lg px-4 py-3 border border-gray-800 focus:border-blue-500 focus:outline-none" />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-gray-900 text-white rounded-lg px-4 py-3 border border-gray-800 focus:border-blue-500 focus:outline-none text-sm">
          <option value="">All Status</option>
          <option value="available">Unassigned</option>
          <option value="assigned">Assigned</option>
          <option value="borrowed">Borrowed</option>
          <option value="maintenance">Maintenance</option>
          <option value="retired">Retired</option>
        </select>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
          className="bg-gray-900 text-white rounded-lg px-4 py-3 border border-gray-800 focus:border-blue-500 focus:outline-none text-sm">
          <option value="">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterDepartment} onChange={e => setFilterDepartment(e.target.value)}
          className="bg-gray-900 text-white rounded-lg px-4 py-3 border border-gray-800 focus:border-blue-500 focus:outline-none text-sm">
          <option value="">All Departments</option>
          {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        {sortCol && (
          <button
            onClick={() => { setSortCol(""); setSortDir("asc") }}
            className="px-3 py-2 rounded-lg text-sm font-medium border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-all"
          >
            ↺ Reset Sort
          </button>
        )}
      </div>

      {/* Bulk action bar */}
      <AnimatePresence>
        {someSelected && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="mb-4 bg-blue-600/10 border border-blue-500/30 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
            <span className="text-blue-300 font-semibold text-sm">{selected.size} selected</span>
            <div className="flex flex-wrap gap-2 flex-1">
              {canEdit && !isGuest && (
                <button onClick={() => { setBulkInput(""); setBulkModal("assign") }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white border border-gray-700 transition-all">
                  👤 Assign
                </button>
              )}
              {canEdit && !isGuest && (
                <button onClick={() => { setBulkInput(""); setBulkModal("status") }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white border border-gray-700 transition-all">
                  🔄 Change Status
                </button>
              )}
              <button onClick={() => exportToPDF(selectedAssets, currencySymbol)}
                className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-white border border-gray-700 transition-all">
                📄 Export PDF
              </button>
              {!isGuest && (
                <button onClick={() => setShowLabelModal(true)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 transition-all">
                  🏷️ Print Labels
                </button>
              )}
              {canDelete && !isGuest && (
                <button onClick={() => setBulkModal("delete")}
                  className="text-xs px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 transition-all">
                  🗑️ Delete
                </button>
              )}
            </div>
            <button onClick={clearSelected} className="text-gray-500 hover:text-gray-300 text-xs transition-all">✕ Clear</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Cards */}
      <div className="block md:hidden space-y-3 w-full min-w-0">
        {loading ? (
          <LoadingSkeleton rows={4} cols={2} />
        ) : sorted.length === 0 ? (
          <EmptyState preset={search ? "search" : "assets"} />
        ) : (
          paginated.map((asset) => {
            const isChecked = selected.has(asset.id)
            const cardWarrantyExpiry = asset.warranty_expiry ? new Date(asset.warranty_expiry) : null
            const cardWarrantyValid = cardWarrantyExpiry && cardWarrantyExpiry >= new Date()
            return (
              <motion.div key={asset.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                onClick={() => navigate(`/admin/assets/${asset.id}`)}
                className={`bg-gray-900 rounded-xl border p-4 cursor-pointer transition-all ${
                  isChecked ? "border-blue-500/50 bg-blue-500/5" : "border-gray-800"
                }`}>
                <div className="flex items-start gap-3 w-full min-w-0">
                  <div onClick={e => toggleSelect(asset.id, e)} className="mt-1 shrink-0">
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
                      isChecked ? "bg-blue-600 border-blue-600" : "border-gray-600 hover:border-gray-400"
                    }`}>
                      {isChecked && <span className="text-white text-xs leading-none">✓</span>}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">{asset.name}</p>
                    <p className="text-gray-500 text-xs mt-1">{asset.category}</p>
                    <p className="text-gray-400 text-sm mt-1">{asset.serial_number || "No serial"}</p>
                    <p className="text-gray-400 text-sm">{asset.status === "available" ? "Unassigned" : (asset.assigned_user || "Unassigned")}</p>
                    <div className="mt-2 flex items-center gap-1.5">
                      {!asset.warranty_expiry ? (
                        <>
                          <span className="text-xs">⚪</span>
                          <span className="text-gray-500 text-xs">No Warranty</span>
                        </>
                      ) : (
                        <>
                          <span className="text-xs">{cardWarrantyValid ? "🟢" : "🔴"}</span>
                          <span className={`text-xs font-medium ${cardWarrantyValid ? "text-green-400" : "text-red-400"}`}>
                            {cardWarrantyValid ? "Valid" : "Expired"}
                          </span>
                          <span className="text-gray-600 text-xs">{asset.warranty_expiry}</span>
                        </>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor[asset.status] || "bg-gray-500/20 text-gray-400"}`}>
                        {statusLabel(asset.status)}
                      </span>
                      {canEdit && !isGuest && (
                        <button onClick={(e) => { e.stopPropagation(); navigate(`/admin/edit-asset/${asset.id}`) }}
                          className="text-blue-400 text-xs px-2 py-1 rounded border border-blue-400/30">Edit</button>
                      )}
                      {canDelete && !isGuest && (
                        <button onClick={(e) => { e.stopPropagation(); setDeleteModal(asset) }}
                          className="text-red-400 text-xs px-2 py-1 rounded border border-red-400/30">Del</button>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          })
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block bg-gray-900 rounded-xl border border-gray-800">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="px-2 py-4 w-10">
                <div onClick={toggleAll}
                  className={`w-4 h-4 rounded border-2 cursor-pointer flex items-center justify-center transition-all ${
                    allSelected ? "bg-blue-600 border-blue-600" : someSelected ? "bg-blue-600/40 border-blue-500" : "border-gray-600 hover:border-gray-400"
                  }`}>
                  {(allSelected || someSelected) && <span className="text-white text-xs leading-none">{allSelected ? "✓" : "–"}</span>}
                </div>
              </th>
              <th className="text-left text-gray-400 text-sm font-medium px-3 py-4" style={{ maxWidth: 150 }}>
                <button onClick={() => handleSort("name")} className="flex items-center gap-1 hover:text-white transition-colors">Asset<span className="text-xs">{sortCol === "name" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}</span></button>
              </th>
              <th className="text-left text-gray-400 text-sm font-medium px-3 py-4" style={{ maxWidth: 100 }}>Serial No.</th>
              <th className="text-left text-gray-400 text-sm font-medium px-3 py-4" style={{ maxWidth: 120 }}>Assigned To</th>
              <th className="text-left text-gray-400 text-sm font-medium px-3 py-4" style={{ maxWidth: 90 }}>
                <button onClick={() => handleSort("status")} className="flex items-center gap-1 hover:text-white transition-colors">Status<span className="text-xs">{sortCol === "status" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}</span></button>
              </th>
              <th className="text-left text-gray-400 text-sm font-medium px-3 py-4" style={{ maxWidth: 110 }}>
                <button onClick={() => handleSort("warranty")} className="flex items-center gap-1 hover:text-white transition-colors">Warranty<span className="text-xs">{sortCol === "warranty" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}</span></button>
              </th>
              <th className="text-left text-gray-400 text-sm font-medium px-3 py-4" style={{ maxWidth: 90 }}>
                <button onClick={() => handleSort("category")} className="flex items-center gap-1 hover:text-white transition-colors">Category<span className="text-xs">{sortCol === "category" ? (sortDir === "asc" ? "↑" : "↓") : "↕"}</span></button>
              </th>
              <th className="text-left text-gray-400 text-sm font-medium px-3 py-4" style={{ maxWidth: 100 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8}><LoadingSkeleton rows={4} cols={2} /></td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={8}><EmptyState preset={search ? "search" : "assets"} /></td></tr>
            ) : (
              paginated.map((asset) => {
                const isChecked = selected.has(asset.id)
                const warrantyExpiry = asset.warranty_expiry ? new Date(asset.warranty_expiry) : null
                const warrantyValid = warrantyExpiry && warrantyExpiry >= new Date()
                return (
                  <tr key={asset.id} onClick={() => navigate(`/admin/assets/${asset.id}`)}
                    className={`border-b border-gray-800 transition-all cursor-pointer ${
                      isChecked ? "bg-blue-500/5 hover:bg-blue-500/10" : "hover:bg-gray-800/50"
                    }`}>
                    <td className="px-4 py-4" onClick={e => toggleSelect(asset.id, e)}>
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
                        isChecked ? "bg-blue-600 border-blue-600" : "border-gray-600 hover:border-gray-400"
                      }`}>
                        {isChecked && <span className="text-white text-xs leading-none">✓</span>}
                      </div>
                    </td>
                    <td className="px-3 py-4" style={{ maxWidth: 150 }}>
                      <p className="text-white font-medium truncate">{asset.name}</p>
                      <p className="text-gray-500 text-sm truncate">{asset.category}</p>
                    </td>
                    <td className="px-3 py-4 text-gray-400 text-sm truncate" style={{ maxWidth: 100 }}>{asset.serial_number || "—"}</td>
                    <td className="px-3 py-4 text-gray-400 text-sm truncate" style={{ maxWidth: 120 }}>{asset.status === "available" ? "" : (asset.assigned_user || "—")}</td>
                    <td className="px-3 py-4" style={{ maxWidth: 90 }}>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor[asset.status] || "bg-gray-500/20 text-gray-400"}`}>
                        {statusLabel(asset.status)}
                      </span>
                    </td>
                    <td className="px-3 py-4" style={{ maxWidth: 110 }}>
                      {!asset.warranty_expiry ? (
                        <div className="flex items-center gap-1">
                          <span className="text-sm">⚪</span>
                          <span className="text-gray-500 text-xs">None</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className="text-sm">{warrantyValid ? "🟢" : "🔴"}</span>
                          <div>
                            <span className={`text-xs font-medium ${warrantyValid ? "text-green-400" : "text-red-400"}`}>
                              {warrantyValid ? "Valid" : "Expired"}
                            </span>
                            <p className="text-gray-500 text-xs">{asset.warranty_expiry}</p>
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-4 text-gray-400 text-sm truncate" style={{ maxWidth: 90 }}>{asset.category || "—"}</td>
                    <td className="px-3 py-4" style={{ maxWidth: 100 }}>
                      <div className="flex gap-1.5">
                        {canEdit && !isGuest && (
                          <button onClick={(e) => { e.stopPropagation(); navigate(`/admin/edit-asset/${asset.id}`) }}
                            className="text-blue-400 hover:text-blue-300 text-sm px-3 py-1 rounded border border-blue-400/30 hover:border-blue-300 transition-all">
                            Edit
                          </button>
                        )}
                        {canDelete && !isGuest && (
                          <button onClick={(e) => { e.stopPropagation(); setDeleteModal(asset) }}
                            className="text-red-400 hover:text-red-300 text-sm px-3 py-1 rounded border border-red-400/30 hover:border-red-300 transition-all">
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
          <p className="text-gray-500 text-sm">{sorted.length} assets — Page {currentPage} of {totalPages}</p>
          <div className="flex gap-1">
            <button disabled={currentPage === 1} onClick={() => setCurrentPage(1)} className="px-2 py-1 rounded text-xs text-gray-400 hover:text-white disabled:opacity-30 border border-gray-700">«</button>
            <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="px-3 py-1 rounded text-xs text-gray-400 hover:text-white disabled:opacity-30 border border-gray-700">‹ Prev</button>
            {Array.from({length: Math.min(5, totalPages)}, (_, i) => {
              const page = Math.max(1, Math.min(currentPage - 2, totalPages - 4)) + i
              return page <= totalPages ? (
                <button key={page} onClick={() => setCurrentPage(page)}
                  className={`px-3 py-1 rounded text-xs border ${currentPage === page ? "bg-blue-600 text-white border-blue-500" : "text-gray-400 hover:text-white border-gray-700"}`}
                >{page}</button>
              ) : null
            })}
            <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="px-3 py-1 rounded text-xs text-gray-400 hover:text-white disabled:opacity-30 border border-gray-700">Next ›</button>
            <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)} className="px-2 py-1 rounded text-xs text-gray-400 hover:text-white disabled:opacity-30 border border-gray-700">»</button>
          </div>
        </div>
      )}

      {/* QR Label bulk print modal */}
      <AnimatePresence>
        {showLabelModal && selected.size > 0 && (
          <QRLabelModal
            assets={selectedAssets}
            assetUrlBase={`${window.location.origin}/admin/assets/`}
            onClose={() => setShowLabelModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
