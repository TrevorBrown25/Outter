# Golf Outing App — Phase 1B (Stroke-Play Scoring Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the app playable end-to-end for stroke play: a scorekeeper enters hole-by-hole scores for their group, and a live leaderboard (gross + proper-net, red under par) updates for everyone via realtime, through a `setup → live → final` round lifecycle with a results state.

**Architecture:** Pure, TDD'd TypeScript scoring functions in `src/lib/scoring/` (no DB access — same inputs → same leaderboard). Score writes go directly to the `scores` table via supabase-js `upsert` (RLS already enforces scorekeeper permissions). The leaderboard recomputes locally on every realtime `scores` change. All screens use the existing design system (`src/components/ui.tsx`, `toPar()`, tokens).

**Tech Stack:** Next.js 15 App Router, supabase-js, Vitest (pure-function tests), Playwright (flow). Georgia serif numerals, `toPar()` for score colors.

**Design source of truth:** `.planning/design-config.md`. Reference mockup: https://claude.ai/code/artifact/9430c990-3009-4155-9b34-92e7e6184093 (the leaderboard and score-entry screens are shown there — build to them).

**Scope boundaries:**
- IN: stroke play, proper net (per-hole allocation by stroke index) with simple-net fallback, countback tiebreakers, score entry, live leaderboard, round lifecycle + results.
- OUT (later phases): GolfCourseAPI course search (Phase 1C, needs API key), scramble scoring, skins side game. For a scramble outing, score entry/leaderboard in this phase operate per-player (stroke) — a `scramble`/`skins` notice is shown; full support is a later phase.

**Data facts (already built):**
- `scores(id, outing_id, hole_number, strokes, player_id, group_id, entered_by, updated_at)`, unique `(outing_id, hole_number, player_id, group_id)` NULLS NOT DISTINCT. Stroke play sets `player_id`, leaves `group_id` null.
- `outings` carries `par_snapshot int[]`, `stroke_index_snapshot int[]|null`, `handicap_mode`, `status`, `organizer_id`.
- RLS: `scores` writable when `can_score(outing_id, player_id, group_id)` and (insert) `entered_by = auth.uid()`; blocked when `status = 'final'`. `outings` updatable by `organizer_id`.
- `groups.scorekeeper_user_id` = the auth uid that owns that group's card.

---

## File structure

```
outter/
├── src/lib/scoring/
│   ├── allocate.ts        # CREATE — per-hole stroke allocation (proper net)
│   ├── countback.ts       # CREATE — back-9/6/3 tiebreak comparison
│   └── stroke.ts          # CREATE — computeStrokeLeaderboard + types
├── tests/unit/
│   ├── allocate.test.ts   # CREATE
│   ├── countback.test.ts  # CREATE
│   └── stroke.test.ts     # CREATE
├── app/outing/[id]/
│   ├── score/page.tsx     # CREATE — scorekeeper hole-by-hole entry
│   └── watch/page.tsx     # REWRITE — real live leaderboard + results state
├── app/outing/[id]/lobby/page.tsx           # MODIFY — organizer "Start round" + live/leaderboard link
├── app/join/[code]/keep-score/page.tsx      # MODIFY — redirect scorekeeper to /score
└── e2e/core-loop.spec.ts                     # MODIFY — /score redirect; + scoring smoke
```

---

### Task 1: Per-hole stroke allocation (TDD)

**Files:** Create `src/lib/scoring/allocate.ts`, `tests/unit/allocate.test.ts`

