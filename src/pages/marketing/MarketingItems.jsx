import { useState, useEffect, useRef } from "react"
import { useSearchParams } from "react-router-dom"
import { supabase } from "../../lib/supabase"
import { useAuth } from "../../context/AuthContext"
import { motion, AnimatePresence } from "framer-motion"
import * as XLSX from "xlsx"
import { QRCodeSVG } from "qrcode.react"

const C = {
  accent: "#06b6d4", teal: "#14b8a6",
  card: "rgba(6,182,212,0.06)", border: "rgba(6,182,212,0.18)",
  text: "#ffffff", sub: "#94a3b8",
  success: "#10b981", warning: "#f59e0b", error: "#ef4444",
}

const CATEGORIES = ["Gift", "Banner", "Brochure", "Stationery", "Electronics", "Apparel", "Acrylic Stand", "Google Review Gift", "Other"]
const UNITS = ["pcs", "boxes", "sets", "rolls", "pairs", "cartons"]

const catColors = {
  Gift: "rgba(236,72,153,0.15)|#f472b6|rgba(236,72,153,0.3)",
  Banner: "rgba(245,158,11,0.15)|#fbbf24|rgba(245,158,11,0.3)",
  Brochure: "rgba(59,130,246,0.15)|#60a5fa|rgba(59,130,246,0.3)",
  Stationery: "rgba(167,139,250,0.15)|#a78bfa|rgba(167,139,250,0.3)",
  Electronics: "rgba(6,182,212,0.15)|#22d3ee|rgba(6,182,212,0.3)",
  Apparel: "rgba(16,185,129,0.15)|#34d399|rgba(16,185,129,0.3)",
  "Acrylic Stand": "rgba(245,158,11,0.15)|#fb923c|rgba(245,158,11,0.3)",
  "Google Review Gift": "rgba(239,68,68,0.15)|#f87171|rgba(239,68,68,0.3)",
  Other: "rgba(148,163,184,0.15)|#94a3b8|rgba(148,163,184,0.3)",
}

function catBadge(cat) {
  const [bg, color, border] = (catColors[cat] || catColors.Other).split("|")
  return { background: bg, color, border: `1px solid ${border}` }
}

