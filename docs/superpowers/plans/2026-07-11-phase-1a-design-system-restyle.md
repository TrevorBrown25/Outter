# Golf Outing App — Phase 1A (Design System + Restyle) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the approved Masters-inspired design system as reusable tokens + primitives, then restyle all five existing Phase 0 screens so the live app matches the identity mockup — with the E2E core-loop still green.

**Architecture:** Tailwind v4 CSS-first theming. Brand colors and the serif face become Tailwind theme tokens in `app/globals.css` via `@theme`, so utility classes (`bg-pine`, `text-cream`, `font-serif`, `text-board-red`) work everywhere. A small set of typed React primitives in `src/components/` (Button, ScreenHeader, AppShell, and a `toPar` score-color helper) encode the recurring patterns so pages stay declarative and consistent. Restyle is purely presentational — no data-layer, RPC, or schema changes.

**Tech Stack:** Next.js 15 App Router, Tailwind v4, TypeScript. Georgia (system serif, no webfont). Playwright for the visual/behavioral gate.

**Design source of truth:** `.planning/design-config.md` (BINDING — exact hexes, type roles, the red-under-par convention, component patterns). Reference mockup: https://claude.ai/code/artifact/9430c990-3009-4155-9b34-92e7e6184093

**Critical constraint — keep the E2E green:** `e2e/core-loop.spec.ts` selects by accessible name/role and CSS class: the share code is read from `p.font-mono`; buttons/links are matched by text `9 holes`, `Create outing`, `Keep score for my group`, `We're in`, `The Hackers`, `Alice, Bob`. Restyled markup MUST preserve these accessible names, the `.font-mono` class on the share code, and the visible text, OR the test must be updated in the same task. Running `npx playwright test` is the gate for every page task.

---

## File structure

```
outter/
├── app/
│   ├── globals.css                     # MODIFY — add @theme tokens + base parchment styles
│   ├── layout.tsx                      # MODIFY — set serif/sans metadata, lang, app title
│   ├── page.tsx                        # MODIFY — restyle landing
│   ├── create/page.tsx                 # MODIFY — restyle create-outing
│   ├── outing/[id]/lobby/page.tsx      # MODIFY — restyle lobby
│   ├── outing/[id]/watch/page.tsx      # MODIFY — restyle spectator
│   └── join/[code]/
│       ├── page.tsx                    # MODIFY — restyle chooser
│       └── keep-score/page.tsx         # MODIFY — restyle group creation
└── src/components/
    ├── ui.tsx                          # CREATE — Button, AppShell, ScreenHeader
    └── score.ts                        # CREATE — toPar() score-color/format helper
```

---

### Task 1: Design tokens in globals.css

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Read the current globals.css**

Run: `cat app/globals.css` — create-next-app scaffolded it with `@import "tailwindcss";` and some default `:root`/`body` rules. You will replace its contents.

- [ ] **Step 2: Replace globals.css with the token layer**

Write `app/globals.css` exactly:

```css
@import "tailwindcss";

@theme {
  --color-pine: #0E4429;
  --color-pine-deep: #08301D;
  --color-parchment: #F3EEDD;
  --color-parch-2: #EAE2CB;
  --color-cream: #FBF8EF;
  --color-gold: #C6A15B;
  --color-gold-soft: #D8BE86;
  --color-board-red: #A6231E;
  --color-ink: #16241B;
  --color-sage: #6E7A6B;

  --font-serif: Georgia, "Times New Roman", serif;
}

html, body {
  background: var(--color-parchment);
  color: var(--color-ink);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
}

/* tabular figures for all scorecard numerals */
.tnum { font-variant-numeric: tabular-nums; }
```

- [ ] **Step 3: Verify tokens compile**

Run: `npm run build`
Expected: build succeeds. (Tailwind v4 registers `--color-pine` as the `pine` color, usable as `bg-pine`, `text-pine`, `border-pine`; `--font-serif` as `font-serif`.)

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "feat(design): add Masters palette + serif as Tailwind theme tokens"
```
Commit body final line: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 2: Score-color helper (TDD)

**Files:**
- Create: `src/components/score.ts`
- Create: `tests/unit/score.test.ts`

This encodes the signature red-under-par convention once, used by leaderboard and score entry in Phase 1B. Build it now, test-first, so the rule lives in one place.

- [ ] **Step 1: Write the failing test**

Write `tests/unit/score.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it, watch it fail**

Run: `npx vitest run tests/unit/score.test.ts`
Expected: FAIL — `toPar` not found.

