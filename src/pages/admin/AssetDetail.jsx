import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"
import { useNavigate, useParams } from "react-router-dom"
import { useAuth } from "../../context/AuthContext"
import { QRCodeSVG } from "qrcode.react"
import { motion, AnimatePresence } from "framer-motion"
import { calcDepreciation, fmtSGD } from "../../lib/depreciation"
import { useTranslation } from "react-i18next"
import QRLabelModal from "../../components/QRLabelModal"
import { logHistory } from "../../lib/logHistory"
import { statusLabel } from "../../lib/statusLabel"
import { DEPARTMENTS } from "../../lib/departments"

// ── Asset Details field config (label + db column + input type) ─────────────
const DETAIL_FIELDS = [
  { key: "serial_number",   label: "Serial Number",   type: "text" },
  { key: "asset_tag",       label: "Asset Tag",       type: "text" },
  { key: "location",        label: "Location",        type: "text" },
  { key: "assigned_user",   label: "Assigned To",     type: "text" },
  { key: "department",      label: "Department",      type: "select" },
  { key: "purchase_date",   label: "Purchase Date",   type: "date" },
  { key: "purchase_price",  label: "Purchase Price",  type: "number" },
  { key: "warranty_expiry", label: "Warranty Expiry", type: "date" },
  { key: "remarks",         label: "Remarks",         type: "text" },
]

// ── Timeline config ──────────────────────────────────────────────────────────
const EVENT_CFG = {
  "Created":       { icon: "✅", color: "green",  label: "Registered" },
  "Updated":       { icon: "✏️", color: "blue",   label: "Details Updated" },
  "Borrowed":      { icon: "📤", color: "purple", label: "Borrowed" },
  "Returned":      { icon: "📥", color: "yellow", label: "Returned" },
  "Issue Reported":{ icon: "⚠️", color: "orange", label: "Issue Reported" },
  "Issue Resolved":{ icon: "🔧", color: "teal",   label: "Issue Resolved" },
  "Deleted":       { icon: "🗑️", color: "red",    label: "Deleted" },
}

const COLOR = {
  green:  { dot: "bg-green-500",  ring: "ring-green-500/40",  text: "text-green-400",  border: "border-green-500/30"  },
  blue:   { dot: "bg-blue-500",   ring: "ring-blue-500/40",   text: "text-blue-400",   border: "border-blue-500/30"   },
  purple: { dot: "bg-purple-500", ring: "ring-purple-500/40", text: "text-purple-400", border: "border-purple-500/30" },
  yellow: { dot: "bg-yellow-500", ring: "ring-yellow-500/40", text: "text-yellow-400", border: "border-yellow-500/30" },
  orange: { dot: "bg-orange-500", ring: "ring-orange-500/40", text: "text-orange-400", border: "border-orange-500/30" },
  teal:   { dot: "bg-teal-500",   ring: "ring-teal-500/40",   text: "text-teal-400",   border: "border-teal-500/30"   },
  red:    { dot: "bg-red-500",    ring: "ring-red-500/40",    text: "text-red-400",    border: "border-red-500/30"    },
  gray:   { dot: "bg-gray-500",   ring: "ring-gray-500/40",   text: "text-gray-400",   border: "border-gray-700"      },
}

