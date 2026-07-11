import { describe, it, expect } from 'vitest'
import { allocateStrokes } from '@/src/lib/scoring/allocate'

const si18 = [7, 3, 15, 1, 11, 5, 17, 9, 13, 8, 2, 16, 4, 12, 6, 18, 10, 14]
const si9 = [3, 7, 1, 5, 9, 2, 8, 4, 6]

describe('allocateStrokes', () => {
  it('gives no strokes for handicap 0', () => {
    expect(allocateStrokes(0, si18)).toEqual(Array(18).fill(0))
  })
  it('gives one stroke on the hardest N holes for handicap N (< holes)', () => {
    const alloc = allocateStrokes(5, si18)
    si18.forEach((rank, i) => expect(alloc[i]).toBe(rank <= 5 ? 1 : 0))
    expect(alloc.reduce((a, b) => a + b, 0)).toBe(5)
  })
  it('wraps: handicap greater than holes gives everyone a base stroke plus extras on hardest', () => {
    const alloc = allocateStrokes(22, si18)
    si18.forEach((rank, i) => expect(alloc[i]).toBe(rank <= 4 ? 2 : 1))
    expect(alloc.reduce((a, b) => a + b, 0)).toBe(22)
  })
  it('works for 9-hole courses', () => {
    const alloc = allocateStrokes(4, si9)
    si9.forEach((rank, i) => expect(alloc[i]).toBe(rank <= 4 ? 1 : 0))
    expect(alloc.reduce((a, b) => a + b, 0)).toBe(4)
  })
  it('rounds a fractional handicap to the nearest whole stroke', () => {
    expect(allocateStrokes(4.6, si9).reduce((a, b) => a + b, 0)).toBe(5)
  })
  it('treats negative (plus) handicaps as zero strokes', () => {
    expect(allocateStrokes(-2, si9)).toEqual(Array(9).fill(0))
  })
})
