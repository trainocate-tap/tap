import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import * as XLSX from "xlsx"

const guides = [
  {
    id: "dashboard",
    emoji: "🏠",
    title: "Dashboard",
    color: "blue",
    steps: [
      "The Dashboard is your home page after logging in — showing live system stats",
      "Total Assets, Unassigned, Assigned, and Retired are shown as coloured stat cards",
      "Click any stat card to jump straight to All Assets, pre-filtered by that status",
      "Overdue Borrows and Open Issues are highlighted with alerts",
      "Pending Asset Requests appear on the dashboard for quick admin action",
      "Recently Added Assets section shows the last 5 assets added to the system",
      "Warranty Status shows a breakdown of valid vs expired warranties",
      "Click Overview, Analytics, or Warranty tabs to switch between summary, chart and warranty views",
      "Quick action buttons: Add Asset, Report Issue, Borrow Asset"
    ]
  },
  {
    id: "assets",
    emoji: "📦",
    title: "Managing Assets",
    color: "green",
    steps: [
      "Go to All Assets to view the complete list of all assets in the system",
      "Search assets by name, serial number, or assigned user using the search bar",
      "Filter by Status (Unassigned, Assigned, Maintenance, Retired) or Category",
      "Click any asset row to open the full Asset Detail page",
      "Use + Add to register a new asset with full details including category, serial number, location, warranty and purchase info",
      "When Status is set to Assigned, a user dropdown appears to select who the asset is assigned to",
      "For Software License category, additional fields appear: License Key, Number of Seats, License Expiry, Licensed To",
      "Use the Assign button to assign one or multiple selected assets to a user",
      "Edit button opens the edit form to update any asset details",
      "Export Excel downloads the full asset list as a spreadsheet",
      "Print QR Label generates a printable sticker for the selected asset",
      "Asset Detail page shows full info, depreciation value, asset timeline, photos, and QR code"
    ]
  },
  {
    id: "scanner",
    emoji: "🔍",
    title: "Asset Scanner",
    color: "purple",
    steps: [
      "Go to Scanner to quickly look up any asset by scanning or searching",
      "QR/Barcode tab: click Start Scanning to use your device camera to scan an asset QR sticker",
      "Photo Scan tab: take a photo of the asset and AI will identify it automatically",
      "Manual Search: type the serial number, asset tag, or asset name to search",
      "Once an asset is found, full details are shown including location, assigned user, warranty and remarks",
      "Report Issue button redirects to the Issues page with the asset pre-filled",
      "Request Maintenance button redirects to the Maintenance page with the asset pre-filled",
      "Borrow This Asset button redirects to the Borrow page with the asset pre-filled",
      "View Full Details opens the complete Asset Detail page"
    ]
  },
  {
    id: "qr",
    emoji: "🏷️",
    title: "QR Code Labels",
    color: "yellow",
    steps: [
      "Select one or more assets from the All Assets page",
      "Click Print QR Labels button at the top",
      "A preview of the label is shown (85mm x 54mm format)",
      "The label includes the Trainocate logo, asset name, serial number, category, location and QR code",
      "Adjust quantity using the +/- buttons then click Print Label",
      "Labels are designed for the Brother VC-500W label printer",
      "Scanning the QR code on any device opens the asset detail page instantly"
    ]
  },
  {
    id: "borrow",
    emoji: "📤",
    title: "Borrow & Return",
    color: "orange",
    steps: [
      "Go to Borrow / Return to manage asset borrowing",
      "Click + Borrow Asset to open the borrow form",
      "Select a Category first, then choose from available assets assigned to you",
      "Fill in Borrowing For (Myself or Customer/External), Signed Off By, Date Borrowed and Due Date",
      "Active borrows appear below with borrower name, asset, dates and due date countdown",
      "Click Return on any active borrow to mark it as returned",
      "Click Extend to request a due date extension — admin will be notified",
      "Use the filter tabs: All / Active / Returned / Overdue to view different borrow states",
      "Admins can see all borrows across all users; Standard Users see only their own",
      "Export Excel downloads the full borrow history"
    ]
  },
  {
    id: "issues",
    emoji: "⚠️",
    title: "Reporting Issues",
    color: "red",
    steps: [
      "Go to Issues to report or manage asset problems",
      "Click + Report to open the issue form",
      "Select the Asset, Issue Type (Hardware/Software/Physical/Other), Priority and write a description",
      "Once submitted, the issue appears in the list with status Open",
      "Admins can see all issues; Standard Users see only issues they reported",
      "Filter by Status (Open, In Progress, Resolved) or Priority (Low, Medium, High, Critical)",
      "Admin can click Resolve to mark an issue as fixed — the reporter gets a notification",
      "Export Excel downloads the full issues list"
    ]
  },
  {
    id: "maintenance",
    emoji: "🔧",
    title: "Maintenance",
    color: "teal",
    steps: [
      "Go to Maintenance to schedule and track asset maintenance tasks",
      "Click + Schedule to create a new maintenance task",
      "Select the Asset, Type (Repair/Cleaning/Inspection/Upgrade/Calibration), Priority, Scheduled Date and Recurrence",
      "Assign To field shows a dropdown of admin users (IT staff) who will handle the maintenance",
      "Once submitted the maintenance task appears in the list",
      "Filter by Status (Pending, In Progress, Completed) or Priority",
      "Admin marks task as Done when maintenance is completed — the requester gets notified",
      "Admins see all maintenance tasks; Standard Users see only their own requests",
      "Export Excel downloads the full maintenance schedule"
    ]
  },
  {
    id: "requests",
    emoji: "📋",
    title: "Asset Requests",
    color: "indigo",
    steps: [
      "Go to Asset Requests to submit or manage requests for new assets",
      "Click + New Request to open the request form",
      "Fill in Asset Type, Laptop Type (if applicable), Operating System, Department, Cost, Business Justification and Priority",
      "Attach supporting documents (PDF only) if needed",
      "Submitted requests appear in the list with Pending status",
      "Admins can Approve or Reject requests — the requester gets an email notification automatically",
      "Filter by All, Pending, or My Requests tabs",
      "Approved/Rejected status is shown with the decision date and actioning admin"
    ]
  },
  {
    id: "import",
    emoji: "📥",
    title: "Importing Assets & Users",
    color: "cyan",
    steps: [
      "Go to Import Assets to bulk upload assets from an Excel file",
      "Choose Import Mode: Add new assets only (skip duplicates) or Add new + update existing",
      "Upload your Excel file — the system reads the first sheet automatically regardless of sheet name",
      "Required columns: name, serial_number, category, status, assigned_user, location, country, warranty_expiry, condition, purchase_price, useful_life (years)",
      "A preview of detected records is shown before importing",
      "After import, a summary shows how many were imported, skipped or failed",
      "Import History below shows all previous imports with date, user and counts",
      "For importing users, go to Manage Users and click Import Users",
      "User Excel columns: Full Name, Email, Department, Role (admin/standard_user/guest), Country",
      "Imported users automatically receive a welcome email with their login credentials"
    ]
  },
  {
    id: "users",
    emoji: "👥",
    title: "Manage Users",
    color: "pink",
    steps: [
      "Go to Manage Users (Admin only) to manage all user accounts",
      "User cards show name, email, role, country, last login time and number of assigned assets",
      "Click any user card to see full details including list of assets assigned to them",
      "Use the search bar to quickly find a user by name or email",
      "Click + Add New User to create a new account — fill in name, email, role, department and country",
      "Click Generate to create a secure password — the user will receive it in their welcome email",
      "Click the pencil icon to edit a user's name, role, country or marketing access",
      "Click the X button to delete a user account permanently",
      "Toggle 2FA on/off for any user using the lock icon",
      "Toggle Marketing Access using the Mktg button to give users access to the Marketing module",
      "Import Users button allows bulk user creation from an Excel file",
      "Role badges: Admin (full access), Standard User (limited access), Guest (view only)"
    ]
  },
  {
    id: "reports",
    emoji: "📊",
    title: "Reports & Exports",
    color: "green",
    steps: [
      "Go to Reports to view detailed analytics and export data",
      "Full Asset Inventory: complete list with status and category charts, filter by date range",
      "Warranty Expiry: shows assets expiring within 30/60/90 days with visual breakdown",
      "Department Assets: assets grouped by department with assigned vs available breakdown",
      "Asset Depreciation: calculates current value based on straight-line depreciation using each asset's own Useful Life (years) field — filter by month/year to see accumulated depreciation as of that date",
      "License Usage: tracks software license status and expiry",
      "Maintenance History: all maintenance records with status breakdown chart",
      "Borrow History: all borrow records with active vs returned counts",
      "Overdue Borrows: assets not returned past their due date",
      "Assets by Department: count of assets per department",
      "License Expiry Report: licenses expiring within 30/60/90 days",
      "All reports can be exported as PDF or Excel using the buttons at the top right"
    ]
  },
  {
    id: "history",
    emoji: "🕐",
    title: "Asset History",
    color: "gray",
    steps: [
      "Go to History to see an audit trail of admin changes to asset records",
      "Logs asset record changes only: Created, Updated (including assign and status change), and Deleted — borrow, issue and maintenance activity is not shown here",
      "Filter by Action Type (Created/Updated/Deleted)",
      "Filter by User — type a username to see only actions by that person",
      "Filter by Asset Name to see history for a specific asset",
      "Filter by Date Range using the date pickers",
      "Each entry shows the action type badge, asset name, description, who did it and when",
      "Export PDF or Export Excel to download the full history log"
    ]
  },
  {
    id: "notifications",
    emoji: "🔔",
    title: "Notifications",
    color: "yellow",
    steps: [
      "The bell icon at the top shows your notification count badge",
      "Bell shakes when a new notification arrives",
      "Click the bell to open the notifications dropdown",
      "Click any notification to see full details in a popup modal",
      "Click the ✓ button on any notification to mark it as read individually",
      "Mark All Read button marks all notifications as read at once",
      "Clear All removes all notifications from your list",
      "Admins receive notifications when users borrow, return, extend, report issues or schedule maintenance",
      "Standard Users receive notifications when their requests are approved, issues resolved or maintenance completed",
      "You'll also receive a confirmation email for your own actions: submitting an issue, scheduling maintenance, borrowing an asset, extending or returning a borrow, and submitting an asset request",
      "Asset request decisions (approved or rejected) are emailed to you as well"
    ]
  },
  {
    id: "settings",
    emoji: "⚙️",
    title: "Settings",
    color: "gray",
    steps: [
      "Go to Settings (Admin only) to configure system-wide options",
      "Asset Request Approvals: set which admin receives notifications and approves asset requests",
      "Marketing Distribution Approvals: set the approving officer for marketing distribution requests",
      "Currency Settings: choose your portal's display currency from 8 supported currencies",
      "Backup & Restore: download a full backup of all assets, users, borrows, issues, maintenance and settings data as JSON or Excel",
      "Changes take effect immediately after clicking Save Settings"
    ]
  },
  {
    id: "marketing",
    emoji: "🎯",
    title: "Marketing Module",
    color: "purple",
    steps: [
      "Marketing module is accessible via the Switch Module button in the sidebar",
      "Only users with Marketing Access enabled can see this module",
      "Marketing Dashboard shows an overview of all marketing assets and activities",
      "Marketing Items: manage all marketing collateral and materials",
      "Events: track event collateral sign-in and sign-out",
      "Distribution Approvals: submit and approve marketing distribution requests",
      "History: full audit trail of all marketing activities",
      "Reports: analytics and exports for marketing asset usage"
    ]
  }
]

