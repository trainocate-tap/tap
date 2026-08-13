import { useEffect, useState } from "react"
import { supabase } from "./supabase"
import { useAuth } from "../context/AuthContext"

export const CURRENCIES = [
  { code: "SGD", symbol: "S$" },
  { code: "MYR", symbol: "RM" },
  { code: "IDR", symbol: "Rp" },
  { code: "USD", symbol: "$" },
  { code: "PHP", symbol: "₱" },
  { code: "THB", symbol: "฿" },
  { code: "VND", symbol: "₫" },
  { code: "CNY", symbol: "¥" },
]

const SYMBOLS = Object.fromEntries(CURRENCIES.map(c => [c.code, c.symbol]))
const DEFAULT_CURRENCY = "SGD"

// Currency is per-country, stored in app_settings as key "currency_<country>".
// Falls back to SGD if the current user has no country set, or no row exists yet.
export function useCurrency() {
  const { userCountry } = useAuth()
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const query = userCountry
      ? supabase.from("app_settings").select("value").eq("key", `currency_${userCountry}`).maybeSingle()
      : Promise.resolve({ data: null })
    query.then(({ data }) => {
      if (!active) return
      setCurrency(data?.value || DEFAULT_CURRENCY)
      setLoading(false)
    })
    return () => { active = false }
  }, [userCountry])

  return { currency, symbol: SYMBOLS[currency] || currency, loading }
}
