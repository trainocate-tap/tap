import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"
import { useAuth } from "../../context/AuthContext"
import { motion, AnimatePresence } from "framer-motion"

const C = {
  accent: "#06b6d4", teal: "#14b8a6",
  card: "rgba(6,182,212,0.06)", border: "rgba(6,182,212,0.18)",
  text: "#ffffff", sub: "#94a3b8",
  success: "#10b981", warning: "#f59e0b", error: "#ef4444",
}

const CLASS_TYPES = ["AWS", "CISCO", "Microsoft", "Red Hat", "Soft Skills", "PMI", "ISC2", "Palo Alto", "Other"]

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

function PackingBadge({ gifts }) {
  if (!gifts?.length) return <span style={{ background: "rgba(148,163,184,0.1)", color: "#94a3b8", border: "1px solid rgba(148,163,184,0.2)", borderRadius: "8px", padding: "2px 8px", fontSize: "13px" }}>No gifts</span>
  const allDist = gifts.every(g => g.is_distributed)
  const allPacked = gifts.every(g => g.is_packed)
  if (allDist) return <span style={{ background: "rgba(16,185,129,0.15)", color: C.success, border: "1px solid rgba(16,185,129,0.3)", borderRadius: "8px", padding: "2px 8px", fontSize: "13px", fontWeight: "600" }}>🟢 Distributed</span>
  if (allPacked) return <span style={{ background: "rgba(245,158,11,0.15)", color: C.warning, border: "1px solid rgba(245,158,11,0.3)", borderRadius: "8px", padding: "2px 8px", fontSize: "13px", fontWeight: "600" }}>🟡 Packed</span>
  return <span style={{ background: "rgba(239,68,68,0.12)", color: C.error, border: "1px solid rgba(239,68,68,0.25)", borderRadius: "8px", padding: "2px 8px", fontSize: "13px", fontWeight: "600" }}>🔴 Not Packed</span>
}

const emptyForm = { class_name: "", class_type: "", class_date: "", end_date: "", pax_count: 0, pax_confirmed: 0, account_manager: "", person_in_charge: "", classroom: "", trainer_name: "", notes: "" }

