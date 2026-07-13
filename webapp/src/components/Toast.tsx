import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react'
import * as ToastPrimitive from '@radix-ui/react-toast'
import { cn } from '@/lib/cn'
import { Z } from '@/lib/zIndex'

// App-wide toast host. Mount `<ToastProvider>` once near the root; anywhere
// inside it, call `useToast().toast({ title, description?, tone? })` to
// queue a notification. The queue lives in a small reducer (not one boolean)
// so several toasts can be in flight — and mid-exit — at the same time.
//
// See the animation note in `Modal.tsx`: Radix Presence only delays unmount
// for a node with a real CSS `animation`, so the toast surface below animates
// via a hand-rolled `@keyframes` + `[animation:...]` utility rather than
// `transition-*`. The `<style>` tag here is a direct child of
// `ToastPrimitive.Provider` (a plain context wrapper, not Presence-gated),
// so — unlike inside an individual toast's own Portal — it stays mounted for
// the provider's entire lifetime and is always available when a toast closes.

type Tone = 'success' | 'danger' | 'info'

export interface ToastOptions {
  title: string
  description?: string
  tone?: Tone
}

interface ToastItem {
  id: string
  title: string
  description?: string
  tone: Tone
  open: boolean
}

type ToastAction =
  | { type: 'add'; toast: ToastItem }
  | { type: 'set-open'; id: string; open: boolean }
  | { type: 'remove'; id: string }

function toastReducer(state: ToastItem[], action: ToastAction): ToastItem[] {
  switch (action.type) {
    case 'add':
      return [...state, action.toast]
    case 'set-open':
      return state.map((item) => (item.id === action.id ? { ...item, open: action.open } : item))
    case 'remove':
      return state.filter((item) => item.id !== action.id)
    default:
      return state
  }
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const AUTO_DISMISS_MS = 4000
// Longer than the 200ms exit keyframe so the array-removal never races the
// visible fade-out; Presence itself decides the real unmount timing, this
// timer only reclaims the now-invisible item from `toasts`.
const EXIT_CLEANUP_MS = 300

const KEYFRAMES = `
@keyframes f1-toast-in { from { opacity: 0; transform: translateX(16px) } to { opacity: 1; transform: translateX(0) } }
@media (prefers-reduced-motion: reduce) {
  .f1-anim { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; }
}
`

const TONE_CLASS: Record<Tone, string> = {
  success: 'border-l-4 border-l-success',
  danger: 'border-l-4 border-l-danger',
  info: 'border-l-4 border-l-info',
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

/** Wrap the app (or a route subtree) once. Renders the Radix `Toast.Provider`
 *  + a fixed bottom-right `Toast.Viewport`, plus whichever toasts are queued. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, dispatch] = useReducer(toastReducer, [])
  const nextId = useRef(0)

  const dismiss = useCallback((id: string) => {
    dispatch({ type: 'set-open', id, open: false })
    window.setTimeout(() => dispatch({ type: 'remove', id }), EXIT_CLEANUP_MS)
  }, [])

  const toast = useCallback((options: ToastOptions) => {
    nextId.current += 1
    const item: ToastItem = {
      id: `toast-${nextId.current}`,
      title: options.title,
      description: options.description,
      tone: options.tone ?? 'info',
      open: true,
    }
    dispatch({ type: 'add', toast: item })
  }, [])

  const value = useMemo<ToastContextValue>(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider duration={AUTO_DISMISS_MS} swipeDirection="right">
        {children}
        <style>{KEYFRAMES}</style>
        {toasts.map((item) => (
          <ToastPrimitive.Root
            key={item.id}
            open={item.open}
            onOpenChange={(open) => {
              if (!open) dismiss(item.id)
            }}
            className={cn(
              'relative rounded-xl border border-divider bg-bg-4 p-3 pr-8 shadow-[var(--shadow-elev)]',
              'f1-anim',
              'data-[state=open]:[animation:f1-toast-in_200ms_ease-out]',
              'data-[state=closed]:[animation:f1-toast-in_200ms_ease-out_reverse]',
              'data-[swipe=move]:[transform:translateX(var(--radix-toast-swipe-move-x))]',
              TONE_CLASS[item.tone],
            )}
          >
            <ToastPrimitive.Title className="text-sm font-medium text-fg-1">
              {item.title}
            </ToastPrimitive.Title>
            {item.description ? (
              <ToastPrimitive.Description className="mt-1 text-xs text-fg-3">
                {item.description}
              </ToastPrimitive.Description>
            ) : null}
            <ToastPrimitive.Close
              aria-label="Dismiss notification"
              className="absolute right-2 top-2 rounded p-1 text-fg-3 transition-colors hover:text-fg-1"
            >
              <CloseIcon />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport
          className="fixed bottom-4 right-4 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 outline-none"
          style={{ zIndex: Z.toast }}
        />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  )
}

/** Read the toast queue's `toast()` dispatcher. Must be called from inside a
 *  `ToastProvider` — throws otherwise, so a missing provider fails loudly
 *  instead of silently doing nothing. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return ctx
}
