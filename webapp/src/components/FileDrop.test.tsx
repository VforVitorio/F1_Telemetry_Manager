import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FileDrop } from './FileDrop'

function makeFile(name: string, type: string): File {
  return new File(['content'], name, { type })
}

describe('FileDrop', () => {
  it('calls onFile and shows the filename when a file is picked via the input', () => {
    const onFile = vi.fn()
    render(<FileDrop onFile={onFile} label="Upload telemetry" />)

    const file = makeFile('lap-times.csv', 'text/csv')
    const input = screen.getByLabelText('Upload telemetry')
    fireEvent.change(input, { target: { files: [file] } })

    expect(onFile).toHaveBeenCalledWith(file)
    expect(screen.getByText('lap-times.csv')).toBeInTheDocument()
  })

  it('calls onFile when a file is dropped onto the zone', () => {
    const onFile = vi.fn()
    const { container } = render(<FileDrop onFile={onFile} label="Upload telemetry" />)

    const file = makeFile('stint.parquet', 'application/octet-stream')
    const dropzone = container.firstElementChild as HTMLElement
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } })

    expect(onFile).toHaveBeenCalledWith(file)
  })

  it('does not call onFile when dropped while disabled', () => {
    const onFile = vi.fn()
    const { container } = render(<FileDrop onFile={onFile} label="Upload telemetry" disabled />)

    const file = makeFile('stint.parquet', 'application/octet-stream')
    const dropzone = container.firstElementChild as HTMLElement
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } })

    expect(onFile).not.toHaveBeenCalled()
  })
})
