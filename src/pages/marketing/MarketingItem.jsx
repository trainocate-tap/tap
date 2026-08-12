import { useEffect, useState, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { supabase } from "../../lib/supabase"
import { useAuth } from "../../context/AuthContext"
import { motion, AnimatePresence } from "framer-motion"
import { QRCodeSVG } from "qrcode.react"
import {
  sendMarketingDistributionNotification,
  sendMarketingDecisionEmail,
} from "../../lib/emailService"
import { createNotification, getUserIdByEmail } from "../../lib/notifications"

const CATEGORIES = ["Merchandise", "Flyer", "Gift", "Event Material", "Banner", "Other"]
const UNITS = ["pcs", "Boxes", "Sets", "Rolls", "Packets", "Other"]

const STATUS_COLORS = {
  pending:  "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  approved: "bg-green-500/20 text-green-400 border-green-500/30",
  rejected: "bg-red-500/20 text-red-400 border-red-500/30",
}

const emptyItem = {
  name: "", category: "Merchandise", description: "", vendor: "",
  unit_of_measurement: "pcs", cost_per_unit: "",
  opening_stock: 0, total_purchased: 0, damaged_quantity: 0, reserved_stock: 0,
  budget_allocated: "", cost_center: "",
}

const emptyDist = {
  distributed_to: "", date_of_distribution: new Date().toISOString().split("T")[0],
  quantity: "", purpose: "", recipient_details: "", cost_per_batch: "",
}

function fmtDate(d) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" })
}

