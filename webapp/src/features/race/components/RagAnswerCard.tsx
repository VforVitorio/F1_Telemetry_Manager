// The Regulations answer: the RAG response rendered with its CITATIONS, which
// the Streamlit tab never showed — it read a `sources` key the backend doesn't
// return, so the panel sat permanently empty while real article references went
// unused. Here the chips come from `articles[]` and the passages from `chunks[]`
// (reliable metadata), never parsed out of the answer prose. CitationChip and
// SourcePassage are exported so the future Chat tab can lift them.

import { FileText, Scale } from 'lucide-react'
import { Card } from '@/components/Card'
import { Markdown } from '@/components/Markdown'
import { useTypewriter } from '@/lib/useTypewriter'
import type { RagChunk, RagResult } from '@/lib/api/race'

/** A regulation reference chip, e.g. "⚖ Art 55.1". */
export function CitationChip({ article }: { article: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-hairline bg-bg-4 px-2 py-0.5 font-mono text-xs text-fg-2">
      <Scale className="size-3 text-fg-3" aria-hidden="true" />
      {article}
    </span>
  )
}

/** Turns a snake_case doc-type code into a readable label, e.g. "sporting_regs"
 *  becomes "Sporting Regs" instead of leaking the raw backend field name. */
function prettifyDocType(docType: string): string {
  return docType
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/** One retrieved source passage, collapsed by default. The header carries the
 *  article + doc type · year · retrieval-similarity score; the body is the
 *  raw chunk text. */
export function SourcePassage({ chunk }: { chunk: RagChunk }) {
  const meta = [
    chunk.doc_type ? prettifyDocType(chunk.doc_type) : null,
    chunk.year != null ? String(chunk.year) : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <details className="group rounded-lg border border-hairline bg-bg-2">
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm text-fg-2 marker:content-none">
        <span className="flex items-center gap-2 truncate">
          <FileText className="size-3.5 shrink-0 text-fg-3" aria-hidden="true" />
          <span className="truncate font-medium text-fg-1">{chunk.article || 'Passage'}</span>
          {meta ? <span className="truncate text-xs text-fg-3">{meta}</span> : null}
        </span>
        {chunk.score != null ? (
          <span className="shrink-0 font-mono text-xs text-fg-4" title="Retrieval similarity score">
            sim {chunk.score.toFixed(2)}
          </span>
        ) : null}
      </summary>
      <p className="border-t border-hairline px-3 py-2 text-sm leading-relaxed text-fg-2">
        {chunk.text}
      </p>
    </details>
  )
}

/** The answer card: the plain-English answer, its citation chips, and the
 *  expandable source passages backing it. When `stream` is set (a freshly
 *  asked question, not a restored history entry) the answer types itself out
 *  and the citations/passages hold back until it finishes, so the card reads
 *  as if the answer were being generated live. */
export function RagAnswerCard({ result, stream = false }: { result: RagResult; stream?: boolean }) {
  const answerText = result.answer || ''
  const { revealed, done } = useTypewriter(answerText, stream)
  const body = stream && !done ? `${revealed}▌` : answerText || '_No answer returned._'
  const showBacking = !stream || done

  return (
    <Card elevation="resting" className="flex flex-col gap-4 p-4">
      <div className="prose-sm text-fg-1">
        <Markdown>{body}</Markdown>
      </div>

      {showBacking && result.articles.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium tracking-wide text-fg-3 uppercase">Cites</span>
          {result.articles.map((article) => (
            <CitationChip key={article} article={article} />
          ))}
        </div>
      ) : null}

      {showBacking && result.chunks.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium tracking-wide text-fg-3 uppercase">
            Source passages
          </span>
          {result.chunks.map((chunk, i) => (
            <SourcePassage key={`${chunk.article}-${i}`} chunk={chunk} />
          ))}
        </div>
      ) : null}
    </Card>
  )
}
