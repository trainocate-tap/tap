import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../../lib/supabase"
import { useAuth } from "../../context/AuthContext"
import { motion } from "framer-motion"

const C = {
  accent:  "#06b6d4",
  teal:    "#14b8a6",
  card:    "rgba(6,182,212,0.06)",
  border:  "rgba(6,182,212,0.18)",
  text:    "#ffffff",
  sub:     "#94a3b8",
  success: "#10b981",
  warning: "#f59e0b",
  error:   "#ef4444",
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, color, sub, onClick }) {
  return (
    <motion.div
      whileHover={{ scale: 1.02, boxShadow: "0 8px 30px rgba(6,182,212,0.12)" }}
      onClick={onClick}
      style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: "16px",
        padding: "20px", cursor: onClick ? "pointer" : "default",
        backdropFilter: "blur(8px)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <p style={{ color: C.sub, fontSize: "13px", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</p>
          <p style={{ color: color || C.accent, fontSize: "34px", fontWeight: "800", lineHeight: 1 }}>{value}</p>
          {sub && <p style={{ color: C.sub, fontSize: "13px", marginTop: "5px" }}>{sub}</p>}
        </div>
        <span style={{ fontSize: "26px", opacity: 0.85 }}>{icon}</span>
      </div>
    </motion.div>
  )
}

function Section({ title, action, children }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: "28px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
        <h2 style={{ color: "#e2e8f0", fontSize: "17px", fontWeight: "700" }}>{title}</h2>
        {action && (
          <button onClick={action.onClick} style={{ background: "none", border: "none", color: C.accent, fontSize: "14px", cursor: "pointer", fontWeight: "600" }}>
            {action.label} →
          </button>
        )}
      </div>
      {children}
    </motion.div>
  )
}

function EmptyCard({ text, icon = "📭" }) {
  return (
    <div style={{
      background: "rgba(6,182,212,0.03)", border: "1px dashed rgba(6,182,212,0.2)",
      borderRadius: "12px", padding: "28px", textAlign: "center", color: C.sub,
    }}>
      <p style={{ fontSize: "28px", marginBottom: "8px" }}>{icon}</p>
      <p style={{ fontSize: "15px" }}>{text}</p>
    </div>
  )
}

