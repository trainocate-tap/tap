import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"
import { useAuth } from "../../context/AuthContext"
import { motion } from "framer-motion"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import * as XLSX from "xlsx"

const C = {
  accent: "#06b6d4", teal: "#14b8a6",
  card: "rgba(6,182,212,0.06)", border: "rgba(6,182,212,0.18)",
  text: "#ffffff", sub: "#94a3b8",
  success: "#10b981", warning: "#f59e0b", error: "#ef4444",
}

const ALL_REPORTS = [
  { id: "monthly_stock",      label: "Monthly Stock Balance",        icon: "📊", adminOnly: false },
  { id: "class_distribution", label: "Items Distributed Per Class",  icon: "🎁", adminOnly: false },
  { id: "event_distribution", label: "Items Distributed Per Event",  icon: "🎪", adminOnly: false },
  { id: "budget_actual",      label: "Budget vs Actual",             icon: "💰", adminOnly: true  },
  { id: "low_stock",          label: "Low Stock Alert Report",       icon: "⚠️", adminOnly: false },
  { id: "supplier_history",   label: "Supplier Purchase History",    icon: "🏭", adminOnly: true  },
  { id: "defective",          label: "Defective Items Report",       icon: "🔴", adminOnly: false },
  { id: "movement_history",   label: "Full Stock Movement History",  icon: "📋", adminOnly: false },
  { id: "per_person",         label: "Items Per Person / Trainer",   icon: "👤", adminOnly: false },
  { id: "monthly_spending",   label: "Monthly Spending Summary",     icon: "💳", adminOnly: true  },
  { id: "admin_activity",     label: "Admin Activity",               icon: "🛡️", adminOnly: true  },
]

const MONTHS = [
  { value: "1",  label: "January" },   { value: "2",  label: "February" },
  { value: "3",  label: "March" },     { value: "4",  label: "April" },
  { value: "5",  label: "May" },       { value: "6",  label: "June" },
  { value: "7",  label: "July" },      { value: "8",  label: "August" },
  { value: "9",  label: "September" }, { value: "10", label: "October" },
  { value: "11", label: "November" },  { value: "12", label: "December" },
]
const YEARS = ["2024", "2025", "2026", "2027"]

const th = (h) => (
  <th style={{ color: "#94a3b8", textAlign: "left", padding: "8px 12px", borderBottom: "1px solid rgba(6,182,212,0.2)", fontSize: "13px", fontWeight: "600", textTransform: "uppercase", whiteSpace: "nowrap" }}>
    {h}
  </th>
)

function Td({ children, align = "left", color }) {
  return (
    <td style={{ color: color || "#e2e8f0", padding: "9px 12px", textAlign: align, fontSize: "15px" }}>
      {children ?? "—"}
    </td>
  )
}

