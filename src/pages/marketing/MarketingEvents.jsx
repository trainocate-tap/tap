import { useState, useEffect, useRef } from "react"
import { supabase } from "../../lib/supabase"
import { useAuth } from "../../context/AuthContext"
import { motion, AnimatePresence } from "framer-motion"

const C = {
  accent: "#06b6d4", teal: "#14b8a6",
  card: "rgba(6,182,212,0.06)", border: "rgba(6,182,212,0.18)",
  text: "#ffffff", sub: "#94a3b8",
  success: "#10b981", warning: "#f59e0b", error: "#ef4444",
}

const PARTNER_CATS = ["Government", "Non Profit", "Distributor", "Reseller", "IHLs", "Trade Association", "Vendor", "Combination"]
const MODALITIES = ["In Person On Site", "In Person Trainocate", "Webinar"]
const SUB_CATS = ["Workshop", "Conference", "Training", "Others"]
const STATUS_OPTS = ["upcoming", "ongoing", "completed", "cancelled"]

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
    upcoming: { bg: "rgba(6,182,212,0.15)", color: C.accent, border: `1px solid rgba(6,182,212,0.3)` },
    ongoing: { bg: "rgba(16,185,129,0.15)", color: C.success, border: "1px solid rgba(16,185,129,0.3)" },
    completed: { bg: "rgba(148,163,184,0.12)", color: "#94a3b8", border: "1px solid rgba(148,163,184,0.2)" },
    cancelled: { bg: "rgba(239,68,68,0.12)", color: C.error, border: "1px solid rgba(239,68,68,0.25)" },
  }[status] || {}
  return (
    <span style={{ ...cfg, borderRadius: "8px", padding: "2px 8px", fontSize: "13px", fontWeight: "600", textTransform: "capitalize" }}>
      {status}
    </span>
  )
}

const emptyForm = {
  event_name: "", event_date: "", end_date: "", description: "", partner_category: "",
  partners: "", project_lead: "", account_manager: "", event_modality: "", target_group: "",
  sub_category: "", external_funding: false, trainer: "", budget: "", status: "upcoming", notes: "",
}

