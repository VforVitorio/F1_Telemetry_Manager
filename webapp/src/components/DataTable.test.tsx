import { describe, it, expect } from 'vitest'
import { buildCsv } from './DataTable'

// Only the pure CSV-serialization helper is tested here: it is the one piece
// of DataTable with real branching logic (RFC 4180 escaping). The
// virtualized table markup itself is exercised visually, not in jsdom.

describe('buildCsv', () => {
  it('joins headers and rows with commas and CRLF line endings', () => {
    const csv = buildCsv(
      ['lap', 'driver'],
      [
        [1, 'VER'],
        [2, 'HAM'],
      ],
    )
    expect(csv).toBe('lap,driver\r\n1,VER\r\n2,HAM')
  })

  it('quotes fields containing a comma or quote and doubles embedded quotes', () => {
    const csv = buildCsv(['note'], [['hello, "world"']])
    expect(csv).toBe('note\r\n"hello, ""world"""')
  })

  it('quotes fields containing an embedded newline without escaping it', () => {
    const csv = buildCsv(['note'], [['line1\nline2']])
    expect(csv).toBe('note\r\n"line1\nline2"')
  })

  it('renders null and undefined values as empty fields', () => {
    const csv = buildCsv(['value'], [[null], [undefined]])
    expect(csv).toBe('value\r\n\r\n')
  })
})
