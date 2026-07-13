import type { ReactNode } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'
import { cn } from '@/lib/cn'
import { Z } from '@/lib/zIndex'
import { Button } from '@/components/Button'

// Overlay + surface primitives for centered dialogs, right-side sheets, and
// destructive-action confirmations. Built on Radix Dialog / AlertDialog so
// focus trapping, Escape-to-close, and scroll locking come for free.
//
// Animation note (why this isn't `transition-*` like Button/Card): Radix's
// Presence only delays unmounting a closed node long enough to play a REAL
// CSS `animation` — it inspects `getComputedStyle(node).animationName`
// (see `@radix-ui/react-presence`). A plain `transition-opacity` never fires
// here because the node is born already in its final state (nothing to
// transition from) and, on close, Presence removes it before a transition
// could even start. No `tailwindcss-animate`-style plugin is installed, so
// the keyframes below are hand-rolled and injected via an inline `<style>`.
// That `<style>` tag is rendered as a direct child of `Root` (NOT inside
// `Portal`) so it survives for the component's whole mounted lifetime —
// Dialog's `Portal` wraps each of ITS OWN children in an individual
// `Presence`, and a bare `<style>` tag has no `animationName` of its own, so
// nesting it there would make it (and the keyframe rule the closing overlay/
// content needs) disappear in the same tick the close animation starts.
//
// Usage contract: keep `<Modal>`/`<Sheet>`/`<ConfirmDialog>` mounted and
// drive visibility via the `open` prop (the standard Radix pattern) rather
// than conditionally rendering the whole component — that keeps the
// `<style>` sibling alive for the duration of the exit animation.

const KEYFRAMES = `
@keyframes f1-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes f1-scale-fade { from { opacity: 0; transform: translate(-50%, -50%) scale(0.96) } to { opacity: 1; transform: translate(-50%, -50%) scale(1) } }
@keyframes f1-slide-right { from { transform: translateX(100%) } to { transform: translateX(0) } }
@media (prefers-reduced-motion: reduce) {
  .f1-anim { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; }
}
`

const OVERLAY_CLASS = cn(
  'fixed inset-0 bg-black/60 backdrop-blur-sm f1-anim',
  'data-[state=open]:[animation:f1-fade_200ms_ease-out]',
  'data-[state=closed]:[animation:f1-fade_200ms_ease-out_reverse]',
)

const CLOSE_BUTTON_CLASS = cn(
  'rounded-lg p-1 text-fg-3 transition-colors hover:bg-bg-4 hover:text-fg-1',
  'focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-3 focus-visible:outline-none',
)

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

/** Title + description + close-icon-button row shared by `Modal` and `Sheet`
 *  (both are plain Radix Dialogs; only their Content positioning differs). */
function DialogChrome({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <DialogPrimitive.Title className="font-display text-lg text-fg-1">
          {title}
        </DialogPrimitive.Title>
        {description ? (
          <DialogPrimitive.Description className="mt-1 text-sm text-fg-3">
            {description}
          </DialogPrimitive.Description>
        ) : null}
      </div>
      <DialogPrimitive.Close asChild>
        <button type="button" aria-label="Close dialog" className={CLOSE_BUTTON_CLASS}>
          <CloseIcon />
        </button>
      </DialogPrimitive.Close>
    </div>
  )
}

export interface ModalProps {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: ReactNode
  title: string
  description?: string
  children?: ReactNode
  className?: string
}

/** Centered dialog on `@radix-ui/react-dialog`. Always renders an accessible
 *  title; pass `description` to also satisfy Radix's `aria-describedby`. */
export function Modal({
  open,
  defaultOpen,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  className,
}: ModalProps) {
  return (
    <DialogPrimitive.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <style>{KEYFRAMES}</style>
      {trigger ? <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger> : null}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={OVERLAY_CLASS} style={{ zIndex: Z.overlay }} />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2',
            'rounded-2xl border border-divider bg-bg-3 p-6 shadow-[var(--shadow-elev)]',
            'f1-anim',
            'data-[state=open]:[animation:f1-scale-fade_200ms_ease-out]',
            'data-[state=closed]:[animation:f1-scale-fade_200ms_ease-out_reverse]',
            className,
          )}
          style={{ zIndex: Z.modal }}
        >
          <DialogChrome title={title} description={description} />
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/** Right-side slide-in panel, same contract as `Modal`. Use for detail
 *  drawers / secondary forms that don't need the full centered-dialog weight. */
export type SheetProps = ModalProps

export function Sheet({
  open,
  defaultOpen,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  className,
}: SheetProps) {
  return (
    <DialogPrimitive.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <style>{KEYFRAMES}</style>
      {trigger ? <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger> : null}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={OVERLAY_CLASS} style={{ zIndex: Z.overlay }} />
        <DialogPrimitive.Content
          className={cn(
            'fixed inset-y-0 right-0 flex h-full w-full max-w-sm flex-col',
            'border-l border-divider bg-bg-3 p-6 shadow-[var(--shadow-elev)]',
            'f1-anim',
            'data-[state=open]:[animation:f1-slide-right_200ms_ease-out]',
            'data-[state=closed]:[animation:f1-slide-right_200ms_ease-out_reverse]',
            className,
          )}
          style={{ zIndex: Z.modal }}
        >
          <DialogChrome title={title} description={description} />
          <div className="flex-1 overflow-y-auto">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  trigger?: ReactNode
}

/** Destructive-action confirmation on `@radix-ui/react-alert-dialog` — no
 *  incidental close icon by design (the user must actively choose Cancel or
 *  Confirm). Confirm button is always `variant="danger"`. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  trigger,
}: ConfirmDialogProps) {
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <style>{KEYFRAMES}</style>
      {trigger ? (
        <AlertDialogPrimitive.Trigger asChild>{trigger}</AlertDialogPrimitive.Trigger>
      ) : null}
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className={OVERLAY_CLASS} style={{ zIndex: Z.overlay }} />
        <AlertDialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2',
            'rounded-2xl border border-divider bg-bg-3 p-6 shadow-[var(--shadow-elev)]',
            'f1-anim',
            'data-[state=open]:[animation:f1-scale-fade_200ms_ease-out]',
            'data-[state=closed]:[animation:f1-scale-fade_200ms_ease-out_reverse]',
          )}
          style={{ zIndex: Z.modal }}
        >
          <AlertDialogPrimitive.Title className="font-display text-lg text-fg-1">
            {title}
          </AlertDialogPrimitive.Title>
          {description ? (
            <AlertDialogPrimitive.Description className="mt-2 text-sm text-fg-3">
              {description}
            </AlertDialogPrimitive.Description>
          ) : null}
          <div className="mt-6 flex justify-end gap-2">
            <AlertDialogPrimitive.Cancel asChild>
              <Button variant="ghost">{cancelLabel}</Button>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild>
              <Button variant="danger" onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  )
}