export default function MarketingItem() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { userProfile, isMarketing, isAdmin } = useAuth()
  const isNew = id === "new"

  const [item, setItem] = useState(emptyItem)
  const [distributions, setDistributions] = useState([])
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState("")
  const [error, setError] = useState("")
  const [activeTab, setActiveTab] = useState("details")
  const [showDistForm, setShowDistForm] = useState(false)
  const [distForm, setDistForm] = useState(emptyDist)
  const [submittingDist, setSubmittingDist] = useState(false)
  const [officerEmail, setOfficerEmail] = useState("")
  const [actioningId, setActioningId] = useState(null)
  const [rejectingId, setRejectingId] = useState(null)
  const [rejectReason, setRejectReason] = useState("")
  const qrRef = useRef()

  useEffect(() => {
    fetchOfficerEmail()
    if (!isNew) {
      fetchItem()
      fetchDistributions()
    }
  }, [id])

  const fetchOfficerEmail = async () => {
    try {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "marketing_approving_officer_email")
        .single()
      setOfficerEmail(data?.value || "")
    } catch {}
  }

  const fetchItem = async () => {
    setLoading(true)
    const { data, error: err } = await supabase
      .from("marketing_items")
      .select("*")
      .eq("id", id)
      .single()
    if (err || !data) {
      navigate("/admin/marketing")
      return
    }
    setItem(data)
    setLoading(false)
  }

  const fetchDistributions = async () => {
    const { data } = await supabase
      .from("marketing_distributions")
      .select("*")
      .eq("item_id", id)
      .order("created_at", { ascending: false })
    setDistributions(data || [])
  }

  if (!isMarketing && !isAdmin) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-64">
        <span className="text-5xl mb-4">🔒</span>
        <h2 className="text-white text-xl font-bold mb-2">Access Denied</h2>
        <p className="text-gray-400 text-base">Marketing module is only available to Marketing team members.</p>
      </div>
    )
  }

  const availableStock = (item.opening_stock || 0) + (item.total_purchased || 0) - (item.damaged_quantity || 0)
  const totalDistributed = distributions
    .filter(d => d.status === "approved")
    .reduce((s, d) => s + (d.quantity || 0), 0)
  const closingStock = availableStock - (item.reserved_stock || 0) - totalDistributed

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError("")
    try {
      const payload = {
        name: item.name,
        category: item.category,
        description: item.description || null,
        vendor: item.vendor || null,
        unit_of_measurement: item.unit_of_measurement,
        cost_per_unit: item.cost_per_unit !== "" ? Number(item.cost_per_unit) : null,
        opening_stock: Number(item.opening_stock) || 0,
        total_purchased: Number(item.total_purchased) || 0,
        damaged_quantity: Number(item.damaged_quantity) || 0,
        reserved_stock: Number(item.reserved_stock) || 0,
        budget_allocated: item.budget_allocated !== "" ? Number(item.budget_allocated) : null,
        cost_center: item.cost_center || null,
        updated_at: new Date().toISOString(),
      }
      if (isNew) {
        payload.created_by = userProfile?.id
        payload.created_by_name = userProfile?.name || userProfile?.email
        const { data, error: err } = await supabase
          .from("marketing_items")
          .insert(payload)
          .select()
          .single()
        if (err) throw err
        navigate(`/admin/marketing/${data.id}`, { replace: true })
        setSuccess("Item created!")
      } else {
        const { error: err } = await supabase
          .from("marketing_items")
          .update(payload)
          .eq("id", id)
        if (err) throw err
        setSuccess("Saved!")
        fetchItem()
      }
      setTimeout(() => setSuccess(""), 3000)
    } catch (err) {
      setError(err.message || "Failed to save.")
    }
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!confirm("Delete this marketing item and all its distribution records? This cannot be undone.")) return
    await supabase.from("marketing_items").delete().eq("id", id)
    navigate("/admin/marketing")
  }

  const handleDistSubmit = async (e) => {
    e.preventDefault()
    setSubmittingDist(true)
    try {
      const payload = {
        item_id: id,
        quantity: Number(distForm.quantity),
        distributed_to: distForm.distributed_to,
        date_of_distribution: distForm.date_of_distribution,
        purpose: distForm.purpose || null,
        recipient_details: distForm.recipient_details || null,
        cost_per_batch: distForm.cost_per_batch !== "" ? Number(distForm.cost_per_batch) : null,
        status: "pending",
        approving_officer_email: officerEmail || null,
        created_by: userProfile?.id,
        created_by_name: userProfile?.name || userProfile?.email,
        created_by_email: userProfile?.email,
      }
      const { data: dist, error: err } = await supabase
        .from("marketing_distributions")
        .insert(payload)
        .select()
        .single()
      if (err) throw err

      if (officerEmail) {
        await sendMarketingDistributionNotification({
          officerEmail,
          itemName: item.name,
          requestedBy: userProfile?.name || userProfile?.email,
          quantity: distForm.quantity,
          unit: item.unit_of_measurement,
          distributedTo: distForm.distributed_to,
          purpose: distForm.purpose,
          createdAt: dist.created_at,
        })
        const officerId = await getUserIdByEmail(officerEmail)
        if (officerId) {
          await createNotification(
            officerId,
            "📦 Marketing Distribution Request",
            `${userProfile?.name || userProfile?.email} needs ${distForm.quantity} ${item.unit_of_measurement} of "${item.name}" for ${distForm.distributed_to}.`,
            "marketing_distribution",
            dist.id
          )
        }
      }

      setDistForm(emptyDist)
      setShowDistForm(false)
      fetchDistributions()
      setSuccess("Distribution request submitted!")
      setTimeout(() => setSuccess(""), 3000)
    } catch (err) {
      setError(err.message || "Failed to submit distribution.")
    }
    setSubmittingDist(false)
  }

  const handleApprove = async (dist) => {
    setActioningId(dist.id)
    try {
      await supabase.from("marketing_distributions").update({
        status: "approved",
        actioned_by: userProfile?.name || userProfile?.email,
        actioned_at: new Date().toISOString(),
        admin_response: null,
      }).eq("id", dist.id)

      await sendMarketingDecisionEmail({
        requesterEmail: dist.created_by_email,
        itemName: item.name,
        quantity: dist.quantity,
        unit: item.unit_of_measurement,
        decision: "approved",
        distributedTo: dist.distributed_to,
        actionedBy: userProfile?.name || userProfile?.email,
      })

      if (dist.created_by) {
        await createNotification(
          dist.created_by,
          "✅ Distribution Approved",
          `Your distribution of ${dist.quantity} ${item.unit_of_measurement} of "${item.name}" has been approved.`,
          "marketing_decision",
          dist.id
        )
      }

      fetchDistributions()
      fetchItem()
      setSuccess("Distribution approved!")
      setTimeout(() => setSuccess(""), 3000)
    } catch (err) {
      setError(err.message)
    }
    setActioningId(null)
  }

  const handleReject = async (dist) => {
    if (!rejectReason.trim()) {
      setError("Please provide a reason for rejection.")
      return
    }
    setActioningId(dist.id)
    try {
      await supabase.from("marketing_distributions").update({
        status: "rejected",
        actioned_by: userProfile?.name || userProfile?.email,
        actioned_at: new Date().toISOString(),
        admin_response: rejectReason.trim(),
      }).eq("id", dist.id)

      await sendMarketingDecisionEmail({
        requesterEmail: dist.created_by_email,
        itemName: item.name,
        quantity: dist.quantity,
        unit: item.unit_of_measurement,
        decision: "rejected",
        distributedTo: dist.distributed_to,
        actionedBy: userProfile?.name || userProfile?.email,
        reason: rejectReason.trim(),
      })

      if (dist.created_by) {
        await createNotification(
          dist.created_by,
          "❌ Distribution Rejected",
          `Your distribution of ${dist.quantity} ${item.unit_of_measurement} of "${item.name}" was rejected. Reason: ${rejectReason.trim()}`,
          "marketing_decision",
          dist.id
        )
      }

      setRejectingId(null)
      setRejectReason("")
      fetchDistributions()
      setSuccess("Distribution rejected.")
      setTimeout(() => setSuccess(""), 3000)
    } catch (err) {
      setError(err.message)
    }
    setActioningId(null)
  }

  const handlePrintQR = () => {
    const svgEl = qrRef.current?.querySelector("svg")
    if (!svgEl) return
    const svgData = new XMLSerializer().serializeToString(svgEl)
    const win = window.open("", "_blank")
    win.document.write(`
      <html><head><title>QR — ${item.name}</title>
      <style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;font-family:sans-serif;background:#fff;}
      h2{margin-bottom:8px;font-size:16px;}p{margin:4px 0;font-size:12px;color:#555;}
      @media print{button{display:none}}</style></head>
      <body>
        ${svgData}
        <h2>${item.name}</h2>
        <p>Closing Stock: ${closingStock} ${item.unit_of_measurement}</p>
        <p>${item.category}</p>
        <br/><button onclick="window.print()">Print</button>
      </body></html>
    `)
    win.document.close()
  }

  const isOfficer = officerEmail && userProfile?.email === officerEmail

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-800 rounded w-1/3" />
          <div className="h-4 bg-gray-800 rounded w-1/4" />
          <div className="grid grid-cols-2 gap-4 mt-6">
            {[...Array(6)].map((_, i) => <div key={i} className="h-12 bg-gray-800 rounded-xl" />)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-3 md:p-8 max-w-4xl">
      <AnimatePresence>
        {success && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="mb-4 bg-green-500/10 border border-green-500/40 rounded-xl p-3 flex items-center gap-2">
            <span>✅</span><p className="text-green-400 text-base font-medium">{success}</p>
          </motion.div>
        )}
        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="mb-4 bg-red-500/10 border border-red-500/40 rounded-xl p-3 flex items-center gap-2">
            <span>❌</span><p className="text-red-400 text-base font-medium">{error}</p>
            <button onClick={() => setError("")} className="ml-auto text-gray-500 hover:text-white">✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate("/admin/marketing")}
          className="text-gray-400 hover:text-white transition-colors text-base">← Back</button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-white truncate">
            {isNew ? "Add Marketing Item" : item.name}
          </h1>
          {!isNew && <p className="text-gray-500 text-sm mt-0.5">Added {fmtDate(item.created_at)} · {item.created_by_name}</p>}
        </div>
        {!isNew && (
          <button onClick={handleDelete}
            className="text-red-400/60 hover:text-red-400 text-base border border-red-400/20 hover:border-red-400/40 px-3 py-1.5 rounded-lg transition-all shrink-0">
            Delete
          </button>
        )}
      </div>

      {/* Stock summary */}
      {!isNew && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Available", value: availableStock, color: "text-white" },
            { label: "Distributed", value: totalDistributed, color: "text-blue-400" },
            { label: "Reserved", value: item.reserved_stock || 0, color: "text-yellow-400" },
            { label: "Closing Stock", value: closingStock, color: closingStock <= 5 ? "text-red-400" : "text-green-400" },
          ].map(s => (
            <div key={s.label} className="bg-gray-900/80 rounded-xl border border-gray-800 p-4 text-center">
              <p className="text-gray-500 text-sm mb-1">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-gray-600 text-sm">{item.unit_of_measurement}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      {!isNew && (
        <div className="flex gap-1 mb-5 bg-gray-900/50 border border-gray-800 rounded-xl p-1 w-fit">
          {[
            { key: "details", label: "📋 Details" },
            { key: "distributions", label: `📦 Distributions${distributions.length ? ` (${distributions.length})` : ""}` },
            { key: "costs", label: "💰 Costs" },
            { key: "qr", label: "🔲 QR Code" },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"
              }`}>
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* DETAILS TAB / NEW FORM */}
      {(isNew || activeTab === "details") && (
        <form onSubmit={handleSave} className="space-y-5">
          <div className="bg-gray-900/80 rounded-xl border border-gray-800 p-5">
            <h2 className="text-white font-semibold mb-4">Section A — Item Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-gray-400 text-base mb-1.5 block">Item Name *</label>
                <input required value={item.name} onChange={e => setItem({ ...item, name: e.target.value })}
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 border border-gray-700 focus:border-blue-500 focus:outline-none text-base"
                  placeholder="e.g. Branded Polo T-Shirt" />
              </div>
              <div>
                <label className="text-gray-400 text-base mb-1.5 block">Category *</label>
                <select value={item.category} onChange={e => setItem({ ...item, category: e.target.value })}
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 border border-gray-700 focus:border-blue-500 focus:outline-none text-base">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-gray-400 text-base mb-1.5 block">Vendor</label>
                <input value={item.vendor || ""} onChange={e => setItem({ ...item, vendor: e.target.value })}
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 border border-gray-700 focus:border-blue-500 focus:outline-none text-base"
                  placeholder="e.g. ABC Printing Pte Ltd" />
              </div>
              <div>
                <label className="text-gray-400 text-base mb-1.5 block">Unit of Measurement *</label>
                <select value={item.unit_of_measurement} onChange={e => setItem({ ...item, unit_of_measurement: e.target.value })}
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 border border-gray-700 focus:border-blue-500 focus:outline-none text-base">
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-gray-400 text-base mb-1.5 block">Description</label>
                <textarea value={item.description || ""} onChange={e => setItem({ ...item, description: e.target.value })}
                  rows={2}
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 border border-gray-700 focus:border-blue-500 focus:outline-none text-base resize-none"
                  placeholder="Brief description of the item…" />
              </div>
            </div>
          </div>

          <div className="bg-gray-900/80 rounded-xl border border-gray-800 p-5">
            <h2 className="text-white font-semibold mb-4">Section B — Inventory Tracking</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { field: "opening_stock", label: "Opening Stock" },
                { field: "total_purchased", label: "Total Purchased" },
                { field: "damaged_quantity", label: "Damaged Qty" },
                { field: "reserved_stock", label: "Reserved Stock" },
              ].map(({ field, label }) => (
                <div key={field}>
                  <label className="text-gray-400 text-base mb-1.5 block">{label}</label>
                  <input type="number" min="0" value={item[field]}
                    onChange={e => setItem({ ...item, [field]: e.target.value })}
                    className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 border border-gray-700 focus:border-blue-500 focus:outline-none text-base" />
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="bg-gray-800/60 rounded-lg p-3 text-center">
                <p className="text-gray-500 text-sm mb-1">Available Stock</p>
                <p className="text-white font-bold text-xl">{availableStock}</p>
                <p className="text-gray-600 text-sm">Opening + Purchased − Damaged</p>
              </div>
              <div className="bg-gray-800/60 rounded-lg p-3 text-center">
                <p className="text-gray-500 text-sm mb-1">Closing Stock</p>
                <p className={`font-bold text-xl ${closingStock <= 5 ? "text-red-400" : "text-green-400"}`}>{closingStock}</p>
                <p className="text-gray-600 text-sm">Available − Reserved − Distributed</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-900/80 rounded-xl border border-gray-800 p-5">
            <h2 className="text-white font-semibold mb-4">Section D — Cost Tracking</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-gray-400 text-base mb-1.5 block">Cost per Unit (S$)</label>
                <input type="number" min="0" step="0.01" value={item.cost_per_unit}
                  onChange={e => setItem({ ...item, cost_per_unit: e.target.value })}
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 border border-gray-700 focus:border-blue-500 focus:outline-none text-base"
                  placeholder="0.00" />
              </div>
              <div>
                <label className="text-gray-400 text-base mb-1.5 block">Budget Allocated (S$)</label>
                <input type="number" min="0" step="0.01" value={item.budget_allocated}
                  onChange={e => setItem({ ...item, budget_allocated: e.target.value })}
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 border border-gray-700 focus:border-blue-500 focus:outline-none text-base"
                  placeholder="0.00" />
              </div>
              <div>
                <label className="text-gray-400 text-base mb-1.5 block">Cost Center</label>
                <input value={item.cost_center || ""} onChange={e => setItem({ ...item, cost_center: e.target.value })}
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 border border-gray-700 focus:border-blue-500 focus:outline-none text-base"
                  placeholder="e.g. MKT-2026" />
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button type="submit" disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-base font-medium">
              {saving ? "Saving…" : isNew ? "Create Item" : "Save Changes"}
            </button>
            <button type="button" onClick={() => navigate("/admin/marketing")}
              className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-2.5 rounded-lg text-base">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* DISTRIBUTIONS TAB */}
      {!isNew && activeTab === "distributions" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold">Section C — Distribution Records</h2>
            <button onClick={() => setShowDistForm(!showDistForm)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-base font-medium">
              + Request Distribution
            </button>
          </div>

          <AnimatePresence>
            {showDistForm && (
              <motion.form
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                onSubmit={handleDistSubmit}
                className="bg-gray-900/80 rounded-xl border border-gray-800 p-5 mb-5"
              >
                <h3 className="text-white font-medium mb-4 text-base">New Distribution Request</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-gray-400 text-sm mb-1.5 block">Distributed To *</label>
                    <input required value={distForm.distributed_to}
                      onChange={e => setDistForm({ ...distForm, distributed_to: e.target.value })}
                      className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:border-blue-500 focus:outline-none text-base"
                      placeholder="e.g. Annual Conference 2026" />
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm mb-1.5 block">Quantity * ({item.unit_of_measurement})</label>
                    <input required type="number" min="1" value={distForm.quantity}
                      onChange={e => setDistForm({ ...distForm, quantity: e.target.value })}
                      className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:border-blue-500 focus:outline-none text-base"
                      placeholder="0" />
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm mb-1.5 block">Date *</label>
                    <input required type="date" value={distForm.date_of_distribution}
                      onChange={e => setDistForm({ ...distForm, date_of_distribution: e.target.value })}
                      className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:border-blue-500 focus:outline-none text-base" />
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm mb-1.5 block">Batch Cost (S$)</label>
                    <input type="number" min="0" step="0.01" value={distForm.cost_per_batch}
                      onChange={e => setDistForm({ ...distForm, cost_per_batch: e.target.value })}
                      className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:border-blue-500 focus:outline-none text-base"
                      placeholder="0.00" />
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm mb-1.5 block">Purpose</label>
                    <input value={distForm.purpose}
                      onChange={e => setDistForm({ ...distForm, purpose: e.target.value })}
                      className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:border-blue-500 focus:outline-none text-base"
                      placeholder="e.g. Client gifts" />
                  </div>
                  <div>
                    <label className="text-gray-400 text-sm mb-1.5 block">Recipient Details</label>
                    <input value={distForm.recipient_details}
                      onChange={e => setDistForm({ ...distForm, recipient_details: e.target.value })}
                      className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:border-blue-500 focus:outline-none text-base"
                      placeholder="e.g. VIP attendees, 50 pax" />
                  </div>
                </div>
                <div className="flex gap-3 mt-4">
                  <button type="submit" disabled={submittingDist}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-base font-medium">
                    {submittingDist ? "Submitting…" : "Submit for Approval"}
                  </button>
                  <button type="button" onClick={() => setShowDistForm(false)}
                    className="bg-gray-800 hover:bg-gray-700 text-white px-5 py-2 rounded-lg text-base">
                    Cancel
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>

          {distributions.length === 0 ? (
            <p className="text-gray-500 text-base text-center py-12">No distributions recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {distributions.map(dist => (
                <div key={dist.id} className="bg-gray-900/80 rounded-xl border border-gray-800 p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="text-white font-medium text-base">{dist.distributed_to}</p>
                      <p className="text-gray-500 text-sm mt-0.5">
                        {dist.quantity} {item.unit_of_measurement} · {fmtDate(dist.date_of_distribution)}
                        {dist.purpose && ` · ${dist.purpose}`}
                      </p>
                      {dist.recipient_details && (
                        <p className="text-gray-600 text-sm mt-0.5">{dist.recipient_details}</p>
                      )}
                    </div>
                    <span className={`text-sm px-2 py-0.5 rounded-full border font-medium shrink-0 capitalize ${STATUS_COLORS[dist.status] || STATUS_COLORS.pending}`}>
                      {dist.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <span>By {dist.created_by_name} · {fmtDate(dist.created_at)}</span>
                    {dist.cost_per_batch != null && (
                      <span>S${Number(dist.cost_per_batch).toFixed(2)}</span>
                    )}
                  </div>

                  {dist.admin_response && (
                    <p className="mt-2 text-sm text-red-400/80 bg-red-500/5 border border-red-500/10 rounded-lg px-3 py-2">
                      Reason: {dist.admin_response}
                    </p>
                  )}

                  {isOfficer && dist.status === "pending" && (
                    <div className="mt-3 pt-3 border-t border-gray-800">
                      {rejectingId === dist.id ? (
                        <div className="flex gap-2">
                          <input
                            value={rejectReason}
                            onChange={e => setRejectReason(e.target.value)}
                            placeholder="Reason for rejection…"
                            className="flex-1 bg-gray-800 text-white rounded-lg px-3 py-1.5 border border-gray-700 focus:border-red-500 focus:outline-none text-sm"
                          />
                          <button
                            onClick={() => handleReject(dist)}
                            disabled={actioningId === dist.id}
                            className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-sm font-medium"
                          >
                            {actioningId === dist.id ? "…" : "Confirm"}
                          </button>
                          <button
                            onClick={() => { setRejectingId(null); setRejectReason("") }}
                            className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApprove(dist)}
                            disabled={actioningId === dist.id}
                            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-sm font-medium"
                          >
                            {actioningId === dist.id ? "…" : "✓ Approve"}
                          </button>
                          <button
                            onClick={() => setRejectingId(dist.id)}
                            className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 px-4 py-1.5 rounded-lg text-sm font-medium"
                          >
                            ✕ Reject
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* COSTS TAB */}
      {!isNew && activeTab === "costs" && (
        <div className="bg-gray-900/80 rounded-xl border border-gray-800 p-5">
          <h2 className="text-white font-semibold mb-5">Section D — Cost Summary</h2>
          <div className="space-y-3">
            {[
              { label: "Cost per Unit", value: item.cost_per_unit != null ? `S$${Number(item.cost_per_unit).toFixed(2)}` : "—" },
              { label: "Total Inventory Cost", value: item.cost_per_unit != null ? `S$${(Number(item.cost_per_unit) * availableStock).toFixed(2)}` : "—" },
              { label: "Total Distribution Cost", value: `S$${distributions.filter(d => d.status === "approved" && d.cost_per_batch != null).reduce((s, d) => s + Number(d.cost_per_batch), 0).toFixed(2)}` },
              { label: "Budget Allocated", value: item.budget_allocated != null ? `S$${Number(item.budget_allocated).toFixed(2)}` : "—" },
              { label: "Cost Center", value: item.cost_center || "—" },
            ].map(row => (
              <div key={row.label} className="flex justify-between py-2.5 border-b border-gray-800/70">
                <span className="text-gray-400 text-base">{row.label}</span>
                <span className="text-white text-base font-medium">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* QR CODE TAB */}
      {!isNew && activeTab === "qr" && (
        <div className="flex flex-col items-center gap-6">
          <div className="bg-white rounded-2xl p-6 shadow-2xl" ref={qrRef}>
            <QRCodeSVG
              value={`${window.location.origin}/admin/marketing/${id}`}
              size={200}
              level="M"
              includeMargin={false}
            />
          </div>
          <div className="text-center">
            <p className="text-white font-semibold text-lg">{item.name}</p>
            <p className="text-gray-400 text-base mt-1">Closing Stock: {closingStock} {item.unit_of_measurement}</p>
            <p className="text-gray-500 text-sm mt-0.5">{item.category}</p>
          </div>
          <button onClick={handlePrintQR}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl text-base font-medium">
            🖨️ Print QR Code
          </button>
        </div>
      )}
    </div>
  )
}
