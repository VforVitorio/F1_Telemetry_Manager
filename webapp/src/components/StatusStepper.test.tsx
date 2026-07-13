import { describe, it, expect } from 'vitest'
import { stepState } from './StatusStepper'

describe('stepState', () => {
  it('marks steps before activeIndex as done', () => {
    expect(stepState(0, 2, 'running')).toBe('done')
  })

  it('marks steps after activeIndex as pending', () => {
    expect(stepState(3, 2, 'running')).toBe('pending')
  })

  it('maps the active step to "active" when status is running', () => {
    expect(stepState(2, 2, 'running')).toBe('active')
  })

  it('passes "done" and "error" statuses through at the active step', () => {
    expect(stepState(2, 2, 'done')).toBe('done')
    expect(stepState(2, 2, 'error')).toBe('error')
  })
})
