// "Ask AI about this comparison" entry point. The chat surface hasn't landed
// yet, so this ships disabled with an explanatory tooltip — but the real
// `/chat` deep-link target is already
// computed from the current selection, so wiring it up later is a one-line
// change (drop `disabled`, point the trigger at the router) rather than a
// redesign.

import { Sparkles } from 'lucide-react'
import type { ComparisonSearch } from '../search'
import { Button } from '@/components/Button'
import { Tooltip } from '@/components/Tooltip'

export interface AskAiButtonProps {
  search: ComparisonSearch
}

/**
 * The `/chat` deep-link this button will navigate to once #39 ships: carries
 * the same year/gp/session/drivers context as the comparison, so the chat
 * opens already scoped to this exact head-to-head instead of a blank slate.
 * Pure — unit-testable independently of the disabled-button rendering.
 */
export function buildChatDeepLink(search: ComparisonSearch): string {
  const params = new URLSearchParams()
  if (search.year != null) params.set('year', String(search.year))
  if (search.gp) params.set('gp', search.gp)
  if (search.session) params.set('session', search.session)
  if (search.drivers.length > 0) params.set('drivers', search.drivers.join(','))
  params.set('context', 'comparison')
  return `/chat?${params.toString()}`
}

/**
 * Ghost "Ask AI about this comparison" button. Disabled with a tooltip until
 * the chat surface (#39) ships. The trigger is wrapped in a plain `<span>`
 * (rather than tooltipping the button itself) so hovering still opens the
 * tooltip — a native `disabled` button's `pointer-events:none` would
 * otherwise swallow the hover before Radix ever sees it.
 */
export function AskAiButton({ search }: AskAiButtonProps) {
  const deepLink = buildChatDeepLink(search)
  return (
    <Tooltip content="AI chat is coming soon">
      <span tabIndex={0} className="inline-block" data-deep-link={deepLink}>
        <Button variant="ghost" size="sm" disabled>
          <Sparkles className="size-4 shrink-0" aria-hidden="true" />
          Ask AI about this comparison
        </Button>
      </span>
    </Tooltip>
  )
}
