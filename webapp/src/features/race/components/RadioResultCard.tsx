// The Radio Agent (N29) result: sentiment + intent + NER over a team-radio
// transcript, plus the two fields the Streamlit panel silently dropped —
// `corrections` (the intent classifier auditing its own calls) and a
// collapsible `reasoning` trail. Reused by both the corpus browser and the
// free-text composer, so it never assumes a real driver/lap exists.
//
// Sections reveal staggered via `.f1-anim` + a local `@keyframes`, the same
// hand-rolled-animation convention as ReplayTransport's ready-pulse (see that
// file's banner) — `.f1-anim` collapses the animation under reduced motion
// instead of skipping it, so the content still renders, just without motion.

import { CircleAlert, HelpCircle, Info, Megaphone, TriangleAlert, type LucideIcon } from 'lucide-react'
import { Card } from '@/components/Card'
import { ConfidenceDial } from '@/components/ConfidenceDial'
import { Pill } from '@/components/Pill'
import type { RadioAlert, RadioCorrection, RadioEntity, RadioEvent, RadioResult } from '@/lib/api/race'

const REVEAL_KEYFRAMES = `
@keyframes f1-radio-reveal { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) {
  .f1-anim { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; }
}
`

/** Icon per intent tag, over the real Radio Agent vocabulary. Falls back to
 *  `Info` for any value outside that set rather than rendering nothing. */
const INTENT_ICON: Record<string, LucideIcon> = {
  INFORMATION: Info,
  PROBLEM: CircleAlert,
  ORDER: Megaphone,
  WARNING: TriangleAlert,
  QUESTION: HelpCircle,
}

const SENTIMENT_TONE: Record<string, 'success' | 'danger' | 'neutral'> = {
  POSITIVE: 'success',
  NEGATIVE: 'danger',
  NEUTRAL: 'neutral',
}

/** Stagger delay, in ms, for the Nth staged block. */
function revealDelay(index: number): string {
  return `${index * 80}ms`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Wrap each entity occurrence in the transcript with a highlight. Entities
 *  carry text only (no character offsets from the backend), so this matches
 *  by substring — longest-first so e.g. "VERSTAPPEN" doesn't get shadowed by
 *  a shorter unrelated match. Good enough for the short radio transcripts the
 *  NER model sees; a non-match just renders as plain text. */
function highlightEntities(text: string, entities: RadioEntity[]) {
  if (!text || entities.length === 0) return text
  const unique = [...new Set(entities.map((e) => e.text).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  )
  if (unique.length === 0) return text

  const pattern = new RegExp(`(${unique.map(escapeRegExp).join('|')})`, 'gi')
  const parts = text.split(pattern)
  return parts.map((part, i) =>
    unique.some((entity) => entity.toLowerCase() === part.toLowerCase()) ? (
      <mark key={i} className="rounded bg-purple-500/25 px-0.5 text-fg-1">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  )
}

function AlertsRow({ alerts, index }: { alerts: RadioAlert[]; index: number }) {
  if (alerts.length === 0) return null
  return (
    <div
      className="f1-anim flex flex-col gap-1.5 animate-[f1-radio-reveal_400ms_ease-out_both]"
      style={{ animationDelay: revealDelay(index) }}
    >
      {alerts.map((alert, i) => (
        <div
          key={i}
          className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-fg-1"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <span>
            {alert.driver ? <span className="font-medium">[{alert.driver}] </span> : null}
            {alert.message}
          </span>
        </div>
      ))}
    </div>
  )
}

function EventBlock({ event, index }: { event: RadioEvent; index: number }) {
  const analysis = event.analysis
  const Icon = INTENT_ICON[analysis.intent] ?? Info
  const sentimentTone = SENTIMENT_TONE[analysis.sentiment] ?? 'neutral'

  return (
    <div
      className="f1-anim flex flex-col gap-3 animate-[f1-radio-reveal_400ms_ease-out_both]"
      style={{ animationDelay: revealDelay(index) }}
    >
      <blockquote className="rounded-lg border-l-2 border-purple-500/50 bg-bg-2 px-4 py-3 text-sm leading-relaxed text-fg-1 italic">
        {highlightEntities(event.message, analysis.entities)}
      </blockquote>

      <div className="flex flex-wrap items-center gap-3">
        <Pill tone={sentimentTone}>{analysis.sentiment || 'UNKNOWN'}</Pill>
        {analysis.sentiment_score != null ? (
          <span className="font-mono text-xs text-fg-3">{analysis.sentiment_score.toFixed(2)}</span>
        ) : null}

        <span aria-hidden="true" className="h-4 w-px bg-hairline" />

        <Pill tone="purple" className="gap-1">
          <Icon className="size-3" aria-hidden="true" />
          {analysis.intent || 'UNKNOWN'}
        </Pill>
        {analysis.intent_confidence != null ? (
          <ConfidenceDial
            value={analysis.intent_confidence}
            size={40}
            note="Radio Agent intent-classifier confidence"
          />
        ) : null}
      </div>

      {analysis.entities.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {analysis.entities.map((entity, i) => (
            <Pill key={`${entity.label}-${i}`} tone="neutral">
              {entity.text} <span className="text-fg-4">· {entity.label}</span>
            </Pill>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function CorrectionsFootnote({ corrections, index }: { corrections: RadioCorrection[]; index: number }) {
  if (corrections.length === 0) return null
  return (
    <div
      className="f1-anim flex flex-col gap-1.5 rounded-lg border border-hairline bg-bg-2 px-3 py-2 text-xs text-fg-3 animate-[f1-radio-reveal_400ms_ease-out_both]"
      style={{ animationDelay: revealDelay(index) }}
    >
      <span className="font-medium tracking-wide text-fg-2 uppercase">The model auditing itself</span>
      {corrections.map((c, i) => (
        <p key={i}>
          <span className="font-medium text-fg-2">{c.driver}</span>: {c.original_intent} &rarr;{' '}
          {c.suggested_intent} &mdash; {c.reason}
          {c.span ? <span className="italic"> ({c.span})</span> : null}
        </p>
      ))}
    </div>
  )
}

function ReasoningDisclosure({ reasoning, index }: { reasoning: string; index: number }) {
  if (!reasoning) return null
  return (
    <details
      className="f1-anim group animate-[f1-radio-reveal_400ms_ease-out_both]"
      style={{ animationDelay: revealDelay(index) }}
    >
      <summary className="cursor-pointer text-xs font-medium tracking-wide text-fg-3 uppercase marker:content-none">
        Reasoning
      </summary>
      <p className="mt-2 rounded-lg bg-bg-2 px-3 py-2 text-sm leading-relaxed text-fg-2">{reasoning}</p>
    </details>
  )
}

export function RadioResultCard({ result }: { result: RadioResult }) {
  const isEmpty =
    result.alerts.length === 0 &&
    result.radio_events.length === 0 &&
    result.corrections.length === 0 &&
    !result.reasoning

  if (isEmpty) {
    return (
      <Card elevation="resting" className="p-4 text-sm text-fg-3">
        The Radio Agent returned no events for this message.
      </Card>
    )
  }

  return (
    <Card elevation="resting" className="flex flex-col gap-4 p-4">
      <style>{REVEAL_KEYFRAMES}</style>
      <AlertsRow alerts={result.alerts} index={0} />
      {result.radio_events.map((event, i) => (
        <EventBlock key={i} event={event} index={i + 1} />
      ))}
      <CorrectionsFootnote corrections={result.corrections} index={result.radio_events.length + 1} />
      <ReasoningDisclosure reasoning={result.reasoning} index={result.radio_events.length + 2} />
    </Card>
  )
}
