import { useRef, useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import { motion, AnimatePresence } from "framer-motion"

// 85mm × 54mm rectangular label (business card size)

function LabelPreview({ asset, assetUrl, qrRef }) {
  return (
    <div
      ref={qrRef}
      style={{
        width: 320, height: 204,
        background: "#fff", borderRadius: 6,
        border: "1px solid #d1d5db",
        fontFamily: "'Helvetica Neue', Arial, sans-serif",
        overflow: "hidden",
        display: "flex", flexDirection: "column",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
      }}
    >
      {/* Logo area */}
      <div style={{
        borderBottom: "1px solid #e5e7eb", padding: "8px 12px",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <img src="/trainocate-logo.png" alt="Trainocate" style={{width:"80px", mixBlendMode:"multiply", background:"transparent"}} />
        <span style={{ fontSize: 11, fontWeight: 700, color: "#374151", letterSpacing: "0.05em" }}>
          TRAINOCATE Property
        </span>
      </div>

      {/* Body: asset info + QR */}
      <div style={{ flex: 1, display: "flex", padding: "8px 12px", gap: 10 }}>
        {/* Asset info */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 3 }}>
          <p style={{ fontWeight: 800, fontSize: 11, color: "#111", lineHeight: 1.2, wordBreak: "break-word" }}>
            {asset.name}
          </p>
          <p style={{ fontSize: 8.5, color: "#374151" }}>S/N: {asset.serial_number || "Not assigned"}</p>
          {asset.category && (
            <p style={{ fontSize: 8.5, color: "#374151" }}>Category: {asset.category}</p>
          )}
          {asset.location && (
            <p style={{ fontSize: 8.5, color: "#374151" }}>Location: {asset.location}</p>
          )}
        </div>

        {/* QR Code */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, justifyContent: "center" }}>
          <QRCodeSVG value={assetUrl} size={72} level="H" />
          <p style={{ fontSize: 6, color: "#6b7280", textAlign: "center" }}>Scan for details</p>
          <p style={{ fontSize: 6, color: "#3b82f6", textAlign: "center", fontWeight: 600 }}>Trainocate Asset Portal</p>
        </div>
      </div>
    </div>
  )
}

function buildPrintHtml(assets, assetUrlBase, qty, svgMap) {
  const labels = assets.flatMap(asset => {
    const svgStr = (svgMap[asset.id] || "")
      .replace(/width="[^"]*"/, `width="28mm"`)
      .replace(/height="[^"]*"/, `height="28mm"`)

    const single = `
      <div class="label">
        <div class="logo-row">
          <img src="/trainocate-logo.png" alt="Trainocate" class="logo-img" />
          <span class="prop-label">TRAINOCATE Property</span>
        </div>
        <div class="body-row">
          <div class="asset-info">
            <div class="asset-name">${asset.name}</div>
            <div class="detail">S/N: ${asset.serial_number || "Not assigned"}</div>
            ${asset.category ? `<div class="detail">Category: ${asset.category}</div>` : ""}
            ${asset.location ? `<div class="detail">Location: ${asset.location}</div>` : ""}
          </div>
          <div class="qr-col">
            <div class="qr-wrap">${svgStr}</div>
            <div class="qr-caption">Scan for asset details</div>
            <div class="qr-brand">Trainocate Asset Portal</div>
          </div>
        </div>
      </div>`
    return Array(qty).fill(single)
  })

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>QR Labels — Trainocate Asset Portal</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#fff; font-family:-apple-system,'Helvetica Neue',Arial,sans-serif; }
  .page { display:flex; flex-wrap:wrap; gap:4mm; padding:8mm; }
  .label {
    width:85mm; height:54mm; border:1px solid #d1d5db; border-radius:2mm;
    overflow:hidden; display:flex; flex-direction:column; page-break-inside:avoid;
  }
  .logo-row {
    border-bottom:1px solid #e5e7eb; padding:2.5mm 3mm;
    display:flex; align-items:center; gap:3mm; flex-shrink:0;
  }
  .logo-img {
    width:28mm; height:9mm; object-fit:contain; mix-blend-mode:multiply; background:transparent;
  }
  .prop-label { font-size:9pt; font-weight:700; color:#374151; letter-spacing:0.05em; }
  .body-row { flex:1; display:flex; padding:2.5mm 3mm; gap:3mm; }
  .asset-info { flex:1; display:flex; flex-direction:column; justify-content:center; gap:1.2mm; }
  .asset-name { font-size:9pt; font-weight:800; color:#111; line-height:1.2; word-break:break-word; }
  .detail { font-size:7pt; color:#374151; }
  .qr-col { display:flex; flex-direction:column; align-items:center; gap:1mm; justify-content:center; }
  .qr-wrap { line-height:0; }
  .qr-caption { font-size:5pt; color:#6b7280; text-align:center; }
  .qr-brand { font-size:5pt; color:#3b82f6; font-weight:700; text-align:center; }
  @media print { @page { margin:5mm; } body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style></head>
<body><div class="page">${labels.join("")}</div>
<script>window.onload=function(){window.print()}<\/script>
</body></html>`
}

export default function QRLabelModal({ assets, assetUrlBase, onClose }) {
  const [qty, setQty] = useState(1)
  const qrRefs = useRef({})
  const previewRef = useRef()

  const isBulk = assets.length > 1
  const firstAsset = assets[0]
  const firstUrl = assetUrlBase + firstAsset.id

  const handlePrint = () => {
    const svgMap = {}
    assets.forEach(asset => {
      const el = qrRefs.current[asset.id]?.querySelector("svg")
      if (el) svgMap[asset.id] = new XMLSerializer().serializeToString(el)
    })

    const html = buildPrintHtml(assets, assetUrlBase, qty, svgMap)
    const win = window.open("", "_blank", "width=1000,height=800")
    if (!win) { alert("Please allow pop-ups to print labels."); return }
    win.document.write(html)
    win.document.close()
  }

  const totalLabels = assets.length * qty

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 20 }}
        transition={{ type: "spring", stiffness: 220, damping: 22 }}
        className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-lg shadow-2xl overflow-y-auto"
        style={{ maxHeight: "92vh", boxShadow: "0 0 50px rgba(59,130,246,0.15)" }}
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-white font-bold text-lg">🏷️ Print QR Labels</h2>
              <p className="text-gray-400 text-sm mt-0.5">
                {isBulk ? `${assets.length} assets selected` : firstAsset.name}
              </p>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none transition-all">✕</button>
          </div>

          {/* Qty */}
          <div className="mb-5">
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2">
              {isBulk ? "Copies per asset" : "Quantity"}
            </p>
            <div className="flex items-center gap-3">
              <button onClick={() => setQty(q => Math.max(1, q - 1))}
                className="w-9 h-9 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-bold text-lg flex items-center justify-center transition-all">−</button>
              <span className="text-white font-bold text-xl w-8 text-center">{qty}</span>
              <button onClick={() => setQty(q => Math.min(20, q + 1))}
                className="w-9 h-9 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-bold text-lg flex items-center justify-center transition-all">+</button>
              {isBulk && (
                <span className="text-gray-500 text-sm">= {totalLabels} total labels</span>
              )}
            </div>
          </div>

          {/* Preview */}
          <div className="mb-5">
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2">
              Preview (85mm × 54mm)
            </p>
            <div className="bg-gray-800/60 rounded-xl p-4 flex items-center justify-center overflow-x-auto">
              <LabelPreview
                asset={firstAsset}
                assetUrl={firstUrl}
                qrRef={previewRef}
              />
            </div>
          </div>

          {/* Hidden QR codes for all assets */}
          <div style={{ position: "fixed", opacity: 0, pointerEvents: "none", left: -9999, top: -9999 }}>
            {assets.map(asset => (
              <div key={asset.id} ref={el => { if (el) qrRefs.current[asset.id] = el }}>
                <QRCodeSVG value={assetUrlBase + asset.id} size={200} level="H" />
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2.5 rounded-xl text-sm font-medium transition-all">
              Cancel
            </button>
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={handlePrint}
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{ boxShadow: "0 0 20px rgba(59,130,246,0.3)" }}>
              🖨️ Print {totalLabels} Label{totalLabels !== 1 ? "s" : ""}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
