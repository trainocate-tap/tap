import { useState, useEffect } from "react"
import { NavLink, useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { useAuth } from "../context/AuthContext"
import { useTranslation } from "react-i18next"
import NotificationBell from "./NotificationBell"

const roleColors = {
  global_admin: "bg-purple-500/20 text-purple-400 border border-purple-500/30",
  admin: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
  standard_user: "bg-green-500/20 text-green-400 border border-green-500/30",
  guest: "bg-gray-500/20 text-gray-400 border border-gray-500/30",
}

const roleLabels = {
  global_admin: "🌍 Global Admin",
  admin: "👑 Admin",
  standard_user: "👤 Standard User",
  guest: "👁 Guest",
}


export default function Sidebar() {
  const [open, setOpen] = useState(false)
  const [counts, setCounts] = useState({ assets: 0, openIssues: 0, pendingRequests: 0, activeBorrows: 0 })
  const { t } = useTranslation()
  const { userProfile, role, isStandardUser, isMarketing, isMarketingOnly, canManageMarketing, isGlobalAdmin, isGuest } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!userProfile) return
    const fetchCounts = async () => {
      const country = userProfile.country

      let assetsQuery = supabase.from("assets").select("id", { count: "exact", head: true }).eq("country", country)
      let issuesQuery = supabase.from("issues").select("id", { count: "exact", head: true }).eq("status", "open")
      let borrowsQuery = supabase.from("borrows").select("id", { count: "exact", head: true }).eq("status", "active")

      // Standard users only see counts scoped to themselves; admins keep seeing everything.
      if (isStandardUser) {
        assetsQuery = assetsQuery.eq("assigned_user", userProfile.name)
        issuesQuery = issuesQuery.or(`reported_by.eq.${userProfile.email},reported_by.eq.${userProfile.id},reported_by.eq.${userProfile.name}`)
        borrowsQuery = borrowsQuery.eq("borrowed_by", userProfile.name)
      }

      const [assetsRes, issuesRes, requestsRes, borrowsRes] = await Promise.all([
        assetsQuery,
        issuesQuery,
        supabase.from("asset_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        borrowsQuery,
      ])
      setCounts({
        assets: assetsRes.count || 0,
        openIssues: issuesRes.count || 0,
        pendingRequests: requestsRes.count || 0,
        activeBorrows: borrowsRes.count || 0,
      })
    }
    fetchCounts()
    const interval = setInterval(fetchCounts, 30000)
    return () => clearInterval(interval)
  }, [userProfile, isStandardUser])

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  const dashItem    = { label: t("dashboard"), path: "/admin" }
  const assetsItem  = { label: t("allAssets"), path: "/admin/assets", count: counts.assets }
  const reportsItem = { label: t("reports"), path: "/admin/reports" }
  const historyItem = { label: t("history"), path: "/admin/history" }
  const guideItem   = { label: t("guide"), path: "/admin/guide" }

  const scannerItem = { label: t("scanner"), path: "/admin/scanner" }

  // Standard User items (used in the full admin nav)
  const standardItems = [
    { label: "New Asset Request", path: "/admin/requests", count: counts.pendingRequests },
    { label: t("borrowReturn"), path: "/admin/borrow", count: counts.activeBorrows },
    { label: t("issues"), path: "/admin/issues", count: counts.openIssues },
    { label: t("maintenanceTitle"), path: "/admin/maintenance" },
  ]

  // Standard User nav: My Assets, Borrow/Return, Issues only
  const standardUserNavItems = [
    { label: "My Assets", path: "/admin/assets", count: counts.assets },
    { label: t("borrowReturn"), path: "/admin/borrow", count: counts.activeBorrows },
    { label: t("issues"), path: "/admin/issues", count: counts.openIssues },
  ]

  // Admin-only items
  const adminOnlyItems = [
    { label: t("addAsset"), path: "/admin/add-asset" },
    { label: t("importAssets"), path: "/admin/import" },
    { label: t("manageUsersTitle"), path: "/admin/users" },
    { label: "Settings", path: "/admin/settings" },
  ]

  // Guest: Dashboard, All Assets, Reports, User Guide only
  let navItems = [dashItem, assetsItem, reportsItem, guideItem]

  // Standard User (and non-admin marketing users viewing the IT module): My Assets, Borrow/Return, Issues only
  if (isStandardUser || isMarketingOnly) {
    navItems = standardUserNavItems
  }

  // Admin (base role), global admin, or a non-admin marketing user with an elevated
  // marketing role (marketing_admin / marketing_manager) viewing the IT module: full access
  if (canManageMarketing || isGlobalAdmin) {
    navItems = [
      dashItem, assetsItem,
      adminOnlyItems[0], scannerItem, adminOnlyItems[1],
      ...standardItems,
      reportsItem, historyItem, guideItem,
      adminOnlyItems[2], adminOnlyItems[3],
    ]
  }

  return (
    <>
      {/* Mobile top bar */}
      <div className="fixed top-0 left-0 right-0 z-50 md:hidden bg-gray-900/80 backdrop-blur-sm border-b border-gray-800 flex items-center justify-between px-4 py-3">
        <h1 className="text-white font-bold text-lg">Trainocate</h1>
        <div className="flex items-center gap-2">
          {!isGuest && <NotificationBell />}
          <button
            onClick={() => setOpen(!open)}
            className="text-white p-2 rounded-lg bg-gray-800"
          >
            {open ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar — fixed, exactly 100vh tall, flex column, overflow hidden at container level */}
      <div
        className={`fixed inset-y-0 left-0 z-40 w-72 bg-gray-900/70 backdrop-blur-sm border-r border-gray-800 transform transition-transform duration-200 ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
        style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}
      >
        {/* ── TOP: Logo + User info — inline, never scrolls ── */}
        <div className="shrink-0">
          <div className="hidden md:flex items-center gap-3 px-4 pt-4 pb-3 border-b border-gray-800/50">
            <img src="/trainocate-logo.png" alt="Trainocate" style={{width:"80px", flexShrink: 0, background:"transparent", filter: "none"}} />
            {userProfile && (
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div style={{ width:"32px", height:"32px", borderRadius:"50%", background:"linear-gradient(135deg, #e8431a, #ff6b35)", display:"flex", alignItems:"center", justifyContent:"center", color:"white", fontWeight:"bold", fontSize:"13px", flexShrink:0 }}>
                  {userProfile?.name?.charAt(0)?.toUpperCase() || "U"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm font-medium truncate">{userProfile.name || userProfile.email}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColors[role] || roleColors.guest}`} style={{ whiteSpace: "nowrap", display: "inline-block" }}>
                    {roleLabels[role] || "👁 Guest"}
                  </span>
                </div>
              </div>
            )}
          </div>
          <div className="h-14 md:hidden" />
        </div>

        {/* ── USER INFO (mobile) — never scrolls ── */}
        {userProfile && (
          <div className="shrink-0 px-4 pt-4 pb-2 border-b border-gray-800/50 md:hidden">
            <div className="flex items-center gap-2">
              <div style={{ width:"32px", height:"32px", borderRadius:"50%", background:"linear-gradient(135deg, #e8431a, #ff6b35)", display:"flex", alignItems:"center", justifyContent:"center", color:"white", fontWeight:"bold", fontSize:"13px", flexShrink:0 }}>
                {userProfile?.name?.charAt(0)?.toUpperCase() || "U"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white text-sm font-medium truncate">{userProfile.name || userProfile.email}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColors[role] || roleColors.guest}`} style={{ whiteSpace: "nowrap", display: "inline-block" }}>
                  {roleLabels[role] || "👁 Guest"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── MODULE TOGGLE (any user with marketing_access) — never scrolls ── */}
        {isMarketing && (
          <div className="shrink-0 px-4 pt-3 pb-2 border-b border-gray-800/50">
            <p className="text-gray-500 text-xs mb-2 uppercase tracking-wider">Switch Module</p>
            <div className="flex gap-1.5">
              <button
                style={{
                  flex: 1, padding: "7px 6px", borderRadius: "8px",
                  background: "rgba(59,130,246,0.2)",
                  border: "1px solid rgba(59,130,246,0.5)",
                  color: "#60a5fa", fontSize: "11px", fontWeight: "700",
                  cursor: "default",
                }}
              >
                🖥️ IT Portal
              </button>
              <button
                onClick={() => { setOpen(false); navigate("/marketing/dashboard") }}
                style={{
                  flex: 1, padding: "7px 6px", borderRadius: "8px",
                  background: "rgba(6,182,212,0.08)",
                  border: "1px solid rgba(6,182,212,0.25)",
                  color: "#06b6d4", fontSize: "11px", fontWeight: "600",
                  cursor: "pointer", transition: "all 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(6,182,212,0.18)"; e.currentTarget.style.borderColor = "rgba(6,182,212,0.5)" }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(6,182,212,0.08)"; e.currentTarget.style.borderColor = "rgba(6,182,212,0.25)" }}
              >
                🎯 Marketing
              </button>
            </div>
          </div>
        )}

        {/* ── NAV + SIGN OUT — scrollable, takes remaining height ── */}
        <nav className="p-4 space-y-1" style={{ flex: 1, overflowY: "auto" }}>
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/admin"}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white"
                }`
              }
            >
              <span className="text-sm font-medium flex-1">{item.label}</span>
              {item.count > 0 && (
                <span className="ml-auto min-w-[20px] h-5 bg-blue-600/80 rounded-full text-white text-[10px] flex items-center justify-center font-bold px-1">
                  {item.count > 99 ? "99+" : item.count}
                </span>
              )}
            </NavLink>
          ))}

        </nav>

        {/* Sign Out — outside nav, sits at bottom via flex column */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.1)", flexShrink: 0, background: "#0f172a" }}>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-red-400 transition-all w-full"
          >
            <span>🚪</span>
            <span className="text-sm font-medium">{t("signOut")}</span>
          </button>
        </div>
      </div>
    </>
  )
}
