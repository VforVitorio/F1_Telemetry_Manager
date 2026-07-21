import { useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/Button'
import { Tabs, TabsList, TabsTrigger } from '@/components/Tabs'
import type { ChatMode } from '../search'
import { useChatStore, type ChatSession } from '../store'
import { ReportsPanel } from './ReportsPanel'
import { SessionRow } from './SessionRow'

const UNDO_WINDOW_MS = 5000

export interface ChatSidebarProps {
  chats: ChatSession[]
  activeChatId?: string
  mode: ChatMode
  onSelectChat: (id: string) => void
  onNewChat: () => void
  onModeChange: (mode: ChatMode) => void
  /** Fires once the delete is FINAL — after the undo window elapses, or
   *  immediately if the sidebar unmounts mid-window. `ChatPage` owns what
   *  "final" means for the URL (navigating away if this was the active chat),
   *  so the sidebar never calls the store's `deleteChat` itself. */
  onDeleteChat: (id: string) => void
}

interface PendingDelete {
  id: string
  title: string
}

/**
 * Chat history rail: the new-chat action, the conversation list (inline
 * rename, delete with an undo window), the text/voice mode toggle, and the
 * reports panel. Deleting a row hides it immediately but only calls
 * `onDeleteChat` once `UNDO_WINDOW_MS` passes without the user clicking Undo —
 * the chat's data is untouched in the store the whole time, so an Undo simply
 * clears the pending timer and the row reappears.
 */
export function ChatSidebar({
  chats,
  activeChatId,
  mode,
  onSelectChat,
  onNewChat,
  onModeChange,
  onDeleteChat,
}: ChatSidebarProps) {
  const renameChat = useChatStore((s) => s.renameChat)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const pendingTimerRef = useRef<number | null>(null)
  const pendingIdRef = useRef<string | null>(null)

  function finalizeDelete(id: string) {
    if (pendingTimerRef.current != null) window.clearTimeout(pendingTimerRef.current)
    pendingTimerRef.current = null
    pendingIdRef.current = null
    setPendingDelete(null)
    onDeleteChat(id)
  }

  function requestDelete(chat: ChatSession) {
    // Only one delete is ever "pending" at a time — flush an earlier one
    // immediately rather than losing track of its timer.
    if (pendingIdRef.current) finalizeDelete(pendingIdRef.current)
    pendingIdRef.current = chat.id
    setPendingDelete({ id: chat.id, title: chat.title })
    pendingTimerRef.current = window.setTimeout(() => finalizeDelete(chat.id), UNDO_WINDOW_MS)
  }

  function undoDelete() {
    if (pendingTimerRef.current != null) window.clearTimeout(pendingTimerRef.current)
    pendingTimerRef.current = null
    pendingIdRef.current = null
    setPendingDelete(null)
  }

  // Honor a still-pending delete if the sidebar unmounts mid-window (leaving
  // the tab should not silently revive a chat the user already dismissed).
  useEffect(() => {
    return () => {
      if (pendingIdRef.current != null) {
        if (pendingTimerRef.current != null) window.clearTimeout(pendingTimerRef.current)
        onDeleteChat(pendingIdRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activeChat = chats.find((chat) => chat.id === activeChatId)
  const visibleChats = chats.filter((chat) => chat.id !== pendingDelete?.id)

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-3 border-r border-hairline bg-bg-1 p-3">
      <Button
        size="sm"
        variant="ghost"
        onClick={onNewChat}
        title="New chat (Ctrl/Cmd+Shift+O)"
        className="justify-start gap-2 border border-hairline bg-bg-3 text-fg-1"
      >
        <Plus className="size-4 text-purple-300" aria-hidden="true" />
        New chat
      </Button>

      <Tabs value={mode} onValueChange={(value) => onModeChange(value as ChatMode)}>
        <TabsList variant="segmented" className="w-full">
          <TabsTrigger value="text" className="flex-1 justify-center">
            Text
          </TabsTrigger>
          <TabsTrigger
            value="voice"
            disabled
            title="Voice chat is coming soon"
            className="flex-1 justify-center"
          >
            Voice
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {visibleChats.length === 0 ? (
          <p className="px-3 py-2 text-xs text-fg-4">No conversations yet.</p>
        ) : (
          visibleChats.map((chat) => (
            <SessionRow
              key={chat.id}
              chat={chat}
              isActive={chat.id === activeChatId}
              onSelect={() => onSelectChat(chat.id)}
              onRename={(title) => renameChat(chat.id, title)}
              onDeleteRequest={() => requestDelete(chat)}
            />
          ))
        )}

        {pendingDelete ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-hairline bg-bg-3 px-3 py-2 text-xs text-fg-3">
            <span className="truncate">Deleted &quot;{pendingDelete.title}&quot;</span>
            <Button size="sm" variant="ghost" onClick={undoDelete} className="h-6 px-2 text-xs">
              Undo
            </Button>
          </div>
        ) : null}
      </div>

      <ReportsPanel activeChat={activeChat} />
    </aside>
  )
}
