import { useCallback, useRef, useState } from 'react'
import { SseError } from '@/lib/api/sse'
import {
  buildWireHistory,
  sendChatTurn,
  type ChatStreamEvent,
  type ToolMessageRequestBody,
  type ToolResult,
} from '@/lib/api/chat'
import { useToast } from '@/components/Toast'
import { isToolError } from './components/toolResultParsing'
import { stageLabel, toolNameFromStage } from './stageLabels'
import { useChatStore, type ChatMessage } from './store'

// The SSE-turn reducer. Split in two layers on purpose:
//   - `applyStreamEvent` (+ `markStopped` / `isEmptyTurn`) is a PURE fold over
//     one turn's events into an `ActiveTurn` — no network, no store, no React.
//     This is what `useChatStream.test.ts` exercises with captured event
//     sequences (stage -> tool_result -> token -> done, no-tool, refused-tool,
//     error-envelope): the regression test for the wire contract lives here.
//   - `useChatStream` is the thin React/side-effect shell: it drives
//     `sendChatTurn`, mirrors `applyStreamEvent`'s ticker state into a
//     `useState` for the UI, and commits the DURABLE parts (the tool-result
//     card, the streaming assistant text) into the persisted chat store as
//     they land, so a reload never loses a turn that was mid-flight.

export interface ToolBadgeState {
  toolName: string
  status: 'running' | 'done' | 'error'
}

export type ActiveTurnStatus = 'streaming' | 'done' | 'error'

/** Everything known about the turn currently in flight (or just finished).
 *  `assistantMessage`/`toolResultMessage` here are DRAFTS the reducer builds
 *  as events arrive — the hook is what actually appends/updates them in the
 *  persisted store, keyed off the same object identity. */
export interface ActiveTurn {
  status: ActiveTurnStatus
  stage?: string
  stageLabel: string
  toolBadge?: ToolBadgeState
  toolResultMessage?: ChatMessage
  assistantMessage?: ChatMessage
  error?: string
}

export function createActiveTurn(): ActiveTurn {
  return { status: 'streaming', stageLabel: 'Starting…' }
}

function newAssistantMessage(content = ''): ChatMessage {
  return { id: crypto.randomUUID(), role: 'assistant', type: 'text', content, ts: Date.now() }
}

function newToolResultMessage(toolResult: ToolResult): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    type: 'tool_result',
    content: toolResult.summary,
    toolResult,
    ts: Date.now(),
  }
}

/**
 * Fold one parsed SSE event into the in-flight turn. Pure and exported so the
 * captured-SSE fixtures in `useChatStream.test.ts` exercise it directly.
 */
export function applyStreamEvent(turn: ActiveTurn, event: ChatStreamEvent): ActiveTurn {
  switch (event.event) {
    case 'stage': {
      const toolName = toolNameFromStage(event.stage)
      return {
        ...turn,
        stage: event.stage,
        stageLabel: stageLabel(event.stage),
        toolBadge: toolName ? { toolName, status: 'running' } : turn.toolBadge,
      }
    }
    case 'tool_result': {
      // Same detector ToolResultCard routes on — a successful payload that
      // merely CONTAINS an `error`-named field must not flip the badge red.
      const hasError = isToolError(event.toolResult.data)
      return {
        ...turn,
        toolResultMessage: newToolResultMessage(event.toolResult),
        toolBadge: turn.toolBadge
          ? { ...turn.toolBadge, status: hasError ? 'error' : 'done' }
          : turn.toolBadge,
      }
    }
    case 'token': {
      const assistantMessage = turn.assistantMessage ?? newAssistantMessage()
      return {
        ...turn,
        assistantMessage: { ...assistantMessage, content: assistantMessage.content + event.token },
      }
    }
    case 'done': {
      const assistantMessage = turn.assistantMessage
        ? { ...turn.assistantMessage, model: event.llmModel, tokens: event.tokensUsed }
        : turn.assistantMessage
      return {
        ...turn,
        status: event.error ? 'error' : 'done',
        error: event.error,
        assistantMessage,
      }
    }
  }
}

const STOPPED_MARKER = '\n\n_[Response stopped by user]_'
const EMPTY_STREAM_NOTICE =
  '_(No response received from the backend. Check the docker logs for the ' +
  'chat container — the request returned 200 but the SSE stream was empty.)_'

/** Finalize a turn the user aborted mid-stream: append the verbatim "stopped"
 *  marker Streamlit uses (`frontend/pages/chat.py:350`) to whatever text had
 *  already arrived, or start a fresh message that is just the marker if no
 *  token had landed yet. */
export function markStopped(turn: ActiveTurn): ActiveTurn {
  const base = turn.assistantMessage ?? newAssistantMessage()
  return {
    ...turn,
    status: 'done',
    assistantMessage: { ...base, content: base.content + STOPPED_MARKER },
  }
}

/** True once a turn produced NEITHER a tool result NOR any assistant text — a
 *  200 OK with a silently empty SSE stream (parity: `chat.py:358-363`). */
export function isEmptyTurn(turn: ActiveTurn): boolean {
  return (
    !turn.toolResultMessage &&
    (!turn.assistantMessage || turn.assistantMessage.content.trim() === '')
  )
}

// ── The hook ─────────────────────────────────────────────────────────────

export interface UseChatStreamResult {
  /** The turn in flight, or the last finished one; null before the chat's
   *  first message. Drives the ticker (stage label + tool badge) — message
   *  CONTENT itself lives in the store and needs no separate draft to render. */
  turn: ActiveTurn | null
  /** Which chat `turn` belongs to. The hook survives a mid-stream chat switch
   *  (tokens keep landing in the chat the turn started in), so the page must
   *  compare this against the ACTIVE chat before rendering the ticker — the
   *  stage line for chat A must not appear inside chat B's thread. */
  turnChatId?: string
  isStreaming: boolean
  /** `image` is a data URI already downscaled by the composer — it rides in
   *  the request's own `image` field, never in wire history, and is attached
   *  to the optimistic user message purely for the thread to render it back. */
  send: (text: string, image?: string) => void
  stop: () => void
}

