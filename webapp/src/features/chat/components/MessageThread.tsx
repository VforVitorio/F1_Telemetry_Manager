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

  useEffect(() => {
    if (isAtBottom) scrollToBottom('auto')
    // Only a NEW message (or the footer appearing/disappearing) should trigger
    // auto-follow. A streaming message's own content grows on every token —
    // re-running this on every character would fight the reader's scroll
    // position mid-turn far too often, so `messages.length` is the real
    // dependency, not `messages` itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, streamingFooter != null])

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
      >
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {streamingFooter}
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
      className={cn('flex flex-col gap-1 [content-visibility:auto]', isUser ? 'items-end' : 'items-start')}
    >
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm',
          isUser ? 'bg-purple-600/90 text-fg-1' : 'border border-hairline bg-bg-3',
        )}
      >
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
