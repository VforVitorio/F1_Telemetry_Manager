// Shared failure handling for the ML benches. A model run is a mutation whose
// error path must be visible (a silent failure reads as "the model re-ran and
// confirmed"), except for a user-initiated cancel, which aborts the request and
// must NOT raise an error toast.

import type { useToast } from '@/components/Toast'
import { StrategyApiError } from '@/lib/api/strategy'

type ToastFn = ReturnType<typeof useToast>['toast']

/** True for an aborted request (a user pressing Cancel), which is not a failure. */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

/** Surface a run failure as a danger toast, with a tailored rate-limit message,
 *  and swallow user-initiated cancels. */
export function runFailureToast(toast: ToastFn, model: string, error: unknown): void {
  if (isAbortError(error)) return
  const rateLimited = error instanceof StrategyApiError && error.isRateLimited
  toast({
    title: rateLimited ? 'Rate limit reached' : `${model} run failed`,
    description: rateLimited
      ? 'Too many runs in a short window. Wait a minute and try again.'
      : error instanceof StrategyApiError
        ? error.message
        : 'The model could not run. Check the backend and try again.',
    tone: 'danger',
  })
}
