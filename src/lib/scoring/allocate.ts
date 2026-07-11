/**
 * Strokes received on each hole for a playing handicap, allocated by stroke index.
 * strokeIndex[i] is the difficulty rank (1 = hardest) of hole i. Returns an array
 * the same length as strokeIndex. Handles handicaps larger than the hole count
 * (everyone gets a base stroke, extras land on the hardest holes) and 9-hole rounds.
 */
export function allocateStrokes(handicap: number, strokeIndex: number[]): number[] {
  const n = strokeIndex.length
  const h = Math.max(0, Math.round(handicap))
  const base = Math.floor(h / n)
  const remainder = h % n
  return strokeIndex.map((rank) => base + (rank <= remainder ? 1 : 0))
}
