import { useState, useEffect, useRef, lazy, Suspense, memo } from "react"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { supabase } from "./lib/supabase"
import { ThemeProvider } from "./context/ThemeContext"
import { AuthProvider, useAuth } from "./context/AuthContext"
import { NotificationProvider } from "./context/NotificationContext"
import Sidebar from "./components/Sidebar"
import MarketingSidebar from "./components/MarketingSidebar"
import GlobalSearch from "./components/GlobalSearch"
import NotificationBell from "./components/NotificationBell"
import MarketingSearch from "./components/MarketingSearch"
import MarketingNavBell from "./components/MarketingNavBell"
import Particles, { initParticlesEngine } from "@tsparticles/react"
import { loadSlim } from "@tsparticles/slim"
import { motion, AnimatePresence } from "framer-motion"
// Eagerly imported so Scanner navigation never hits a Suspense suspension that blanks the page
import AssetDetail from "./pages/admin/AssetDetail"

// Lazy-loaded pages — each loads as a separate chunk on first visit
const Dashboard    = lazy(() => import("./pages/admin/Dashboard"))
const Assets       = lazy(() => import("./pages/admin/Assets"))
const AddAsset     = lazy(() => import("./pages/admin/AddAsset"))
const EditAsset    = lazy(() => import("./pages/admin/EditAsset"))
const ImportAssets = lazy(() => import("./pages/admin/ImportAssets"))
const Issues       = lazy(() => import("./pages/admin/Issues"))
const Reports      = lazy(() => import("./pages/admin/Reports"))
const Borrow       = lazy(() => import("./pages/admin/Borrow"))
const AISearch     = lazy(() => import("./pages/admin/AISearch"))
const AssetHistory = lazy(() => import("./pages/admin/AssetHistory"))
const Scanner      = lazy(() => import("./pages/admin/Scanner"))
const UserGuide    = lazy(() => import("./pages/admin/UserGuide"))
const ManageUsers  = lazy(() => import("./pages/admin/ManageUsers"))
const AssetRequests= lazy(() => import("./pages/admin/AssetRequests"))
const Maintenance  = lazy(() => import("./pages/admin/Maintenance"))
const Settings     = lazy(() => import("./pages/admin/Settings"))
const ResetPasswordPage = lazy(() => import("./pages/ResetPassword"))
// Marketing module pages
const MarketingDashboard = lazy(() => import("./pages/marketing/MarketingDashboard"))
const MarketingItems     = lazy(() => import("./pages/marketing/MarketingItems"))
const MarketingStock     = lazy(() => import("./pages/marketing/MarketingStock"))
const MarketingClasses   = lazy(() => import("./pages/marketing/MarketingClasses"))
const MarketingEvents    = lazy(() => import("./pages/marketing/MarketingEvents"))
const MarketingApprovals = lazy(() => import("./pages/marketing/MarketingApprovals"))
const MarketingReports   = lazy(() => import("./pages/marketing/MarketingReports"))
const MarketingHistory   = lazy(() => import("./pages/marketing/MarketingHistory"))
const MarketingSettings  = lazy(() => import("./pages/marketing/MarketingSettings"))
const MarketingStocktake = lazy(() => import("./pages/marketing/MarketingStocktake"))
const MarketingAds       = lazy(() => import("./pages/marketing/MarketingAds"))

// OTP is now handled entirely by Supabase Auth — no custom email sending needed

// ---------------------------------------------------------------------------
// Background animation components — defined at module level so their identity
// is stable across LoginPage re-renders (typing in inputs won't restart them).
// React.memo prevents re-renders when props haven't changed.
// ---------------------------------------------------------------------------

