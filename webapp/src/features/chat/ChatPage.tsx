// Chat page (#39, C1 foundation): assembles the sidebar, message thread and
// composer around `useChatStream`. Owns the URL (which chat is open) and
// resolves it against the persisted store on mount — everything else (turn
// content, stage ticker) is either store state or the stream hook's
// ephemeral `turn`.

import { useEffect, useMemo, useRef, useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { Header } from '@/app/Header'
import { Pill } from '@/components/Pill'
import { fromRaw, toRaw, type ChatSearch } from './search'
import { useChatStore, chatList } from './store'
import { useChatHealth } from './queries'
import { useChatStream } from './useChatStream'
import { ChatSidebar } from './components/ChatSidebar'
import { MessageThread } from './components/MessageThread'
import { Composer } from './components/Composer'
import { ExamplePrompts } from './components/ExamplePrompts'
import { ToolBadge } from './components/ToolBadge'

const routeApi = getRouteApi('/chat')
const NO_MESSAGES: never[] = []

/** Cmd/Ctrl+Shift+O — the "new chat" shortcut noted in the sidebar's own New
 *  Chat button tooltip. */
const NEW_CHAT_SHORTCUT_KEY = 'o'

export function ChatPage() {
  const raw = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const search = useMemo(() => fromRaw(raw), [raw])

  const chats = useChatStore((s) => s.chats)
  const storeActiveId = useChatStore((s) => s.activeChatId)
  const newChat = useChatStore((s) => s.newChat)
  const setActive = useChatStore((s) => s.setActive)
  const deleteChat = useChatStore((s) => s.deleteChat)

  /** Apply a search patch and push it into the URL. No key here cascades off
   *  another (unlike Race/Lab), so a plain merge is enough — no
   *  `applyChatPatch` needed. */
  function patch(p: Partial<ChatSearch>) {
    void navigate({ search: (prev) => toRaw({ ...fromRaw(prev), ...p }) })
  }

  // Resolve which chat id is active: the URL's `c` wins when it names a real
  // chat, otherwise fall back to the store's last-active chat, otherwise start
  // a fresh one — then reflect that choice back into the URL so the tab stays
  // deep-linkable. Guarded by a ref keyed on `search.c` (NOT on `chats`, which
  // changes on every appended message) so this only re-runs when the URL's
  // chat id actually changes, never once per streamed token.
  const resolvedForRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    const key = search.c ?? '__none__'
    if (resolvedForRef.current === key) return
    resolvedForRef.current = key

    const { chats: liveChats, activeChatId: liveActiveId } = useChatStore.getState()
    if (search.c && liveChats[search.c]) {
      if (search.c !== liveActiveId) setActive(search.c)
      return
    }
    const fallbackId = liveActiveId && liveChats[liveActiveId] ? liveActiveId : newChat()
    void navigate({ search: (prev) => toRaw({ ...fromRaw(prev), c: fallbackId }) })
  }, [search.c, navigate, newChat, setActive])

  const activeChatId = search.c && chats[search.c] ? search.c : storeActiveId
  const activeChat = activeChatId ? chats[activeChatId] : undefined
  const messages = activeChat?.messages ?? NO_MESSAGES
  const chatsList = useMemo(() => chatList(chats), [chats])

  const { turn, turnChatId, isStreaming, send, stop } = useChatStream(activeChatId)
  const [draft, setDraft] = useState(() => search.ask ?? '')
  const [attachment, setAttachment] = useState<string | null>(null)

  const health = useChatHealth()

  // ?ask= deep-link prefill: the lazy initializer above already seeded
  // `draft` from whatever `ask` was present on the FIRST render (no flash),
  // so this mount-once effect only has to strip the param back out of the
  // URL — a deep link never auto-sends, the user still presses Send once the
  // composer is prefilled (same "never auto-fire" grammar as Race's `q`).
  useEffect(() => {
    if (search.ask != null) patch({ ask: undefined })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // New-chat keyboard shortcut, advertised on the sidebar's own button.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isShortcut =
        event.shiftKey &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === NEW_CHAT_SHORTCUT_KEY
      if (!isShortcut) return
      event.preventDefault()
      patch({ c: newChat() })
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSend() {
    // While a reply streams the user can keep TYPING the next message, but
    // Enter must not clear it: `send` would reject the turn (one stream at a
    // time) and wiping the draft here would silently lose the text.
    if (!draft.trim() || isStreaming) return
    send(draft, attachment ?? undefined)
    setDraft('')
    setAttachment(null)
  }

  /** Delete a chat once the sidebar's undo window has elapsed. Reads the
   *  store's LIVE `activeChatId` rather than closing over this render's
   *  `activeChatId` — the sidebar's timer can fire seconds after the click,
   *  by which point the user may have switched chats, and a stale check here
   *  would navigate away from the wrong (still-open) chat. */
  function handleDeleteChat(id: string) {
    const wasActive = useChatStore.getState().activeChatId === id
    deleteChat(id)
    if (wasActive) patch({ c: newChat() })
  }

  // Gate on `turnChatId`: a turn keeps streaming into the chat it STARTED in
  // even if the user switches conversations mid-stream, and its stage ticker
  // must not appear inside an unrelated thread.
  const streamingFooter =
    turn && turn.status === 'streaming' && turnChatId === activeChatId ? (
      <div className="flex items-center gap-2 px-1 py-2">
        <span className="size-1.5 animate-pulse rounded-full bg-purple-400" aria-hidden="true" />
        <span className="text-xs text-fg-3">{turn.stageLabel}</span>
        {turn.toolBadge ? (
          <ToolBadge toolName={turn.toolBadge.toolName} status={turn.toolBadge.status} />
        ) : null}
      </div>
    ) : undefined

  return (
    <>
      <Header title="Chat">
        {health.data ? (
          <Pill tone={health.data.lmStudioReachable ? 'success' : 'danger'}>
            {health.data.lmStudioReachable ? 'LLM online' : 'LLM offline'}
          </Pill>
        ) : null}
      </Header>

      <div className="flex min-h-0 flex-1">
        <ChatSidebar
          chats={chatsList}
          activeChatId={activeChatId}
          onSelectChat={(id) => patch({ c: id })}
          onNewChat={() => patch({ c: newChat() })}
          onDeleteChat={handleDeleteChat}
        />

        <div className="flex min-h-0 flex-1 flex-col">
          {messages.length === 0 ? (
            <div className="flex flex-1 items-center justify-center">
              <ExamplePrompts onSelect={(prompt) => send(prompt)} />
            </div>
          ) : (
            <MessageThread messages={messages} streamingFooter={streamingFooter} />
          )}

          <Composer
            value={draft}
            onChange={setDraft}
            onSend={handleSend}
            isStreaming={isStreaming}
            onStop={stop}
            attachment={attachment}
            onAttachmentChange={setAttachment}
          />
        </div>
      </div>
    </>
  )
}
