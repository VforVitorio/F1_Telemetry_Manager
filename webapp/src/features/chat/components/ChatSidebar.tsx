import { Plus } from 'lucide-react'
import { Button } from '@/components/Button'
import { Tabs, TabsList, TabsTrigger } from '@/components/Tabs'
import { cn } from '@/lib/cn'
import type { ChatMode } from '../search'
import type { ChatSession } from '../store'

export interface ChatSidebarProps {
  chats: ChatSession[]
  activeChatId?: string
  mode: ChatMode
  onSelectChat: (id: string) => void
  onNewChat: () => void
  onModeChange: (mode: ChatMode) => void
}

/**
 * Chat history rail: the new-chat action, the conversation list, and the
 * text/voice mode toggle. Voice (#40) is reserved but disabled here — the
 * toggle exists from day one so the seam is visible in the UI, not so it does
 * anything yet. A reports panel belongs here too; it is built in C4, this
 * sprint just leaves the space for it.
 */
export function ChatSidebar({
  chats,
  activeChatId,
  mode,
  onSelectChat,
  onNewChat,
  onModeChange,
}: ChatSidebarProps) {
  return (
    <aside className="flex w-64 shrink-0 flex-col gap-3 border-r border-hairline bg-bg-1 p-3">
      <Button
        size="sm"
        variant="ghost"
        onClick={onNewChat}
        className="justify-start gap-2 border border-hairline bg-bg-3"
      >
        <Plus className="size-4" aria-hidden="true" />
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
        {chats.length === 0 ? (
          <p className="px-3 py-2 text-xs text-fg-4">No conversations yet.</p>
        ) : (
          chats.map((chat) => (
            <button
              key={chat.id}
              type="button"
              onClick={() => onSelectChat(chat.id)}
              title={chat.title}
              className={cn(
                'truncate rounded-lg px-3 py-2 text-left text-sm transition-colors',
                chat.id === activeChatId
                  ? 'bg-bg-4 text-fg-1'
                  : 'text-fg-3 hover:bg-bg-3 hover:text-fg-2',
              )}
            >
              {chat.title}
            </button>
          ))
        )}
      </div>

      {/* TODO(C4): ReportsPanel — one-click report generation + history. */}
    </aside>
  )
}
