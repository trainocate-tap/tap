import { useState, useEffect, useRef } from "react"
import { supabase } from "../../lib/supabase"
import { useNavigate, useParams } from "react-router-dom"
import { motion } from "framer-motion"
import { logHistory } from "../../lib/logHistory"
import { useTranslation } from "react-i18next"
import { useAuth } from "../../context/AuthContext"
import { createNotification } from "../../lib/notifications"
import { DEPARTMENTS } from "../../lib/departments"

const COUNTRIES = ["Singapore", "Malaysia", "Thailand", "Indonesia", "Philippines", "Vietnam", "Taiwan", "Hong Kong", "India", "Japan", "Sri Lanka", "Gulf (UAE)"]

export default function EditAsset() {
  const { t } = useTranslation()
  const { userProfile } = useAuth()
  const navigate = useNavigate()
  const { id } = useParams()
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [success, setSuccess] = useState(false)
  const [users, setUsers] = useState([])
  const [userSearch, setUserSearch] = useState("")
  const [showUserDropdown, setShowUserDropdown] = useState(false)
  const userDropdownRef = useRef(null)

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    const { data } = await supabase.from("user_profiles").select("id, name, email").order("name")
    setUsers(data || [])
  }

  useEffect(() => {
    if (!showUserDropdown) return
    const handler = (e) => {
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target))
        setShowUserDropdown(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [showUserDropdown])
  const [form, setForm] = useState({
    name: "", category: "", brand_model: "", serial_number: "",
    asset_tag: "", location: "", assigned_user: "", department: "",
    status: "available", purchase_date: "", purchase_price: "",
    useful_life: 5,
    warranty_expiry: "", license_key: "", license_seats: "", license_expiry: "", licensed_to: "",
    remarks: "", country: "Singapore",
  })
  const originalAssetRef = useRef(null)

  useEffect(() => {
    fetchAsset()
  }, [id])

  const fetchAsset = async () => {
    const { data } = await supabase.from("assets").select("*").eq("id", id).single()
    if (data) {
      originalAssetRef.current = data
      setForm({
        name: data.name || "",
        category: data.category || "",
        brand_model: data.brand_model || "",
        serial_number: data.serial_number || "",
        asset_tag: data.asset_tag || "",
        location: data.location || "",
        assigned_user: data.assigned_user || "",
        department: data.department || "",
        status: data.status || "available",
        purchase_date: data.purchase_date || "",
        purchase_price: data.purchase_price || "",
        useful_life: data.useful_life || 5,
        warranty_expiry: data.warranty_expiry || "",
        license_key: data.license_key || "",
        license_seats: data.license_seats || "",
        license_expiry: data.license_expiry || "",
        licensed_to: data.licensed_to || "",
        remarks: data.remarks || "",
        country: data.country || "Singapore",
      })
    }
    setFetching(false)
  }

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    const cleanForm = {
      name: form.name,
      status: form.status,
      country: form.country || "Singapore",
      serial_number: form.serial_number.trim() || null,
      asset_tag: form.asset_tag.trim() || null,
    }
    if (form.category) cleanForm.category = form.category
    if (form.brand_model) cleanForm.brand_model = form.brand_model
    if (form.location) cleanForm.location = form.location
    cleanForm.assigned_user = form.assigned_user.trim() || null
    if (form.department) cleanForm.department = form.department
    if (form.purchase_date) cleanForm.purchase_date = form.purchase_date
    if (form.purchase_price) cleanForm.purchase_price = parseFloat(form.purchase_price)
    cleanForm.useful_life = form.useful_life ? parseInt(form.useful_life) : 5
    const isSoftware = form.category === "Software License"
    if (!isSoftware && form.warranty_expiry) cleanForm.warranty_expiry = form.warranty_expiry
    if (isSoftware) {
      cleanForm.warranty_expiry = null
      if (form.license_key) cleanForm.license_key = form.license_key
      if (form.license_seats) cleanForm.license_seats = parseInt(form.license_seats)
      if (form.license_expiry) cleanForm.license_expiry = form.license_expiry
      if (form.licensed_to) cleanForm.licensed_to = form.licensed_to
    } else {
      if (form.license_expiry) cleanForm.license_expiry = form.license_expiry
    }
    if (form.remarks) cleanForm.remarks = form.remarks

    if (form.status === "borrowed" && originalAssetRef.current?.status !== "borrowed") {
      cleanForm.prev_borrower = originalAssetRef.current?.assigned_user || null
    }

    const { error } = await supabase.from("assets").update(cleanForm).eq("id", id)
    if (!error) {
      await logHistory(id, "Updated", `Asset "${form.name}" details were updated`)
      createNotification(userProfile?.id, "✏️ Asset Updated", `Asset "${form.name}" was updated`, "info", userProfile?.country)
      setSuccess(true)
      setTimeout(() => navigate("/admin/assets"), 2000)
    } else {
      const msg = error.message || ""
      if (msg.includes("serial_number")) {
        alert(`Serial number "${form.serial_number}" already exists on another asset.`)
      } else if (msg.includes("asset_tag")) {
        alert(`Asset tag "${form.asset_tag}" already exists on another asset.`)
      } else {
        alert(msg)
      }
    }
    setLoading(false)
  }

  const isSoftwareEdit = form.category === "Software License"

  const baseFields = [
    { name: "name", label: "Asset Name *", placeholder: "e.g. Dell XPS 13", required: true },
    { name: "category", label: "Category", placeholder: "e.g. Laptop, Monitor" },
    { name: "brand_model", label: "Brand / Model", placeholder: "e.g. Dell XPS 13 9310" },
    { name: "serial_number", label: "Serial Number", placeholder: "e.g. ABC123XYZ" },
    { name: "asset_tag", label: "Asset Tag", placeholder: "e.g. COM/2024/0001" },
    { name: "location", label: "Location", placeholder: "e.g. Level 19, Singapore" },
    { name: "purchase_date", label: "Purchase Date", type: "date" },
    { name: "purchase_price", label: "Purchase Price (SGD)", placeholder: "e.g. 1500", type: "number" },
    { name: "useful_life", label: "Useful Life (years)", placeholder: "e.g. 5", type: "number", min: 1, max: 50 },
    ...(!isSoftwareEdit ? [{ name: "warranty_expiry", label: "Warranty Expiry", type: "date" }] : []),
    ...(isSoftwareEdit ? [
      { name: "license_key", label: "License Key", placeholder: "e.g. XXXXX-XXXXX-XXXXX" },
      { name: "license_seats", label: "Number of Seats", placeholder: "e.g. 10", type: "number" },
      { name: "license_expiry", label: "License Expiry Date", type: "date" },
      { name: "licensed_to", label: "Licensed To", placeholder: "e.g. Trainocate Singapore" },
    ] : []),
  ]

  if (fetching) return <div className="p-8 text-white">Loading asset...</div>

  if (success) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 200 }}
        className="text-center"
      >
        <div className="text-8xl mb-6">✏️</div>
        <h2 className="text-3xl font-bold text-white mb-2">Asset Updated!</h2>
        <p className="text-gray-400">Redirecting to assets...</p>
      </motion.div>
    </div>
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 md:p-8 max-w-3xl"
    >
      <button
        onClick={() => navigate("/admin/assets")}
        className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-all"
      >
        ← Back to Assets
      </button>

      <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">Edit Asset</h1>
      <p className="text-gray-400 mb-8">Update the asset details below</p>

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

          {/* Assigned To / Borrowed By — searchable user dropdown */}
          <div className="relative" ref={userDropdownRef}>
            <label className="text-gray-400 text-sm mb-2 block">{form.status === "borrowed" ? "Borrowed By" : "Assigned To"}</label>
            <input
              type="text"
              value={showUserDropdown ? userSearch : form.assigned_user}
              onChange={(e) => { setUserSearch(e.target.value); setShowUserDropdown(true) }}
              onFocus={() => { setUserSearch(""); setShowUserDropdown(true) }}
              placeholder={form.status === "borrowed" ? "Search borrower..." : "Search user..."}
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
            />
            {form.assigned_user && !showUserDropdown && (
              <button
                type="button"
                onClick={() => { setForm({ ...form, assigned_user: "" }); setUserSearch("") }}
                className="absolute right-3 top-10 text-gray-500 hover:text-white text-xs"
              >✕</button>
            )}
            {showUserDropdown && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl max-h-52 overflow-y-auto">
                {users
                  .filter(u => {
                    const q = userSearch.toLowerCase()
                    return !q || (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q)
                  })
                  .map(u => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setForm({ ...form, assigned_user: u.name || u.email })
                        setShowUserDropdown(false)
                        setUserSearch("")
                      }}
                      className="w-full text-left px-4 py-2.5 hover:bg-gray-700 text-sm"
                    >
                      <span className="text-white">{u.name}</span>
                      {u.email && <span className="text-gray-400 ml-2 text-xs">{u.email}</span>}
                    </button>
                  ))
                }
                {users.filter(u => {
                  const q = userSearch.toLowerCase()
                  return !q || (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q)
                }).length === 0 && (
                  <div className="px-4 py-3 text-gray-500 text-sm">No users found</div>
                )}
              </div>
            )}
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
              <option value="borrowed">Borrowed</option>
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
          <div>
            <label className="text-gray-400 text-sm mb-2 block">Country</label>
            <select
              name="country"
              value={form.country}
              onChange={handleChange}
              className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
            >
              {COUNTRIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
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
            {loading ? "Saving..." : "Update Asset"}
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