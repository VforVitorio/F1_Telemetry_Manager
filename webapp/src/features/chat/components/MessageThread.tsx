import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowDown } from 'lucide-react'
import { Button } from '@/components/Button'
import { Markdown } from '@/components/Markdown'
import { cn } from '@/lib/cn'
import type { ChatMessage } from '../store'
import { ToolResultCard } from './ToolResultCard'

const BOTTOM_THRESHOLD_PX = 48

export interface MessageThreadProps {
  messages: ChatMessage[]
  /** Trailing content rendered after the message list while a turn is in
   *  flight — the stage line / tool badge the page composes from `turn`. Kept
   *  as a prop rather than this component reading the stream hook itself, so
   *  the thread only ever needs a message array + a slot. */
  streamingFooter?: ReactNode
}

/**
 * Scrolling message log: auto-follows new content while the reader is at the
 * bottom, and offers a "Jump to latest" button instead of yanking the
 * viewport when they have scrolled up to read an earlier turn.
 */
export function MessageThread({ messages, streamingFooter }: MessageThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  // Whether to keep the viewport pinned to the latest content. A REF (not
  // state) so the streaming loop reads the live value without a render lag.
  const stickToBottomRef = useRef(true)
  // Set right before a programmatic scroll so the scroll event IT fires is not
  // mistaken for the reader scrolling away. Without this, a long fast reply
  // races its own auto-scroll: content grows a chunk before the previous
  // scroll event is handled, that event reads a transient gap, flips stick
  // off, and the auto-follow freezes mid-answer. Only a genuine user scroll
  // (no flag set) ever stops following.
  const ignoreNextScrollRef = useRef(false)
  const [showJumpButton, setShowJumpButton] = useState(false)

  function scrollToBottom(behavior: ScrollBehavior = 'smooth') {
    const el = scrollRef.current
    if (!el) return
    ignoreNextScrollRef.current = true
    el.scrollTo({ top: el.scrollHeight, behavior })
  }

  function handleScroll() {
    const el = scrollRef.current
    if (!el) return
    if (ignoreNextScrollRef.current) {
      ignoreNextScrollRef.current = false
      return
    }
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    stickToBottomRef.current = distanceFromBottom <= BOTTOM_THRESHOLD_PX
    setShowJumpButton(!stickToBottomRef.current)
  }

  function jumpToLatest() {
    stickToBottomRef.current = true
    setShowJumpButton(false)
    scrollToBottom()
  }

  // Auto-follow the bottom as content arrives — a NEW message, the streaming
  // footer, AND the in-flight message's own text growing token by token (its
  // length is the signal). Following stops only when the reader scrolls up;
  // "Jump to latest" (or scrolling back to the bottom) resumes it.
  const streamingLength = messages.length > 0 ? messages[messages.length - 1].content.length : 0
  useEffect(() => {
    if (stickToBottomRef.current) scrollToBottom('auto')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, streamingLength, streamingFooter != null])

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        className="min-h-0 flex-1 overflow-y-auto px-4 py-6"
      >
        {/* Centered reading column: caps the measure on wide screens so long
            answers stay readable. Spacing is turn-grouped rather than uniform —
            a user message opens a new turn with a wider gap, while the tool
            cards and prose that answer it stack tight underneath, so one
            question-and-answer reads as a single unit. */}
        <div className="mx-auto flex w-full max-w-3xl flex-col">
          {messages.map((message, index) => (
            <div
              key={message.id}
              className={cn(index > 0 && (message.role === 'user' ? 'mt-6' : 'mt-3'))}
            >
              <MessageBubble message={message} />
            </div>
          ))}
          {streamingFooter}
        </div>
      </div>

      {showJumpButton && (
        <Button
          size="sm"
          variant="ghost"
          onClick={jumpToLatest}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 border border-hairline bg-bg-3 shadow-[var(--shadow-elev)]"
        >
          <ArrowDown className="size-3.5" aria-hidden="true" />
          Jump to latest
        </Button>
      )}
    </div>
  )
}

/**
 * One message in the thread. Three deliberate treatments, not one bubble
 * template: the user speaks in a purple pill, tool results stand as bordered
 * data cards, and the assistant answers as unboxed flowing prose — so a card
 * always reads as "the data" and the prose as "the interpretation" instead of
 * two competing boxes saying the same thing.
 */
function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.type === 'tool_result' && message.toolResult) {
    return <ToolResultCard toolResult={message.toolResult} />
  }

  const isUser = message.role === 'user'
  const footnote = [message.model, message.tokens != null ? `${message.tokens} tok` : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      className={cn(
        'flex flex-col gap-1 [content-visibility:auto]',
        isUser ? 'items-end' : 'items-start',
      )}
    >
      <div
        className={cn(
          'text-sm',
          isUser
            ? 'max-w-[85%] rounded-2xl bg-purple-600/90 px-4 py-2.5 text-white'
            : 'w-full space-y-2 px-1',
        )}
      >
        {message.image ? (
          <img
            src={message.image}
            alt="Attached image"
            className={cn('max-w-full rounded-lg', message.content && 'mb-2')}
          />
        ) : null}
        {isUser ? (
          <p className="text-pretty">{message.content}</p>
        ) : (
          <Markdown>{message.content}</Markdown>
        )}
      </div>
      {!isUser && footnote ? (
        <span className="px-1 font-mono text-[11px] text-fg-4">{footnote}</span>
      ) : null}
    </div>
  )
}
