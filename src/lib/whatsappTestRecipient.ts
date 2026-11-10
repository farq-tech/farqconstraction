/** Accept Saudi mobile input for the one-off Cloud test without guessing a country. */
export function normalizeSaudiWhatsAppTestRecipient(value: string): string | null {
  const normalizedDigits = String(value || '')
    .trim()
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x6f0))
  let digits = normalizedDigits.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (/^05\d{8}$/.test(digits)) return `966${digits.slice(1)}`
  if (/^5\d{8}$/.test(digits)) return `966${digits}`
  return /^9665\d{8}$/.test(digits) ? digits : null
}