- [ ] **Step 3: Implement**

Write `src/components/score.ts`:

```ts
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
```

- [ ] **Step 4: Run it, watch it pass**

Run: `npx vitest run tests/unit/score.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/score.ts tests/unit/score.test.ts
git commit -m "feat(design): toPar score-color helper with red-under-par convention"
```
Commit body final line: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 3: UI primitives

**Files:**
- Create: `src/components/ui.tsx`

- [ ] **Step 1: Write the primitives**

Write `src/components/ui.tsx`:

```tsx
import type { ButtonHTMLAttributes, ReactNode } from 'react'

/** Parchment page wrapper, phone-first max width, centered. */
export function AppShell({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex min-h-dvh max-w-sm flex-col gap-6 p-6">{children}</main>
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost'
}

/** Primary = pine fill; ghost = pine outline. Radius/weight per design-config. */
export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  const base = 'rounded-[13px] py-4 text-center text-base font-medium transition-transform active:scale-[0.98] disabled:opacity-40'
  const style =
    variant === 'primary'
      ? 'bg-pine text-cream'
      : 'border-[1.5px] border-pine text-pine'
  return <button className={`${base} ${style} ${className}`} {...props} />
}

/** Deep-green header panel: serif title + gold-soft uppercase meta. */
export function ScreenHeader({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="-mx-6 -mt-6 bg-pine px-6 pb-5 pt-8 text-cream">
      <h1 className="font-serif text-2xl">{title}</h1>
      {meta && <p className="mt-1 text-xs uppercase tracking-[0.12em] text-gold-soft">{meta}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: compiles clean (primitives are unused until Task 4+, but must type-check).

- [ ] **Step 3: Commit**

```bash
git add src/components/ui.tsx
git commit -m "feat(design): AppShell, Button, ScreenHeader primitives"
```
Commit body final line: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 4: Restyle landing page

**Files:**
- Modify: `app/page.tsx`

Keep behavior identical (6-char code → `/join/CODE`). Keep the visible texts `Create an outing` and `Join` so nothing breaks.

- [ ] **Step 1: Replace `app/page.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function Landing() {
  const [code, setCode] = useState('')
  const router = useRouter()

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <div className="font-serif text-3xl uppercase tracking-[0.42em] text-pine">Outter</div>
        <div className="mx-auto mt-4 h-0.5 w-14 bg-gold" />
        <p className="mt-4 font-serif text-lg leading-snug text-ink">
          Organize the round.<br />Track every stroke.<br />Settle the skins.
        </p>
      </div>

      <Link
        href="/create"
        className="rounded-[13px] bg-pine py-4 text-center text-base font-medium text-cream active:scale-[0.98]"
      >
        Create an outing
      </Link>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (code.trim().length === 6) router.push(`/join/${code.trim().toUpperCase()}`)
        }}
        className="flex flex-col gap-3"
      >
        <p className="text-center text-xs uppercase tracking-[0.16em] text-sage">
          or enter a 6-digit code
        </p>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="7K4Q2M"
            maxLength={6}
            className="w-full rounded-[13px] border border-parch-2 bg-cream px-4 py-3 text-center font-serif text-xl tracking-[0.3em] text-pine placeholder:text-sage/50 focus:border-gold focus:outline-none"
          />
          <button
            type="submit"
            disabled={code.trim().length !== 6}
            className="rounded-[13px] border-[1.5px] border-pine px-5 font-medium text-pine disabled:opacity-40"
          >
            Join
          </button>
        </div>
      </form>
    </main>
  )
}
```

Note: `<Link className="contents">` wrapping `<Button>` keeps the anchor semantics (E2E clicks the "Create an outing" text) while the Button provides the visual. `getByRole('button'/'link', { name: 'Create an outing' })` still resolves by accessible name.

- [ ] **Step 2: Verify build + E2E**

Run: `npm run build && npx playwright test`
Expected: build clean; core-loop test PASSES (it navigates `/create` via the "Create an outing" control and reads the share code).

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat(design): restyle landing to Masters identity"
```
Commit body final line: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 5: Restyle create-outing page

**Files:**
- Modify: `app/create/page.tsx`

Preserve ALL behavior and these E2E-critical texts: the `9 holes` / `18 holes` toggle buttons, the `Create outing` submit button, the "Course name" label. Only presentation changes.

- [ ] **Step 1: Replace `app/create/page.tsx`**