const MobileBackground = memo(function MobileBackground() {
  const dots = [
    { top: "8%",  left: "12%", size: 5,  color: "#3b82f6", opacity: 0.5, delay: "0s",    dur: "4s"  },
    { top: "15%", left: "78%", size: 3,  color: "#06b6d4", opacity: 0.4, delay: "0.5s",  dur: "5s"  },
    { top: "22%", left: "45%", size: 4,  color: "#a855f7", opacity: 0.35,delay: "1s",    dur: "6s"  },
    { top: "35%", left: "88%", size: 3,  color: "#3b82f6", opacity: 0.4, delay: "1.5s",  dur: "4.5s"},
    { top: "42%", left: "6%",  size: 5,  color: "#06b6d4", opacity: 0.3, delay: "0.8s",  dur: "7s"  },
    { top: "55%", left: "60%", size: 3,  color: "#ec4899", opacity: 0.35,delay: "2s",    dur: "5.5s"},
    { top: "62%", left: "25%", size: 4,  color: "#3b82f6", opacity: 0.4, delay: "0.3s",  dur: "6s"  },
    { top: "70%", left: "82%", size: 3,  color: "#a855f7", opacity: 0.3, delay: "1.2s",  dur: "4s"  },
    { top: "78%", left: "40%", size: 5,  color: "#06b6d4", opacity: 0.35,delay: "2.5s",  dur: "5s"  },
    { top: "85%", left: "15%", size: 3,  color: "#3b82f6", opacity: 0.4, delay: "0.6s",  dur: "6.5s"},
    { top: "90%", left: "70%", size: 4,  color: "#ec4899", opacity: 0.3, delay: "1.8s",  dur: "4.5s"},
    { top: "5%",  left: "55%", size: 3,  color: "#a855f7", opacity: 0.35,delay: "3s",    dur: "5s"  },
    { top: "48%", left: "92%", size: 4,  color: "#3b82f6", opacity: 0.3, delay: "2.2s",  dur: "7s"  },
    { top: "30%", left: "3%",  size: 3,  color: "#06b6d4", opacity: 0.4, delay: "1s",    dur: "4s"  },
    { top: "72%", left: "52%", size: 5,  color: "#3b82f6", opacity: 0.3, delay: "0.4s",  dur: "6s"  },
  ]
  return (
    <>
      <style>{`
        @keyframes floatDot {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
      `}</style>
      {dots.map((d, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: d.top,
            left: d.left,
            width: d.size,
            height: d.size,
            borderRadius: "50%",
            backgroundColor: d.color,
            opacity: d.opacity,
            animation: `floatDot ${d.dur} ${d.delay} ease-in-out infinite`,
            pointerEvents: "none",
          }}
        />
      ))}
    </>
  )
})

const DesktopBackground = memo(function DesktopBackground({ particlesReady }) {
  return (
    <>
      {particlesReady && (
        <Particles
          options={{
            background: { color: { value: "transparent" } },
            particles: {
              number: { value: 80 },
              color: { value: "#3b82f6" },
              opacity: { value: 0.3 },
              size: { value: { min: 1, max: 3 } },
              move: { enable: true, speed: 1 },
              links: { enable: true, color: "#3b82f6", opacity: 0.2, distance: 150 },
            },
            interactivity: { events: { onHover: { enable: true, mode: "repulse" } } },
          }}
          className="absolute inset-0"
        />
      )}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
    </>
  )
})

const ParticlesBackground = memo(function ParticlesBackground({ particlesReady }) {
  const isMobile = window.innerWidth < 768
  return isMobile ? <MobileBackground /> : <DesktopBackground particlesReady={particlesReady} />
})

// ---------------------------------------------------------------------------

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

const BrandLogo = memo(() => (
  <img src="/trainocate-logo.png" alt="Trainocate" style={{width:"180px", borderRadius:"16px", display:"block", margin:"0 auto", boxShadow:"0 4px 20px rgba(0,0,0,0.3)"}} />
))

