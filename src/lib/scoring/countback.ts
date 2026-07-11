/** Segment lengths compared in order, longest tail first. */
function segments(n: number): number[] {
  return n >= 18 ? [9, 6, 3] : [3, 2, 1]
}

function tailSum(series: number[], count: number): number {
  return series.slice(series.length - count).reduce((a, b) => a + b, 0)
}

/**
 * Compare two complete per-hole series by countback.
 * Returns <0 if a ranks ahead, >0 if b ranks ahead, 0 if fully tied.
 */
export function compareCountback(a: number[], b: number[]): number {
  for (const seg of segments(a.length)) {
    const diff = tailSum(a, seg) - tailSum(b, seg)
    if (diff !== 0) return diff
  }
  return 0
}