export default function MarketingClasses() {
  const { userProfile, canManageMarketing } = useAuth()
  const [classes, setClasses] = useState([])
  const [items, setItems] = useState([])
  const [variants, setVariants] = useState([])
  const [stock, setStock] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showGiftModal, setShowGiftModal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)
  const [activeClass, setActiveClass] = useState(null)
  const [giftList, setGiftList] = useState([{ item_id: "", variant_id: "", quantity: 1 }])
  const [showReviewModal, setShowReviewModal] = useState(null)
  const [reviews, setReviews] = useState([])
  const [reviewRows, setReviewRows] = useState([{ attendee_name: "", left_review: false, gift_item_id: "" }])
  const [showTimingModal, setShowTimingModal] = useState(null)
  const [trainerTimings, setTrainerTimings] = useState([])
  const [timingForm, setTimingForm] = useState({ trainer_name: "", arrival_time: "", start_time: "", end_time: "", notes: "" })
  const [showAttendanceModal, setShowAttendanceModal] = useState(null)
  const [attendance, setAttendance] = useState([])
  const [attendanceRows, setAttendanceRows] = useState([{ attendee_name: "", status: "Present" }])
  const [bulkPasteText, setBulkPasteText] = useState("")

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
    const [{ data: c }, { data: i }, { data: v }, { data: s }, { data: r }, { data: t }, { data: a }] = await Promise.all([
      supabase.from("marketing_classes").select("*, marketing_class_gifts(*)").order("class_date", { ascending: false }),
      supabase.from("marketing_items").select("id, name, unit, category").order("name"),
      supabase.from("marketing_item_variants").select("*"),
      supabase.from("marketing_stock").select("item_id, quantity"),
      supabase.from("marketing_google_reviews").select("*").order("created_at", { ascending: false }),
      supabase.from("marketing_trainer_timing").select("*"),
      supabase.from("marketing_attendance").select("*").order("created_at"),
    ])
    setClasses(c || [])
    setItems(i || [])
    setVariants(v || [])
    setStock(s || [])
    setReviews(r || [])
    setTrainerTimings(t || [])
    setAttendance(a || [])
    setLoading(false)
  }

  const getClassReviews = (classId) => reviews.filter(r => r.class_id === classId)
  const getClassTiming = (classId) => trainerTimings.find(t => t.class_id === classId)
  const getClassAttendance = (classId) => attendance.filter(a => a.class_id === classId)

  const getItemStock = (itemId) =>
    stock.filter(s => s.item_id === itemId).reduce((sum, s) => sum + s.quantity, 0)

  const isThisWeek = (dateStr) => {
    const d = new Date(dateStr)
    const now = new Date()
    const start = new Date(now); start.setDate(now.getDate() - now.getDay() + 1); start.setHours(0,0,0,0)
    const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23,59,59,999)
    return d >= start && d <= end
  }

  const handleSaveClass = async () => {
    if (!form.class_name || !form.class_date) return
    setSaving(true)
    setSaveError(null)
    const { data: cls, error } = await supabase
      .from("marketing_classes")
      .insert({ ...form, pax_count: parseInt(form.pax_count) || 0, pax_confirmed: parseInt(form.pax_confirmed) || 0 })
      .select()
      .single()
    if (error) {
      setSaving(false)
      setSaveError(`Could not save class: ${error.message}`)
      return
    }
    setSaving(false)
    setShowAddModal(false)
    setSaveError(null)
    setForm(emptyForm)
    showSuccess(`✅ "${cls.class_name}" added successfully!`)
    notify("Class Added ✅", `${cls.class_name} has been added successfully`, "class_added")
    fetchAll()
  }

  const handleAssignGifts = async () => {
    if (!showGiftModal) return
    setSaving(true)
    setSaveError(null)
    const valid = giftList.filter(g => g.item_id && g.quantity > 0)
    if (valid.length) {
      const { error } = await supabase.from("marketing_class_gifts").insert(
        valid.map(g => ({ class_id: showGiftModal.id, item_id: g.item_id, variant_id: g.variant_id || null, quantity: parseInt(g.quantity) }))
      )
      if (error) {
        setSaving(false)
        setSaveError(`Could not assign gifts: ${error.message}`)
        return
      }
    }
    setSaving(false)
    setShowGiftModal(null)
    setSaveError(null)
    setGiftList([{ item_id: "", variant_id: "", quantity: 1 }])
    showSuccess("✅ Gifts assigned successfully!")
    fetchAll()
  }

  const handleMarkPacked = async (classId, gifts) => {
    setSaving(true)
    const ids = gifts.map(g => g.id)
    if (ids.length) {
      await supabase.from("marketing_class_gifts").update({ is_packed: true, packed_by: userProfile.id, packed_at: new Date().toISOString() }).in("id", ids)
    }
    setSaving(false)
    fetchAll()
  }

  const handleMarkDistributed = async (classId, gifts) => {
    setSaving(true)
    const ids = gifts.map(g => g.id)
    if (ids.length) {
      await supabase.from("marketing_class_gifts").update({ is_distributed: true, distributed_by: userProfile.id, distributed_at: new Date().toISOString() }).in("id", ids)
    }
    setSaving(false)
    fetchAll()
  }

  const handleSaveReviews = async () => {
    if (!showReviewModal) return
    setSaving(true)
    setSaveError(null)
    const valid = reviewRows.filter(r => r.attendee_name.trim())
    if (valid.length) {
      const { error } = await supabase.from("marketing_google_reviews").insert(
        valid.map(r => ({
          class_id: showReviewModal.id,
          attendee_name: r.attendee_name.trim(),
          left_review: r.left_review,
          gift_item_id: r.gift_item_id || null,
          created_by: userProfile?.id,
          created_by_name: userProfile?.name || userProfile?.email,
        }))
      )
      if (error) {
        setSaving(false)
        setSaveError(`Could not save reviews: ${error.message}`)
        return
      }
    }
    setSaving(false)
    for (const r of valid) {
      await notify("Google Review Tracked 🎁", `Review tracked for ${r.attendee_name.trim()} in ${showReviewModal.class_name}`, "review_tracked")
    }
    setShowReviewModal(null)
    setSaveError(null)
    setReviewRows([{ attendee_name: "", left_review: false, gift_item_id: "" }])
    showSuccess("✅ Attendees saved successfully!")
    fetchAll()
  }

  const handleDeleteReview = async (id) => {
    await supabase.from("marketing_google_reviews").delete().eq("id", id)
    fetchAll()
  }

  const handleSaveTiming = async () => {
    if (!showTimingModal) return
    setSaving(true)
    setSaveError(null)
    const existing = getClassTiming(showTimingModal.id)
    const payload = {
      class_id: showTimingModal.id,
      trainer_name: timingForm.trainer_name || null,
      arrival_time: timingForm.arrival_time || null,
      start_time: timingForm.start_time || null,
      end_time: timingForm.end_time || null,
      notes: timingForm.notes || null,
      recorded_by: userProfile?.id,
      recorded_by_name: userProfile?.name || userProfile?.email,
    }
    let error
    if (existing) {
      ({ error } = await supabase.from("marketing_trainer_timing").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", existing.id))
    } else {
      ({ error } = await supabase.from("marketing_trainer_timing").insert(payload))
    }
    if (error) {
      setSaving(false)
      setSaveError(`Could not save timing: ${error.message}`)
      return
    }
    setSaving(false)
    notify("Trainer Timing Saved ⏱️", `Timing recorded for ${showTimingModal.class_name}`, "trainer_timing")
    setShowTimingModal(null)
    setSaveError(null)
    showSuccess("✅ Trainer timing saved!")
    fetchAll()
  }

  const handleAddFromPaste = () => {
    const names = bulkPasteText.split(",").map(n => n.trim()).filter(Boolean)
    if (names.length === 0) return
    setAttendanceRows(prev => [...prev.filter(r => r.attendee_name.trim()), ...names.map(n => ({ attendee_name: n, status: "Present" }))])
    setBulkPasteText("")
  }

  const handleSaveAttendance = async () => {
    if (!showAttendanceModal) return
    setSaving(true)
    setSaveError(null)

    const existing = getClassAttendance(showAttendanceModal.id)
    const currentIds = attendanceRows.filter(r => r.id).map(r => r.id)
    const removedIds = existing.filter(e => !currentIds.includes(e.id)).map(e => e.id)
    const validRows = attendanceRows.filter(r => r.attendee_name.trim())

    if (removedIds.length) {
      const { error: delErr } = await supabase.from("marketing_attendance").delete().in("id", removedIds)
      if (delErr) {
        setSaving(false)
        setSaveError(`Could not update attendance: ${delErr.message}`)
        return
      }
    }

    const toInsert = validRows.filter(r => !r.id).map(r => ({
      class_id: showAttendanceModal.id,
      attendee_name: r.attendee_name.trim(),
      status: r.status,
      created_by: userProfile?.id,
      created_by_name: userProfile?.name || userProfile?.email,
    }))
    if (toInsert.length) {
      const { error: insErr } = await supabase.from("marketing_attendance").insert(toInsert)
      if (insErr) {
        setSaving(false)
        setSaveError(`Could not save attendance: ${insErr.message}`)
        return
      }
    }

    for (const r of validRows.filter(r => r.id)) {
      const { error: updErr } = await supabase.from("marketing_attendance").update({ attendee_name: r.attendee_name.trim(), status: r.status }).eq("id", r.id)
      if (updErr) {
        setSaving(false)
        setSaveError(`Could not update attendance: ${updErr.message}`)
        return
      }
    }

    setSaving(false)
    const presentCount = validRows.filter(r => r.status === "Present").length
    notify("Attendance Saved 👥", `Attendance recorded for ${showAttendanceModal.class_name}: ${presentCount}/${validRows.length} present`, "attendance")
    setShowAttendanceModal(null)
    setSaveError(null)
    setBulkPasteText("")
    showSuccess("✅ Attendance saved!")
    fetchAll()
  }

  const openTimingModal = (cls) => {
    const existing = getClassTiming(cls.id)
    setShowTimingModal(cls)
    setTimingForm({
      trainer_name: existing?.trainer_name || cls.trainer_name || "",
      arrival_time: existing?.arrival_time || "",
      start_time: existing?.start_time || "",
      end_time: existing?.end_time || "",
      notes: existing?.notes || "",
    })
    setSaveError(null)
  }

  const openAttendanceModal = (cls) => {
    const existing = getClassAttendance(cls.id)
    setShowAttendanceModal(cls)
    setAttendanceRows(existing.length > 0 ? existing.map(a => ({ id: a.id, attendee_name: a.attendee_name, status: a.status })) : [{ attendee_name: "", status: "Present" }])
    setBulkPasteText("")
    setSaveError(null)
  }

  const weekClasses = classes.filter(c => isThisWeek(c.class_date))
  const otherClasses = classes.filter(c => !isThisWeek(c.class_date))

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
          <h1 style={{ color: C.text, fontSize: "24px", fontWeight: "800", marginBottom: "4px" }}>🎁 Class Gifts</h1>
          <p style={{ color: C.sub, fontSize: "15px" }}>{classes.length} classes total</p>
        </div>
        {canManageMarketing && (
          <button onClick={() => { setShowAddModal(true); setSaveError(null) }} style={{ background: `linear-gradient(135deg, ${C.accent}, ${C.teal})`, color: "#fff", border: "none", borderRadius: "10px", padding: "10px 18px", fontWeight: "600", fontSize: "15px", cursor: "pointer" }}>
            + Add Class
          </button>
        )}
      </div>

      {/* This week's classes */}
      {weekClasses.length > 0 && (
        <div style={{ marginBottom: "28px" }}>
          <h2 style={{ color: C.accent, fontSize: "17px", fontWeight: "700", marginBottom: "12px" }}>📅 This Week's Classes</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {weekClasses.map(cls => <ClassCard key={cls.id} cls={cls} onAssign={() => { setShowGiftModal(cls); setGiftList([{ item_id: "", variant_id: "", quantity: 1 }]); setSaveError(null) }} onTrackReviews={() => { setShowReviewModal(cls); setReviewRows([{ attendee_name: "", left_review: false, gift_item_id: "" }]); setSaveError(null) }} onTiming={() => openTimingModal(cls)} onAttendance={() => openAttendanceModal(cls)} onPacked={() => handleMarkPacked(cls.id, cls.marketing_class_gifts)} onDistributed={() => handleMarkDistributed(cls.id, cls.marketing_class_gifts)} canManage={canManageMarketing} items={items} variants={variants} getItemStock={getItemStock} reviews={getClassReviews(cls.id)} timing={getClassTiming(cls.id)} attendance={getClassAttendance(cls.id)} />)}
          </div>
        </div>
      )}

      {/* All classes */}
      <div>
        <h2 style={{ color: "#e2e8f0", fontSize: "17px", fontWeight: "700", marginBottom: "12px" }}>All Classes</h2>
        {loading ? <p style={{ color: C.sub }}>Loading...</p> : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {classes.length === 0 && <p style={{ color: C.sub, textAlign: "center", padding: "40px" }}>No classes yet. Add a class to get started.</p>}
            {classes.map(cls => <ClassCard key={cls.id} cls={cls} onAssign={() => { setShowGiftModal(cls); setGiftList([{ item_id: "", variant_id: "", quantity: 1 }]); setSaveError(null) }} onTrackReviews={() => { setShowReviewModal(cls); setReviewRows([{ attendee_name: "", left_review: false, gift_item_id: "" }]); setSaveError(null) }} onTiming={() => openTimingModal(cls)} onAttendance={() => openAttendanceModal(cls)} onPacked={() => handleMarkPacked(cls.id, cls.marketing_class_gifts)} onDistributed={() => handleMarkDistributed(cls.id, cls.marketing_class_gifts)} canManage={canManageMarketing} items={items} variants={variants} getItemStock={getItemStock} reviews={getClassReviews(cls.id)} timing={getClassTiming(cls.id)} attendance={getClassAttendance(cls.id)} />)}
          </div>
        )}
      </div>

      {/* Add Class Modal */}
      <AnimatePresence>
        {showAddModal && (
          <Modal title="Add New Class" onClose={() => { setShowAddModal(false); setSaveError(null) }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {saveError && (
                <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", padding: "10px 14px", color: C.error, fontSize: "15px" }}>
                  {saveError}
                </div>
              )}
              <Field label="Class Name *"><input value={form.class_name} onChange={e => setForm({ ...form, class_name: e.target.value })} placeholder="e.g. AWS Cloud Practitioner" style={inputStyle} /></Field>
              <Field label="Course Type">
                <select value={form.class_type} onChange={e => setForm({ ...form, class_type: e.target.value })} style={inputStyle}>
                  <option value="">Select type</option>
                  {CLASS_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <Field label="Start Date *"><input type="date" value={form.class_date} onChange={e => setForm({ ...form, class_date: e.target.value })} style={inputStyle} /></Field>
                <Field label="End Date"><input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} style={inputStyle} /></Field>
                <Field label="Pax Count"><input type="number" min={0} value={form.pax_count} onChange={e => setForm({ ...form, pax_count: e.target.value })} style={inputStyle} /></Field>
                <Field label="Pax Confirmed"><input type="number" min={0} value={form.pax_confirmed} onChange={e => setForm({ ...form, pax_confirmed: e.target.value })} style={inputStyle} /></Field>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <Field label="Account Manager"><input value={form.account_manager} onChange={e => setForm({ ...form, account_manager: e.target.value })} style={inputStyle} /></Field>
                <Field label="Person in Charge"><input value={form.person_in_charge} onChange={e => setForm({ ...form, person_in_charge: e.target.value })} style={inputStyle} /></Field>
                <Field label="Classroom"><input value={form.classroom} onChange={e => setForm({ ...form, classroom: e.target.value })} placeholder="e.g. Room 1" style={inputStyle} /></Field>
                <Field label="Trainer"><input value={form.trainer_name} onChange={e => setForm({ ...form, trainer_name: e.target.value })} style={inputStyle} /></Field>
              </div>
              <Field label="Notes"><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} style={{ ...inputStyle, resize: "vertical" }} /></Field>
              <div style={{ display: "flex", gap: "10px" }}>
                <button onClick={() => { setShowAddModal(false); setSaveError(null); setForm(emptyForm) }} style={{ flex: 1, background: "rgba(148,163,184,0.1)", color: C.sub, border: "none", borderRadius: "10px", padding: "10px", fontWeight: "600", cursor: "pointer" }}>Cancel</button>
                <button onClick={handleSaveClass} disabled={saving || !form.class_name || !form.class_date} style={{ flex: 2, background: `linear-gradient(135deg, ${C.accent}, ${C.teal})`, color: "#fff", border: "none", borderRadius: "10px", padding: "10px", fontWeight: "600", cursor: "pointer", opacity: saving ? 0.6 : 1 }}>{saving ? "Saving..." : "Save Class"}</button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Assign Gifts Modal */}
      <AnimatePresence>
        {showGiftModal && (
          <Modal title={`Assign Gifts — ${showGiftModal.class_name}`} onClose={() => { setShowGiftModal(null); setSaveError(null) }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {saveError && (
                <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", padding: "10px 14px", color: C.error, fontSize: "15px" }}>
                  {saveError}
                </div>
              )}
              {giftList.map((g, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px 30px", gap: "6px", alignItems: "end" }}>
                  <Field label={i === 0 ? "Item" : ""}>
                    <select value={g.item_id} onChange={e => { const arr = [...giftList]; arr[i].item_id = e.target.value; arr[i].variant_id = ""; setGiftList(arr) }} style={inputStyle}>
                      <option value="">Select item</option>
                      {items.map(it => <option key={it.id} value={it.id}>{it.name} (stock: {getItemStock(it.id)})</option>)}
                    </select>
                  </Field>
                  <Field label={i === 0 ? "Variant" : ""}>
                    <select value={g.variant_id} onChange={e => { const arr = [...giftList]; arr[i].variant_id = e.target.value; setGiftList(arr) }} style={inputStyle}>
                      <option value="">Any</option>
                      {variants.filter(v => v.item_id === g.item_id).map(v => <option key={v.id} value={v.id}>{v.variant_name}{v.color ? ` (${v.color})` : ""}</option>)}
                    </select>
                  </Field>
                  <Field label={i === 0 ? "Qty" : ""}>
                    <input type="number" min={1} value={g.quantity} onChange={e => { const arr = [...giftList]; arr[i].quantity = e.target.value; setGiftList(arr) }} style={inputStyle} />
                  </Field>
                  {giftList.length > 1 && (
                    <button onClick={() => setGiftList(prev => prev.filter((_, idx) => idx !== i))} style={{ color: C.error, background: "none", border: "none", cursor: "pointer", fontSize: "18px", paddingBottom: "2px" }}>✕</button>
                  )}
                </div>
              ))}
              <button onClick={() => setGiftList(prev => [...prev, { item_id: "", variant_id: "", quantity: 1 }])}
                style={{ background: "rgba(6,182,212,0.08)", color: C.accent, border: `1px dashed ${C.border}`, borderRadius: "8px", padding: "8px", fontSize: "14px", cursor: "pointer", fontWeight: "600" }}>
                + Add Another Item
              </button>
              <div style={{ display: "flex", gap: "10px" }}>
                <button onClick={() => { setShowGiftModal(null); setSaveError(null) }} style={{ flex: 1, background: "rgba(148,163,184,0.1)", color: C.sub, border: "none", borderRadius: "10px", padding: "10px", fontWeight: "600", cursor: "pointer" }}>Cancel</button>
                <button onClick={handleAssignGifts} disabled={saving} style={{ flex: 2, background: `linear-gradient(135deg, ${C.accent}, ${C.teal})`, color: "#fff", border: "none", borderRadius: "10px", padding: "10px", fontWeight: "600", cursor: "pointer", opacity: saving ? 0.6 : 1 }}>{saving ? "Saving..." : "Assign Gifts"}</button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Track Google Reviews Modal */}
      <AnimatePresence>
        {showReviewModal && (
          <Modal title={`🎁 Track Google Reviews — ${showReviewModal.class_name}`} onClose={() => { setShowReviewModal(null); setSaveError(null) }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {saveError && (
                <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", padding: "10px 14px", color: C.error, fontSize: "15px" }}>
                  {saveError}
                </div>
              )}

              {getClassReviews(showReviewModal.id).length > 0 && (
                <div>
                  <p style={{ color: C.sub, fontSize: "14px", fontWeight: "600", marginBottom: "8px" }}>Tracked attendees</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {getClassReviews(showReviewModal.id).map(r => {
                      const giftName = items.find(it => it.id === r.gift_item_id)?.name
                      return (
                        <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(6,182,212,0.04)", borderRadius: "8px", padding: "7px 10px" }}>
                          <span style={{ color: C.text, fontSize: "12.5px" }}>
                            {r.attendee_name} — {r.left_review ? <span style={{ color: C.success }}>⭐ Left review</span> : <span style={{ color: C.sub }}>No review yet</span>}
                            {giftName && <span style={{ color: C.sub }}> · Gift: {giftName}</span>}
                          </span>
                          <button onClick={() => handleDeleteReview(r.id)} style={{ color: C.error, background: "none", border: "none", cursor: "pointer", fontSize: "16px" }}>✕</button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <div>
                <p style={{ color: C.sub, fontSize: "14px", fontWeight: "600", marginBottom: "8px" }}>Add attendees</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {reviewRows.map((r, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "1.2fr 90px 1.2fr 30px", gap: "6px", alignItems: "center" }}>
                      <input value={r.attendee_name} onChange={e => { const arr = [...reviewRows]; arr[i].attendee_name = e.target.value; setReviewRows(arr) }}
                        placeholder="Attendee name" style={inputStyle} />
                      <label style={{ display: "flex", alignItems: "center", gap: "5px", color: C.sub, fontSize: "13px", cursor: "pointer" }}>
                        <input type="checkbox" checked={r.left_review} onChange={e => { const arr = [...reviewRows]; arr[i].left_review = e.target.checked; setReviewRows(arr) }} />
                        Reviewed
                      </label>
                      <select value={r.gift_item_id} onChange={e => { const arr = [...reviewRows]; arr[i].gift_item_id = e.target.value; setReviewRows(arr) }} style={inputStyle}>
                        <option value="">No gift</option>
                        {(items.some(it => it.category === "Google Review Gift") ? items.filter(it => it.category === "Google Review Gift") : items).map(it => (
                          <option key={it.id} value={it.id}>{it.name}</option>
                        ))}
                      </select>
                      {reviewRows.length > 1 && (
                        <button onClick={() => setReviewRows(prev => prev.filter((_, idx) => idx !== i))} style={{ color: C.error, background: "none", border: "none", cursor: "pointer", fontSize: "16px" }}>✕</button>
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={() => setReviewRows(prev => [...prev, { attendee_name: "", left_review: false, gift_item_id: "" }])}
                  style={{ marginTop: "8px", background: "rgba(6,182,212,0.08)", color: C.accent, border: `1px dashed ${C.border}`, borderRadius: "8px", padding: "8px", fontSize: "14px", cursor: "pointer", fontWeight: "600", width: "100%" }}>
                  + Add Attendee
                </button>
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <button onClick={() => { setShowReviewModal(null); setSaveError(null) }} style={{ flex: 1, background: "rgba(148,163,184,0.1)", color: C.sub, border: "none", borderRadius: "10px", padding: "10px", fontWeight: "600", cursor: "pointer" }}>Close</button>
                <button onClick={handleSaveReviews} disabled={saving || !reviewRows.some(r => r.attendee_name.trim())} style={{ flex: 2, background: `linear-gradient(135deg, ${C.accent}, ${C.teal})`, color: "#fff", border: "none", borderRadius: "10px", padding: "10px", fontWeight: "600", cursor: "pointer", opacity: saving ? 0.6 : 1 }}>{saving ? "Saving..." : "Save Attendees"}</button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Trainer Timing Modal */}
      <AnimatePresence>
        {showTimingModal && (
          <Modal title={`⏱️ Trainer Timing — ${showTimingModal.class_name}`} onClose={() => { setShowTimingModal(null); setSaveError(null) }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {saveError && (
                <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", padding: "10px 14px", color: C.error, fontSize: "15px" }}>
                  {saveError}
                </div>
              )}
              <Field label="Trainer Name">
                <input value={timingForm.trainer_name} onChange={e => setTimingForm({ ...timingForm, trainer_name: e.target.value })} placeholder="Trainer name" style={inputStyle} />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                <Field label="Arrival Time">
                  <input type="time" value={timingForm.arrival_time} onChange={e => setTimingForm({ ...timingForm, arrival_time: e.target.value })} style={inputStyle} />
                </Field>
                <Field label="Start Time">
                  <input type="time" value={timingForm.start_time} onChange={e => setTimingForm({ ...timingForm, start_time: e.target.value })} style={inputStyle} />
                </Field>
                <Field label="End Time">
                  <input type="time" value={timingForm.end_time} onChange={e => setTimingForm({ ...timingForm, end_time: e.target.value })} style={inputStyle} />
                </Field>
              </div>
              <Field label="Notes">
                <textarea value={timingForm.notes} onChange={e => setTimingForm({ ...timingForm, notes: e.target.value })} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
              </Field>
              <div style={{ display: "flex", gap: "10px" }}>
                <button onClick={() => { setShowTimingModal(null); setSaveError(null) }} style={{ flex: 1, background: "rgba(148,163,184,0.1)", color: C.sub, border: "none", borderRadius: "10px", padding: "10px", fontWeight: "600", cursor: "pointer" }}>Cancel</button>
                <button onClick={handleSaveTiming} disabled={saving} style={{ flex: 2, background: `linear-gradient(135deg, ${C.accent}, ${C.teal})`, color: "#fff", border: "none", borderRadius: "10px", padding: "10px", fontWeight: "600", cursor: "pointer", opacity: saving ? 0.6 : 1 }}>{saving ? "Saving..." : "Save Timing"}</button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Attendance Modal */}
      <AnimatePresence>
        {showAttendanceModal && (
          <Modal title={`👥 Attendance — ${showAttendanceModal.class_name}`} onClose={() => { setShowAttendanceModal(null); setSaveError(null) }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {saveError && (
                <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", padding: "10px 14px", color: C.error, fontSize: "15px" }}>
                  {saveError}
                </div>
              )}

              <Field label="Paste comma-separated names (optional)">
                <div style={{ display: "flex", gap: "8px" }}>
                  <input value={bulkPasteText} onChange={e => setBulkPasteText(e.target.value)} placeholder="e.g. John Tan, Mary Lim, Ahmad Faiz" style={inputStyle} />
                  <button onClick={handleAddFromPaste} style={{ background: "rgba(6,182,212,0.15)", color: C.accent, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "0 14px", fontSize: "14px", fontWeight: "600", cursor: "pointer", whiteSpace: "nowrap" }}>Add List</button>
                </div>
              </Field>

              <div>
                <p style={{ color: C.sub, fontSize: "14px", fontWeight: "600", marginBottom: "8px" }}>Attendees</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "320px", overflowY: "auto" }}>
                  {attendanceRows.map((r, i) => (
                    <div key={r.id || `new-${i}`} style={{ display: "grid", gridTemplateColumns: "1fr 110px 30px", gap: "6px", alignItems: "center" }}>
                      <input value={r.attendee_name} onChange={e => { const arr = [...attendanceRows]; arr[i].attendee_name = e.target.value; setAttendanceRows(arr) }}
                        placeholder="Attendee name" style={inputStyle} />
                      <select value={r.status} onChange={e => { const arr = [...attendanceRows]; arr[i].status = e.target.value; setAttendanceRows(arr) }} style={inputStyle}>
                        <option value="Present">Present</option>
                        <option value="Absent">Absent</option>
                      </select>
                      <button onClick={() => setAttendanceRows(prev => prev.filter((_, idx) => idx !== i))} style={{ color: C.error, background: "none", border: "none", cursor: "pointer", fontSize: "16px" }}>✕</button>
                    </div>
                  ))}
                </div>
                <button onClick={() => setAttendanceRows(prev => [...prev, { attendee_name: "", status: "Present" }])}
                  style={{ marginTop: "8px", background: "rgba(6,182,212,0.08)", color: C.accent, border: `1px dashed ${C.border}`, borderRadius: "8px", padding: "8px", fontSize: "14px", cursor: "pointer", fontWeight: "600", width: "100%" }}>
                  + Add Attendee
                </button>
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <button onClick={() => { setShowAttendanceModal(null); setSaveError(null) }} style={{ flex: 1, background: "rgba(148,163,184,0.1)", color: C.sub, border: "none", borderRadius: "10px", padding: "10px", fontWeight: "600", cursor: "pointer" }}>Cancel</button>
                <button onClick={handleSaveAttendance} disabled={saving || !attendanceRows.some(r => r.attendee_name.trim())} style={{ flex: 2, background: `linear-gradient(135deg, ${C.accent}, ${C.teal})`, color: "#fff", border: "none", borderRadius: "10px", padding: "10px", fontWeight: "600", cursor: "pointer", opacity: saving ? 0.6 : 1 }}>{saving ? "Saving..." : "Save Attendance"}</button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  )
}

function ClassCard({ cls, onAssign, onTrackReviews, onTiming, onAttendance, onPacked, onDistributed, canManage, items, variants, getItemStock, reviews, timing, attendance }) {
  const gifts = cls.marketing_class_gifts || []
  const allDist = gifts.length > 0 && gifts.every(g => g.is_distributed)
  const allPacked = gifts.length > 0 && gifts.every(g => g.is_packed)
  const reviewCount = reviews?.filter(r => r.left_review).length || 0
  const presentCount = attendance?.filter(a => a.status === "Present").length || 0

  return (
    <motion.div whileHover={{ scale: 1.005 }} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px", marginBottom: "10px" }}>
        <div>
          <p style={{ color: C.text, fontWeight: "700", fontSize: "17px" }}>{cls.class_name}</p>
          <div style={{ display: "flex", gap: "8px", marginTop: "4px", flexWrap: "wrap" }}>
            {cls.class_type && <span style={{ background: "rgba(6,182,212,0.1)", color: C.accent, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "1px 8px", fontSize: "13px" }}>{cls.class_type}</span>}
            <PackingBadge gifts={gifts} />
            {reviews?.length > 0 && (
              <span style={{ background: "rgba(245,158,11,0.12)", color: C.warning, border: "1px solid rgba(245,158,11,0.3)", borderRadius: "6px", padding: "1px 8px", fontSize: "13px", fontWeight: "600" }}>
                ⭐ {reviewCount}/{reviews.length} reviews
              </span>
            )}
            {timing && (
              <span style={{ background: "rgba(16,185,129,0.12)", color: C.success, border: "1px solid rgba(16,185,129,0.3)", borderRadius: "6px", padding: "1px 8px", fontSize: "13px", fontWeight: "600" }}>
                ✅ Timing recorded
              </span>
            )}
            {attendance?.length > 0 && (
              <span style={{ background: "rgba(6,182,212,0.1)", color: C.accent, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "1px 8px", fontSize: "13px", fontWeight: "600" }}>
                👥 {presentCount}/{attendance.length} attended
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {canManage && <button onClick={onAssign} style={{ background: "rgba(6,182,212,0.12)", color: C.accent, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "5px 10px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}>🎁 Assign Gifts</button>}
          {canManage && <button onClick={onTrackReviews} style={{ background: "rgba(245,158,11,0.12)", color: C.warning, border: "1px solid rgba(245,158,11,0.3)", borderRadius: "8px", padding: "5px 10px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}>🎁 Track Google Reviews</button>}
          {canManage && <button onClick={onTiming} style={{ background: "rgba(16,185,129,0.12)", color: C.success, border: "1px solid rgba(16,185,129,0.3)", borderRadius: "8px", padding: "5px 10px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}>⏱️ Trainer Timing</button>}
          {canManage && <button onClick={onAttendance} style={{ background: "rgba(6,182,212,0.12)", color: C.accent, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "5px 10px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}>👥 Attendance</button>}
          {canManage && !allPacked && gifts.length > 0 && <button onClick={onPacked} style={{ background: "rgba(245,158,11,0.12)", color: C.warning, border: "1px solid rgba(245,158,11,0.3)", borderRadius: "8px", padding: "5px 10px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}>📦 Mark Packed</button>}
          {canManage && allPacked && !allDist && <button onClick={onDistributed} style={{ background: "rgba(16,185,129,0.12)", color: C.success, border: "1px solid rgba(16,185,129,0.3)", borderRadius: "8px", padding: "5px 10px", fontSize: "13px", fontWeight: "600", cursor: "pointer" }}>✅ Mark Distributed</button>}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "6px", marginBottom: "10px" }}>
        <Info icon="📅" label={cls.class_date} />
        {cls.classroom && <Info icon="🏫" label={cls.classroom} />}
        {cls.pax_confirmed > 0 && <Info icon="👥" label={`${cls.pax_confirmed} pax confirmed`} />}
        {cls.account_manager && <Info icon="👤" label={cls.account_manager} />}
        {cls.person_in_charge && <Info icon="🙋" label={cls.person_in_charge} />}
      </div>

      {gifts.length > 0 && (
        <div>
          <p style={{ color: C.sub, fontSize: "13px", marginBottom: "5px" }}>Assigned gifts:</p>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {gifts.map(g => {
              const itemName = items.find(it => it.id === g.item_id)?.name || "?"
              const variantName = variants.find(v => v.id === g.variant_id)?.variant_name
              return (
                <span key={g.id} style={{ background: "rgba(6,182,212,0.08)", color: C.text, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "3px 10px", fontSize: "13px" }}>
                  {itemName} × {g.quantity}
                  {variantName && ` (${variantName})`}
                  {g.is_distributed ? " ✅" : g.is_packed ? " 📦" : ""}
                </span>
              )
            })}
          </div>
        </div>
      )}
    </motion.div>
  )
}

function Info({ icon, label }) {
  return <span style={{ color: "#94a3b8", fontSize: "13px" }}>{icon} {label}</span>
}

const C_local = C

function Modal({ title, onClose, children }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        style={{ background: "#0f2730", border: `1px solid ${C_local.border}`, borderRadius: "20px", padding: "28px", width: "100%", maxWidth: "560px", maxHeight: "85vh", overflowY: "auto" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h2 style={{ color: C_local.text, fontSize: "17px", fontWeight: "700" }}>{title}</h2>
          <button onClick={onClose} style={{ color: "#94a3b8", background: "none", border: "none", cursor: "pointer", fontSize: "20px" }}>✕</button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  )
}
