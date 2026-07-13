import ReactMarkdown, { type Components } from 'react-markdown'
import { cn } from '@/lib/cn'

// Thin styling layer over react-markdown: every element is mapped to a
// token-only Tailwind class via the `components` prop instead of a global
// prose stylesheet, so chat replies and RAG answers inherit the same type
// scale, colors, and code styling as the rest of the design system.
// `node` (the underlying hast element) is destructured out of every renderer
// so it never leaks into the DOM as an unknown prop.

const COMPONENTS: Components = {
  h1: ({ node: _node, className, ...props }) => (
    <h1 className={cn('font-display text-2xl font-bold text-fg-1', className)} {...props} />
  ),
  h2: ({ node: _node, className, ...props }) => (
    <h2 className={cn('font-display text-xl font-semibold text-fg-1', className)} {...props} />
  ),
  h3: ({ node: _node, className, ...props }) => (
    <h3 className={cn('font-display text-lg font-semibold text-fg-1', className)} {...props} />
  ),
  p: ({ node: _node, className, ...props }) => (
    <p className={cn('text-fg-2 text-pretty leading-relaxed', className)} {...props} />
  ),
  a: ({ node: _node, className, ...props }) => (
    <a
      className={cn(
        'text-purple-300 underline underline-offset-2 hover:text-purple-200',
        className,
      )}
      {...props}
      target="_blank"
      rel="noreferrer"
    />
  ),
  ul: ({ node: _node, className, ...props }) => (
    <ul className={cn('list-disc space-y-1 pl-5 text-fg-2', className)} {...props} />
  ),
  ol: ({ node: _node, className, ...props }) => (
    <ol className={cn('list-decimal space-y-1 pl-5 text-fg-2', className)} {...props} />
  ),
  li: ({ node: _node, className, ...props }) => (
    <li className={cn('text-fg-2', className)} {...props} />
  ),
  code: ({ node: _node, className, ...props }) => (
    <code
      className={cn('rounded bg-bg-2 px-1 font-mono text-sm text-fg-1', className)}
      {...props}
    />
  ),
  pre: ({ node: _node, className, ...props }) => (
    <pre
      className={cn('overflow-auto rounded-lg bg-bg-2 p-3 font-mono text-sm', className)}
      {...props}
    />
  ),
}

export interface MarkdownProps {
  children: string
}

/** Render a Markdown string (chat replies, RAG answers) with the design
 *  system's token classes instead of react-markdown's unstyled defaults. */
export function Markdown({ children }: MarkdownProps) {
  return <ReactMarkdown components={COMPONENTS}>{children}</ReactMarkdown>
}
