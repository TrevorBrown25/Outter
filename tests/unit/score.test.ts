import { describe, it, expect } from 'vitest'
import { toPar } from '@/src/components/score'

describe('toPar', () => {
  it('formats under par with a minus and red class', () => {
    expect(toPar(-4)).toEqual({ label: '−4', className: 'text-board-red' })
  })
  it('formats even par as E in ink', () => {
    expect(toPar(0)).toEqual({ label: 'E', className: 'text-ink' })
  })
  it('formats over par with a plus and sage', () => {
    expect(toPar(3)).toEqual({ label: '+3', className: 'text-sage' })
  })
  it('uses a real minus sign (U+2212), not a hyphen', () => {
    expect(toPar(-1).label.charCodeAt(0)).toBe(0x2212)
  })
})
