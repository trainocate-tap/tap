import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../../lib/supabase"
import { Html5Qrcode } from "html5-qrcode"
import { motion, AnimatePresence } from "framer-motion"
import { EmptyState } from "../../components/EmptyState"
import { statusLabel } from "../../lib/statusLabel"
import { useAuth } from "../../context/AuthContext"

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      // Strip the data URL prefix to get raw base64
      const base64 = reader.result.split(",")[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function Scanner() {
  const navigate = useNavigate()
  const { userProfile } = useAuth()

  // Tab: "qr" | "photo"
  const [tab, setTab] = useState("qr")

  // --- QR / Barcode state ---
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState(null)
  const [asset, setAsset] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [manualInput, setManualInput] = useState("")
  const [isManualSearch, setIsManualSearch] = useState(false)
  const scannerRef = useRef(null)

  // --- Asset cache for fast QR lookup ---
  const assetCache = useRef(null) // Map<id, asset>
  const assetBySerial = useRef(null) // Map<serial_lower, asset>

  useEffect(() => {
    if (!userProfile) return
    // Pre-fetch all assets into memory cache for instant QR lookup
    supabase.from("assets").select("*").then(({ data }) => {
      if (!data) return
      const byId = new Map()
      const bySerial = new Map()
      data.forEach(a => {
        byId.set(a.id, a)
        if (a.serial_number) bySerial.set(a.serial_number.toLowerCase().trim(), a)
        if (a.asset_tag) bySerial.set(a.asset_tag.toLowerCase().trim(), a)
      })
      assetCache.current = byId
      assetBySerial.current = bySerial
    })
  }, [userProfile])

  // --- Photo Scan state ---
  const [photoPreview, setPhotoPreview] = useState(null)
  const [photoFile, setPhotoFile] = useState(null)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [photoError, setPhotoError] = useState("")
  const [photoMatches, setPhotoMatches] = useState([])
  const [identified, setIdentified] = useState(null) // Claude's parsed result
  const photoInputRef = useRef()

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {})
      }
    }
  }, [])

  const switchTab = async (newTab) => {
    if (newTab === tab) return
    if (scanning) {
      await stopScanning()
    }
    setTab(newTab)
    setAsset(null)
    setError("")
    setResult(null)
    setManualInput("")
    setPhotoPreview(null)
    setPhotoFile(null)
    setPhotoMatches([])
    setPhotoError("")
    setIdentified(null)
  }

  // ─── QR / Barcode ────────────────────────────────────────────────────────────

  const startScanning = async () => {
    setError("")
    setResult(null)
    setAsset(null)
    setScanning(true)
    try {
      const scanner = new Html5Qrcode("qr-reader")
      scannerRef.current = scanner
      await scanner.start(
        { facingMode: "environment" },
        { fps: 30, qrbox: { width: 300, height: 300 } },
        async (decodedText) => {
          await scanner.stop()
          setScanning(false)
          setResult(decodedText)
          await handleScanResult(decodedText)
        },
        () => {}
      )
    } catch {
      setError("Could not access camera. Please allow camera access and try again.")
      setScanning(false)
    }
  }

  const stopScanning = async () => {
    if (scannerRef.current) {
      await scannerRef.current.stop().catch(() => {})
      scannerRef.current = null
    }
    setScanning(false)
  }

  const handleScanResult = async (text) => {
    setLoading(true)
    setAsset(null)

    let assetId = null
    if (text.includes("/admin/assets/")) {
      assetId = text.split("/admin/assets/")[1]
    }

    if (assetId) {
      // Try cache first — instant
      const cached = assetCache.current?.get(assetId)
      if (cached) {
        setAsset(cached)
        setLoading(false)
        return
      }
      const { data } = await supabase.from("assets").select("*").eq("id", assetId).single()
      if (data) setAsset(data)
      else setError("Asset not found in Trainocate Asset Portal database.")
    } else {
      // Try serial/tag cache
      const key = text.trim().toLowerCase()
      const cached = assetBySerial.current?.get(key)
      if (cached) {
        setAsset(cached)
        setLoading(false)
        return
      }
      // Fallback partial search
      const { data } = await supabase
        .from("assets").select("*")
        .ilike("serial_number", `%${text.trim()}%`).limit(1).single()
      if (data) setAsset(data)
      else setError(`No asset found with barcode: "${text}". Try manual search below.`)
    }
    setLoading(false)
  }

  const handleManualSearch = async (e) => {
    e.preventDefault()
    if (!manualInput.trim()) return
    setLoading(true)
    setError("")
    setAsset(null)
    setResult(manualInput)
    setIsManualSearch(true)

    // Always query the database directly — the in-memory cache is unreliable
    // on mobile (userProfile / cache pre-fetch can lag or fail there).
    const { data } = await supabase
      .from("assets").select("*")
      .or(`serial_number.ilike.%${manualInput}%,asset_tag.ilike.%${manualInput}%,name.ilike.%${manualInput}%`)
      .limit(1).single()
    if (data) setAsset(data)
    else setError(`No asset found matching "${manualInput}"`)
    setLoading(false)
  }

  // ─── Photo Scan ──────────────────────────────────────────────────────────────

  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
    setPhotoMatches([])
    setPhotoError("")
    setIdentified(null)
    setAsset(null)
  }

  const handlePhotoScan = async () => {
    if (!photoFile) return
    setPhotoLoading(true)
    setPhotoError("")
    setPhotoMatches([])
    setAsset(null)
    setIdentified(null)

    try {
      const base64 = await fileToBase64(photoFile)

      const { data, error: fnError } = await supabase.functions.invoke("identify-asset", {
        body: { image: base64, mediaType: photoFile.type },
      })

      if (fnError) throw new Error(fnError.message || "Edge function error")
      if (data?.error) throw new Error(data.error)

      if (data?.unclear) {
        setPhotoError("Photo not clear enough — please try again with better lighting!")
        setPhotoLoading(false)
        return
      }

      setIdentified(data)

      // Build search queries from most → least specific
      const matches = await searchByIdentification(data)

      if (matches.length === 1) {
        // Single match → navigate via full page load to avoid blank page
        window.location.href = `/admin/assets/${matches[0].id}`
        return
      } else if (matches.length > 1) {
        setPhotoMatches(matches)
      } else {
        setPhotoError("Asset not found in system — try scanning QR code or search manually")
      }
    } catch (err) {
      console.error("[PhotoScan]", err)
      setPhotoError("Could not upload photo — please try again!")
    }

    setPhotoLoading(false)
  }

  const searchByIdentification = async ({ serial_number, asset_tag, brand, model, device_type }) => {
    const results = new Map()

    // 1. Exact serial number
    if (serial_number) {
      const { data } = await supabase.from("assets").select("*")
        .ilike("serial_number", serial_number.trim())
      data?.forEach(a => results.set(a.id, a))
    }

    // 2. Exact asset tag
    if (asset_tag) {
      const { data } = await supabase.from("assets").select("*")
        .ilike("asset_tag", asset_tag.trim())
      data?.forEach(a => results.set(a.id, a))
    }

    // 3. Brand + model partial match (only if serial/tag gave nothing)
    if (results.size === 0 && brand && model) {
      const { data } = await supabase.from("assets").select("*")
        .ilike("brand_model", `%${brand}%`)
        .ilike("name", `%${model}%`)
      data?.forEach(a => results.set(a.id, a))
    }

    // 4. Brand + device_type fallback
    if (results.size === 0 && brand) {
      const { data } = await supabase.from("assets").select("*")
        .or(`brand_model.ilike.%${brand}%,name.ilike.%${brand}%`)
        .limit(10)
      data?.forEach(a => results.set(a.id, a))
    }

    return [...results.values()]
  }

  const resetPhoto = () => {
    setPhotoFile(null)
    setPhotoPreview(null)
    setPhotoMatches([])
    setPhotoError("")
    setIdentified(null)
    setAsset(null)
    if (photoInputRef.current) photoInputRef.current.value = ""
  }

  // ─── Shared UI helpers ───────────────────────────────────────────────────────

  const statusColor = {
    available: "bg-green-500/20 text-green-400 border-green-500/30",
    assigned: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    maintenance: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    retired: "bg-red-500/20 text-red-400 border-red-500/30",
  }

  const AssetCard = ({ a, onReset, isManual }) => (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ type: "spring", stiffness: 200 }}
      className="bg-gray-900/80 rounded-2xl border border-gray-800 p-6"
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">✅</span>
            <p className="text-green-400 text-sm font-medium">Asset Found!</p>
          </div>
          <h2 className="text-xl font-bold text-white">{a.name}</h2>
          <p className="text-gray-400 text-sm">{a.category} — {a.brand_model || "N/A"}</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-medium border ${statusColor[a.status] || "bg-gray-500/20 text-gray-400"}`}>
          {statusLabel(a.status)}
        </span>
      </div>
      <div className="space-y-2 mb-6">
        {[
          { label: "Serial Number", value: a.serial_number },
          { label: "Asset Tag", value: a.asset_tag },
          { label: "Location", value: a.location },
          { label: "Assigned To", value: a.assigned_user },
          { label: "Department", value: a.department },
          { label: "Warranty Expiry", value: a.warranty_expiry },
          { label: "Remarks", value: a.remarks },
        ].map(({ label, value }) => value ? (
          <div key={label} className="flex justify-between py-2 border-b border-gray-800 last:border-0">
            <span className="text-gray-500 text-sm">{label}</span>
            <span className="text-white text-sm font-medium text-right ml-4">{value}</span>
          </div>
        ) : null)}
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        <button onClick={() => navigate("/admin/issues?asset_id=" + a.id)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600/20 border border-orange-500/30 text-orange-400 hover:bg-orange-600/30 transition-all text-sm font-medium">⚠️ Report Issue</button>
        <button onClick={() => navigate("/admin/maintenance?asset_id=" + a.id)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-600/20 border border-yellow-500/30 text-yellow-400 hover:bg-yellow-600/30 transition-all text-sm font-medium">🔧 Request Maintenance</button>
        <button onClick={() => navigate(a.category ? "/admin/borrow?category=" + encodeURIComponent(a.category) : "/admin/borrow")} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600/20 border border-purple-500/30 text-purple-400 hover:bg-purple-600/30 transition-all text-sm font-medium">🔄 Borrow This Asset</button>
      </div>
      <div className="flex gap-3">
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          onClick={() => { window.location.href = `/admin/assets/${a.id}` }}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-medium text-sm">
          📋 View Full Details
        </motion.button>
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          onClick={onReset}
          className="bg-gray-800 hover:bg-gray-700 text-white py-3 px-4 rounded-xl text-sm">
          {isManual ? "Search Again" : "Scan Again"}
        </motion.button>
      </div>
    </motion.div>
  )

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-white">🔍 Asset Scanner</h1>
        <p className="text-gray-400 mt-1 text-sm">Scan QR codes, barcodes, or identify assets by photo</p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 mb-6 bg-gray-900/60 p-1 rounded-xl border border-gray-800">
        <button
          onClick={() => switchTab("qr")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
            tab === "qr"
              ? "bg-blue-600 text-white shadow-lg"
              : "text-gray-400 hover:text-white"
          }`}
        >
          <span>📷</span>
          <span>QR / Barcode</span>
        </button>
        <button
          onClick={() => switchTab("photo")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
            tab === "photo"
              ? "bg-purple-600 text-white shadow-lg"
              : "text-gray-400 hover:text-white"
          }`}
        >
          <span>🤖</span>
          <span>Photo Scan</span>
        </button>
      </div>

      {/* ── QR / Barcode Tab ─────────────────────────────────────────────────── */}
      {tab === "qr" && (
        <>
          <div className="bg-gray-900/80 rounded-2xl border border-gray-800 p-4 mb-6">
            <div
              id="qr-reader"
              style={{
                width: "100%",
                minHeight: scanning ? "350px" : "0px",
                display: scanning ? "block" : "none",
                borderRadius: "12px",
                overflow: "hidden",
              }}
            />
            {scanning && (
              <div className="text-center mt-4">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  <p className="text-red-400 text-sm font-medium">Scanning... Point at QR code or barcode</p>
                </div>
                <button onClick={stopScanning}
                  className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-2 rounded-lg text-sm transition-all">
                  Stop Scanning
                </button>
              </div>
            )}
            {!scanning && (
              <div className="text-center py-8">
                <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 2, repeat: Infinity }}
                  className="text-6xl mb-4">📷</motion.div>
                <p className="text-gray-400 mb-2 text-sm">Scan a Trainocate Asset Portal QR code sticker</p>
                <p className="text-gray-500 mb-6 text-xs">OR any manufacturer barcode on the device</p>
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  onClick={startScanning}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-semibold transition-all"
                  style={{ boxShadow: "0 0 20px rgba(59,130,246,0.3)" }}>
                  📷 Start Scanning
                </motion.button>
              </div>
            )}
          </div>

          {/* Manual Search */}
          <div className="bg-gray-900/80 rounded-2xl border border-gray-800 p-4 mb-6">
            <h2 className="text-white font-semibold mb-1">Manual Search</h2>
            <p className="text-gray-400 text-xs mb-3">Type serial number, asset tag, or name</p>
            <form onSubmit={handleManualSearch} className="flex gap-2">
              <input type="text" value={manualInput} onChange={e => setManualInput(e.target.value)}
                placeholder="e.g. FG5W5Y2 or Dell XPS..."
                className="flex-1 bg-gray-800 text-white rounded-xl px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm" />
              <button type="submit" disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-xl text-sm font-medium transition-all">
                Search
              </button>
            </form>
          </div>

          {loading && (
            <div className="bg-gray-900/80 rounded-2xl border border-gray-800 p-6 text-center mb-4">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-400 text-sm">Looking up asset...</p>
            </div>
          )}

          {error && !loading && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="bg-gray-900/80 border border-gray-800 rounded-2xl mb-4">
              <EmptyState preset="scanner" sub={error} />
            </motion.div>
          )}

          <AnimatePresence>
            {asset && !loading && (
              <AssetCard a={asset} isManual={isManualSearch} onReset={() => { setAsset(null); setResult(null); setError(""); setManualInput(""); setIsManualSearch(false) }} />
            )}
          </AnimatePresence>
        </>
      )}

      {/* ── Photo Scan Tab ───────────────────────────────────────────────────── */}
      {tab === "photo" && (
        <>
          <div className="bg-gray-900/80 rounded-2xl border border-gray-800 p-4 mb-6">
            {!photoPreview ? (
              <div className="text-center py-8">
                <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 2, repeat: Infinity }}
                  className="text-6xl mb-4">🤖</motion.div>
                <p className="text-white font-semibold mb-1">AI Photo Identification</p>
                <p className="text-gray-400 text-sm mb-2">Take or upload a photo of the device</p>
                <p className="text-gray-500 text-xs mb-6">Claude AI will identify the asset from the photo</p>

                {/* Hidden file input — accept camera + gallery on mobile */}
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handlePhotoSelect}
                />

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      if (photoInputRef.current) {
                        photoInputRef.current.removeAttribute("capture")
                        photoInputRef.current.click()
                      }
                    }}
                    className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-3 rounded-xl font-medium text-sm transition-all flex items-center gap-2 justify-center">
                    🖼️ Upload Photo
                  </motion.button>
                  <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      if (photoInputRef.current) {
                        photoInputRef.current.setAttribute("capture", "environment")
                        photoInputRef.current.click()
                      }
                    }}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-xl font-semibold text-sm transition-all flex items-center gap-2 justify-center"
                    style={{ boxShadow: "0 0 20px rgba(147,51,234,0.3)" }}>
                    📸 Take Photo
                  </motion.button>
                </div>
              </div>
            ) : (
              <div>
                {/* Photo preview */}
                <div className="relative mb-4">
                  <img src={photoPreview} alt="Asset photo"
                    className="w-full rounded-xl object-contain max-h-64 bg-gray-800" />
                  {!photoLoading && (
                    <button onClick={resetPhoto}
                      className="absolute top-2 right-2 bg-gray-900/80 hover:bg-gray-800 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm border border-gray-700">
                      ✕
                    </button>
                  )}
                </div>

                {/* Identified info chip */}
                {identified && !photoLoading && (
                  <div className="mb-4 px-3 py-2 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                    <p className="text-purple-400 text-xs font-medium mb-1">Claude identified:</p>
                    <p className="text-white text-sm">
                      {[identified.brand, identified.model, identified.device_type]
                        .filter(Boolean).join(" · ") || "Unknown device"}
                    </p>
                    {(identified.serial_number || identified.asset_tag) && (
                      <p className="text-gray-400 text-xs mt-0.5">
                        {identified.serial_number && `S/N: ${identified.serial_number}`}
                        {identified.serial_number && identified.asset_tag && " · "}
                        {identified.asset_tag && `Tag: ${identified.asset_tag}`}
                      </p>
                    )}
                  </div>
                )}

                {!photoLoading && !photoMatches.length && !photoError && (
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={handlePhotoScan}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-xl font-semibold text-sm transition-all"
                    style={{ boxShadow: "0 0 20px rgba(147,51,234,0.3)" }}>
                    🤖 Identify Asset
                  </motion.button>
                )}
              </div>
            )}
          </div>

          {/* Loading state */}
          {photoLoading && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="bg-gray-900/80 rounded-2xl border border-purple-500/30 p-6 text-center mb-4">
              <div className="w-10 h-10 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-white font-semibold text-sm">Jasmeena is identifying your asset... ⚡</p>
              <p className="text-gray-500 text-xs mt-1">Analyzing photo with Claude AI</p>
            </motion.div>
          )}

          {/* Error state */}
          {photoError && !photoLoading && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 mb-4">
              <p className="text-red-400 text-sm mb-3">❌ {photoError}</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <button onClick={resetPhoto}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2 rounded-lg text-xs font-medium transition-all">
                  Try Another Photo
                </button>
                <button onClick={() => switchTab("qr")}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2 rounded-lg text-xs font-medium transition-all">
                  Switch to QR Scan
                </button>
              </div>
            </motion.div>
          )}

          {/* Multiple matches */}
          <AnimatePresence>
            {photoMatches.length > 1 && !photoLoading && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="bg-gray-900/80 rounded-2xl border border-gray-800 p-4 mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">🔎</span>
                  <div>
                    <p className="text-white font-semibold text-sm">{photoMatches.length} possible matches found</p>
                    <p className="text-gray-500 text-xs">Select the correct asset</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {photoMatches.map(a => (
                    <motion.button key={a.id} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
                      onClick={() => { window.location.href = `/admin/assets/${a.id}` }}
                      className="w-full text-left bg-gray-800 hover:bg-gray-700 rounded-xl p-3 border border-gray-700 hover:border-purple-500/40 transition-all">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="text-white text-sm font-medium truncate">{a.name}</p>
                          <p className="text-gray-400 text-xs truncate">
                            {[a.category, a.brand_model, a.serial_number].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <span className={`ml-2 shrink-0 px-2 py-0.5 rounded-full text-xs font-medium border ${
                          statusColor[a.status] || "bg-gray-500/20 text-gray-400"}`}>
                          {a.status}
                        </span>
                      </div>
                    </motion.button>
                  ))}
                </div>
                <button onClick={resetPhoto}
                  className="mt-3 w-full text-gray-500 hover:text-gray-300 text-xs py-2 transition-all">
                  ← Try a different photo
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  )
}
