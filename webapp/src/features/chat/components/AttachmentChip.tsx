import { X } from 'lucide-react'

export interface AttachmentChipProps {
  src: string
  onRemove: () => void
}

/**
 * Removable thumbnail for the image queued on the composer's NEXT message.
 * Shown only while composing — the image itself never re-appears on later
 * turns once sent, since wire history stays text-only.
 */
export function AttachmentChip({ src, onRemove }: AttachmentChipProps) {
  return (
    <div className="flex w-fit items-center gap-2 rounded-lg border border-hairline bg-bg-3 p-1.5 pr-2">
      <img src={src} alt="Attached image preview" className="size-10 rounded object-cover" />
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove attached image"
        className="rounded p-1 text-fg-4 transition-colors hover:text-fg-1"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}
