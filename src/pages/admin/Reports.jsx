import { useEffect, useState, useMemo } from "react"
import { supabase } from "../../lib/supabase"
import { LoadingSkeleton, EmptyState } from "../../components/EmptyState"
import * as XLSX from "xlsx"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { motion, AnimatePresence } from "framer-motion"
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from "recharts"
import { calcDepreciation } from "../../lib/depreciation"
import { useAuth } from "../../context/AuthContext"
import { useCurrency } from "../../lib/useCurrency"
import { statusLabel } from "../../lib/statusLabel"

// ── Constants ─────────────────────────────────────────────────────────────────
const REPORT_TYPES = [
  { id: "inventory",       icon: "📦", label: "Full Asset Inventory",     desc: "Complete list of all assets" },
  { id: "warranty",        icon: "🛡️",  label: "Warranty Expiry",          desc: "Assets expiring in 30/60/90 days" },
  { id: "depreciation",    icon: "📉", label: "Asset Depreciation",       desc: "Value & depreciation per asset" },
  { id: "license",         icon: "📋", label: "License Usage",            desc: "License expiry tracking" },
  { id: "maintenance",     icon: "🔧", label: "Maintenance History",      desc: "Asset maintenance records" },
  { id: "borrow",          icon: "📤", label: "Borrow History",           desc: "Borrowing & return records" },
  { id: "overdue_borrows", icon: "🔴", label: "Overdue Borrows",          desc: "Active borrows past their return date" },
  { id: "dept_count",      icon: "🏗️",  label: "Assets by Department",    desc: "Asset count grouped by department" },
  { id: "license_expiry",  icon: "⏳", label: "License Expiry Report",    desc: "Assets with licenses expiring soon" },
]

const STATUS_COLORS = {
  available:   "#22c55e",
  assigned:    "#3b82f6",
  maintenance: "#eab308",
  retired:     "#ef4444",
}

const CHART_COLORS = ["#3b82f6","#22c55e","#a855f7","#f59e0b","#ef4444","#06b6d4","#f97316","#ec4899"]

// Fallback used only until the product_ids table has loaded (or if it's unreachable)
const DEFAULT_PRODUCT_IDS = {
  "P001": "Laptop",
  "P002": "Desktop",
  "P003": "Monitor",
  "P004": "Printer",
  "P005": "Server",
  "P006": "Networking",
  "P007": "Mobile Device",
  "P008": "Tablet",
  "P009": "Peripheral",
  "P010": "Software License",
  "P011": "Furniture",
  "P012": "Other",
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]
const currentYear = new Date().getFullYear()
const DEP_YEARS = Array.from({ length: 21 }, (_, i) => currentYear - 15 + i)

// ── Tooltip ───────────────────────────────────────────────────────────────────
const DarkTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      {label && <p className="text-gray-400 mb-1">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || "#fff" }}>{p.name}: <span className="font-semibold">{p.value}</span></p>
      ))}
    </div>
  )
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, sub, color = "blue", delay = 0, compact = false }) => {
  const colors = {
    blue:   "border-blue-500/30 text-blue-400",
    green:  "border-green-500/30 text-green-400",
    purple: "border-purple-500/30 text-purple-400",
    yellow: "border-yellow-500/30 text-yellow-400",
    red:    "border-red-500/30 text-red-400",
    teal:   "border-teal-500/30 text-teal-400",
    orange: "border-orange-500/30 text-orange-400",
  }
  const [border, text] = (colors[color] || colors.blue).split(" ")
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={`bg-gray-800/60 rounded-xl border ${border} ${compact ? "p-1.5" : "p-4"}`}
    >
      <p className={`text-gray-400 text-xs leading-tight ${compact ? "mb-0" : "mb-1"}`}>{label}</p>
      <p className={`font-bold ${text} ${compact ? "text-base" : "text-2xl"}`}>{value}</p>
      {sub && <p className="text-gray-500 text-xs mt-0.5">{sub}</p>}
    </motion.div>
  )
}

// ── Date range helper ─────────────────────────────────────────────────────────
const today = () => new Date().toISOString().split("T")[0]
function borrowAssetLabel(b) {
  if (b.assets?.name) return b.assets.name
  if (b.category) return `${b.quantity || 1}x ${b.category}`
  return b.asset_id || "—"
}
const daysFromNow = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().split("T")[0]
}

// ── PDF header helper ─────────────────────────────────────────────────────────
function pdfHeader(doc, title) {
  doc.setFillColor(37, 99, 235)
  doc.rect(0, 0, 210, 28, "F")
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont("helvetica", "bold")
  doc.text(`Trainocate Asset Portal — ${title}`, 14, 16)
  doc.setFontSize(8)
  doc.setFont("helvetica", "normal")
  doc.text(`Trainocate Singapore · Generated: ${new Date().toLocaleDateString("en-SG")}`, 14, 24)
  doc.setTextColor(0, 0, 0)
}