// ── AssetTimeline ────────────────────────────────────────────────────────────
function AssetTimeline({ asset, history }) {
  // Build sorted event list
  const events = []

  if (asset.purchase_date) {
    events.push({
      id: "purchased",
      icon: "💰",
      color: "green",
      action: "Purchased",
      details: asset.purchase_price
        ? `Acquired for SGD ${Number(asset.purchase_price).toLocaleString()}`
        : "Asset acquired",
      created_at: asset.purchase_date + "T00:00:00.000Z",
      changed_by: null,
    })
  }

  history.forEach(h => {
    const cfg = EVENT_CFG[h.action] || { icon: "📝", color: "gray", label: h.action }
    events.push({
      id: h.id,
      icon: cfg.icon,
      color: cfg.color,
      action: cfg.label,
      details: h.details,
      created_at: h.created_at,
      changed_by: h.changed_by,
    })
  })

  events.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  if (events.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="bg-gray-900 rounded-xl border border-gray-800 p-6 mt-6"
    >
      <h2 className="text-white font-semibold mb-6 flex items-center gap-2">
        <span className="text-lg">🕐</span> Asset Timeline
      </h2>

      <div className="relative">
        {/* Vertical spine */}
        <div className="absolute left-[15px] top-4 bottom-4 w-px bg-gray-800" />

        <div className="space-y-3">
          {events.map((ev, i) => {
            const cc = COLOR[ev.color] || COLOR.gray
            const isLatest = i === events.length - 1
            return (
              <motion.div
                key={ev.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="relative flex gap-4"
              >
                {/* Dot */}
                <div className={`
                  relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0
                  ring-2 ${cc.ring}
                  ${isLatest ? cc.dot : "bg-gray-800 border border-gray-700"}
                  transition-all
                `}>
                  <span style={{ lineHeight: 1 }}>{ev.icon}</span>
                </div>

                {/* Card */}
                <div className={`flex-1 rounded-xl p-3 border mb-1 ${
                  isLatest
                    ? `bg-gray-800/60 ${cc.border}`
                    : "bg-gray-800/30 border-gray-800"
                }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className={`font-semibold text-sm ${isLatest ? cc.text : "text-white"}`}>
                        {ev.action}
                      </p>
                      {ev.details && (
                        <p className="text-gray-400 text-xs mt-0.5 leading-relaxed">{ev.details}</p>
                      )}
                      {ev.changed_by && (
                        <p className="text-gray-600 text-xs mt-1">by {ev.changed_by}</p>
                      )}
                    </div>
                    <p className="text-gray-600 text-xs whitespace-nowrap shrink-0 mt-0.5">
                      {new Date(ev.created_at).toLocaleDateString("en-SG", {
                        day: "numeric", month: "short", year: "numeric",
                      })}
                    </p>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 pt-4 border-t border-gray-800 flex flex-wrap gap-x-4 gap-y-1">
        {[
          { color: "green", label: "Purchased / Created" },
          { color: "purple", label: "Borrowed" },
          { color: "yellow", label: "Returned" },
          { color: "orange", label: "Issue" },
          { color: "blue", label: "Updated" },
        ].map(({ color, label }) => (
          <div key={color} className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${COLOR[color].dot}`} />
            <span className="text-gray-500 text-xs">{label}</span>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

// ── Photo Gallery ─────────────────────────────────────────────────────────────
function PhotoGallery({ assetId }) {
  const [photos, setPhotos] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const [lightbox, setLightbox] = useState(null)

  useEffect(() => { loadPhotos() }, [assetId])

  const loadPhotos = async () => {
    const { data } = await supabase.storage.from("asset-photos").list(assetId, {
      sortBy: { column: "created_at", order: "asc" },
    })
    if (!data) return
    const urls = await Promise.all(
      data.map(async (f) => {
        const { data: signed } = await supabase.storage
          .from("asset-photos")
          .createSignedUrl(`${assetId}/${f.name}`, 3600)
        return { name: f.name, url: signed?.signedUrl }
      })
    )
    setPhotos(urls.filter(p => p.url))
  }

  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    setUploadError("")
    const ext = file.name.split(".").pop()
    const path = `${assetId}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from("asset-photos").upload(path, file)
    if (error) {
      setUploadError(error.message || "Failed to upload photo.")
      setUploading(false)
      e.target.value = ""
      return
    }
    await loadPhotos()
    setUploading(false)
    e.target.value = ""
  }

  const handleDelete = async (name) => {
    await supabase.storage.from("asset-photos").remove([`${assetId}/${name}`])
    setPhotos(p => p.filter(x => x.name !== name))
    if (lightbox?.name === name) setLightbox(null)
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
      className="bg-gray-900 rounded-xl border border-gray-800 p-6 mt-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-semibold flex items-center gap-2">
          <span>📷</span> Photos {photos.length > 0 && <span className="text-gray-500 text-sm font-normal">({photos.length})</span>}
        </h2>
        <label className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
          style={{ background: "rgba(30,41,59,0.8)", border: "1px solid rgba(59,130,246,0.4)", color: "#60a5fa" }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(59,130,246,0.15)"}
          onMouseLeave={e => e.currentTarget.style.background = "rgba(30,41,59,0.8)"}>
          {uploading ? "⏳ Uploading..." : "📷 Add Photo"}
          <input type="file" accept="image/*" onChange={handleUpload} className="hidden" disabled={uploading} />
        </label>
      </div>

      <AnimatePresence>
        {uploadError && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="mb-4 bg-red-500/10 border border-red-500/40 rounded-lg p-2.5 flex items-center justify-between gap-2">
            <span className="text-red-400 text-xs font-medium flex items-center gap-2">❌ Upload failed: {uploadError}</span>
            <button onClick={() => setUploadError("")} className="text-red-400 hover:text-red-300 text-xs shrink-0">✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      {photos.length === 0 ? (
        <p className="text-gray-600 text-sm text-center py-6">No photos yet. Click "Add Photo" to upload.</p>
      ) : (
        <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
          {photos.map(p => (
            <div key={p.name} className="relative group aspect-square rounded-lg overflow-hidden border border-gray-800 cursor-pointer"
              onClick={() => setLightbox(p)}>
              <img src={p.url} alt="" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
              <button
                onClick={e => { e.stopPropagation(); handleDelete(p.name) }}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-600">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
            onClick={() => setLightbox(null)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="relative max-w-3xl max-h-[85vh]" onClick={e => e.stopPropagation()}>
              <img src={lightbox.url} alt="" className="max-w-full max-h-[80vh] rounded-xl object-contain" />
              <div className="absolute top-3 right-3 flex gap-2">
                <button onClick={() => handleDelete(lightbox.name)}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-all">
                  🗑 Delete
                </button>
                <button onClick={() => setLightbox(null)}
                  className="w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black transition-all">
                  ✕
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AssetDetail() {
  const { t } = useTranslation()
  const { isAdmin, isGlobalAdmin, isStandardUser, userProfile } = useAuth()
  const { id } = useParams()
  const navigate = useNavigate()
  const [asset, setAsset] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [showLabelModal, setShowLabelModal] = useState(false)
  const [timeline, setTimeline] = useState([])

  const [editingDetails, setEditingDetails] = useState(false)
  const [detailsForm, setDetailsForm] = useState({})
  const [savingDetails, setSavingDetails] = useState(false)
  const [detailsError, setDetailsError] = useState("")
  const [detailsSuccess, setDetailsSuccess] = useState(false)

  useEffect(() => { fetchAll() }, [id])

  const fetchAll = async () => {
    const [{ data: a }, { data: h }] = await Promise.all([
      supabase.from("assets").select("*").eq("id", id).single(),
      supabase.from("asset_history").select("*").eq("asset_id", id).order("created_at", { ascending: true }),
    ])
    setAsset(a)
    setHistory(h || [])
    setLoading(false)
    fetchTimeline(id)
  }

  const fetchTimeline = async (assetId) => {
    const [borrows, issues, maintenance, hist] = await Promise.all([
      supabase.from("borrow_history").select("*").eq("asset_id", assetId).order("borrowed_at", { ascending: false }),
      supabase.from("issues").select("*").eq("asset_id", assetId).order("created_at", { ascending: false }),
      supabase.from("maintenance_schedules").select("*").eq("asset_id", assetId).order("created_at", { ascending: false }),
      supabase.from("asset_history").select("*").eq("asset_id", assetId).order("created_at", { ascending: false }),
    ])
    const borrowEvents = (borrows.data || []).flatMap(b => {
      const events = [{ ...b, _type: "borrow", _event: "borrowed", _date: b.borrowed_at }]
      if (b.returned_at) events.push({ ...b, _type: "borrow", _event: "returned", _date: b.returned_at })
      return events
    })
    const items = [
      ...borrowEvents,
      ...(issues.data || []).map(i => ({ ...i, _type: "issue", _date: i.created_at })),
      ...(maintenance.data || []).map(m => ({ ...m, _type: "maintenance", _date: m.created_at })),
      ...(hist.data || []).map(h => ({ ...h, _type: "history", _date: h.created_at })),
    ].sort((a, b) => new Date(b._date) - new Date(a._date))
    setTimeline(items)
  }

  const startEditDetails = () => {
    setDetailsForm({
      serial_number: asset.serial_number || "",
      asset_tag: asset.asset_tag || "",
      location: asset.location || "",
      assigned_user: asset.assigned_user || "",
      department: asset.department || "",
      purchase_date: asset.purchase_date || "",
      purchase_price: asset.purchase_price || "",
      warranty_expiry: asset.warranty_expiry || "",
      remarks: asset.remarks || "",
    })
    setDetailsError("")
    setEditingDetails(true)
  }

  const cancelEditDetails = () => {
    setEditingDetails(false)
    setDetailsError("")
  }

  const handleSaveDetails = async () => {
    setSavingDetails(true)
    setDetailsError("")
    const cleanForm = {
      serial_number: detailsForm.serial_number.trim() || null,
      asset_tag: detailsForm.asset_tag.trim() || null,
      location: detailsForm.location.trim() || null,
      assigned_user: detailsForm.assigned_user.trim() || null,
      department: detailsForm.department.trim() || null,
      purchase_date: detailsForm.purchase_date || null,
      purchase_price: detailsForm.purchase_price ? parseFloat(detailsForm.purchase_price) : null,
      warranty_expiry: detailsForm.warranty_expiry || null,
      remarks: detailsForm.remarks.trim() || null,
    }
    const { error } = await supabase.from("assets").update(cleanForm).eq("id", id)
    if (error) {
      const msg = error.message || ""
      if (msg.includes("serial_number")) {
        setDetailsError(`Serial number "${detailsForm.serial_number}" already exists on another asset.`)
      } else if (msg.includes("asset_tag")) {
        setDetailsError(`Asset tag "${detailsForm.asset_tag}" already exists on another asset.`)
      } else {
        setDetailsError(msg || "Failed to save changes.")
      }
      setSavingDetails(false)
      return
    }
    await logHistory(id, "Updated", `Asset "${asset.name}" details were updated`, userProfile?.name || userProfile?.email)
    await fetchAll()
    setEditingDetails(false)
    setSavingDetails(false)
    setDetailsSuccess(true)
    setTimeout(() => setDetailsSuccess(false), 3000)
  }

  const statusColor = {
    available:   "bg-green-500/20 text-green-400",
    assigned:    "bg-blue-500/20 text-blue-400",
    borrowed:    "bg-purple-500/20 text-purple-400",
    maintenance: "bg-yellow-500/20 text-yellow-400",
    retired:     "bg-red-500/20 text-red-400",
  }

  if (loading) return <div className="p-8 text-white">{t("loading")}</div>
  if (!asset)  return <div className="p-8 text-white">Asset not found</div>

  const assetUrl = `${window.location.origin}/admin/assets/${id}`

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <button
        onClick={() => navigate("/admin/assets")}
        className="text-gray-400 hover:text-white mb-6 transition-all block"
      >
        {t("backToAssets")}
      </button>

      {/* Title row */}
      <div className="flex items-start justify-between mb-8 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">{asset.name}</h1>
          <p className="text-gray-400 mt-1">{asset.category} — {asset.brand_model || "N/A"}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {asset.status === "borrowed" && asset.assigned_user && (
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-purple-500/20 text-purple-400 border border-purple-500/30">
              🔄 Borrowed by {asset.assigned_user}
            </span>
          )}
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColor[asset.status] || "bg-gray-500/20 text-gray-400"}`}>
            {statusLabel(asset.status)}
          </span>
        </div>
      </div>

      {/* Depreciation Card */}
      {(() => {
        const dep = calcDepreciation(asset.purchase_price, asset.purchase_date, asset.useful_life)
        if (!dep) return (
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-6 flex items-center gap-3">
            <span className="text-2xl">📉</span>
            <div>
              <p className="text-white font-semibold">{t("depreciation")}</p>
              <p className="text-gray-500 text-sm">{t("noPriceData")}</p>
            </div>
          </div>
        )
        const barColor = dep.fullyDepreciated
          ? "bg-red-500"
          : dep.percentRemaining > 60 ? "bg-green-500"
          : dep.percentRemaining > 30 ? "bg-yellow-500"
          : "bg-orange-500"
        return (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="bg-gray-900 rounded-xl border border-gray-800 p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">📉</span>
                <h2 className="text-white font-semibold">{t("depreciation")}</h2>
                <span className="text-gray-500 text-xs">({t("straightLine5yr")})</span>
              </div>
              {dep.fullyDepreciated && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                  {t("fullyDepreciated")}
                </span>
              )}
            </div>
            <div className="mb-4">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>{t("remainingValueLabel")}</span>
                <span>{dep.percentRemaining}%</span>
              </div>
              <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${dep.percentRemaining}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className={`h-full rounded-full ${barColor}`} />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: t("originalPrice"),      value: fmtSGD(dep.originalPrice) },
                { label: t("currentValue"),        value: fmtSGD(dep.currentValue), sub: dep.fullyDepreciated ? t("fullyWrittenOff") : null, hl: true },
                { label: t("depreciationPerYear"), value: fmtSGD(dep.perYear) },
                { label: t("percentDepreciated"),  value: `${dep.percentDepreciated}%`, sub: `${dep.yearsOld}yr old` },
              ].map(s => (
                <div key={s.label} className="bg-gray-800/60 rounded-lg p-3">
                  <p className="text-gray-500 text-xs mb-1">{s.label}</p>
                  <p className={`font-semibold text-sm ${s.hl ? "text-blue-400" : "text-white"}`}>{s.value}</p>
                  {s.sub && <p className="text-gray-600 text-xs mt-0.5">{s.sub}</p>}
                </div>
              ))}
            </div>
          </motion.div>
        )
      })()}

      {/* Details + QR grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Asset Details */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold">{t("assetDetails")}</h2>
            {!editingDetails && (isAdmin || isGlobalAdmin || isStandardUser) && (
              <button
                onClick={startEditDetails}
                className="text-blue-400 hover:text-blue-300 text-sm font-medium flex items-center gap-1"
              >
                ✏️ Edit Details
              </button>
            )}
          </div>

          <AnimatePresence>
            {detailsSuccess && (
              <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                className="mb-3 bg-green-500/10 border border-green-500/40 rounded-lg p-2.5 flex items-center gap-2">
                <span>✅</span>
                <p className="text-green-400 text-xs font-medium">Asset details saved successfully.</p>
              </motion.div>
            )}
            {detailsError && (
              <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                className="mb-3 bg-red-500/10 border border-red-500/40 rounded-lg p-2.5 flex items-center gap-2">
                <span>❌</span>
                <p className="text-red-400 text-xs font-medium">{detailsError}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {editingDetails ? (
            <div className="space-y-3">
              {DETAIL_FIELDS.map(({ key, label, type }) => (
                <div key={key} className="flex items-center justify-between gap-3">
                  <label className="text-gray-500 text-sm shrink-0">{label}</label>
                  {type === "select" ? (
                    <select
                      value={detailsForm[key] ?? ""}
                      onChange={e => setDetailsForm(f => ({ ...f, [key]: e.target.value }))}
                      className="flex-1 min-w-0 bg-gray-800 text-white text-sm text-right rounded-lg px-3 py-1.5 border border-gray-700 focus:border-blue-500 focus:outline-none"
                    >
                      <option value="">Select department…</option>
                      {DEPARTMENTS.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={type}
                      step={type === "number" ? "0.01" : undefined}
                      value={detailsForm[key] ?? ""}
                      onChange={e => setDetailsForm(f => ({ ...f, [key]: e.target.value }))}
                      className="flex-1 min-w-0 bg-gray-800 text-white text-sm text-right rounded-lg px-3 py-1.5 border border-gray-700 focus:border-blue-500 focus:outline-none"
                    />
                  )}
                </div>
              ))}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSaveDetails}
                  disabled={savingDetails}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all"
                >
                  {savingDetails ? "Saving…" : "💾 Save"}
                </button>
                <button
                  onClick={cancelEditDetails}
                  disabled={savingDetails}
                  className="text-gray-400 hover:text-white px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {[
                { label: "Serial Number",  value: asset.serial_number },
                { label: "Asset Tag",      value: asset.asset_tag },
                { label: "Location",       value: asset.location },
                { label: "Assigned To",    value: asset.assigned_user },
                { label: "Department",     value: asset.department },
                { label: "Purchase Date",  value: asset.purchase_date },
                { label: "Purchase Price", value: asset.purchase_price ? `SGD ${Number(asset.purchase_price).toLocaleString()}` : null },
                { label: "Warranty Expiry",value: asset.warranty_expiry },
                { label: "Remarks",        value: asset.remarks },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between gap-2">
                  <span className="text-gray-500 text-sm shrink-0">{label}</span>
                  <span className="text-white text-sm text-right">{value || "—"}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* QR Code */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 flex flex-col items-center">
          <h2 className="text-white font-semibold mb-4">{t("qrCode")}</h2>
          <div className="bg-white p-4 rounded-xl">
            <QRCodeSVG value={assetUrl} size={180} level="H" />
          </div>
          <p className="text-gray-500 text-xs mt-3 text-center">{t("scanToView")}</p>

          {/* Print QR Label — admin and standard users only */}
          {(isAdmin || isGlobalAdmin || isStandardUser) && (
            <div className="mt-4 flex gap-2 w-full">
              <motion.button
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={() => setShowLabelModal(true)}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-1.5"
                style={{ boxShadow: "0 0 16px rgba(59,130,246,0.35)" }}
              >
                🏷️ Print QR Label
              </motion.button>
            </div>
          )}

          {/* Asset ID */}
          <p className="text-gray-700 text-xs mt-3 font-mono truncate w-full text-center">{id}</p>
        </div>
      </div>

      {/* Photo Gallery */}
      <PhotoGallery assetId={id} />

      {/* Asset Timeline */}
      <AssetTimeline asset={asset} history={history} />

      {/* Full Activity Timeline */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-gray-900 rounded-xl border border-gray-800 p-6 mt-6"
      >
        <h2 className="text-white font-semibold mb-6 flex items-center gap-2">
          <span className="text-lg">📋</span> Full Activity Timeline
        </h2>
        <div className="space-y-0">
          {timeline.map((item, idx) => (
            <div key={idx} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm bg-gray-800 border border-gray-700 shrink-0">
                  {item._type === "borrow" ? (item._event === "returned" ? "📥" : "📤") : item._type === "issue" ? "🔧" : item._type === "maintenance" ? "🔨" : "📋"}
                </div>
                {idx < timeline.length - 1 && <div className="w-px flex-1 bg-gray-800 my-1" />}
              </div>
              <div className="pb-4 flex-1">
                <p className={`text-sm font-medium ${
                  item._type === "borrow" ? (item._event === "returned" ? "text-green-400" : "text-blue-400") :
                  item._type === "issue" ? "text-orange-400" :
                  item._type === "maintenance" ? "text-yellow-400" :
                  "text-gray-300"
                }`}>
                  {item._type === "borrow"
                    ? (item._event === "returned"
                        ? `Returned by ${item.borrower_name || item.signed_off_by || item.borrower_email || "Unknown"}`
                        : `Borrowed by ${item.borrower_name || item.signed_off_by || item.borrower_email || "Unknown"}`)
                    : item._type === "issue"
                    ? `Issue Reported: ${item.title || item.description || "—"}`
                    : item._type === "maintenance"
                    ? `Maintenance Scheduled: ${item.description || item.maintenance_type || item.type || "—"}`
                    : item.action || "Status changed"}
                </p>
                {(item.status) && (
                  <p className="text-gray-500 text-xs mt-0.5">Status: {item.status}</p>
                )}
                <p className="text-gray-600 text-xs mt-0.5">
                  {new Date(item._date).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          ))}
          {timeline.length === 0 && <p className="text-gray-500 text-sm py-4">No history yet</p>}
        </div>
      </motion.div>

      {/* QR Label Modal */}
      <AnimatePresence>
        {showLabelModal && (
          <QRLabelModal
            assets={[asset]}
            assetUrlBase={`${window.location.origin}/admin/assets/`}
            onClose={() => setShowLabelModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
