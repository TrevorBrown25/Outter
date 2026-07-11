import { describe, it, expect } from 'vitest'
import { compareCountback } from '@/src/lib/scoring/countback'

describe('compareCountback', () => {
  it('lower back-9 total wins on an 18-hole tie', () => {
    const a = Array(18).fill(4); a[17] = 3
    const b = Array(18).fill(4); b[0] = 3
    expect(compareCountback(a, b)).toBeLessThan(0)
  })
  it('falls through to back-3 when back-9 and back-6 tie', () => {
    const a = Array(18).fill(4); a[16] = 3; a[9] = 5
    const b = Array(18).fill(4); b[10] = 3; b[15] = 5
    expect(compareCountback(a, b)).toBeLessThan(0)
  })
  it('returns 0 when every countback segment is identical', () => {
    const a = Array(18).fill(4)
    const b = Array(18).fill(4)
    expect(compareCountback(a, b)).toBe(0)
  })
  it('uses last 3/2/1 for 9-hole rounds', () => {
    const a = Array(9).fill(4); a[8] = 3
    const b = Array(9).fill(4); b[0] = 3
    expect(compareCountback(a, b)).toBeLessThan(0)
  })
})
