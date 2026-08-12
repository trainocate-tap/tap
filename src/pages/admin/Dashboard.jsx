import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../../lib/supabase"
import { LoadingSkeleton } from "../../components/EmptyState"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid
} from "recharts"
import { motion } from "framer-motion"
import { useTranslation } from "react-i18next"
import { checkLicenseAlerts, checkApprovalReminders, checkMarketingReminders } from "../../lib/emailService"
import { calculateHealthScore, HEALTH_COLORS } from "../../lib/healthScore"
import { calcDepreciation, fmtSGD } from "../../lib/depreciation"
import { useAuth } from "../../context/AuthContext"
import { statusLabel } from "../../lib/statusLabel"

const CHART_TOOLTIP = {
  contentStyle: { backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px" },
  labelStyle: { color: "#fff" },
  itemStyle: { color: "#9ca3af" },
}

const DONUT_COLORS = ["#3b82f6","#8b5cf6","#06b6d4","#ec4899","#f59e0b","#22c55e","#ef4444","#f97316"]
const COUNTRIES = ["Singapore", "Malaysia", "Thailand", "Indonesia", "Philippines", "Vietnam", "Taiwan", "Hong Kong", "India", "Japan", "Sri Lanka", "Gulf (UAE)"]

export default function Dashboard() {
  const { t } = useTranslation()
  const { userProfile, userCountry, profileLoading } = useAuth()
  const navigate = useNavigate()

  // Every user (including admin) is locked to their own country
  const countryFilter = userCountry || null

  const [stats, setStats] = useState({ totalAssets: 0, available: 0, assigned: 0, issues: 0, retired: 0 })
  const [categoryData, setCategoryData] = useState([])
  const [statusData, setStatusData] = useState([])
  const [recentAssets, setRecentAssets] = useState([])
  const [expiringAssets, setExpiringAssets] = useState([])
  const [expiredAssets, setExpiredAssets] = useState([])
  const [departmentData, setDepartmentData] = useState([])
  const [procurementData, setProcurementData] = useState([])
  const [conditionData, setConditionData] = useState([])
  const [healthStats, setHealthStats] = useState(null)
  const [warrantyStats, setWarrantyStats] = useState(null)
  const [deprStats, setDeprStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pendingRequests, setPendingRequests] = useState([])
  const [activeTab, setActiveTab] = useState("overview")
  const [overdueBorrows, setOverdueBorrows] = useState(0)

  // Email alerts run once on mount — system-wide, not country-filtered
  useEffect(() => {
    if (!profileLoading) {
      checkLicenseAlerts()
      checkApprovalReminders()
      checkMarketingReminders()
      fetchPendingRequests()
    }
  }, [profileLoading])

  // Data fetches re-run when country filter changes (or profile finishes loading)
  useEffect(() => {
    if (profileLoading) return
    setLoading(true)
    fetchStats(countryFilter)
    fetchRecentAssets(countryFilter)
    fetchExpiringWarranties(countryFilter)
    fetchDepartmentValue(countryFilter)
    fetchProcurement(countryFilter)
    fetchCondition(countryFilter)
    fetchHealthStats(countryFilter)
    fetchWarrantyStats(countryFilter)
    fetchDeprStats(countryFilter)
    fetchOverdueBorrows()
  }, [countryFilter, profileLoading])

  const fetchStats = async (country) => {
    let q = supabase.from("assets").select("status, category")
    if (country) q = q.eq("country", country)
    const { data } = await q
    const total = data?.length || 0
    const available = data?.filter(a => a.status === "available").length || 0
    const assigned = data?.filter(a => a.status === "assigned").length || 0
    const retired = data?.filter(a => a.status === "retired").length || 0
    const { data: issuesData } = await supabase.from("issues").select("status").eq("status", "open")
    setStats({ totalAssets: total, available, assigned, issues: issuesData?.length || 0, retired })

    const catCount = data?.reduce((acc, a) => {
      const cat = a.category || "Unknown"
      acc[cat] = (acc[cat] || 0) + 1
      return acc
    }, {})
    setCategoryData(Object.entries(catCount || {}).map(([name, value]) => ({ name, value })))

    setStatusData([
      { name: t("available"), value: available, color: "#22c55e" },
      { name: t("assigned"), value: assigned, color: "#3b82f6" },
      { name: "Maintenance", value: data?.filter(a => a.status === "maintenance").length || 0, color: "#eab308" },
      { name: "Retired", value: data?.filter(a => a.status === "retired").length || 0, color: "#ef4444" },
    ].filter(d => d.value > 0))
    setLoading(false)
  }

  const fetchRecentAssets = async (country) => {
    let q = supabase.from("assets").select("*").order("created_at", { ascending: false }).limit(5)
    if (country) q = q.eq("country", country)
    const { data } = await q
    setRecentAssets(data || [])
  }

  const fetchExpiringWarranties = async (country) => {
    const todayStr = new Date().toISOString().split("T")[0]
    const in30Days = new Date()
    in30Days.setDate(in30Days.getDate() + 30)
    const in30Str = in30Days.toISOString().split("T")[0]

    let qExp = supabase.from("assets").select("id, name, asset_tag, warranty_expiry, assigned_user")
      .not("warranty_expiry", "is", null).gte("warranty_expiry", todayStr).lte("warranty_expiry", in30Str)
      .order("warranty_expiry", { ascending: true }).limit(10)
    let qOld = supabase.from("assets").select("id, name, asset_tag, warranty_expiry, assigned_user")
      .not("warranty_expiry", "is", null).lt("warranty_expiry", todayStr)
      .order("warranty_expiry", { ascending: false }).limit(10)
    if (country) { qExp = qExp.eq("country", country); qOld = qOld.eq("country", country) }

    const [{ data: expiring }, { data: expired }] = await Promise.all([qExp, qOld])
    setExpiringAssets(expiring || [])
    setExpiredAssets(expired || [])
  }

  const fetchDepartmentValue = async (country) => {
    let q = supabase.from("assets").select("department, purchase_price")
    if (country) q = q.eq("country", country)
    const { data } = await q
    const map = {}
    data?.forEach(a => {
      const dept = a.department || "Unassigned"
      map[dept] = (map[dept] || 0) + (parseFloat(a.purchase_price) || 0)
    })
    setDepartmentData(
      Object.entries(map)
        .map(([name, value]) => ({ name, value: Math.round(value) }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8)
    )
  }

  const fetchProcurement = async (country) => {
    let q = supabase.from("assets").select("purchase_date, purchase_price")
      .not("purchase_date", "is", null).not("purchase_price", "is", null)
    if (country) q = q.eq("country", country)
    const { data } = await q
    const map = {}
    data?.forEach(a => {
      const d = new Date(a.purchase_date)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      const label = d.toLocaleDateString("en-SG", { month: "short", year: "2-digit" })
      if (!map[key]) map[key] = { name: label, value: 0, key }
      map[key].value += parseFloat(a.purchase_price) || 0
    })
    setProcurementData(
      Object.values(map).sort((a, b) => a.key.localeCompare(b.key)).slice(-12)
        .map(d => ({ ...d, value: Math.round(d.value) }))
    )
  }

  const fetchCondition = async (country) => {
    let q = supabase.from("assets").select("warranty_expiry")
    if (country) q = q.eq("country", country)
    const { data } = await q
    const today = new Date()
    const in30 = new Date(); in30.setDate(today.getDate() + 30)
    const in90 = new Date(); in90.setDate(today.getDate() + 90)
    let good = 0, soon = 0, critical = 0, expired = 0, none = 0
    data?.forEach(a => {
      if (!a.warranty_expiry) { none++; return }
      const exp = new Date(a.warranty_expiry)
      if (exp < today) expired++
      else if (exp <= in30) critical++
      else if (exp <= in90) soon++
      else good++
    })
    setConditionData([
      { name: "Good (>90d)", value: good, color: "#22c55e" },
      { name: "Expiring (30-90d)", value: soon, color: "#eab308" },
      { name: "Critical (<30d)", value: critical, color: "#f97316" },
      { name: "Expired", value: expired, color: "#ef4444" },
      { name: "No Warranty", value: none, color: "#6b7280" },
    ].filter(d => d.value > 0))
  }

  const fetchHealthStats = async (country) => {
    let q = supabase.from("assets").select("id, purchase_date, warranty_expiry, status")
    if (country) q = q.eq("country", country)
    const { data: assets, error } = await q

    if (error || !assets || assets.length === 0) {
      setHealthStats({ avg: 0, green: 0, yellow: 0, red: 0, total: 0 })
      return
    }

    // Maintenance records optional — table may not exist yet
    const { data: maint } = await supabase
      .from("maintenance_schedules")
      .select("asset_id, status, scheduled_date")

    const byAsset = {}
    ;(maint || []).forEach(m => {
      if (!byAsset[m.asset_id]) byAsset[m.asset_id] = []
      byAsset[m.asset_id].push(m)
    })

    let green = 0, yellow = 0, red = 0, scoreSum = 0
    assets.forEach(a => {
      const { score, band } = calculateHealthScore(a, byAsset[a.id] || [])
      scoreSum += score
      if (band === "green") green++
      else if (band === "yellow") yellow++
      else red++
    })
    setHealthStats({ avg: Math.round(scoreSum / assets.length), green, yellow, red, total: assets.length })
  }

  const fetchWarrantyStats = async (country) => {
    let q = supabase.from("assets").select("warranty_expiry")
    if (country) q = q.eq("country", country)
    const { data } = await q
    const today = new Date()
    let valid = 0, expired = 0, none = 0
    ;(data || []).forEach(a => {
      if (!a.warranty_expiry) { none++; return }
      if (new Date(a.warranty_expiry) >= today) valid++
      else expired++
    })
    setWarrantyStats({ valid, expired, none, total: (data || []).length })
  }

  const fetchDeprStats = async (country) => {
    let q = supabase.from("assets").select("purchase_price, purchase_date, useful_life")
      .not("purchase_price", "is", null).not("purchase_date", "is", null)
    if (country) q = q.eq("country", country)
    const { data } = await q
    if (!data?.length) { setDeprStats({ totalOriginal: 0, totalCurrent: 0, totalLost: 0, count: 0 }); return }
    let totalOriginal = 0, totalCurrent = 0
    data.forEach(a => {
      const d = calcDepreciation(a.purchase_price, a.purchase_date, a.useful_life)
      if (d) { totalOriginal += d.originalPrice; totalCurrent += d.currentValue }
    })
    setDeprStats({
      totalOriginal: Math.round(totalOriginal),
      totalCurrent: Math.round(totalCurrent),
      totalLost: Math.round(totalOriginal - totalCurrent),
      count: data.length,
    })
  }

  const fetchOverdueBorrows = async () => {
    try {
      const todayStr = new Date().toISOString().split("T")[0]
      const { count } = await supabase
        .from("borrows")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .lt("expected_return_date", todayStr)
      setOverdueBorrows(count || 0)
    } catch {}
  }

  const fetchPendingRequests = async () => {
    try {
      const { data } = await supabase
        .from("asset_requests")
        .select("id, asset_type, requested_by, created_at, priority")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
      setPendingRequests(data || [])
    } catch {}
  }

  const getDaysUntilExpiry = (date) =>
    Math.ceil((new Date(date) - new Date()) / (1000 * 60 * 60 * 24))

  const cards = [
    { label: t("totalAssets"), value: stats.totalAssets, bg: "bg-blue-600", shadow: "shadow-blue-500/20", emoji: "📦", to: "/admin/assets" },
    { label: t("available"), value: stats.available, bg: "bg-green-600", shadow: "shadow-green-500/20", emoji: "✅", to: "/admin/assets?status=available" },
    { label: t("assigned"), value: stats.assigned, bg: "bg-purple-600", shadow: "shadow-purple-500/20", emoji: "👤", to: "/admin/assets?status=assigned" },
    { label: "Retired", value: stats.retired, bg: "bg-red-600", shadow: "shadow-red-500/20", emoji: "🗃️", to: "/admin/assets?status=retired" },
  ]

  return (
    <div className="p-4 md:p-8 relative min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div>
          <motion.h1 initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="text-2xl md:text-3xl font-bold text-white">{t("dashboard")}</motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
            className="text-gray-400 mt-1 text-sm">
            Welcome back to IT — Trainocate Asset Portal 🇸🇬 Singapore, {userProfile?.name || userProfile?.email || ""}!
          </motion.p>
        </div>
      </div>

      {/* Tab Toggle */}
      <div className="flex gap-2 mb-6 bg-gray-900/60 border border-gray-800 rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveTab("overview")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === "overview"
              ? "bg-blue-600 text-white shadow"
              : "text-gray-400 hover:text-white"
          }`}
        >
          📊 Overview
        </button>
        <button
          onClick={() => setActiveTab("analytics")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === "analytics"
              ? "bg-blue-600 text-white shadow"
              : "text-gray-400 hover:text-white"
          }`}
        >
          📈 Analytics
        </button>
        <button
          onClick={() => setActiveTab("warranty")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === "warranty"
              ? "bg-blue-600 text-white shadow"
              : "text-gray-400 hover:text-white"
          }`}
        >
          🛡️ Warranty
        </button>
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === "overview" && (
        <>
          {/* Stat Cards */}
          {loading ? (
            <div className="mb-6">
              <LoadingSkeleton rows={2} cols={2} />
            </div>
          ) : stats.totalAssets === 0 ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="bg-gray-900/80 border border-gray-800 rounded-2xl p-8 mb-6 text-center">
              <div className="text-5xl mb-3">📦</div>
              <h3 className="text-white font-bold text-lg mb-1">No assets yet</h3>
              <p className="text-gray-400 text-sm mb-4">Get started by adding your first asset to the system.</p>
              <button onClick={() => navigate("/admin/add-asset")}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-all inline-flex items-center gap-2">
                ➕ Add Your First Asset
              </button>
            </motion.div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {cards.map((card, i) => (
                <motion.div key={card.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }} whileHover={{ scale: 1.05, transition: { duration: 0.2 } }}
                  onClick={() => navigate(card.to)}
                  className={`${card.bg} rounded-2xl p-4 md:p-6 shadow-lg ${card.shadow} cursor-pointer`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white/70 text-xs md:text-sm font-medium">{card.label}</span>
                    <span className="text-xl md:text-2xl">{card.emoji}</span>
                  </div>
                  <p className="text-3xl md:text-4xl font-bold text-white">{card.value}</p>
                </motion.div>
              ))}
            </div>
          )}

          {/* Extra stat cards: overdue borrows + expiring warranties */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
              className="bg-red-600/20 border border-red-500/30 rounded-2xl p-4 md:p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/70 text-xs md:text-sm font-medium">🔴 Overdue Borrows</span>
              </div>
              <p className="text-3xl md:text-4xl font-bold text-red-400">{loading ? "..." : overdueBorrows}</p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
              className="bg-orange-600/20 border border-orange-500/30 rounded-2xl p-4 md:p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/70 text-xs md:text-sm font-medium">⚠️ Open Issues</span>
              </div>
              <p className="text-3xl md:text-4xl font-bold text-orange-400">{loading ? "..." : stats.issues}</p>
            </motion.div>
          </div>

          {/* Quick action buttons */}
          <div className="flex flex-wrap gap-3 mb-6">
            <button onClick={() => navigate("/admin/add-asset")} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-400 hover:bg-blue-600/30 transition-all text-sm font-medium">
              ➕ Add Asset
            </button>
            <button onClick={() => navigate("/admin/issues")} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600/20 border border-orange-500/30 text-orange-400 hover:bg-orange-600/30 transition-all text-sm font-medium">
              ⚠️ Report Issue
            </button>
            <button onClick={() => navigate("/admin/borrow")} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600/20 border border-purple-500/30 text-purple-400 hover:bg-purple-600/30 transition-all text-sm font-medium">
              🔄 Borrow Asset
            </button>
          </div>

          {/* Pending Asset Requests */}
          {pendingRequests.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.27 }}
              className="bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-800 p-5 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xl">📋</span>
                <h2 className="text-white font-semibold">Pending Asset Requests</h2>
                <span className="ml-auto text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full font-medium">
                  {pendingRequests.length} pending
                </span>
              </div>
              <div className="space-y-2">
                {pendingRequests.slice(0, 6).map(req => {
                  const daysPending = Math.floor((Date.now() - new Date(req.created_at)) / 86400000)
                  const priorityColor = req.priority === "high" ? "text-red-400" : req.priority === "medium" ? "text-yellow-400" : "text-gray-500"
                  return (
                    <div key={req.id} className={`flex items-center justify-between rounded-xl px-3 py-2.5 border ${
                      daysPending >= 7 ? "bg-red-500/5 border-red-500/20" :
                      daysPending >= 3 ? "bg-yellow-500/5 border-yellow-500/20" :
                      "bg-gray-800/40 border-gray-700/50"
                    }`}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-white text-sm font-medium">{req.asset_type}</p>
                          <span className={`text-xs font-medium ${priorityColor}`}>{req.priority}</span>
                        </div>
                        <p className="text-gray-500 text-xs mt-0.5">By {req.requested_by}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        {daysPending >= 7 ? (
                          <span className="text-xs px-2 py-0.5 rounded-full border font-medium bg-red-500/20 text-red-400 border-red-500/30">
                            🚨 {daysPending}d overdue
                          </span>
                        ) : daysPending >= 3 ? (
                          <span className="text-xs px-2 py-0.5 rounded-full border font-medium bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                            ⏰ {daysPending}d pending
                          </span>
                        ) : (
                          <span className="text-xs text-gray-600">{daysPending}d ago</span>
                        )}
                      </div>
                    </div>
                  )
                })}
                {pendingRequests.length > 6 && (
                  <p className="text-gray-600 text-xs text-center pt-1">
                    +{pendingRequests.length - 6} more pending requests
                  </p>
                )}
              </div>
            </motion.div>
          )}

          {/* Recent Assets */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold">{t("recentAssets")}</h2>
              <span className="text-gray-500 text-sm">Last 5</span>
            </div>
            <div className="space-y-3">
              {recentAssets.map((asset) => (
                <div key={asset.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                  <div>
                    <p className="text-white text-sm font-medium">{asset.name}</p>
                    <p className="text-gray-500 text-xs">{asset.category} — {asset.assigned_user || "Unassigned"}</p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    asset.status === "available" ? "bg-green-500/20 text-green-400" :
                    asset.status === "assigned" ? "bg-blue-500/20 text-blue-400" :
                    "bg-gray-500/20 text-gray-400"
                  }`}>{statusLabel(asset.status)}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}

      {/* ── ANALYTICS TAB ── */}
      {activeTab === "analytics" && (
        <>
          {/* Row 1 — Category + Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}
              className="bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-800 p-6">
              <h2 className="text-white font-semibold mb-4">Assets by Category</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={categoryData}>
                  <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
                  <Tooltip {...CHART_TOOLTIP} />
                  <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}
              className="bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-800 p-6">
              <h2 className="text-white font-semibold mb-4">Assets by Status</h2>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                    {statusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip {...CHART_TOOLTIP} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 mt-2">
                {statusData.map((d) => (
                  <div key={d.name} className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="text-gray-400 text-xs">{d.name} ({d.value})</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Row 2 — Department Value + Procurement */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}
              className="bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-800 p-6">
              <h2 className="text-white font-semibold mb-1">Asset Value by Department</h2>
              <p className="text-gray-500 text-xs mb-4">Total purchase value (SGD)</p>
              {departmentData.length === 0 ? (
                <p className="text-gray-600 text-sm text-center py-16">No department / price data yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={departmentData} layout="vertical">
                    <XAxis type="number" tick={{ fill: "#9ca3af", fontSize: 11 }}
                      tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(1)}k` : `$${v}`} />
                    <YAxis type="category" dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} width={80} />
                    <Tooltip {...CHART_TOOLTIP} formatter={v => [`$${v.toLocaleString()}`, "Value"]} />
                    <Bar dataKey="value" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </motion.div>

            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 }}
              className="bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-800 p-6">
              <h2 className="text-white font-semibold mb-1">Monthly Procurement Spending</h2>
              <p className="text-gray-500 text-xs mb-4">Last 12 months (SGD)</p>
              {procurementData.length === 0 ? (
                <p className="text-gray-600 text-sm text-center py-16">No purchase date / price data yet</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={procurementData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }}
                      tickFormatter={v => v >= 1000 ? `$${(v/1000).toFixed(0)}k` : `$${v}`} />
                    <Tooltip {...CHART_TOOLTIP} formatter={v => [`$${v.toLocaleString()}`, "Spent"]} />
                    <Line type="monotone" dataKey="value" stroke="#06b6d4" strokeWidth={2}
                      dot={{ fill: "#06b6d4", strokeWidth: 0, r: 4 }} activeDot={{ r: 6, fill: "#06b6d4" }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </motion.div>
          </div>

          {/* Category Distribution */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-800 p-6 mb-6">
            <h2 className="text-white font-semibold mb-1">Category Distribution</h2>
            <p className="text-gray-500 text-xs mb-4">Asset count by type</p>
            {categoryData.length === 0 ? (
              <p className="text-gray-600 text-sm text-center py-16">No asset data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={categoryData} cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={3} dataKey="value">
                    {categoryData.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                  </Pie>
                  <Tooltip {...CHART_TOOLTIP} />
                </PieChart>
              </ResponsiveContainer>
            )}
            <div className="flex flex-wrap gap-3 mt-2">
              {categoryData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                  <span className="text-gray-400 text-xs">{d.name} ({d.value})</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Fleet Depreciation (analytics tab) */}
          {deprStats && deprStats.count > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
              className="bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-800 p-5 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xl">📉</span>
                <h2 className="text-white font-semibold">Fleet Depreciation</h2>
                <span className="text-gray-500 text-xs">({deprStats.count} assets with price data)</span>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-gray-800/60 rounded-xl p-3 text-center">
                  <p className="text-gray-500 text-xs mb-1">Original Cost</p>
                  <p className="text-white font-bold text-sm">{fmtSGD(deprStats.totalOriginal)}</p>
                </div>
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-center">
                  <p className="text-gray-500 text-xs mb-1">Current Book Value</p>
                  <p className="text-blue-400 font-bold text-sm">{fmtSGD(deprStats.totalCurrent)}</p>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
                  <p className="text-gray-500 text-xs mb-1">Total Depreciated</p>
                  <p className="text-red-400 font-bold text-sm">{fmtSGD(deprStats.totalLost)}</p>
                </div>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <motion.div initial={{ width: 0 }}
                  animate={{ width: `${Math.round((deprStats.totalCurrent / deprStats.totalOriginal) * 100)}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className="h-full bg-blue-500 rounded-full" />
              </div>
              <div className="flex justify-between text-xs text-gray-600 mt-1">
                <span>{Math.round((deprStats.totalCurrent / deprStats.totalOriginal) * 100)}% remaining value</span>
                <span>{Math.round((deprStats.totalLost / deprStats.totalOriginal) * 100)}% depreciated</span>
              </div>
            </motion.div>
          )}

        </>
      )}

      {/* ── WARRANTY TAB ── */}
      {activeTab === "warranty" && (
        <>
          {/* Warranty Status */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-800 p-5 mb-6">
            {!warrantyStats ? (
              <div className="animate-pulse space-y-4">
                <div className="h-4 bg-gray-700 rounded w-36" />
                <div className="grid grid-cols-2 gap-3">
                  {[0,1].map(i => <div key={i} className="h-20 bg-gray-700 rounded-xl" />)}
                </div>
              </div>
            ) : warrantyStats.valid === 0 && warrantyStats.expired === 0 ? (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">🛡️</span>
                  <h2 className="text-white font-semibold">Warranty Status</h2>
                </div>
                <div className="text-center py-6">
                  <p className="text-gray-400 text-sm">No warranty dates recorded yet.</p>
                  <p className="text-gray-600 text-xs mt-1">Add warranty dates when editing assets!</p>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xl">🛡️</span>
                  <h2 className="text-white font-semibold">Warranty Status</h2>
                  <span className="text-gray-500 text-xs">({warrantyStats.total} total assets)</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-green-500/10 rounded-xl p-4 border border-green-500/20 flex items-center gap-3">
                    <span className="text-2xl">✅</span>
                    <div>
                      <p className="text-green-400 text-2xl font-bold">{warrantyStats.valid}</p>
                      <p className="text-green-400/70 text-xs mt-0.5">Valid Warranty</p>
                    </div>
                  </div>
                  <div className="bg-red-500/10 rounded-xl p-4 border border-red-500/20 flex items-center gap-3">
                    <span className="text-2xl">❌</span>
                    <div>
                      <p className="text-red-400 text-2xl font-bold">{warrantyStats.expired}</p>
                      <p className="text-red-400/70 text-xs mt-0.5">Expired Warranty</p>
                    </div>
                  </div>
                </div>
                {warrantyStats.none > 0 && (
                  <p className="text-gray-600 text-xs mt-2 text-center">{warrantyStats.none} assets have no warranty date recorded</p>
                )}
              </>
            )}
          </motion.div>

          {/* Asset Condition */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-800 p-6 mb-6">
            <h2 className="text-white font-semibold mb-1">Asset Condition</h2>
            <p className="text-gray-500 text-xs mb-4">Based on warranty status</p>
            {conditionData.length === 0 ? (
              <p className="text-gray-600 text-sm text-center py-16">No warranty data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={conditionData} cx="50%" cy="50%" outerRadius={80} paddingAngle={2} dataKey="value">
                    {conditionData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip {...CHART_TOOLTIP} />
                </PieChart>
              </ResponsiveContainer>
            )}
            <div className="flex flex-wrap gap-3 mt-2">
              {conditionData.map((d) => (
                <div key={d.name} className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="text-gray-400 text-xs">{d.name} ({d.value})</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Warranty Expiry Alerts */}
          {(expiredAssets.length > 0 || expiringAssets.length > 0) && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="rounded-2xl border mb-6 overflow-hidden"
              style={{ borderColor: expiredAssets.length > 0 ? "rgba(239,68,68,0.4)" : "rgba(234,179,8,0.3)" }}>
              <div className={`flex items-center gap-3 px-4 md:px-6 py-4 ${
                expiredAssets.length > 0 ? "bg-red-500/10" : "bg-yellow-500/10"
              }`}>
                <span className="text-2xl">{expiredAssets.length > 0 ? "🚨" : "⚠️"}</span>
                <div className="flex-1">
                  <h2 className={`font-semibold ${expiredAssets.length > 0 ? "text-red-400" : "text-yellow-400"}`}>
                    Warranty Alerts
                  </h2>
                  <p className="text-gray-500 text-xs mt-0.5">
                    {expiredAssets.length > 0 && `${expiredAssets.length} expired`}
                    {expiredAssets.length > 0 && expiringAssets.length > 0 && " · "}
                    {expiringAssets.length > 0 && `${expiringAssets.length} expiring within 30 days`}
                  </p>
                </div>
              </div>
              <div className="bg-gray-900/80 p-4 md:p-6 space-y-4">
                {expiredAssets.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                      <p className="text-red-400 text-xs font-semibold uppercase tracking-wide">
                        Expired ({expiredAssets.length})
                      </p>
                    </div>
                    <div className="space-y-2">
                      {expiredAssets.map(asset => (
                        <div key={asset.id}
                          className="flex items-center justify-between bg-red-500/5 border border-red-500/20 rounded-xl px-3 md:px-4 py-2.5">
                          <div className="min-w-0 mr-3">
                            <p className="text-white text-sm font-medium truncate">{asset.name}</p>
                            <p className="text-gray-500 text-xs">
                              {asset.asset_tag ? `Tag: ${asset.asset_tag}` : (asset.assigned_user || "Unassigned")}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-red-400 text-xs font-semibold">Expired</p>
                            <p className="text-gray-500 text-xs">{asset.warranty_expiry}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {expiringAssets.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" />
                      <p className="text-yellow-400 text-xs font-semibold uppercase tracking-wide">
                        Expiring within 30 days ({expiringAssets.length})
                      </p>
                    </div>
                    <div className="space-y-2">
                      {expiringAssets.map(asset => {
                        const days = getDaysUntilExpiry(asset.warranty_expiry)
                        return (
                          <div key={asset.id}
                            className="flex items-center justify-between bg-yellow-500/5 border border-yellow-500/20 rounded-xl px-3 md:px-4 py-2.5">
                            <div className="min-w-0 mr-3">
                              <p className="text-white text-sm font-medium truncate">{asset.name}</p>
                              <p className="text-gray-500 text-xs">
                                {asset.asset_tag ? `Tag: ${asset.asset_tag}` : (asset.assigned_user || "Unassigned")}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-yellow-400 text-xs font-semibold">{days}d left</p>
                              <p className="text-gray-500 text-xs">{asset.warranty_expiry}</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </>
      )}
    </div>
  )
}
