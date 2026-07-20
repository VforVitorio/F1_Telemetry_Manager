// Chat page (#39, C1 foundation): assembles the sidebar, message thread and
// composer around `useChatStream`. Owns the URL (which chat is open, the
// reserved text/voice mode) and resolves it against the persisted store on
// mount — everything else (turn content, stage ticker) is either store state
// or the stream hook's ephemeral `turn`.

import { useEffect, useMemo, useRef, useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { Header } from '@/app/Header'
import { Pill } from '@/components/Pill'
import { fromRaw, toRaw, type ChatMode, type ChatSearch } from './search'
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

export function ChatPage() {
  const raw = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const search = useMemo(() => fromRaw(raw), [raw])

  const chats = useChatStore((s) => s.chats)
  const storeActiveId = useChatStore((s) => s.activeChatId)
  const newChat = useChatStore((s) => s.newChat)
  const setActive = useChatStore((s) => s.setActive)

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

  const { turn, isStreaming, send, stop } = useChatStream(activeChatId)
  const [draft, setDraft] = useState(search.ask ?? '')

  const health = useChatHealth()

  function handleSend() {
    if (!draft.trim()) return
    send(draft)
    setDraft('')
  }

  const streamingFooter =
    turn && turn.status === 'streaming' ? (
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
          mode={search.mode}
          onSelectChat={(id) => patch({ c: id })}
          onNewChat={() => patch({ c: newChat() })}
          onModeChange={(mode: ChatMode) => patch({ mode })}
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
          />
        </div>
      </div>
    </>
  )
}
