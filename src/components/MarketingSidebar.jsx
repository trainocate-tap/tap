import { useState, useEffect } from "react"
import { NavLink, useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { useAuth } from "../context/AuthContext"
import { motion, AnimatePresence } from "framer-motion"

const MKT = {
  bg:      "#071920",
  primary: "#0f2730",
  accent:  "#06b6d4",
  teal:    "#14b8a6",
  text:    "#ffffff",
  sub:     "#94a3b8",
  border:  "rgba(6,182,212,0.2)",
  hover:   "rgba(6,182,212,0.12)",
  active:  "rgba(6,182,212,0.18)",
}

const navItems = [
  { label: "Dashboard",    path: "/marketing/dashboard", icon: "🏠" },
  { label: "Items",        path: "/marketing/items",     icon: "📦" },
  { label: "Stock In/Out", path: "/marketing/stock",     icon: "📊" },
  { label: "Class Gifts",  path: "/marketing/classes",   icon: "🎁" },
  { label: "Events",       path: "/marketing/events",    icon: "🎪" },
  { label: "Approvals",    path: "/marketing/approvals", icon: "✅" },
  { label: "Reports",      path: "/marketing/reports",   icon: "📋" },
  { label: "History",      path: "/marketing/history",   icon: "📜" },
  { label: "Stocktake",    path: "/marketing/stocktake", icon: "🔢" },
  { label: "Ads",          path: "/marketing/ads",       icon: "📢" },
  { label: "Settings",     path: "/marketing/settings",  icon: "⚙️" },
]

const notifIcon = {
  low_stock: "🔔", approved: "✅", rejected: "❌",
  stock_in: "📦", qr_note: "👋", event: "⏰", stocktake: "📋", info: "ℹ️",
}

export default function MarketingSidebar() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [showNotif, setShowNotif] = useState(false)
  const { userProfile, role, isMarketing } = useAuth()
  const navigate = useNavigate()

  const displayName = userProfile?.name || userProfile?.full_name || userProfile?.email || "Marketing User"
  const firstLetter = (displayName[0] || "M").toUpperCase()

  const marketingRole = userProfile?.marketing_role
  const visibleNavItems = marketingRole === "bdm"
    ? navItems.filter(item => ["/marketing/dashboard", "/marketing/items", "/marketing/approvals"].includes(item.path))
    : marketingRole === "bdms"
    ? navItems.filter(item => ["/marketing/dashboard", "/marketing/items"].includes(item.path))
    : navItems.filter(item => item.path !== "/marketing/ads" || marketingRole === "marketing_admin")

  useEffect(() => {
    if (!userProfile?.id) return
    fetchNotifications()
  }, [userProfile?.id])

  const fetchNotifications = async () => {
    const { data } = await supabase
      .from("marketing_notifications")
      .select("*")
      .eq("user_id", userProfile.id)
      .order("created_at", { ascending: false })
      .limit(15)
    setNotifications(data || [])
  }

  const markAllRead = async () => {
    await supabase.from("marketing_notifications").update({ is_read: true }).eq("user_id", userProfile.id)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  const clearAll = async () => {
    await supabase.from("marketing_notifications").delete().eq("user_id", userProfile.id)
    setNotifications([])
    setShowNotif(false)
  }

  const unread = notifications.filter(n => !n.is_read).length

  const BellButton = ({ size = 18 }) => (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setShowNotif(v => !v)}
        style={{
          background: "rgba(6,182,212,0.1)", border: `1px solid ${MKT.border}`,
          borderRadius: "9px", width: size + 18, height: size + 18,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", fontSize: size, position: "relative",
          transition: "background 0.15s",
        }}
        onMouseEnter={e => e.currentTarget.style.background = "rgba(6,182,212,0.2)"}
        onMouseLeave={e => e.currentTarget.style.background = "rgba(6,182,212,0.1)"}
      >
        🔔
        {unread > 0 && (
          <span style={{
            position: "absolute", top: "-4px", right: "-4px",
            background: "#ef4444", color: "#fff",
            fontSize: "9px", fontWeight: "700",
            borderRadius: "9px", padding: "1px 5px",
            minWidth: "16px", textAlign: "center",
          }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    </div>
  )

  const NotifDropdown = () => (
    <AnimatePresence>
      {showNotif && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 9997 }} onClick={() => setShowNotif(false)} />
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            style={{
              position: "fixed", top: "64px", left: "16px",
              width: "320px", zIndex: 9998,
              background: "#0f2730", border: `1px solid ${MKT.border}`,
              borderRadius: "16px",
              boxShadow: "0 20px 60px rgba(0,0,0,0.5), 0 0 30px rgba(6,182,212,0.1)",
              overflow: "hidden", maxHeight: "400px",
              display: "flex", flexDirection: "column",
            }}
          >
            <div style={{ padding: "13px 16px", borderBottom: `1px solid ${MKT.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <span style={{ color: MKT.text, fontWeight: "600", fontSize: "14px" }}>Notifications</span>
              <div style={{ display: "flex", gap: "10px" }}>
                <button onClick={markAllRead} style={{ color: MKT.accent, fontSize: "11px", background: "none", border: "none", cursor: "pointer" }}>Mark all read</button>
                <button onClick={clearAll} style={{ color: "#ef4444", fontSize: "11px", background: "none", border: "none", cursor: "pointer" }}>Clear all</button>
              </div>
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {notifications.length === 0
                ? <div style={{ padding: "28px", textAlign: "center", color: MKT.sub, fontSize: "13px" }}>No notifications</div>
                : notifications.map(n => (
                  <div key={n.id} style={{ padding: "11px 16px", borderBottom: "1px solid rgba(6,182,212,0.07)", background: n.is_read ? "transparent" : "rgba(6,182,212,0.05)" }}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                      <span style={{ fontSize: "15px", flexShrink: 0, marginTop: "1px" }}>{notifIcon[n.type] || "🔔"}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ color: n.is_read ? MKT.sub : MKT.text, fontSize: "13px", fontWeight: n.is_read ? "400" : "600", lineHeight: 1.3, margin: 0 }}>{n.title}</p>
                        <p style={{ color: MKT.sub, fontSize: "11px", marginTop: "2px", marginBottom: 0 }}>{n.message}</p>
                        <p style={{ color: "rgba(148,163,184,0.5)", fontSize: "10px", marginTop: "3px", marginBottom: 0 }}>{new Date(n.created_at).toLocaleString()}</p>
                      </div>
                      {!n.is_read && <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: MKT.accent, flexShrink: 0, marginTop: "5px" }} />}
                    </div>
                  </div>
                ))
              }
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  const SidebarBody = () => (
    <div style={{ width: "288px", height: "100%", backgroundColor: MKT.bg, borderRight: `1px solid ${MKT.border}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Cyan accent stripe */}
      <div style={{ height: "3px", background: `linear-gradient(90deg, ${MKT.accent}, ${MKT.teal})`, flexShrink: 0 }} />

      {/* ── TOP: Logo + User info — inline, never scrolls (matches IT Sidebar layout) ── */}
      <div className="shrink-0">
        <div className="hidden md:flex items-center gap-3 px-4 pt-4 pb-3" style={{ borderBottom: `1px solid ${MKT.border}` }}>
          <img src="/trainocate-logo.png" alt="Trainocate" style={{ width: "80px", flexShrink: 0, background: "transparent", filter: "none" }} />
          {userProfile && (
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div style={{
                width: "32px", height: "32px", borderRadius: "50%",
                background: `linear-gradient(135deg, ${MKT.accent}, ${MKT.teal})`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontWeight: "700", fontSize: "13px", flexShrink: 0,
              }}>
                {firstLetter}
              </div>
              <div className="min-w-0 flex-1">
                <p style={{ color: MKT.text, fontSize: "13px", fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>
                  {displayName}
                </p>
                <span style={{ display: "inline-block", background: "rgba(6,182,212,0.15)", border: "1px solid rgba(6,182,212,0.3)", color: MKT.accent, fontSize: "10px", padding: "1px 7px", borderRadius: "6px", fontWeight: "600", marginTop: "2px" }}>
                  {userProfile?.marketing_role || (role === "admin" ? "IT Admin" : "Marketing")}
                </span>
              </div>
            </div>
          )}
        </div>
        <div className="h-14 md:hidden" />
      </div>

      {/* Module toggle — any user with marketing_access */}
      {isMarketing && (
        <div style={{ padding: "10px 14px", borderBottom: `1px solid ${MKT.border}`, flexShrink: 0 }}>
          <p style={{ color: MKT.sub, fontSize: "10px", marginBottom: "7px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Switch Module</p>
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              onClick={() => {
                setOpen(false)
                const goesToDashboard = role === "admin" || ["marketing_admin", "marketing_manager"].includes(marketingRole)
                navigate(goesToDashboard ? "/admin" : "/admin/assets")
              }}
              style={{ flex: 1, padding: "6px 4px", borderRadius: "7px", background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.25)", color: "#60a5fa", fontSize: "11px", fontWeight: "600", cursor: "pointer", transition: "all 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(59,130,246,0.18)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(59,130,246,0.08)"}
            >
              🖥️ IT Portal
            </button>
            <button
              style={{ flex: 1, padding: "6px 4px", borderRadius: "7px", background: "rgba(6,182,212,0.2)", border: `1px solid ${MKT.accent}`, color: MKT.accent, fontSize: "11px", fontWeight: "700", cursor: "default" }}
            >
              🎯 Marketing
            </button>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav style={{ flex: 1, padding: "10px", overflowY: "auto" }}>
        <style>{`
          .mkt-nav-link { display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:10px;margin-bottom:2px;text-decoration:none;font-size:13.5px;transition:all 0.15s; }
          .mkt-nav-link:not(.active):hover { background:rgba(6,182,212,0.1)!important; color:#e2e8f0!important; }
        `}</style>
        {visibleNavItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={() => setOpen(false)}
            className={({ isActive }) => `mkt-nav-link${isActive ? " active" : ""}`}
            style={({ isActive }) => ({
              background: isActive ? MKT.active : "transparent",
              border: isActive ? `1px solid ${MKT.border}` : "1px solid transparent",
              color: isActive ? MKT.accent : MKT.sub,
              fontWeight: isActive ? "600" : "400",
            })}
          >
            <span style={{ fontSize: "15px", width: "20px", textAlign: "center", flexShrink: 0 }}>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}

        {/* Sign out */}
        <div style={{ paddingTop: "8px", marginTop: "6px", borderTop: `1px solid ${MKT.border}` }}>
          <button
            onClick={() => supabase.auth.signOut()}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "9px 12px", borderRadius: "10px", background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.18)", color: "#f87171", fontSize: "13.5px", fontWeight: "500", cursor: "pointer", transition: "all 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(239,68,68,0.15)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(239,68,68,0.07)"}
          >
            <span style={{ fontSize: "15px" }}>🚪</span>
            Sign Out
          </button>
        </div>
      </nav>
    </div>
  )

  return (
    <>
      {/* ── Mobile top bar ─────────────────────────────────────────────────── */}
      <div
        className="flex md:hidden"
        style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
          height: "56px",
          background: "rgba(7,25,32,0.96)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: `1px solid ${MKT.border}`,
          alignItems: "center", justifyContent: "space-between",
          padding: "0 16px",
          gap: "10px",
        }}
      >
        <button
          onClick={() => setOpen(!open)}
          style={{ background: "rgba(6,182,212,0.1)", border: `1px solid ${MKT.border}`, borderRadius: "9px", color: MKT.accent, width: "34px", height: "34px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, transition: "background 0.15s" }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(6,182,212,0.2)"}
          onMouseLeave={e => e.currentTarget.style.background = "rgba(6,182,212,0.1)"}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            {open
              ? <><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></>
              : <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>
            }
          </svg>
        </button>
        <BellButton size={16} />
      </div>

      {/* Notification dropdown */}
      <div className="md:hidden">
        <NotifDropdown />
      </div>

      {/* ── Mobile: overlay + slide-in drawer ─────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="md:hidden"
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 39 }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            key="drawer"
            initial={{ x: -288 }} animate={{ x: 0 }} exit={{ x: -288 }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="md:hidden"
            style={{ position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 40, width: "288px" }}
          >
            <SidebarBody />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Desktop sidebar (always visible) ──────────────────────────────── */}
      <div
        className="hidden md:block"
        style={{ position: "fixed", top: 0, left: 0, bottom: 0, width: "288px", zIndex: 40 }}
      >
        <SidebarBody />
      </div>
    </>
  )
}
