export interface ToPar {
  label: string
  className: string
}

/** Format a score relative to par with the scoreboard color convention. */
export function toPar(delta: number): ToPar {
  if (delta < 0) return { label: `−${Math.abs(delta)}`, className: 'text-board-red' }
  if (delta === 0) return { label: 'E', className: 'text-ink' }
  return { label: `+${delta}`, className: 'text-sage' }
}
