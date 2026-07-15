import { ChevronRight, Scale, TriangleAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card } from '@/components/Card'
import { Markdown } from '@/components/Markdown'
import { cn } from '@/lib/cn'
import type { StrategyRecommendation } from '@/lib/api/strategy'
import { ContingencyList } from './ContingencyList'

// The Decision Details block is the Strategy tab's evidence/context surface —
// everything the headline `DecisionBanner` doesn't show: key risks, the
// IF-THEN playbook, and two collapsible panels (engineer's reasoning,
// regulation context). Split out of the former all-in-one `DecisionCard` so
// the hero banner can co-locate the decision with its Monte-Carlo evidence
// without this secondary material competing for the same glowing card. A
// no-LLM / degraded `/recommend` run still returns only action/reasoning/
// confidence with everything else null/empty, so EVERY section here is gated
// on its own data being present — a sparse run reads as a shorter brief,
// never a broken one.

/** Plain section heading (`text-[13px] font-semibold`, no purple side-tick).
 *  The original `DecisionCard`'s `SubHeading` (uppercase + tracking-widest +
 *  a purple tick, mirroring the Dashboard's `SectionHeader`) was flagged
 *  during the redesign as a visual anti-pattern — the tick reads as a status
 *  stripe rather than a heading marker at this card-interior scale — so this
 *  plain heading replaces it wherever a labeled subsection is still needed. */
function SectionHeading({ label }: { label: string }) {
  return <h3 className="text-[13px] font-semibold text-fg-2">{label}</h3>
}

interface DisclosureProps {
  icon: LucideIcon
  label: string
  /** Whether the icon rotates 90deg on open. True for the chevron on the
   *  engineer's note (it doubles as the expand/collapse cue); false for the
   *  static Scale icon on regulation context, which is a content marker, not
   *  an affordance. */
  rotateIcon?: boolean
  children: ReactNode
}

/**
 * Native `<details>` disclosure styled to the design tokens — used for the
 * engineer's note and regulation context panels. Native disclosure is
 * accessible and keyboard-operable for free; no accordion dependency is
 * worth pulling in for two static panels.
 */
function Disclosure({ icon: Icon, label, rotateIcon = false, children }: DisclosureProps) {
  return (
    <details className="group rounded-lg border border-hairline open:bg-bg-4/60">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium text-fg-2 [&::-webkit-details-marker]:hidden">
        <Icon
          aria-hidden="true"
          className={cn(
            'size-4 shrink-0 text-fg-3',
            rotateIcon && 'transition-transform duration-200 group-open:rotate-90',
          )}
        />
        {label}
      </summary>
      <div className="border-t border-hairline px-3 py-3">{children}</div>
    </details>
  )
}

export interface DecisionDetailsProps {
  result: StrategyRecommendation
}

/**
 * The strategy brief's evidence/context block: key risks, the IF-THEN
 * playbook, and two collapsible panels (engineer's reasoning, regulation
 * context). See the module docstring above for why every section is
 * conditional on the sparse (no-LLM) run.
 */
export function DecisionDetails({ result }: DecisionDetailsProps) {
  return (
    <Card className="flex flex-col gap-5 p-6">
      {result.key_risks.length > 0 ? (
        <div className="flex flex-col gap-2">
          <SectionHeading label="Key risks" />
          <ul className="flex flex-col gap-1.5">
            {result.key_risks.map((risk, index) => (
              <li key={`${risk}-${index}`} className="flex items-start gap-2 text-sm text-fg-2">
                <TriangleAlert
                  className="mt-0.5 size-3.5 shrink-0 text-warning"
                  aria-hidden="true"
                />
                <span>{risk}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.contingencies.length > 0 ? (
        <div className="flex flex-col gap-2">
          <SectionHeading label="Playbook" />
          <ContingencyList contingencies={result.contingencies} />
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {result.reasoning ? (
          <Disclosure icon={ChevronRight} label="Engineer's note" rotateIcon>
            <Markdown>{result.reasoning}</Markdown>
          </Disclosure>
        ) : null}
        {result.regulation_context ? (
          <Disclosure icon={Scale} label="Regulation context">
            <Markdown>{result.regulation_context}</Markdown>
          </Disclosure>
        ) : null}
      </div>
    </Card>
  )
}
