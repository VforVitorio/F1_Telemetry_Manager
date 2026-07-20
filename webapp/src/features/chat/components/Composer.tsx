import { useRef, type KeyboardEvent } from 'react'
import { Paperclip, Send, Square } from 'lucide-react'
import { Button } from '@/components/Button'
import { cn } from '@/lib/cn'

const MAX_HEIGHT_PX = 160

export interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  isStreaming: boolean
  onStop: () => void
  disabled?: boolean
}

/**
 * Autosizing single-line-to-multiline input. Enter sends, Shift+Enter inserts
 * a newline (parity: `st.chat_input`'s Enter-to-send, `chat_input.py:31-34`).
 * While a turn is streaming the Send button swaps for a Stop button rather
 * than disabling the whole composer, since the user can keep typing the next
 * message while the current reply finishes.
 */
export function Composer({
  value,
  onChange,
  onSend,
  isStreaming,
  onStop,
  disabled,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function autosize() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (value.trim()) onSend()
    }
  }

  return (
    <div className="flex items-end gap-2 border-t border-hairline bg-bg-1 p-3">
      <button
        type="button"
        disabled
        title="Attach an image (coming soon)"
        // TODO(C4): wire FileDrop image attach here — client-side downscale to
        // <=768px JPEG, and thread it through the `image` field / the
        // `_last_user_image` port so it never rides the text history instead
        // (see the wire-history discipline in lib/api/chat.ts).
        className="flex size-9 shrink-0 items-center justify-center rounded-lg text-fg-4 opacity-50"
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
  )
}
