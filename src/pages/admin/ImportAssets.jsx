import { useState, useEffect } from "react"
import { supabase } from "../../lib/supabase"
import * as XLSX from "xlsx"
import { useAuth } from "../../context/AuthContext"
import { motion, AnimatePresence } from "framer-motion"
import { LoadingSkeleton, EmptyState } from "../../components/EmptyState"

const excelDateToISO = (val) => {
  if (!val) return null
  // If it's already a string date, return as is
  if (typeof val === 'string' && val.includes('-')) return val
  if (typeof val === 'string' && val.includes('/')) {
    // Handle DD/MM/YYYY and DD/MM/YY formats (e.g. Ariff's file: 20/6/19 = 20 Jun 2019)
    const parts = val.split('/')
    if (parts.length === 3) {
      let [first, second, year] = parts
      const firstNum = parseInt(first, 10)
      const secondNum = parseInt(second, 10)

      // Month can't exceed 12, so whichever part is >12 must be the day
      let day, month
      if (firstNum > 12) {
        day = first
        month = second
      } else if (secondNum > 12) {
        day = second
        month = first
      } else {
        // Ambiguous — default to DD/MM (this file's format)
        day = first
        month = second
      }

      // Handle 2-digit years (e.g. 19 = 2019, 21 = 2021, 23 = 2023)
      if (year.length === 2) {
        const yearNum = parseInt(year, 10)
        year = yearNum <= 68 ? `20${year.padStart(2,'0')}` : `19${year.padStart(2,'0')}`
      }

      return `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`
    }
  }
  // Handle Excel serial number
  if (typeof val === 'number') {
    const date = new Date((val - 25569) * 86400 * 1000)
    return date.toISOString().split('T')[0]
  }
  return null
}

