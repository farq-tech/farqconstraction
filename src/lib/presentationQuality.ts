import { cleanSupplierName } from './supplierName'

export function supplierDisplayName(...candidates: (string | null | undefined)[]): string {
  for (const raw of candidates) { const name = cleanSupplierName(raw); if (name) return name }
  return 'مورد — الاسم يحتاج تحقق'
}

export function readableSourceDates(text: string): string {
  return text.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, raw => {
    const date = new Date(raw)
    return Number.isNaN(date.getTime()) ? raw : new Intl.DateTimeFormat('ar-SA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Riyadh', calendar: 'gregory' }).format(date) + ' (بتوقيت السعودية)'
  })
}

export function constrainPetPosition(x: number, y: number, width: number, height: number, petWidth: number, petHeight: number) {
  // Keep the header/search area and bottom navigation/action bar reachable.
  const bottom = Math.max(0, height - petHeight - 100)
  const top = Math.min(220, bottom)
  return { x: Math.max(8, Math.min(x, Math.max(8, width - petWidth - 32))), y: Math.max(top, Math.min(y, bottom)) }
}
