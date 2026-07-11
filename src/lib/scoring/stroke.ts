import { allocateStrokes } from './allocate'
import { compareCountback } from './countback'

export interface ScoreInput {
  playerId: string
  holeNumber: number
  strokes: number
}

export interface PlayerInput {
  id: string
  displayName: string
  groupName?: string
  handicapIndex: number | null
}

export interface LeaderboardInput {
  players: PlayerInput[]
  scores: ScoreInput[]
  par: number[]
  strokeIndex: number[] | null
  handicapMode: 'none' | 'manual' | 'auto'
}

export interface LeaderboardRow {
  playerId: string
  displayName: string
  groupName?: string
  thru: number
  gross: number
  net: number | null
  toPar: number
}

interface Internal extends LeaderboardRow {
  value: number
  series: number[]
}

export function computeStrokeLeaderboard(input: LeaderboardInput): LeaderboardRow[] {
  const { players, scores, par, strokeIndex, handicapMode } = input
  const useNet = handicapMode !== 'none'
  const holes = par.length

  const rows: Internal[] = players.map((p) => {
    const mine = scores.filter((s) => s.playerId === p.id)
    const byHole = new Map(mine.map((s) => [s.holeNumber, s.strokes]))
    const playedHoles = [...byHole.keys()].sort((a, b) => a - b)
    const thru = playedHoles.length
    const gross = playedHoles.reduce((sum, h) => sum + (byHole.get(h) ?? 0), 0)
    const parPlayed = playedHoles.reduce((sum, h) => sum + par[h - 1], 0)

    let net: number | null = null
    let series: number[]
    if (useNet && p.handicapIndex != null) {
      if (strokeIndex) {
        const alloc = allocateStrokes(p.handicapIndex, strokeIndex)
        net = playedHoles.reduce((sum, h) => sum + byHole.get(h)! - alloc[h - 1], 0)
        series = Array.from({ length: holes }, (_, i) =>
          byHole.has(i + 1) ? byHole.get(i + 1)! - alloc[i] : 0,
        )
      } else {
        net = gross - Math.round(p.handicapIndex)
        series = Array.from({ length: holes }, (_, i) => byHole.get(i + 1) ?? 0)
      }
    } else {
      series = Array.from({ length: holes }, (_, i) => byHole.get(i + 1) ?? 0)
    }

    const value = useNet && net != null ? net : gross
    return {
      playerId: p.id,
      displayName: p.displayName,
      groupName: p.groupName,
      thru,
      gross,
      net,
      toPar: value - parPlayed,
      value,
      series,
    }
  })

  rows.sort((a, b) => {
    if (a.thru === 0 && b.thru === 0) return 0
    if (a.thru === 0) return 1
    if (b.thru === 0) return -1
    if (a.value !== b.value) return a.value - b.value
    if (a.thru === holes && b.thru === holes) return compareCountback(a.series, b.series)
    return 0
  })

  return rows.map(({ value, series, ...row }) => row)
}
