import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors })
  }

  // ── Always return 200 with { error } in body so the frontend can read
  // ── the real error message (FunctionsHttpError hides non-2xx bodies).
  const ok = (payload: object) =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    })

  const fail = (msg: string, code = 200) => {
    console.error("[create-user] Error:", msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: code,
      headers: { ...cors, "Content-Type": "application/json" },
    })
  }

  try {
    // ── 0. Check required env vars ─────────────────────────────────────────
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("[create-user] Missing env: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
      return fail("Server configuration error — contact administrator")
    }

    // ── Single admin client (service role) — bypasses RLS for all operations
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    // ── 1. Extract and validate the caller's JWT ───────────────────────────
    const authHeader = req.headers.get("Authorization") ?? ""
    const token = authHeader.replace(/^Bearer\s+/i, "").trim()

    console.log("[create-user] Step 1 — auth header present:", !!token)

    if (!token) {
      return fail("Missing auth token — please log in again", 401)
    }

    // Pass the token directly to getUser() — correct server-side JWT check
    const { data: { user: callerUser }, error: jwtError } = await adminClient.auth.getUser(token)

    console.log("[create-user] Step 2 — JWT user:", callerUser?.id ?? "null", "error:", jwtError?.message ?? "none")

    if (jwtError || !callerUser) {
      return fail("Invalid or expired session — please log in again", 401)
    }

    // ── 2. Verify caller is admin (service role bypasses RLS) ──────────────
    const { data: callerProfile, error: profileErr } = await adminClient
      .from("user_profiles")
      .select("role")
      .eq("id", callerUser.id)
      .single()

    console.log("[create-user] Step 3 — caller role:", callerProfile?.role ?? "null", "error:", profileErr?.message ?? "none")

    if (profileErr || callerProfile?.role !== "admin") {
      return fail("Admin access required", 403)
    }

    // ── 3. Parse and validate request body ────────────────────────────────
    const body = await req.json()
    const { email, password, name, role, country } = body

    console.log("[create-user] Step 4 — creating user:", email, "role:", role)

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return fail("A valid email address is required")
    }
    if (!password || typeof password !== "string" || password.length < 6) {
      return fail("Password must be at least 6 characters")
    }

    // ── 4. Create Supabase Auth account ───────────────────────────────────
    const { data: newUserData, error: createError } = await adminClient.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password,
      email_confirm: true,
    })

    if (createError) {
      console.error("[create-user] Step 5 — Auth createUser failed:", createError.message, "status:", createError.status)

      // Translate common Supabase auth errors into friendly messages
      const msg = createError.message ?? ""
      if (msg.toLowerCase().includes("already registered") || msg.toLowerCase().includes("already exists") || createError.status === 422) {
        return fail(`An account with "${email}" already exists. Use a different email or delete the existing account first.`)
      }
      return fail(msg || "Failed to create auth account")
    }

    const userId = newUserData.user.id
    console.log("[create-user] Step 5 — Auth account created:", userId)

    // ── 5. Create user_profiles record ────────────────────────────────────
    const { error: upsertError } = await adminClient.from("user_profiles").upsert({
      id: userId,
      email: email.toLowerCase().trim(),
      name: name?.trim() || null,
      role: role || "standard_user",
      country: country || null,
    })

    if (upsertError) {
      console.error("[create-user] Step 6 — Profile upsert FAILED:", upsertError.message)
      // Auth account was created but profile failed — return error so admin knows
      return fail(`User auth account created but profile save failed: ${upsertError.message}. Check the user_profiles table schema.`)
    }
    console.log("[create-user] Step 6 — Profile record created for:", userId)

    // ── 6. Send welcome email directly via Resend ──────────────────────────
    try {
      const resendKey = Deno.env.get("RESEND_API_KEY")
      const fromEmail = Deno.env.get("FROM_EMAIL") ?? "TAP <tap@trainocate.com>"

      if (!resendKey) {
        console.error("[create-user] Step 7 — RESEND_API_KEY not set, skipping email")
      } else {
        const roleLabel =
          role === "admin" ? "Admin" :
          role === "standard_user" ? "Standard User" : "Guest"

        console.log("[create-user] Step 7 — Sending welcome email to:", email)

        const welcomeHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#0a0f1e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="text-align:center;margin-bottom:28px;">
      <div style="display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;background:#3b82f6;border-radius:12px;margin-bottom:10px;">
        <span style="color:#fff;font-size:18px;font-weight:800;letter-spacing:-1px;">IT</span>
      </div>
      <div style="color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Trainocate Asset Portal</div>
      <div style="color:#4b5563;font-size:11px;margin-top:2px;">IT Asset Management · Trainocate</div>
    </div>
    <div style="background:#0d1526;border:1px solid #1a2744;border-radius:16px;overflow:hidden;">
      <div style="height:4px;background:#3b82f6;"></div>
      <div style="padding:28px 28px 24px;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="font-size:44px;margin-bottom:10px;">👋</div>
          <div style="color:#fff;font-size:19px;font-weight:700;margin-bottom:8px;">Welcome to Trainocate Asset Portal, ${name || email}!</div>
          <p style="color:#9ca3af;font-size:14px;margin:0;">Your account has been created by your administrator.</p>
        </div>
        <div style="background:#060d1c;border:1px solid #1a2744;border-radius:10px;padding:16px;margin-bottom:20px;">
          <div style="color:#4b5563;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">Your Login Details</div>
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="color:#6b7280;font-size:13px;padding:7px 0;border-bottom:1px solid #1a2744;">Login URL</td>
              <td style="font-size:13px;font-weight:600;text-align:right;padding:7px 0;border-bottom:1px solid #1a2744;"><a href="https://tap.trainocate.com" style="color:#3b82f6;text-decoration:none;">https://tap.trainocate.com</a></td>
            </tr>
            <tr>
              <td style="color:#6b7280;font-size:13px;padding:7px 0;border-bottom:1px solid #1a2744;">Email</td>
              <td style="color:#f9fafb;font-size:13px;font-weight:600;text-align:right;padding:7px 0;border-bottom:1px solid #1a2744;">${email}</td>
            </tr>
            <tr>
              <td style="color:#6b7280;font-size:13px;padding:7px 0;border-bottom:1px solid #1a2744;">Password</td>
              <td style="color:#f59e0b;font-size:13px;font-weight:600;text-align:right;padding:7px 0;border-bottom:1px solid #1a2744;">${password}</td>
            </tr>
            <tr>
              <td style="color:#6b7280;font-size:13px;padding:7px 0;">Role</td>
              <td style="color:#f9fafb;font-size:13px;font-weight:600;text-align:right;padding:7px 0;">${roleLabel}</td>
            </tr>
          </table>
        </div>
        <div style="text-align:center;margin-bottom:20px;">
          <a href="https://tap.trainocate.com" style="display:inline-block;background:#3b82f6;color:#fff;font-size:14px;font-weight:600;padding:12px 32px;border-radius:10px;text-decoration:none;">Login to Trainocate Asset Portal →</a>
        </div>
        <p style="color:#6b7280;font-size:12px;text-align:center;margin:0;">Best regards, Trainocate IT Team</p>
      </div>
    </div>
    <div style="text-align:center;margin-top:20px;">
      <p style="color:#374151;font-size:11px;margin:0;">Automated notification from Trainocate Asset Portal · © 2026 Trainocate Singapore</p>
    </div>
  </div>
</body>
</html>`

        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [email],
            subject: "Welcome to Trainocate Asset Portal — Your Login Details",
            html: welcomeHtml,
          }),
        })

        const emailResult = await emailRes.json()
        if (!emailRes.ok) {
          console.error("[create-user] Step 7 — Resend error:", JSON.stringify(emailResult))
        } else {
          console.log("[create-user] Step 7 — Welcome email sent, id:", emailResult.id)
        }
      }
    } catch (emailErr) {
      // Email failure is non-fatal — user account is already created
      console.error("[create-user] Step 7 — Email exception (non-fatal):", emailErr)
    }

    // ── 7. Return success ──────────────────────────────────────────────────
    console.log("[create-user] Done — user created successfully:", userId)
    return ok({ success: true, userId })

  } catch (e) {
    console.error("[create-user] Unexpected exception:", e.message, e.stack)
    return new Response(JSON.stringify({ error: e.message || "Unexpected server error" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    })
  }
})