Keep the entire existing logic (state, `submit()`, Supabase calls) EXACTLY as-is; only swap the returned JSX styling. Full file:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, ensureSession } from '@/src/lib/supabase'
import type { HandicapMode, Outing, OutingFormat } from '@/src/lib/types'
import { Button, ScreenHeader } from '@/src/components/ui'

export default function CreateOuting() {
  const router = useRouter()
  const [courseName, setCourseName] = useState('')
  const [numHoles, setNumHoles] = useState<9 | 18>(18)
  const [pars, setPars] = useState<number[]>(Array(18).fill(4))
  const [playDate, setPlayDate] = useState(new Date().toISOString().slice(0, 10))
  const [format, setFormat] = useState<OutingFormat>('stroke')
  const [skins, setSkins] = useState(false)
  const [handicapMode, setHandicapMode] = useState<HandicapMode>('none')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const session = await ensureSession()
      const { data: course, error: cErr } = await supabase
        .from('courses')
        .insert({ name: courseName.trim(), num_holes: numHoles, created_by: session.user.id })
        .select()
        .single()
      if (cErr) throw cErr
      const { data: tee, error: tErr } = await supabase
        .from('course_tees')
        .insert({ course_id: course.id, name: 'Default', par: pars.slice(0, numHoles) })
        .select()
        .single()
      if (tErr) throw tErr
      const { data: outing, error: oErr } = await supabase.rpc('create_outing', {
        p_course_id: course.id,
        p_tee_id: tee.id,
        p_play_date: playDate,
        p_format: format,
        p_skins: skins,
        p_handicap_mode: handicapMode,
      })
      if (oErr) throw oErr
      router.push(`/outing/${(outing as Outing).id}/lobby`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setBusy(false)
    }
  }

  const fieldClass =
    'rounded-[13px] border border-parch-2 bg-cream px-3 py-2 text-ink focus:border-gold focus:outline-none'

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-5 p-6">
      <ScreenHeader title="New outing" meta="Set up the round" />

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-[0.12em] text-sage">Course name</span>
        <input value={courseName} onChange={(e) => setCourseName(e.target.value)} className={fieldClass} />
      </label>

      <div className="flex gap-2">
        {([9, 18] as const).map((n) => (
          <button
            key={n}
            onClick={() => setNumHoles(n)}
            className={`flex-1 rounded-[13px] border-[1.5px] py-2.5 font-medium ${
              numHoles === n ? 'border-pine bg-pine text-cream' : 'border-parch-2 text-sage'
            }`}
          >
            {n} holes
          </button>
        ))}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-sage">Par per hole</legend>
        <div className="grid grid-cols-6 gap-1.5">
          {pars.slice(0, numHoles).map((p, i) => (
            <label key={i} className="flex flex-col items-center gap-1 text-xs text-sage">
              {i + 1}
              <input
                type="number"
                min={3}
                max={6}
                value={p}
                onChange={(e) => {
                  const next = [...pars]
                  next[i] = Number(e.target.value)
                  setPars(next)
                }}
                className="tnum w-full rounded-lg border border-parch-2 bg-cream px-1 py-1 text-center font-serif text-ink"
              />
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-[0.12em] text-sage">Date</span>
        <input type="date" value={playDate} onChange={(e) => setPlayDate(e.target.value)} className={fieldClass} />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-[0.12em] text-sage">Format</span>
        <select value={format} onChange={(e) => setFormat(e.target.value as OutingFormat)} className={fieldClass}>
          <option value="stroke">Stroke play</option>
          <option value="scramble">Scramble</option>
        </select>
      </label>

      <label className="flex items-center gap-2 text-ink">
        <input type="checkbox" checked={skins} onChange={(e) => setSkins(e.target.checked)} className="accent-pine" />
        <span>Skins side game</span>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-[0.12em] text-sage">Handicaps</span>
        <select
          value={handicapMode}
          onChange={(e) => setHandicapMode(e.target.value as HandicapMode)}
          className={fieldClass}
        >
          <option value="none">None (gross)</option>
          <option value="manual">Manual entry</option>
          <option value="auto">Manual + auto-balance groups</option>
        </select>
      </label>

      {error && <p className="text-sm text-board-red">{error}</p>}
      <Button onClick={submit} disabled={busy || !courseName.trim()}>
        {busy ? 'Creating…' : 'Create outing'}
      </Button>
    </main>
  )
}
```

- [ ] **Step 2: Verify build + E2E**

Run: `npm run build && npx playwright test`
Expected: build clean; core-loop PASSES (fills "Course name", clicks "9 holes" and "Create outing").

- [ ] **Step 3: Commit**

```bash
git add app/create/page.tsx
git commit -m "feat(design): restyle create-outing to Masters identity"
```
Commit body final line: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 6: Restyle lobby page

**Files:**
- Modify: `app/outing/[id]/lobby/page.tsx`

Preserve ALL data/realtime logic and the `p.font-mono` share-code element (E2E reads it) and the group name / players text.

- [ ] **Step 1: Replace `app/outing/[id]/lobby/page.tsx`**

Keep the existing `useEffect`/`load`/`refresh`/realtime block EXACTLY; restyle only the returned JSX. Full file:

```tsx
'use client'
import { use, useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase, ensureSession } from '@/src/lib/supabase'
import type { Group, Outing, Player } from '@/src/lib/types'
import { ScreenHeader } from '@/src/components/ui'

export default function Lobby({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [outing, setOuting] = useState<Outing | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [joinUrl, setJoinUrl] = useState('')

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null

    async function refresh() {
      const [{ data: g }, { data: p }] = await Promise.all([
        supabase.from('groups').select().eq('outing_id', id).order('created_at'),
        supabase.from('players').select().eq('outing_id', id).order('created_at'),
      ])
      setGroups(g ?? [])
      setPlayers(p ?? [])
    }

    async function load() {
      await ensureSession()
      const { data: o } = await supabase.from('outings').select().eq('id', id).single()
      setOuting(o)
      if (o) setJoinUrl(`${window.location.origin}/join/${o.share_code}`)
      await refresh()
      channel = supabase
        .channel(`lobby-${id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'groups', filter: `outing_id=eq.${id}` }, refresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `outing_id=eq.${id}` }, refresh)
        .subscribe()
    }

    load()
    return () => { if (channel) supabase.removeChannel(channel) }
  }, [id])

  if (!outing) return <main className="p-6 text-sage">Loading…</main>

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 p-6">
      <ScreenHeader title="Lobby" meta="Share to fill the field" />

      <div className="flex flex-col items-center gap-3 rounded-xl border border-parch-2 bg-cream p-5">
        {joinUrl && (
          <div className="rounded-lg bg-white p-3">
            <QRCodeSVG value={joinUrl} size={190} bgColor="#FFFFFF" fgColor="#0E4429" />
          </div>
        )}
        <p className="font-mono text-3xl font-bold tracking-[0.25em] text-pine">{outing.share_code}</p>
        <p className="text-center text-sm text-sage">Scan to keep score for your group — or just watch</p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-serif text-lg text-ink">Groups ({groups.length})</h2>
        {groups.length === 0 && <p className="text-sm text-sage">Waiting for scorekeepers to join…</p>}
        {groups.map((g) => (
          <div key={g.id} className="rounded-xl border border-parch-2 bg-cream p-3">
            <p className="font-serif text-ink">{g.name}</p>
            <p className="mt-0.5 text-sm text-sage">
              {players.filter((p) => p.group_id === g.id).map((p) => p.display_name).join(', ')}
            </p>
          </div>
        ))}
      </section>
    </main>
  )
}
```

- [ ] **Step 2: Verify build + E2E**

Run: `npm run build && npx playwright test`
Expected: build clean; core-loop PASSES (reads `p.font-mono` share code, then sees "The Hackers" / "Alice, Bob" appear live).

- [ ] **Step 3: Commit**

```bash
git add app/outing/[id]/lobby/page.tsx
git commit -m "feat(design): restyle lobby to Masters identity"
```
Commit body final line: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 7: Restyle join chooser + keep-score pages

**Files:**
- Modify: `app/join/[code]/page.tsx`
- Modify: `app/join/[code]/keep-score/page.tsx`

Preserve link/button texts `Keep score for my group`, `Just watch`, `We're in` (E2E matches these; keep the curly apostrophe in "We're in" and "You're invited" to avoid react/no-unescaped-entities).

- [ ] **Step 1: Replace `app/join/[code]/page.tsx`**

```tsx
'use client'
import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase, ensureSession } from '@/src/lib/supabase'
import type { Outing } from '@/src/lib/types'

export default function Join({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  const [outing, setOuting] = useState<Outing | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function load() {
      await ensureSession()
      const { data } = await supabase.rpc('get_outing_by_code', { p_code: code })
      if (data && data.length > 0) setOuting(data[0])
      else setNotFound(true)
    }
    load()
  }, [code])

  if (notFound) return <main className="p-6 text-center text-sage">No outing found for code {code}.</main>
  if (!outing) return <main className="p-6 text-sage">Loading…</main>

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-6">
      <div className="text-center">
        <div className="font-serif text-sm uppercase tracking-[0.42em] text-pine">Outter</div>
        <div className="mx-auto mt-3 h-0.5 w-12 bg-gold" />
        <h1 className="mt-4 font-serif text-2xl text-ink">You&rsquo;re invited</h1>
      </div>
      <Link
        href={`/join/${code}/keep-score`}
        className="rounded-[13px] bg-pine py-4 text-center text-base font-medium text-cream active:scale-[0.98]"
      >
        Keep score for my group
      </Link>
      <Link
        href={`/outing/${outing.id}/watch`}
        className="rounded-[13px] border-[1.5px] border-pine py-4 text-center text-base font-medium text-pine"
      >
        Just watch
      </Link>
    </main>
  )
}
```

- [ ] **Step 2: Replace `app/join/[code]/keep-score/page.tsx`**

Keep the existing logic (state, `submit()`, `withHandicaps`, `validNames`) EXACTLY; restyle JSX. Full file:

```tsx
'use client'
import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, ensureSession } from '@/src/lib/supabase'
import type { Outing } from '@/src/lib/types'
import { Button, ScreenHeader } from '@/src/components/ui'

export default function KeepScore({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  const router = useRouter()
  const [outing, setOuting] = useState<Outing | null>(null)
  const [groupName, setGroupName] = useState('')
  const [names, setNames] = useState<string[]>(['', ''])
  const [handicaps, setHandicaps] = useState<string[]>(['', ''])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      await ensureSession()
      const { data } = await supabase.rpc('get_outing_by_code', { p_code: code })
      setOuting(data?.[0] ?? null)
    }
    load()
  }, [code])

  const withHandicaps = outing?.handicap_mode !== 'none'
  const validNames = names.map((n) => n.trim()).filter(Boolean)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const { error: gErr } = await supabase.rpc('create_group', {
        p_share_code: code,
        p_name: groupName,
        p_player_names: validNames,
        p_handicaps: withHandicaps
          ? names.map((n, i) => (n.trim() ? Number(handicaps[i]) || 0 : null)).filter((h) => h !== null)
          : null,
      })
      if (gErr) throw gErr
      router.push(`/outing/${outing!.id}/watch`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setBusy(false)
    }
  }

  if (!outing) return <main className="p-6 text-sage">Loading…</main>

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-6">
      <ScreenHeader title="Your group" meta="Who's in your cart?" />

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-[0.12em] text-sage">Group name (optional)</span>
        <input
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder="The Hackers"
          className="rounded-[13px] border border-parch-2 bg-cream px-3 py-2 text-ink focus:border-gold focus:outline-none"
        />
      </label>

      <span className="text-xs font-medium uppercase tracking-[0.12em] text-sage">Players</span>
      {names.map((n, i) => (
        <div key={i} className="flex gap-2">
          <input
            value={n}
            onChange={(e) => {
              const next = [...names]
              next[i] = e.target.value
              setNames(next)
            }}
            placeholder={`Player ${i + 1}`}
            className="w-full rounded-[13px] border border-parch-2 bg-cream px-3 py-2 text-ink focus:border-gold focus:outline-none"
          />
          {withHandicaps && (
            <input
              value={handicaps[i]}
              onChange={(e) => {
                const next = [...handicaps]
                next[i] = e.target.value
                setHandicaps(next)
              }}
              placeholder="HCP"
              inputMode="decimal"
              className="tnum w-20 rounded-[13px] border border-parch-2 bg-cream px-2 py-2 text-center font-serif text-ink focus:border-gold focus:outline-none"
            />
          )}
        </div>
      ))}
      {names.length < 6 && (
        <button
          onClick={() => {
            setNames([...names, ''])
            setHandicaps([...handicaps, ''])
          }}
          className="self-start text-sm font-medium text-pine"
        >
          + Add player
        </button>
      )}

      {error && <p className="text-sm text-board-red">{error}</p>}
      <Button onClick={submit} disabled={busy || validNames.length === 0}>
        {busy ? 'Joining…' : "We're in"}
      </Button>
    </main>
  )
}
```

- [ ] **Step 3: Verify build + E2E**

Run: `npm run build && npx playwright test`
Expected: build clean; core-loop PASSES (clicks "Keep score for my group", fills players, clicks "We're in").

- [ ] **Step 4: Commit**

```bash
git add app/join/[code]/page.tsx app/join/[code]/keep-score/page.tsx
git commit -m "feat(design): restyle join chooser and keep-score to Masters identity"
```
Commit body final line: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 8: Restyle spectator (watch) page

**Files:**
- Modify: `app/outing/[id]/watch/page.tsx`

Keep all realtime logic; restyle only. This screen becomes the real leaderboard in Phase 1B — for now it stays the "who's playing" list, styled as a green-headed board.

- [ ] **Step 1: Replace `app/outing/[id]/watch/page.tsx`**

```tsx
'use client'
import { use, useEffect, useState } from 'react'
import { supabase, ensureSession } from '@/src/lib/supabase'
import type { Group, Outing, Player } from '@/src/lib/types'
import { ScreenHeader } from '@/src/components/ui'

export default function Watch({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [outing, setOuting] = useState<Outing | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [players, setPlayers] = useState<Player[]>([])

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null

    async function refresh() {
      const [{ data: g }, { data: p }] = await Promise.all([
        supabase.from('groups').select().eq('outing_id', id).order('created_at'),
        supabase.from('players').select().eq('outing_id', id).order('created_at'),
      ])
      setGroups(g ?? [])
      setPlayers(p ?? [])
    }

    async function load() {
      await ensureSession()
      const { data: o } = await supabase.from('outings').select().eq('id', id).single()
      setOuting(o)
      await refresh()
      channel = supabase
        .channel(`watch-${id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'groups', filter: `outing_id=eq.${id}` }, refresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `outing_id=eq.${id}` }, refresh)
        .subscribe()
    }

    load()
    return () => { if (channel) supabase.removeChannel(channel) }
  }, [id])

  if (!outing) return <main className="p-6 text-sage">Loading…</main>

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-6">
      <ScreenHeader title="Leaderboard" meta="Live scoring · Phase 1B" />
      <p className="text-sm text-sage">Here&rsquo;s who&rsquo;s playing:</p>
      {groups.map((g) => (
        <div key={g.id} className="rounded-xl border border-parch-2 bg-cream p-3">
          <p className="font-serif text-ink">{g.name}</p>
          <p className="mt-0.5 text-sm text-sage">
            {players.filter((p) => p.group_id === g.id).map((p) => p.display_name).join(', ')}
          </p>
        </div>
      ))}
    </main>
  )
}
```

- [ ] **Step 2: Verify build + full test suite**

Run: `npm run build && npm test && npx playwright test`
Expected: build clean; vitest (RLS 9 + score 4 = 13) PASS; core-loop PASSES.

- [ ] **Step 3: Commit**

```bash
git add app/outing/[id]/watch/page.tsx
git commit -m "feat(design): restyle spectator board to Masters identity"
```
Commit body final line: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 9: Visual QA + redeploy

**Files:**
- None (verification + deploy)

- [ ] **Step 1: Capture screenshots of every screen**

Write a throwaway Playwright script `e2e/_shots.spec.ts` that walks create → lobby → join → keep-score → watch and screenshots each into `test-results/shots/`. Run it against local dev. Visually compare each to `.planning/design-config.md` and the mockup: parchment background, pine headers, gold rules, serif headings, cream inputs. Fix any screen that drifts (wrong color token, missing serif). DELETE `e2e/_shots.spec.ts` after — it is not a committed test.

- [ ] **Step 2: Redeploy to Vercel**

Run: `npx vercel deploy --prod --yes`
Then verify the live landing renders the restyled page:
```bash
URL="<new deployment url from the deploy output>"
curl -s "$URL" | grep -oE "Organize the round|Outter" | sort -u
```
Expected: matches. Confirm on a phone that the app now looks like the mockup.

- [ ] **Step 3: Final commit (if any fixes in Step 1)**

```bash
git add -A
git commit -m "fix(design): visual QA adjustments across restyled screens" --allow-empty
```
Commit body final line: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

## Out of scope (Phase 1B — next plan)

- Stroke-play scoring engine (pure function) + countback tiebreakers (TDD)
- Score-entry screen for scorekeepers (big steppers, per-player, swipe between holes)
- Real live leaderboard using the engine + `toPar()` helper (replaces the watch stub)
- Results screen + `setup → live → final` status transitions (organizer controls)
- GolfCourseAPI course search: Next.js Route Handler holding the API key, DB caching into `courses`/`course_tees`, tee selection UI in create flow (needs the user's free API key)
```
