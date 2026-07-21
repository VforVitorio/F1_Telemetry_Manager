// Client-side image downscale for chat attachments. Mirrors the rationale
// Streamlit's chart-to-image helper documents for the vision model
// (`frontend/utils/chat_navigation.py:75-97` — Qwen3-VL's optimal detection
// range tops out well below a raw phone-camera photo, and a smaller JPEG also
// means fewer prompt tokens). Kept as a pure, testable module separate from
// the composer's UI wiring — no image library, just a <canvas>.

export const MAX_ATTACHMENT_EDGE_PX = 768
const JPEG_QUALITY = 0.85

/** True for a file the browser would actually let `createImageBitmap` decode
 *  — guards against a renamed non-image slipping past a drag-drop, which
 *  bypasses the `<input accept="image/*">` picker's own filtering. */
function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}

/**
 * Downscale an image file to a JPEG data URI whose longest edge is at most
 * `maxEdge` pixels, preserving aspect ratio. Images already smaller than
 * `maxEdge` are re-encoded but never upscaled.
 */
export async function downscaleImageToDataUri(
  file: File,
  maxEdge: number = MAX_ATTACHMENT_EDGE_PX,
): Promise<string> {
  if (!isImageFile(file)) {
    throw new Error(`"${file.name}" is not an image file.`)
  }

  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable for image downscale.')
    ctx.drawImage(bitmap, 0, 0, width, height)

    return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  } finally {
    bitmap.close()
  }
}

/** Pull the first pasted image out of a clipboard event's files, or undefined
 *  if the clipboard held no image (a plain text paste, for instance). */
export function imageFromClipboard(data: DataTransfer): File | undefined {
  return Array.from(data.files).find(isImageFile)
}
