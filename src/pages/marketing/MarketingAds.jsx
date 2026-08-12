import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../../lib/supabase"
import { useAuth } from "../../context/AuthContext"
import { motion, AnimatePresence } from "framer-motion"

const C = {
  accent: "#06b6d4", teal: "#14b8a6",
  card: "rgba(6,182,212,0.06)", border: "rgba(6,182,212,0.18)",
  text: "#ffffff", sub: "#94a3b8",
  success: "#10b981", warning: "#f59e0b", error: "#ef4444",
}

const PLATFORMS = ["Google", "Facebook", "Instagram", "LinkedIn"]
const STATUS_OPTS = ["Active", "Paused", "Completed"]

const platformIcon = {
  Google: "🔍", Facebook: "📘", Instagram: "📸", LinkedIn: "💼",
}

const inputStyle = {
  width: "100%", background: "rgba(6,182,212,0.06)", color: "#fff",
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

function StatusBadge({ status }) {
  const cfg = {
    Active: { bg: "rgba(16,185,129,0.15)", color: C.success, border: "1px solid rgba(16,185,129,0.3)" },
    Paused: { bg: "rgba(245,158,11,0.15)", color: C.warning, border: "1px solid rgba(245,158,11,0.3)" },
    Completed: { bg: "rgba(148,163,184,0.12)", color: "#94a3b8", border: "1px solid rgba(148,163,184,0.2)" },
  }[status] || {}
  return <span style={{ ...cfg, borderRadius: "8px", padding: "2px 8px", fontSize: "13px", fontWeight: "600" }}>{status}</span>
}

function StatCard({ icon, label, value, color }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
        <span style={{ fontSize: "16px" }}>{icon}</span>
        <span style={{ color: C.sub, fontSize: "14px", fontWeight: "600" }}>{label}</span>
      </div>
      <p style={{ color: color || C.text, fontSize: "22px", fontWeight: "800" }}>{value}</p>
    </div>
  )
}

const emptyForm = {
  platform: "Google", campaign_name: "", budget: "", spend: "",
  start_date: "", end_date: "", status: "Active", leads_generated: "", notes: "",
}

