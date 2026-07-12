# Golf Outing App — Phase 1C (GolfCourseAPI Course Search) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let the organizer search real golf courses instead of typing pars — pick a course and tee from GolfCourseAPI, cache it in our DB, and create the outing with real par + stroke-index data (so proper-net scoring is fully automatic). Manual entry stays as a fallback.

**Architecture:** The API key lives only server-side, in two Next.js Route Handlers (`/api/courses/search`, `/api/courses/detail`) that proxy GolfCourseAPI — the browser never sees the key. Fetched courses are cached into our existing `courses` + `course_tees` tables (dedup by `external_id`); a course already cached costs zero API calls. The existing `create_outing` RPC already snapshots the chosen tee's `par`/`stroke_index` onto the outing, so no scoring changes are needed — real stroke-index data flows straight into the Phase 1B engine.

**Tech Stack:** Next.js 15 Route Handlers (`app/api/**/route.ts`), supabase-js, Vitest/Playwright. Existing design system.

**API facts (from the GolfCourseAPI docs — [docs](https://api.golfcourseapi.com/docs/api/), [site](https://golfcourseapi.com/)):**
- Base URL `https://api.golfcourseapi.com`. Auth: header `Authorization: Key <API_KEY>`. 401 if missing/invalid.
- `GET /v1/search?search_query=<text>` → `{ "courses": [ { id, club_name, course_name, location: { city, state, ... } } ] }`.
- `GET /v1/courses/{id}` → `{ id, club_name, course_name, location{...}, tees: { "male": [tee], "female": [tee] } }`. A `tee` = `{ tee_name, course_rating, slope_rating, total_yards, number_of_holes, par_total, holes: [ { par, yardage, handicap } ] }`. `handicap` is the per-hole stroke index (1 = hardest).
- Free tier ~50 requests/day → cache aggressively; only hit the API for courses not already cached.

**Key facts (already set up):**
- `.env.local` has an empty `GOLFCOURSE_API_KEY=` placeholder (server-side only, NO `NEXT_PUBLIC_` prefix). The user pastes their key there in Task 5; it also gets set on Vercel.
- `courses(external_id text unique, name, city, state, num_holes check in (9,18), created_by, ...)`, `course_tees(course_id, name, gender, yardage, par int[], stroke_index int[]|null)`.
- RLS today: `courses_insert` requires `created_by = auth.uid()`, `course_tees_insert` requires the parent course be owned by the caller — this BLOCKS caching API courses (which have `created_by = null`). Task 1 relaxes it.
- `create_outing(p_course_id, p_tee_id, p_play_date, p_format, p_skins, p_handicap_mode)` copies the tee's `par`/`stroke_index` into `par_snapshot`/`stroke_index_snapshot`.

---

## File structure

```
outter/
├── supabase/migrations/<ts>_cache_api_courses.sql   # CREATE — relax RLS for API-sourced courses
├── app/api/courses/
│   ├── search/route.ts        # CREATE — proxy GET /v1/search
│   └── detail/route.ts        # CREATE — proxy GET /v1/courses/{id}, flatten tees
├── src/lib/courses.ts         # CREATE — search + select-or-import client helpers
└── app/create/page.tsx        # MODIFY — Search/Manual toggle, course picker, tee select
```

---

### Task 1: RLS migration — allow caching API-sourced courses

**Files:** Create `supabase/migrations/<timestamp>_cache_api_courses.sql`

- [ ] **Step 1: Generate a properly-named migration**
```bash
cd /Users/trevorbrown/Projects/Outter
supabase migration new cache_api_courses
```
Then write this SQL into the generated file (find it with `ls supabase/migrations/`):

```sql
-- API-sourced courses have created_by = null and external_id set; allow any
-- authenticated (anon) user to cache them. Manual courses still require ownership.
drop policy courses_insert on courses;
create policy courses_insert on courses for insert to authenticated
  with check (created_by = auth.uid() or external_id is not null);

drop policy course_tees_insert on course_tees;
create policy course_tees_insert on course_tees for insert to authenticated
  with check (
    exists (
      select 1 from courses c
      where c.id = course_id
        and (c.created_by = auth.uid() or c.external_id is not null)
    )
  );
```

- [ ] **Step 2: Push and confirm**
```bash
supabase db push --linked < /dev/null
supabase migration list --linked < /dev/null   # new migration shows applied
```

- [ ] **Step 3: Confirm the existing suite still passes** (RLS tests must be unaffected):
```bash
npm test
```
Expected: 29 passing.

- [ ] **Step 4: Commit**
```bash
git add supabase/migrations/
git commit -m "feat(courses): relax RLS to allow caching API-sourced courses"
```
Body final line: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 2: Route Handlers — search + detail (server-side API key)

**Files:** Create `app/api/courses/search/route.ts`, `app/api/courses/detail/route.ts`

- [ ] **Step 1: Search handler** — `app/api/courses/search/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'

const BASE = 'https://api.golfcourseapi.com'

export async function GET(req: NextRequest) {
  const key = process.env.GOLFCOURSE_API_KEY
  if (!key) return NextResponse.json({ error: 'course_search_unconfigured' }, { status: 503 })

  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ courses: [] })

  const res = await fetch(`${BASE}/v1/search?search_query=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Key ${key}` },
    cache: 'no-store',
  })
  if (!res.ok) return NextResponse.json({ error: 'course_search_failed' }, { status: 502 })

  const data = await res.json()
  const courses = (data.courses ?? []).map((c: { id: number; club_name?: string; course_name?: string; location?: { city?: string; state?: string } }) => ({
    externalId: c.id,
    clubName: c.club_name ?? '',
    courseName: c.course_name ?? '',
    city: c.location?.city ?? null,
    state: c.location?.state ?? null,
  }))
  return NextResponse.json({ courses })
}
```

- [ ] **Step 2: Detail handler** — `app/api/courses/detail/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'

const BASE = 'https://api.golfcourseapi.com'

interface ApiHole { par: number; yardage?: number; handicap?: number | null }
interface ApiTee { tee_name?: string; total_yards?: number; number_of_holes?: number; holes?: ApiHole[] }

export async function GET(req: NextRequest) {
  const key = process.env.GOLFCOURSE_API_KEY
  if (!key) return NextResponse.json({ error: 'course_search_unconfigured' }, { status: 503 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id_required' }, { status: 400 })

  const res = await fetch(`${BASE}/v1/courses/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Key ${key}` },
    cache: 'no-store',
  })
  if (!res.ok) return NextResponse.json({ error: 'course_fetch_failed' }, { status: 502 })

  const body = await res.json()
  const c = body.course ?? body // detail wraps the payload in a "course" key
  const tees: {
    name: string
    gender: 'male' | 'female'
    numHoles: number
    yardage: number | null
    par: number[]
    strokeIndex: (number | null)[]
  }[] = []

  for (const gender of ['male', 'female'] as const) {
    for (const t of (c.tees?.[gender] ?? []) as ApiTee[]) {
      const holes = t.holes ?? []
      if (holes.length !== 9 && holes.length !== 18) continue // our schema is 9 or 18 only
      tees.push({
        name: t.tee_name ?? 'Tee',
        gender,
        numHoles: holes.length,
        yardage: t.total_yards ?? null,
        par: holes.map((h) => h.par),
        strokeIndex: holes.map((h) => h.handicap ?? null),
      })
    }
  }

  return NextResponse.json({
    externalId: c.id,
    clubName: c.club_name ?? '',
    courseName: c.course_name ?? '',
    city: c.location?.city ?? null,
    state: c.location?.state ?? null,
    tees,
  })
}
```

- [ ] **Step 3: Verify build** — `npm run build` (routes compile even with no key set; they return 503 at runtime). Expected: `/api/courses/search` and `/api/courses/detail` appear in the route list.

- [ ] **Step 4: Commit**
```bash
git add app/api/courses/
git commit -m "feat(courses): server-side GolfCourseAPI search + detail route handlers"
```
Body final line: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 3: Course client helpers (search + select-or-import)

**Files:** Create `src/lib/courses.ts`

Caching strategy: on selecting a search result, check our `courses` cache by `external_id` first (0 API calls); only if absent do we fetch the detail (1 API call) and insert course + tees. Dedup keeps us well under the 50/day budget.

- [ ] **Step 1: Write `src/lib/courses.ts`:**

```ts
import { supabase } from './supabase'

export interface CourseSearchResult {
  externalId: number
  clubName: string
  courseName: string
  city: string | null
  state: string | null
}

export interface TeeOption {
  teeId: string
  label: string
  numHoles: number
  hasStrokeIndex: boolean
}

export async function searchCourses(q: string): Promise<CourseSearchResult[]> {
  const res = await fetch(`/api/courses/search?q=${encodeURIComponent(q)}`)
  if (res.status === 503) throw new Error('Course search isn’t configured yet.')
  if (!res.ok) throw new Error('Course search failed. Try again or enter the course manually.')
  const { courses } = await res.json()
  return courses
}

/**
 * Return a cached course + its tee options for a search result, importing it from
 * the API (and caching it) only if we haven't seen it before.
 */
export async function selectOrImportCourse(r: CourseSearchResult): Promise<{ courseId: string; tees: TeeOption[] }> {
  const extId = String(r.externalId)

  const cached = await supabase.from('courses').select('id').eq('external_id', extId).maybeSingle()
  if (cached.data) {
    const teeRows = await supabase
      .from('course_tees')
      .select('id,name,par,stroke_index')
      .eq('course_id', cached.data.id)
    return {
      courseId: cached.data.id,
      tees: (teeRows.data ?? []).map((t) => ({
        teeId: t.id,
        label: t.name,
        numHoles: (t.par as number[]).length,
        hasStrokeIndex: t.stroke_index != null,
      })),
    }
  }

  // not cached — fetch full detail (1 API call) and cache it
  const detailRes = await fetch(`/api/courses/detail?id=${r.externalId}`)
  if (!detailRes.ok) throw new Error('Couldn’t load that course. Try another or enter it manually.')
  const detail = await detailRes.json()
  if (!detail.tees?.length) throw new Error('That course has no usable tee data. Enter it manually.')

  const numHoles = detail.tees[0].numHoles
  const course = await supabase
    .from('courses')
    .insert({
      external_id: extId,
      name: `${detail.clubName} — ${detail.courseName}`.replace(/^ — | — $/g, ''),
      city: detail.city,
      state: detail.state,
      num_holes: numHoles,
    })
    .select('id')
    .single()
  if (course.error) throw course.error

  const teeRows = detail.tees.map((t: { name: string; gender: string; yardage: number | null; par: number[]; strokeIndex: (number | null)[] }) => ({
    course_id: course.data.id,
    name: `${t.name} (${t.gender === 'male' ? 'M' : 'F'})`,
    gender: t.gender,
    yardage: t.yardage,
    par: t.par,
    stroke_index: t.strokeIndex.some((x) => x == null) ? null : t.strokeIndex,
  }))
  const inserted = await supabase.from('course_tees').insert(teeRows).select('id,name,par,stroke_index')
  if (inserted.error) throw inserted.error

  return {
    courseId: course.data.id,
    tees: (inserted.data ?? []).map((t) => ({
      teeId: t.id,
      label: t.name,
      numHoles: (t.par as number[]).length,
      hasStrokeIndex: t.stroke_index != null,
    })),
  }
}
```

- [ ] **Step 2: Verify build** — `npm run build` clean.

- [ ] **Step 3: Commit**
```bash
git add src/lib/courses.ts
git commit -m "feat(courses): search + cache-or-import client helpers"
```
Body final line: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 4: Create screen — course search UI + tee selection

**Files:** Modify `app/create/page.tsx`

Add a **Search / Manual** toggle at the top. Search mode: type a course name → results list → pick a course → tee dropdown appears → the rest of the form (date/format/skins/handicaps) → Create. Manual mode: the existing par-grid flow. Both converge on a single `create_outing` call with a resolved `courseId` + `teeId`.

Preserve the E2E-critical bits: the manual path must still expose the "Course name" label, "9 holes"/"18 holes" toggle, and "Create outing" button (the E2E uses Manual mode). The Search toggle must not be the only path.

- [ ] **Step 1: Rewrite `app/create/page.tsx`:**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, ensureSession } from '@/src/lib/supabase'
import type { HandicapMode, Outing, OutingFormat } from '@/src/lib/types'
import { Button, ScreenHeader } from '@/src/components/ui'
import { searchCourses, selectOrImportCourse, type CourseSearchResult, type TeeOption } from '@/src/lib/courses'

const label = 'text-xs font-medium uppercase tracking-[0.14em] text-sage'
const field = 'rounded-[13px] border border-parch-2 bg-cream px-4 py-3 text-ink outline-none focus:border-gold'

export default function CreateOuting() {
  const router = useRouter()
  const [mode, setMode] = useState<'search' | 'manual'>('search')

  // shared
  const [playDate, setPlayDate] = useState(new Date().toISOString().slice(0, 10))
  const [format, setFormat] = useState<OutingFormat>('stroke')
  const [skins, setSkins] = useState(false)
  const [handicapMode, setHandicapMode] = useState<HandicapMode>('none')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // search mode
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CourseSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [picked, setPicked] = useState<{ courseId: string; label: string; tees: TeeOption[] } | null>(null)
  const [teeId, setTeeId] = useState('')

  // manual mode
  const [courseName, setCourseName] = useState('')
  const [numHoles, setNumHoles] = useState<9 | 18>(18)
  const [pars, setPars] = useState<number[]>(Array(18).fill(4))

  async function runSearch() {
    setSearching(true)
    setError(null)
    setPicked(null)
    try {
      setResults(await searchCourses(query.trim()))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed')
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  async function pickCourse(r: CourseSearchResult) {
    setBusy(true)
    setError(null)
    try {
      const { courseId, tees } = await selectOrImportCourse(r)
      setPicked({ courseId, label: `${r.clubName} — ${r.courseName}`, tees })
      setTeeId(tees[0]?.teeId ?? '')
      setResults([])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load course')
    } finally {
      setBusy(false)
    }
  }

  async function resolveCourseAndTee(session: { user: { id: string } }): Promise<{ courseId: string; teeId: string }> {
    if (mode === 'search') {
      if (!picked || !teeId) throw new Error('Pick a course and tee first')
      return { courseId: picked.courseId, teeId }
    }
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
    return { courseId: course.id, teeId: tee.id }
  }

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const session = await ensureSession()
      const { courseId, teeId: resolvedTeeId } = await resolveCourseAndTee(session)
      const { data: outing, error: oErr } = await supabase.rpc('create_outing', {
        p_course_id: courseId,
        p_tee_id: resolvedTeeId,
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

  const canCreate = mode === 'search' ? !!picked && !!teeId : !!courseName.trim()

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 p-6">
      <ScreenHeader title="New outing" meta="Set up the round" />

      <div className="flex gap-2">
        {(['search', 'manual'] as const).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setError(null) }}
            className={`flex-1 rounded-[13px] border-[1.5px] py-2.5 text-sm font-medium capitalize ${
              mode === m ? 'border-pine bg-pine text-cream' : 'border-parch-2 bg-cream text-sage'
            }`}
          >
            {m === 'search' ? 'Search courses' : 'Enter manually'}
          </button>
        ))}
      </div>

      {mode === 'search' && (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && query.trim()) runSearch() }}
              placeholder="Pinehurst, Pebble Beach…"
              className={`${field} w-full`}
            />
            <button
              onClick={runSearch}
              disabled={searching || !query.trim()}
              className="rounded-[13px] border-[1.5px] border-pine px-5 font-medium text-pine disabled:opacity-40"
            >
              {searching ? '…' : 'Find'}
            </button>
          </div>

          {results.map((r) => (
            <button
              key={r.externalId}
              onClick={() => pickCourse(r)}
              className="rounded-xl border border-parch-2 bg-cream p-3 text-left"
            >
              <p className="font-serif text-ink">{r.clubName || r.courseName}</p>
              <p className="text-xs text-sage">
                {[r.courseName, [r.city, r.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
              </p>
            </button>
          ))}

          {picked && (
            <div className="flex flex-col gap-2 rounded-xl border border-gold bg-cream p-3">
              <p className="font-serif text-ink">{picked.label}</p>
              <label className="flex flex-col gap-1.5">
                <span className={label}>Tee</span>
                <select value={teeId} onChange={(e) => setTeeId(e.target.value)} className={field}>
                  {picked.tees.map((t) => (
                    <option key={t.teeId} value={t.teeId}>
                      {t.label} · {t.numHoles} holes{t.hasStrokeIndex ? '' : ' · no stroke index'}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>
      )}

      {mode === 'manual' && (
        <>
          <label className="flex flex-col gap-1.5">
            <span className={label}>Course name</span>
            <input
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              placeholder="The Pines"
              className={`${field} font-serif text-lg placeholder:text-sage/40`}
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className={label}>Holes</span>
            <div className="flex gap-2">
              {([18, 9] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => setNumHoles(n)}
                  className={`flex-1 rounded-[13px] border-[1.5px] py-3 font-medium ${
                    numHoles === n ? 'border-pine bg-pine text-cream' : 'border-parch-2 bg-cream text-sage'
                  }`}
                >
                  {n} holes
                </button>
              ))}
            </div>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className={`${label} mb-1`}>Par per hole</legend>
            <div className="grid grid-cols-6 gap-2">
              {pars.slice(0, numHoles).map((p, i) => (
                <label key={i} className="flex flex-col items-center gap-1 text-[10px] font-medium text-sage">
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
                    className="tnum w-full rounded-t-md border border-parch-2 border-b-2 border-b-gold bg-cream px-1 py-2 text-center font-serif text-lg text-pine outline-none focus:border-b-pine"
                  />
                </label>
              ))}
            </div>
          </fieldset>
        </>
      )}

      <label className="flex flex-col gap-1.5">
        <span className={label}>Date</span>
        <input type="date" value={playDate} onChange={(e) => setPlayDate(e.target.value)} className={field} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={label}>Format</span>
        <select value={format} onChange={(e) => setFormat(e.target.value as OutingFormat)} className={field}>
          <option value="stroke">Stroke play</option>
          <option value="scramble">Scramble</option>
        </select>
      </label>

      <label className="flex items-center justify-between rounded-[13px] border border-parch-2 bg-cream px-4 py-3">
        <span className="font-serif text-ink">Skins side game</span>
        <input type="checkbox" checked={skins} onChange={(e) => setSkins(e.target.checked)} className="h-5 w-5 accent-pine" />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={label}>Handicaps</span>
        <select value={handicapMode} onChange={(e) => setHandicapMode(e.target.value as HandicapMode)} className={field}>
          <option value="none">None (gross)</option>
          <option value="manual">Manual entry</option>
          <option value="auto">Manual + auto-balance groups</option>
        </select>
      </label>

      {error && <p className="text-sm text-board-red">{error}</p>}
      <Button onClick={submit} disabled={busy || !canCreate} className="text-lg">
        {busy ? 'Creating…' : 'Create outing'}
      </Button>
    </main>
  )
}
```

- [ ] **Step 2: Verify build + E2E** — the E2E drives Manual mode. Kill any stray `:3000` first.
```bash
lsof -ti:3000 | xargs kill -9 2>/dev/null; npm run build && npx playwright test
```
Expected: build clean; core-loop PASSES (it must click "Enter manually" IF Search is the default — see Step 3).

- [ ] **Step 3: Update the E2E to select Manual mode.** Since Search is the default tab, the manual "Course name" field isn't shown until Manual is selected. In `e2e/core-loop.spec.ts`, right after `await orgPage.goto('/create')`, add:
```ts
await orgPage.getByRole('button', { name: 'Enter manually' }).click()
```
Re-run `npx playwright test` → PASS.

- [ ] **Step 4: Commit**
```bash
git add app/create/page.tsx e2e/core-loop.spec.ts
git commit -m "feat(courses): course search + tee selection in create flow"
```
Body final line: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 5: Wire the key, verify against the live API, deploy

**Files:** none (env + verification)

- [ ] **Step 1: Confirm the local key.** The user pastes their key after `GOLFCOURSE_API_KEY=` in `.env.local`. Verify it's set (without printing it):
```bash
cd /Users/trevorbrown/Projects/Outter
[ -n "$(grep '^GOLFCOURSE_API_KEY=' .env.local | cut -d= -f2-)" ] && echo "key present" || echo "KEY EMPTY — ask the user to paste it"
```
If empty, STOP and ask the user to add it before continuing.

- [ ] **Step 2: Smoke-test the live API through the handler.** Start dev, hit the search route, expect real courses:
```bash
lsof -ti:3000 | xargs kill -9 2>/dev/null
npm run dev > /tmp/outter-dev.log 2>&1 &
sleep 6
curl -s "http://localhost:3000/api/courses/search?q=pinehurst" | head -c 400
lsof -ti:3000 | xargs kill -9 2>/dev/null
```
Expected: JSON with a non-empty `courses` array. If `503 course_search_unconfigured`, the key isn't being read — check `.env.local`. If `502`, the upstream call failed — check the key value / auth header.

- [ ] **Step 3: Set the key on Vercel (production) and redeploy.**
```bash
printf '%s' "$(grep '^GOLFCOURSE_API_KEY=' .env.local | cut -d= -f2-)" | npx vercel env add GOLFCOURSE_API_KEY production
git push origin main   # triggers the production build
```

- [ ] **Step 4: Verify on the live site.** Wait for the Vercel build to go Ready (`npx vercel ls outter`), then hit the production search route and confirm real courses come back:
```bash
curl -s "https://outter-trevorbrown25s-projects.vercel.app/api/courses/search?q=pebble" | head -c 400
```
Expected: JSON `courses` array. Then, in the browser: create an outing via Search → pick a course + tee → confirm the round is created and (with handicaps on) proper-net scoring uses real stroke indexes.

---

## Self-review checklist (run before executing)

- The API key is only ever read in `app/api/**/route.ts` (server-side); never `NEXT_PUBLIC_`, never in `src/lib/courses.ts`.
- `searchCourses`/`selectOrImportCourse` types match their use in `create/page.tsx`.
- Manual mode still exposes "Course name", the holes toggle, and "Create outing"; E2E selects "Enter manually".
- Only 9/18-hole tees are imported (schema constraint); tees missing any per-hole `handicap` cache `stroke_index = null` (engine falls back to simple net for that tee).
- Dedup by `external_id` means re-picking a cached course costs 0 API calls.

## Out of scope → later

- Local-cache-first search (search our cached `courses` before hitting the API) — a nice optimization once there's a corpus of cached courses; v1 hits the API on each explicit search.
- Course thumbnails, distance/geo sorting, favouriting.
- **Phase 2 — scramble**, **Phase 3 — skins**.
```
