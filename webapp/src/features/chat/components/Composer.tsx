import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { Paperclip, Send, Square } from 'lucide-react'
import { Button } from '@/components/Button'
import { FileDrop } from '@/components/FileDrop'
import { useToast } from '@/components/Toast'
import { cn } from '@/lib/cn'
import { downscaleImageToDataUri, imageFromClipboard } from '../imageAttachment'
import { AttachmentChip } from './AttachmentChip'

const MAX_HEIGHT_PX = 160

export interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  isStreaming: boolean
  onStop: () => void
  disabled?: boolean
  /** The downscaled data URI queued for the next send, or null when nothing
   *  is attached. Controlled by the parent so `onSend` can read it alongside
   *  `value` and clear both together once the turn is dispatched. */
  attachment: string | null
  onAttachmentChange: (dataUri: string | null) => void
}

/**
 * Autosizing single-line-to-multiline input. Enter sends, Shift+Enter inserts
 * a newline (parity: `st.chat_input`'s Enter-to-send, `chat_input.py:31-34`).
 * While a turn is streaming the Send button swaps for a Stop button rather
 * than disabling the whole composer, since the user can keep typing the next
 * message while the current reply finishes.
 *
 * The paperclip toggles a compact `FileDrop` zone for picking or dragging an
 * image; pasting an image directly into the textarea attaches it the same
 * way, without needing to open the zone first. Either path downscales the
 * file client-side before it ever becomes an attachment.
 */
export function Composer({
  value,
  onChange,
  onSend,
  isStreaming,
  onStop,
  disabled,
  attachment,
  onAttachmentChange,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isPickingFile, setIsPickingFile] = useState(false)
  const { toast } = useToast()

  function autosize() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`
  }

  async function attachFile(file: File) {
    try {
      const dataUri = await downscaleImageToDataUri(file)
      onAttachmentChange(dataUri)
      setIsPickingFile(false)
    } catch (error) {
      toast({
        title: 'Could not attach image',
        description: error instanceof Error ? error.message : 'Unsupported file.',
        tone: 'danger',
      })
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const file = imageFromClipboard(event.clipboardData)
    if (!file) return
    event.preventDefault()
    void attachFile(file)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (value.trim()) onSend()
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-hairline bg-bg-1 p-3">
      {isPickingFile && !attachment ? (
        <FileDrop
          accept="image/*"
          onFile={(file) => void attachFile(file)}
          label="Drop an image, or click to browse"
          className="py-4"
        />
      ) : null}

      {attachment ? (
        <AttachmentChip src={attachment} onRemove={() => onAttachmentChange(null)} />
      ) : null}

      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={() => setIsPickingFile((v) => !v)}
          title="Attach an image"
          aria-pressed={isPickingFile}
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg text-fg-3 transition-colors',
            'hover:bg-bg-3 hover:text-fg-1',
            isPickingFile && 'bg-bg-3 text-fg-1',
          )}
        >
          <Paperclip className="size-4" aria-hidden="true" />
        </button>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            autosize()
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={disabled}
          rows={1}
          placeholder="Ask me anything about F1..."
          className={cn(
            'max-h-40 flex-1 resize-none rounded-xl border border-hairline bg-bg-2 px-3 py-2 text-sm text-fg-1',
            'placeholder:text-fg-4 focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:outline-none',
            disabled && 'opacity-50',
          )}
        />

        {isStreaming ? (
          <Button variant="danger" onClick={onStop} aria-label="Stop the response">
            <Square className="size-4" aria-hidden="true" />
          </Button>
        ) : (
          <Button onClick={onSend} disabled={disabled || !value.trim()} aria-label="Send message">
            <Send className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  )
}
