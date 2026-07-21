import { CircleGauge, Disc3, Gavel, Route, type LucideIcon } from 'lucide-react'
import { Card } from '@/components/Card'

interface ExamplePrompt {
  Icon: LucideIcon
  label: string
  prompt: string
}

// Byte-identical to the Streamlit example cards (`frontend/components/chatbot/
// chat_history.py:199-224`) so a user moving between the old and new chat
// sees the same four starting points, in the same 2x2 order (tyres, pace,
// regs, strategy).
const EXAMPLE_PROMPTS: ExamplePrompt[] = [
  { Icon: Disc3, label: 'Tyre status', prompt: 'Tyre status for VER at lap 30 in Bahrain' },
  { Icon: CircleGauge, label: 'Pace prediction', prompt: 'Predict pace for LEC lap 25 Monaco' },
  {
    Icon: Gavel,
    label: 'FIA regulation',
    prompt: 'What do articles 55 and 57 say about safety car procedures?',
  },
  {
    Icon: Route,
    label: 'Full strategy',
    prompt: 'Full strategy for NOR lap 40 Australia risk 0.7',
  },
]

export interface ExamplePromptsProps {
  onSelect: (prompt: string) => void
}

/**
 * The empty-chat starting point: a display heading, a hint line, and four
 * example prompts. Clicking one sends it immediately — the same behaviour as
 * the Streamlit example cards (parity, `chat_history.py:229-236`), not just a
 * prefill — so each card shows the actual prompt it will send, keeping the
 * click informed rather than a surprise.
 */
export function ExamplePrompts({ onSelect }: ExamplePromptsProps) {
  return (
    <div className="flex flex-col items-center gap-6 px-6 py-10 text-center">
      <div className="flex flex-col items-center gap-2">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-fg-1">
          Ask the pit wall
        </h2>
        <p className="max-w-sm text-sm text-fg-3">
          Mention a <span className="font-medium text-fg-2">driver</span>,{' '}
          <span className="font-medium text-fg-2">GP</span>, and{' '}
          <span className="font-medium text-fg-2">lap</span> to trigger an analysis, or start from
          an example.
        </p>
      </div>
      <div className="grid w-full max-w-xl grid-cols-1 gap-2.5 sm:grid-cols-2">
        {EXAMPLE_PROMPTS.map(({ Icon, label, prompt }) => (
          <Card
            key={label}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(prompt)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelect(prompt)
              }
            }}
            className="flex cursor-pointer flex-col items-start gap-1.5 p-3.5 text-left transition-colors hover:bg-bg-4 focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:outline-none"
          >
            <span className="flex items-center gap-2">
              <Icon className="size-4 shrink-0 text-purple-300" aria-hidden="true" />
              <span className="text-sm font-medium text-fg-1">{label}</span>
            </span>
            <span className="line-clamp-2 text-xs leading-relaxed text-fg-3">{prompt}</span>
          </Card>
        ))}
      </div>
    </div>
  )
}
