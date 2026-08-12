import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"
import { useAuth } from "../../context/AuthContext"
import { motion, AnimatePresence } from "framer-motion"

const C = {
  accent: "#06b6d4", teal: "#14b8a6",
  card: "rgba(6,182,212,0.06)", border: "rgba(6,182,212,0.18)",
  text: "#ffffff", sub: "#94a3b8",
  success: "#10b981", error: "#ef4444",
}

const PURPOSES = [
  "End of Class Distribution", "Event Collateral", "Google Review Gift",
  "Corporate Gift", "BDM Request", "Other",
]

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

export default function MarketingStock() {
  const { userProfile } = useAuth()
  const [tab, setTab] = useState("in")
  const [items, setItems] = useState([])
  const [variants, setVariants] = useState([])
  const [locations, setLocations] = useState([])
  const [movements, setMovements] = useState([])
  const [classes, setClasses] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)
  const [filterType, setFilterType] = useState("All")

  const [formIn, setFormIn] = useState({ item_id: "", variant_id: "", location_id: "", quantity: "", brought_by: "", intended_for: "", date: new Date().toISOString().split("T")[0], notes: "" })
  const [formOut, setFormOut] = useState({ item_id: "", variant_id: "", from_location_id: "", quantity: "", taken_by: "", purpose: "", class_id: "", event_id: "", date: new Date().toISOString().split("T")[0], notes: "" })

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)

    // Fetch items, locations, variants in parallel (needed for name resolution)
    const [{ data: i }, { data: v }, { data: l }, { data: c }, { data: e }] = await Promise.all([
      supabase.from("marketing_items").select("id, name, unit").order("name"),
      supabase.from("marketing_item_variants").select("*"),
      supabase.from("marketing_locations").select("*").order("name"),
      supabase.from("marketing_classes").select("id, class_name, class_date").order("class_date", { ascending: false }).limit(50),
      supabase.from("marketing_events").select("id, event_name, event_date").order("event_date", { ascending: false }).limit(50),
    ])
    setItems(i || [])
    setVariants(v || [])
    setLocations(l || [])
    setClasses(c || [])
    setEvents(e || [])

    // Fetch movements separately with no joins — resolve names locally to avoid FK ambiguity errors
    const { data: m, error: mErr } = await supabase
      .from("marketing_stock_movements")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200)

    console.log("[MarketingStock] movements fetch →", { count: m?.length ?? 0, error: mErr?.message ?? null, sample: m?.[0] ?? null })
    if (mErr) console.error("[MarketingStock] movements error:", mErr)
    setMovements(m || [])

    setLoading(false)
  }

  const getVariantsForItem = (itemId) => variants.filter(v => v.item_id === itemId)

  const showSuccess = (msg) => {
    setSaveError(null)
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 7000)
  }

  const notify = async (title, message, type) => {
    if (!userProfile?.id) return
    await supabase.from("marketing_notifications").insert({ user_id: userProfile.id, title, message, type, is_read: false })
  }

  // Build the stock lookup query, handling null variant_id correctly.
  // PostgREST requires .is("col", null) for null checks — .eq("col", null) fails.
  const stockLookup = (itemId, locationId, variantId) => {
    let q = supabase.from("marketing_stock").select("id, quantity").eq("item_id", itemId).eq("location_id", locationId)
    return variantId ? q.eq("variant_id", variantId) : q.is("variant_id", null)
  }

  const handleStockIn = async (e) => {
    e.preventDefault()
    if (!formIn.item_id || !formIn.quantity || !formIn.location_id) return
    setSaving(true)
    setSaveError(null)
    const qty = parseInt(formIn.quantity)
    const itemName = items.find(i => i.id === formIn.item_id)?.name || "item"

    // 1. Insert movement record
    const movPayload = {
      item_id: formIn.item_id,
      variant_id: formIn.variant_id || null,
      location_id: formIn.location_id,
      to_location_id: formIn.location_id,
      movement_type: "stock_in",
      quantity: qty,
      notes: [formIn.notes, formIn.brought_by ? `Brought by: ${formIn.brought_by}` : "", formIn.intended_for ? `For: ${formIn.intended_for}` : ""].filter(Boolean).join(" | ") || null,
      performed_by: userProfile?.id,
      performed_by_name: userProfile?.name || userProfile?.email,
    }
    console.log("[StockIn] inserting movement:", movPayload)
    const { data: movData, error: movErr } = await supabase
      .from("marketing_stock_movements")
      .insert(movPayload)
      .select()
    console.log("[StockIn] movement insert result →", { data: movData, error: movErr?.message ?? null })
    if (movErr) {
      setSaving(false)
      setSaveError(`Failed to record movement: ${movErr.message}`)
      return
    }

    // 2. Update or create stock record
    const { data: existing, error: lookupErr } = await stockLookup(formIn.item_id, formIn.location_id, formIn.variant_id || null).maybeSingle()
    if (lookupErr) {
      setSaving(false)
      setSaveError(`Failed to read current stock: ${lookupErr.message}`)
      return
    }

    if (existing) {
      const { error: updErr } = await supabase.from("marketing_stock")
        .update({ quantity: existing.quantity + qty, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
      if (updErr) {
        setSaving(false)
        setSaveError(`Failed to update stock quantity: ${updErr.message}`)
        return
      }
    } else {
      const { error: insErr } = await supabase.from("marketing_stock").insert({
        item_id: formIn.item_id,
        variant_id: formIn.variant_id || null,
        location_id: formIn.location_id,
        quantity: qty,
      })
      if (insErr) {
        setSaving(false)
        setSaveError(`Failed to create stock record: ${insErr.message}`)
        return
      }
    }

    setSaving(false)
    const locationName = locations.find(l => l.id === formIn.location_id)?.name || "location"
    setFormIn({ item_id: "", variant_id: "", location_id: "", quantity: "", brought_by: "", intended_for: "", date: new Date().toISOString().split("T")[0], notes: "" })
    showSuccess(`✅ Stock In recorded: +${qty} units of ${itemName}`)
    notify("Stock In 📥", `${qty} units of ${itemName} received at ${locationName}`, "stock_in")
    fetchAll()
  }

  const handleStockOut = async (e) => {
    e.preventDefault()
    if (!formOut.item_id || !formOut.quantity || !formOut.from_location_id) return
    setSaving(true)
    setSaveError(null)
    const qty = parseInt(formOut.quantity)
    const itemName = items.find(i => i.id === formOut.item_id)?.name || "item"

    // 1. Insert movement record
    const { error: movErr } = await supabase.from("marketing_stock_movements").insert({
      item_id: formOut.item_id,
      variant_id: formOut.variant_id || null,
      location_id: formOut.from_location_id,
      from_location_id: formOut.from_location_id,
      movement_type: "stock_out",
      quantity: qty,
      reason: formOut.purpose || null,
      notes: formOut.notes || null,
      class_id: formOut.class_id || null,
      event_id: formOut.event_id || null,
      performed_by: userProfile?.id,
      performed_by_name: formOut.taken_by || userProfile?.name || userProfile?.email,
    })
    if (movErr) {
      setSaving(false)
      setSaveError(`Failed to record movement: ${movErr.message}`)
      return
    }

    // 2. Decrease stock quantity
    const { data: existing, error: lookupErr } = await stockLookup(formOut.item_id, formOut.from_location_id, formOut.variant_id || null).maybeSingle()
    if (lookupErr) {
      setSaving(false)
      setSaveError(`Failed to read current stock: ${lookupErr.message}`)
      return
    }

    if (existing) {
      const { error: updErr } = await supabase.from("marketing_stock")
        .update({ quantity: Math.max(0, existing.quantity - qty), updated_at: new Date().toISOString() })
        .eq("id", existing.id)
      if (updErr) {
        setSaving(false)
        setSaveError(`Failed to update stock quantity: ${updErr.message}`)
        return
      }
    }

    setSaving(false)
    const outLocationName = locations.find(l => l.id === formOut.from_location_id)?.name || "location"
    setFormOut({ item_id: "", variant_id: "", from_location_id: "", quantity: "", taken_by: "", purpose: "", class_id: "", event_id: "", date: new Date().toISOString().split("T")[0], notes: "" })
    showSuccess(`✅ Stock Out recorded: -${qty} units of ${itemName}`)
    notify("Stock Out 📤", `${qty} units of ${itemName} distributed from ${outLocationName}`, "stock_out")
    fetchAll()
  }

  const filteredMovements = filterType === "All" ? movements : movements.filter(m => m.movement_type === (filterType === "Stock In" ? "stock_in" : "stock_out"))

  return (
    <div style={{ padding: "24px", maxWidth: "900px" }}>
      {/* Success toast */}
      <AnimatePresence>
        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            style={{ position: "fixed", top: "72px", left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: "rgba(16,185,129,0.95)", color: "#fff", borderRadius: "12px", padding: "12px 24px", fontSize: "16px", fontWeight: "600", boxShadow: "0 8px 30px rgba(0,0,0,0.3)", whiteSpace: "nowrap" }}
          >
            {successMsg}
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ color: C.text, fontSize: "24px", fontWeight: "800", marginBottom: "4px" }}>📊 Stock In / Out</h1>
        <p style={{ color: C.sub, fontSize: "15px" }}>Record stock receipts and disbursements</p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "24px" }}>
        {[["in", "📥 Stock In"], ["out", "📤 Stock Out"], ["history", "📋 Movement History"]].map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "9px 18px", borderRadius: "10px", border: "none", cursor: "pointer", fontWeight: "600", fontSize: "15px",
            background: tab === t ? `linear-gradient(135deg, ${C.accent}, ${C.teal})` : "rgba(6,182,212,0.08)",
            color: tab === t ? "#fff" : C.sub,
          }}>{label}</button>
        ))}
      </div>

      {/* Stock In Form */}
      {tab === "in" && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "24px" }}>
          <h2 style={{ color: C.text, fontSize: "16px", fontWeight: "700", marginBottom: "20px" }}>📥 Record Stock In</h2>
          {saveError && tab === "in" && (
            <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "10px", padding: "12px 14px", marginBottom: "4px", color: C.error, fontSize: "15px" }}>
              ⚠️ {saveError}
            </div>
          )}
          <form onSubmit={handleStockIn} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <Field label="Item *">
                <select value={formIn.item_id} onChange={e => setFormIn({ ...formIn, item_id: e.target.value, variant_id: "" })} required style={inputStyle}>
                  <option value="">Select item</option>
                  {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </Field>
              {formIn.item_id && getVariantsForItem(formIn.item_id).length > 0 && (
                <Field label="Variant / Color">
                  <select value={formIn.variant_id} onChange={e => setFormIn({ ...formIn, variant_id: e.target.value })} style={inputStyle}>
                    <option value="">All variants</option>
                    {getVariantsForItem(formIn.item_id).map(v => <option key={v.id} value={v.id}>{v.variant_name}{v.color ? ` (${v.color})` : ""}</option>)}
                  </select>
                </Field>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <Field label="Storage Location *">
                <select value={formIn.location_id} onChange={e => setFormIn({ ...formIn, location_id: e.target.value })} required style={inputStyle}>
                  <option value="">Select location</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </Field>
              <Field label="Quantity Received *">
                <input type="number" min="1" value={formIn.quantity} onChange={e => setFormIn({ ...formIn, quantity: e.target.value })} required style={inputStyle} />
              </Field>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <Field label="Brought In By">
                <input value={formIn.brought_by} onChange={e => setFormIn({ ...formIn, brought_by: e.target.value })} placeholder="Name" style={inputStyle} />
              </Field>
              <Field label="Intended For">
                <input value={formIn.intended_for} onChange={e => setFormIn({ ...formIn, intended_for: e.target.value })} placeholder="Department / person" style={inputStyle} />
              </Field>
            </div>
            <Field label="Date Received">
              <input type="date" value={formIn.date} onChange={e => setFormIn({ ...formIn, date: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Notes">
              <textarea value={formIn.notes} onChange={e => setFormIn({ ...formIn, notes: e.target.value })} rows={2} placeholder="Additional notes..." style={{ ...inputStyle, resize: "vertical" }} />
            </Field>
            <button type="submit" disabled={saving} style={{ background: `linear-gradient(135deg, ${C.accent}, ${C.teal})`, color: "#fff", border: "none", borderRadius: "10px", padding: "12px", fontWeight: "700", fontSize: "16px", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving..." : "📥 Record Stock In"}
            </button>
          </form>
        </motion.div>
      )}

      {/* Stock Out Form */}
      {tab === "out" && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "24px" }}>
          <h2 style={{ color: C.text, fontSize: "16px", fontWeight: "700", marginBottom: "20px" }}>📤 Record Stock Out</h2>
          {saveError && tab === "out" && (
            <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "10px", padding: "12px 14px", marginBottom: "4px", color: C.error, fontSize: "15px" }}>
              ⚠️ {saveError}
            </div>
          )}
          <form onSubmit={handleStockOut} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <Field label="Item *">
                <select value={formOut.item_id} onChange={e => setFormOut({ ...formOut, item_id: e.target.value, variant_id: "" })} required style={inputStyle}>
                  <option value="">Select item</option>
                  {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </Field>
              {formOut.item_id && getVariantsForItem(formOut.item_id).length > 0 && (
                <Field label="Variant / Color">
                  <select value={formOut.variant_id} onChange={e => setFormOut({ ...formOut, variant_id: e.target.value })} style={inputStyle}>
                    <option value="">All variants</option>
                    {getVariantsForItem(formOut.item_id).map(v => <option key={v.id} value={v.id}>{v.variant_name}{v.color ? ` (${v.color})` : ""}</option>)}
                  </select>
                </Field>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <Field label="From Location *">
                <select value={formOut.from_location_id} onChange={e => setFormOut({ ...formOut, from_location_id: e.target.value })} required style={inputStyle}>
                  <option value="">Select location</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </Field>
              <Field label="Quantity *">
                <input type="number" min="1" value={formOut.quantity} onChange={e => setFormOut({ ...formOut, quantity: e.target.value })} required style={inputStyle} />
              </Field>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <Field label="Taken By">
                <input value={formOut.taken_by} onChange={e => setFormOut({ ...formOut, taken_by: e.target.value })} placeholder="Name" style={inputStyle} />
              </Field>
              <Field label="Purpose *">
                <select value={formOut.purpose} onChange={e => setFormOut({ ...formOut, purpose: e.target.value })} required style={inputStyle}>
                  <option value="">Select purpose</option>
                  {PURPOSES.map(p => <option key={p}>{p}</option>)}
                </select>
              </Field>
            </div>
            {formOut.purpose === "End of Class Distribution" && (
              <Field label="Link to Class">
                <select value={formOut.class_id} onChange={e => setFormOut({ ...formOut, class_id: e.target.value })} style={inputStyle}>
                  <option value="">Select class (optional)</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.class_name} ({c.class_date})</option>)}
                </select>
              </Field>
            )}
            {formOut.purpose === "Event Collateral" && (
              <Field label="Link to Event">
                <select value={formOut.event_id} onChange={e => setFormOut({ ...formOut, event_id: e.target.value })} style={inputStyle}>
                  <option value="">Select event (optional)</option>
                  {events.map(e => <option key={e.id} value={e.id}>{e.event_name} ({e.event_date})</option>)}
                </select>
              </Field>
            )}
            <Field label="Date">
              <input type="date" value={formOut.date} onChange={e => setFormOut({ ...formOut, date: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Notes">
              <textarea value={formOut.notes} onChange={e => setFormOut({ ...formOut, notes: e.target.value })} rows={2} placeholder="Reason / additional details..." style={{ ...inputStyle, resize: "vertical" }} />
            </Field>
            <button type="submit" disabled={saving} style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)", color: "#fff", border: "none", borderRadius: "10px", padding: "12px", fontWeight: "700", fontSize: "16px", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving..." : "📤 Record Stock Out"}
            </button>
          </form>
        </motion.div>
      )}

      {/* Movement History */}
      {tab === "history" && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
            {["All", "Stock In", "Stock Out"].map(t => (
              <button key={t} onClick={() => setFilterType(t)} style={{
                padding: "7px 14px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "14px", fontWeight: "600",
                background: filterType === t ? `linear-gradient(135deg, ${C.accent}, ${C.teal})` : "rgba(6,182,212,0.08)",
                color: filterType === t ? "#fff" : C.sub,
              }}>{t}</button>
            ))}
          </div>

          {loading ? <p style={{ color: C.sub, textAlign: "center", padding: "40px" }}>Loading...</p> : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {filteredMovements.length === 0 && (
                <div style={{ textAlign: "center", padding: "60px", color: C.sub }}>
                  <p style={{ fontSize: "36px", marginBottom: "12px" }}>📋</p>
                  <p style={{ fontWeight: "600", marginBottom: "4px" }}>No movements found</p>
                  <p style={{ fontSize: "14px" }}>Record a Stock In or Stock Out to see history here</p>
                </div>
              )}
              {filteredMovements.map(mv => {
                const isIn = mv.movement_type === "stock_in"
                // Resolve names from local state — no join needed
                const locName = locations.find(l => l.id === mv.location_id)?.name || null
                const itemObj = items.find(i => i.id === mv.item_id)
                const itemName = itemObj?.name || "Unknown item"
                const itemUnit = itemObj?.unit || "units"
                return (
                  <div key={mv.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", flex: 1 }}>
                        {/* Icon */}
                        <div style={{ width: "36px", height: "36px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", flexShrink: 0, background: isIn ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)" }}>
                          {isIn ? "📥" : "📤"}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* Item name + quantity */}
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
                            <p style={{ color: C.text, fontSize: "15px", fontWeight: "700" }}>{itemName}</p>
                            <span style={{ background: isIn ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)", color: isIn ? C.success : C.error, border: `1px solid ${isIn ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`, borderRadius: "6px", padding: "1px 8px", fontSize: "14px", fontWeight: "700" }}>
                              {isIn ? "+" : "-"}{mv.quantity} {itemUnit}
                            </span>
                            <span style={{ background: "rgba(6,182,212,0.1)", color: C.accent, border: `1px solid rgba(6,182,212,0.2)`, borderRadius: "6px", padding: "1px 8px", fontSize: "13px", fontWeight: "600" }}>
                              {isIn ? "Stock In" : "Stock Out"}
                            </span>
                          </div>
                          {/* Location + reason */}
                          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                            {locName && (
                              <span style={{ color: C.sub, fontSize: "13px" }}>📍 {locName}</span>
                            )}
                            {mv.reason && (
                              <span style={{ color: C.sub, fontSize: "13px" }}>🏷️ {mv.reason}</span>
                            )}
                            {mv.performed_by_name && (
                              <span style={{ color: C.sub, fontSize: "13px" }}>👤 {mv.performed_by_name}</span>
                            )}
                          </div>
                          {/* Notes */}
                          {mv.notes && (
                            <p style={{ color: C.sub, fontSize: "13px", marginTop: "4px", fontStyle: "italic" }}>{mv.notes}</p>
                          )}
                        </div>
                      </div>
                      {/* Date */}
                      <p style={{ color: C.sub, fontSize: "13px", whiteSpace: "nowrap", flexShrink: 0 }}>
                        {new Date(mv.created_at).toLocaleString("en-SG", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </motion.div>
      )}
    </div>
  )
}
