import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../../lib/supabase"
import { useAuth } from "../../context/AuthContext"
import { motion, AnimatePresence } from "framer-motion"

const CATEGORIES = ["Merchandise", "Flyer", "Gift", "Event Material", "Banner", "Other"]

const categoryColors = {
  Merchandise:     "bg-purple-500/20 text-purple-400 border-purple-500/30",
  Flyer:           "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Gift:            "bg-pink-500/20 text-pink-400 border-pink-500/30",
  "Event Material":"bg-orange-500/20 text-orange-400 border-orange-500/30",
  Banner:          "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  Other:           "bg-gray-500/20 text-gray-400 border-gray-500/30",
}

export default function Marketing() {
  const navigate = useNavigate()
  const { isMarketing, isAdmin } = useAuth()
  const [items, setItems] = useState([])
  const [distributions, setDistributions] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filterCategory, setFilterCategory] = useState("All")

  useEffect(() => {
    fetchAll()
  }, [])

  const fetchAll = async () => {
    setLoading(true)
    const [{ data: itemData }, { data: distData }] = await Promise.all([
      supabase.from("marketing_items").select("*").order("created_at", { ascending: false }),
      supabase.from("marketing_distributions").select("item_id, quantity, status"),
    ])
    setItems(itemData || [])
    setDistributions(distData || [])
    setLoading(false)
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

  const getDistributedQty = (itemId) =>
    distributions
      .filter(d => d.item_id === itemId && d.status === "approved")
      .reduce((sum, d) => sum + (d.quantity || 0), 0)

  const getPendingCount = (itemId) =>
    distributions.filter(d => d.item_id === itemId && d.status === "pending").length

  const getAvailableStock = (item) =>
    (item.opening_stock || 0) + (item.total_purchased || 0) - (item.damaged_quantity || 0)

  const getClosingStock = (item) =>
    getAvailableStock(item) - (item.reserved_stock || 0) - getDistributedQty(item.id)

  const filtered = items.filter(item => {
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase()) ||
      (item.vendor || "").toLowerCase().includes(search.toLowerCase())
    const matchCategory = filterCategory === "All" || item.category === filterCategory
    return matchSearch && matchCategory
  })

  return (
    <div className="p-3 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">🎯 Marketing Items</h1>
          <p className="text-gray-400 mt-1 text-base">{items.length} item{items.length !== 1 ? "s" : ""} tracked</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate("/admin/marketing/new")}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-base font-medium self-start md:self-auto"
        >
          + Add Item
        </motion.button>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or vendor…"
          className="flex-1 bg-gray-900/80 text-white rounded-xl px-4 py-2.5 border border-gray-800 focus:border-blue-500 focus:outline-none text-base"
        />
        <div className="flex gap-2 flex-wrap">
          {["All", ...CATEGORIES].map(cat => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                filterCategory === cat
                  ? "bg-blue-600 border-blue-500 text-white"
                  : "bg-gray-900/80 border-gray-800 text-gray-400 hover:text-white"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Items Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-gray-900/80 rounded-xl border border-gray-800 p-5 animate-pulse h-48" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <span className="text-5xl mb-4 block">🎯</span>
          <p className="text-gray-400 text-base">
            {search || filterCategory !== "All" ? "No items match your filters." : "No marketing items yet. Add your first item!"}
          </p>
        </div>
      ) : (
        <AnimatePresence>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((item, i) => {
              const available = getAvailableStock(item)
              const closing = getClosingStock(item)
              const distributed = getDistributedQty(item.id)
              const pending = getPendingCount(item.id)
              const lowStock = closing <= 5

              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => navigate(`/admin/marketing/${item.id}`)}
                  className="bg-gray-900/80 rounded-xl border border-gray-800 p-5 cursor-pointer hover:border-blue-500/40 hover:bg-gray-900 transition-all group"
                >
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <h3 className="text-white font-semibold text-base group-hover:text-blue-400 transition-colors truncate">
                        {item.name}
                      </h3>
                      {item.vendor && (
                        <p className="text-gray-500 text-sm mt-0.5 truncate">{item.vendor}</p>
                      )}
                    </div>
                    <span className={`text-sm px-2 py-0.5 rounded-full border font-medium shrink-0 ${categoryColors[item.category] || categoryColors.Other}`}>
                      {item.category}
                    </span>
                  </div>

                  {/* Stock grid */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-gray-800/60 rounded-lg p-2 text-center">
                      <p className="text-gray-500 text-[10px] mb-0.5">Available</p>
                      <p className="text-white font-bold text-base">{available}</p>
                      <p className="text-gray-600 text-[10px]">{item.unit_of_measurement}</p>
                    </div>
                    <div className="bg-gray-800/60 rounded-lg p-2 text-center">
                      <p className="text-gray-500 text-[10px] mb-0.5">Distributed</p>
                      <p className="text-blue-400 font-bold text-base">{distributed}</p>
                      <p className="text-gray-600 text-[10px]">{item.unit_of_measurement}</p>
                    </div>
                    <div className={`rounded-lg p-2 text-center ${lowStock ? "bg-red-500/10" : "bg-gray-800/60"}`}>
                      <p className="text-gray-500 text-[10px] mb-0.5">Closing</p>
                      <p className={`font-bold text-base ${lowStock ? "text-red-400" : "text-green-400"}`}>{closing}</p>
                      <p className="text-gray-600 text-[10px]">{item.unit_of_measurement}</p>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between">
                    {item.cost_per_unit != null ? (
                      <p className="text-gray-500 text-sm">S${Number(item.cost_per_unit).toFixed(2)} / {item.unit_of_measurement}</p>
                    ) : (
                      <span />
                    )}
                    <div className="flex gap-1.5">
                      {lowStock && (
                        <span className="text-sm px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 font-medium">
                          Low Stock
                        </span>
                      )}
                      {pending > 0 && (
                        <span className="text-sm px-2 py-0.5 rounded-full bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 font-medium">
                          {pending} pending
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </AnimatePresence>
      )}
    </div>
  )
}
