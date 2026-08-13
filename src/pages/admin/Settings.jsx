import { useEffect, useState } from "react"
import * as XLSX from "xlsx"
import { supabase } from "../../lib/supabase"
import { useAuth } from "../../context/AuthContext"
import { motion, AnimatePresence } from "framer-motion"
import { CURRENCIES } from "../../lib/useCurrency"

const BACKUP_TABLES = [
  "assets", "user_profiles", "borrow_history", "issues",
  "maintenance_schedules", "asset_requests", "notifications", "system_settings",
]

async function fetchBackupData() {
  const results = await Promise.all(
    BACKUP_TABLES.map(table => supabase.from(table).select("*"))
  )
  const data = {}
  BACKUP_TABLES.forEach((table, i) => { data[table] = results[i].data || [] })
  return data
}

export default function Settings() {
  const { isAdmin, isGlobalAdmin, userCountry } = useAuth()
  const [approvingEmail, setApprovingEmail] = useState("")
  const [marketingEmail, setMarketingEmail] = useState("")
  const [currency, setCurrency] = useState("SGD")
  const [users, setUsers] = useState([])
  const [adminUsers, setAdminUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingMarketing, setSavingMarketing] = useState(false)
  const [savingCurrency, setSavingCurrency] = useState(false)
  const [backingUp, setBackingUp] = useState(false)
  const [backingUpExcel, setBackingUpExcel] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")

  const [productIds, setProductIds] = useState([])
  const [loadingProductIds, setLoadingProductIds] = useState(true)
  const [newPIdCode, setNewPIdCode] = useState("")
  const [newPIdCategory, setNewPIdCategory] = useState("")
  const [addingPId, setAddingPId] = useState(false)
  const [editingPId, setEditingPId] = useState(null)
  const [editPIdCode, setEditPIdCode] = useState("")
  const [editPIdCategory, setEditPIdCategory] = useState("")
  const [savingPId, setSavingPId] = useState(false)
  const [deletePIdTarget, setDeletePIdTarget] = useState(null)
  const [deletingPId, setDeletingPId] = useState(false)

  useEffect(() => {
    Promise.all([fetchSettings(), fetchUsers(), fetchAdminUsers(), fetchCurrency(), fetchProductIds()])
  }, [])

  const fetchSettings = async () => {
    if (!userCountry) { setLoading(false); return }
    try {
      const { data } = await supabase
        .from("app_settings")
        .select("key, value")
      if (data) {
        const map = {}
        data.forEach(s => { map[s.key] = s.value })
        const approvingKey = `approving_officer_email_${userCountry}`
        const marketingKey = `marketing_approving_officer_${userCountry}`
        if (map[approvingKey]) setApprovingEmail(map[approvingKey])
        if (map[marketingKey] !== undefined) setMarketingEmail(map[marketingKey])
      }
    } catch { /* table may not exist yet — use defaults */ }
    setLoading(false)
  }

  const fetchCurrency = async () => {
    if (!userCountry) return
    try {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", `currency_${userCountry}`)
        .maybeSingle()
      if (data?.value) setCurrency(data.value)
    } catch { /* no row yet — use default */ }
  }

  const fetchProductIds = async () => {
    if (!userCountry && !isGlobalAdmin) { setLoadingProductIds(false); return }
    try {
      let q = supabase.from("product_ids").select("*").order("code")
      // Global admin sees every country's codes; everyone else sees their own
      // country's codes plus any legacy/shared codes with no country set.
      if (!isGlobalAdmin) q = q.or(`country.eq.${userCountry},country.is.null`)
      const { data } = await q
      setProductIds(data || [])
    } catch { /* table may not exist yet — use defaults */ }
    setLoadingProductIds(false)
  }

  const handleAddProductId = async (e) => {
    e.preventDefault()
    if (!newPIdCode.trim() || !newPIdCategory.trim()) return
    setAddingPId(true)
    setError("")
    try {
      const { data, error: insertError } = await supabase.from("product_ids")
        .insert({ code: newPIdCode.trim().toUpperCase(), category: newPIdCategory.trim(), country: userCountry })
        .select()
        .single()
      if (insertError) throw insertError
      setProductIds(prev => [...prev, data].sort((a, b) => a.code.localeCompare(b.code)))
      setNewPIdCode("")
      setNewPIdCategory("")
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err.message || "Failed to add Product ID.")
    }
    setAddingPId(false)
  }

  const startEditProductId = (p) => {
    setEditingPId(p.id)
    setEditPIdCode(p.code)
    setEditPIdCategory(p.category)
  }

  const cancelEditProductId = () => setEditingPId(null)

  const handleSaveProductId = async (id) => {
    if (!editPIdCode.trim() || !editPIdCategory.trim()) return
    setSavingPId(true)
    setError("")
    try {
      const code = editPIdCode.trim().toUpperCase()
      const category = editPIdCategory.trim()
      const { error: updateError } = await supabase.from("product_ids")
        .update({ code, category })
        .eq("id", id)
      if (updateError) throw updateError
      setProductIds(prev => prev.map(p => p.id === id ? { ...p, code, category } : p).sort((a, b) => a.code.localeCompare(b.code)))
      setEditingPId(null)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err.message || "Failed to update Product ID.")
    }
    setSavingPId(false)
  }

  const handleDeleteProductId = async (id) => {
    setDeletingPId(true)
    setError("")
    try {
      const { error: deleteError } = await supabase.from("product_ids").delete().eq("id", id)
      if (deleteError) throw deleteError
      setProductIds(prev => prev.filter(p => p.id !== id))
      setDeletePIdTarget(null)
    } catch (err) {
      setError(err.message || "Failed to delete Product ID.")
    }
    setDeletingPId(false)
  }

  const fetchUsers = async () => {
    try {
      const { data } = await supabase
        .from("user_profiles")
        .select("id, name, email, role")
        .order("name")
      setUsers(data || [])
    } catch {}
  }

  // Asset Request Approving Officer must be an admin — separate from the
  // Marketing officer dropdown below, which still picks from all users.
  const fetchAdminUsers = async () => {
    try {
      const { data } = await supabase
        .from("user_profiles")
        .select("id, name, email, role")
        .eq("role", "admin")
        .order("name")
      setAdminUsers(data || [])
    } catch {}
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!approvingEmail || !userCountry) return
    // Guard against placeholder/stale values (e.g. "global") getting saved instead
    // of a real selection — only proceed if it matches an actual admin user.
    if (!adminUsers.some(u => u.email === approvingEmail)) {
      setError("Please select a valid admin user as the approving officer.")
      return
    }
    setSaving(true)
    setError("")
    try {
      const { error: upsertError } = await supabase.from("app_settings").upsert({
        key: `approving_officer_email_${userCountry}`,
        value: approvingEmail.trim(),
        updated_at: new Date().toISOString(),
      })
      if (upsertError) throw upsertError
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err.message || "Failed to save settings.")
    }
    setSaving(false)
  }

  const handleSaveMarketing = async (e) => {
    e.preventDefault()
    if (!userCountry) return
    setSavingMarketing(true)
    setError("")
    try {
      const { error: upsertError } = await supabase.from("app_settings").upsert({
        key: `marketing_approving_officer_${userCountry}`,
        value: marketingEmail.trim(),
        updated_at: new Date().toISOString(),
      })
      if (upsertError) throw upsertError
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err.message || "Failed to save settings.")
    }
    setSavingMarketing(false)
  }

  const handleSaveCurrency = async (e) => {
    e.preventDefault()
    if (!userCountry) return
    setSavingCurrency(true)
    setError("")
    try {
      const { error: upsertError } = await supabase.from("app_settings").upsert({
        key: `currency_${userCountry}`,
        value: currency,
        updated_at: new Date().toISOString(),
      })
      if (upsertError) throw upsertError
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err.message || "Failed to save currency settings.")
    }
    setSavingCurrency(false)
  }

  const handleExportBackup = async () => {
    setBackingUp(true)
    setError("")
    try {
      const data = await fetchBackupData()
      const payload = {
        exported_at: new Date().toISOString(),
        source: "Trainocate Asset Portal",
        tables: data,
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `tap-backup-${new Date().toISOString().split("T")[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message || "Failed to export backup.")
    }
    setBackingUp(false)
  }

  const handleExportBackupExcel = async () => {
    setBackingUpExcel(true)
    setError("")
    try {
      const data = await fetchBackupData()
      const wb = XLSX.utils.book_new()
      BACKUP_TABLES.forEach(table => {
        const ws = XLSX.utils.json_to_sheet(data[table])
        XLSX.utils.book_append_sheet(wb, ws, table)
      })
      XLSX.writeFile(wb, `tap-backup-${new Date().toISOString().split("T")[0]}.xlsx`)
    } catch (err) {
      setError(err.message || "Failed to export Excel backup.")
    }
    setBackingUpExcel(false)
  }

  if (!isAdmin && !isGlobalAdmin) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-64">
        <span className="text-5xl mb-4">🔒</span>
        <h2 className="text-white text-xl font-bold mb-2">Access Denied</h2>
        <p className="text-gray-400 text-sm">Only admins can access settings.</p>
      </div>
    )
  }

  const selectedUser = adminUsers.find(u => u.email === approvingEmail)
  const selectedMarketingUser = users.find(u => u.email === marketingEmail)

  return (
    <div className="p-4 md:p-8 w-full max-w-2xl overflow-x-hidden">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-white">Settings</h1>
        <p className="text-gray-400 mt-1 text-sm">System configuration for Trainocate Asset Portal</p>
      </div>

      <AnimatePresence>
        {success && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="mb-4 bg-green-500/10 border border-green-500/40 rounded-xl p-3 flex items-center gap-2">
            <span>✅</span>
            <p className="text-green-400 text-sm font-medium">Settings saved successfully.</p>
          </motion.div>
        )}
        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="mb-4 bg-red-500/10 border border-red-500/40 rounded-xl p-3 flex items-center gap-2">
            <span>❌</span>
            <p className="text-red-400 text-sm font-medium">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Asset Request Approvals */}
      <div className="bg-gray-900/80 rounded-xl border border-gray-800 p-5 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl">📋</span>
          <h2 className="text-white font-semibold">Asset Request Approvals</h2>
        </div>
        <p className="text-gray-500 text-sm mb-4 ml-8">
          When an employee submits an asset request, an email and in-app notification are sent to the approving officer below.
        </p>

        {loading ? (
          <div className="animate-pulse h-12 bg-gray-800 rounded-lg" />
        ) : (
          <form onSubmit={handleSave}>
            <label className="text-gray-400 text-sm mb-2 block">Approving Officer</label>

            {/* User dropdown */}
            <select
              value={approvingEmail}
              onChange={e => setApprovingEmail(e.target.value)}
              required
              className="w-full min-w-0 bg-gray-800 text-white rounded-lg px-3 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm mb-3 truncate"
            >
              <option value="">Select a user…</option>
              {adminUsers.map(u => (
                <option key={u.id} value={u.email}>
                  {u.name || u.email} — {u.email}
                </option>
              ))}
            </select>

            {/* Preview chip */}
            {selectedUser && (
              <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-white font-bold text-xs shrink-0">
                  {(selectedUser.name || selectedUser.email)[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium truncate">{selectedUser.name || selectedUser.email}</p>
                  <p className="text-gray-400 text-xs truncate">{selectedUser.email}</p>
                </div>
                <span className="ml-auto text-blue-400 text-xs font-medium shrink-0">Approving Officer</span>
              </div>
            )}

            <button
              type="submit"
              disabled={saving || !approvingEmail}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium transition-all"
            >
              {saving ? "Saving…" : "Save Settings"}
            </button>
          </form>
        )}
      </div>

      {/* Currency Settings */}
      <div className="bg-gray-900/80 rounded-xl border border-gray-800 p-5 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl">💱</span>
          <h2 className="text-white font-semibold">Currency Settings</h2>
        </div>
        <p className="text-gray-500 text-sm mb-4 ml-8">
          Choose the currency used for cost and value fields for {userCountry || "your country"}. Each country sets its own currency.
        </p>

        {loading ? (
          <div className="animate-pulse h-12 bg-gray-800 rounded-lg" />
        ) : (
          <form onSubmit={handleSaveCurrency}>
            <label className="text-gray-400 text-sm mb-2 block">Currency</label>

            <select
              value={currency}
              onChange={e => setCurrency(e.target.value)}
              required
              className="w-full min-w-0 bg-gray-800 text-white rounded-lg px-3 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm mb-4 truncate"
            >
              {CURRENCIES.map(c => (
                <option key={c.code} value={c.code}>
                  {c.code} ({c.symbol})
                </option>
              ))}
            </select>

            <button
              type="submit"
              disabled={savingCurrency}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium transition-all"
            >
              {savingCurrency ? "Saving…" : "Save Currency"}
            </button>
          </form>
        )}
      </div>

      {/* Marketing Distribution Approvals */}
      <div className="bg-gray-900/80 rounded-xl border border-gray-800 p-5 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl">🎯</span>
          <h2 className="text-white font-semibold">Marketing Distribution Approvals</h2>
        </div>
        <p className="text-gray-500 text-sm mb-4 ml-8">
          When a marketing team member submits a distribution request, an email notification is sent to the officer below for approval.
        </p>

        {loading ? (
          <div className="animate-pulse h-12 bg-gray-800 rounded-lg" />
        ) : (
          <form onSubmit={handleSaveMarketing}>
            <label className="text-gray-400 text-sm mb-2 block">Marketing Approving Officer</label>

            <select
              value={marketingEmail}
              onChange={e => setMarketingEmail(e.target.value)}
              className="w-full min-w-0 bg-gray-800 text-white rounded-lg px-3 py-3 border border-gray-700 focus:border-purple-500 focus:outline-none text-sm mb-3 truncate"
            >
              <option value="">Select a user…</option>
              {users.map(u => (
                <option key={u.id} value={u.email}>
                  {u.name || u.email} — {u.email}
                </option>
              ))}
            </select>

            {selectedMarketingUser && (
              <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-white font-bold text-xs shrink-0">
                  {(selectedMarketingUser.name || selectedMarketingUser.email)[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium truncate">{selectedMarketingUser.name || selectedMarketingUser.email}</p>
                  <p className="text-gray-400 text-xs truncate">{selectedMarketingUser.email}</p>
                </div>
                <span className="ml-auto text-purple-400 text-xs font-medium shrink-0">Marketing Officer</span>
              </div>
            )}

            <button
              type="submit"
              disabled={savingMarketing}
              className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium transition-all"
            >
              {savingMarketing ? "Saving…" : "Save Marketing Settings"}
            </button>
          </form>
        )}
      </div>

      {/* Product ID Management */}
      <div className="bg-gray-900/80 rounded-xl border border-gray-800 p-5 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl">🏷️</span>
          <h2 className="text-white font-semibold">Product IDs</h2>
        </div>
        <p className="text-gray-500 text-sm mb-4 ml-8">
          Manage the Product ID codes and categories used to classify assets in Reports.
        </p>

        {loadingProductIds ? (
          <div className="animate-pulse h-12 bg-gray-800 rounded-lg" />
        ) : (
          <>
            <div className="rounded-lg border border-gray-800 overflow-hidden mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-800/60 text-gray-400 text-xs uppercase tracking-wide">
                    <th className="text-left px-3 py-2 font-medium">Code</th>
                    <th className="text-left px-3 py-2 font-medium">Category</th>
                    <th className="text-right px-3 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {productIds.map(p => (
                    <tr key={p.id} className="border-t border-gray-800">
                      {editingPId === p.id ? (
                        <>
                          <td className="px-3 py-2">
                            <input
                              value={editPIdCode}
                              onChange={e => setEditPIdCode(e.target.value)}
                              className="w-full bg-gray-800 text-white rounded-lg px-2 py-1.5 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              value={editPIdCategory}
                              onChange={e => setEditPIdCategory(e.target.value)}
                              className="w-full bg-gray-800 text-white rounded-lg px-2 py-1.5 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
                            />
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <button
                              onClick={() => handleSaveProductId(p.id)}
                              disabled={savingPId}
                              className="text-green-400 hover:text-green-300 text-xs font-medium mr-3 disabled:opacity-50"
                            >
                              {savingPId ? "Saving…" : "Save"}
                            </button>
                            <button
                              onClick={cancelEditProductId}
                              className="text-gray-500 hover:text-white text-xs font-medium"
                            >
                              Cancel
                            </button>
                          </td>
                        </>
                      ) : deletePIdTarget === p.id ? (
                        <td colSpan={3} className="px-3 py-2">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-red-400 text-xs">Delete {p.code} — {p.category}?</span>
                            <div className="flex gap-2 shrink-0">
                              <button
                                onClick={() => handleDeleteProductId(p.id)}
                                disabled={deletingPId}
                                className="text-red-400 hover:text-red-300 text-xs font-medium disabled:opacity-50"
                              >
                                {deletingPId ? "Deleting…" : "Yes, delete"}
                              </button>
                              <button
                                onClick={() => setDeletePIdTarget(null)}
                                className="text-gray-500 hover:text-white text-xs font-medium"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </td>
                      ) : (
                        <>
                          <td className="px-3 py-2 text-white font-medium">{p.code}</td>
                          <td className="px-3 py-2 text-gray-300">{p.category}</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <button
                              onClick={() => startEditProductId(p)}
                              className="text-blue-400 hover:text-blue-300 text-xs font-medium mr-3"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setDeletePIdTarget(p.id)}
                              className="text-red-400 hover:text-red-300 text-xs font-medium"
                            >
                              Delete
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                  {productIds.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-4 text-center text-gray-500 text-sm">
                        No Product IDs yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <form onSubmit={handleAddProductId} className="flex items-end gap-2 flex-wrap">
              <div className="min-w-0">
                <label className="text-gray-400 text-xs mb-1 block">Code</label>
                <input
                  value={newPIdCode}
                  onChange={e => setNewPIdCode(e.target.value)}
                  placeholder="P013"
                  required
                  className="w-28 bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
                />
              </div>
              <div className="min-w-0 flex-1">
                <label className="text-gray-400 text-xs mb-1 block">Category</label>
                <input
                  value={newPIdCategory}
                  onChange={e => setNewPIdCategory(e.target.value)}
                  placeholder="e.g. Accessories"
                  required
                  className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={addingPId || !newPIdCode.trim() || !newPIdCategory.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all shrink-0"
              >
                {addingPId ? "Adding…" : "+ Add"}
              </button>
            </form>
          </>
        )}
      </div>

      {/* Backup & Restore */}
      <div className="bg-gray-900/80 rounded-xl border border-gray-800 p-5 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl">🗄️</span>
          <h2 className="text-white font-semibold">Backup & Restore</h2>
        </div>
        <p className="text-gray-500 text-sm mb-4 ml-8">
          Download a full copy of your portal data for safekeeping.
        </p>

        <div className="flex flex-wrap gap-3 mb-4">
          <button
            onClick={handleExportBackup}
            disabled={backingUp}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium transition-all"
          >
            {backingUp ? "Exporting…" : "📥 Export Full Backup"}
          </button>
          <button
            onClick={handleExportBackupExcel}
            disabled={backingUpExcel}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium transition-all"
          >
            {backingUpExcel ? "Exporting…" : "📊 Export to Excel"}
          </button>
        </div>

        <p className="text-gray-500 text-xs">
          Backup includes all assets, users, borrows, issues, maintenance and settings data. Does not include passwords or authentication data.
        </p>
      </div>

    </div>
  )
}
