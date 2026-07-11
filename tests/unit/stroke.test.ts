import { describe, it, expect } from 'vitest'
import { computeStrokeLeaderboard } from '@/src/lib/scoring/stroke'

const par9 = [4, 4, 3, 5, 4, 4, 3, 5, 4]
const si9 = [3, 7, 1, 5, 9, 2, 8, 4, 6]

function scoresFor(playerId: string, strokes: number[]) {
  return strokes.map((s, i) => ({ playerId, holeNumber: i + 1, strokes: s }))
}

describe('computeStrokeLeaderboard', () => {
  it('ranks by gross when handicaps are off; toPar is relative to holes played', () => {
    const rows = computeStrokeLeaderboard({
      players: [
        { id: 'a', displayName: 'Ann', handicapIndex: null },
        { id: 'b', displayName: 'Bob', handicapIndex: null },
      ],
      scores: [...scoresFor('a', [4, 4, 3, 5, 4, 4, 3, 5, 4]), ...scoresFor('b', [5, 5, 4, 6, 5, 4, 3, 5, 4])],
      par: par9,
      strokeIndex: si9,
      handicapMode: 'none',
    })
    expect(rows.map((r) => r.playerId)).toEqual(['a', 'b'])
    expect(rows[0]).toMatchObject({ gross: 36, net: null, thru: 9, toPar: 0 })
    expect(rows[1]).toMatchObject({ gross: 41, toPar: 5 })
  })

  it('ranks by net (proper allocation) when handicaps are on', () => {
    const rows = computeStrokeLeaderboard({
      players: [
        { id: 'a', displayName: 'Ann', handicapIndex: 0 },
        { id: 'b', displayName: 'Bob', handicapIndex: 9 },
      ],
      scores: [...scoresFor('a', [4, 4, 3, 5, 4, 4, 3, 5, 4]), ...scoresFor('b', [5, 5, 4, 6, 5, 4, 3, 5, 4])],
      par: par9,
      strokeIndex: si9,
      handicapMode: 'manual',
    })
    expect(rows[0].playerId).toBe('b')
    expect(rows[0]).toMatchObject({ gross: 41, net: 32, toPar: -4 })
    expect(rows[1]).toMatchObject({ gross: 36, net: 36, toPar: 0 })
  })

  it('falls back to simple net when stroke index is unavailable', () => {
    const rows = computeStrokeLeaderboard({
      players: [{ id: 'b', displayName: 'Bob', handicapIndex: 9 }],
      scores: scoresFor('b', [5, 5, 4, 6, 5, 4, 3, 5, 4]),
      par: par9,
      strokeIndex: null,
      handicapMode: 'manual',
    })
    expect(rows[0]).toMatchObject({ gross: 41, net: 32 })
  })

  it('breaks exact gross ties by countback (better back-3 wins on 9)', () => {
    const rows = computeStrokeLeaderboard({
      players: [
        { id: 'a', displayName: 'Ann', handicapIndex: null },
        { id: 'b', displayName: 'Bob', handicapIndex: null },
      ],
      scores: [...scoresFor('a', [5, 4, 3, 5, 4, 4, 3, 5, 4]), ...scoresFor('b', [4, 4, 3, 5, 4, 4, 4, 5, 4])],
      par: par9,
      strokeIndex: si9,
      handicapMode: 'none',
    })
    expect(rows.map((r) => r.gross)).toEqual([37, 37])
    expect(rows[0].playerId).toBe('a')
  })

  it('reports thru and partial toPar mid-round', () => {
    const rows = computeStrokeLeaderboard({
      players: [{ id: 'a', displayName: 'Ann', handicapIndex: null }],
      scores: scoresFor('a', [5, 5]),
      par: par9,
      strokeIndex: si9,
      handicapMode: 'none',
    })
    expect(rows[0]).toMatchObject({ thru: 2, gross: 10, toPar: 2 })
  })

  it('places players with no scores last with thru 0', () => {
    const rows = computeStrokeLeaderboard({
      players: [
        { id: 'a', displayName: 'Ann', handicapIndex: null },
        { id: 'z', displayName: 'Zoe', handicapIndex: null },
      ],
      scores: scoresFor('a', [4]),
      par: par9,
      strokeIndex: si9,
      handicapMode: 'none',
    })
    expect(rows[rows.length - 1]).toMatchObject({ playerId: 'z', thru: 0 })
  })
})