export default function MarketingAds() {
  const { userProfile, canManageMarketing } = useAuth()
  const navigate = useNavigate()

  const [ads, setAds] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingAd, setEditingAd] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)
  const [form, setForm] = useState(emptyForm)

  const showSuccess = (msg) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 7000)
  }

  useEffect(() => {
    if (!canManageMarketing) navigate("/marketing/dashboard", { replace: true })
  }, [canManageMarketing])

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const { data } = await supabase.from("marketing_ads").select("*").order("created_at", { ascending: false })
    setAds(data || [])
    setLoading(false)
  }

  const openAddModal = () => {
    setEditingAd(null)
    setForm(emptyForm)
    setSaveError(null)
    setShowModal(true)
  }

  const openEditModal = (ad) => {
    setEditingAd(ad)
    setForm({
      platform: ad.platform || "Google",
      campaign_name: ad.campaign_name || "",
      budget: ad.budget ?? "",
      spend: ad.spend ?? "",
      start_date: ad.start_date || "",
      end_date: ad.end_date || "",
      status: ad.status || "Active",
      leads_generated: ad.leads_generated ?? "",
      notes: ad.notes || "",
    })
    setSaveError(null)
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.campaign_name.trim()) return
    setSaving(true)
    setSaveError(null)

    const payload = {
      platform: form.platform,
      campaign_name: form.campaign_name.trim(),
      budget: parseFloat(form.budget) || 0,
      spend: parseFloat(form.spend) || 0,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      status: form.status,
      leads_generated: parseInt(form.leads_generated) || 0,
      notes: form.notes || null,
    }

    let error
    if (editingAd) {
      ({ error } = await supabase.from("marketing_ads").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editingAd.id))
    } else {
      ({ error } = await supabase.from("marketing_ads").insert({
        ...payload,
        created_by: userProfile?.id,
        created_by_name: userProfile?.name || userProfile?.email,
      }))
    }

    if (error) {
      setSaving(false)
      setSaveError(`Could not save campaign: ${error.message}`)
      return
    }

    setSaving(false)
    setShowModal(false)
    const wasNewCampaign = !editingAd
    setEditingAd(null)
    setForm(emptyForm)
    showSuccess(wasNewCampaign ? "✅ Campaign added successfully!" : "✅ Campaign updated successfully!")
    if (wasNewCampaign && userProfile?.id) {
      await supabase.from("marketing_notifications").insert({
        user_id: userProfile.id,
        title: "Campaign Added 📢",
        message: `${payload.campaign_name} on ${payload.platform} added`,
        type: "campaign_added",
        is_read: false,
      })
    }
    fetchAll()
  }

  const handleDelete = async (ad) => {
    if (!window.confirm(`Delete campaign "${ad.campaign_name}"?`)) return
    await supabase.from("marketing_ads").delete().eq("id", ad.id)
    showSuccess("🗑️ Campaign deleted.")
    fetchAll()
  }

  const totals = ads.reduce((acc, ad) => ({
    budget: acc.budget + (parseFloat(ad.budget) || 0),
    spend: acc.spend + (parseFloat(ad.spend) || 0),
    leads: acc.leads + (parseInt(ad.leads_generated) || 0),
  }), { budget: 0, spend: 0, leads: 0 })

  const fmtMoney = (n) => `S$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  if (!canManageMarketing) return null

  return (
    <div style={{ padding: "24px" }}>
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
          <h1 style={{ color: C.text, fontSize: "24px", fontWeight: "800", marginBottom: "4px" }}>📢 Paid Ads</h1>
          <p style={{ color: C.sub, fontSize: "15px" }}>{ads.length} campaign{ads.length !== 1 ? "s" : ""} tracked</p>
        </div>
        <button onClick={openAddModal} style={{ background: `linear-gradient(135deg, ${C.accent}, ${C.teal})`, color: "#fff", border: "none", borderRadius: "10px", padding: "10px 18px", fontWeight: "600", fontSize: "15px", cursor: "pointer" }}>
          + Add Campaign
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px", marginBottom: "28px" }}>
        <StatCard icon="💰" label="Total Budget" value={fmtMoney(totals.budget)} />
        <StatCard icon="💸" label="Total Spend" value={fmtMoney(totals.spend)} color={totals.spend > totals.budget ? C.error : C.text} />
        <StatCard icon="🎯" label="Total Leads" value={totals.leads} color={C.teal} />
      </div>

      {loading ? (
        <p style={{ color: C.sub }}>Loading...</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {ads.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px", color: C.sub }}>
              <p style={{ fontSize: "40px", marginBottom: "12px" }}>📢</p>
              <p>No ad campaigns yet. Add one to start tracking spend and leads.</p>
            </div>
          )}
          {ads.map(ad => {
            const remaining = (parseFloat(ad.budget) || 0) - (parseFloat(ad.spend) || 0)
            return (
              <motion.div
                key={ad.id}
                whileHover={{ scale: 1.005 }}
                style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "18px" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "10px", marginBottom: "10px" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      <p style={{ color: C.text, fontWeight: "700", fontSize: "17px" }}>{ad.campaign_name}</p>
                      <StatusBadge status={ad.status} />
                    </div>
                    <span style={{ background: "rgba(6,182,212,0.1)", color: C.accent, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "2px 8px", fontSize: "13px", fontWeight: "600" }}>
                      {platformIcon[ad.platform] || "📢"} {ad.platform}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button onClick={() => openEditModal(ad)} style={{ background: "rgba(6,182,212,0.12)", color: C.accent, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "5px 10px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}>✏️ Edit</button>
                    <button onClick={() => handleDelete(ad)} style={{ background: "rgba(239,68,68,0.12)", color: C.error, border: "1px solid rgba(239,68,68,0.25)", borderRadius: "8px", padding: "5px 10px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}>🗑️ Delete</button>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "10px", marginBottom: "10px" }}>
                  <Info label="Budget" value={fmtMoney(parseFloat(ad.budget) || 0)} />
                  <Info label="Spend" value={fmtMoney(parseFloat(ad.spend) || 0)} color={remaining < 0 ? C.error : C.text} />
                  <Info label="Remaining" value={fmtMoney(remaining)} color={remaining < 0 ? C.error : C.success} />
                  <Info label="Leads" value={ad.leads_generated || 0} color={C.teal} />
                </div>

                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                  {ad.start_date && <span style={{ color: C.sub, fontSize: "13px" }}>📅 {ad.start_date}{ad.end_date ? ` → ${ad.end_date}` : ""}</span>}
                </div>

                {ad.notes && <p style={{ color: C.sub, fontSize: "14px", marginTop: "8px", fontStyle: "italic" }}>{ad.notes}</p>}
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
            onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              style={{ background: "#0f2730", border: `1px solid ${C.border}`, borderRadius: "20px", padding: "28px", width: "100%", maxWidth: "560px", maxHeight: "85vh", overflowY: "auto" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <h2 style={{ color: C.text, fontSize: "18px", fontWeight: "700" }}>{editingAd ? "Edit Campaign" : "Add New Campaign"}</h2>
                <button onClick={() => setShowModal(false)} style={{ color: C.sub, background: "none", border: "none", cursor: "pointer", fontSize: "20px" }}>✕</button>
              </div>

              {saveError && (
                <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "10px", padding: "12px 14px", marginBottom: "16px", color: C.error, fontSize: "15px" }}>
                  ⚠️ {saveError}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <Field label="Platform">
                    <select value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value })} style={inputStyle}>
                      {PLATFORMS.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </Field>
                  <Field label="Status">
                    <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={inputStyle}>
                      {STATUS_OPTS.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </Field>
                </div>

                <Field label="Campaign Name *">
                  <input value={form.campaign_name} onChange={e => setForm({ ...form, campaign_name: e.target.value })} placeholder="e.g. Q3 Cloud Practitioner Promo" style={inputStyle} />
                </Field>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <Field label="Budget (SGD)">
                    <input type="number" min={0} step="0.01" value={form.budget} onChange={e => setForm({ ...form, budget: e.target.value })} placeholder="0.00" style={inputStyle} />
                  </Field>
                  <Field label="Spend (SGD)">
                    <input type="number" min={0} step="0.01" value={form.spend} onChange={e => setForm({ ...form, spend: e.target.value })} placeholder="0.00" style={inputStyle} />
                  </Field>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <Field label="Start Date">
                    <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} style={inputStyle} />
                  </Field>
                  <Field label="End Date">
                    <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} style={inputStyle} />
                  </Field>
                </div>

                <Field label="Leads Generated">
                  <input type="number" min={0} value={form.leads_generated} onChange={e => setForm({ ...form, leads_generated: e.target.value })} placeholder="0" style={inputStyle} />
                </Field>

                <Field label="Notes">
                  <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} placeholder="Any additional notes..." style={{ ...inputStyle, resize: "vertical" }} />
                </Field>

                <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                  <button onClick={() => setShowModal(false)}
                    style={{ flex: 1, background: "rgba(148,163,184,0.1)", color: C.sub, border: `1px solid rgba(148,163,184,0.2)`, borderRadius: "10px", padding: "11px", fontSize: "15px", fontWeight: "600", cursor: "pointer" }}>
                    Cancel
                  </button>
                  <button onClick={handleSave} disabled={saving || !form.campaign_name.trim()}
                    style={{ flex: 2, background: saving ? "rgba(6,182,212,0.3)" : `linear-gradient(135deg, ${C.accent}, ${C.teal})`, color: "#fff", border: "none", borderRadius: "10px", padding: "11px", fontSize: "15px", fontWeight: "600", cursor: saving ? "not-allowed" : "pointer" }}>
                    {saving ? "Saving..." : editingAd ? "Save Changes" : "Add Campaign"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Info({ label, value, color }) {
  return (
    <div>
      <p style={{ color: C.sub, fontSize: "10.5px", textTransform: "uppercase", letterSpacing: "0.3px" }}>{label}</p>
      <p style={{ color: color || C.text, fontSize: "15px", fontWeight: "700" }}>{value}</p>
    </div>
  )
}