function PackingBadge({ gifts }) {
  if (!gifts?.length) return <span style={{ background: "rgba(148,163,184,0.1)", color: C.sub, border: "1px solid rgba(148,163,184,0.2)", borderRadius: "8px", padding: "2px 8px", fontSize: "13px" }}>No gifts</span>
  const allDist = gifts.every(g => g.is_distributed)
  const allPacked = gifts.every(g => g.is_packed)
  if (allDist) return <span style={{ background: "rgba(16,185,129,0.15)", color: C.success, border: "1px solid rgba(16,185,129,0.3)", borderRadius: "8px", padding: "2px 8px", fontSize: "13px", fontWeight: "600" }}>🟢 Distributed</span>
  if (allPacked) return <span style={{ background: "rgba(245,158,11,0.15)", color: C.warning, border: "1px solid rgba(245,158,11,0.3)", borderRadius: "8px", padding: "2px 8px", fontSize: "13px", fontWeight: "600" }}>🟡 Packed</span>
  return <span style={{ background: "rgba(239,68,68,0.12)", color: C.error, border: "1px solid rgba(239,68,68,0.25)", borderRadius: "8px", padding: "2px 8px", fontSize: "13px", fontWeight: "600" }}>🔴 Not Packed</span>
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MarketingDashboard() {
  const navigate = useNavigate()
  const { userProfile } = useAuth()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [totalItems, setTotalItems] = useState(0)
  const [lowStock, setLowStock] = useState([])
  const [weekClasses, setWeekClasses] = useState([])
  const [upcomingEvents, setUpcomingEvents] = useState([])
  const [recentMovements, setRecentMovements] = useState([])
  const [itemNameById, setItemNameById] = useState({})

  // Use the same name field as IT sidebar
  const firstName = (userProfile?.name || userProfile?.full_name || userProfile?.email || "").split(" ")[0] || "there"

  useEffect(() => {
    fetchAll()
  }, [])

  const fetchAll = async () => {
    setLoading(true)
    setError(null)
    try {
      const today = new Date()
      const toLocalStr = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`
      const todayStr = toLocalStr(today)

      // Week bounds (Mon–Sun) using local dates to avoid UTC timezone offset issues
      const dow = today.getDay() // 0=Sun
      const diffToMon = dow === 0 ? -6 : 1 - dow
      const weekStart = new Date(today)
      weekStart.setDate(today.getDate() + diffToMon)
      weekStart.setHours(0, 0, 0, 0)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 6)
      weekEnd.setHours(23, 59, 59, 999)
      const weekStartStr = toLocalStr(weekStart)
      const weekEndStr   = toLocalStr(weekEnd)

      const [
        { data: items,     error: e1 },
        { data: stock,     error: e2 },
        { data: classes,   error: e3 },
        { data: events,    error: e4 },
        { data: movements, error: e5 },
      ] = await Promise.all([
        supabase.from("marketing_items").select("id, name, minimum_stock_level"),
        supabase.from("marketing_stock").select("item_id, quantity"),
        supabase.from("marketing_classes")
          .select("*, marketing_class_gifts(*)")
          .gte("class_date", weekStartStr)
          .lte("class_date", weekEndStr)
          .order("class_date"),
        supabase.from("marketing_events")
          .select("id, event_name, event_date, partner_category, project_lead, event_modality, status")
          .gte("event_date", todayStr)
          .order("event_date")
          .limit(6),
        supabase.from("marketing_stock_movements")
          .select("id, movement_type, quantity, reason, performed_by_name, created_at, item_id")
          .order("created_at", { ascending: false })
          .limit(10),
      ])

      // Soft-handle table-not-found errors (migration not run yet)
      if (e1?.code === "42P01" || e2?.code === "42P01") {
        setError("Marketing tables not set up yet. Please run the database migration (010_marketing_module.sql).")
        setLoading(false)
        return
      }

      const itemList = items || []
      const stockList = stock || []

      // Stock per item
      const stockMap = {}
      stockList.forEach(s => { stockMap[s.item_id] = (stockMap[s.item_id] || 0) + (s.quantity || 0) })

      const lowItems = itemList.filter(item => {
        const qty = stockMap[item.id] || 0
        return (item.minimum_stock_level || 0) > 0 && qty <= item.minimum_stock_level
      }).map(item => ({ ...item, currentStock: stockMap[item.id] || 0 }))

      const nameById = {}
      itemList.forEach(item => { nameById[item.id] = item.name })

      setTotalItems(itemList.length)
      setLowStock(lowItems)
      setWeekClasses(classes || [])
      setUpcomingEvents(events || [])
      setRecentMovements(movements || [])
      setItemNameById(nameById)
    } catch (err) {
      console.error("[MarketingDashboard] fetchAll error:", err)
      setError("Could not load dashboard data. Please try refreshing.")
    }
    setLoading(false)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "flex", gap: "6px", justifyContent: "center", marginBottom: "12px" }}>
            {[0, 120, 240].map(delay => (
              <div key={delay} style={{ width: "8px", height: "8px", borderRadius: "50%", background: C.accent, animation: `bounce 1.2s ${delay}ms infinite ease-in-out` }} />
            ))}
          </div>
          <p style={{ color: C.sub, fontSize: "15px" }}>Loading dashboard…</p>
          <style>{`@keyframes bounce { 0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)} }`}</style>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: "40px", maxWidth: "600px" }}>
        <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "16px", padding: "24px" }}>
          <p style={{ fontSize: "28px", marginBottom: "10px" }}>⚠️</p>
          <p style={{ color: C.error, fontWeight: "600", fontSize: "17px", marginBottom: "6px" }}>Setup Required</p>
          <p style={{ color: C.sub, fontSize: "15px", marginBottom: "16px" }}>{error}</p>
          <button onClick={fetchAll} style={{ background: `linear-gradient(135deg, ${C.accent}, ${C.teal})`, color: "#fff", border: "none", borderRadius: "8px", padding: "8px 18px", cursor: "pointer", fontWeight: "600", fontSize: "15px" }}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: "24px", maxWidth: "1100px" }}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: "26px" }}>
        <h1 style={{ color: C.text, fontSize: "24px", fontWeight: "800", marginBottom: "4px" }}>🎯 Marketing Dashboard</h1>
        <p style={{ color: C.sub, fontSize: "15px" }}>Welcome back to Marketing — Trainocate Asset Portal 🇸🇬 Singapore, {firstName}!</p>
      </motion.div>

      {/* 4 stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px", marginBottom: "28px" }}>
        <StatCard icon="📦" label="Total Items"         value={totalItems}          onClick={() => navigate("/marketing/items")} />
        <StatCard icon="⚠️" label="Low Stock Items"     value={lowStock.length}     color={lowStock.length > 0 ? C.error : C.success} sub="Below minimum level" />
        <StatCard icon="🎁" label="This Week's Classes" value={weekClasses.length}  color={C.teal}    onClick={() => navigate("/marketing/classes")} />
        <StatCard icon="🎪" label="Upcoming Events"     value={upcomingEvents.length} color="#a78bfa" onClick={() => navigate("/marketing/events")} />
      </div>

      {/* This week's classes */}
      <Section title="🎁 This Week's Classes" action={{ label: "View All", onClick: () => navigate("/marketing/classes") }}>
        {weekClasses.length === 0
          ? <EmptyCard text="No classes scheduled this week. Add one in Class Gifts!" icon="🎓" />
          : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "12px" }}>
              {weekClasses.map(cls => (
                <motion.div
                  key={cls.id}
                  whileHover={{ scale: 1.02 }}
                  onClick={() => navigate("/marketing/classes")}
                  style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "16px", cursor: "pointer" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                    <div style={{ flex: 1, minWidth: 0, marginRight: "8px" }}>
                      <p style={{ color: C.text, fontWeight: "600", fontSize: "16px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cls.class_name}</p>
                      {cls.class_type && <p style={{ color: C.sub, fontSize: "13px", marginTop: "2px" }}>{cls.class_type}</p>}
                    </div>
                    <PackingBadge gifts={cls.marketing_class_gifts} />
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    <Chip icon="📅" label={cls.class_date} />
                    {cls.classroom && <Chip icon="🏫" label={cls.classroom} />}
                    {cls.pax_confirmed > 0 && <Chip icon="👥" label={`${cls.pax_confirmed} pax`} />}
                    <Chip icon="🎁" label={`${cls.marketing_class_gifts?.length || 0} gift types`} />
                  </div>
                </motion.div>
              ))}
            </div>
          )
        }
      </Section>

      {/* Low stock alerts */}
      <Section title="⚠️ Low Stock Alerts" action={{ label: "View Items", onClick: () => navigate("/marketing/items") }}>
        {lowStock.length === 0
          ? <EmptyCard text="All stock levels healthy ✅" icon="✅" />
          : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {lowStock.map(item => (
                <motion.div
                  key={item.id}
                  whileHover={{ scale: 1.005 }}
                  style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "12px", padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}
                >
                  <div>
                    <p style={{ color: C.text, fontWeight: "600", fontSize: "16px" }}>{item.name}</p>
                    <p style={{ color: "#f87171", fontSize: "14px", marginTop: "2px" }}>
                      Stock: <b>{item.currentStock}</b> · Minimum: <b>{item.minimum_stock_level}</b>
                    </p>
                  </div>
                  <button
                    onClick={() => navigate("/marketing/approvals")}
                    style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171", borderRadius: "8px", padding: "6px 12px", fontSize: "13px", fontWeight: "600", cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    Request Restock
                  </button>
                </motion.div>
              ))}
            </div>
          )
        }
      </Section>

      {/* Upcoming events */}
      <Section title="📅 Upcoming Events" action={{ label: "View All", onClick: () => navigate("/marketing/events") }}>
        {upcomingEvents.length === 0
          ? <EmptyCard text="No upcoming events. Add one in Events!" icon="🎪" />
          : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "12px" }}>
              {upcomingEvents.map(ev => (
                <motion.div
                  key={ev.id}
                  whileHover={{ scale: 1.02 }}
                  onClick={() => navigate("/marketing/events")}
                  style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "16px", cursor: "pointer" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                    <p style={{ color: C.text, fontWeight: "600", fontSize: "16px", flex: 1, marginRight: "8px" }}>{ev.event_name}</p>
                    <span style={{ background: "rgba(167,139,250,0.15)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.3)", borderRadius: "8px", padding: "2px 8px", fontSize: "12px", fontWeight: "600", flexShrink: 0, textTransform: "capitalize" }}>
                      {ev.status}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    <Chip icon="📅" label={ev.event_date} />
                    {ev.partner_category && <Chip icon="🤝" label={ev.partner_category} />}
                    {ev.project_lead && <Chip icon="👤" label={ev.project_lead} />}
                    {ev.event_modality && <Chip icon="📍" label={ev.event_modality} />}
                  </div>
                </motion.div>
              ))}
            </div>
          )
        }
      </Section>

      {/* Recent activity */}
      <Section title="🕐 Recent Activity">
        {recentMovements.length === 0
          ? <EmptyCard text="No stock movements yet. Record your first stock in or out!" icon="📊" />
          : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {recentMovements.map(m => (
                <div key={m.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: "18px", flexShrink: 0 }}>
                      {m.movement_type === "stock_in" ? "📥" : m.movement_type === "stock_out" ? "📤" : "🔄"}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ color: C.text, fontSize: "15px", fontWeight: "500", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <span style={{ color: m.movement_type === "stock_in" ? C.success : m.movement_type === "stock_out" ? C.error : C.accent }}>
                          {m.movement_type === "stock_in" ? "Stock In" : m.movement_type === "stock_out" ? "Stock Out" : m.movement_type}
                        </span>
                        {" · "}{itemNameById[m.item_id] || "Unknown item"}
                        {" · "}<b style={{ color: C.accent }}>{m.quantity} units</b>
                      </p>
                      {m.performed_by_name && <p style={{ color: C.sub, fontSize: "13px", marginTop: "1px" }}>by {m.performed_by_name}</p>}
                    </div>
                  </div>
                  <p style={{ color: C.sub, fontSize: "13px", whiteSpace: "nowrap", flexShrink: 0 }}>
                    {new Date(m.created_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )
        }
      </Section>
    </div>
  )
}

function Chip({ icon, label }) {
  return (
    <span style={{ color: "#94a3b8", fontSize: "13px", display: "inline-flex", alignItems: "center", gap: "3px" }}>
      {icon} {label}
    </span>
  )
}
