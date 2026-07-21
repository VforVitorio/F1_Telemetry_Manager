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
  const [isAtBottom, setIsAtBottom] = useState(true)

  function handleScroll() {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setIsAtBottom(distanceFromBottom <= BOTTOM_THRESHOLD_PX)
  }

  function scrollToBottom(behavior: ScrollBehavior = 'smooth') {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
  }

  // Auto-follow the bottom as content arrives — a NEW message, the streaming
  // footer appearing/disappearing, AND the in-flight message's own text growing
  // token by token (its length is the signal). The `isAtBottom` guard means a
  // reader who scrolled up to re-read an earlier turn is never yanked back down;
  // once they return to the bottom, following resumes.
  const streamingLength = messages.length > 0 ? messages[messages.length - 1].content.length : 0
  useEffect(() => {
    if (isAtBottom) scrollToBottom('auto')
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

      {!isAtBottom && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => scrollToBottom()}
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
