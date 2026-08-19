import { useState, useEffect, useRef } from "react"
import { supabase } from "../../lib/supabase"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { logHistory } from "../../lib/logHistory"
import { useTranslation } from "react-i18next"
import { useAuth } from "../../context/AuthContext"
import { createNotification } from "../../lib/notifications"
import { DEPARTMENTS } from "../../lib/departments"
import { useCurrency } from "../../lib/useCurrency"

const COUNTRIES = ["Singapore", "Malaysia", "Thailand", "Indonesia", "Philippines", "Vietnam", "Taiwan", "Hong Kong", "India", "Japan", "Sri Lanka", "Gulf (UAE)"]

function AnimatedError({ message, onDismiss }) {
  if (!message) return null
  return (
    <div style={{
      animation: "slideInFromTop 0.3s ease-out",
      background: "rgba(239,68,68,0.1)",
      border: "1px solid rgba(239,68,68,0.4)",
      borderRadius: "12px",
      padding: "12px 16px",
      marginBottom: "16px",
      display: "flex",
      alignItems: "center",
      gap: "10px",
      boxShadow: "0 0 20px rgba(239,68,68,0.15)"
    }}>
      <style>{`@keyframes slideInFromTop { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <span style={{fontSize:"18px"}}>⚠️</span>
      <span style={{color:"#fca5a5",fontSize:"14px",flex:1}}>{message}</span>
      <button onClick={onDismiss} style={{color:"#9ca3af",background:"none",border:"none",cursor:"pointer",fontSize:"16px"}}>✕</button>
    </div>
  )
}

export default function AddAsset() {
  const { t } = useTranslation()
  const { userCountry, userProfile, isStandardUser, isGuest } = useAuth()
  const { currency } = useCurrency()
  const navigate = useNavigate()

  useEffect(() => {
    if (isStandardUser || isGuest) navigate("/admin/assets", { replace: true })
  }, [isStandardUser, isGuest, navigate])

  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [assetName, setAssetName] = useState("")
  const [serialError, setSerialError] = useState("")
  const [formError, setFormError] = useState("")
  const [users, setUsers] = useState([])
  const [userSearch, setUserSearch] = useState("")
  const [showUserDropdown, setShowUserDropdown] = useState(false)
  const userDropdownRef = useRef(null)

  useEffect(() => {
    supabase.from("user_profiles").select("id, name, email").order("name").then(({ data }) => setUsers(data || []))
  }, [])

  useEffect(() => {
    if (!showUserDropdown) return
    const handler = (e) => { if (userDropdownRef.current && !userDropdownRef.current.contains(e.target)) setShowUserDropdown(false) }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [showUserDropdown])
  const [form, setForm] = useState({
    name: "", category: "", brand_model: "", serial_number: "",
    asset_tag: "", location: "", assigned_user: "", department: "",
    status: "available", purchase_date: "", purchase_price: "",
    useful_life: 5,
    warranty_expiry: "", license_key: "", license_seats: "",
    license_expiry: "", licensed_to: "", remarks: "",
    country: userCountry || "Singapore",
  })

  const isSoftware = form.category === "Software License"

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    const cleanForm = {
      name: form.name,
      country: form.country || "Singapore",
      status: form.status,
      // Explicitly null out unique fields when blank so the DB never stores ""
      serial_number: form.serial_number.trim() || null,
      asset_tag: form.asset_tag.trim() || null,
    }
    if (form.category) cleanForm.category = form.category
    if (form.brand_model) cleanForm.brand_model = form.brand_model
    if (form.location) cleanForm.location = form.location
    if (form.assigned_user) cleanForm.assigned_user = form.assigned_user
    if (form.department) cleanForm.department = form.department
    if (form.purchase_date) cleanForm.purchase_date = form.purchase_date
    if (form.purchase_price) cleanForm.purchase_price = parseFloat(form.purchase_price)
    cleanForm.useful_life = form.useful_life ? parseInt(form.useful_life) : 5
    if (!isSoftware && form.warranty_expiry) cleanForm.warranty_expiry = form.warranty_expiry
    if (isSoftware && form.license_expiry) cleanForm.license_expiry = form.license_expiry
    if (isSoftware && form.license_key) cleanForm.license_key = form.license_key
    if (isSoftware && form.license_seats) cleanForm.license_seats = parseInt(form.license_seats)
    if (isSoftware && form.licensed_to) cleanForm.licensed_to = form.licensed_to
    if (form.remarks) cleanForm.remarks = form.remarks

    const { data, error } = await supabase.from("assets").insert([cleanForm]).select().single()
    if (!error && data) {
      await logHistory(data.id, "Created", `Asset "${data.name}" was added to Trainocate Asset Portal`)
      createNotification(userProfile?.id, "✅ Asset Added", `Asset "${data.name}" was added`, "success", userProfile?.country)
      setAssetName(data.name)
      setSuccess(true)
      setTimeout(() => navigate("/admin/assets"), 3000)
    } else {
      const msg = error?.message || ""
      if (msg.includes("serial_number")) {
        setSerialError(`Serial number "${form.serial_number}" already exists!`)
        setTimeout(() => setSerialError(""), 5000)
      } else if (msg.includes("asset_tag")) {
        setFormError(`Asset tag "${form.asset_tag}" already exists. Please use a different asset tag or leave it blank.`)
        setTimeout(() => setFormError(""), 5000)
      } else {
        setFormError(msg || "Failed to save asset")
        setTimeout(() => setFormError(""), 5000)
      }
    }
    setLoading(false)
  }

  const baseFields = [
    { name: "name", label: "Asset Name *", placeholder: "e.g. Dell XPS 13", required: true },
    { name: "brand_model", label: "Brand / Model", placeholder: "e.g. Dell XPS 13 9310" },
    { name: "serial_number", label: "Serial Number", placeholder: "e.g. ABC123XYZ" },
    { name: "asset_tag", label: "Asset Tag", placeholder: "e.g. COM/2024/0001" },
    { name: "location", label: "Location", placeholder: "e.g. Level 19, Singapore" },
    { name: "purchase_date", label: "Purchase Date", type: "date" },
    { name: "purchase_price", label: `Purchase Price (${currency})`, placeholder: "e.g. 1500", type: "number" },
    { name: "useful_life", label: "Useful Life (years)", placeholder: "e.g. 5", type: "number", min: 1, max: 50 },
  ]

  if (success) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center relative overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-green-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        {["🎊", "🎉", "✨", "🎊", "🎉", "✨", "🎊"].map((emoji, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 100, x: (i - 3) * 80 }}
            animate={{ opacity: [0, 1, 1, 0], y: -200 }}
            transition={{ delay: i * 0.15, duration: 2, ease: "easeOut" }}
            className="absolute text-3xl"
            style={{ left: `${15 + i * 12}%`, bottom: "20%" }}
          >
            {emoji}
          </motion.div>
        ))}

        <motion.div
          initial={{ opacity: 0, scale: 0.5, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 150, damping: 15 }}
          className="relative z-10 text-center"
        >
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="inline-flex items-center justify-center w-28 h-28 bg-green-500/20 border-2 border-green-500/50 rounded-full mb-6"
            style={{ boxShadow: "0 0 40px rgba(34, 197, 94, 0.3)" }}
          >
            <span className="text-6xl">✅</span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-4xl font-bold text-white mb-3"
          >
            Asset Added!
          </motion.h2>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-gray-400 text-lg mb-2"
          >
            {assetName} has been registered successfully
          </motion.p>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="text-gray-600 text-sm"
          >
            Redirecting to assets...
          </motion.p>

          <motion.div className="mt-6 w-48 mx-auto h-1 bg-gray-800 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: "100%" }}
              transition={{ duration: 3, ease: "linear" }}
              className="h-full bg-green-500 rounded-full"
            />
          </motion.div>
        </motion.div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 md:p-8 max-w-3xl"
    >
      {/* Serial Number Error Popup */}
      <AnimatePresence>
        {serialError && (
          <motion.div
            initial={{ opacity: 0, y: -60 }}
            animate={{ opacity: 1, y: 0, x: [0, -8, 8, -6, 6, -3, 3, 0] }}
            exit={{ opacity: 0, y: -60 }}
            transition={{ duration: 0.4, x: { duration: 0.5, delay: 0.2 } }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4"
          >
            <div style={{
              background: "rgba(10,14,30,0.96)", backdropFilter: "blur(14px)",
              border: "1.5px solid rgba(239,68,68,0.7)",
              boxShadow: "0 0 24px rgba(239,68,68,0.4), 0 0 60px rgba(239,68,68,0.15)",
              borderRadius: 16, padding: "14px 18px",
            }}>
              <div className="flex items-center gap-3">
                <span className="text-2xl shrink-0">⚠️</span>
                <div className="flex-1">
                  <p className="text-white text-sm font-semibold">Serial number already exists!</p>
                  <p className="text-red-400 text-xs mt-0.5">{serialError}</p>
                </div>
                <button onClick={() => setSerialError("")} className="text-gray-500 hover:text-white text-sm">✕</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => navigate("/admin/assets")}
        className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-all"
      >
        ← Back to Assets
      </button>

      <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">Add New Asset</h1>
      <p className="text-gray-400 mb-8">Fill in the details to register a new asset</p>

      <AnimatedError message={formError} onDismiss={() => setFormError("")} />

      <form onSubmit={handleSubmit} className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {baseFields.map((field) => (
            <div key={field.name}>
              <label className="text-gray-400 text-sm mb-2 block">{field.label}</label>
              <input
                type={field.type || "text"}
                name={field.name}
                value={form[field.name]}
                onChange={handleChange}
                placeholder={field.placeholder}
                required={field.required}
                min={field.min}
                max={field.max}
                className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
              />
            </div>
          ))}

          <div>
            <label className="text-gray-400 text-sm mb-2 block">Category</label>
            <select
              name="category"
              value={form.category}
              onChange={handleChange}
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
            >
              <option value="">Select category…</option>
              {["Laptop","Desktop","Monitor","Printer","Server","Networking","Mobile Device","Tablet","Peripheral","Software License","Furniture","Other"].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-gray-400 text-sm mb-2 block">Status</label>
            <select
              name="status"
              value={form.status}
              onChange={handleChange}
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
            >
              <option value="available">Unassigned</option>
              <option value="assigned">Assigned</option>
              <option value="maintenance">Maintenance</option>
              <option value="retired">Retired</option>
            </select>
          </div>

          <div>
            <label className="text-gray-400 text-sm mb-2 block">Department</label>
            <select
              name="department"
              value={form.department}
              onChange={handleChange}
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
            >
              <option value="">Select department…</option>
              {DEPARTMENTS.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Assigned To — searchable dropdown, shown when status is assigned */}
          {form.status === "assigned" && <div className="relative" ref={userDropdownRef}>
            <label className="text-gray-400 text-sm mb-2 block">Assigned To{form.status === "assigned" ? " *" : ""}</label>
            <input
              type="text"
              value={showUserDropdown ? userSearch : form.assigned_user}
              onChange={e => { setUserSearch(e.target.value); setShowUserDropdown(true) }}
              onFocus={() => { setUserSearch(""); setShowUserDropdown(true) }}
              placeholder={form.status === "assigned" ? "Search user..." : "Optional — search user..."}
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
            />
            {form.assigned_user && !showUserDropdown && (
              <button type="button" onClick={() => { setForm({ ...form, assigned_user: "" }); setUserSearch("") }}
                className="absolute right-3 top-10 text-gray-500 hover:text-white text-xs">✕</button>
            )}
            {showUserDropdown && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl max-h-52 overflow-y-auto">
                {users.filter(u => { const q = userSearch.toLowerCase(); return !q || (u.name||"").toLowerCase().includes(q) || (u.email||"").toLowerCase().includes(q) })
                  .map(u => (
                    <button key={u.id} type="button"
                      onClick={() => { setForm({ ...form, assigned_user: u.name || u.email, status: "assigned" }); setShowUserDropdown(false); setUserSearch("") }}
                      className="w-full text-left px-4 py-2.5 hover:bg-gray-700 text-sm">
                      <span className="text-white">{u.name}</span>
                      {u.email && <span className="text-gray-400 ml-2 text-xs">{u.email}</span>}
                    </button>
                  ))}
                {users.filter(u => { const q = userSearch.toLowerCase(); return !q || (u.name||"").toLowerCase().includes(q) || (u.email||"").toLowerCase().includes(q) }).length === 0 && (
                  <div className="px-4 py-3 text-gray-500 text-sm">No users found</div>
                )}
              </div>
            )}
          </div>}

          {/* Dynamic fields based on category */}
          <AnimatePresence mode="wait">
            {!isSoftware && (
              <motion.div key="warranty" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25 }} style={{ overflow: "hidden" }}>
                <label className="text-gray-400 text-sm mb-2 block">Warranty Expiry</label>
                <input type="date" name="warranty_expiry" value={form.warranty_expiry} onChange={handleChange}
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm" />
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {isSoftware && (
              <motion.div key="license_key" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25 }} style={{ overflow: "hidden" }}>
                <label className="text-gray-400 text-sm mb-2 block">License Key</label>
                <input type="text" name="license_key" value={form.license_key} onChange={handleChange}
                  placeholder="e.g. XXXXX-XXXXX-XXXXX"
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm" />
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {isSoftware && (
              <motion.div key="license_seats" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25 }} style={{ overflow: "hidden" }}>
                <label className="text-gray-400 text-sm mb-2 block">Number of Seats</label>
                <input type="number" name="license_seats" value={form.license_seats} onChange={handleChange}
                  placeholder="e.g. 10"
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm" />
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {isSoftware && (
              <motion.div key="license_expiry" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25 }} style={{ overflow: "hidden" }}>
                <label className="text-gray-400 text-sm mb-2 block">License Expiry Date</label>
                <input type="date" name="license_expiry" value={form.license_expiry} onChange={handleChange}
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm" />
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {isSoftware && (
              <motion.div key="licensed_to" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25 }} style={{ overflow: "hidden" }}>
                <label className="text-gray-400 text-sm mb-2 block">Licensed To</label>
                <input type="text" name="licensed_to" value={form.licensed_to} onChange={handleChange}
                  placeholder="e.g. Trainocate Singapore"
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm" />
              </motion.div>
            )}
          </AnimatePresence>

          <div>
            <label className="text-gray-400 text-sm mb-2 block">Country</label>
            <div className="w-full bg-gray-800/50 text-gray-300 rounded-lg px-4 py-3 border border-gray-700/50 text-sm flex items-center gap-2">
              <span>🌏</span>
              <span>{form.country}</span>
              <span className="ml-auto text-gray-600 text-xs">Auto-assigned</span>
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="text-gray-400 text-sm mb-2 block">Remarks</label>
            <textarea
              name="remarks"
              value={form.remarks}
              onChange={handleChange}
              placeholder="Any additional notes..."
              rows={3}
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm resize-none"
            />
          </div>
        </div>

        <div className="mt-6 flex gap-4">
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-lg transition-all"
          >
            {loading ? "Saving..." : "Save Asset"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/admin/assets")}
            className="bg-gray-800 hover:bg-gray-700 text-white px-8 py-3 rounded-lg transition-all"
          >
            Cancel
          </button>
        </div>
      </form>
    </motion.div>
  )
}