- [ ] **Step 1: Failing test** — `tests/unit/allocate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { allocateStrokes } from '@/src/lib/scoring/allocate'

// stroke index arrays: value at position h is the difficulty rank (1 = hardest) of hole h+1
const si18 = [7, 3, 15, 1, 11, 5, 17, 9, 13, 8, 2, 16, 4, 12, 6, 18, 10, 14]
const si9 = [3, 7, 1, 5, 9, 2, 8, 4, 6]

describe('allocateStrokes', () => {
  it('gives no strokes for handicap 0', () => {
    expect(allocateStrokes(0, si18)).toEqual(Array(18).fill(0))
  })
  it('gives one stroke on the hardest N holes for handicap N (< holes)', () => {
    const alloc = allocateStrokes(5, si18)
    // holes with stroke index 1..5 get a stroke, others 0
    si18.forEach((rank, i) => expect(alloc[i]).toBe(rank <= 5 ? 1 : 0))
    expect(alloc.reduce((a, b) => a + b, 0)).toBe(5)
  })
  it('wraps: handicap greater than holes gives everyone a base stroke plus extras on hardest', () => {
    const alloc = allocateStrokes(22, si18) // 18 + 4
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
```

- [ ] **Step 2: Run, confirm fail** — `npx vitest run tests/unit/allocate.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `src/lib/scoring/allocate.ts`:

```ts
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
```

- [ ] **Step 4: Run, confirm pass** — `npx vitest run tests/unit/allocate.test.ts` → PASS (6).

- [ ] **Step 5: Commit**
```bash
git add src/lib/scoring/allocate.ts tests/unit/allocate.test.ts
git commit -m "feat(scoring): per-hole stroke allocation for proper net"
```
Body final line: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 2: Countback tiebreak (TDD)

**Files:** Create `src/lib/scoring/countback.ts`, `tests/unit/countback.test.ts`

Countback compares the tail of the round: last 9, then 6, then 3 (18-hole) or last 3, 2, 1 (9-hole). Lower tail total wins. Operates on a per-hole value series (gross strokes, or net strokes for net leaderboards).

- [ ] **Step 1: Failing test** — `tests/unit/countback.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { compareCountback } from '@/src/lib/scoring/countback'

