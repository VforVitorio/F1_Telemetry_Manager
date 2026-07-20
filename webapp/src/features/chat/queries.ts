// TanStack Query data layer for the Chat tab. Only the health check goes
// through the generated OpenAPI client (`api.GET`, typed against schema.ts) —
// the SSE turn itself (`sendChatTurn`, lib/api/chat.ts) is driven imperatively
// by `useChatStream`, not as a query/mutation, since its "result" is a stream
// of events rather than one response value.

import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api/client'
import { queryKeys } from '@/lib/queryKeys'

export interface ChatHealth {
  status: string
  lmStudioReachable: boolean
  message: string
  modelsAvailable: number | null
}

function toChatHealth(raw: {
  status: string
  lm_studio_reachable: boolean
  message: string
  models_available?: number | null
}): ChatHealth {
  return {
    status: raw.status,
    lmStudioReachable: raw.lm_studio_reachable,
    message: raw.message,
    modelsAvailable: raw.models_available ?? null,
  }
}

/**
 * LLM-provider health for the header pill. A downed provider does not usually
 * flip mid-session, so this polls lightly rather than on every keystroke; the
 * composer stays usable either way (parity: `frontend/pages/chat.py:450-455`)
 * — a red pill only sets expectations, it never blocks sending.
 */
export function useChatHealth() {
  return useQuery({
    queryKey: queryKeys.chat.health(),
    queryFn: async (): Promise<ChatHealth> => {
      // `/chat/health`'s generated schema documents only a 200 response (the
      // handler's 500 path, `chat.py:54-56`, is a real runtime possibility the
      // OpenAPI types do not model) — checking `response.ok` instead of the
      // `error`/`data` pair avoids TypeScript narrowing this branch away as
      // unreachable when the schema claims failure is impossible.
      const { data, response } = await api.GET('/api/v1/chat/health')
      if (!response.ok || !data) {
        throw new Error(`Chat health check failed (${response.status})`)
      }
      return toChatHealth(data)
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  })
}
