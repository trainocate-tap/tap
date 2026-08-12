import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"
import { useAuth } from "../../context/AuthContext"
import { motion, AnimatePresence } from "framer-motion"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import * as XLSX from "xlsx"

const C = {
  accent: "#06b6d4", teal: "#14b8a6",
  card: "rgba(6,182,212,0.06)", border: "rgba(6,182,212,0.18)",
  text: "#ffffff", sub: "#94a3b8",
  success: "#10b981", warning: "#f59e0b", error: "#ef4444",
}

export default function MarketingStocktake() {
  const { userProfile } = useAuth()
  const [items, setItems] = useState([])
  const [stock, setStock] = useState([])
  const [locations, setLocations] = useState([])
  const [stocktake, setStocktake] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [filterLocation, setFilterLocation] = useState("All")
  const [saved, setSaved] = useState({})
  const [rowErrors, setRowErrors] = useState({})
  const [successMsg, setSuccessMsg] = useState(null)

  const showSuccess = (msg) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 7000)
  }

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const [{ data: i }, { data: s }, { data: l }] = await Promise.all([
      supabase.from("marketing_items").select("id, name, unit, minimum_stock_level").order("name"),
      supabase.from("marketing_stock").select("*"),
      supabase.from("marketing_locations").select("*").order("name"),
    ])
    setItems(i || [])
    setStock(s || [])
    setLocations(l || [])
    setLoading(false)
  }

  const getSystemQty = (itemId, locationId) =>
    stock.filter(s => s.item_id === itemId && s.location_id === locationId).reduce((sum, s) => sum + s.quantity, 0)

  const getActual = (itemId, locationId) => {
    const key = `${itemId}_${locationId}`
    return stocktake[key]?.actual ?? ""
  }

  const setActual = (itemId, locationId, val) => {
    const key = `${itemId}_${locationId}`
    setStocktake(prev => ({ ...prev, [key]: { actual: val, notes: prev[key]?.notes || "" } }))
    setRowErrors(prev => ({ ...prev, [key]: null }))
    setSaved(prev => ({ ...prev, [key]: false }))
  }

  const setNotes = (itemId, locationId, val) => {
    const key = `${itemId}_${locationId}`
    setStocktake(prev => ({ ...prev, [key]: { actual: prev[key]?.actual ?? "", notes: val } }))
  }

  const handleSaveRow = async (item, location) => {
    const key = `${item.id}_${location.id}`
    const entry = stocktake[key]
    if (entry?.actual === "" || entry?.actual === undefined) return

    setSaving(true)
    setRowErrors(prev => ({ ...prev, [key]: null }))

    const sysQty = getSystemQty(item.id, location.id)
    const actualQty = parseInt(entry.actual) || 0
    const discrepancy = actualQty - sysQty

    // Record stocktake entry
    const { error: takeErr } = await supabase.from("marketing_stocktake").insert({
      item_id: item.id,
      location_id: location.id,
      system_quantity: sysQty,
      actual_quantity: actualQty,
      discrepancy,
      notes: entry.notes || null,
      performed_by: userProfile?.id,
      performed_by_name: userProfile?.name || userProfile?.email,
      stocktake_date: new Date().toISOString().split("T")[0],
    })
    if (takeErr) {
      setSaving(false)
      setRowErrors(prev => ({ ...prev, [key]: `Save failed: ${takeErr.message}` }))
      return
    }

    // Update or insert stock quantity
    const existing = stock.find(s => s.item_id === item.id && s.location_id === location.id)
    if (existing) {
      const { error: stockErr } = await supabase
        .from("marketing_stock")
        .update({ quantity: actualQty, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
      if (stockErr) {
        setSaving(false)
        setRowErrors(prev => ({ ...prev, [key]: `Stock update failed: ${stockErr.message}` }))
        return
      }
    } else {
      const { error: stockErr } = await supabase
        .from("marketing_stock")
        .insert({ item_id: item.id, location_id: location.id, quantity: actualQty })
      if (stockErr) {
        setSaving(false)
        setRowErrors(prev => ({ ...prev, [key]: `Stock insert failed: ${stockErr.message}` }))
        return
      }
    }

    setSaved(prev => ({ ...prev, [key]: true }))
    setSaving(false)
    showSuccess(`✅ ${item.name} @ ${location.name} saved — quantity set to ${actualQty}`)
    if (userProfile?.id) {
      await supabase.from("marketing_notifications").insert({
        user_id: userProfile.id,
        title: "Stocktake Saved 🔢",
        message: `${item.name} at ${location.name} updated to ${actualQty} pcs`,
        type: "stocktake",
        is_read: false,
      })
    }
    fetchAll()
    setTimeout(() => setSaved(prev => ({ ...prev, [key]: false })), 3000)
  }

  const getStocktakeRows = () => {
    const rows = []
    items.forEach(item => {
      filteredLocations.forEach(loc => {
        const sysQty = getSystemQty(item.id, loc.id)
        const key = `${item.id}_${loc.id}`
        const actualQty = parseInt(stocktake[key]?.actual) ?? sysQty
        rows.push({ Item: item.name, Location: loc.name, "System Qty": sysQty, "Actual Qty": actualQty, Discrepancy: actualQty - sysQty })
      })
    })
    return rows
  }

  const dateStr = new Date().toISOString().split("T")[0]

  const exportCSV = () => {
    const rows = getStocktakeRows()
    const headers = Object.keys(rows[0])
    const csv = [headers.join(","), ...rows.map(r => headers.map(h => r[h]).join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `stocktake_${dateStr}.csv`
    a.click()
  }

  const exportExcel = () => {
    const rows = getStocktakeRows()
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Stocktake")
    XLSX.writeFile(wb, `stocktake_${dateStr}.xlsx`)
  }

  const exportPDF = () => {
    const rows = getStocktakeRows()
    const doc = new jsPDF({ orientation: "landscape" })
    doc.setFontSize(14)
    doc.text("Stocktake Report", 14, 15)
    doc.setFontSize(9)
    doc.text(`Date: ${dateStr}  |  Location: ${filterLocation === "All" ? "All Locations" : locations.find(l => l.id === filterLocation)?.name || filterLocation}`, 14, 22)
    autoTable(doc, {
      startY: 28,
      head: [["Item", "Location", "System Qty", "Actual Qty", "Discrepancy"]],
      body: rows.map(r => [r.Item, r.Location, r["System Qty"], r["Actual Qty"], r.Discrepancy]),
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [6, 182, 212], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 250, 252] },
    })
    doc.save(`stocktake_${dateStr}.pdf`)
  }

  const filteredLocations = filterLocation === "All" ? locations : locations.filter(l => l.id === filterLocation)

  return (
    <div style={{ padding: "24px", maxWidth: "100%" }}>
      {/* Success toast */}
      <AnimatePresence>
        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            style={{ position: "fixed", top: "72px", left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: "#10b981", color: "#fff", padding: "12px 24px", borderRadius: "12px", fontWeight: "600", fontSize: "16px", boxShadow: "0 4px 20px rgba(16,185,129,0.4)", whiteSpace: "nowrap" }}
          >
            {successMsg}
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ color: C.text, fontSize: "24px", fontWeight: "800", marginBottom: "4px" }}>🔢 Stocktake</h1>
          <p style={{ color: C.sub, fontSize: "15px" }}>Monthly physical count — verify and override quantities</p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button onClick={exportCSV} style={{ background: "rgba(16,185,129,0.15)", color: C.success, border: "1px solid rgba(16,185,129,0.3)", borderRadius: "10px", padding: "9px 14px", fontSize: "14px", fontWeight: "600", cursor: "pointer", transition: "all 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(16,185,129,0.28)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(16,185,129,0.15)"}>
            ⬇️ CSV
          </button>
          <button onClick={exportExcel} style={{ background: "rgba(34,197,94,0.12)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "10px", padding: "9px 14px", fontSize: "14px", fontWeight: "600", cursor: "pointer", transition: "all 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(34,197,94,0.25)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(34,197,94,0.12)"}>
            📊 Excel
          </button>
          <button onClick={exportPDF} style={{ background: "rgba(239,68,68,0.12)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "10px", padding: "9px 14px", fontSize: "14px", fontWeight: "600", cursor: "pointer", transition: "all 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(239,68,68,0.22)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(239,68,68,0.12)"}>
            📄 PDF
          </button>
        </div>
      </div>

      {/* Location filter */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
        <select value={filterLocation} onChange={e => setFilterLocation(e.target.value)}
          style={{ background: "#0f2730", color: C.text, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "9px 14px", fontSize: "15px", outline: "none" }}>
          <option value="All">All Locations</option>
          {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      <div style={{ background: "rgba(6,182,212,0.06)", border: `1px solid ${C.border}`, borderRadius: "12px", padding: "12px 16px", marginBottom: "20px" }}>
        <p style={{ color: C.accent, fontSize: "14px", fontWeight: "600" }}>How to use:</p>
        <p style={{ color: C.sub, fontSize: "14px", marginTop: "2px" }}>
          Enter the actual physical count in the "Actual Qty" field. The system shows the current database quantity.
          Discrepancy = Actual − System. Click "Save" to update the database and record the stocktake.
        </p>
      </div>

      {loading ? (
        <p style={{ color: C.sub }}>Loading...</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {filteredLocations.length === 0 && (
            <p style={{ color: C.sub, textAlign: "center", padding: "40px" }}>No locations configured. Add locations in Settings first.</p>
          )}
          {filteredLocations.map(location => {
            const locationItems = items.filter(item => getSystemQty(item.id, location.id) > 0)
            if (locationItems.length === 0 && filterLocation !== location.id) return null

            return (
              <div key={location.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "20px" }}>
                <h3 style={{ color: C.accent, fontSize: "17px", fontWeight: "700", marginBottom: "14px" }}>
                  📍 {location.name}
                </h3>
                <div style={{ overflowX: "scroll", WebkitOverflowScrolling: "touch", width: "100%", display: "block" }}>
                  <table style={{ width: "max-content", borderCollapse: "collapse", fontSize: "15px", minWidth: "800px" }}>
                    <thead>
                      <tr>
                        {["Item", "Unit", "System Qty", "Actual Qty", "Discrepancy", "Notes", ""].map(h => (
                          <th key={h} style={{ color: C.sub, textAlign: "left", padding: "8px 10px", borderBottom: `1px solid ${C.border}`, fontSize: "13px", fontWeight: "600", textTransform: "uppercase" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(item => {
                        const sysQty = getSystemQty(item.id, location.id)
                        const key = `${item.id}_${location.id}`
                        const actual = getActual(item.id, location.id)
                        const actualNum = actual !== "" ? parseInt(actual) || 0 : sysQty
                        const discrepancy = actual !== "" ? actualNum - sysQty : 0
                        const isSaved = saved[key]
                        const rowErr = rowErrors[key]

                        return (
                          <tr key={item.id} style={{ borderBottom: `1px solid rgba(6,182,212,0.08)` }}>
                            <td style={{ color: C.text, padding: "8px 10px", fontWeight: "500" }}>
                              {item.name}
                              {rowErr && <div style={{ color: C.error, fontSize: "12px", marginTop: "2px" }}>{rowErr}</div>}
                            </td>
                            <td style={{ color: C.sub, padding: "8px 10px" }}>{item.unit}</td>
                            <td style={{ color: C.text, padding: "8px 10px", fontWeight: "600" }}>{sysQty}</td>
                            <td style={{ padding: "6px 10px" }}>
                              <input
                                type="number" min={0} value={actual}
                                onChange={e => setActual(item.id, location.id, e.target.value)}
                                placeholder={String(sysQty)}
                                style={{ width: "70px", background: "rgba(6,182,212,0.08)", color: C.text, border: `1px solid ${rowErr ? C.error : C.border}`, borderRadius: "6px", padding: "5px 8px", fontSize: "15px", outline: "none" }}
                              />
                            </td>
                            <td style={{ padding: "8px 10px" }}>
                              {actual !== "" && (
                                <span style={{ color: discrepancy > 0 ? C.success : discrepancy < 0 ? C.error : C.sub, fontWeight: "700", fontSize: "16px" }}>
                                  {discrepancy >= 0 ? "+" : ""}{discrepancy}
                                </span>
                              )}
                            </td>
                            <td style={{ padding: "6px 10px" }}>
                              <input
                                type="text"
                                value={stocktake[key]?.notes || ""}
                                onChange={e => setNotes(item.id, location.id, e.target.value)}
                                placeholder="Notes..."
                                style={{ width: "120px", background: "rgba(6,182,212,0.04)", color: C.sub, border: `1px solid rgba(6,182,212,0.1)`, borderRadius: "6px", padding: "5px 8px", fontSize: "14px", outline: "none" }}
                              />
                            </td>
                            <td style={{ padding: "6px 10px", display: "flex", alignItems: "center", gap: "8px" }}>
                              <button
                                onClick={() => handleSaveRow(item, location)}
                                disabled={saving || actual === ""}
                                style={{ background: actual !== "" ? `linear-gradient(135deg, ${C.accent}, ${C.teal})` : "rgba(148,163,184,0.1)", color: actual !== "" ? "#fff" : C.sub, border: "none", borderRadius: "6px", padding: "5px 12px", fontSize: "13px", fontWeight: "600", cursor: actual !== "" ? "pointer" : "not-allowed", opacity: saving ? 0.6 : 1 }}
                              >
                                {saving ? "..." : "Save"}
                              </button>
                              <AnimatePresence>
                                {isSaved && (
                                  <motion.span
                                    initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}
                                    style={{ color: C.success, fontSize: "16px" }}
                                  >
                                    ✅
                                  </motion.span>
                                )}
                              </AnimatePresence>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
