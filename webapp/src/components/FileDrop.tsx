import { useId, useState, type ChangeEvent, type DragEvent } from 'react'
import { cn } from '@/lib/cn'

// Drag-drop / click-to-browse file zone (CSV / parquet import fallback for
// browsers or flows without a native file picker shortcut). The real
// <input type="file"> stays in the DOM, visually hidden via `sr-only` rather
// than `display:none`, so Tab focus + Enter/Space keep working; a <label>
// wraps it so mouse users can click the whole zone to open the picker too.

export interface FileDropProps {
  accept?: string
  onFile: (file: File) => void
  label?: string
  disabled?: boolean
  className?: string
}

/** Does a dropped file match the `accept` string (extensions like ".csv" or
 *  MIME types like "text/csv" / "image/*")? The native picker enforces this for
 *  clicks, but a drop bypasses it, so the drop path re-checks. */
function matchesAccept(file: File, accept?: string): boolean {
  if (!accept) return true
  return accept
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)
    .some((token) => {
      if (token.startsWith('.')) return file.name.toLowerCase().endsWith(token.toLowerCase())
      if (token.endsWith('/*')) return file.type.startsWith(token.slice(0, -1))
      return file.type === token
    })
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 15.5V4m0 0L7.5 8.5M12 4l4.5 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.5 15.5v3a2 2 0 002 2h11a2 2 0 002-2v-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Drag-drop / click-to-browse file zone. */
export function FileDrop({
  accept,
  onFile,
  label = 'Drop a file, or click to browse',
  disabled,
  className,
}: FileDropProps) {
  const inputId = useId()
  const [isDragActive, setIsDragActive] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)

  function acceptFile(file: File) {
    setFileName(file.name)
    onFile(file)
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) acceptFile(file)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragActive(false)
    if (disabled) return
    const file = event.dataTransfer.files[0]
    if (file && matchesAccept(file, accept)) acceptFile(file)
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    if (!disabled) setIsDragActive(true)
  }

  function handleDragLeave() {
    setIsDragActive(false)
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-divider bg-bg-3 px-6 py-8 text-center transition-colors',
        isDragActive && 'border-purple-400 bg-bg-4',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      <UploadIcon className="size-6 text-fg-3" />
      <label
        htmlFor={inputId}
        className={cn(
          'cursor-pointer rounded text-sm font-medium text-fg-2 transition-colors hover:text-fg-1',
          'focus-within:ring-2 focus-within:ring-purple-400 focus-within:ring-offset-2 focus-within:ring-offset-bg-0 focus-within:outline-none',
        )}
      >
        {label}
        <input
          id={inputId}
          type="file"
          accept={accept}
          disabled={disabled}
          onChange={handleInputChange}
          className="sr-only"
        />
      </label>
      {fileName && <span className="font-mono text-xs tabular-nums text-fg-3">{fileName}</span>}
    </div>
  )
}
