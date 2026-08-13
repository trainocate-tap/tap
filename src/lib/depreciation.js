const DEFAULT_LIFESPAN_YEARS = 5

export function calcDepreciation(purchasePrice, purchaseDate, usefulLife, asOfDate) {
  if (!purchasePrice || !purchaseDate) return null

  const price = parseFloat(purchasePrice)
  if (isNaN(price) || price <= 0) return null

  const lifespanYears = parseFloat(usefulLife) > 0 ? parseFloat(usefulLife) : DEFAULT_LIFESPAN_YEARS

  const msPerYear = 1000 * 60 * 60 * 24 * 365.25
  const asOf = asOfDate ? new Date(asOfDate).getTime() : Date.now()
  const yearsOld = (asOf - new Date(purchaseDate)) / msPerYear
  const perYear = price / lifespanYears
  const depreciated = Math.min(price, perYear * Math.max(0, yearsOld))
  const currentValue = Math.max(0, price - depreciated)
  const percentDepreciated = Math.min(100, (depreciated / price) * 100)
  const remainingYears = Math.max(0, lifespanYears - yearsOld)

  return {
    originalPrice: price,
    currentValue: Math.round(currentValue * 100) / 100,
    accumulatedDepreciation: Math.round(depreciated * 100) / 100,
    perYear: Math.round(perYear * 100) / 100,
    perMonth: Math.round((perYear / 12) * 100) / 100,
    usefulLife: lifespanYears,
    percentDepreciated: Math.round(percentDepreciated * 10) / 10,
    percentRemaining: Math.round((100 - percentDepreciated) * 10) / 10,
    yearsOld: Math.round(yearsOld * 10) / 10,
    remainingYears: Math.round(remainingYears * 10) / 10,
    fullyDepreciated: yearsOld >= lifespanYears,
  }
}

export function fmtCurrency(val, currencyCode = "SGD") {
  return `${currencyCode} ${Number(val).toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