export default function MarketingEvents() {
  const { userProfile, canManageMarketing, role, marketingRole } = useAuth()
  const showBudget = ["marketing_admin", "marketing_manager"].includes(marketingRole) || role === "admin"
  const [events, setEvents] = useState([])
  const [items, setItems] = useState([])
  const [variants, setVariants] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showCollateralModal, setShowCollateralModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)
  const [collaterals, setCollaterals] = useState([{ item_id: "", variant_id: "", quantity_needed: 1 }])
  const [signModal, setSignModal] = useState(null)
  const [hasSignature, setHasSignature] = useState(false)
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)

  const [form, setForm] = useState(emptyForm)

  const showSuccess = (msg) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 7000)
  }

  const notify = async (title, message, type) => {
    if (!userProfile?.id) return
    await supabase.from("marketing_notifications").insert({ user_id: userProfile.id, title, message, type, is_read: false })
  }

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const [{ data: e }, { data: i }, { data: v }] = await Promise.all([
      supabase.from("marketing_events").select("*, marketing_event_collaterals(*)").order("event_date", { ascending: false }),
      supabase.from("marketing_items").select("id, name").order("name"),
      supabase.from("marketing_item_variants").select("*"),
    ])
    setEvents(e || [])
    setItems(i || [])
    setVariants(v || [])
    setLoading(false)
  }

  const handleSaveEvent = async () => {
    if (!form.event_name || !form.event_date) return
    setSaving(true)
    setSaveError(null)
    const { data: ev, error } = await supabase
      .from("marketing_events")
      .insert({
        ...form,
        budget: parseFloat(form.budget) || null,
        external_funding: form.external_funding,
      })
      .select()
      .single()
    if (error) {
      setSaving(false)
      setSaveError(`Could not save event: ${error.message}`)
      return
    }
    setSaving(false)
    setShowAddModal(false)
    setSaveError(null)
    setForm(emptyForm)
    showSuccess(`✅ "${ev.event_name}" added successfully!`)
    notify("Event Added ✅", `${ev.event_name} has been added successfully`, "event_added")
    fetchAll()
  }

  const handleAssignCollateral = async () => {
    if (!showCollateralModal) return
    setSaving(true)
    setSaveError(null)
    const valid = collaterals.filter(c => c.item_id && c.quantity_needed > 0)
    if (valid.length) {
      const { error } = await supabase.from("marketing_event_collaterals").insert(
        valid.map(c => ({ event_id: showCollateralModal.id, item_id: c.item_id, variant_id: c.variant_id || null, quantity_needed: parseInt(c.quantity_needed) }))
      )
      if (error) {
        setSaving(false)
        setSaveError(`Could not assign collaterals: ${error.message}`)
        return
      }
    }
    setSaving(false)
    setShowCollateralModal(null)
    setSaveError(null)
    setCollaterals([{ item_id: "", variant_id: "", quantity_needed: 1 }])
    showSuccess("✅ Collaterals assigned successfully!")
    fetchAll()
  }

  useEffect(() => {
    if (!signModal || !canvasRef.current) return
    const ctx = canvasRef.current.getContext("2d")
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    setHasSignature(false)
  }, [signModal])

  const getCanvasPos = (e) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const point = e.touches ? e.touches[0] : e
    return {
      x: (point.clientX - rect.left) * (canvas.width / rect.width),
      y: (point.clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  const startDraw = (e) => {
    e.preventDefault()
    drawingRef.current = true
    const { x, y } = getCanvasPos(e)
    const ctx = canvasRef.current.getContext("2d")
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const draw = (e) => {
    if (!drawingRef.current) return
    e.preventDefault()
    const { x, y } = getCanvasPos(e)
    const ctx = canvasRef.current.getContext("2d")
    ctx.lineTo(x, y)
    ctx.strokeStyle = "#0f2730"
    ctx.lineWidth = 2.5
    ctx.lineCap = "round"
    ctx.stroke()
    setHasSignature(true)
  }

  const stopDraw = () => { drawingRef.current = false }

  const clearSignature = () => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
  }

  const handleConfirmSignature = async () => {
    if (!signModal || !hasSignature) return
    setSaving(true)
    const signature = canvasRef.current.toDataURL("image/png")
    const payload = signModal.mode === "out"
      ? { signed_out_by: userProfile.id, signed_out_name: userProfile?.name || userProfile?.email, signed_out_at: new Date().toISOString(), signature }
      : { signed_in_by: userProfile.id, signed_in_name: userProfile?.name || userProfile?.email, signed_in_at: new Date().toISOString(), signature }
    await supabase.from("marketing_event_collaterals").update(payload).eq("id", signModal.collateral.id)
    setSaving(false)
    setSignModal(null)
    showSuccess(signModal.mode === "out" ? "✅ Signed out with signature!" : "✅ Signed in with signature!")
    fetchAll()
  }

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
          <h1 style={{ color: C.text, fontSize: "24px", fontWeight: "800", marginBottom: "4px" }}>🎪 Events</h1>
          <p style={{ color: C.sub, fontSize: "15px" }}>{events.length} events total</p>
        </div>
        {canManageMarketing && (
          <button onClick={() => { setShowAddModal(true); setSaveError(null) }} style={{ background: `linear-gradient(135deg, ${C.accent}, ${C.teal})`, color: "#fff", border: "none", borderRadius: "10px", padding: "10px 18px", fontWeight: "600", fontSize: "15px", cursor: "pointer" }}>
            + Add Event
          </button>
        )}
      </div>

      {loading ? <p style={{ color: C.sub }}>Loading...</p> : (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {events.length === 0 && <p style={{ color: C.sub, textAlign: "center", padding: "40px" }}>No events yet. Add an event to get started.</p>}
          {events.map(ev => (
            <motion.div
              key={ev.id}
              whileHover={{ scale: 1.005 }}
              style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "20px" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "10px", marginBottom: "12px" }}>
                <div style={{ flex: 1 }}>
                  <p style={{ color: C.text, fontWeight: "700", fontSize: "16px", marginBottom: "6px" }}>{ev.event_name}</p>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    <StatusBadge status={ev.status} />
                    {ev.partner_category && <span style={{ background: "rgba(167,139,250,0.15)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.3)", borderRadius: "8px", padding: "2px 8px", fontSize: "13px" }}>{ev.partner_category}</span>}
                    {ev.event_modality && <span style={{ background: "rgba(6,182,212,0.1)", color: C.accent, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "2px 8px", fontSize: "13px" }}>{ev.event_modality}</span>}
                    {ev.target_group && <span style={{ background: "rgba(16,185,129,0.1)", color: C.success, border: "1px solid rgba(16,185,129,0.2)", borderRadius: "8px", padding: "2px 8px", fontSize: "13px" }}>{ev.target_group}</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "6px" }}>
                  {canManageMarketing && (
                    <button onClick={() => { setShowCollateralModal(ev); setCollaterals([{ item_id: "", variant_id: "", quantity_needed: 1 }]); setSaveError(null) }}
                      style={{ background: "rgba(6,182,212,0.12)", color: C.accent, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "5px 10px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}>
                      📦 Collaterals
                    </button>
                  )}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "6px", marginBottom: "10px" }}>
                <Info icon="📅" label={ev.event_date} />
                {ev.end_date && <Info icon="🏁" label={`Ends: ${ev.end_date}`} />}
                {ev.project_lead && <Info icon="👤" label={ev.project_lead} />}
                {ev.account_manager && <Info icon="💼" label={ev.account_manager} />}
                {ev.partners && <Info icon="🤝" label={ev.partners} />}
                {ev.registrations > 0 && <Info icon="📝" label={`${ev.registrations} registrations`} />}
                {ev.attendees > 0 && <Info icon="👥" label={`${ev.attendees} attended`} />}
              </div>

              {showBudget && (ev.budget || ev.actual_cost) && (
                <div style={{ display: "flex", gap: "12px", background: "rgba(6,182,212,0.04)", borderRadius: "8px", padding: "8px 12px", marginBottom: "10px" }}>
                  {ev.budget && <span style={{ color: C.sub, fontSize: "14px" }}>Budget: <b style={{ color: C.text }}>${ev.budget}</b></span>}
                  {ev.actual_cost && <span style={{ color: C.sub, fontSize: "14px" }}>Actual: <b style={{ color: ev.actual_cost > ev.budget ? C.error : C.success }}>${ev.actual_cost}</b></span>}
                </div>
              )}

              {ev.marketing_event_collaterals?.length > 0 && (
                <div>
                  <p style={{ color: C.sub, fontSize: "13px", marginBottom: "6px" }}>Collaterals:</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    {ev.marketing_event_collaterals.map(col => {
                      const colItemName = items.find(it => it.id === col.item_id)?.name || "?"
                      const colVariantName = variants.find(v => v.id === col.variant_id)?.variant_name
                      return (
                      <div key={col.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(6,182,212,0.04)", borderRadius: "8px", padding: "6px 10px" }}>
                        <span style={{ color: C.text, fontSize: "14px" }}>
                          {colItemName} × {col.quantity_needed}
                          {colVariantName && ` (${colVariantName})`}
                        </span>
                        <div style={{ display: "flex", gap: "4px" }}>
                          {!col.signed_out_at && <button onClick={() => setSignModal({ collateral: col, itemName: colItemName, mode: "out" })} style={{ background: "rgba(245,158,11,0.15)", color: C.warning, border: "none", borderRadius: "6px", padding: "3px 8px", fontSize: "12px", cursor: "pointer" }}>Sign Out</button>}
                          {col.signed_out_at && !col.signed_in_at && <button onClick={() => setSignModal({ collateral: col, itemName: colItemName, mode: "in" })} style={{ background: "rgba(16,185,129,0.15)", color: C.success, border: "none", borderRadius: "6px", padding: "3px 8px", fontSize: "12px", cursor: "pointer" }}>Sign In</button>}
                          {col.signed_in_at && <span style={{ color: C.success, fontSize: "12px" }}>✅ Returned</span>}
                          {col.signed_out_at && !col.signed_in_at && <span style={{ color: C.warning, fontSize: "12px" }}>📤 Out</span>}
                        </div>
                      </div>
                    )})}
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {/* Add Event Modal */}
      <AnimatePresence>
        {showAddModal && (
          <Modal title="Add New Event" onClose={() => { setShowAddModal(false); setSaveError(null) }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {saveError && (
                <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", padding: "10px 14px", color: C.error, fontSize: "15px" }}>
                  {saveError}
                </div>
              )}
              <Field label="Event Name *"><input value={form.event_name} onChange={e => setForm({ ...form, event_name: e.target.value })} style={inputStyle} /></Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <Field label="Event Date *"><input type="date" value={form.event_date} onChange={e => setForm({ ...form, event_date: e.target.value })} style={inputStyle} /></Field>
                <Field label="End Date"><input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} style={inputStyle} /></Field>
              </div>
              <Field label="Description"><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} style={{ ...inputStyle, resize: "vertical" }} /></Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <Field label="Partner Category">
                  <select value={form.partner_category} onChange={e => setForm({ ...form, partner_category: e.target.value })} style={inputStyle}>
                    <option value="">Select</option>
                    {PARTNER_CATS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Partners"><input value={form.partners} onChange={e => setForm({ ...form, partners: e.target.value })} style={inputStyle} /></Field>
                <Field label="Project Lead"><input value={form.project_lead} onChange={e => setForm({ ...form, project_lead: e.target.value })} style={inputStyle} /></Field>
                <Field label="Account Manager / BDM"><input value={form.account_manager} onChange={e => setForm({ ...form, account_manager: e.target.value })} style={inputStyle} /></Field>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <Field label="Event Modality">
                  <select value={form.event_modality} onChange={e => setForm({ ...form, event_modality: e.target.value })} style={inputStyle}>
                    <option value="">Select</option>
                    {MODALITIES.map(m => <option key={m}>{m}</option>)}
                  </select>
                </Field>
                <Field label="Target Group">
                  <select value={form.target_group} onChange={e => setForm({ ...form, target_group: e.target.value })} style={inputStyle}>
                    <option value="">Select</option>
                    <option>B2B</option><option>B2C</option><option>Both</option>
                  </select>
                </Field>
                <Field label="Sub Category">
                  <select value={form.sub_category} onChange={e => setForm({ ...form, sub_category: e.target.value })} style={inputStyle}>
                    <option value="">Select</option>
                    {SUB_CATS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Status">
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={inputStyle}>
                    {STATUS_OPTS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Trainer"><input value={form.trainer} onChange={e => setForm({ ...form, trainer: e.target.value })} style={inputStyle} /></Field>
              {showBudget && <Field label="Budget ($)"><input type="number" value={form.budget} onChange={e => setForm({ ...form, budget: e.target.value })} step="0.01" style={inputStyle} /></Field>}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input type="checkbox" id="ext_fund" checked={form.external_funding} onChange={e => setForm({ ...form, external_funding: e.target.checked })} />
                <label htmlFor="ext_fund" style={{ color: C.sub, fontSize: "15px", cursor: "pointer" }}>External funding</label>
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <button onClick={() => { setShowAddModal(false); setSaveError(null); setForm(emptyForm) }} style={{ flex: 1, background: "rgba(148,163,184,0.1)", color: C.sub, border: "none", borderRadius: "10px", padding: "10px", fontWeight: "600", cursor: "pointer" }}>Cancel</button>
                <button onClick={handleSaveEvent} disabled={saving || !form.event_name || !form.event_date} style={{ flex: 2, background: `linear-gradient(135deg, ${C.accent}, ${C.teal})`, color: "#fff", border: "none", borderRadius: "10px", padding: "10px", fontWeight: "600", cursor: "pointer", opacity: saving ? 0.6 : 1 }}>{saving ? "Saving..." : "Save Event"}</button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Collateral Modal */}
      <AnimatePresence>
        {showCollateralModal && (
          <Modal title={`Collaterals — ${showCollateralModal.event_name}`} onClose={() => { setShowCollateralModal(null); setSaveError(null) }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {saveError && (
                <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", padding: "10px 14px", color: C.error, fontSize: "15px" }}>
                  {saveError}
                </div>
              )}
              {collaterals.map((c, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 70px 30px", gap: "6px", alignItems: "end" }}>
                  <Field label={i === 0 ? "Item" : ""}>
                    <select value={c.item_id} onChange={e => { const arr = [...collaterals]; arr[i].item_id = e.target.value; setCollaterals(arr) }} style={inputStyle}>
                      <option value="">Select item</option>
                      {items.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
                    </select>
                  </Field>
                  <Field label={i === 0 ? "Variant" : ""}>
                    <select value={c.variant_id} onChange={e => { const arr = [...collaterals]; arr[i].variant_id = e.target.value; setCollaterals(arr) }} style={inputStyle}>
                      <option value="">Any</option>
                      {variants.filter(v => v.item_id === c.item_id).map(v => <option key={v.id} value={v.id}>{v.variant_name}</option>)}
                    </select>
                  </Field>
                  <Field label={i === 0 ? "Qty Needed" : ""}>
                    <input type="number" min={1} value={c.quantity_needed} onChange={e => { const arr = [...collaterals]; arr[i].quantity_needed = e.target.value; setCollaterals(arr) }} style={inputStyle} />
                  </Field>
                  {collaterals.length > 1 && <button onClick={() => setCollaterals(prev => prev.filter((_, idx) => idx !== i))} style={{ color: C.error, background: "none", border: "none", cursor: "pointer", fontSize: "18px" }}>✕</button>}
                </div>
              ))}
              <button onClick={() => setCollaterals(prev => [...prev, { item_id: "", variant_id: "", quantity_needed: 1 }])}
                style={{ background: "rgba(6,182,212,0.08)", color: C.accent, border: `1px dashed ${C.border}`, borderRadius: "8px", padding: "8px", fontSize: "14px", cursor: "pointer" }}>
                + Add Item
              </button>
              <div style={{ display: "flex", gap: "10px" }}>
                <button onClick={() => { setShowCollateralModal(null); setSaveError(null) }} style={{ flex: 1, background: "rgba(148,163,184,0.1)", color: C.sub, border: "none", borderRadius: "10px", padding: "10px", cursor: "pointer" }}>Cancel</button>
                <button onClick={handleAssignCollateral} disabled={saving} style={{ flex: 2, background: `linear-gradient(135deg, ${C.accent}, ${C.teal})`, color: "#fff", border: "none", borderRadius: "10px", padding: "10px", fontWeight: "600", cursor: "pointer" }}>{saving ? "Saving..." : "Assign Collaterals"}</button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Signature Modal */}
      <AnimatePresence>
        {signModal && (
          <Modal title={`${signModal.mode === "out" ? "✍️ Sign Out" : "✍️ Sign In"} Collateral`} onClose={() => setSignModal(null)}>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ background: "rgba(6,182,212,0.06)", border: `1px solid ${C.border}`, borderRadius: "10px", padding: "10px 14px" }}>
                <p style={{ color: C.text, fontSize: "15px", fontWeight: "600" }}>{signModal.itemName}</p>
                <p style={{ color: C.sub, fontSize: "14px" }}>Quantity: {signModal.collateral.quantity_needed}</p>
              </div>
              <div>
                <p style={{ color: C.sub, fontSize: "14px", marginBottom: "6px" }}>Sign below:</p>
                <canvas
                  ref={canvasRef}
                  width={480}
                  height={180}
                  style={{ width: "100%", height: "180px", background: "#fff", borderRadius: "10px", border: `1px solid ${C.border}`, touchAction: "none", cursor: "crosshair" }}
                  onMouseDown={startDraw}
                  onMouseMove={draw}
                  onMouseUp={stopDraw}
                  onMouseLeave={stopDraw}
                  onTouchStart={startDraw}
                  onTouchMove={draw}
                  onTouchEnd={stopDraw}
                />
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <button onClick={clearSignature} style={{ flex: 1, background: "rgba(148,163,184,0.1)", color: C.sub, border: "none", borderRadius: "10px", padding: "10px", fontWeight: "600", cursor: "pointer" }}>
                  Clear
                </button>
                <button onClick={handleConfirmSignature} disabled={!hasSignature || saving}
                  style={{ flex: 2, background: (!hasSignature || saving) ? "rgba(6,182,212,0.3)" : `linear-gradient(135deg, ${C.accent}, ${C.teal})`, color: "#fff", border: "none", borderRadius: "10px", padding: "10px", fontWeight: "600", cursor: (!hasSignature || saving) ? "not-allowed" : "pointer" }}>
                  {saving ? "Saving..." : "Confirm"}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  )
}

function Info({ icon, label }) {
  return <span style={{ color: "#94a3b8", fontSize: "13px" }}>{icon} {label}</span>
}

function Modal({ title, onClose, children }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        style={{ background: "#0f2730", border: `1px solid ${C.border}`, borderRadius: "20px", padding: "28px", width: "100%", maxWidth: "560px", maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "20px" }}>
          <h2 style={{ color: C.text, fontSize: "17px", fontWeight: "700" }}>{title}</h2>
          <button onClick={onClose} style={{ color: "#94a3b8", background: "none", border: "none", cursor: "pointer", fontSize: "20px" }}>✕</button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  )
}
