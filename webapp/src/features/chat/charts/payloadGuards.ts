// Minimal, shared type-narrowing helpers for the four chart-tool payloads.
// Every MCP tool result arrives as `unknown` on the wire (the backend does
// not schema its `data` field — see lib/api/chat.ts's own note on
// `ToolResult.data`), so each builder in this folder validates its own shape
// before touching it and returns null on any mismatch rather than throwing —
// a malformed payload degrades to InlineChart's "chart unavailable" note,
// never a crash.

/** Narrows to a plain object (excluding arrays and null), or null. */
export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** Narrows to an array, or null. */
export function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null
}

/** Numeric entries of an array field, dropping anything non-numeric rather
 *  than failing the whole series over one bad sample. */
export function asNumberArray(value: unknown): number[] {
  const arr = asArray(value)
  if (!arr) return []
  return arr.filter((entry): entry is number => typeof entry === 'number')
}

export function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

export function asNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' ? value : null
}

export function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}
