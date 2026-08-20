const DEFAULT_LIFESPAN_YEARS = 5

// Whole months elapsed between two dates (a partial month doesn't count until
// the day-of-month of `start` has been reached in the later month). If `end`
// is the last day of its month, that month is treated as fully elapsed —
// e.g. "as of Aug 31" counts August in full, since it's the report month.
function monthsBetween(start, end) {
  const s = new Date(start)
  let e = new Date(end)

  const lastDayOfEndMonth = new Date(e.getFullYear(), e.getMonth() + 1, 0).getDate()
  if (e.getDate() === lastDayOfEndMonth) {
    e = new Date(e.getFullYear(), e.getMonth() + 1, 1)
  }

  let months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth())
  if (e.getDate() < s.getDate()) months -= 1
  return months
}

export function calcDepreciation(purchasePrice, purchaseDate, usefulLife, asOfDate) {
  if (!purchasePrice || !purchaseDate) return null

  const price = parseFloat(purchasePrice)
  if (isNaN(price) || price <= 0) return null

  const lifespanYears = parseFloat(usefulLife) > 0 ? parseFloat(usefulLife) : DEFAULT_LIFESPAN_YEARS
  const lifespanMonths = lifespanYears * 12

  const asOf = asOfDate ? new Date(asOfDate) : new Date()
  const monthsElapsed = Math.max(0, monthsBetween(purchaseDate, asOf))
  const monthlyDepreciation = price / lifespanMonths
  const depreciated = Math.min(price, monthsElapsed * monthlyDepreciation)
  const currentValue = Math.max(0, price - depreciated)
  const percentDepreciated = Math.min(100, (depreciated / price) * 100)
  const yearsOld = monthsElapsed / 12
  const remainingYears = Math.max(0, lifespanYears - yearsOld)

  return {
    originalPrice: price,
    currentValue: Math.round(currentValue * 100) / 100,
    accumulatedDepreciation: Math.round(depreciated * 100) / 100,
    perYear: Math.round(monthlyDepreciation * 12 * 100) / 100,
    perMonth: Math.round(monthlyDepreciation * 100) / 100,
    usefulLife: lifespanYears,
    percentDepreciated: Math.round(percentDepreciated * 10) / 10,
    percentRemaining: Math.round((100 - percentDepreciated) * 10) / 10,
    yearsOld: Math.round(yearsOld * 10) / 10,
    remainingYears: Math.round(remainingYears * 10) / 10,
    fullyDepreciated: monthsElapsed >= lifespanMonths,
  }
}

export function fmtCurrency(val, currencyCode = "SGD") {
  return `${currencyCode} ${Number(val).toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