function pdfFooter(doc) {
  const n = doc.internal.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text(`Trainocate Asset Portal · Page ${i} of ${n}`, 14, doc.internal.pageSize.height - 8)
  }
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Reports() {
  const { userCountry, profileLoading } = useAuth()
  const { symbol: currencySymbol } = useCurrency()
  const [reportType, setReportType] = useState("inventory")
  const [assets, setAssets] = useState([])
  const [borrows, setBorrows] = useState([])
  const [maintenance, setMaintenance] = useState([])
  const [overdueBorrowsData, setOverdueBorrowsData] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [warrantyDays, setWarrantyDays] = useState(90)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [depMonth, setDepMonth] = useState(new Date().getMonth() + 1)
  const [depYear, setDepYear] = useState(new Date().getFullYear())
  const [productIdFilter, setProductIdFilter] = useState("")
  const [productIds, setProductIds] = useState(DEFAULT_PRODUCT_IDS)

  useEffect(() => { if (!profileLoading) fetchAll() }, [profileLoading, userCountry])
  useEffect(() => { fetchProductIds() }, [])

  const fetchProductIds = async () => {
    try {
      const { data } = await supabase.from("product_ids").select("code, category").order("code")
      if (data && data.length) {
        const map = {}
        data.forEach(p => { map[p.code] = p.category })
        setProductIds(map)
      }
    } catch { /* table may not exist yet — use defaults */ }
  }

  const fetchAll = async () => {
    setLoading(true)
    const todayStr = new Date().toISOString().split("T")[0]
    const otherPromises = Promise.all([
      supabase.from("borrow_history").select("*, assets(name,serial_number,asset_tag)").order("borrowed_at", { ascending: false }),
      supabase.from("maintenance_schedules").select("*, assets(name,serial_number)").order("scheduled_date", { ascending: false }),
      supabase.from("borrow_history").select("*, assets(name,serial_number,asset_tag)").is("returned_at", null).not("due_date", "is", null).eq("status", "approved").lt("due_date", todayStr).order("due_date", { ascending: true }),
    ])

    // Supabase caps each request at 1000 rows by default — page through with
    // .range() until a page comes back short, then combine into one array.
    const PAGE_SIZE = 1000
    let allAssets = []
    let from = 0
    while (true) {
      let assetQuery = supabase.from("assets").select("*").order("name").range(from, from + PAGE_SIZE - 1)
      if (userCountry) assetQuery = assetQuery.eq("country", userCountry)
      const { data: page } = await assetQuery
      if (page?.length) allAssets = allAssets.concat(page)
      if (!page || page.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }

    const [{ data: b }, { data: m }, { data: od }] = await otherPromises
    setAssets(allAssets)
    setBorrows(b || [])
    setMaintenance(m || [])
    setOverdueBorrowsData(od || [])
    setLoading(false)
  }

  // ── Product ID filtering ─────────────────────────────────────────────────────
  const filteredAssets = useMemo(() => {
    if (!productIdFilter) return assets
    const cat = productIds[productIdFilter]
    return assets.filter(a => a.category === cat)
  }, [assets, productIdFilter, productIds])

  // ── Per-report data ──────────────────────────────────────────────────────────
  const reportData = useMemo(() => {
    const todayStr = today()

    if (reportType === "inventory") {
      let rows = [...filteredAssets]
      if (dateFrom) rows = rows.filter(a => (a.purchase_date || "") >= dateFrom)
      if (dateTo)   rows = rows.filter(a => (a.purchase_date || "") <= dateTo)
      const byStatus = Object.entries(
        rows.reduce((acc, a) => { acc[a.status] = (acc[a.status] || 0) + 1; return acc }, {})
      ).map(([name, value]) => ({ name: statusLabel(name), value }))
      const byCategory = Object.entries(
        rows.reduce((acc, a) => { const c = a.category || "Unknown"; acc[c] = (acc[c] || 0) + 1; return acc }, {})
      ).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8)
      return { rows, byStatus, byCategory,
        stats: {
          total: rows.length,
          available: rows.filter(a => a.status === "available").length,
          assigned: rows.filter(a => a.status === "assigned").length,
          retired: rows.filter(a => a.status === "retired").length,
        }
      }
    }

    if (reportType === "warranty") {
      const cutoff = daysFromNow(warrantyDays)
      let rows = filteredAssets.filter(a => a.warranty_expiry && a.warranty_expiry >= todayStr && a.warranty_expiry <= cutoff)
      if (dateFrom) rows = rows.filter(a => a.warranty_expiry >= dateFrom)
      if (dateTo)   rows = rows.filter(a => a.warranty_expiry <= dateTo)
      rows = rows.sort((a, b) => a.warranty_expiry.localeCompare(b.warranty_expiry))
      const exp30 = rows.filter(a => a.warranty_expiry <= daysFromNow(30)).length
      const exp60 = rows.filter(a => a.warranty_expiry > daysFromNow(30) && a.warranty_expiry <= daysFromNow(60)).length
      const exp90 = rows.filter(a => a.warranty_expiry > daysFromNow(60)).length
      const chartData = [
        { name: "0–30 days", value: exp30 },
        { name: "31–60 days", value: exp60 },
        { name: "61–90 days", value: exp90 },
      ]
      return { rows, chartData, stats: { total: rows.length, exp30, exp60, exp90 } }
    }

    if (reportType === "depreciation") {
      const asOfDate = new Date(depYear, depMonth, 0) // last day of selected month
      const rows = filteredAssets
        .map(a => {
          const price = parseFloat(a.purchase_price)
          const noPrice = !a.purchase_price || isNaN(price) || price <= 0
          // calcDepreciation returns null for a $0/missing price — still include
          // the asset (as long as it has a purchase date) showing $0 depreciation.
          if (noPrice && a.purchase_date) {
            const lifespanYears = parseFloat(a.useful_life) > 0 ? parseFloat(a.useful_life) : 5
            return { ...a, dep: {
              originalPrice: 0,
              currentValue: 0,
              accumulatedDepreciation: 0,
              perYear: 0,
              perMonth: 0,
              usefulLife: lifespanYears,
              percentDepreciated: 0,
              percentRemaining: 0,
              yearsOld: 0,
              remainingYears: lifespanYears,
              fullyDepreciated: false,
            }}
          }
          return { ...a, dep: calcDepreciation(a.purchase_price, a.purchase_date, a.useful_life, asOfDate) }
        })
        .filter(a => a.dep)
        .sort((a, b) => a.dep.percentRemaining - b.dep.percentRemaining)
      const totalOriginal = rows.reduce((s, a) => s + a.dep.originalPrice, 0)
      const totalCurrent = rows.reduce((s, a) => s + a.dep.currentValue, 0)
      const fullyDep = rows.filter(a => a.dep.fullyDepreciated).length
      const chartData = rows.slice(0, 10).map(a => ({
        name: a.name.length > 14 ? a.name.slice(0, 14) + "…" : a.name,
        remaining: a.dep.currentValue,
        depreciated: a.dep.accumulatedDepreciation,
      }))
      return { rows, chartData, stats: { totalOriginal, totalCurrent, fullyDep, loss: totalOriginal - totalCurrent } }
    }

    if (reportType === "license") {
      let rows = assets.filter(a => a.license_expiry)
      if (dateFrom) rows = rows.filter(a => a.license_expiry >= dateFrom)
      if (dateTo)   rows = rows.filter(a => a.license_expiry <= dateTo)
      rows = rows.sort((a, b) => a.license_expiry.localeCompare(b.license_expiry))
      const expired = rows.filter(a => a.license_expiry < todayStr).length
      const expiring30 = rows.filter(a => a.license_expiry >= todayStr && a.license_expiry <= daysFromNow(30)).length
      const active = rows.filter(a => a.license_expiry > daysFromNow(30)).length
      const chartData = [
        { name: "Expired", value: expired },
        { name: "Expiring ≤30d", value: expiring30 },
        { name: "Active", value: active },
      ]
      return { rows, chartData, stats: { total: rows.length, expired, expiring30, active } }
    }

    if (reportType === "maintenance") {
      let rows = [...maintenance]
      if (dateFrom) rows = rows.filter(m => (m.scheduled_date || m.created_at || "") >= dateFrom)
      if (dateTo)   rows = rows.filter(m => (m.scheduled_date || m.created_at || "") <= dateTo)
      const byStatus = Object.entries(
        rows.reduce((acc, m) => { const s = m.status || "unknown"; acc[s] = (acc[s] || 0) + 1; return acc }, {})
      ).map(([name, value]) => ({ name, value }))
      return { rows, byStatus, stats: {
        total: rows.length,
        completed: rows.filter(m => m.status === "completed").length,
        pending: rows.filter(m => m.status === "scheduled" || m.status === "pending").length,
      }}
    }

    if (reportType === "borrow") {
      let rows = [...borrows]
      if (dateFrom) rows = rows.filter(b => (b.borrowed_at || "") >= dateFrom)
      if (dateTo)   rows = rows.filter(b => (b.borrowed_at || "") <= dateTo)
      const active = rows.filter(b => !b.returned_at).length
      const returned = rows.filter(b => !!b.returned_at).length
      const byMonth = rows.reduce((acc, b) => {
        const m = (b.borrowed_at || "").slice(0, 7)
        if (m) acc[m] = (acc[m] || 0) + 1
        return acc
      }, {})
      const chartData = Object.entries(byMonth).sort().slice(-6).map(([name, count]) => ({ name, count }))
      return { rows, chartData, stats: { total: rows.length, active, returned } }
    }

    if (reportType === "overdue_borrows") {
      let rows = [...overdueBorrowsData]
      if (dateFrom) rows = rows.filter(b => (b.due_date || "") >= dateFrom)
      if (dateTo)   rows = rows.filter(b => (b.due_date || "") <= dateTo)
      const overdueDays = rows.map(b => {
        const diff = Math.ceil((new Date() - new Date(b.due_date)) / 86400000)
        return { ...b, _overdue_days: diff }
      })
      return {
        rows: overdueDays,
        stats: {
          total: rows.length,
          critical: overdueDays.filter(b => b._overdue_days > 14).length,
          warning: overdueDays.filter(b => b._overdue_days >= 7 && b._overdue_days <= 14).length,
        }
      }
    }

    if (reportType === "dept_count") {
      const deptAssets = filteredAssets
      const deptMap = deptAssets.reduce((acc, a) => {
        const dept = a.department || "No Department"
        if (!acc[dept]) acc[dept] = { total: 0, available: 0, assigned: 0, maintenance: 0, retired: 0 }
        acc[dept].total++
        if (a.status) acc[dept][a.status] = (acc[dept][a.status] || 0) + 1
        return acc
      }, {})
      const rows = Object.entries(deptMap).sort((a, b) => b[1].total - a[1].total)
      const chartData = rows.slice(0, 8).map(([name, v]) => ({ name, count: v.total }))
      const deptCount = rows.filter(([name]) => name !== "No Department").length
      return { rows, chartData, stats: { deptCount, totalAssets: deptAssets.length } }
    }

    if (reportType === "license_expiry") {
      const todayStr_ = today()
      let rows = assets.filter(a => a.license_expiry)
      const expDays = warrantyDays // reuse the days filter
      const cutoff = daysFromNow(expDays)
      rows = rows.filter(a => a.license_expiry <= cutoff).sort((a, b) => a.license_expiry.localeCompare(b.license_expiry))
      const expired = rows.filter(a => a.license_expiry < todayStr_).length
      const expiring30 = rows.filter(a => a.license_expiry >= todayStr_ && a.license_expiry <= daysFromNow(30)).length
      const active = rows.filter(a => a.license_expiry > daysFromNow(30)).length
      return { rows, stats: { total: rows.length, expired, expiring30, active } }
    }

    return {}
  }, [reportType, assets, filteredAssets, productIdFilter, borrows, maintenance, overdueBorrowsData, dateFrom, dateTo, warrantyDays, depMonth, depYear])

  // ── Export PDF ───────────────────────────────────────────────────────────────
  const exportPDF = () => {
    const doc = new jsPDF()
    const rt = REPORT_TYPES.find(r => r.id === reportType)
    pdfHeader(doc, rt.label)
    let y = 36

    if (reportType === "inventory") {
      const { rows, stats } = reportData
      autoTable(doc, {
        startY: y, head: [["Metric","Count"]],
        body: [["Total",stats.total],["Unassigned",stats.available],["Assigned",stats.assigned],["Retired",stats.retired]],
        theme: "grid", headStyles: { fillColor: [37,99,235] }, tableWidth: 80, margin: { left: 14 },
      })
      y = doc.lastAutoTable.finalY + 8
      autoTable(doc, {
        startY: y, head: [["Asset Name","Category","Serial No.","Dept","Status"]],
        body: rows.map(a => [a.name, a.category||"—", a.serial_number||"—", a.department||"—", statusLabel(a.status)]),
        theme: "striped", headStyles: { fillColor: [37,99,235] }, styles: { fontSize: 7 }, margin: { left: 14 },
      })
    }

    if (reportType === "warranty") {
      const { rows } = reportData
      autoTable(doc, {
        startY: y, head: [["Asset Name","Serial No.","Dept","Warranty Expiry","Days Left"]],
        body: rows.map(a => {
          const days = Math.ceil((new Date(a.warranty_expiry) - new Date()) / 86400000)
          return [a.name, a.serial_number||"—", a.department||"—", a.warranty_expiry, `${days}d`]
        }),
        theme: "striped", headStyles: { fillColor: [37,99,235] }, styles: { fontSize: 7 }, margin: { left: 14 },
      })
    }

    if (reportType === "depreciation") {
      const { rows, stats } = reportData
      doc.setFontSize(9)
      doc.text(`As of ${MONTHS[depMonth - 1]} ${depYear}  |  Total Original Value: ${currencySymbol}${stats.totalOriginal.toLocaleString()}  |  Current Value: ${currencySymbol}${Math.round(stats.totalCurrent).toLocaleString()}  |  Fully Depreciated: ${stats.fullyDep}`, 14, y)
      y += 6
      autoTable(doc, {
        startY: y, head: [["Asset Tag","Asset Name","Purchase Date","Useful Life","Monthly Dep.","Accum. Dep.","Net Book Value"]],
        body: rows.map(a => [
          a.asset_tag || "—", a.name, a.purchase_date || "—", `${a.dep.usefulLife}yr`,
          `${currencySymbol}${a.dep.perMonth.toLocaleString()}`,
          `${currencySymbol}${Math.round(a.dep.accumulatedDepreciation).toLocaleString()}`,
          `${currencySymbol}${Math.round(a.dep.currentValue).toLocaleString()}`,
        ]),
        theme: "striped", headStyles: { fillColor: [37,99,235] }, styles: { fontSize: 7 }, margin: { left: 14 },
      })
    }

    if (reportType === "license") {
      const { rows } = reportData
      autoTable(doc, {
        startY: y, head: [["Asset Name","Serial No.","Dept","License Expiry","Status"]],
        body: rows.map(a => {
          const expired = a.license_expiry < today()
          return [a.name, a.serial_number||"—", a.department||"—", a.license_expiry, expired ? "Expired" : "Active"]
        }),
        theme: "striped", headStyles: { fillColor: [37,99,235] }, styles: { fontSize: 7 }, margin: { left: 14 },
      })
    }

    if (reportType === "maintenance") {
      const { rows } = reportData
      autoTable(doc, {
        startY: y, head: [["Asset","Type","Description","Scheduled","Status"]],
        body: rows.map(m => [
          m.assets?.name||"—", m.maintenance_type||"—",
          (m.description||"").slice(0,40), m.scheduled_date||"—", m.status||"—",
        ]),
        theme: "striped", headStyles: { fillColor: [37,99,235] }, styles: { fontSize: 7 }, margin: { left: 14 },
      })
    }

    if (reportType === "borrow") {
      const { rows } = reportData
      autoTable(doc, {
        startY: y, head: [["Asset","Borrower","Borrow Date","Due Date","Return Date"]],
        body: rows.map(b => [
          borrowAssetLabel(b), b.borrower_name||"—",
          (b.borrowed_at||"").slice(0,10), b.due_date||"—", b.returned_at ? b.returned_at.slice(0,10) : "Active",
        ]),
        theme: "striped", headStyles: { fillColor: [37,99,235] }, styles: { fontSize: 7 }, margin: { left: 14 },
      })
    }

    if (reportType === "overdue_borrows") {
      const { rows } = reportData
      autoTable(doc, {
        startY: y, head: [["Asset","Borrower","Expected Return","Days Overdue"]],
        body: rows.map(b => [
          borrowAssetLabel(b),
          b.borrower_name||"—",
          b.due_date||"—",
          `${b._overdue_days}d`,
        ]),
        theme: "striped", headStyles: { fillColor: [220,38,38] }, styles: { fontSize: 7 }, margin: { left: 14 },
      })
    }

    if (reportType === "dept_count") {
      const { rows } = reportData
      autoTable(doc, {
        startY: y, head: [["Department","Total","Unassigned","Assigned","Maintenance","Retired"]],
        body: rows.map(([dept, v]) => [dept, v.total, v.available||0, v.assigned||0, v.maintenance||0, v.retired||0]),
        theme: "striped", headStyles: { fillColor: [37,99,235] }, styles: { fontSize: 7 }, margin: { left: 14 },
      })
    }

    if (reportType === "license_expiry") {
      const { rows } = reportData
      autoTable(doc, {
        startY: y, head: [["Asset Name","Serial No.","Department","License Expiry","Status"]],
        body: rows.map(a => {
          const exp = a.license_expiry < today()
          return [a.name, a.serial_number||"—", a.department||"—", a.license_expiry, exp ? "Expired" : "Active"]
        }),
        theme: "striped", headStyles: { fillColor: [37,99,235] }, styles: { fontSize: 7 }, margin: { left: 14 },
      })
    }

    pdfFooter(doc)
    doc.save(`Trainocate_${reportType}_${today()}.pdf`)
  }

  // ── Export Excel ─────────────────────────────────────────────────────────────
  const exportExcel = () => {
    let rows = []

    if (reportType === "inventory") {
      rows = (reportData.rows || []).map(a => ({
        "Asset Name": a.name, "Category": a.category||"", "Brand/Model": a.brand_model||"",
        "Serial Number": a.serial_number||"", "Asset Tag": a.asset_tag||"",
        "Status": statusLabel(a.status), "Location": a.location||"", "Assigned To": a.assigned_user||"",
        "Department": a.department||"", "Purchase Date": a.purchase_date||"",
        [`Purchase Price (${currencySymbol})`]: a.purchase_price||"", "Warranty Expiry": a.warranty_expiry||"", "Remarks": a.remarks||"",
      }))
    } else if (reportType === "warranty") {
      rows = (reportData.rows || []).map(a => ({
        "Asset Name": a.name, "Serial Number": a.serial_number||"", "Department": a.department||"",
        "Warranty Expiry": a.warranty_expiry,
        "Days Left": Math.ceil((new Date(a.warranty_expiry) - new Date()) / 86400000),
      }))
    } else if (reportType === "depreciation") {
      rows = (reportData.rows || []).map(a => ({
        "Asset Tag": a.asset_tag || "", "Asset Name": a.name, "Purchase Date": a.purchase_date || "",
        "Purchase Price": a.dep.originalPrice, "Useful Life (years)": a.dep.usefulLife,
        "Monthly Depreciation": a.dep.perMonth,
        [`Accumulated Depreciation as of ${MONTHS[depMonth - 1]} ${depYear}`]: Math.round(a.dep.accumulatedDepreciation),
        "Net Book Value": Math.round(a.dep.currentValue),
        "% Remaining": a.dep.percentRemaining, "Years Old": a.dep.yearsOld,
        "Fully Depreciated": a.dep.fullyDepreciated ? "Yes" : "No",
      }))
    } else if (reportType === "license") {
      rows = (reportData.rows || []).map(a => ({
        "Asset Name": a.name, "Serial Number": a.serial_number||"",
        "Department": a.department||"", "License Expiry": a.license_expiry,
        "Status": a.license_expiry < today() ? "Expired" : "Active",
      }))
    } else if (reportType === "maintenance") {
      rows = (reportData.rows || []).map(m => ({
        "Asset": m.assets?.name||"", "Type": m.maintenance_type||"",
        "Description": m.description||"", "Scheduled Date": m.scheduled_date||"",
        "Status": m.status||"",
      }))
    } else if (reportType === "borrow") {
      rows = (reportData.rows || []).map(b => ({
        "Asset": borrowAssetLabel(b), "Borrower": b.borrower_name||"",
        "Borrow Date": (b.borrowed_at||"").slice(0,10), "Due Date": b.due_date||"",
        "Return Date": b.returned_at ? b.returned_at.slice(0,10) : "Active",
      }))
    } else if (reportType === "overdue_borrows") {
      rows = (reportData.rows || []).map(b => ({
        "Asset": borrowAssetLabel(b),
        "Borrower": b.borrower_name||"",
        "Due Date": b.due_date||"",
        "Days Overdue": b._overdue_days,
      }))
    } else if (reportType === "dept_count") {
      rows = (reportData.rows || []).map(([dept, v]) => ({
        "Department": dept, "Total": v.total, "Unassigned": v.available||0,
        "Assigned": v.assigned||0, "Maintenance": v.maintenance||0, "Retired": v.retired||0,
      }))
    } else if (reportType === "license_expiry") {
      rows = (reportData.rows || []).map(a => ({
        "Asset Name": a.name, "Serial Number": a.serial_number||"",
        "Department": a.department||"", "License Expiry": a.license_expiry,
        "Status": a.license_expiry < today() ? "Expired" : "Active",
      }))
    }

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Report")
    XLSX.writeFile(wb, `Trainocate_${reportType}_${today()}.xlsx`)
  }

  // ── Export Full Year Depreciation (Excel) ────────────────────────────────────
  const exportFullYearExcel = () => {
    const rows = filteredAssets
      .filter(a => a.purchase_price && a.purchase_date)
      .map(a => {
        const dep = calcDepreciation(a.purchase_price, a.purchase_date, a.useful_life, new Date(depYear, 11, 31))
        const row = {
          "Asset Tag": a.asset_tag || "",
          "Asset Name": a.name,
          "Category": a.category || "",
          "Purchase Date": a.purchase_date || "",
          "Useful Life (years)": dep.usefulLife,
          "Monthly Depreciation": dep.perMonth,
        }
        MONTHS.forEach((m, i) => {
          const asOfDate = new Date(depYear, i + 1, 0) // last day of month i+1
          const monthDep = calcDepreciation(a.purchase_price, a.purchase_date, a.useful_life, asOfDate)
          row[`${m} Accumulated Depreciation`] = monthDep ? Math.round(monthDep.accumulatedDepreciation) : ""
          row[`${m} Net Book Value`] = monthDep ? Math.round(monthDep.currentValue) : ""
        })
        return row
      })

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `FY ${depYear}`)
    XLSX.writeFile(wb, `Trainocate_depreciation_fullyear_${depYear}.xlsx`)
  }

  const rt = REPORT_TYPES.find(r => r.id === reportType)

  const selectReport = (id) => { setReportType(id); setDateFrom(""); setDateTo("") }

  return (
    <div className="md:flex md:flex-row md:h-full md:min-h-screen">

      {/* ── Mobile: dropdown selector (hidden on md+) ── */}
      <div className="md:hidden px-4 pt-4 pb-3 bg-gray-900/80 border-b border-gray-800">
        <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">Report Type</p>
        <select
          value={reportType}
          onChange={e => selectReport(e.target.value)}
          className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
        >
          {REPORT_TYPES.map(r => (
            <option key={r.id} value={r.id}>{r.icon} {r.label}</option>
          ))}
        </select>
      </div>

      {/* ── Desktop: collapsible sidebar (hidden on mobile) ── */}
      <motion.aside
        animate={{ width: sidebarOpen ? 224 : 52 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="hidden md:flex shrink-0 flex-col bg-gray-900/80 border-r border-gray-800 overflow-hidden"
        style={{ minHeight: "100%" }}
      >
        {/* Collapse toggle button */}
        <div className={`flex ${sidebarOpen ? "justify-end px-2 pt-3 pb-1" : "justify-center pt-3 pb-1"}`}>
          <button
            onClick={() => setSidebarOpen(o => !o)}
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:text-white hover:bg-gray-800 transition-all"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              {sidebarOpen
                ? <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                : <path d="M5 2L10 7L5 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              }
            </svg>
          </button>
        </div>

        {/* Label — only visible when expanded */}
        <AnimatePresence initial={false}>
          {sidebarOpen && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="text-gray-500 text-xs font-semibold uppercase tracking-wider px-4 pb-2"
            >
              Report Type
            </motion.p>
          )}
        </AnimatePresence>

        {/* Nav items */}
        <nav className="flex-1 px-1.5 space-y-0.5 pb-4">
          {REPORT_TYPES.map(r => (
            <button
              key={r.id}
              onClick={() => selectReport(r.id)}
              title={!sidebarOpen ? r.label : undefined}
              className={`w-full text-left rounded-xl transition-all flex items-center gap-2.5 ${
                sidebarOpen ? "px-3 py-2.5" : "px-0 py-2.5 justify-center"
              } ${
                reportType === r.id
                  ? "bg-blue-600/20 border border-blue-500/40 text-blue-300"
                  : "text-gray-400 hover:bg-gray-800 hover:text-white border border-transparent"
              }`}
            >
              <span className="text-base shrink-0">{r.icon}</span>
              <AnimatePresence initial={false}>
                {sidebarOpen && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.15 }}
                    className="text-sm leading-tight overflow-hidden whitespace-nowrap"
                  >
                    {r.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          ))}
        </nav>
      </motion.aside>

      {/* ── Main panel ── */}
      <div className="md:flex-1 md:min-w-0 md:overflow-auto p-4 md:p-6" style={{ height: "auto", overflow: "visible", minHeight: 0 }}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 min-w-0">
            <h1 className="text-sm md:text-2xl font-bold text-white flex items-center gap-1.5 md:gap-2">
              <span>{rt.icon}</span>
              <span className="truncate">{rt.label}</span>
            </h1>
            <p className="text-gray-500 text-xs mt-0.5 hidden md:block">{rt.desc}</p>
          </div>
          <div className="flex gap-1.5 md:gap-2 shrink-0">
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={exportPDF}
              className="bg-red-600/80 hover:bg-red-600 text-white px-2 md:px-3 py-1.5 rounded-lg text-xs font-medium transition-all">
              <span className="md:hidden">📄</span>
              <span className="hidden md:inline">📄 PDF</span>
            </motion.button>
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={exportExcel}
              className="bg-green-600/80 hover:bg-green-600 text-white px-2 md:px-3 py-1.5 rounded-lg text-xs font-medium transition-all">
              <span className="md:hidden">📊</span>
              <span className="hidden md:inline">📊 Excel</span>
            </motion.button>
            {reportType === "depreciation" && (
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                onClick={exportFullYearExcel}
                className="bg-emerald-600/80 hover:bg-emerald-600 text-white px-2 md:px-3 py-1.5 rounded-lg text-xs font-medium transition-all">
                <span className="md:hidden">📊</span>
                <span className="hidden md:inline">📊 Full Year Excel</span>
              </motion.button>
            )}
          </div>
        </div>

        {/* Product ID Reference & Filter */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-5">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide">Product ID Reference</p>
            {productIdFilter && (
              <span className="bg-blue-600/20 border border-blue-500/40 text-blue-300 text-xs px-3 py-1 rounded-full font-medium">
                Filtering: {productIdFilter} — {productIds[productIdFilter]}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-4">
            {Object.entries(productIds).map(([id, cat]) => (
              <div key={id} className={`rounded-lg border px-3 py-2 text-xs ${
                productIdFilter === id
                  ? "bg-blue-600/20 border-blue-500/40 text-blue-300"
                  : "bg-gray-800/60 border-gray-700 text-gray-400"
              }`}>
                <span className="font-semibold">{id}</span> — {cat}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-gray-500 text-xs shrink-0">Filter by Product ID</label>
            <select
              value={productIdFilter}
              onChange={e => setProductIdFilter(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500"
            >
              <option value="">All</option>
              {Object.entries(productIds).map(([id, cat]) => (
                <option key={id} value={id}>{id} - {cat}</option>
              ))}
            </select>
            {productIdFilter && (
              <button onClick={() => setProductIdFilter("")}
                className="text-gray-500 hover:text-white text-xs px-2 py-1.5 rounded-lg hover:bg-gray-800 transition-all">
                ✕ Clear
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-5">
          {reportType === "depreciation" && (
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-xs">As of</span>
              <select value={depMonth} onChange={e => setDepMonth(parseInt(e.target.value))}
                className="bg-gray-800 border border-gray-700 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500">
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <select value={depYear} onChange={e => setDepYear(parseInt(e.target.value))}
                className="bg-gray-800 border border-gray-700 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500">
                {DEP_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          )}
          {(reportType === "warranty" || reportType === "license_expiry") && (
            <div className="flex gap-2">
              {[30, 60, 90].map(d => (
                <button key={d} onClick={() => setWarrantyDays(d)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    warrantyDays === d
                      ? "bg-blue-600 border-blue-500 text-white"
                      : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500"
                  }`}>
                  {d} days
                </button>
              ))}
            </div>
          )}
          {(reportType === "inventory" || reportType === "warranty" || reportType === "license" || reportType === "maintenance" || reportType === "borrow" || reportType === "overdue_borrows") && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-gray-500 text-xs">From</span>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  className="bg-gray-800 border border-gray-700 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-500 text-xs">To</span>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  className="bg-gray-800 border border-gray-700 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500" />
              </div>
              {(dateFrom || dateTo) && (
                <button onClick={() => { setDateFrom(""); setDateTo("") }}
                  className="text-gray-500 hover:text-white text-xs px-2 py-1.5 rounded-lg hover:bg-gray-800 transition-all">
                  ✕ Clear
                </button>
              )}
            </>
          )}
        </div>

        {loading ? (
          <div className="py-4">
            <LoadingSkeleton rows={4} cols={2} />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div key={reportType}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}>

              {/* ── INVENTORY ── */}
              {reportType === "inventory" && reportData.stats && (() => {
                const mob = window.innerWidth < 768
                return (
                <div style={{ width: "100%", maxWidth: "100vw", overflowX: "hidden" }}>
                  {/* Stat cards: 2×2 on mobile, 1×4 on desktop */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-1 md:gap-3 mb-3 md:mb-5">
                    <StatCard label="Total" value={reportData.stats.total} color="blue" delay={0} compact={mob} />
                    <StatCard label="Unassigned" value={reportData.stats.available} color="green" delay={0.05} compact={mob} />
                    <StatCard label="Assigned" value={reportData.stats.assigned} color="purple" delay={0.1} compact={mob} />
                    <StatCard label="Retired" value={reportData.stats.retired} color="red" delay={0.15} compact={mob} />
                  </div>
                  {/* Charts: stacked on mobile, side-by-side on desktop */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-4 mb-3 md:mb-5">
                    <div className="bg-gray-900 rounded-xl border border-gray-800 p-2 md:p-4" style={{ width: "100%", maxWidth: "100%", overflowX: "hidden" }}>
                      <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-1 md:mb-3">Status</p>
                      <div style={{ width: "90%", maxWidth: "90%", overflowX: "hidden", margin: "0 auto" }}>
                        <ResponsiveContainer width="90%" height={mob ? 140 : 200}>
                          <PieChart>
                            <Pie data={reportData.byStatus} dataKey="value" nameKey="name" cx="50%" cy="50%"
                              outerRadius={mob ? 40 : 65}
                              label={false}
                              labelLine={false}>
                              {reportData.byStatus.map((_, i) => (
                                <Cell key={i} fill={Object.values(STATUS_COLORS)[i] || CHART_COLORS[i]} />
                              ))}
                            </Pie>
                            <Tooltip content={<DarkTooltip />} />
                            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: mob ? 9 : 11, color: "#9ca3af" }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div className="bg-gray-900 rounded-xl border border-gray-800 p-2 md:p-4" style={{ width: "100%", maxWidth: "100%", overflowX: "hidden" }}>
                      <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-1 md:mb-3">Category</p>
                      <div style={{ width: "90%", maxWidth: "90%", overflowX: "hidden", margin: "0 auto" }}>
                        <ResponsiveContainer width="90%" height={mob ? 120 : 180}>
                          <BarChart data={reportData.byCategory} layout="vertical" margin={{ left: 2, right: 8 }}>
                            <XAxis type="number" tick={{ fill: "#6b7280", fontSize: mob ? 7 : 10 }} axisLine={false} tickLine={false} />
                            <YAxis type="category" dataKey="name" tick={{ fill: "#9ca3af", fontSize: mob ? 7 : 10 }} width={mob ? 40 : 70} axisLine={false} tickLine={false} />
                            <Tooltip content={<DarkTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                            <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Count" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                  {/* Table: 2 cols on mobile, 3 on desktop */}
                  <ReportTable
                    headers={mob ? ["Asset Name","Status"] : ["Asset Name","Category","Status"]}
                    rows={reportData.rows.map(a => mob
                      ? [a.name.length > 10 ? a.name.slice(0, 10) + "…" : a.name, <StatusBadge key="s" status={a.status} />]
                      : [a.name, a.category||"—", <StatusBadge key="s" status={a.status} />]
                    )} />
                </div>
                )
              })()}

              {/* ── WARRANTY ── */}
              {reportType === "warranty" && reportData.stats && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                    <StatCard label="Total Expiring" value={reportData.stats.total} color="orange" delay={0} />
                    <StatCard label="Within 30 days" value={reportData.stats.exp30} color="red" delay={0.05} />
                    <StatCard label="31–60 days" value={reportData.stats.exp60} color="yellow" delay={0.1} />
                    <StatCard label="61–90 days" value={reportData.stats.exp90} color="green" delay={0.15} />
                  </div>
                  <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-5" style={{ width: "100%", maxWidth: "100%", overflowX: "hidden" }}>
                    <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-3">Expiry Breakdown</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={reportData.chartData}>
                        <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                        <Tooltip content={<DarkTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                        <Bar dataKey="value" name="Assets" radius={[4,4,0,0]}>
                          {reportData.chartData.map((_, i) => (
                            <Cell key={i} fill={["#ef4444","#f59e0b","#22c55e"][i]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <ReportTable headers={["Asset Name","Expiry","Days Left"]}
                    rows={reportData.rows.map(a => {
                      const days = Math.ceil((new Date(a.warranty_expiry) - new Date()) / 86400000)
                      return [a.name, a.warranty_expiry,
                        <span key="d" className={days <= 30 ? "text-red-400 font-semibold" : days <= 60 ? "text-yellow-400" : "text-green-400"}>{days}d</span>]
                    })} />
                </>
              )}

              {/* ── DEPRECIATION ── */}
              {reportType === "depreciation" && reportData.stats && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                    <StatCard label="Total Original" value={`${currencySymbol}${Math.round(reportData.stats.totalOriginal).toLocaleString()}`} color="blue" delay={0} />
                    <StatCard label="Current Value" value={`${currencySymbol}${Math.round(reportData.stats.totalCurrent).toLocaleString()}`} color="green" delay={0.05} />
                    <StatCard label="Total Loss" value={`${currencySymbol}${Math.round(reportData.stats.loss).toLocaleString()}`} color="red" delay={0.1} />
                    <StatCard label="Fully Dep." value={reportData.stats.fullyDep} color="orange" delay={0.15} />
                  </div>
                  <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-5" style={{ width: "100%", maxWidth: "100%", overflowX: "hidden" }}>
                    <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-3">Top 10 — Remaining vs Depreciated</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={reportData.chartData} margin={{ left: 0, right: 8 }}>
                        <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 9 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                        <Tooltip content={<DarkTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                        <Legend wrapperStyle={{ color: "#9ca3af", fontSize: 11 }} />
                        <Bar dataKey="remaining" name="Remaining" stackId="a" fill="#22c55e" />
                        <Bar dataKey="depreciated" name="Depreciated" stackId="a" fill="#ef4444" radius={[4,4,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-gray-500 text-xs mb-2">Accumulated depreciation shown as of {MONTHS[depMonth - 1]} {depYear}</p>
                  <ReportTable headers={["Asset Tag","Asset Name","Purchase Date","Useful Life","Monthly Dep.","Accum. Dep.","Net Book Value"]}
                    rows={reportData.rows.map(a => [
                      a.asset_tag || "—",
                      a.name,
                      a.purchase_date || "—",
                      `${a.dep.usefulLife} yr`,
                      `${currencySymbol}${a.dep.perMonth.toLocaleString()}`,
                      `${currencySymbol}${Math.round(a.dep.accumulatedDepreciation).toLocaleString()}`,
                      `${currencySymbol}${Math.round(a.dep.currentValue).toLocaleString()}`,
                    ])} />
                </>
              )}

              {/* ── LICENSE ── */}
              {reportType === "license" && reportData.stats && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
                    <StatCard label="Total Licensed" value={reportData.stats.total} color="blue" />
                    <StatCard label="Expired" value={reportData.stats.expired} color="red" />
                    <StatCard label="Expiring ≤30 days" value={reportData.stats.expiring30} color="yellow" />
                  </div>
                  <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-5" style={{ width: "100%", maxWidth: "100%", overflowX: "hidden" }}>
                    <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-3">License Status Overview</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={reportData.chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}
                          label={false} labelLine={false}>
                          {reportData.chartData.map((_, i) => (
                            <Cell key={i} fill={["#ef4444","#f59e0b","#22c55e"][i]} />
                          ))}
                        </Pie>
                        <Tooltip content={<DarkTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex justify-center gap-4 mt-3 flex-wrap">
                      {reportData.chartData.map((entry, i) => (
                        <div key={entry.name} className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: ["#ef4444","#f59e0b","#22c55e"][i] }} />
                          <span className="text-gray-400 text-xs">{entry.name} ({entry.value})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <ReportTable headers={["Asset Name","License Expiry","Status"]}
                    rows={reportData.rows.map(a => {
                      const expired = a.license_expiry < today()
                      const expiring = !expired && a.license_expiry <= daysFromNow(30)
                      return [a.name, a.license_expiry,
                        <span key="s" className={expired ? "text-red-400" : expiring ? "text-yellow-400" : "text-green-400"}>
                          {expired ? "Expired" : expiring ? "Expiring Soon" : "Active"}
                        </span>
                      ]
                    })} />
                </>
              )}

              {/* ── MAINTENANCE ── */}
              {reportType === "maintenance" && reportData.stats && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
                    <StatCard label="Total Records" value={reportData.stats.total} color="blue" />
                    <StatCard label="Completed" value={reportData.stats.completed} color="green" />
                    <StatCard label="Pending" value={reportData.stats.pending} color="yellow" />
                  </div>
                  {reportData.byStatus.length > 0 && (
                    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-5" style={{ width: "100%", maxWidth: "100%", overflowX: "hidden" }}>
                      <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-3">Status Breakdown</p>
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={reportData.byStatus}>
                          <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 10 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
                          <Tooltip content={<DarkTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                          <Bar dataKey="value" name="Count" radius={[4,4,0,0]}>
                            {reportData.byStatus.map((_, i) => <Cell key={i} fill={CHART_COLORS[i]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  <ReportTable headers={["Asset","Type","Scheduled","Status"]}
                    rows={(reportData.rows||[]).map(m => [
                      m.assets?.name||"—", m.maintenance_type||"—",
                      m.scheduled_date||"—", m.status||"—",
                    ])} />
                </>
              )}

              {/* ── OVERDUE BORROWS ── */}
              {reportType === "overdue_borrows" && reportData.stats && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
                    <StatCard label="Total Overdue" value={reportData.stats.total} color="red" delay={0} />
                    <StatCard label="Critical (>14d)" value={reportData.stats.critical} color="red" delay={0.05} />
                    <StatCard label="Warning (7–14d)" value={reportData.stats.warning} color="yellow" delay={0.1} />
                  </div>
                  {reportData.rows.length === 0 ? (
                    <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-8 text-center">
                      <p className="text-green-400 font-semibold">✅ No overdue borrows!</p>
                      <p className="text-gray-500 text-sm mt-1">All active borrows are within their return date.</p>
                    </div>
                  ) : (
                    <ReportTable headers={["Asset","Borrower","Expected Return","Days Overdue"]}
                      rows={reportData.rows.map(b => [
                        borrowAssetLabel(b),
                        b.borrower_name || "—",
                        b.due_date || "—",
                        <span key="d" className={b._overdue_days > 14 ? "text-red-400 font-bold" : b._overdue_days >= 7 ? "text-yellow-400 font-semibold" : "text-orange-400"}>
                          {b._overdue_days}d overdue
                        </span>,
                      ])} />
                  )}
                </>
              )}

              {/* ── DEPT COUNT ── */}
              {reportType === "dept_count" && reportData.stats && (
                <>
                  <div className="grid grid-cols-2 gap-3 mb-5">
                    <StatCard label="Departments" value={reportData.stats.deptCount} color="blue" />
                    <StatCard label="Total Assets" value={reportData.stats.totalAssets} color="purple" />
                  </div>
                  {reportData.chartData?.length > 0 && (
                    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-5" style={{ width: "100%", maxWidth: "100%", overflowX: "hidden" }}>
                      <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-3">Asset Count by Department</p>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={reportData.chartData} margin={{ left: 0, right: 8 }}>
                          <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 9 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                          <Tooltip content={<DarkTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                          <Bar dataKey="count" name="Assets" radius={[4,4,0,0]}>
                            {reportData.chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  <ReportTable headers={["Department","Total","Unassigned","Assigned","Maintenance","Retired"]}
                    rows={reportData.rows.map(([dept, v]) => [
                      dept, v.total, v.available||0, v.assigned||0, v.maintenance||0, v.retired||0,
                    ])} />
                </>
              )}

              {/* ── LICENSE EXPIRY ── */}
              {reportType === "license_expiry" && reportData.stats && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
                    <StatCard label="Total w/ Licenses" value={reportData.stats.total} color="blue" />
                    <StatCard label="Expired" value={reportData.stats.expired} color="red" />
                    <StatCard label="Expiring ≤30 days" value={reportData.stats.expiring30} color="yellow" />
                  </div>
                  <ReportTable headers={["Asset Name","License Expiry","Days Left","Status"]}
                    rows={reportData.rows.map(a => {
                      const expired = a.license_expiry < today()
                      const expiring = !expired && a.license_expiry <= daysFromNow(30)
                      const daysLeft = Math.ceil((new Date(a.license_expiry) - new Date()) / 86400000)
                      return [
                        a.name,
                        a.license_expiry,
                        expired ? "—" : `${daysLeft}d`,
                        <span key="s" className={expired ? "text-red-400" : expiring ? "text-yellow-400" : "text-green-400"}>
                          {expired ? "Expired" : expiring ? "Expiring Soon" : "Active"}
                        </span>,
                      ]
                    })} />
                </>
              )}

              {/* ── BORROW ── */}
              {reportType === "borrow" && reportData.stats && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
                    <StatCard label="Total Borrows" value={reportData.stats.total} color="blue" />
                    <StatCard label="Active" value={reportData.stats.active} color="purple" />
                    <StatCard label="Returned" value={reportData.stats.returned} color="green" />
                  </div>
                  {reportData.chartData?.length > 0 && (
                    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 mb-5" style={{ width: "100%", maxWidth: "100%", overflowX: "hidden" }}>
                      <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-3">Monthly Borrow Activity (last 6 months)</p>
                      <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={reportData.chartData}>
                          <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 10 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
                          <Tooltip content={<DarkTooltip />} />
                          <Line type="monotone" dataKey="count" name="Borrows" stroke="#a855f7" strokeWidth={2} dot={{ fill: "#a855f7", r: 4 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  <ReportTable headers={["Asset","Borrower","Due Date","Returned"]}
                    rows={(reportData.rows||[]).map(b => [
                      borrowAssetLabel(b), b.borrower_name||"—",
                      b.due_date||"—",
                      b.returned_at ? b.returned_at.slice(0,10) : <span key="a" className="text-yellow-400 text-xs">Active</span>,
                    ])} />
                </>
              )}

            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}

// ── ReportTable ───────────────────────────────────────────────────────────────
function ReportTable({ headers, rows }) {
  if (!rows?.length) {
    return (
      <div className="bg-gray-900 rounded-xl border border-gray-800">
        <EmptyState preset="reports" />
      </div>
    )
  }
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 md:overflow-hidden" style={{ maxWidth: "100%" }}>
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide">Data Preview</p>
        <span className="text-gray-600 text-xs">{rows.length} records</span>
      </div>
      <div className="overflow-x-auto" style={{ maxWidth: "100%" }}>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              {headers.map(h => (
                <th key={h} className="text-left text-gray-500 text-xs font-medium px-4 py-3 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-all">
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-2.5 text-gray-300 text-xs whitespace-nowrap">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── StatusBadge ───────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    available: "bg-green-500/20 text-green-400",
    assigned:  "bg-blue-500/20 text-blue-400",
    maintenance:"bg-yellow-500/20 text-yellow-400",
    retired:   "bg-red-500/20 text-red-400",
    borrowed:  "bg-purple-500/20 text-purple-400",
    returned:  "bg-green-500/20 text-green-400",
    approved:  "bg-blue-500/20 text-blue-400",
    pending:   "bg-yellow-500/20 text-yellow-400",
    rejected:  "bg-red-500/20 text-red-400",
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || "bg-gray-500/20 text-gray-400"}`}>
      {status ? statusLabel(status) : "—"}
    </span>
  )
}
