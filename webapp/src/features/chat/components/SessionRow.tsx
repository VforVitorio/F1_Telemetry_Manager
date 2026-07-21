import { useState, type KeyboardEvent } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { ChatSession } from '../store'

export interface SessionRowProps {
  chat: ChatSession
  isActive: boolean
  onSelect: () => void
  onRename: (title: string) => void
  onDeleteRequest: () => void
}

/**
 * One row in the chat history list: click the title to switch, a pencil to
 * rename in place, a trash icon to request deletion. The row only REPORTS a
 * delete request — `ChatSidebar` owns the undo window, so a row never removes
 * itself. Rename/delete controls stay hidden until hover/focus so the list
 * reads as plain chat titles at rest.
 */
export function SessionRow({
  chat,
  isActive,
  onSelect,
  onRename,
  onDeleteRequest,
}: SessionRowProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState(chat.title)

  function startEditing() {
    setDraftTitle(chat.title)
    setIsEditing(true)
  }

  function commitRename() {
    const trimmed = draftTitle.trim()
    if (trimmed && trimmed !== chat.title) onRename(trimmed)
    setIsEditing(false)
  }

  function handleTitleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') commitRename()
    if (event.key === 'Escape') {
      setDraftTitle(chat.title)
      setIsEditing(false)
    }
  }

  if (isEditing) {
    return (
      <input
        autoFocus
        value={draftTitle}
        onChange={(e) => setDraftTitle(e.target.value)}
        onBlur={commitRename}
        onKeyDown={handleTitleKeyDown}
        aria-label={`Rename "${chat.title}"`}
        className="rounded-lg border border-purple-400 bg-bg-2 px-3 py-2 text-sm text-fg-1 outline-none"
      />
    )
  }

  return (
    <div
      className={cn(
        'group flex items-center gap-1 rounded-lg pr-1 transition-colors',
        isActive ? 'bg-bg-4' : 'hover:bg-bg-3',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        title={chat.title}
        className={cn(
          'min-w-0 flex-1 truncate px-3 py-2 text-left text-sm',
          isActive ? 'text-fg-1' : 'text-fg-3 group-hover:text-fg-2',
        )}
      >
        {chat.title}
      </button>
      <button
        type="button"
        onClick={startEditing}
        aria-label={`Rename "${chat.title}"`}
        className="rounded p-1.5 text-fg-4 opacity-0 transition-opacity hover:text-fg-1 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <Pencil className="size-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onDeleteRequest}
        aria-label={`Delete "${chat.title}"`}
        className="rounded p-1.5 text-fg-4 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}