// series are per-hole values indexed 0..n-1; only complete rounds are countback-compared
describe('compareCountback', () => {
  it('lower back-9 total wins on an 18-hole tie', () => {
    const a = Array(18).fill(4); a[17] = 3        // strong finish
    const b = Array(18).fill(4); b[0] = 3          // strong start, same total
    expect(compareCountback(a, b)).toBeLessThan(0) // a ranks ahead (negative = a first)
  })
  it('falls through to back-3 when back-9 and back-6 tie', () => {
    const a = Array(18).fill(4); a[16] = 3; a[9] = 5   // back-3 better, back-9 same
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
```

- [ ] **Step 2: Run, confirm fail.**

- [ ] **Step 3: Implement** — `src/lib/scoring/countback.ts`:

```ts
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
```

- [ ] **Step 4: Run, confirm pass** (4).

- [ ] **Step 5: Commit**
```bash
git add src/lib/scoring/countback.ts tests/unit/countback.test.ts
git commit -m "feat(scoring): back-9/6/3 countback tiebreak"
```
Body final line: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 3: Stroke-play leaderboard engine (TDD)

**Files:** Create `src/lib/scoring/stroke.ts`, `tests/unit/stroke.test.ts`

- [ ] **Step 1: Failing test** — `tests/unit/stroke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeStrokeLeaderboard } from '@/src/lib/scoring/stroke'

const par9 = [4, 4, 3, 5, 4, 4, 3, 5, 4]      // par 36
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
    // Bob is a 9 handicap: one stroke on every hole (si 1..9). Gross 41 -> net 32.
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
      scores: scoresFor('b', [5, 5, 4, 6, 5, 4, 3, 5, 4]), // gross 41
      par: par9,
      strokeIndex: null,
      handicapMode: 'manual',
    })
    expect(rows[0]).toMatchObject({ gross: 41, net: 32 }) // 41 - 9
  })

  it('breaks exact gross ties by countback (better back-3 wins on 9)', () => {
    const rows = computeStrokeLeaderboard({
      players: [
        { id: 'a', displayName: 'Ann', handicapIndex: null },
        { id: 'b', displayName: 'Bob', handicapIndex: null },
      ],
      // same gross 37; Ann finishes stronger (lower back-3)
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
      scores: scoresFor('a', [5, 5]).concat(), // only 2 holes, +2 over par(4,4)
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
```

- [ ] **Step 2: Run, confirm fail.**

- [ ] **Step 3: Implement** — `src/lib/scoring/stroke.ts`:

```ts
import { allocateStrokes } from './allocate'
import { compareCountback } from './countback'

export interface ScoreInput {
  playerId: string
  holeNumber: number // 1-based
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
  toPar: number // on the sorting basis (net when handicaps on, else gross), vs par of holes played
}

interface Internal extends LeaderboardRow {
  value: number // sort key: net when applicable else gross
  series: number[] // per-hole values on the basis, for countback (only meaningful when complete)
}

export function computeStrokeLeaderboard(input: LeaderboardInput): LeaderboardRow[] {
  const { players, scores, par, strokeIndex, handicapMode } = input
  const useNet = handicapMode !== 'none'
  const holes = par.length

  const rows: Internal[] = players.map((p) => {
    const mine = scores.filter((s) => s.playerId === p.playerId)
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
        net = gross - Math.round(p.handicapIndex) // simple net
        series = Array.from({ length: holes }, (_, i) => byHole.get(i + 1) ?? 0)
      }
    } else {
      series = Array.from({ length: holes }, (_, i) => byHole.get(i + 1) ?? 0)
    }

    const value = useNet && net != null ? net : gross
    return {
      playerId: p.playerId,
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
    // countback only meaningful for complete rounds; for partial, keep stable order
    if (a.thru === holes && b.thru === holes) return compareCountback(a.series, b.series)
    return 0
  })

  return rows.map(({ value, series, ...row }) => row)
}
```

- [ ] **Step 4: Run, confirm pass** (6). Then run the whole suite `npm test` (RLS 9 + score 4 + allocate 6 + countback 4 + stroke 6 = 29) — all pass.

- [ ] **Step 5: Commit**
```bash
git add src/lib/scoring/stroke.ts tests/unit/stroke.test.ts
git commit -m "feat(scoring): stroke-play leaderboard engine with gross, net, countback"
```
Body final line: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 4: Score-entry screen for the scorekeeper

**Files:** Create `app/outing/[id]/score/page.tsx`; modify `app/join/[code]/keep-score/page.tsx` (redirect) and `e2e/core-loop.spec.ts` (expect `/score`).

Behavior: the scorekeeper (the one whose `groups.scorekeeper_user_id = auth.uid()`) enters strokes for each player in their group, one hole at a time, with big steppers. Saving upserts `scores` rows. Optimistic local state; realtime reconciles. Guards: if the outing is `final`, read-only.

- [ ] **Step 1: Redirect scorekeeper to the score screen.** In `app/join/[code]/keep-score/page.tsx`, change the post-create redirect:

```tsx
// was: router.push(`/outing/${outing!.id}/watch`)
router.push(`/outing/${outing!.id}/score`)
```

- [ ] **Step 2: Update the E2E redirect expectation.** In `e2e/core-loop.spec.ts`, change:

```ts
// was: await skPage.waitForURL(/\/outing\/.+\/watch/)
await skPage.waitForURL(/\/outing\/.+\/score/)
```
(The subsequent organizer-lobby assertions are unchanged.)

- [ ] **Step 3: Create `app/outing/[id]/score/page.tsx`:**

```tsx
'use client'
import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase, ensureSession } from '@/src/lib/supabase'
import type { Group, Outing, Player } from '@/src/lib/types'
import { ScreenHeader } from '@/src/components/ui'

export default function Score({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [outing, setOuting] = useState<Outing | null>(null)
  const [group, setGroup] = useState<Group | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [strokes, setStrokes] = useState<Record<string, Record<number, number>>>({}) // playerId -> hole -> strokes
  const [hole, setHole] = useState(1)
  const [notScorekeeper, setNotScorekeeper] = useState(false)

  useEffect(() => {
    async function load() {
      const session = await ensureSession()
      const { data: o } = await supabase.from('outings').select().eq('id', id).single()
      setOuting(o)
      const { data: g } = await supabase
        .from('groups')
        .select()
        .eq('outing_id', id)
        .eq('scorekeeper_user_id', session.user.id)
        .maybeSingle()
      if (!g) {
        setNotScorekeeper(true)
        return
      }
      setGroup(g)
      const { data: p } = await supabase.from('players').select().eq('group_id', g.id).order('created_at')
      setPlayers(p ?? [])
      const { data: s } = await supabase.from('scores').select().eq('outing_id', id)
      const map: Record<string, Record<number, number>> = {}
      for (const row of s ?? []) {
        if (!row.player_id) continue
        map[row.player_id] ??= {}
        map[row.player_id][row.hole_number] = row.strokes
      }
      setStrokes(map)
    }
    load()
  }, [id])

  const par = outing?.par_snapshot ?? []
  const numHoles = par.length
  const holePar = par[hole - 1] ?? 4
  const strokeIndex = outing?.stroke_index_snapshot ?? null
  const holeSi = strokeIndex ? strokeIndex[hole - 1] : null
  const isFinal = outing?.status === 'final'

  const setStroke = useCallback(
    async (playerId: string, value: number) => {
      const v = Math.max(1, Math.min(20, value))
      setStrokes((prev) => ({ ...prev, [playerId]: { ...prev[playerId], [hole]: v } }))
      const session = await ensureSession()
      await supabase.from('scores').upsert(
        {
          outing_id: id,
          hole_number: hole,
          player_id: playerId,
          strokes: v,
          entered_by: session.user.id,
        },
        { onConflict: 'outing_id,hole_number,player_id,group_id' },
      )
    },
    [hole, id],
  )

  if (notScorekeeper) {
    return (
      <main className="mx-auto flex max-w-sm flex-col gap-4 p-6">
        <ScreenHeader title="Scoring" meta="Not your card" />
        <p className="text-sm text-sage">You’re not the scorekeeper for a group in this outing.</p>
        <Link href={`/outing/${id}/watch`} className="font-medium text-pine">
          View the leaderboard →
        </Link>
      </main>
    )
  }
  if (!outing || !group) return <main className="p-6 text-sage">Loading…</main>

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-5 p-6">
      <ScreenHeader title={`Hole ${hole} · Par ${holePar}`} meta={holeSi ? `Stroke index ${holeSi}` : group.name} />

      {outing.format !== 'stroke' && (
        <p className="rounded-lg bg-cream px-3 py-2 text-xs text-sage">
          {outing.format === 'scramble' ? 'Scramble' : 'This format'} scoring is coming soon — entering per-player strokes for now.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {players.map((pl) => {
          const val = strokes[pl.id]?.[hole] ?? holePar
          return (
            <div key={pl.id} className="flex items-center justify-between rounded-xl border border-parch-2 bg-cream p-3">
              <span className="font-serif text-lg text-ink">{pl.display_name}</span>
              <div className="flex items-center gap-3">
                <button
                  aria-label={`one fewer for ${pl.display_name}`}
                  disabled={isFinal}
                  onClick={() => setStroke(pl.id, val - 1)}
                  className="flex h-11 w-11 items-center justify-center rounded-full border-[1.5px] border-pine font-serif text-2xl text-pine disabled:opacity-40"
                >
                  −
                </button>
                <span className="tnum w-10 text-center font-serif text-3xl text-ink">{val}</span>
                <button
                  aria-label={`one more for ${pl.display_name}`}
                  disabled={isFinal}
                  onClick={() => setStroke(pl.id, val + 1)}
                  className="flex h-11 w-11 items-center justify-center rounded-full border-[1.5px] border-pine font-serif text-2xl text-pine disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => setHole((h) => Math.max(1, h - 1))}
          disabled={hole === 1}
          className="rounded-[13px] border-[1.5px] border-pine px-5 py-2.5 font-medium text-pine disabled:opacity-40"
        >
          ← Prev
        </button>
        <span className="tnum text-sm text-sage">
          {hole} / {numHoles}
        </span>
        <button
          onClick={() => setHole((h) => Math.min(numHoles, h + 1))}
          disabled={hole === numHoles}
          className="rounded-[13px] border-[1.5px] border-pine px-5 py-2.5 font-medium text-pine disabled:opacity-40"
        >
          Next →
        </button>
      </div>

      <Link href={`/outing/${id}/watch`} className="text-center text-sm font-medium text-pine">
        View leaderboard
      </Link>
    </main>
  )
}
```

- [ ] **Step 4: Verify** — `npm run build` clean. Manual: `npm run dev`, create a manual outing, join as scorekeeper (redirects to `/score`), tap steppers, refresh — values persist. Kill any stray `:3000` server first if reused.

- [ ] **Step 5: Commit**
```bash
git add "app/outing/[id]/score/page.tsx" "app/join/[code]/keep-score/page.tsx" e2e/core-loop.spec.ts
git commit -m "feat(scoring): scorekeeper hole-by-hole score entry"
```
Body final line: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 5: Live leaderboard (rewrite watch page)

**Files:** Rewrite `app/outing/[id]/watch/page.tsx`

Replace the "who's playing" stub with a real leaderboard computed from the engine, subscribed to `scores` realtime, using `toPar()` for the red-under-par column. Show a gross column always; show a net column and sort by net when `handicap_mode !== 'none'`.

- [ ] **Step 1: Rewrite `app/outing/[id]/watch/page.tsx`:**

```tsx
'use client'
import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase, ensureSession } from '@/src/lib/supabase'
import type { Group, Outing, Player } from '@/src/lib/types'
import { ScreenHeader } from '@/src/components/ui'
import { toPar } from '@/src/components/score'
import { computeStrokeLeaderboard, type ScoreInput } from '@/src/lib/scoring/stroke'

interface ScoreRow { player_id: string | null; hole_number: number; strokes: number }

export default function Watch({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [outing, setOuting] = useState<Outing | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [scores, setScores] = useState<ScoreRow[]>([])

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null

    async function refresh() {
      const [{ data: g }, { data: p }, { data: s }] = await Promise.all([
        supabase.from('groups').select().eq('outing_id', id).order('created_at'),
        supabase.from('players').select().eq('outing_id', id).order('created_at'),
        supabase.from('scores').select('player_id,hole_number,strokes').eq('outing_id', id),
      ])
      setGroups(g ?? [])
      setPlayers(p ?? [])
      setScores(s ?? [])
    }

    async function load() {
      await ensureSession()
      const { data: o } = await supabase.from('outings').select().eq('id', id).single()
      setOuting(o)
      await refresh()
      channel = supabase
        .channel(`watch-${id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'scores', filter: `outing_id=eq.${id}` }, refresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `outing_id=eq.${id}` }, refresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'outings', filter: `id=eq.${id}` }, refresh)
        .subscribe()
    }

    load()
    return () => { if (channel) supabase.removeChannel(channel) }
  }, [id])

  const groupName = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups])

  const rows = useMemo(() => {
    if (!outing) return []
    const scoreInputs: ScoreInput[] = scores
      .filter((s) => s.player_id)
      .map((s) => ({ playerId: s.player_id!, holeNumber: s.hole_number, strokes: s.strokes }))
    return computeStrokeLeaderboard({
      players: players.map((p) => ({
        id: p.id,
        displayName: p.display_name,
        groupName: groupName.get(p.group_id),
        handicapIndex: p.handicap_index,
      })),
      scores: scoreInputs,
      par: outing.par_snapshot,
      strokeIndex: outing.stroke_index_snapshot,
      handicapMode: outing.handicap_mode,
    })
  }, [outing, players, scores, groupName])

  if (!outing) return <main className="p-6 text-sage">Loading…</main>

  const useNet = outing.handicap_mode !== 'none'
  const numHoles = outing.par_snapshot.length
  const isFinal = outing.status === 'final'

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-5 p-6">
      <ScreenHeader title={isFinal ? 'Final results' : 'Leaderboard'} meta={useNet ? 'Net · stroke play' : 'Gross · stroke play'} />

      <div className="overflow-hidden rounded-xl border border-parch-2">
        <div className="grid grid-cols-[28px_1fr_38px_46px] gap-2 bg-pine-deep px-3 py-2 text-[10px] uppercase tracking-[0.1em] text-gold-soft">
          <span>Pos</span>
          <span>Player</span>
          <span className="text-right">Thru</span>
          <span className="text-right">{useNet ? 'Net' : 'Par'}</span>
        </div>
        {rows.length === 0 && <p className="bg-cream px-3 py-4 text-sm text-sage">No scores yet.</p>}
        {rows.map((r, i) => {
          const tp = toPar(r.toPar)
          const leader = i === 0 && r.thru > 0
          return (
            <div
              key={r.playerId}
              className={`grid grid-cols-[28px_1fr_38px_46px] items-center gap-2 border-t border-parch-2 px-3 py-3 ${leader && isFinal ? 'bg-[#EDE5CE]' : 'bg-cream'}`}
            >
              <span className="font-serif text-sage">{r.thru > 0 ? i + 1 : '–'}</span>
              <span className="text-ink">
                {isFinal && leader && <span className="mr-1 text-gold">★</span>}
                {r.displayName}
                {r.groupName && <span className="block text-xs text-sage">{r.groupName}</span>}
              </span>
              <span className="tnum text-right text-xs text-sage">{r.thru === 0 ? '–' : r.thru === numHoles ? 'F' : r.thru}</span>
              <span className={`tnum text-right font-serif text-lg ${r.thru > 0 ? tp.className : 'text-sage'}`}>
                {r.thru > 0 ? tp.label : '–'}
              </span>
            </div>
          )
        })}
      </div>

      {useNet && (
        <p className="text-center text-xs text-sage">
          Net shown. {outing.stroke_index_snapshot ? 'Strokes allocated by hole.' : 'Simple net (no stroke index).'}
        </p>
      )}

      <Link href={`/outing/${id}/score`} className="text-center text-sm font-medium text-pine">
        Keeping score? Enter strokes
      </Link>
    </main>
  )
}
```

- [ ] **Step 2: Verify** — `npm run build` clean. Manual: with the outing from Task 4, enter scores in one tab and watch the leaderboard update live in another.

- [ ] **Step 3: Commit**
```bash
git add "app/outing/[id]/watch/page.tsx"
git commit -m "feat(scoring): live stroke-play leaderboard with red under-par"
```
Body final line: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 6: Round lifecycle (start / end) + results

**Files:** Modify `app/outing/[id]/lobby/page.tsx` (organizer "Start round"); the watch page already renders the `final` results state and needs an organizer "End round" control.

Only the organizer (`outing.organizer_id === auth.uid()`) sees lifecycle controls.

- [ ] **Step 1: Lobby — add organizer "Start round".** In `app/outing/[id]/lobby/page.tsx`, capture the session uid in `load()` and add state `const [uid, setUid] = useState<string | null>(null)`; set it from `ensureSession()`. Below the groups section, add:

```tsx
{outing.organizer_id === uid && outing.status === 'setup' && (
  <button
    onClick={async () => {
      await supabase.from('outings').update({ status: 'live' }).eq('id', outing.id)
      window.location.href = `/outing/${outing.id}/watch`
    }}
    className="rounded-[13px] bg-pine py-4 text-center text-lg font-medium text-cream active:scale-[0.98]"
  >
    Start round
  </button>
)}
{outing.status !== 'setup' && (
  <Link href={`/outing/${outing.id}/watch`} className="text-center text-sm font-medium text-pine">
    Round in progress — view leaderboard
  </Link>
)}
```
Add `import Link from 'next/link'` to the lobby file. (`ensureSession()` returns a session with `.user.id`; store it in `uid`.)

- [ ] **Step 2: Watch — add organizer "End round".** In `app/outing/[id]/watch/page.tsx`, capture `uid` from `ensureSession()` into state. After the leaderboard table, add:

```tsx
{outing.organizer_id === uid && outing.status === 'live' && (
  <button
    onClick={async () => {
      await supabase.from('outings').update({ status: 'final' }).eq('id', outing.id)
    }}
    className="rounded-[13px] border-[1.5px] border-pine py-3 text-center font-medium text-pine active:scale-[0.98]"
  >
    End round · post final
  </button>
)}
```
(The realtime `outings` subscription added in Task 5 makes the `final` state — the "Final results" header, star on the leader — propagate to every viewer instantly.)

- [ ] **Step 3: Verify** — `npm run build` clean. Manual: as organizer, Start round on the lobby → lands on leaderboard; End round → header switches to "Final results", leader gets the star; a second (spectator) tab updates live.

- [ ] **Step 4: Commit**
```bash
git add "app/outing/[id]/lobby/page.tsx" "app/outing/[id]/watch/page.tsx"
git commit -m "feat(scoring): round lifecycle start/end and final results state"
```
Body final line: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 7: E2E scoring smoke + deploy

**Files:** Modify `e2e/core-loop.spec.ts` (add a scoring assertion)

- [ ] **Step 1: Extend the E2E.** After the existing group-appears-in-lobby assertions, add scoring steps to the same test (the scorekeeper page is already at `/score`):

```ts
// scorekeeper enters a score on hole 1 for the first player
await skPage.getByRole('button', { name: /one more for/ }).first().click()
// leaderboard reflects it: open the spectator's leaderboard and expect a non-empty board
const spectator = await browser.newContext()
const specPage = await spectator.newPage()
await specPage.goto(`/outing/${await skPage.evaluate(() => location.pathname.split('/')[2])}/watch`)
await expect(specPage.getByText('Leaderboard')).toBeVisible()
await expect(specPage.getByText('No scores yet.')).toHaveCount(0, { timeout: 15_000 })
await spectator.close()
```
Keep the existing organizer-lobby assertions. If the realtime timing is flaky, the 15s timeout mirrors the known cold-start behavior; do not weaken the intent (a score entered by the scorekeeper must reach the leaderboard).

- [ ] **Step 2: Run the full suites.** Kill any stray `:3000` server first.
```bash
lsof -ti:3000 | xargs kill -9 2>/dev/null; npm test && npx playwright test
```
Expected: vitest 29 pass; Playwright 1 pass.

- [ ] **Step 3: Commit + push (auto-deploys).**
```bash
git add e2e/core-loop.spec.ts
git commit -m "test(scoring): E2E covers score entry reaching the live leaderboard"
git push origin main
```
Body final line: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

- [ ] **Step 4: Verify the deploy.** Wait for the Vercel build to go Ready (`npx vercel ls outter`), then on the live site walk: create → start round → enter scores → leaderboard updates → end round → final results.

---

## Self-review checklist (run before executing)

- Types line up: `computeStrokeLeaderboard` / `LeaderboardRow` / `ScoreInput` used identically in Tasks 3, 5.
- `allocateStrokes` and `compareCountback` signatures match their callers in `stroke.ts`.
- No placeholders; every step has full code.
- E2E `/watch` → `/score` redirect change is consistent across Tasks 4 and 7.

## Out of scope → follow-on plans

- **Phase 1C — GolfCourseAPI:** Route Handler holding `GOLFCOURSE_API_KEY` (auth header `Authorization: Key <key>`), course search UI in `/create`, caching into `courses`/`course_tees`, tee selection, real stroke-index data. Needs the user's API key.
- **Phase 2 — scramble** (one score per group) and **Phase 3 — skins** side game (carryover pot), both computed from the same per-hole `scores`.
```