function Table({ headers, children }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "15px" }}>
        <thead><tr>{headers.map(h => <th key={h} style={{ color: "#94a3b8", textAlign: "left", padding: "8px 12px", borderBottom: "1px solid rgba(6,182,212,0.2)", fontSize: "13px", fontWeight: "600", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function TR({ children }) {
  return <tr style={{ borderBottom: "1px solid rgba(6,182,212,0.06)" }}>{children}</tr>
}

function Empty({ text = "No data for selected period" }) {
  return <p style={{ color: "#64748b", textAlign: "center", padding: "32px" }}>{text}</p>
}

export default function MarketingReports() {
  const { canManageMarketing, marketingRole, role } = useAuth()
  const showAdminReports = ["marketing_admin", "marketing_manager"].includes(marketingRole) || role === "admin"

  const [selectedReport, setSelectedReport] = useState(null)
  const [selectedMonth, setSelectedMonth] = useState("")
  const [selectedYear, setSelectedYear] = useState("")
  const [selectedItemId, setSelectedItemId] = useState("")
  const [reportData, setReportData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Reference data — fetched once, used by all reports
  const [items, setItems] = useState([])
  const [locations, setLocations] = useState([])
  const [classes, setClasses] = useState([])
  const [events, setEvents] = useState([])
  const [refLoading, setRefLoading] = useState(true)

  useEffect(() => {
    const loadRef = async () => {
      const [{ data: i }, { data: l }, { data: c }, { data: e }] = await Promise.all([
        supabase.from("marketing_items").select("*"),
        supabase.from("marketing_locations").select("*"),
        supabase.from("marketing_classes").select("id, class_name, class_date"),
        supabase.from("marketing_events").select("id, event_name, event_date, budget, actual_cost, status"),
      ])
      setItems(i || [])
      setLocations(l || [])
      setClasses(c || [])
      setEvents(e || [])
      setRefLoading(false)
    }
    loadRef()
  }, [])

  // Helpers
  const itemById   = (id) => items.find(it => it.id === id)
  const itemName   = (id) => itemById(id)?.name || "Unknown"
  const locName    = (id) => locations.find(l => l.id === id)?.name || "Unknown"
  const className  = (id) => classes.find(c => c.id === id)?.class_name || "Unknown"
  const classDate  = (id) => classes.find(c => c.id === id)?.class_date || ""
  const eventName  = (id) => events.find(e => e.id === id)?.event_name || "Unknown"
  const eventDate  = (id) => events.find(e => e.id === id)?.event_date || ""
  const fmtDate    = (iso) => iso ? new Date(iso).toLocaleDateString() : "—"
  const fmtDT      = (iso) => iso ? new Date(iso).toLocaleString() : "—"

  const visibleReports = ALL_REPORTS.filter(r => !r.adminOnly || showAdminReports)

  // Month + Year narrow the range to that specific month; Year alone covers the
  // whole year; neither selected falls back to "everything" (same as before).
  let from = "2020-01-01"
  let to   = new Date().toISOString().split("T")[0]
  if (selectedYear && selectedMonth) {
    const y = parseInt(selectedYear), m = parseInt(selectedMonth)
    from = `${selectedYear}-${String(m).padStart(2, "0")}-01`
    to   = `${selectedYear}-${String(m).padStart(2, "0")}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`
  } else if (selectedYear) {
    from = `${selectedYear}-01-01`
    to   = `${selectedYear}-12-31`
  }
  const toTS = to + "T23:59:59"

  const generateReport = async () => {
    if (!selectedReport) return
    setLoading(true)
    setReportData(null)
    setError(null)

    try {
      let rows = []

      switch (selectedReport) {

        // ── 1. Monthly Stock Balance ──────────────────────────────────
        case "monthly_stock": {
          let q = supabase.from("marketing_stock").select("*")
          if (selectedItemId) q = q.eq("item_id", selectedItemId)
          const { data, error: e } = await q
          if (e) throw e
          rows = (data || []).map(s => ({
            item:     itemName(s.item_id),
            location: locName(s.location_id),
            quantity: s.quantity,
            min_level: itemById(s.item_id)?.minimum_stock_level ?? 0,
            unit:     itemById(s.item_id)?.unit || "pcs",
            status:   s.quantity <= 0
              ? "🔴 Out of Stock"
              : s.quantity <= (itemById(s.item_id)?.minimum_stock_level || 0)
              ? "🟡 Low Stock"
              : "🟢 OK",
          })).sort((a, b) => a.item.localeCompare(b.item))
          break
        }

        // ── 2. Items Distributed Per Class ───────────────────────────
        case "class_distribution": {
          let q = supabase
            .from("marketing_class_gifts")
            .select("*")
            .gte("created_at", from)
            .lte("created_at", toTS)
          if (selectedItemId) q = q.eq("item_id", selectedItemId)
          const { data, error: e } = await q
          if (e) throw e
          rows = (data || []).map(g => ({
            class:      className(g.class_id),
            class_date: classDate(g.class_id),
            item:       itemName(g.item_id),
            quantity:   g.quantity,
            status:     g.is_distributed ? "✅ Distributed" : g.is_packed ? "📦 Packed" : "⏳ Pending",
          })).sort((a, b) => a.class_date.localeCompare(b.class_date))
          break
        }

        // ── 3. Items Distributed Per Event ───────────────────────────
        case "event_distribution": {
          let q = supabase
            .from("marketing_event_collaterals")
            .select("*")
            .gte("created_at", from)
            .lte("created_at", toTS)
          if (selectedItemId) q = q.eq("item_id", selectedItemId)
          const { data, error: e } = await q
          if (e) throw e
          rows = (data || []).map(c => ({
            event:      eventName(c.event_id),
            event_date: eventDate(c.event_id),
            item:       itemName(c.item_id),
            qty_needed: c.quantity_needed,
            signed_out: c.signed_out_at ? fmtDate(c.signed_out_at) : "—",
            returned:   c.signed_in_at  ? fmtDate(c.signed_in_at)  : "—",
            damaged:    c.quantity_damaged || 0,
            signed_out_by: c.signed_out_name || "—",
          })).sort((a, b) => a.event_date.localeCompare(b.event_date))
          break
        }

        // ── 4. Budget vs Actual ──────────────────────────────────────
        case "budget_actual": {
          const { data, error: e } = await supabase
            .from("marketing_events")
            .select("*")
            .gte("event_date", from)
            .lte("event_date", to)
            .order("event_date", { ascending: false })
          if (e) throw e
          rows = (data || []).map(ev => ({
            event:      ev.event_name,
            date:       ev.event_date,
            status:     ev.status,
            budget:     ev.budget != null ? `$${Number(ev.budget).toFixed(2)}` : "—",
            actual:     ev.actual_cost != null ? `$${Number(ev.actual_cost).toFixed(2)}` : "—",
            variance:   ev.budget != null && ev.actual_cost != null
              ? `$${(ev.actual_cost - ev.budget).toFixed(2)}`
              : "—",
            over_budget: ev.budget != null && ev.actual_cost != null && ev.actual_cost > ev.budget ? "⚠️ Yes" : "OK",
          }))
          break
        }

        // ── 5. Low Stock Alert ───────────────────────────────────────
        case "low_stock": {
          const { data: stockData, error: e } = await supabase.from("marketing_stock").select("*")
          if (e) throw e

          // Sum stock per item across all locations
          const totals = {}
          ;(stockData || []).forEach(s => {
            totals[s.item_id] = (totals[s.item_id] || 0) + s.quantity
          })

          rows = items
            .filter(it => {
              if (selectedItemId && it.id !== selectedItemId) return false
              const min = it.minimum_stock_level || 0
              const qty = totals[it.id] ?? 0
              return qty <= min  // include zero-stock items even without min set
            })
            .map(it => {
              const qty = totals[it.id] ?? 0
              const min = it.minimum_stock_level || 0
              return {
                item:      it.name,
                unit:      it.unit || "pcs",
                total_qty: qty,
                min_level: min,
                shortage:  Math.max(0, min - qty),
                status:    qty <= 0 ? "🔴 Out of Stock" : "🟡 Low Stock",
              }
            })
            .sort((a, b) => a.total_qty - b.total_qty)
          break
        }

        // ── 6. Supplier Purchase History ─────────────────────────────
        case "supplier_history": {
          let q = supabase
            .from("marketing_stock_movements")
            .select("*")
            .eq("movement_type", "stock_in")
            .gte("created_at", from)
            .lte("created_at", toTS)
            .order("created_at", { ascending: false })
          if (selectedItemId) q = q.eq("item_id", selectedItemId)
          const { data, error: e } = await q
          if (e) throw e
          rows = (data || []).map(m => {
            const it = itemById(m.item_id)
            return {
              date:         fmtDate(m.created_at),
              item:         itemName(m.item_id),
              supplier:     it?.supplier_name || "—",
              quantity:     m.quantity,
              unit:         it?.unit || "pcs",
              cost_per_unit: it?.cost_per_unit != null ? `$${it.cost_per_unit}` : "—",
              total_cost:   it?.cost_per_unit != null ? `$${(it.cost_per_unit * m.quantity).toFixed(2)}` : "—",
              received_by:  m.performed_by_name || "—",
              notes:        m.notes || "—",
            }
          })
          break
        }

        // ── 7. Defective Items ───────────────────────────────────────
        case "defective": {
          let colQ = supabase.from("marketing_event_collaterals").select("*").gt("quantity_damaged", 0)
          let movQ = supabase.from("marketing_stock_movements").select("*").eq("movement_type", "defective")
            .gte("created_at", from).lte("created_at", toTS)
          if (selectedItemId) { colQ = colQ.eq("item_id", selectedItemId); movQ = movQ.eq("item_id", selectedItemId) }
          const [{ data: colData, error: e1 }, { data: movData, error: e2 }] = await Promise.all([colQ, movQ])
          if (e1) throw e1
          if (e2) throw e2

          const fromCollaterals = (colData || []).map(c => ({
            date:     fmtDate(c.signed_in_at || c.created_at),
            source:   `Event: ${eventName(c.event_id)}`,
            item:     itemName(c.item_id),
            qty_damaged: c.quantity_damaged,
            reported_by: c.signed_in_name || "—",
            notes:    "Damaged on return",
          }))
          const fromMovements = (movData || []).map(m => ({
            date:     fmtDate(m.created_at),
            source:   "Stock Movement",
            item:     itemName(m.item_id),
            qty_damaged: m.quantity,
            reported_by: m.performed_by_name || "—",
            notes:    m.notes || "—",
          }))
          rows = [...fromCollaterals, ...fromMovements]
            .sort((a, b) => new Date(b.date) - new Date(a.date))
          break
        }

        // ── 8. Full Stock Movement History ───────────────────────────
        case "movement_history": {
          let q = supabase
            .from("marketing_stock_movements")
            .select("*")
            .gte("created_at", from)
            .lte("created_at", toTS)
            .order("created_at", { ascending: false })
            .limit(500)
          if (selectedItemId) q = q.eq("item_id", selectedItemId)
          const { data, error: e } = await q
          if (e) throw e
          rows = (data || []).map(m => ({
            date:      fmtDT(m.created_at),
            type:      m.movement_type === "stock_in" ? "📥 Stock In" : m.movement_type === "stock_out" ? "📤 Stock Out" : m.movement_type,
            item:      itemName(m.item_id),
            location:  locName(m.location_id),
            quantity:  m.quantity,
            performed_by: m.performed_by_name || "—",
            reason:    m.reason || "—",
            notes:     m.notes || "—",
          }))
          break
        }

        // ── 9. Items Per Person / Trainer ────────────────────────────
        case "per_person": {
          let q = supabase
            .from("marketing_stock_movements")
            .select("*")
            .eq("movement_type", "stock_out")
            .gte("created_at", from)
            .lte("created_at", toTS)
          if (selectedItemId) q = q.eq("item_id", selectedItemId)
          const { data, error: e } = await q
          if (e) throw e

          // Group by person
          const grouped = {}
          ;(data || []).forEach(m => {
            const person = m.performed_by_name || "Unknown"
            if (!grouped[person]) grouped[person] = {}
            const key = m.item_id
            grouped[person][key] = (grouped[person][key] || 0) + m.quantity
          })

          rows = []
          Object.entries(grouped).forEach(([person, itemMap]) => {
            Object.entries(itemMap).forEach(([itemId, qty]) => {
              rows.push({ person, item: itemName(itemId), total_qty: qty, unit: itemById(itemId)?.unit || "pcs" })
            })
          })
          rows.sort((a, b) => a.person.localeCompare(b.person))
          break
        }

        // ── 10. Monthly Spending Summary ─────────────────────────────
        case "monthly_spending": {
          let movQ = supabase.from("marketing_stock_movements").select("*").eq("movement_type", "stock_in")
            .gte("created_at", from).lte("created_at", toTS)
          if (selectedItemId) movQ = movQ.eq("item_id", selectedItemId)
          // event_cost has no item association, so the item filter can't narrow it —
          // only the purchase_cost side is affected when an item is selected.
          const [{ data: movData, error: e1 }, { data: evData, error: e2 }] = await Promise.all([
            movQ,
            supabase.from("marketing_events").select("*")
              .gte("event_date", from).lte("event_date", to),
          ])
          if (e1) throw e1
          if (e2) throw e2

          const monthly = {}
          const addMonth = (dateStr, purchaseCost, eventCost) => {
            const month = dateStr?.slice(0, 7) || "Unknown"
            if (!monthly[month]) monthly[month] = { month, purchase_cost: 0, event_cost: 0, total: 0 }
            monthly[month].purchase_cost += purchaseCost
            monthly[month].event_cost    += eventCost
            monthly[month].total         += purchaseCost + eventCost
          }

          ;(movData || []).forEach(m => {
            const it = itemById(m.item_id)
            const cost = it?.cost_per_unit ? it.cost_per_unit * m.quantity : 0
            addMonth(m.created_at?.slice(0, 10), cost, 0)
          })
          ;(evData || []).forEach(ev => {
            addMonth(ev.event_date, 0, ev.actual_cost || 0)
          })

          rows = Object.values(monthly)
            .sort((a, b) => b.month.localeCompare(a.month))
            .map(r => ({
              month:          r.month,
              purchase_cost:  `$${r.purchase_cost.toFixed(2)}`,
              event_cost:     `$${r.event_cost.toFixed(2)}`,
              total_spending: `$${r.total.toFixed(2)}`,
            }))
          break
        }

        // ── 11. Admin Activity ────────────────────────────────────────
        case "admin_activity": {
          // marketing_approvals has no rejected_at column — only approved_at is
          // captured, so decision date is blank for rejections. Date filter runs
          // against created_at (submission date) since it's populated for every row.
          let q = supabase
            .from("marketing_approvals")
            .select("*")
            .in("status", ["approved", "rejected"])
            .gte("created_at", from)
            .lte("created_at", toTS)
            .order("created_at", { ascending: false })
          if (selectedItemId) q = q.eq("item_id", selectedItemId)
          const { data, error: e } = await q
          if (e) throw e
          rows = (data || []).map(a => ({
            admin:         a.approver_name || "—",
            decision_date: a.approved_at ? fmtDate(a.approved_at) : "—",
            requester:     a.requested_by_name || "Unknown",
            item:          itemName(a.item_id),
            quantity:      a.quantity,
            status:        a.status === "approved" ? "✅ Approved" : a.status === "rejected" ? "❌ Rejected" : a.status,
          }))
          break
        }

        default:
          rows = []
      }

      setReportData({ type: selectedReport, rows, generatedAt: new Date().toLocaleString() })
    } catch (err) {
      console.error("[Reports] error:", err)
      setError(err.message || "Failed to generate report")
    }

    setLoading(false)
  }

  const fileName = `marketing_${selectedReport}_${new Date().toISOString().split("T")[0]}`

  const exportCSV = () => {
    if (!reportData?.rows?.length) return
    const headers = Object.keys(reportData.rows[0])
    const csv = [
      headers.join(","),
      ...reportData.rows.map(r => headers.map(h => `"${r[h] ?? ""}"`).join(","))
    ].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${fileName}.csv`
    a.click()
  }

  const exportExcel = () => {
    if (!reportData?.rows?.length) return
    const ws = XLSX.utils.json_to_sheet(reportData.rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Report")
    XLSX.writeFile(wb, `${fileName}.xlsx`)
  }

  const exportPDF = () => {
    if (!reportData?.rows?.length) return
    const doc = new jsPDF({ orientation: "landscape" })
    const meta = visibleReports.find(r => r.id === selectedReport)
    doc.setFontSize(14)
    doc.text(`${meta?.label || selectedReport}`, 14, 15)
    doc.setFontSize(9)
    doc.text(`Generated: ${reportData.generatedAt}`, 14, 22)
    const headers = Object.keys(reportData.rows[0])
    autoTable(doc, {
      startY: 28,
      head: [headers.map(h => h.replace(/_/g, " ").toUpperCase())],
      body: reportData.rows.map(r => headers.map(h => String(r[h] ?? ""))),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [6, 182, 212], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 250, 252] },
    })
    doc.save(`${fileName}.pdf`)
  }

  const reportMeta = visibleReports.find(r => r.id === selectedReport)

  return (
    <div style={{ padding: "24px" }}>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ color: C.text, fontSize: "24px", fontWeight: "800", marginBottom: "4px" }}>📋 Reports</h1>
        <p style={{ color: C.sub, fontSize: "15px" }}>Generate and export marketing reports</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "clamp(220px, 28%, 280px) 1fr", gap: "20px", alignItems: "start", overflowX: "auto" }}>

        {/* ── Report selector ── */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "16px" }}>
          <p style={{ color: C.sub, fontSize: "13px", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Select Report</p>
          {visibleReports.map(r => (
            <button key={r.id} onClick={() => { setSelectedReport(r.id); setReportData(null); setError(null) }}
              style={{
                display: "flex", alignItems: "center", gap: "8px", width: "100%",
                padding: "9px 12px", borderRadius: "9px", marginBottom: "4px",
                background: selectedReport === r.id ? "rgba(6,182,212,0.15)" : "transparent",
                border: selectedReport === r.id ? `1px solid ${C.border}` : "1px solid transparent",
                color: selectedReport === r.id ? C.accent : C.sub,
                cursor: "pointer", fontSize: "15px", fontWeight: selectedReport === r.id ? "600" : "400",
                textAlign: "left", transition: "all 0.15s",
              }}
              onMouseEnter={e => { if (selectedReport !== r.id) { e.currentTarget.style.background = "rgba(6,182,212,0.07)"; e.currentTarget.style.color = "#e2e8f0" } }}
              onMouseLeave={e => { if (selectedReport !== r.id) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.sub } }}
            >
              <span>{r.icon}</span>
              <span style={{ flex: 1 }}>{r.label}</span>
              {r.adminOnly && <span style={{ background: "rgba(167,139,250,0.15)", color: "#a78bfa", borderRadius: "4px", padding: "1px 5px", fontSize: "11px" }}>Admin</span>}
            </button>
          ))}
        </div>

        {/* ── Report area ── */}
        <div>
          {selectedReport ? (
            <div>
              {/* Config panel */}
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "20px", marginBottom: "16px" }}>
                <p style={{ color: C.text, fontWeight: "600", fontSize: "17px", marginBottom: "16px" }}>
                  {reportMeta?.icon} {reportMeta?.label}
                </p>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "16px", alignItems: "flex-end" }}>
                  <div>
                    <p style={{ color: C.sub, fontSize: "13px", marginBottom: "4px" }}>Month</p>
                    <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
                      style={{ background: "rgba(6,182,212,0.06)", color: C.text, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 12px", fontSize: "15px", outline: "none" }}>
                      <option value="">All Months</option>
                      {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <p style={{ color: C.sub, fontSize: "13px", marginBottom: "4px" }}>Year</p>
                    <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)}
                      style={{ background: "rgba(6,182,212,0.06)", color: C.text, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 12px", fontSize: "15px", outline: "none" }}>
                      <option value="">All Years</option>
                      {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div>
                    <p style={{ color: C.sub, fontSize: "13px", marginBottom: "4px" }}>Item</p>
                    <select value={selectedItemId} onChange={e => setSelectedItemId(e.target.value)}
                      style={{ background: "rgba(6,182,212,0.06)", color: C.text, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 12px", fontSize: "15px", outline: "none", maxWidth: "220px" }}>
                      <option value="">All Items</option>
                      {items.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
                    </select>
                  </div>
                  {!selectedMonth && !selectedYear && !selectedItemId && (
                    <p style={{ color: C.sub, fontSize: "13px", alignSelf: "center" }}>No filters selected → shows all data</p>
                  )}
                </div>

                {error && (
                  <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", padding: "10px 14px", color: C.error, fontSize: "15px", marginBottom: "12px" }}>
                    ⚠️ {error}
                  </div>
                )}

                <div style={{ display: "flex", gap: "10px" }}>
                  <button onClick={generateReport} disabled={loading || refLoading}
                    style={{ background: `linear-gradient(135deg, ${C.accent}, ${C.teal})`, color: "#fff", border: "none", borderRadius: "10px", padding: "10px 20px", fontWeight: "600", fontSize: "15px", cursor: (loading || refLoading) ? "not-allowed" : "pointer", opacity: (loading || refLoading) ? 0.6 : 1 }}>
                    {refLoading ? "Loading data..." : loading ? "Generating..." : "Generate Report"}
                  </button>
                  {reportData?.rows?.length > 0 && (<>
                    <button onClick={exportCSV}
                      style={{ background: "rgba(16,185,129,0.15)", color: C.success, border: "1px solid rgba(16,185,129,0.3)", borderRadius: "10px", padding: "10px 16px", fontWeight: "600", fontSize: "15px", cursor: "pointer", transition: "all 0.15s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(16,185,129,0.28)"}
                      onMouseLeave={e => e.currentTarget.style.background = "rgba(16,185,129,0.15)"}
                    >⬇️ CSV</button>
                    <button onClick={exportExcel}
                      style={{ background: "rgba(34,197,94,0.12)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "10px", padding: "10px 16px", fontWeight: "600", fontSize: "15px", cursor: "pointer", transition: "all 0.15s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(34,197,94,0.25)"}
                      onMouseLeave={e => e.currentTarget.style.background = "rgba(34,197,94,0.12)"}
                    >📊 Excel</button>
                    <button onClick={exportPDF}
                      style={{ background: "rgba(239,68,68,0.12)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "10px", padding: "10px 16px", fontWeight: "600", fontSize: "15px", cursor: "pointer", transition: "all 0.15s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(239,68,68,0.22)"}
                      onMouseLeave={e => e.currentTarget.style.background = "rgba(239,68,68,0.12)"}
                    >📄 PDF</button>
                  </>)}
                </div>
              </div>

              {/* Output */}
              {reportData && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                    <p style={{ color: C.text, fontWeight: "600", fontSize: "16px" }}>
                      {reportData.rows.length} record{reportData.rows.length !== 1 ? "s" : ""}
                    </p>
                    <p style={{ color: C.sub, fontSize: "13px" }}>Generated: {reportData.generatedAt}</p>
                  </div>
                  <ReportTable type={reportData.type} rows={reportData.rows} />
                </motion.div>
              )}
            </div>
          ) : (
            <div style={{ background: "rgba(6,182,212,0.04)", border: "1px dashed rgba(6,182,212,0.2)", borderRadius: "16px", padding: "60px", textAlign: "center" }}>
              <p style={{ fontSize: "40px", marginBottom: "12px" }}>📋</p>
              <p style={{ color: C.sub }}>Select a report from the left to get started</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// All rows are pre-resolved flat objects — just render them
function ReportTable({ type, rows }) {
  if (!rows.length) return <NoData />

  const COLS = {
    monthly_stock:      ["item", "location", "quantity", "min_level", "unit", "status"],
    class_distribution: ["class", "class_date", "item", "quantity", "status"],
    event_distribution: ["event", "event_date", "item", "qty_needed", "signed_out", "returned", "damaged", "signed_out_by"],
    budget_actual:      ["event", "date", "status", "budget", "actual", "variance", "over_budget"],
    low_stock:          ["item", "unit", "total_qty", "min_level", "shortage", "status"],
    supplier_history:   ["date", "item", "supplier", "quantity", "unit", "cost_per_unit", "total_cost", "received_by", "notes"],
    defective:          ["date", "source", "item", "qty_damaged", "reported_by", "notes"],
    movement_history:   ["date", "type", "item", "location", "quantity", "performed_by", "reason", "notes"],
    per_person:         ["person", "item", "total_qty", "unit"],
    monthly_spending:   ["month", "purchase_cost", "event_cost", "total_spending"],
    admin_activity:     ["admin", "decision_date", "requester", "item", "quantity", "status"],
  }

  const LABELS = {
    monthly_stock:      ["Item", "Location", "Qty", "Min Level", "Unit", "Status"],
    class_distribution: ["Class", "Date", "Item", "Qty", "Status"],
    event_distribution: ["Event", "Date", "Item", "Qty Needed", "Signed Out", "Returned", "Damaged", "By"],
    budget_actual:      ["Event", "Date", "Status", "Budget", "Actual", "Variance", "Over Budget?"],
    low_stock:          ["Item", "Unit", "Total Qty", "Min Level", "Shortage", "Status"],
    supplier_history:   ["Date", "Item", "Supplier", "Qty", "Unit", "Cost/Unit", "Total Cost", "Received By", "Notes"],
    defective:          ["Date", "Source", "Item", "Qty Damaged", "Reported By", "Notes"],
    movement_history:   ["Date", "Type", "Item", "Location", "Qty", "Performed By", "Reason", "Notes"],
    per_person:         ["Person", "Item", "Total Qty", "Unit"],
    monthly_spending:   ["Month", "Purchase Cost", "Event Cost", "Total Spending"],
    admin_activity:     ["Admin", "Decision Date", "Requester", "Item", "Quantity", "Status"],
  }

  const cols   = COLS[type]   || Object.keys(rows[0])
  const labels = LABELS[type] || cols

  // Color hints for specific columns
  const colorFor = (type, col, val) => {
    if (col === "status" && typeof val === "string") {
      if (val.includes("🔴") || val.includes("Out"))  return C.error
      if (val.includes("🟡") || val.includes("Low"))  return C.warning
      if (val.includes("🟢") || val.includes("OK"))   return C.success
      if (val === "approved") return C.success
      if (val === "rejected") return C.error
    }
    if (col === "shortage" && Number(val) > 0) return C.error
    if (col === "over_budget" && val === "⚠️ Yes") return C.warning
    if (col === "type") {
      if (String(val).includes("In"))  return C.success
      if (String(val).includes("Out")) return C.error
    }
    return undefined
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "15px" }}>
        <thead>
          <tr>
            {labels.map(l => (
              <th key={l} style={{ color: "#94a3b8", textAlign: "left", padding: "8px 12px", borderBottom: "1px solid rgba(6,182,212,0.2)", fontSize: "13px", fontWeight: "600", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                {l}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: "1px solid rgba(6,182,212,0.06)" }}>
              {cols.map(col => (
                <td key={col} style={{ color: colorFor(type, col, row[col]) || "#e2e8f0", padding: "9px 12px", fontSize: "15px" }}>
                  {row[col] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function NoData() {
  return <p style={{ color: "#64748b", textAlign: "center", padding: "32px" }}>No data for selected period</p>
}
