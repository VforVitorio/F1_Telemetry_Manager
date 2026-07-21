// Collapsible raw-JSON fallback, shared by every tool-result family renderer
// for the shapes it does not recognise (an unexpected tool, a field that
// failed to narrow). Keeps an unknown payload inspectable instead of
// rendering nothing, the same fallback the C1 placeholder used for every
// result before this sprint gave each family its own renderer.

export interface RawDataDisclosureProps {
  data: Record<string, unknown>
}

export function RawDataDisclosure({ data }: RawDataDisclosureProps) {
  return (
    <details className="text-xs text-fg-3">
      <summary className="cursor-pointer select-none">Raw data</summary>
      <pre className="mt-2 overflow-auto rounded-lg bg-bg-2 p-2 font-mono">
        {JSON.stringify(data, null, 2)}
      </pre>
    </details>
  )
}
