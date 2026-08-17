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

export default function MarketingSettings() {
  const { canManageMarketing } = useAuth()
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newLocation, setNewLocation] = useState("")
  const [locationError, setLocationError] = useState(null)
  const [approvalThreshold, setApprovalThreshold] = useState(30)
  const [thresholdLoading, setThresholdLoading] = useState(true)
  const [savingThreshold, setSavingThreshold] = useState(false)
  const [thresholdError, setThresholdError] = useState(null)
  const [tab, setTab] = useState("locations")
  const [successMsg, setSuccessMsg] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const showSuccess = (msg) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 4000)
  }

  useEffect(() => { fetchAll(); fetchThreshold() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const { data, error } = await supabase.from("marketing_locations").select("*").order("name")
    if (!error) setLocations(data || [])
    setLoading(false)
  }

  const fetchThreshold = async () => {
    setThresholdLoading(true)
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "marketing_approval_threshold")
      .maybeSingle()
    setApprovalThreshold(data?.value ? parseInt(data.value) : 30)
    setThresholdLoading(false)
  }

  const handleSaveThreshold = async () => {
    setSavingThreshold(true)
    setThresholdError(null)
    const { error } = await supabase.from("app_settings").upsert({
      key: "marketing_approval_threshold",
      value: String(approvalThreshold),
      updated_at: new Date().toISOString(),
    })
    setSavingThreshold(false)
    if (error) {
      setThresholdError(`Could not save threshold: ${error.message}`)
      return
    }
    showSuccess("✅ Approval threshold saved!")
  }

  const handleAddLocation = async () => {
    if (!newLocation.trim()) return
    setSaving(true)
    setLocationError(null)
    const { error } = await supabase.from("marketing_locations").insert({ name: newLocation.trim() })
    if (error) {
      setSaving(false)
      setLocationError(`Could not add location: ${error.message}`)
      return
    }
    setSaving(false)
    setNewLocation("")
    showSuccess(`✅ Location "${newLocation.trim()}" added!`)
    fetchAll()
  }

  const handleDeleteLocation = async (id, name) => {
    setDeleteTarget({ id, name })
  }

  const confirmDeleteLocation = async () => {
    const { id, name } = deleteTarget
    setDeleteTarget(null)
    setLocationError(null)

    const { data: stockCheck } = await supabase
      .from("marketing_stock")
      .select("id")
      .eq("location_id", id)
      .limit(1)

    if (stockCheck && stockCheck.length > 0) {
      setLocationError("Cannot delete — this location has stock records. Remove all stock first.")
      return
    }

    const { error } = await supabase.from("marketing_locations").delete().eq("id", id)
    if (error) {
      showSuccess(`❌ Could not delete: ${error.message}`)
      return
    }
    showSuccess(`Deleted "${name}"`)
    fetchAll()
  }

  if (!canManageMarketing) {
    return (
      <div style={{ padding: "24px", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: "48px", marginBottom: "16px" }}>🔒</p>
          <p style={{ color: C.text, fontSize: "18px", fontWeight: "700", marginBottom: "8px" }}>Access Restricted</p>
          <p style={{ color: C.sub }}>Only Marketing Admins and Managers can access settings.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: "24px" }}>
      {/* Success toast */}
      <AnimatePresence>
        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            style={{ position: "fixed", top: "72px", left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: successMsg.startsWith("❌") ? "#ef4444" : "#10b981", color: "#fff", padding: "12px 24px", borderRadius: "12px", fontWeight: "600", fontSize: "16px", boxShadow: "0 4px 20px rgba(0,0,0,0.3)", whiteSpace: "nowrap" }}
          >
            {successMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete location confirm modal */}
      <AnimatePresence>
        {deleteTarget && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDeleteTarget(null)}
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999 }}
            />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              style={{
                position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
                width: "380px", maxWidth: "calc(100vw - 32px)", zIndex: 10000,
                background: "#0f2730", border: `1px solid ${C.border}`,
                borderRadius: "16px", padding: "22px",
                boxShadow: "0 20px 60px rgba(0,0,0,0.5), 0 0 30px rgba(6,182,212,0.1)",
              }}
            >
              <p style={{ color: C.text, fontWeight: "700", fontSize: "16px", margin: "0 0 8px" }}>Delete "{deleteTarget.name}"?</p>
              <p style={{ color: C.sub, fontSize: "15px", margin: "0 0 20px", lineHeight: 1.5 }}>This may affect stock records tied to this location. This action cannot be undone.</p>
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button
                  onClick={() => setDeleteTarget(null)}
                  style={{ padding: "8px 16px", borderRadius: "8px", border: `1px solid ${C.border}`, background: "transparent", color: C.sub, fontSize: "15px", fontWeight: "600", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteLocation}
                  style={{ padding: "8px 16px", borderRadius: "8px", border: "none", background: C.error, color: "#fff", fontSize: "15px", fontWeight: "600", cursor: "pointer" }}
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ color: C.text, fontSize: "24px", fontWeight: "800", marginBottom: "4px" }}>⚙️ Marketing Settings</h1>
        <p style={{ color: C.sub, fontSize: "15px" }}>Configure approval thresholds, locations, and more</p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "24px", flexWrap: "wrap" }}>
        {[["locations", "📍 Storage Locations"], ["approvals", "✅ Approval Settings"], ["export", "📤 Export Data"]].map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "9px 18px", borderRadius: "10px", border: "none", cursor: "pointer", fontWeight: "600", fontSize: "15px",
            background: tab === t ? `linear-gradient(135deg, ${C.accent}, ${C.teal})` : "rgba(6,182,212,0.08)",
            color: tab === t ? "#fff" : C.sub,
          }}>{label}</button>
        ))}
      </div>

      {/* Locations tab */}
      {tab === "locations" && (
        <div style={{ maxWidth: "600px" }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "20px", marginBottom: "16px" }}>
            <p style={{ color: C.text, fontWeight: "600", fontSize: "17px", marginBottom: "16px" }}>Add New Location</p>
            {locationError && (
              <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", padding: "10px 14px", color: C.error, fontSize: "15px", marginBottom: "12px" }}>
                {locationError}
              </div>
            )}
            <div style={{ display: "flex", gap: "10px" }}>
              <input
                value={newLocation}
                onChange={e => { setNewLocation(e.target.value); setLocationError(null) }}
                placeholder="Location name..."
                onKeyDown={e => e.key === "Enter" && handleAddLocation()}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={handleAddLocation}
                disabled={saving || !newLocation.trim()}
                style={{ background: `linear-gradient(135deg, ${C.accent}, ${C.teal})`, color: "#fff", border: "none", borderRadius: "8px", padding: "9px 18px", fontWeight: "600", fontSize: "15px", cursor: "pointer", whiteSpace: "nowrap", opacity: saving ? 0.6 : 1 }}
              >
                {saving ? "Adding..." : "Add Location"}
              </button>
            </div>
          </div>

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "20px" }}>
            <p style={{ color: C.text, fontWeight: "600", fontSize: "17px", marginBottom: "16px" }}>Storage Locations ({locations.length})</p>
            {loading ? <p style={{ color: C.sub }}>Loading...</p> : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {locations.map(loc => (
                  <div key={loc.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(6,182,212,0.04)", borderRadius: "10px", padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "16px" }}>📍</span>
                      <div>
                        <p style={{ color: C.text, fontSize: "15px", fontWeight: "500" }}>{loc.name}</p>
                        {loc.description && <p style={{ color: C.sub, fontSize: "13px" }}>{loc.description}</p>}
                      </div>
                    </div>
                    <button onClick={() => handleDeleteLocation(loc.id, loc.name)}
                      style={{ background: "rgba(239,68,68,0.1)", color: C.error, border: "1px solid rgba(239,68,68,0.2)", borderRadius: "6px", padding: "4px 10px", fontSize: "13px", cursor: "pointer" }}>
                      Delete
                    </button>
                  </div>
                ))}
                {locations.length === 0 && <p style={{ color: C.sub, textAlign: "center", padding: "20px" }}>No locations yet. Add one above.</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Approval settings tab */}
      {tab === "approvals" && (
        <div style={{ maxWidth: "500px" }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "24px" }}>
            <p style={{ color: C.text, fontWeight: "600", fontSize: "17px", marginBottom: "20px" }}>Approval Thresholds</p>

            {thresholdError && (
              <div style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", padding: "10px 14px", color: C.error, fontSize: "15px", marginBottom: "16px" }}>
                {thresholdError}
              </div>
            )}

            <Field label="Small Quantity Threshold (items ≤ this need Vivian or Siti)">
              <div style={{ display: "flex", gap: "10px" }}>
                <input type="number" min={1} value={approvalThreshold} disabled={thresholdLoading}
                  onChange={e => setApprovalThreshold(parseInt(e.target.value) || 0)}
                  style={{ ...inputStyle, flex: 1, opacity: thresholdLoading ? 0.6 : 1 }} />
                <button onClick={handleSaveThreshold} disabled={thresholdLoading || savingThreshold}
                  style={{ background: `linear-gradient(135deg, ${C.accent}, ${C.teal})`, color: "#fff", border: "none", borderRadius: "8px", padding: "9px 18px", fontWeight: "600", fontSize: "15px", cursor: "pointer", whiteSpace: "nowrap", opacity: (thresholdLoading || savingThreshold) ? 0.6 : 1 }}>
                  {savingThreshold ? "Saving..." : "Save"}
                </button>
              </div>
            </Field>

            <div style={{ background: "rgba(6,182,212,0.04)", border: `1px solid ${C.border}`, borderRadius: "10px", padding: "14px", marginTop: "16px" }}>
              <p style={{ color: C.accent, fontSize: "14px", fontWeight: "600", marginBottom: "8px" }}>Approval Matrix</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: C.sub, fontSize: "14px" }}>Qty ≤ {approvalThreshold} items</span>
                  <span style={{ color: C.text, fontSize: "14px", fontWeight: "600" }}>Vivian or Siti</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: C.sub, fontSize: "14px" }}>Qty &gt; {approvalThreshold} items</span>
                  <span style={{ color: C.warning, fontSize: "14px", fontWeight: "600" }}>April (senior approval)</span>
                </div>
              </div>
            </div>

            <p style={{ color: C.sub, fontSize: "14px", marginTop: "20px" }}>Auto-reminder: Pending requests older than 3 days trigger a reminder notification to the approver.</p>
          </div>
        </div>
      )}

      {/* Export tab */}
      {tab === "export" && (
        <div style={{ maxWidth: "500px" }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "24px" }}>
            <p style={{ color: C.text, fontWeight: "600", fontSize: "17px", marginBottom: "20px" }}>Export All Marketing Data</p>
            <p style={{ color: C.sub, fontSize: "15px", marginBottom: "20px" }}>
              Export all data from the marketing module as CSV files. This includes items, stock, movements, classes, events, and approvals.
            </p>

            {[
              { label: "All Items", table: "marketing_items", icon: "📦" },
              { label: "Stock Levels", table: "marketing_stock", icon: "📊" },
              { label: "Stock Movements", table: "marketing_stock_movements", icon: "🔄" },
              { label: "Classes", table: "marketing_classes", icon: "🎁" },
              { label: "Events", table: "marketing_events", icon: "🎪" },
              { label: "Approvals", table: "marketing_approvals", icon: "✅" },
            ].map(({ label, table, icon }) => (
              <div key={table} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid rgba(6,182,212,0.08)` }}>
                <span style={{ color: C.text, fontSize: "15px" }}>{icon} {label}</span>
                <button
                  onClick={async () => {
                    const { data } = await supabase.from(table).select("*")
                    if (!data?.length) { showSuccess("❌ No data to export"); return }
                    const headers = Object.keys(data[0])
                    const csv = [headers.join(","), ...data.map(r => headers.map(h => `"${r[h] ?? ""}"`).join(","))].join("\n")
                    const blob = new Blob([csv], { type: "text/csv" })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement("a"); a.href = url; a.download = `${table}_export.csv`; a.click()
                    showSuccess(`✅ ${label} exported!`)
                  }}
                  style={{ background: "rgba(6,182,212,0.12)", color: C.accent, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "6px 14px", fontSize: "14px", cursor: "pointer" }}>
                  Export CSV
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
