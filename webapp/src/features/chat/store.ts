import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ToolResult } from '@/lib/api/chat'

// Persisted chat store: id-keyed chats (not name-keyed) so two conversations
// that happen to start with the same words never silently overwrite each
// other — a real bug in the Streamlit chat, which keys saved chats by an
// auto-generated NAME (design-audit #39 finding 4.8, `frontend/utils/
// chat_state.py:159-197`). `useChatStream` (the SSE reducer) is the only
// writer of message content; this module only shapes what gets stored and how
// it is looked up.

export type ChatMessageRole = 'user' | 'assistant'
export type ChatMessageType = 'text' | 'tool_result'

export interface ChatMessage {
  id: string
  role: ChatMessageRole
  type: ChatMessageType
  content: string
  toolResult?: ToolResult
  /** Data-URI thumbnail of an image the user attached to THIS message.
   *  Kept in memory for the running session (so a sent attachment stays
   *  visible in the thread) but stripped before the store persists to
   *  localStorage — see `withoutImages` below — and never mirrored into wire
   *  history; the backend only ever sees the CURRENT turn's attachment via
   *  the request's own `image` field, never through this stored copy. */
  image?: string
  /** Set once the turn's `done` event lands — only ever present on the
   *  streaming assistant text message, never on a tool_result message. */
  model?: string
  tokens?: number
  ts: number
}

export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
}

export interface ChatReport {
  id: string
  chatId: string
  title: string
  content: string
  createdAt: number
}

const REPORT_CAP = 20
const TITLE_MAX_CHARS = 30
const PLACEHOLDER_TITLE = 'New chat'

/** First 30 chars of the user's opening message, with an ellipsis if it was
 *  longer — the exact rule Streamlit uses to name a saved chat
 *  (`chat_state.py:176-180`), so titles read the same across both UIs. */
function autoTitle(userText: string): string {
  const trimmed = userText.trim()
  return trimmed.length > TITLE_MAX_CHARS ? `${trimmed.slice(0, TITLE_MAX_CHARS)}...` : trimmed
}

/** Patch applied to a message as a turn streams: `delta` appends to `content`
 *  (the normal per-token case); `model`/`tokens` land once, from the turn's
 *  `done` event. All three may arrive together only for a single-token turn
 *  (no B2 streaming) — never mutually exclusive by design. */
export interface StreamingPatch {
  delta?: string
  model?: string
  tokens?: number
}

interface ChatState {
  chats: Record<string, ChatSession>
  activeChatId?: string
  reports: ChatReport[]
  /** Create a fresh, empty chat, make it active, and return its id. */
  newChat: () => string
  setActive: (id: string) => void
  /** Append a fully-formed message (the optimistic user bubble, a tool_result
   *  card, or the first token of a new assistant reply). Also auto-titles the
   *  chat from the FIRST user text message while it still carries the
   *  placeholder title. */
  appendMessage: (chatId: string, message: ChatMessage) => void
  /** Apply a streaming patch to an already-appended message — the token-by-
   *  token content growth, plus the final model/tokens footnote. */
  updateStreaming: (chatId: string, messageId: string, patch: StreamingPatch) => void
  renameChat: (chatId: string, title: string) => void
  deleteChat: (chatId: string) => void
  addReport: (report: ChatReport) => void
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      chats: {},
      activeChatId: undefined,
      reports: [],

      newChat: () => {
        const id = crypto.randomUUID()
        const chat: ChatSession = {
          id,
          title: PLACEHOLDER_TITLE,
          messages: [],
          createdAt: Date.now(),
        }
        set((s) => ({ chats: { ...s.chats, [id]: chat }, activeChatId: id }))
        return id
      },

      setActive: (id) => set({ activeChatId: id }),

      appendMessage: (chatId, message) =>
        set((s) => {
          const chat = s.chats[chatId]
          if (!chat) return s
          const messages = [...chat.messages, message]
          const title =
            chat.title === PLACEHOLDER_TITLE && message.role === 'user' && message.type === 'text'
              ? autoTitle(message.content)
              : chat.title
          return { chats: { ...s.chats, [chatId]: { ...chat, messages, title } } }
        }),

      updateStreaming: (chatId, messageId, patch) =>
        set((s) => {
          const chat = s.chats[chatId]
          if (!chat) return s
          const messages = chat.messages.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  content: patch.delta != null ? m.content + patch.delta : m.content,
                  model: patch.model ?? m.model,
                  tokens: patch.tokens ?? m.tokens,
                }
              : m,
          )
          return { chats: { ...s.chats, [chatId]: { ...chat, messages } } }
        }),

      renameChat: (chatId, title) =>
        set((s) => {
          const chat = s.chats[chatId]
          if (!chat) return s
          return { chats: { ...s.chats, [chatId]: { ...chat, title } } }
        }),

      deleteChat: (chatId) =>
        set((s) => {
          const rest = { ...s.chats }
          delete rest[chatId]
          const activeChatId = s.activeChatId === chatId ? undefined : s.activeChatId
          return { chats: rest, activeChatId }
        }),

      addReport: (report) => set((s) => ({ reports: [report, ...s.reports].slice(0, REPORT_CAP) })),
    }),
    {
      name: 'f1sl.chat',
      // Image attachments stay on localStorage (no new dependency) rather than
      // an IndexedDB adapter: `partialize` strips each message's `image` data
      // URI before it hits disk (see `withoutImages`), so the quota risk a
      // photo-heavy chat would otherwise pose never materializes. The
      // attachment IS visible in the thread for the running session — only a
      // page reload loses it.
      // TODO: IndexedDB (idb-keyval) if image history must survive reloads.
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        chats: Object.fromEntries(
          Object.entries(s.chats).map(([id, chat]) => [id, withoutImages(chat)]),
        ),
        activeChatId: s.activeChatId,
        reports: s.reports,
      }),
    },
  ),
)

/** Drop the `image` data URI from every message of a chat before it is
 *  persisted (see the `partialize` option above). Only allocates a new
 *  message object for the ones that actually carry an image, so a text-only
 *  chat — the common case — persists with no extra copying. */
function withoutImages(chat: ChatSession): ChatSession {
  return {
    ...chat,
    messages: chat.messages.map((message) => {
      if (!message.image) return message
      const { id, role, type, content, toolResult, model, tokens, ts } = message
      return { id, role, type, content, toolResult, model, tokens, ts }
    }),
  }
}

/** The last-activity timestamp for a chat: its newest message, or its creation
 *  time for a chat with none yet. */
function lastActivity(chat: ChatSession): number {
  return chat.messages.length > 0 ? chat.messages[chat.messages.length - 1].ts : chat.createdAt
}

/** Ordered chat list for the sidebar, most recently active first. Pure over
 *  the chats record (not a zustand selector) so callers memoize it themselves
 *  — same pattern as `runsForModel` in the Lab store: sorting inside a
 *  selector returns a fresh array every call and loops the render. */
export function chatList(chats: Record<string, ChatSession>): ChatSession[] {
  return Object.values(chats).sort((a, b) => lastActivity(b) - lastActivity(a))
}