const colorMap = {
  blue: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400", dot: "bg-blue-500" },
  purple: { bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-400", dot: "bg-purple-500" },
  cyan: { bg: "bg-cyan-500/10", border: "border-cyan-500/30", text: "text-cyan-400", dot: "bg-cyan-500" },
  green: { bg: "bg-green-500/10", border: "border-green-500/30", text: "text-green-400", dot: "bg-green-500" },
  orange: { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-400", dot: "bg-orange-500" },
  red: { bg: "bg-red-500/10", border: "border-red-500/30", text: "text-red-400", dot: "bg-red-500" },
  yellow: { bg: "bg-yellow-500/10", border: "border-yellow-500/30", text: "text-yellow-400", dot: "bg-yellow-500" },
  pink: { bg: "bg-pink-500/10", border: "border-pink-500/30", text: "text-pink-400", dot: "bg-pink-500" },
  teal: { bg: "bg-teal-500/10", border: "border-teal-500/30", text: "text-teal-400", dot: "bg-teal-500" },
  indigo: { bg: "bg-indigo-500/10", border: "border-indigo-500/30", text: "text-indigo-400", dot: "bg-indigo-500" },
  gray: { bg: "bg-gray-500/10", border: "border-gray-500/30", text: "text-gray-400", dot: "bg-gray-500" },
}

export default function UserGuide() {
  const [activeId, setActiveId] = useState(null)

  const downloadPDF = () => {
    const win = window.open("", "_blank", "width=900,height=700")
    if (!win) { alert("Please allow pop-ups to download PDF."); return }
    const sectionsHtml = guides.map(g => `
      <div style="margin-bottom:24px;">
        <h2 style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:10px;border-bottom:2px solid #e5e7eb;padding-bottom:6px;">
          ${g.emoji} ${g.title}
        </h2>
        <ol style="margin:0;padding-left:20px;">
          ${g.steps.map(s => `<li style="margin-bottom:6px;font-size:13px;color:#374151;line-height:1.5;">${s}</li>`).join("")}
        </ol>
      </div>`).join("")
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Trainocate Asset Portal User Guide</title>
      <style>body{font-family:Arial,sans-serif;padding:32px;max-width:800px;margin:0 auto;color:#111;}
      h1{font-size:24px;font-weight:800;margin-bottom:4px;}
      .subtitle{color:#6b7280;font-size:13px;margin-bottom:28px;}
      @media print{body{padding:16px}}</style></head>
      <body>
        <h1>📖 Trainocate Asset Portal User Guide</h1>
        <p class="subtitle">Trainocate Asset Portal — Complete Guide</p>
        ${sectionsHtml}
        <p style="color:#9ca3af;font-size:11px;margin-top:32px;text-align:center;">Trainocate Asset Portal v1.0 — Trainocate Singapore © 2026</p>
      </body></html>`)
    win.document.close()
    win.print()
  }

  const downloadExcel = () => {
    const rows = []
    guides.forEach(g => {
      g.steps.forEach((step, i) => {
        rows.push({ "Section": g.title, "Step #": i + 1, "Step": step })
      })
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    ws["!cols"] = [{ wch: 24 }, { wch: 8 }, { wch: 80 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "User Guide")
    XLSX.writeFile(wb, "Trainocate Asset Portal_User_Guide.xlsx")
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-white">📖 User Guide</h1>
        <p className="text-gray-400 mt-1 text-sm">Everything you need to know about using Trainocate Asset Portal</p>
        <div className="flex flex-wrap gap-3 mt-4">
          <button
            onClick={downloadPDF}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-all text-sm font-medium"
          >
            📥 Download PDF
          </button>
          <button
            onClick={downloadExcel}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-all text-sm font-medium"
          >
            📥 Download Excel
          </button>
        </div>
      </div>

      {/* Quick Start */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-6 mb-8"
      >
        <h2 className="text-blue-400 font-bold text-lg mb-2">🚀 Quick Start</h2>
        <p className="text-gray-300 text-sm leading-relaxed">
          Welcome to the <span className="text-white font-semibold">Trainocate Asset Portal</span> — the IT Asset Management System for Trainocate Singapore.
          This guide will help you navigate and use all features of the system.
          Click any section below to expand it and learn more!
        </p>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { emoji: "🌐", text: "Live at tap.trainocate.com" },
            { emoji: "📱", text: "Works on mobile + desktop" },
            { emoji: "🔒", text: "Secure Supabase auth" },
          ].map((item, i) => (
            <div key={i} className="bg-blue-500/10 rounded-xl p-3 text-center">
              <p className="text-xl mb-1">{item.emoji}</p>
              <p className="text-blue-300 text-xs">{item.text}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Guide Sections */}
      <div className="space-y-3">
        {guides.map((guide, i) => {
          const colors = colorMap[guide.color]
          const isOpen = activeId === guide.id
          return (
            <motion.div
              key={guide.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`rounded-2xl border ${colors.border} overflow-hidden`}
            >
              <button
                onClick={() => setActiveId(isOpen ? null : guide.id)}
                className={`w-full px-6 py-4 flex items-center justify-between ${colors.bg} hover:opacity-90 transition-all`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{guide.emoji}</span>
                  <span className={`font-semibold ${colors.text}`}>{guide.title}</span>
                </div>
                <motion.span
                  animate={{ rotate: isOpen ? 180 : 0 }}
                  className={`${colors.text} text-lg`}
                >
                  ↓
                </motion.span>
              </button>

              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="bg-gray-900/80 px-6 py-4"
                  >
                    <div className="space-y-3">
                      {guide.steps.map((step, j) => (
                        <motion.div
                          key={j}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: j * 0.05 }}
                          className="flex items-start gap-3"
                        >
                          <div className={`w-2 h-2 rounded-full ${colors.dot} mt-2 shrink-0`} />
                          <p className="text-gray-300 text-sm leading-relaxed">{step}</p>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })}
      </div>

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-8 bg-gray-900/80 rounded-2xl border border-gray-800 p-6 text-center"
      >
        <p className="text-2xl mb-2">🙏</p>
        <p className="text-white font-semibold mb-1">Need more help?</p>
        <p className="text-gray-400 text-sm">Contact your IT Administrator or refer to the Trainocate Asset Portal documentation.</p>
        <p className="text-gray-600 text-xs mt-3">Trainocate Asset Portal v1.0 — Trainocate Singapore © 2026</p>
      </motion.div>
    </div>
  )
}