function LoginPage({ onVerified }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(() => {
    // Show error from AuthContext if a deleted/missing-profile user was just signed out
    const stored = sessionStorage.getItem("itams_auth_error")
    if (stored) {
      sessionStorage.removeItem("itams_auth_error")
      return stored
    }
    return ""
  })
  const [particlesReady, setParticlesReady] = useState(false)
  // OTP step
  const [step, setStep] = useState("credentials") // "credentials" | "otp"
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""])
  const [otpSending, setOtpSending] = useState(false)
  const [otpError, setOtpError] = useState("")
  const [resendCooldown, setResendCooldown] = useState(0)
  const otpInputs = useRef([])
  // Forgot password
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [showFailedPopup, setShowFailedPopup] = useState(false)
  const [showForgotForm, setShowForgotForm] = useState(false)
  const [forgotEmail, setForgotEmail] = useState("")
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotError, setForgotError] = useState("")

  useEffect(() => {
    if (window.innerWidth >= 768) {
      initParticlesEngine(async (engine) => {
        await loadSlim(engine)
      }).then(() => setParticlesReady(true))
    }
  }, [])

  // Countdown timer for resend
  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  // Auto-dismiss the "3 failed attempts" popup after 5 s
  useEffect(() => {
    if (!showFailedPopup) return
    const t = setTimeout(() => setShowFailedPopup(false), 5000)
    return () => clearTimeout(t)
  }, [showFailedPopup])

  // Auto-dismiss login error after 5 s
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(""), 5000)
    return () => clearTimeout(t)
  }, [error])

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      const newFailed = failedAttempts + 1
      setFailedAttempts(newFailed)
      if (newFailed >= 3) setShowFailedPopup(true)
      const msg = authError.message?.toLowerCase() ?? ""
      setError(
        msg.includes("invalid login credentials") || msg.includes("invalid credentials")
          ? "Account not found or has been deactivated. Please contact your administrator!"
          : authError.message
      )
      setLoading(false)
      return
    }

    // Successful — reset failure counter
    setFailedAttempts(0)
    setShowFailedPopup(false)

    // Check if 2FA is enabled for this user
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("two_factor_enabled")
      .eq("id", data.user.id)
      .single()

    // Record last login time
    await supabase.from("user_profiles").update({ last_login: new Date().toISOString() }).eq("id", data.user.id)

    if (profile?.two_factor_enabled) {
      // Sign out temporarily — user must complete OTP first
      await supabase.auth.signOut()
      setOtpSending(true)
      // Use Supabase Auth built-in OTP — sends 6-digit code, NOT a magic link
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: undefined,
          channel: 'email'
        },
      })
      setOtpSending(false)
      if (otpErr) {
        setError("Failed to send verification email. Please try again.")
        setLoading(false)
        return
      }
      setStep("otp")
      setResendCooldown(60)
      setLoading(false)
      setTimeout(() => otpInputs.current[0]?.focus(), 100)
    } else {
      // No 2FA — already signed in, notify parent
      onVerified()
      setLoading(false)
    }
  }

  const handleOtpDigit = (i, val) => {
    const cleaned = val.replace(/\D/g, "").slice(-1)
    const next = [...otpDigits]
    next[i] = cleaned
    setOtpDigits(next)
    setOtpError("")
    if (cleaned && i < 5) otpInputs.current[i + 1]?.focus()
    if (next.every(d => d)) handleVerifyOtp(next.join(""))
  }

  const handleOtpKeyDown = (i, e) => {
    if (e.key === "Backspace" && !otpDigits[i] && i > 0) {
      otpInputs.current[i - 1]?.focus()
    }
  }

  const handleOtpPaste = (e) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)
    if (pasted.length === 6) {
      setOtpDigits(pasted.split(""))
      handleVerifyOtp(pasted)
    }
  }

  const handleVerifyOtp = async (code) => {
    const entered = code || otpDigits.join("")
    if (entered.length !== 6) return
    setLoading(true)
    setOtpError("")
    // Verify the code with Supabase Auth — handles expiry and correctness server-side
    const { error: verifyErr } = await supabase.auth.verifyOtp({
      email,
      token: entered,
      type: "email",
    })
    if (verifyErr) {
      setOtpError("Incorrect or expired code. Please try again.")
      setOtpDigits(["", "", "", "", "", ""])
      setTimeout(() => otpInputs.current[0]?.focus(), 50)
      setLoading(false)
      return
    }
    // Supabase has now signed the user in — record last login and notify parent
    const { data: { user: otpUser } } = await supabase.auth.getUser()
    if (otpUser?.id) await supabase.from("user_profiles").update({ last_login: new Date().toISOString() }).eq("id", otpUser.id)
    onVerified()
    setLoading(false)
  }

  const handleResend = async () => {
    if (resendCooldown > 0) return
    setOtpSending(true)
    await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: undefined },
    })
    setOtpDigits(["", "", "", "", "", ""])
    setOtpError("")
    setOtpSending(false)
    setResendCooldown(60)
    otpInputs.current[0]?.focus()
  }

  const handleForgotPassword = async (e) => {
    e.preventDefault()
    setForgotLoading(true)
    setForgotError("")
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(
      (forgotEmail || email).trim(),
      { redirectTo: "https://tap.trainocate.com/reset-password" }
    )
    if (resetErr) {
      const msg = resetErr.message?.toLowerCase() ?? ""
      if (msg.includes("not found") || msg.includes("no user") || msg.includes("invalid email") || msg.includes("user not found")) {
        setForgotError("No account found with this email.")
      } else if (msg.includes("rate") || msg.includes("limit") || msg.includes("too many")) {
        setForgotError("Too many requests. Please try again later.")
      } else {
        setForgotError("Please try again later.")
      }
      setForgotLoading(false)
      return
    }
    setForgotSent(true)
    setForgotLoading(false)
  }

  const Brand = () => (
    <div className="text-center mb-10">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-5"
      >
        <BrandLogo />
      </motion.div>
      <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">Trainocate Asset Portal</h1>
      <p className="text-gray-500 text-sm">Trainocate Singapore</p>
    </div>
  )

  if (step === "otp") {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4 relative overflow-hidden">
        <ParticlesBackground particlesReady={particlesReady} />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md relative z-10"
        >
          <Brand />
          <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl p-8 border border-gray-800 shadow-2xl">
            <div className="text-center mb-6">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200 }}
                className="inline-flex items-center justify-center w-14 h-14 bg-blue-500/20 border border-blue-500/40 rounded-2xl mb-3"
              >
                <span className="text-2xl">🔐</span>
              </motion.div>
              <h2 className="text-white text-xl font-semibold">Two-Factor Verification</h2>
              <p className="text-gray-400 text-sm mt-1">
                Enter the 6-digit code sent to
              </p>
              <p className="text-blue-400 text-sm font-medium">{email}</p>
            </div>

            {otpError && (
              <motion.div
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 mb-4 text-sm text-center"
              >
                {otpError}
              </motion.div>
            )}

            {/* OTP digit boxes */}
            <div className="flex gap-2 justify-center mb-6" onPaste={handleOtpPaste}>
              {otpDigits.map((d, i) => (
                <input
                  key={i}
                  ref={el => otpInputs.current[i] = el}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={e => handleOtpDigit(i, e.target.value)}
                  onKeyDown={e => handleOtpKeyDown(i, e)}
                  className={`w-12 h-14 text-center text-xl font-bold rounded-xl border bg-gray-800 text-white focus:outline-none transition-all ${
                    d ? "border-blue-500 bg-blue-500/10" : "border-gray-700 focus:border-blue-500"
                  }`}
                />
              ))}
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleVerifyOtp()}
              disabled={loading || otpDigits.some(d => !d)}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-all"
            >
              {loading ? "Verifying..." : "Verify Code →"}
            </motion.button>

            <div className="mt-4 flex items-center justify-between text-sm">
              <button
                onClick={() => { setStep("credentials"); setOtpDigits(["","","","","",""]); setOtpError("") }}
                className="text-gray-500 hover:text-gray-300 transition-all"
              >
                ← Back
              </button>
              <button
                onClick={handleResend}
                disabled={resendCooldown > 0 || otpSending}
                className="text-blue-400 hover:text-blue-300 disabled:text-gray-600 transition-all"
              >
                {otpSending ? "Sending…" : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
              </button>
            </div>

            <p className="text-gray-600 text-xs text-center mt-4">Check your inbox — code sent via Supabase</p>
          </div>
          <p className="text-center text-gray-600 text-xs mt-6">
            © 2026 Trainocate Singapore · Trainocate Asset Portal v1.0
          </p>
        </motion.div>
      </div>
    )
  }

  // The form card + forgot-password section — shared between mobile and desktop right side
  const FormSection = (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-md relative z-10"
    >
      {/* Trainocate logo — top center of login form area (desktop only, left panel removed) */}
      <div className="hidden md:flex flex-col items-center mb-6">
        <img src="/trainocate-logo.png" width="160" style={{filter: "none"}} />
        <p className="text-white text-2xl font-semibold tracking-tight mt-3">Trainocate Asset Portal</p>
      </div>

      {/* Brand shown only on mobile (hidden on desktop where left panel shows it) */}
      <div className="md:hidden">
        <Brand />
      </div>

      {/* ── Main login card ── */}
      <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl p-8 border border-gray-800 shadow-2xl">
        <h2 className="text-white text-xl font-semibold mb-6">Sign in to your account</h2>
        <AnimatedError message={error} onDismiss={() => setError("")} />
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-gray-400 text-sm mb-2 block">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
              placeholder="you@trainocate.com"
              required
            />
          </div>
          <div>
            <label className="text-gray-400 text-sm mb-2 block">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
              placeholder="••••••••"
              required
            />
            {/* Forgot Password link — glows when popup is visible */}
            <div className="flex justify-end mt-2">
              <button
                type="button"
                onClick={() => {
                  setShowForgotForm(f => !f)
                  setForgotSent(false)
                  setForgotError("")
                  setForgotEmail(email)
                }}
                className={`text-xs transition-all duration-200 ${
                  showFailedPopup
                    ? "text-cyan-300 underline drop-shadow-[0_0_8px_rgba(34,211,238,0.9)]"
                    : "text-cyan-500 hover:text-cyan-300 hover:underline hover:drop-shadow-[0_0_6px_rgba(34,211,238,0.6)]"
                }`}
              >
                Forgot Password?
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading || otpSending}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition-all duration-200 shadow-lg shadow-blue-500/20 mt-2"
          >
            {loading ? "Signing in..." : otpSending ? "Sending 2FA code..." : "Sign In →"}
          </button>
        </form>
      </div>

      {/* ── Forgot-password inline form (slides down) ── */}
      <AnimatePresence>
        {showForgotForm && (
          <motion.div
            key="forgot-form"
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 12 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.35, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-800 shadow-2xl">
              {forgotSent ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-2"
                >
                  <div className="text-4xl mb-3">📧</div>
                  <h3 className="text-white font-semibold mb-1">Email Sent!</h3>
                  <p className="text-gray-400 text-sm mt-1">
                    Reset link sent! Check your email inbox! 📧
                  </p>
                </motion.div>
              ) : (
                <>
                  <h3 className="text-white font-semibold mb-1">Reset Your Password</h3>
                  <p className="text-gray-500 text-sm mb-4">
                    Enter your email and we'll send you a reset link!
                  </p>
                  {forgotError && (
                    <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-3 py-2 mb-3 text-sm">
                      {forgotError}
                    </div>
                  )}
                  <form onSubmit={handleForgotPassword} className="space-y-3">
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={e => setForgotEmail(e.target.value)}
                      className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 border border-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all text-sm"
                      placeholder="you@trainocate.com"
                      required
                    />
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={forgotLoading}
                        className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition-all text-sm flex items-center justify-center gap-2"
                      >
                        {forgotLoading ? (
                          <>
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                            Sending...
                          </>
                        ) : "Send Reset Link"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowForgotForm(false)}
                        className="px-4 py-2.5 rounded-xl border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-all text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="text-center text-gray-600 text-xs mt-6">
        © 2026 Trainocate Singapore · Trainocate Asset Portal v1.0
      </p>
    </motion.div>
  )

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col md:flex-row relative overflow-hidden">
      <ParticlesBackground particlesReady={particlesReady} />

      {/* ── Failed-attempts popup (slides in from top, shakes) ── */}
      <AnimatePresence>
        {showFailedPopup && (
          <motion.div
            key="failed-popup"
            initial={{ opacity: 0, y: -80 }}
            animate={{
              opacity: 1, y: 0,
              x: [0, -9, 9, -7, 7, -4, 4, 0],
            }}
            exit={{ opacity: 0, y: -80, transition: { duration: 0.3 } }}
            transition={{ duration: 0.45, x: { duration: 0.55, delay: 0.25 } }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4"
          >
            <div style={{
              background: "rgba(10, 14, 30, 0.92)",
              backdropFilter: "blur(14px)",
              border: "0.5px solid rgba(59,130,246,0.85)",
              boxShadow: "0 0 18px rgba(59,130,246,0.35), 0 0 50px rgba(59,130,246,0.12)",
              borderRadius: "16px",
              padding: "14px 18px",
            }}>
              <div className="flex items-start gap-3">
                <span className="text-2xl mt-0.5 shrink-0">🔑</span>
                <div className="flex-1">
                  <p className="text-white text-sm font-medium leading-relaxed">
                    Having trouble signing in?<br />
                    Click{" "}
                    <span className="text-cyan-400 font-semibold">Forgot Password</span>
                    {" "}below<br />
                    to reset your password! 😊
                  </p>
                </div>
                <button
                  onClick={() => setShowFailedPopup(false)}
                  className="text-gray-500 hover:text-gray-300 transition-colors text-base leading-none shrink-0 ml-1"
                >✕</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Centered login layout (left panel removed, uses bg-gray-950 from outer container) ── */}
      <div className="flex-1 flex items-center justify-center p-4 relative z-10">
        {FormSection}
      </div>
    </div>
  )
}


function PageLoader() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center gap-3">
        <div className="flex gap-1.5">
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "120ms" }} />
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "240ms" }} />
        </div>
        <p className="text-gray-600 text-xs">Loading...</p>
      </div>
    </div>
  )
}

