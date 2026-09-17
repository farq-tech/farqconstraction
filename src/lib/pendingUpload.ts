/**
 * A file chosen on the home screen, handed to the upload screen.
 *
 * The home drop zone used to navigate and discard the file, so the buyer picked
 * the same booklet twice. Held in memory only and taken exactly once.
 */
let pending: File | null = null

export function setPendingUpload(file: File | null | undefined): void {
  pending = file || null
}

export function takePendingUpload(): File | null {
  const file = pending
  pending = null
  return file
}