export default function ImportAssets() {
  const { userCountry, userProfile } = useAuth()
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState([])
  const [imported, setImported] = useState(false)
  const [count, setCount] = useState(0)
  const [importedCount, setImportedCount] = useState(0)
  const [updatedCount, setUpdatedCount] = useState(0)
  const [importMode, setImportMode] = useState("add") // "add" | "update"
  const [importHistory, setImportHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [importSummary, setImportSummary] = useState(null)

  useEffect(() => {
    loadHistory()
  }, [])

  const loadHistory = async () => {
    setHistoryLoading(true)
    const { data } = await supabase
      .from("import_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10)
    setImportHistory(data || [])
    setHistoryLoading(false)
  }

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (evt) => {
      const workbook = XLSX.read(evt.target.result, { type: "binary" })
      const firstSheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[firstSheetName]
      if (!sheet) {
        alert("Could not read the Excel file — no sheets found.")
        return
      }
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 })

      const assets = []
      const seenSerials = new Set()

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        const headerVal = typeof row[0] === "string" ? row[0].trim().toLowerCase() : ""
        if (!row[0] || headerVal === "item" || headerVal === "name" || headerVal === "asset name") continue

        const name = row[0]
        if (!name || typeof name !== "string") continue
        if (name.trim().toLowerCase() === "microsoft surface 1") continue

        const brandModel = row[1] ? String(row[1]).trim() : null
        let serial = row[2] ? String(row[2]).trim() : null
        if (serial && (serial.toUpperCase() === "N/A" || serial.toUpperCase() === "NA")) serial = null
        const category = row[3] ? String(row[3]).trim() : "Laptop"
        const status = row[4] ? String(row[4]).trim().toLowerCase() : "available"
        const usage = row[5] ? String(row[5]).trim() : null
        const department = row[6] ? String(row[6]).trim() : null
        const assetTag = row[7] ? String(row[7]).trim() : null
        const remarks = row[8] ? String(row[8]).trim() : null
        const location = row[9] ? String(row[9]).trim() : null
        const warrantyExpiry = excelDateToISO(typeof row[10] === "string" ? row[10].trim() : row[10])
        const purchasePrice = row[11] !== undefined && row[11] !== null && row[11] !== ""
          ? parseFloat(row[11])
          : null
        const purchaseDate = excelDateToISO(typeof row[12] === "string" ? row[12].trim() : row[12])

        // No usable serial — fall back to asset tag, then a name+row synthetic id, as the unique identifier
        let uniqueId = serial || assetTag || `${name.trim()}_ROW${i + 1}`
        if (seenSerials.has(uniqueId)) {
          uniqueId = `${uniqueId}_${i}`
        }
        seenSerials.add(uniqueId)

        assets.push({
          name: name.trim(),
          brand_model: brandModel || null,
          serial_number: uniqueId,
          assigned_user: usage || null,
          department: department || null,
          asset_tag: assetTag || null,
          remarks: remarks || null,
          category,
          status,
          country: userCountry || "Singapore",
          location: location || userCountry || "Singapore",
          warranty_expiry: warrantyExpiry || null,
          purchase_price: Number.isNaN(purchasePrice) ? null : purchasePrice,
          purchase_date: purchaseDate || null,
          useful_life: 5,
        })
      }

      setPreview(assets.slice(0, 5))
      setCount(assets.length)
      setImported(false)
      setImportedCount(0)
      setUpdatedCount(0)
      window._importData = assets
    }
    reader.readAsBinaryString(file)
  }

  const downloadTemplate = () => {
    const headers = [
      "Asset Name", "Brand / Model", "Serial Number", "Category", "Status", "Assigned User", "Department",
      "Asset Tag", "Remarks", "Location", "Warranty Expiry", "Purchase Price", "Purchase Date",
      "Useful Life (years)",
    ]
    const example = [
      "MacBook Pro 14\"", "Apple MacBook Pro 14 2021", "SN123456789", "Laptop", "available", "John Tan", "Engineering",
      "AST-0001", "Assigned for development work", "Singapore", "2027-06-30", 2499, "2022-06-30",
      5,
    ]
    const ws = XLSX.utils.aoa_to_sheet([headers, example])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Template")
    XLSX.writeFile(wb, "asset_import_template.xlsx")
  }

  const downloadErrorReport = (errors) => {
    const ws = XLSX.utils.json_to_sheet(errors)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Errors")
    XLSX.writeFile(wb, `import_errors_${new Date().toISOString().split("T")[0]}.xlsx`)
  }

  const handleImport = async () => {
    if (!window._importData || window._importData.length === 0) return
    setLoading(true)

    const data = window._importData
    let successCount = 0
    let updateCount = 0
    let skipCount = 0
    let failCount = 0
    const errors = []
    const fileName = `Import_${new Date().toISOString().split("T")[0]}`

    for (let i = 0; i < data.length; i++) {
      const item = data[i]

      if (importMode === "update" && item.serial_number) {
        const { data: existing } = await supabase
          .from("assets")
          .select("id")
          .eq("serial_number", item.serial_number)
          .single()

        if (existing?.id) {
          const { error } = await supabase.from("assets").update(item).eq("id", existing.id)
          if (!error) updateCount++
          else { failCount++; errors.push({ Row: i + 2, Name: item.name, Serial: item.serial_number || "", Reason: error.message }) }
          setUpdatedCount(updateCount)
          continue
        }
      } else if (importMode === "add" && item.serial_number) {
        // Check for duplicate serial
        const { data: existing } = await supabase
          .from("assets")
          .select("id")
          .eq("serial_number", item.serial_number)
          .maybeSingle()
        if (existing) {
          skipCount++
          errors.push({ Row: i + 2, Name: item.name, Serial: item.serial_number || "", Reason: "Duplicate serial number" })
          continue
        }
      }

      const { error } = await supabase.from("assets").insert([item])
      if (!error) successCount++
      else { failCount++; errors.push({ Row: i + 2, Name: item.name, Serial: item.serial_number || "", Reason: error.message }) }
      setImportedCount(successCount)
    }

    // Save import history
    const { error: histErr } = await supabase.from("import_history").insert([{
      file_name: fileName,
      uploaded_by: userProfile?.name || userProfile?.email || "Unknown",
      assets_added: successCount,
      assets_updated: updateCount,
      status: "Success",
    }])
    if (histErr) console.error("import_history insert error:", histErr)

    setImported(true)
    setLoading(false)
    setImportSummary({
      total: data.length,
      success: successCount,
      updated: updateCount,
      skipped: skipCount,
      failed: failCount,
      errors,
    })
    loadHistory()
  }

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-3xl font-bold text-white mb-2">Import Assets</h1>
      <p className="text-gray-400 mb-8">Upload your asset list{userCountry ? ` — assets will be imported to ${userCountry}` : ""}</p>

      <AnimatePresence>
        {imported && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="bg-green-500/20 border border-green-500/30 text-green-400 rounded-lg px-4 py-3 mb-6">
            ✅ {importedCount} new asset{importedCount !== 1 ? "s" : ""} added
            {updatedCount > 0 ? `, ${updatedCount} existing updated` : ""}!
          </motion.div>
        )}
      </AnimatePresence>

      {loading && (
        <div className="bg-blue-500/20 border border-blue-500/30 text-blue-400 rounded-lg px-4 py-3 mb-6">
          ⏳ Importing... {importedCount + updatedCount} / {count} done
        </div>
      )}

      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-6">
        {/* Import Mode */}
        <div className="mb-5">
          <label className="text-gray-400 text-sm mb-3 block font-medium">Import Mode</label>
          <div className="space-y-2">
            {[
              { value: "add", label: "Add new assets only", desc: "Skip assets with existing serial numbers" },
              { value: "update", label: "Add new + update existing", desc: "Update asset details if serial number matches" },
            ].map(opt => (
              <label key={opt.value} className="flex items-start gap-3 cursor-pointer group">
                <input type="radio" name="importMode" value={opt.value} checked={importMode === opt.value}
                  onChange={() => setImportMode(opt.value)} className="mt-0.5" />
                <div>
                  <p className={`text-sm font-medium ${importMode === opt.value ? "text-white" : "text-gray-400"}`}>{opt.label}</p>
                  <p className="text-gray-600 text-xs">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between mb-3">
          <label className="text-gray-400 text-sm block">Select Excel File (IT_Asset_Tracking.xlsx)</label>
          <button
            type="button"
            onClick={downloadTemplate}
            className="text-blue-400 hover:text-blue-300 text-sm font-medium flex items-center gap-1 shrink-0"
          >
            📥 Download Template
          </button>
        </div>
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFile}
          className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none text-sm"
        />
      </div>

      {preview.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-6">
          <h2 className="text-white font-semibold mb-4">Preview — {count} assets found</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left text-gray-400 py-2 px-3">Name</th>
                  <th className="text-left text-gray-400 py-2 px-3">Serial</th>
                  <th className="text-left text-gray-400 py-2 px-3">Assigned To</th>
                  <th className="text-left text-gray-400 py-2 px-3">Category</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((a, i) => (
                  <tr key={i} className="border-b border-gray-800">
                    <td className="text-white py-2 px-3">{a.name}</td>
                    <td className="text-gray-400 py-2 px-3">{a.serial_number || "—"}</td>
                    <td className="text-gray-400 py-2 px-3">{a.assigned_user || "—"}</td>
                    <td className="text-gray-400 py-2 px-3">{a.category}</td>
                  </tr>
                ))}
                {count > 5 && (
                  <tr>
                    <td colSpan={4} className="text-gray-500 py-2 px-3 text-center">
                      ... and {count - 5} more assets
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <button
            onClick={handleImport}
            disabled={loading}
            className="mt-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-lg transition-all disabled:opacity-50"
          >
            {loading
              ? `Importing ${importedCount + updatedCount}/${count}...`
              : `Import ${count} Assets (${importMode === "update" ? "Add + Update" : "Add Only"})`}
          </button>
        </div>
      )}

      {/* Import History */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h2 className="text-white font-semibold mb-4">Import History</h2>
        {historyLoading ? (
          <LoadingSkeleton rows={3} cols={2} />
        ) : importHistory.length === 0 ? (
          <EmptyState preset="imports" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left text-gray-400 py-2 px-3">File</th>
                  <th className="text-left text-gray-400 py-2 px-3">Date</th>
                  <th className="text-left text-gray-400 py-2 px-3">By</th>
                  <th className="text-left text-gray-400 py-2 px-3">Added</th>
                  <th className="text-left text-gray-400 py-2 px-3">Updated</th>
                  <th className="text-left text-gray-400 py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {importHistory.map((h, i) => (
                  <tr key={h.id || i} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="text-white py-2 px-3 max-w-xs truncate">{h.file_name || "—"}</td>
                    <td className="text-gray-400 py-2 px-3 text-xs whitespace-nowrap">
                      {h.created_at ? new Date(h.created_at).toLocaleString() : "—"}
                    </td>
                    <td className="text-gray-400 py-2 px-3">{h.uploaded_by || "—"}</td>
                    <td className="text-gray-400 py-2 px-3">{h.assets_added ?? "—"}</td>
                    <td className="text-gray-400 py-2 px-3">{h.assets_updated ?? 0}</td>
                    <td className="py-2 px-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        h.status === "Success"
                          ? "bg-green-500/20 text-green-400"
                          : "bg-red-500/20 text-red-400"
                      }`}>
                        {h.status || "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-gray-600 text-xs mt-3">Showing last 10 imports</p>
      </div>

      {/* Import Summary Modal */}
      <AnimatePresence>
        {importSummary && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-gray-900 rounded-xl border border-gray-800 p-6 max-w-md w-full"
            >
              <h3 className="text-white font-semibold text-lg mb-4">📊 Import Summary</h3>
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm py-1.5 border-b border-gray-800">
                  <span className="text-gray-400">Total rows processed</span>
                  <span className="text-white font-medium">{importSummary.total}</span>
                </div>
                <div className="flex justify-between text-sm py-1.5 border-b border-gray-800">
                  <span className="text-gray-400">✅ Imported (new)</span>
                  <span className="text-green-400 font-medium">{importSummary.success}</span>
                </div>
                {importSummary.updated > 0 && (
                  <div className="flex justify-between text-sm py-1.5 border-b border-gray-800">
                    <span className="text-gray-400">✏️ Updated (existing)</span>
                    <span className="text-blue-400 font-medium">{importSummary.updated}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm py-1.5 border-b border-gray-800">
                  <span className="text-gray-400">⏭️ Skipped (duplicates)</span>
                  <span className="text-yellow-400 font-medium">{importSummary.skipped}</span>
                </div>
                <div className="flex justify-between text-sm py-1.5">
                  <span className="text-gray-400">❌ Failed (errors)</span>
                  <span className="text-red-400 font-medium">{importSummary.failed}</span>
                </div>
              </div>
              {importSummary.errors?.length > 0 && (
                <button
                  onClick={() => downloadErrorReport(importSummary.errors)}
                  className="w-full py-2 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-sm mb-3 hover:bg-red-500/20 transition-all"
                >
                  📥 Download Error Report ({importSummary.errors.length} rows)
                </button>
              )}
              <button
                onClick={() => setImportSummary(null)}
                className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-all"
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
