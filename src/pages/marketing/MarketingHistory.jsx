import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"
import { useAuth } from "../../context/AuthContext"
import { motion } from "framer-motion"

const C = {
  accent: "#06b6d4", teal: "#14b8a6",
  card: "rgba(6,182,212,0.06)", border: "rgba(6,182,212,0.18)",
  text: "#ffffff", sub: "#94a3b8",
  success: "#10b981", warning: "#f59e0b", error: "#ef4444",
}

export default function MarketingHistory() {
  const { userProfile, canManageMarketing } = useAuth()
  const [movements, setMovements] = useState([])
  const [approvals, setApprovals] = useState([])
  const [stocktakes, setStocktakes] = useState([])
  const [items, setItems] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterFrom, setFilterFrom] = useState("")
  const [filterTo, setFilterTo] = useState("")
  const [activeTab, setActiveTab] = useState("movements")

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const userId = userProfile?.id
    const isAdmin = canManageMarketing

    // Build movement query — no joins, apply user filter correctly
    let movQ = supabase
      .from("marketing_stock_movements")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300)
    if (!isAdmin && userId) movQ = movQ.eq("performed_by", userId)

    // Build approvals query
    let appQ = supabase
      .from("marketing_approvals")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200)
    if (!isAdmin && userId) appQ = appQ.eq("requested_by", userId)

    // Build stocktake query
    let stQ = supabase
      .from("marketing_stocktake")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200)
    if (!isAdmin && userId) stQ = stQ.eq("performed_by", userId)

    const [
      { data: m, error: mErr },
      { data: a, error: aErr },
      { data: s, error: sErr },
      { data: i },
      { data: l },
    ] = await Promise.all([
      movQ,
      appQ,
      stQ,
      supabase.from("marketing_items").select("id, name, unit"),
      supabase.from("marketing_locations").select("id, name"),
    ])

    if (mErr) console.error("[History] movements fetch error:", mErr.message)
    if (aErr) console.error("[History] approvals fetch error:", aErr.message)
    if (sErr) console.error("[History] stocktake fetch error:", sErr.message)

    setMovements(m || [])
    setApprovals(a || [])
    setStocktakes(s || [])
    setItems(i || [])
    setLocations(l || [])
    setLoading(false)
  }

  // Resolve helpers
  const itemName = (id) => items.find(i => i.id === id)?.name || "Unknown item"
  const locName = (id) => locations.find(l => l.id === id)?.name || null

  const applyDateFilter = (list) =>
    list.filter(row => {
      const date = new Date(row.created_at)
      if (filterFrom && date < new Date(filterFrom)) return false
      if (filterTo && date > new Date(filterTo + "T23:59:59")) return false
      return true
    })

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleString() : "—"

  return (
    <div style={{ padding: "24px" }}>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ color: C.text, fontSize: "24px", fontWeight: "800", marginBottom: "4px" }}>📜 History</h1>
        <p style={{ color: C.sub, fontSize: "15px" }}>
          {canManageMarketing ? "Full audit trail — all users" : "Your activity only"}
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "20px", flexWrap: "wrap" }}>
        {[
          ["movements", `📊 Stock Movements (${movements.length})`],
          ["approvals", `✅ Approvals (${approvals.length})`],
          ["stocktake", `🔢 Stocktake (${stocktakes.length})`],
        ].map(([t, label]) => (
          <button key={t} onClick={() => setActiveTab(t)} style={{
            padding: "8px 16px", borderRadius: "10px", border: "none", cursor: "pointer", fontWeight: "600", fontSize: "15px",
            background: activeTab === t ? `linear-gradient(135deg, ${C.accent}, ${C.teal})` : "rgba(6,182,212,0.08)",
            color: activeTab === t ? "#fff" : C.sub,
          }}>{label}</button>
        ))}
      </div>

      {/* Date filters */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ color: C.sub, fontSize: "14px" }}>From</span>
          <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
            style={{ background: "rgba(6,182,212,0.06)", color: C.text, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 12px", fontSize: "15px", outline: "none" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ color: C.sub, fontSize: "14px" }}>To</span>
          <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
            style={{ background: "rgba(6,182,212,0.06)", color: C.text, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "8px 12px", fontSize: "15px", outline: "none" }} />
        </div>
        {(filterFrom || filterTo) && (
          <button onClick={() => { setFilterFrom(""); setFilterTo("") }}
            style={{ background: "rgba(239,68,68,0.1)", color: C.error, border: "none", borderRadius: "8px", padding: "8px 12px", fontSize: "14px", cursor: "pointer" }}>
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <p style={{ color: C.sub }}>Loading history...</p>
      ) : (
        <>
          {/* ── Stock Movements ── */}
          {activeTab === "movements" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {applyDateFilter(movements).map(m => {
                const isIn = m.movement_type === "stock_in"
                const loc = locName(m.location_id)
                return (
                  <motion.div key={m.id} whileHover={{ scale: 1.002 }}
                    style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                        <span style={{ fontSize: "20px", flexShrink: 0, marginTop: "1px" }}>{isIn ? "📥" : "📤"}</span>
                        <div>
                          <p style={{ color: C.text, fontSize: "15px", fontWeight: "600" }}>
                            {itemName(m.item_id)}
                            {" · "}
                            <span style={{ color: isIn ? C.success : C.error }}>
                              {isIn ? "+" : "-"}{m.quantity} {items.find(i => i.id === m.item_id)?.unit || "units"}
                            </span>
                          </p>
                          <p style={{ color: C.sub, fontSize: "13px", marginTop: "3px" }}>
                            {isIn ? "Stock In" : "Stock Out"}
                            {loc ? ` · 📍 ${loc}` : ""}
                            {m.performed_by_name ? ` · by ${m.performed_by_name}` : ""}
                            {m.reason ? ` · ${m.reason}` : ""}
                          </p>
                          {m.notes && <p style={{ color: C.sub, fontSize: "13px", fontStyle: "italic", marginTop: "2px" }}>{m.notes}</p>}
                        </div>
                      </div>
                      <p style={{ color: C.sub, fontSize: "13px", flexShrink: 0 }}>{fmtDate(m.created_at)}</p>
                    </div>
                  </motion.div>
                )
              })}
              {applyDateFilter(movements).length === 0 && (
                <EmptyState text={movements.length === 0 ? "No stock movements recorded yet" : "No movements match the selected date range"} />
              )}
            </div>
          )}

          {/* ── Approvals ── */}
          {activeTab === "approvals" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {applyDateFilter(approvals).map(a => (
                <div key={a.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "14px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                    <div>
                      <p style={{ color: C.text, fontSize: "15px", fontWeight: "600" }}>
                        {a.requested_by_name || "Unknown"} requested {itemName(a.item_id)} × {a.quantity}
                      </p>
                      {a.reason && <p style={{ color: C.sub, fontSize: "13px", marginTop: "3px" }}>Reason: {a.reason}</p>}
                      {a.rejection_reason && <p style={{ color: C.error, fontSize: "13px", marginTop: "2px" }}>Rejected: {a.rejection_reason}</p>}
                      {a.approver_name && <p style={{ color: C.sub, fontSize: "13px", marginTop: "2px" }}>Reviewed by: {a.approver_name}</p>}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                      <span style={{
                        background: a.status === "approved" ? "rgba(16,185,129,0.15)" : a.status === "rejected" ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.15)",
                        color: a.status === "approved" ? C.success : a.status === "rejected" ? C.error : C.warning,
                        border: a.status === "approved" ? "1px solid rgba(16,185,129,0.3)" : a.status === "rejected" ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(245,158,11,0.3)",
                        borderRadius: "8px", padding: "2px 8px", fontSize: "13px", fontWeight: "600", textTransform: "capitalize",
                      }}>{a.status}</span>
                      <p style={{ color: C.sub, fontSize: "13px" }}>{fmtDate(a.created_at)}</p>
                    </div>
                  </div>
                </div>
              ))}
              {applyDateFilter(approvals).length === 0 && (
                <EmptyState text={approvals.length === 0 ? "No approvals recorded yet" : "No approvals match the selected date range"} />
              )}
            </div>
          )}

          {/* ── Stocktake ── */}
          {activeTab === "stocktake" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {applyDateFilter(stocktakes).map(s => {
                const loc = locName(s.location_id)
                return (
                  <div key={s.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "14px 16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                      <div>
                        <p style={{ color: C.text, fontSize: "15px", fontWeight: "600" }}>
                          {itemName(s.item_id)}
                          {loc && <span style={{ color: C.sub, fontWeight: "400" }}> · 📍 {loc}</span>}
                        </p>
                        <p style={{ color: C.sub, fontSize: "14px", marginTop: "3px" }}>
                          System: <b style={{ color: C.text }}>{s.system_quantity}</b>
                          {" · "}Actual: <b style={{ color: C.text }}>{s.actual_quantity}</b>
                          {" · "}Discrepancy:{" "}
                          <b style={{ color: s.discrepancy !== 0 ? (s.discrepancy > 0 ? C.success : C.error) : C.sub }}>
                            {s.discrepancy >= 0 ? "+" : ""}{s.discrepancy}
                          </b>
                        </p>
                        {s.notes && <p style={{ color: C.sub, fontSize: "13px", fontStyle: "italic", marginTop: "2px" }}>{s.notes}</p>}
                        {s.performed_by_name && <p style={{ color: C.sub, fontSize: "13px", marginTop: "2px" }}>by {s.performed_by_name}</p>}
                      </div>
                      <p style={{ color: C.sub, fontSize: "13px", flexShrink: 0 }}>{s.stocktake_date || fmtDate(s.created_at)}</p>
                    </div>
                  </div>
                )
              })}
              {applyDateFilter(stocktakes).length === 0 && (
                <EmptyState text={stocktakes.length === 0 ? "No stocktake records yet" : "No records match the selected date range"} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function EmptyState({ text }) {
  return (
    <div style={{ textAlign: "center", padding: "40px", color: "#64748b", background: "rgba(6,182,212,0.04)", border: "1px dashed rgba(6,182,212,0.2)", borderRadius: "12px" }}>
      {text}
    </div>
  )
}