function StatusBadge({ qty, min }) {
  if (qty <= 0) return <span style={{ background: "rgba(239,68,68,0.15)", color: C.error, border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", padding: "2px 8px", fontSize: "13px", fontWeight: "600" }}>🔴 Out of Stock</span>
  if (qty <= min && min > 0) return <span style={{ background: "rgba(245,158,11,0.15)", color: C.warning, border: "1px solid rgba(245,158,11,0.3)", borderRadius: "8px", padding: "2px 8px", fontSize: "13px", fontWeight: "600" }}>🟡 Low Stock</span>
  return <span style={{ background: "rgba(16,185,129,0.15)", color: C.success, border: "1px solid rgba(16,185,129,0.3)", borderRadius: "8px", padding: "2px 8px", fontSize: "13px", fontWeight: "600" }}>🟢 In Stock</span>
}

// Photos for marketing items reuse the IT system's "asset-photos" storage bucket,
// namespaced under a "marketing/<itemId>" folder so they never collide with real
// asset IDs. Mirrors PhotoGallery in src/pages/admin/AssetDetail.jsx.
function ItemPhotoGallery({ itemId, isAdmin }) {
  const [photos, setPhotos] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const [lightbox, setLightbox] = useState(null)
  const folder = `marketing/${itemId}`

  const loadPhotos = async () => {
    const { data } = await supabase.storage.from("asset-photos").list(folder, {
      sortBy: { column: "created_at", order: "asc" },
    })
    if (!data) return
    const urls = await Promise.all(
      data.map(async (f) => {
        const { data: signed } = await supabase.storage
          .from("asset-photos")
          .createSignedUrl(`${folder}/${f.name}`, 3600)
        return { name: f.name, url: signed?.signedUrl }
      })
    )
    setPhotos(urls.filter(p => p.url))
  }

  // itemId never changes within this component's lifetime — the modal fully
  // unmounts/remounts (via AnimatePresence) whenever a different item is viewed.
  useEffect(() => { loadPhotos() }, [])

  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    setUploadError("")
    const ext = file.name.split(".").pop()
    const path = `${folder}/${Date.now()}.${ext}`
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
    await supabase.storage.from("asset-photos").remove([`${folder}/${name}`])
    setPhotos(p => p.filter(x => x.name !== name))
    if (lightbox?.name === name) setLightbox(null)
  }

  return (
    <div style={{ marginBottom: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
        <p style={{ color: C.sub, fontSize: "12px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.4px" }}>
          📷 Photos {photos.length > 0 && `(${photos.length})`}
        </p>
        {isAdmin && (
          <label style={{ cursor: uploading ? "default" : "pointer", display: "flex", alignItems: "center", gap: "6px", padding: "5px 12px", borderRadius: "7px", fontSize: "13px", fontWeight: "600", background: "rgba(6,182,212,0.1)", border: `1px solid ${C.border}`, color: C.accent }}>
            {uploading ? "⏳ Uploading..." : "📷 Add Photo"}
            <input type="file" accept="image/*" onChange={handleUpload} disabled={uploading} style={{ display: "none" }} />
          </label>
        )}
      </div>

      {uploadError && (
        <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", padding: "8px 12px", marginBottom: "10px", color: C.error, fontSize: "13px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
          <span>❌ {uploadError}</span>
          <button onClick={() => setUploadError("")} style={{ color: C.error, background: "none", border: "none", cursor: "pointer", fontSize: "13px", flexShrink: 0 }}>✕</button>
        </div>
      )}

      {photos.length === 0 ? (
        <p style={{ color: C.sub, fontSize: "13px", textAlign: "center", padding: "16px 0" }}>
          No photos yet.{isAdmin && " Click \"Add Photo\" to upload."}
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
          {photos.map(p => (
            <div key={p.name} onClick={() => setLightbox(p)}
              style={{ position: "relative", aspectRatio: "1", borderRadius: "8px", overflow: "hidden", border: `1px solid ${C.border}`, cursor: "pointer" }}>
              <img src={p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              {isAdmin && (
                <button onClick={e => { e.stopPropagation(); handleDelete(p.name) }}
                  style={{ position: "absolute", top: "3px", right: "3px", width: "18px", height: "18px", borderRadius: "50%", background: "rgba(0,0,0,0.7)", color: "#fff", border: "none", fontSize: "11px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {lightbox && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
            onClick={() => setLightbox(null)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              style={{ position: "relative", maxWidth: "90vw", maxHeight: "85vh" }} onClick={e => e.stopPropagation()}>
              <img src={lightbox.url} alt="" style={{ maxWidth: "90vw", maxHeight: "80vh", borderRadius: "12px", objectFit: "contain" }} />
              <div style={{ position: "absolute", top: "10px", right: "10px", display: "flex", gap: "8px" }}>
                {isAdmin && (
                  <button onClick={() => handleDelete(lightbox.name)}
                    style={{ padding: "6px 12px", background: "#dc2626", color: "#fff", fontSize: "13px", borderRadius: "8px", border: "none", cursor: "pointer" }}>
                    🗑 Delete
                  </button>
                )}
                <button onClick={() => setLightbox(null)}
                  style={{ width: "32px", height: "32px", borderRadius: "50%", background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", cursor: "pointer" }}>
                  ✕
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function MarketingItems() {
  const { userProfile, canManageMarketing, marketingRole, role } = useAuth()
  const isAdmin = canManageMarketing
  const showCost = ["marketing_admin", "marketing_manager"].includes(marketingRole) || role === "admin"

  const [items, setItems] = useState([])
  const [variants, setVariants] = useState([])
  const [stock, setStock] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filterCat, setFilterCat] = useState("All")
  const [filterStatus, setFilterStatus] = useState("All")
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)
  const [detailItem, setDetailItem] = useState(null)
  const [editingItemId, setEditingItemId] = useState(null)
  const detailQrRef = useRef(null)
  const [searchParams] = useSearchParams()
  const autoOpenedRef = useRef(false)
  const [form, setForm] = useState({ name: "", category: "", description: "", item_code: "", unit: "pcs", cost_per_unit: "", delivery_charge: "", tax_amount: "", total_cost: "", is_free_from_vendor: false, supplier_name: "", minimum_stock_level: 0, expiry_date: "" })
  const [formVariants, setFormVariants] = useState([{ variant_name: "", color: "", size: "" }])

  const fileInputRef = useRef(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importRows, setImportRows] = useState([])
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState(null)

  useEffect(() => { fetchAll() }, [])

  // Deep-link from a scanned QR code: /marketing/items?item=<id> opens that item's
  // detail modal automatically. Only auto-opens once so closing the modal sticks.
  useEffect(() => {
    if (autoOpenedRef.current) return
    const itemParam = searchParams.get("item")
    if (!itemParam || items.length === 0) return
    const found = items.find(it => it.id === itemParam)
    if (!found) return
    autoOpenedRef.current = true
    setDetailItem(found)
  }, [searchParams, items])

  const itemQrUrl = (id) => `${window.location.origin}/marketing/items?item=${id}`
  const itemDisplayId = (item) => item.item_code || item.id.slice(0, 8)

  const handlePrintItemLabel = () => {
    if (!editingItemId) return
    const printItem = { id: editingItemId, item_code: form.item_code }
    const svgEl = detailQrRef.current?.querySelector("svg")
    const svgStr = svgEl ? new XMLSerializer().serializeToString(svgEl) : ""
    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>QR Label — ${form.name}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#fff; font-family:-apple-system,'Helvetica Neue',Arial,sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; }
  .label { width:85mm; height:54mm; border:1px solid #d1d5db; border-radius:2mm; display:flex; flex-direction:column; padding:4mm; box-sizing:border-box; }
  .name { font-size:11pt; font-weight:800; color:#111; margin-bottom:1.5mm; word-break:break-word; }
  .id { font-size:7pt; color:#6b7280; font-family:monospace; }
  .qr-row { flex:1; display:flex; align-items:center; justify-content:center; }
  .caption { font-size:6pt; color:#6b7280; text-align:center; }
  @media print { @page { margin:5mm; } body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style></head>
<body>
  <div class="label">
    <div class="name">${form.name}</div>
    <div class="id">ID: ${itemDisplayId(printItem)}</div>
    <div class="qr-row">${svgStr}</div>
    <div class="caption">Scan for item details · Trainocate Marketing</div>
  </div>
  <script>window.onload=function(){window.print()}</script>
</body></html>`
    const win = window.open("", "_blank", "width=500,height=400")
    if (!win) { alert("Please allow pop-ups to print the label."); return }
    win.document.write(html)
    win.document.close()
  }

  const fetchAll = async () => {
    setLoading(true)
    const [{ data: i }, { data: v }, { data: s }, { data: l }] = await Promise.all([
      supabase.from("marketing_items").select("*").order("created_at", { ascending: false }),
      supabase.from("marketing_item_variants").select("*"),
      supabase.from("marketing_stock").select("*"),
      supabase.from("marketing_locations").select("*"),
    ])
    setItems(i || [])
    setVariants(v || [])
    setStock(s || [])
    setLocations(l || [])
    setLoading(false)
  }

  const getItemStock = (itemId) =>
    (stock || []).filter(s => s.item_id === itemId).reduce((sum, s) => sum + (s.quantity || 0), 0)

  const getItemVariants = (itemId) =>
    (variants || []).filter(v => v.item_id === itemId)

  const getStockByLocation = (itemId) => {
    const byLoc = {}
    stock.filter(s => s.item_id === itemId).forEach(s => {
      const loc = locations.find(l => l.id === s.location_id)
      if (loc) byLoc[loc.name] = (byLoc[loc.name] || 0) + s.quantity
    })
    return byLoc
  }

  const autoCalcTotal = (f) => {
    const cost = parseFloat(f.cost_per_unit) || 0
    const del = parseFloat(f.delivery_charge) || 0
    const tax = parseFloat(f.tax_amount) || 0
    return (cost + del + tax).toFixed(2)
  }

  const handleFormChange = (key, val) => {
    const updated = { ...form, [key]: val }
    if (["cost_per_unit", "delivery_charge", "tax_amount"].includes(key)) {
      updated.total_cost = autoCalcTotal(updated)
    }
    setForm(updated)
  }

  const resetForm = () => {
    setForm({ name: "", category: "", description: "", item_code: "", unit: "pcs", cost_per_unit: "", delivery_charge: "", tax_amount: "", total_cost: "", is_free_from_vendor: false, supplier_name: "", minimum_stock_level: 0, expiry_date: "" })
    setFormVariants([{ variant_name: "", color: "", size: "" }])
    setSaveError(null)
    setEditingItemId(null)
  }

  const openEditModal = (item) => {
    const itemVariants = getItemVariants(item.id)
    setForm({
      name: item.name || "", category: item.category || "", description: item.description || "",
      item_code: item.item_code || "", unit: item.unit || "pcs",
      cost_per_unit: item.cost_per_unit ?? "", delivery_charge: item.delivery_charge ?? "",
      tax_amount: item.tax_amount ?? "", total_cost: item.total_cost ?? "",
      is_free_from_vendor: item.is_free_from_vendor || false, supplier_name: item.supplier_name || "",
      minimum_stock_level: item.minimum_stock_level || 0, expiry_date: item.expiry_date || "",
    })
    setFormVariants(itemVariants.length > 0
      ? itemVariants.map(v => ({ variant_name: v.variant_name || "", color: v.color || "", size: v.size || "" }))
      : [{ variant_name: "", color: "", size: "" }])
    setSaveError(null)
    setEditingItemId(item.id)
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    setSaveError(null)

    const payload = {
      name: form.name.trim(),
      category: form.category || null,
      description: form.description || null,
      item_code: form.item_code || null,
      unit: form.unit,
      cost_per_unit: parseFloat(form.cost_per_unit) || null,
      delivery_charge: parseFloat(form.delivery_charge) || null,
      tax_amount: parseFloat(form.tax_amount) || null,
      total_cost: parseFloat(form.total_cost) || null,
      is_free_from_vendor: form.is_free_from_vendor,
      supplier_name: form.supplier_name || null,
      minimum_stock_level: parseInt(form.minimum_stock_level) || 0,
      expiry_date: form.expiry_date || null,
    }

    // 1. Insert or update the item
    let item
    if (editingItemId) {
      const { data, error: itemError } = await supabase
        .from("marketing_items")
        .update(payload)
        .eq("id", editingItemId)
        .select()
        .single()
      if (itemError) {
        setSaving(false)
        setSaveError(`Could not save item: ${itemError.message}`)
        return
      }
      item = data
      // Replace variants wholesale — simpler and consistent with the create flow
      // rather than diffing which variants changed.
      const { error: delErr } = await supabase.from("marketing_item_variants").delete().eq("item_id", editingItemId)
      if (delErr) console.error("Variants clear error:", delErr.message)
    } else {
      const { data, error: itemError } = await supabase
        .from("marketing_items")
        .insert(payload)
        .select()
        .single()
      if (itemError) {
        setSaving(false)
        setSaveError(`Could not save item: ${itemError.message}`)
        return
      }
      item = data
    }

    // 2. Save variants (skip blank ones)
    const validVariants = formVariants.filter(v => v.variant_name.trim())
    if (validVariants.length > 0) {
      const { error: varErr } = await supabase
        .from("marketing_item_variants")
        .insert(validVariants.map(v => ({ item_id: item.id, variant_name: v.variant_name.trim(), color: v.color || null, size: v.size || null })))
      if (varErr) console.error("Variants save error:", varErr.message)
    }

    // 3. Initialize stock at 0 for every location so the item appears in stock views
    //    (new items only — an existing item's stock is managed via Stock In/Out)
    if (!editingItemId && locations.length > 0) {
      const { error: stockErr } = await supabase
        .from("marketing_stock")
        .insert(locations.map(loc => ({ item_id: item.id, location_id: loc.id, quantity: 0 })))
      if (stockErr) console.error("Stock init error:", stockErr.message)
    }

    const wasEdit = !!editingItemId
    setSaving(false)
    setShowModal(false)
    resetForm()
    setSuccessMsg(wasEdit ? `✅ "${item.name}" updated successfully!` : `✅ "${item.name}" added successfully!`)
    setTimeout(() => setSuccessMsg(null), 7000)
    if (userProfile?.id) {
      await supabase.from("marketing_notifications").insert({
        user_id: userProfile.id,
        title: wasEdit ? "Item Updated ✏️" : "Item Added 📦",
        message: wasEdit ? `${item.name} was updated` : `${item.name} has been added to inventory`,
        type: wasEdit ? "item_updated" : "item_added",
        is_read: false,
      })
    }
    if (detailItem?.id === item.id) setDetailItem(item)
    fetchAll()
  }

  const handleDownloadTemplate = () => {
    const headers = ["name", "category", "item_code", "unit", "description", "supplier_name", "minimum_stock", "expiry_date", "cost_per_unit", "delivery", "tax"]
    const exampleRow = ["Cloud Pillow", "Gift", "PC001", "pcs", "Branded cloud pillow for events", "ABC Gifts", 30, "", 4.99, 0, 0]
    const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Items")
    XLSX.writeFile(wb, "marketing_items_import_template.xlsx")
  }

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setImportError(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: "array" })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" })
      if (rows.length === 0) {
        setImportError("No rows found in the first sheet of this file.")
        setImportRows([])
      } else {
        const get = (row, ...keys) => {
          for (const k of keys) {
            const found = Object.keys(row).find(rk => rk.trim().toLowerCase() === k)
            if (found && String(row[found]).trim() !== "") return row[found]
          }
          return ""
        }
        setImportRows(rows.map(r => ({
          name: String(get(r, "name")).trim(),
          description: String(get(r, "description")).trim(),
          category: String(get(r, "category")).trim(),
          unit: String(get(r, "unit")).trim() || "pcs",
          minimum_stock: parseInt(get(r, "minimum_stock", "minimum_stock_level")) || 0,
          item_code: String(get(r, "item_code")).trim(),
          supplier: String(get(r, "supplier_name")).trim(),
          expiry_date: String(get(r, "expiry_date")).trim(),
          cost_per_unit: parseFloat(get(r, "cost_per_unit")) || 0,
          delivery: parseFloat(get(r, "delivery")) || 0,
          tax: parseFloat(get(r, "tax")) || 0,
        })))
      }
    } catch (err) {
      setImportError(`Could not read file: ${err.message}`)
      setImportRows([])
    }
    setShowImportModal(true)
  }

  const handleConfirmImport = async () => {
    const validRows = importRows.filter(r => r.name)
    setImporting(true)
    let successCount = 0
    let failCount = 0
    const insertedItems = []

    for (const row of validRows) {
      const { data, error } = await supabase
        .from("marketing_items")
        .insert({
          name: row.name,
          description: row.description || null,
          category: row.category || null,
          unit: row.unit || "pcs",
          minimum_stock_level: row.minimum_stock || 0,
          item_code: row.item_code || null,
          supplier_name: row.supplier || null,
          expiry_date: row.expiry_date || null,
          cost_per_unit: row.cost_per_unit || null,
          delivery_charge: row.delivery || null,
          tax_amount: row.tax || null,
        })
        .select()
        .single()
      if (error) failCount++
      else { successCount++; insertedItems.push(data) }
    }
    failCount += importRows.length - validRows.length

    if (locations.length > 0 && insertedItems.length > 0) {
      const stockRows = []
      insertedItems.forEach(item => locations.forEach(loc => stockRows.push({ item_id: item.id, location_id: loc.id, quantity: 0 })))
      await supabase.from("marketing_stock").insert(stockRows)
    }

    setImporting(false)
    setShowImportModal(false)
    setImportRows([])
    setSuccessMsg(`✅ Import complete: ${successCount} added${failCount > 0 ? `, ${failCount} failed` : ""}`)
    setTimeout(() => setSuccessMsg(null), 7000)
    fetchAll()
  }

  const itemCategories = [...new Set(items.map(i => i.category).filter(Boolean))].sort((a, b) => {
    if (a === "Other") return 1
    if (b === "Other") return -1
    return a.localeCompare(b)
  })

  const filtered = items.filter(item => {
    const qty = getItemStock(item.id)
    const min = item.minimum_stock_level || 0
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase()) || (item.item_code || "").toLowerCase().includes(search.toLowerCase())
    const matchCat = filterCat === "All" || item.category === filterCat
    const statusStr = qty <= 0 ? "Out of Stock" : (qty <= min && min > 0) ? "Low Stock" : "In Stock"
    const matchStatus = filterStatus === "All" || statusStr === filterStatus
    return matchSearch && matchCat && matchStatus
  }).sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div style={{ padding: "24px" }}>
      {/* Success toast */}
      <AnimatePresence>
        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            style={{ position: "fixed", top: "72px", left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: "rgba(16,185,129,0.95)", color: "#fff", borderRadius: "12px", padding: "12px 24px", fontSize: "16px", fontWeight: "600", boxShadow: "0 8px 30px rgba(0,0,0,0.3)", whiteSpace: "nowrap" }}
          >
            {successMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ color: C.text, fontSize: "24px", fontWeight: "800", marginBottom: "4px" }}>📦 Marketing Items</h1>
          <p style={{ color: C.sub, fontSize: "15px" }}>{items.length} items tracked</p>
        </div>
        {isAdmin && (
          <div style={{ display: "flex", gap: "10px" }}>
            <input
              ref={fileInputRef} type="file" accept=".xlsx"
              onChange={handleImportFile} style={{ display: "none" }}
            />
            <button
              onClick={handleDownloadTemplate}
              style={{ background: "rgba(6,182,212,0.1)", color: C.accent, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "10px 18px", fontWeight: "600", fontSize: "15px", cursor: "pointer" }}
            >
              📄 Download Template
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{ background: "rgba(6,182,212,0.1)", color: C.accent, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "10px 18px", fontWeight: "600", fontSize: "15px", cursor: "pointer" }}
            >
              📥 Import Items
            </button>
            <button
              onClick={() => { resetForm(); setShowModal(true) }}
              style={{ background: `linear-gradient(135deg, ${C.accent}, ${C.teal})`, color: "#fff", border: "none", borderRadius: "10px", padding: "10px 18px", fontWeight: "600", fontSize: "15px", cursor: "pointer" }}
            >
              + Add New Item
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or code..."
          style={{ flex: "1 1 200px", background: "rgba(6,182,212,0.06)", color: C.text, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "9px 14px", fontSize: "15px", outline: "none" }}
        />
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
          style={{ background: "#0f2730", color: C.text, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "9px 14px", fontSize: "15px" }}>
          <option value="All">Category</option>
          {itemCategories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ background: "#0f2730", color: C.text, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "9px 14px", fontSize: "15px" }}>
          {["All", "In Stock", "Low Stock", "Out of Stock"].map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* Items Table */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
          <p style={{ color: C.sub }}>Loading items...</p>
        </div>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "16px", overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {["Item Name", "Category", "Item Code", "Total Stock", "Min Level", "Status", "Actions"].map(h => (
                    <th key={h} style={{ color: C.sub, textAlign: "left", padding: "12px 16px", fontSize: "12px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.4px", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => {
                  const qty = getItemStock(item.id)
                  const min = item.minimum_stock_level || 0
                  return (
                    <tr
                      key={item.id}
                      onClick={() => setDetailItem(item)}
                      style={{ borderBottom: "1px solid rgba(6,182,212,0.08)", cursor: "pointer", transition: "background 0.15s" }}
                      onMouseEnter={e => { e.currentTarget.style.background = "rgba(6,182,212,0.06)" }}
                      onMouseLeave={e => { e.currentTarget.style.background = "transparent" }}
                    >
                      <td style={{ padding: "12px 16px" }}>
                        <p style={{ color: C.text, fontWeight: "600", fontSize: "15px" }}>{item.name}</p>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        {item.category
                          ? <span style={{ ...catBadge(item.category), borderRadius: "8px", padding: "2px 8px", fontSize: "13px", fontWeight: "600" }}>{item.category}</span>
                          : <span style={{ color: C.sub, fontSize: "14px" }}>—</span>}
                      </td>
                      <td style={{ padding: "12px 16px", color: C.sub, fontSize: "14px" }}>
                        {item.item_code ? `#${item.item_code}` : "—"}
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: "15px", fontWeight: "700", color: qty <= 0 ? C.error : (qty <= min && min > 0) ? C.warning : C.success }}>
                        {qty} {item.unit || "pcs"}
                      </td>
                      <td style={{ padding: "12px 16px", color: C.sub, fontSize: "14px" }}>
                        {min > 0 ? `${min} ${item.unit || "pcs"}` : "—"}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <StatusBadge qty={qty} min={min} />
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button onClick={e => { e.stopPropagation(); setDetailItem(item) }}
                            style={{ color: C.accent, background: "rgba(6,182,212,0.1)", border: `1px solid ${C.border}`, borderRadius: "7px", padding: "5px 12px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}>
                            View
                          </button>
                          {isAdmin && (
                            <button onClick={e => { e.stopPropagation(); openEditModal(item) }}
                              style={{ color: C.text, background: "rgba(148,163,184,0.1)", border: "1px solid rgba(148,163,184,0.2)", borderRadius: "7px", padding: "5px 12px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}>
                              Edit
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {filtered.length === 0 && !loading && (
        <div style={{ textAlign: "center", padding: "60px", color: C.sub }}>
          <p style={{ fontSize: "40px", marginBottom: "12px" }}>📦</p>
          <p>No items found. {isAdmin && "Add your first item!"}</p>
        </div>
      )}

      {/* Add Item Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
            onClick={e => { if (e.target === e.currentTarget) { setShowModal(false); resetForm() } }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              style={{ background: "#0f2730", border: `1px solid ${C.border}`, borderRadius: "20px", padding: "28px", width: "100%", maxWidth: "560px", maxHeight: "85vh", overflowY: "auto" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                <h2 style={{ color: C.text, fontSize: "18px", fontWeight: "700" }}>{editingItemId ? "Edit Item" : "Add New Item"}</h2>
                <button onClick={() => { setShowModal(false); resetForm() }} style={{ color: C.sub, background: "none", border: "none", cursor: "pointer", fontSize: "20px" }}>✕</button>
              </div>

              {/* Error banner */}
              {saveError && (
                <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "10px", padding: "12px 14px", marginBottom: "16px", color: C.error, fontSize: "15px" }}>
                  ⚠️ {saveError}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <Field label="Item Name *">
                  <input value={form.name} onChange={e => handleFormChange("name", e.target.value)} placeholder="e.g. Notebook" style={inputStyle} />
                </Field>

                <Field label="Category">
                  <select value={form.category} onChange={e => handleFormChange("category", e.target.value)} style={inputStyle}>
                    <option value="">Select category</option>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </Field>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <Field label="Item Code">
                    <input value={form.item_code} onChange={e => handleFormChange("item_code", e.target.value)} placeholder="MKT-001" style={inputStyle} />
                  </Field>
                  <Field label="Unit">
                    <select value={form.unit} onChange={e => handleFormChange("unit", e.target.value)} style={inputStyle}>
                      {UNITS.map(u => <option key={u}>{u}</option>)}
                    </select>
                  </Field>
                </div>

                <Field label="Description">
                  <textarea value={form.description} onChange={e => handleFormChange("description", e.target.value)} placeholder="Notes about this item..." rows={2}
                    style={{ ...inputStyle, resize: "vertical", minHeight: "64px" }} />
                </Field>

                <Field label="Supplier Name">
                  <input value={form.supplier_name} onChange={e => handleFormChange("supplier_name", e.target.value)} placeholder="Supplier / vendor" style={inputStyle} />
                </Field>

                <Field label="Minimum Stock Level">
                  <input type="number" value={form.minimum_stock_level} onChange={e => handleFormChange("minimum_stock_level", e.target.value)} min={0} style={inputStyle} />
                </Field>

                <Field label="Expiry Date (if applicable)">
                  <input type="date" value={form.expiry_date} onChange={e => handleFormChange("expiry_date", e.target.value)} style={inputStyle} />
                </Field>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input type="checkbox" id="free_vendor" checked={form.is_free_from_vendor} onChange={e => handleFormChange("is_free_from_vendor", e.target.checked)} />
                  <label htmlFor="free_vendor" style={{ color: C.sub, fontSize: "15px", cursor: "pointer" }}>Free from vendor (no cost)</label>
                </div>

                {!form.is_free_from_vendor && (
                  <div style={{ background: "rgba(6,182,212,0.04)", border: `1px solid ${C.border}`, borderRadius: "12px", padding: "14px" }}>
                    <p style={{ color: C.accent, fontSize: "14px", fontWeight: "600", marginBottom: "10px" }}>Costing (Admin only)</p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      <Field label="Cost/Unit ($)">
                        <input type="number" value={form.cost_per_unit} onChange={e => handleFormChange("cost_per_unit", e.target.value)} placeholder="0.00" step="0.01" style={inputStyle} />
                      </Field>
                      <Field label="Delivery ($)">
                        <input type="number" value={form.delivery_charge} onChange={e => handleFormChange("delivery_charge", e.target.value)} placeholder="0.00" step="0.01" style={inputStyle} />
                      </Field>
                      <Field label="Tax ($)">
                        <input type="number" value={form.tax_amount} onChange={e => handleFormChange("tax_amount", e.target.value)} placeholder="0.00" step="0.01" style={inputStyle} />
                      </Field>
                      <Field label="Total Cost ($)">
                        <input type="number" value={form.total_cost} readOnly style={{ ...inputStyle, opacity: 0.7 }} />
                      </Field>
                    </div>
                  </div>
                )}

                {/* Variants */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                    <p style={{ color: C.sub, fontSize: "15px", fontWeight: "600" }}>Variants / Colors</p>
                    <button onClick={() => setFormVariants(prev => [...prev, { variant_name: "", color: "", size: "" }])}
                      style={{ color: C.accent, background: "none", border: "none", cursor: "pointer", fontSize: "14px" }}>+ Add Variant</button>
                  </div>
                  {formVariants.map((v, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 30px", gap: "6px", marginBottom: "6px", alignItems: "center" }}>
                      <input value={v.variant_name} onChange={e => { const arr = [...formVariants]; arr[i].variant_name = e.target.value; setFormVariants(arr) }}
                        placeholder="Variant name" style={{ ...inputStyle, fontSize: "14px", padding: "6px 10px" }} />
                      <input value={v.color} onChange={e => { const arr = [...formVariants]; arr[i].color = e.target.value; setFormVariants(arr) }}
                        placeholder="Color" style={{ ...inputStyle, fontSize: "14px", padding: "6px 10px" }} />
                      <input value={v.size} onChange={e => { const arr = [...formVariants]; arr[i].size = e.target.value; setFormVariants(arr) }}
                        placeholder="Size" style={{ ...inputStyle, fontSize: "14px", padding: "6px 10px" }} />
                      {formVariants.length > 1 && (
                        <button onClick={() => setFormVariants(prev => prev.filter((_, idx) => idx !== i))}
                          style={{ color: C.error, background: "none", border: "none", cursor: "pointer", fontSize: "16px" }}>✕</button>
                      )}
                    </div>
                  ))}
                </div>

                {/* QR code + Print QR Label — only for an existing item being edited;
                    a new, unsaved item has no id to encode yet */}
                {editingItemId && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", padding: "16px", background: "rgba(6,182,212,0.06)", borderRadius: "14px" }}>
                    <div ref={detailQrRef} style={{ background: "#fff", padding: "12px", borderRadius: "10px" }}>
                      <QRCodeSVG value={itemQrUrl(editingItemId)} size={160} level="H" />
                    </div>
                    <p style={{ color: C.sub, fontSize: "12px" }}>Scan to view item details</p>
                    <p style={{ color: "#4b5563", fontSize: "11px", fontFamily: "monospace" }}>{itemDisplayId({ id: editingItemId, item_code: form.item_code })}</p>
                    <button onClick={handlePrintItemLabel}
                      style={{ width: "100%", background: `linear-gradient(135deg, ${C.accent}, ${C.teal})`, color: "#fff", border: "none", borderRadius: "10px", padding: "11px", fontSize: "15px", fontWeight: "600", cursor: "pointer" }}>
                      🏷️ Print QR Label
                    </button>
                  </div>
                )}

                <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                  <button onClick={() => { setShowModal(false); resetForm() }}
                    style={{ flex: 1, background: "rgba(148,163,184,0.1)", color: C.sub, border: `1px solid rgba(148,163,184,0.2)`, borderRadius: "10px", padding: "11px", fontSize: "15px", fontWeight: "600", cursor: "pointer" }}>
                    Cancel
                  </button>
                  <button onClick={handleSave} disabled={saving || !form.name}
                    style={{ flex: 2, background: saving ? "rgba(6,182,212,0.3)" : `linear-gradient(135deg, ${C.accent}, ${C.teal})`, color: "#fff", border: "none", borderRadius: "10px", padding: "11px", fontSize: "15px", fontWeight: "600", cursor: saving ? "not-allowed" : "pointer" }}>
                    {saving ? "Saving..." : editingItemId ? "Save Changes" : "Save Item"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Item Detail Modal — QR code + Print QR Label */}
      <AnimatePresence>
        {detailItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
            onClick={e => { if (e.target === e.currentTarget) setDetailItem(null) }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              style={{ background: "#0f2730", border: `1px solid ${C.border}`, borderRadius: "20px", padding: "28px", width: "100%", maxWidth: "440px", maxHeight: "88vh", overflowY: "auto" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "18px" }}>
                <div>
                  <h2 style={{ color: C.text, fontSize: "18px", fontWeight: "700" }}>{detailItem.name}</h2>
                  {detailItem.category && (
                    <span style={{ ...catBadge(detailItem.category), borderRadius: "8px", padding: "2px 8px", fontSize: "13px", fontWeight: "600", display: "inline-block", marginTop: "6px" }}>
                      {detailItem.category}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  {isAdmin && (
                    <button onClick={() => { setDetailItem(null); openEditModal(detailItem) }}
                      style={{ color: C.accent, background: "rgba(6,182,212,0.1)", border: `1px solid ${C.border}`, borderRadius: "7px", padding: "5px 12px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}>
                      ✏️ Edit
                    </button>
                  )}
                  <button onClick={() => setDetailItem(null)} style={{ color: C.sub, background: "none", border: "none", cursor: "pointer", fontSize: "20px" }}>✕</button>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px", fontSize: "15px" }}>
                {detailItem.item_code && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: C.sub }}>Item Code</span>
                    <span style={{ color: C.text }}>#{detailItem.item_code}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: C.sub }}>Total Stock</span>
                  <span style={{ color: C.text, fontWeight: "700" }}>{getItemStock(detailItem.id)} {detailItem.unit || "pcs"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: C.sub }}>Minimum Stock Level</span>
                  <span style={{ color: C.text }}>{detailItem.minimum_stock_level || 0} {detailItem.unit || "pcs"}</span>
                </div>
                {detailItem.supplier_name && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: C.sub }}>Supplier</span>
                    <span style={{ color: C.text }}>{detailItem.supplier_name}</span>
                  </div>
                )}
                {detailItem.expiry_date && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: C.sub }}>Expiry Date</span>
                    <span style={{ color: new Date(detailItem.expiry_date) < new Date() ? C.error : C.text }}>{detailItem.expiry_date}</span>
                  </div>
                )}
                {showCost && detailItem.cost_per_unit != null && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: C.sub }}>Cost/unit (Admin only)</span>
                    <span style={{ color: C.text }}>${detailItem.cost_per_unit}</span>
                  </div>
                )}
                {showCost && detailItem.total_cost != null && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: C.sub }}>Total Cost (Admin only)</span>
                    <span style={{ color: C.text }}>${detailItem.total_cost}</span>
                  </div>
                )}
              </div>

              {/* Stock by location */}
              {Object.keys(getStockByLocation(detailItem.id)).length > 0 && (
                <div style={{ marginBottom: "16px" }}>
                  <p style={{ color: C.sub, fontSize: "12px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "8px" }}>
                    Stock by Location
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {Object.entries(getStockByLocation(detailItem.id)).map(([loc, qty]) => (
                      <div key={loc} style={{ display: "flex", justifyContent: "space-between", padding: "7px 10px", background: "rgba(6,182,212,0.05)", borderRadius: "8px" }}>
                        <span style={{ color: C.sub, fontSize: "14px" }}>{loc}</span>
                        <span style={{ color: C.accent, fontSize: "14px", fontWeight: "600" }}>{qty}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <ItemPhotoGallery itemId={detailItem.id} isAdmin={isAdmin} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Import Preview Modal */}
      <AnimatePresence>
        {showImportModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
            onClick={e => { if (e.target === e.currentTarget && !importing) { setShowImportModal(false); setImportRows([]); setImportError(null) } }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              style={{ background: "#0f2730", border: `1px solid ${C.border}`, borderRadius: "20px", padding: "28px", width: "100%", maxWidth: "640px", maxHeight: "85vh", overflowY: "auto" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
                <h2 style={{ color: C.text, fontSize: "18px", fontWeight: "700" }}>Import Items from Excel</h2>
                <button onClick={() => { setShowImportModal(false); setImportRows([]); setImportError(null) }} disabled={importing}
                  style={{ color: C.sub, background: "none", border: "none", cursor: "pointer", fontSize: "20px" }}>✕</button>
              </div>

              {importError && (
                <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "10px", padding: "12px 14px", marginBottom: "16px", color: C.error, fontSize: "15px" }}>
                  ⚠️ {importError}
                </div>
              )}

              {importRows.length > 0 && (
                <>
                  <p style={{ color: C.sub, fontSize: "15px", marginBottom: "12px" }}>
                    {importRows.filter(r => r.name).length} item{importRows.filter(r => r.name).length !== 1 ? "s" : ""} ready to import
                    {importRows.some(r => !r.name) && (
                      <span style={{ color: C.warning }}> · {importRows.filter(r => !r.name).length} row{importRows.filter(r => !r.name).length !== 1 ? "s" : ""} skipped (missing name)</span>
                    )}
                  </p>
                  <div style={{ border: `1px solid ${C.border}`, borderRadius: "12px", overflow: "hidden", marginBottom: "20px" }}>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px", minWidth: "480px" }}>
                        <thead>
                          <tr>
                            {["Name", "Category", "Item Code", "Unit", "Min Stock", "Supplier", "Expiry", "Cost/Unit", "Delivery", "Tax", ""].map(h => (
                              <th key={h} style={{ color: C.sub, textAlign: "left", padding: "8px 10px", borderBottom: `1px solid ${C.border}`, fontSize: "10.5px", fontWeight: "600", textTransform: "uppercase" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {importRows.map((row, i) => (
                            <tr key={i} style={{ borderBottom: `1px solid rgba(6,182,212,0.08)`, opacity: row.name ? 1 : 0.5 }}>
                              <td style={{ color: C.text, padding: "7px 10px" }}>{row.name || "(no name)"}</td>
                              <td style={{ color: C.sub, padding: "7px 10px" }}>{row.category || "—"}</td>
                              <td style={{ color: C.sub, padding: "7px 10px" }}>{row.item_code || "—"}</td>
                              <td style={{ color: C.sub, padding: "7px 10px" }}>{row.unit}</td>
                              <td style={{ color: C.sub, padding: "7px 10px" }}>{row.minimum_stock}</td>
                              <td style={{ color: C.sub, padding: "7px 10px" }}>{row.supplier || "—"}</td>
                              <td style={{ color: C.sub, padding: "7px 10px" }}>{row.expiry_date || "—"}</td>
                              <td style={{ color: C.sub, padding: "7px 10px" }}>{row.cost_per_unit || "—"}</td>
                              <td style={{ color: C.sub, padding: "7px 10px" }}>{row.delivery || "—"}</td>
                              <td style={{ color: C.sub, padding: "7px 10px" }}>{row.tax || "—"}</td>
                              <td style={{ padding: "7px 10px" }}>
                                {row.name
                                  ? <span style={{ color: C.success, fontSize: "14px" }}>✅</span>
                                  : <span style={{ color: C.error, fontSize: "14px" }}>⚠️ skip</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}

              <div style={{ display: "flex", gap: "10px" }}>
                <button onClick={() => { setShowImportModal(false); setImportRows([]); setImportError(null) }} disabled={importing}
                  style={{ flex: 1, background: "rgba(148,163,184,0.1)", color: C.sub, border: `1px solid rgba(148,163,184,0.2)`, borderRadius: "10px", padding: "11px", fontSize: "15px", fontWeight: "600", cursor: "pointer" }}>
                  Cancel
                </button>
                <button onClick={handleConfirmImport} disabled={importing || importRows.filter(r => r.name).length === 0}
                  style={{ flex: 2, background: importing ? "rgba(6,182,212,0.3)" : `linear-gradient(135deg, ${C.accent}, ${C.teal})`, color: "#fff", border: "none", borderRadius: "10px", padding: "11px", fontSize: "15px", fontWeight: "600", cursor: importing ? "not-allowed" : "pointer" }}>
                  {importing ? "Importing..." : `Import ${importRows.filter(r => r.name).length || ""} Item${importRows.filter(r => r.name).length !== 1 ? "s" : ""}`}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const inputStyle = {
  width: "100%", background: "rgba(6,182,212,0.06)", color: "#ffffff",
  border: "1px solid rgba(6,182,212,0.2)", borderRadius: "8px",
  padding: "9px 12px", fontSize: "15px", outline: "none", boxSizing: "border-box",
}

function Field({ label, children }) {
  return (
    <div>
      <p style={{ color: "#94a3b8", fontSize: "13px", marginBottom: "5px", fontWeight: "600" }}>{label}</p>
      {children}
    </div>
  )
}