/**
 * Drive one chat's SSE turns: appends the optimistic user message, builds the
 * wire request from the store's own history, streams it through
 * `sendChatTurn`, and folds every event through `applyStreamEvent` —
 * committing each durable piece (the tool-result card, the growing assistant
 * reply) into the persisted store as it lands.
 */
export function useChatStream(chatId: string | undefined): UseChatStreamResult {
  const [turn, setTurn] = useState<ActiveTurn | null>(null)
  const turnRef = useRef<ActiveTurn>(createActiveTurn())
  const turnChatIdRef = useRef<string | undefined>(undefined)
  const assistantMessageIdRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const { toast } = useToast()

  const appendMessage = useChatStore((s) => s.appendMessage)
  const updateStreaming = useChatStore((s) => s.updateStreaming)

  /** Append the assistant text message on its first chunk, or append a further
   *  delta once it already exists in the store — the one place that decides
   *  "create vs update" so normal streaming, the Stop marker, and the
   *  empty-stream fallback all go through the same path. */
  const commitAssistantDelta = useCallback(
    (delta: string) => {
      if (!chatId) return
      if (assistantMessageIdRef.current == null) {
        const message = newAssistantMessage(delta)
        assistantMessageIdRef.current = message.id
        appendMessage(chatId, message)
      } else {
        updateStreaming(chatId, assistantMessageIdRef.current, { delta })
      }
    },
    [chatId, appendMessage, updateStreaming],
  )

  const handleEvent = useCallback(
    (event: ChatStreamEvent) => {
      turnRef.current = applyStreamEvent(turnRef.current, event)
      setTurn(turnRef.current)

      if (event.event === 'tool_result' && chatId && turnRef.current.toolResultMessage) {
        appendMessage(chatId, turnRef.current.toolResultMessage)
      }
      if (event.event === 'token') {
        commitAssistantDelta(event.token)
      }
      if (event.event === 'done' && chatId && assistantMessageIdRef.current) {
        updateStreaming(chatId, assistantMessageIdRef.current, {
          model: event.llmModel,
          tokens: event.tokensUsed,
        })
      }
    },
    [chatId, appendMessage, updateStreaming, commitAssistantDelta],
  )

  /** Resolve the turn once `sendChatTurn`'s promise settles successfully — a
   *  natural finish (a `done` event already set `status`) or a user-initiated
   *  Stop (the promise resolves without one, since `postStream` swallows an
   *  abort rather than rejecting). */
  const finishTurn = useCallback(
    (aborted: boolean) => {
      if (aborted && turnRef.current.status === 'streaming') {
        turnRef.current = { ...turnRef.current, status: 'done' }
        commitAssistantDelta(STOPPED_MARKER)
      } else if (turnRef.current.status !== 'error' && isEmptyTurn(turnRef.current)) {
        turnRef.current = { ...turnRef.current, status: 'error' }
        commitAssistantDelta(EMPTY_STREAM_NOTICE)
      } else if (turnRef.current.status === 'streaming') {
        // The server closed the stream without a `done` frame (proxy drop,
        // backend crash after some tokens landed): the turn is over — never
        // leave the composer stuck on a Stop button for a dead connection.
        turnRef.current = { ...turnRef.current, status: 'done' }
      }
      setTurn(turnRef.current)
      abortRef.current = null
    },
    [commitAssistantDelta],
  )

  const send = useCallback(
    (text: string, image?: string) => {
      const trimmed = text.trim()
      // `abortRef` is the synchronous in-flight guard: the `turn` state check
      // alone is stale for a same-tick double invoke (state updates are async)
      // and two concurrent streams would interleave into the shared refs.
      if (!trimmed || !chatId || abortRef.current || turn?.status === 'streaming') return

      const priorMessages = useChatStore.getState().chats[chatId]?.messages ?? []
      appendMessage(chatId, {
        id: crypto.randomUUID(),
        role: 'user',
        type: 'text',
        content: trimmed,
        ...(image ? { image } : {}),
        ts: Date.now(),
      })

      turnRef.current = createActiveTurn()
      turnChatIdRef.current = chatId
      assistantMessageIdRef.current = null
      setTurn(turnRef.current)

      const controller = new AbortController()
      abortRef.current = controller

      const body: ToolMessageRequestBody = {
        text: trimmed,
        chat_history: buildWireHistory(priorMessages),
        ...(image ? { image } : {}),
      }

      sendChatTurn(body, { onEvent: handleEvent, signal: controller.signal })
        .then(() => finishTurn(controller.signal.aborted))
        .catch((error: unknown) => {
          turnRef.current = { ...turnRef.current, status: 'error' }
          setTurn(turnRef.current)
          abortRef.current = null
          const rateLimited = error instanceof SseError && error.status === 429
          toast({
            title: rateLimited ? 'Rate limit reached' : 'Chat request failed',
            description: rateLimited
              ? 'Chat is limited to 20 requests/min. Wait a moment and try again.'
              : error instanceof Error
                ? error.message
                : 'Could not reach the backend.',
            tone: 'danger',
          })
        })
    },
    [chatId, turn?.status, appendMessage, handleEvent, finishTurn, toast],
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return {
    turn,
    turnChatId: turnChatIdRef.current,
    isStreaming: turn?.status === 'streaming',
    send,
    stop,
  }
}