function MarketingLayout({ user }) {
  return (
    <AuthProvider user={user}>
      <div style={{ display: "flex", minHeight: "100vh", backgroundColor: "#0a1a1f", position: "relative", overflow: "hidden" }}>
        <motion.div
          animate={{ x: [0, 60, -40, 0], y: [0, -60, 40, 0], scale: [1, 1.2, 0.8, 1] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          style={{ position: "fixed", top: "-10%", right: "-10%", zIndex: 0, width: "500px", height: "500px", borderRadius: "50%",
            background: "radial-gradient(circle, rgba(6,182,212,0.25), transparent 70%)", pointerEvents: "none" }}
        />
        <motion.div
          animate={{ x: [0, -40, 60, 0], y: [0, 40, -60, 0], scale: [1, 0.8, 1.2, 1] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          style={{ position: "fixed", bottom: "-10%", left: "-10%", zIndex: 0, width: "500px", height: "500px", borderRadius: "50%",
            background: "radial-gradient(circle, rgba(20,184,166,0.2), transparent 70%)", pointerEvents: "none" }}
        />
        <div style={{ display: "flex", flex: 1, position: "relative", zIndex: 1, minWidth: 0 }}>
          <MarketingSidebar />
          <main className="flex-1 overflow-auto pt-14 md:pt-0 md:ml-72">
            <div className="sticky top-0 z-50 hidden md:flex items-center gap-3 px-4 py-2" style={{ background: "rgba(7,25,32,0.85)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", borderBottom: "1px solid rgba(6,182,212,0.15)", isolation: "auto" }}>
              <MarketingSearch />
            </div>
            <div className="hidden md:block" style={{ position: "fixed", top: "8px", right: "16px", zIndex: 9998 }}>
              <MarketingNavBell />
            </div>
            <Suspense fallback={<PageLoader />}>
              {/* Paths here are RELATIVE to the parent /marketing/* match */}
              <Routes>
                <Route path="dashboard"  element={<MarketingDashboard />} />
                <Route path="items"      element={<MarketingItems />} />
                <Route path="stock"      element={<MarketingStock />} />
                <Route path="classes"    element={<MarketingClasses />} />
                <Route path="events"     element={<MarketingEvents />} />
                <Route path="approvals"  element={<MarketingApprovals />} />
                <Route path="reports"    element={<MarketingReports />} />
                <Route path="history"    element={<MarketingHistory />} />
                <Route path="settings"   element={<MarketingSettings />} />
                <Route path="stocktake"  element={<MarketingStocktake />} />
                <Route path="ads"        element={<MarketingAds />} />
                <Route path="*"          element={<Navigate to="/marketing/dashboard" replace />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </div>
    </AuthProvider>
  )
}

function InactivityLogout() {
  const IDLE_MS = 15 * 60 * 1000   // 15 min
  const WARN_MS = 2  * 60 * 1000   // 2 min warning countdown
  const [showWarning, setShowWarning] = useState(false)
  const [countdown, setCountdown] = useState(WARN_MS / 1000)
  const idleTimer = useRef(null)
  const countdownTimer = useRef(null)

  const resetIdle = () => {
    if (showWarning) return
    clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => {
      setShowWarning(true)
      setCountdown(WARN_MS / 1000)
    }, IDLE_MS)
  }

  useEffect(() => {
    const events = ["mousemove", "keydown", "mousedown", "touchstart", "scroll"]
    events.forEach(e => window.addEventListener(e, resetIdle, { passive: true }))
    resetIdle()
    return () => {
      events.forEach(e => window.removeEventListener(e, resetIdle))
      clearTimeout(idleTimer.current)
      clearInterval(countdownTimer.current)
    }
  }, [showWarning])

  useEffect(() => {
    if (!showWarning) { clearInterval(countdownTimer.current); return }
    countdownTimer.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(countdownTimer.current); supabase.auth.signOut(); return 0 }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(countdownTimer.current)
  }, [showWarning])

  const stayLoggedIn = () => {
    setShowWarning(false)
    clearInterval(countdownTimer.current)
    resetIdle()
  }

  if (!showWarning) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ opacity: 0, y: -40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -40, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 220, damping: 24 }}
          className="bg-gray-900 rounded-2xl border border-yellow-500/40 p-6 w-full max-w-sm shadow-2xl text-center"
          style={{ boxShadow: "0 0 40px rgba(234,179,8,0.2)" }}
        >
          <div className="text-4xl mb-3">⚠️</div>
          <h3 className="text-white font-bold text-lg mb-1">Still there?</h3>
          <p className="text-gray-400 text-sm mb-4">
            You will be logged out in{" "}
            <span className="text-yellow-400 font-bold text-lg">{countdown}s</span>
          </p>
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden mb-5">
            <motion.div
              initial={{ width: "100%" }}
              animate={{ width: "0%" }}
              transition={{ duration: WARN_MS / 1000, ease: "linear" }}
              className="h-full bg-yellow-500 rounded-full"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => supabase.auth.signOut()}
              className="flex-1 py-2.5 rounded-xl border border-gray-700 text-gray-400 hover:text-white text-sm transition-all"
            >
              Log Out Now
            </button>
            <button
              onClick={stayLoggedIn}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-all"
              style={{ boxShadow: "0 0 16px rgba(59,130,246,0.3)" }}
            >
              Stay Logged In
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

function TopBarBell() {
  const { isGuest } = useAuth()
  if (isGuest) return null
  return <NotificationBell />
}

function AdminLayout({ user }) {
  return (
    <AuthProvider user={user}>
    <NotificationProvider>
    <div style={{ display: "flex", minHeight: "100vh", backgroundColor: "#050510", position: "relative", overflow: "visible" }}>

      <motion.div
        animate={{ x: [0, 60, -40, 0], y: [0, -60, 40, 0], scale: [1, 1.2, 0.8, 1] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "fixed", top: "-10%", right: "-10%", zIndex: 0,
          width: "500px", height: "500px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(59,130,246,0.35), transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <motion.div
        animate={{ x: [0, -40, 60, 0], y: [0, 40, -60, 0], scale: [1, 0.8, 1.2, 1] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "fixed", bottom: "-10%", left: "-10%", zIndex: 0,
          width: "500px", height: "500px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(139,92,246,0.35), transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <motion.div
        animate={{ x: [0, 40, -20, 0], y: [0, -20, 40, 0], scale: [1, 1.3, 0.7, 1] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "fixed", top: "40%", right: "30%", zIndex: 0,
          width: "400px", height: "400px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(6,182,212,0.25), transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <motion.div
        animate={{ x: [0, -60, 20, 0], y: [0, 20, -40, 0], scale: [1, 0.7, 1.3, 1] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "fixed", bottom: "30%", right: "10%", zIndex: 0,
          width: "350px", height: "350px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(236,72,153,0.25), transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div style={{ display: "flex", flex: 1, position: "relative", zIndex: 1 }}>
        <Sidebar />
        <main className="flex-1 overflow-auto pt-14 md:pt-0 md:ml-72">
          <div className="sticky top-0 z-30 bg-gray-950/80 backdrop-blur-sm border-b border-gray-800/50 px-4 py-2 hidden md:flex items-center gap-2">
            <GlobalSearch />
            <TopBarBell />
          </div>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/admin" element={<Dashboard />} />
              <Route path="/admin/assets" element={<Assets />} />
              <Route path="/admin/add-asset" element={<AddAsset />} />
              <Route path="/admin/edit-asset/:id" element={<EditAsset />} />
              <Route path="/admin/assets/:id" element={<AssetDetail />} />
              <Route path="/admin/import" element={<ImportAssets />} />
              <Route path="/admin/issues" element={<Issues />} />
              <Route path="/admin/reports" element={<Reports />} />
              <Route path="/admin/borrow" element={<Borrow />} />
              <Route path="/admin/ai-search" element={<AISearch />} />
              <Route path="/admin/history" element={<AssetHistory />} />
              <Route path="/admin/scanner" element={<Scanner />} />
              <Route path="/admin/guide" element={<UserGuide />} />
              <Route path="/admin/users" element={<ManageUsers />} />
              <Route path="/admin/requests" element={<AssetRequests />} />
              <Route path="/admin/maintenance" element={<Maintenance />} />
              <Route path="/admin/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/admin" />} />
            </Routes>
          </Suspense>
        </main>
      </div>
      <InactivityLogout />
    </div>
    </NotificationProvider>
    </AuthProvider>
  )
}

function AppRouter({ user, mfaVerified, onVerified }) {
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(true)

  useEffect(() => {
    if (!user) { setProfile(null); setProfileLoading(false); return }
    setProfileLoading(true)
    supabase.from("user_profiles").select("role,marketing_access").eq("id", user.id).single()
      .then(({ data }) => { setProfile(data); setProfileLoading(false) })
  }, [user?.id])

  if (!user || !mfaVerified) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage onVerified={onVerified} />} />
        <Route path="/reset-password" element={
          <Suspense fallback={<div className="min-h-screen bg-black flex items-center justify-center"><p className="text-white">Loading...</p></div>}>
            <ResetPasswordPage />
          </Suspense>
        } />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    )
  }

  // Wait for profile before deciding which layout to render
  if (profileLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-white text-sm">Loading...</p>
      </div>
    )
  }

  // Marketing-only users → marketing module
  const isMarketingOnly = profile?.marketing_access && profile?.role !== "admin"
  const canAccessMarketing = profile?.marketing_access || profile?.role === "admin"

  return (
    <Routes>
      <Route path="/login" element={<Navigate to={isMarketingOnly ? "/marketing/dashboard" : "/admin"} replace />} />
      <Route path="/reset-password" element={
        <Suspense fallback={<div className="min-h-screen bg-black flex items-center justify-center"><p className="text-white">Loading...</p></div>}>
          <ResetPasswordPage />
        </Suspense>
      } />
      {/* Marketing module routes */}
      <Route path="/marketing/*" element={
        canAccessMarketing
          ? <MarketingLayout user={user} />
          : <Navigate to="/admin" replace />
      } />
      {/* IT ITAMS routes — marketing users can switch here via the module toggle;
          AdminLayout/Sidebar renders the right view (full admin vs standard) based on marketing_role */}
      <Route path="/*" element={<AdminLayout user={user} />} />
    </Routes>
  )
}

export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mfaVerified, setMfaVerified] = useState(false)

  // Issue 23 — Session Isolation: force sign out on fresh page load if no active session flag
  useEffect(() => {
    const isActive = sessionStorage.getItem("itams_session_active")
    if (!isActive) {
      supabase.auth.signOut()
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) setMfaVerified(true)
      setLoading(false)
    })
    supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (!session?.user) setMfaVerified(false)
    })
  }, [])

  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <p className="text-white">Loading...</p>
    </div>
  )

  return (
    <ThemeProvider>
      <BrowserRouter>
        <AppRouter user={user} mfaVerified={mfaVerified} onVerified={() => { sessionStorage.setItem("itams_session_active", "1"); setMfaVerified(true) }} />
      </BrowserRouter>
    </ThemeProvider>
  )
}