import { createContext, useContext, useEffect, useState } from "react"
import { supabase } from "../lib/supabase"

const AuthContext = createContext({})

export function AuthProvider({ children, user }) {
  const [userProfile, setUserProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      setUserProfile(null)
      setProfileLoading(false)
      return
    }
    fetchProfile(user)
  }, [user?.id])

  const fetchProfile = async (u) => {
    setProfileLoading(true)
    const { data } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("id", u.id)
      .single()

    if (data) {
      // Sync email from auth if it has changed (e.g. admin updated it in Supabase)
      if (data.email !== u.email) {
        await supabase.from("user_profiles").update({ email: u.email }).eq("id", u.id)
        data.email = u.email
      }
      setUserProfile(data)
    } else {
      // No profile found — this account was deleted or never provisioned by an admin.
      // Do NOT auto-create a guest profile. Sign out immediately and show an error.
      console.warn("[AuthContext] No profile found for user:", u.id, "— signing out.")
      // Store the error message in sessionStorage so the login page can display it
      sessionStorage.setItem(
        "itams_auth_error",
        "Account not found. Please contact your administrator!"
      )
      // Sign out — this triggers onAuthStateChange → user becomes null → redirect to /login
      await supabase.auth.signOut()
      setUserProfile(null)
    }
    setProfileLoading(false)
  }

  const role = userProfile?.role || "guest"
  const isGlobalAdmin = role === "global_admin"
  const isMarketing = !!userProfile?.marketing_access
  const marketingRole = userProfile?.marketing_role || null
  // global_admin gets the same marketing management rights as admin.
  const canManageMarketing = ["marketing_admin", "marketing_manager"].includes(marketingRole) || role === "admin" || isGlobalAdmin
  // Non-admin marketing users without an elevated marketing role (marketing_staff, bdm, bdms)
  // see the standard IT user view when switching to the IT module; marketing_admin/marketing_manager
  // see the full IT admin view instead (via canManageMarketing).
  const isMarketingOnly = isMarketing && !canManageMarketing

  return (
    <AuthContext.Provider value={{
      userProfile,
      profileLoading,
      role,
      isAdmin: role === "admin",
      isGlobalAdmin,
      isStandardUser: role === "standard_user",
      isGuest: role === "guest",
      isMarketing,
      marketingRole,
      canManageMarketing,
      isMarketingOnly,
      // global_admin has the same permissions as admin everywhere below.
      canEdit: role === "admin" || isGlobalAdmin,
      canDelete: role === "admin" || isGlobalAdmin,
      canManageUsers: role === "admin" || isGlobalAdmin,
      canBorrow: role === "admin" || isGlobalAdmin || role === "standard_user",
      canSubmitRequests: role === "admin" || isGlobalAdmin || role === "standard_user",
      canSubmitMaintenance: role === "admin" || isGlobalAdmin || role === "standard_user",
      userCountry: userProfile?.country || null,
      refetchProfile: () => user && fetchProfile(user),
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
