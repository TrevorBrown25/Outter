# Golf Outing App — Phase 0 (Skeleton) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Working end-to-end skeleton — create an outing (with quick manual course entry), share via QR/6-char code, a scorekeeper joins and creates a group with player names, and the group appears live on the organizer's and a spectator's screen.

**Architecture:** Next.js App Router PWA where all data access happens client-side through supabase-js (anonymous auth sessions) against a cloud Supabase project. Security-sensitive writes go through Postgres RPCs (`security definer`); everything else is direct table access gated by RLS. Realtime via `postgres_changes` filtered by `outing_id`. No SSR auth, no service keys in the app.

**Tech Stack:** Next.js 15 (App Router, TypeScript, Tailwind), @supabase/supabase-js v2, Supabase cloud (Postgres 15+, anonymous sign-in, Realtime), qrcode.react, Vitest (integration tests), Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-07-10-golf-outing-app-design.md`. Phases 1–3 get their own plans after this one executes.

**Environment notes (verified 2026-07-10):** Node v24, npm 11, Homebrew present, **no Docker** → do not use `supabase start`; all DB work targets the cloud project via `supabase db push` (works without Docker). Supabase CLI not yet installed (Task 3 installs it).

---

## File structure

```
outter/                              # Next.js app at repo root
├── app/
│   ├── layout.tsx                   # (scaffolded)
│   ├── page.tsx                     # Landing: Create / Join
│   ├── create/page.tsx              # Create outing + quick manual course
│   ├── outing/[id]/lobby/page.tsx   # Organizer lobby: QR, code, live groups
│   ├── outing/[id]/watch/page.tsx   # Spectator: live groups/players (leaderboard = Phase 1)
│   └── join/[code]/
│       ├── page.tsx                 # Chooser: "Keep score" / "Just watch"
│       └── keep-score/page.tsx      # Group name + player names form
├── src/lib/
│   ├── supabase.ts                  # Browser client + ensureSession()
│   └── types.ts                     # Domain types mirroring schema
├── supabase/
│   ├── config.toml                  # (from supabase init)
│   └── migrations/
│       ├── 0001_schema.sql          # enums, tables, indexes
│       └── 0002_security.sql        # RLS, helper fns, RPCs, realtime publication
├── tests/
│   └── integration/rls.test.ts     # RLS/RPC permission matrix (vitest, hits cloud DB)
├── e2e/
│   └── core-loop.spec.ts            # Two-context smoke test (Playwright)
├── vitest.config.ts
├── playwright.config.ts
└── .env.local                       # NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY (gitignored)
```

---

### Task 1: Scaffold Next.js app

**Files:**
- Create: entire Next.js scaffold at repo root (`app/`, `package.json`, `tsconfig.json`, …)

- [ ] **Step 1: Scaffold with create-next-app**

The repo root already has `README.md`, `.gitignore`, `docs/`. Scaffold into a temp dir and move contents up (create-next-app refuses non-empty dirs):

```bash
cd /Users/trevorbrown/Projects/Outter
npx create-next-app@latest tmp-scaffold --typescript --tailwind --eslint --app --src-dir=false --import-alias "@/*" --use-npm --yes
rsync -a --exclude=.git tmp-scaffold/ ./
rm -rf tmp-scaffold
```

Note: `--src-dir=false` keeps `app/` at root; we add `src/lib/` ourselves and `@/*` maps to repo root.

- [ ] **Step 2: Verify dev server boots**

```bash
npm run dev &
sleep 5 && curl -sf http://localhost:3000 > /dev/null && echo OK
kill %1
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js app (App Router, TS, Tailwind)"
```

---

### Task 2: Dependencies + test tooling

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install runtime deps**

```bash
npm install @supabase/supabase-js qrcode.react
```

- [ ] **Step 2: Install and configure vitest**

```bash
npm install -D vitest dotenv
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    testTimeout: 30_000, // integration tests hit the cloud DB
  },
})
```

Create `tests/setup.ts`:

```ts
import { config } from 'dotenv'
config({ path: '.env.local' })
```

Add to `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Verify vitest runs (no tests yet is fine)**

```bash
npx vitest run --passWithNoTests
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: add supabase-js, qrcode.react, vitest"
```

---

### Task 3: Supabase project + CLI link

**Files:**
- Create: `supabase/config.toml` (via `supabase init`)
- Create: `.env.local` (gitignored — verify `.env*` is in `.gitignore`; add if missing)

- [ ] **Step 1: Install Supabase CLI**

```bash
brew install supabase/tap/supabase
supabase --version
```

- [ ] **Step 2: Create the cloud project**

Use the connected Supabase MCP (`create_project`, name: `golf-outing`, confirm cost first) — or the dashboard if running manually. Record the project ref, URL, and anon (publishable) key (`get_project_url` / `get_publishable_keys` MCP tools).

- [ ] **Step 3: Enable anonymous sign-in**

Dashboard → Authentication → Sign In / Up → enable **Anonymous sign-ins**. (No MCP tool for this; it's a one-time manual toggle.) Without it, every `signInAnonymously()` call fails.

- [ ] **Step 4: Init + link the CLI**

```bash
supabase init          # creates supabase/config.toml
supabase link --project-ref <PROJECT_REF>
```

- [ ] **Step 5: Write `.env.local`**

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

Confirm `.gitignore` covers `.env*` (create-next-app's default does).

- [ ] **Step 6: Commit**

```bash
git add supabase/config.toml .gitignore && git commit -m "chore: init and link supabase project"
```

---

### Task 4: Schema migration

**Files:**
- Create: `supabase/migrations/0001_schema.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 0001_schema.sql — core schema per design spec §4
create type outing_format as enum ('stroke', 'scramble');
create type handicap_mode as enum ('none', 'manual', 'auto');
create type outing_status as enum ('setup', 'live', 'final');

create table courses (
  id            uuid primary key default gen_random_uuid(),
  external_id   text unique,              -- GolfCourseAPI id; null for manual
  name          text not null,
  city          text,
  state         text,
  num_holes     int not null check (num_holes in (9, 18)),
  created_by    uuid,                     -- auth.uid() of manual creator
  created_at    timestamptz not null default now()
);

create table course_tees (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references courses(id),
  name          text not null,
  gender        text,
  yardage       int,
  par           int[] not null,
  stroke_index  int[]                     -- null if unknown (manual entry)
);

create table outings (
  id            uuid primary key default gen_random_uuid(),
  organizer_id  uuid not null,            -- auth.uid()
  course_id     uuid not null references courses(id),
  tee_id        uuid not null references course_tees(id),
  par_snapshot  int[] not null,
  stroke_index_snapshot int[],
  play_date     date not null,
  format        outing_format not null default 'stroke',
  skins_enabled boolean not null default false,
  handicap_mode handicap_mode not null default 'none',
  status        outing_status not null default 'setup',
  share_code    text not null unique,
  created_at    timestamptz not null default now()
);

create table groups (
  id                  uuid primary key default gen_random_uuid(),
  outing_id           uuid not null references outings(id),
  name                text not null,
  scorekeeper_user_id uuid,               -- null until claimed
  created_at          timestamptz not null default now()
);

create table players (
  id             uuid primary key default gen_random_uuid(),
  outing_id      uuid not null references outings(id),
  group_id       uuid not null references groups(id),
  display_name   text not null,
  handicap_index numeric,
  created_at     timestamptz not null default now()
);

create table scores (
  id          uuid primary key default gen_random_uuid(),
  outing_id   uuid not null references outings(id),
  hole_number int not null check (hole_number between 1 and 18),
  strokes     int not null check (strokes between 1 and 30),
  player_id   uuid references players(id),   -- stroke format
  group_id    uuid references groups(id),    -- scramble format
  entered_by  uuid not null,
  updated_at  timestamptz not null default now(),
  check (num_nonnulls(player_id, group_id) = 1),
  unique nulls not distinct (outing_id, hole_number, player_id, group_id)
);

create index idx_course_tees_course on course_tees(course_id);
create index idx_groups_outing on groups(outing_id);
create index idx_players_outing on players(outing_id);
create index idx_players_group on players(group_id);
create index idx_scores_outing on scores(outing_id);
```

- [ ] **Step 2: Push and verify**

```bash
supabase db push
```

Then verify tables exist (Supabase MCP `list_tables`, or):

```bash
supabase migration list
```

Expected: `0001_schema` shown as applied on remote.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0001_schema.sql && git commit -m "feat: core schema (courses, tees, outings, groups, players, scores)"
```

---

### Task 5: Security migration — RLS, RPCs, realtime

**Files:**
- Create: `supabase/migrations/0002_security.sql`

Read model: any *authenticated* session (anonymous sign-ins count as `authenticated`) can read rows — discovery is gated by the share code (only resolvable via RPC) and unguessable UUIDs. Writes are strictly gated: organizer for outing changes, group's scorekeeper (or organizer) for players/scores, all mutating flows with invariants go through `security definer` RPCs.

- [ ] **Step 1: Write the migration**

```sql
-- 0002_security.sql — RLS, helper functions, RPCs, realtime
alter table courses      enable row level security;
alter table course_tees  enable row level security;
alter table outings      enable row level security;
alter table groups       enable row level security;
alter table players      enable row level security;
alter table scores       enable row level security;

-- ---------- helpers ----------
create or replace function is_organizer(p_outing_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from outings where id = p_outing_id and organizer_id = auth.uid());
$$;

create or replace function can_score(p_outing_id uuid, p_player_id uuid, p_group_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from outings o where o.id = p_outing_id and o.status <> 'final')
  and (
    is_organizer(p_outing_id)
    or exists (
      select 1 from groups g
      where g.outing_id = p_outing_id
        and g.scorekeeper_user_id = auth.uid()
        and (g.id = p_group_id
             or g.id = (select p.group_id from players p where p.id = p_player_id))
    )
  );
$$;

-- ---------- read policies (all authenticated) ----------
create policy courses_select     on courses     for select to authenticated using (true);
create policy course_tees_select on course_tees for select to authenticated using (true);
create policy outings_select     on outings     for select to authenticated using (true);
create policy groups_select      on groups      for select to authenticated using (true);
create policy players_select     on players     for select to authenticated using (true);
create policy scores_select      on scores      for select to authenticated using (true);

-- ---------- write policies ----------
create policy courses_insert on courses for insert to authenticated
  with check (created_by = auth.uid());

create policy course_tees_insert on course_tees for insert to authenticated
  with check (exists (select 1 from courses c where c.id = course_id and c.created_by = auth.uid()));

create policy outings_update on outings for update to authenticated
  using (organizer_id = auth.uid());
-- outings insert happens only via create_outing() RPC (security definer)

create policy groups_update on groups for update to authenticated
  using (scorekeeper_user_id = auth.uid() or is_organizer(outing_id));
create policy groups_delete on groups for delete to authenticated
  using (is_organizer(outing_id));
-- groups insert happens only via create_group() RPC

create policy players_insert on players for insert to authenticated
  with check (
    is_organizer(outing_id)
    or exists (select 1 from groups g where g.id = group_id and g.scorekeeper_user_id = auth.uid())
  );
create policy players_update on players for update to authenticated
  using (
    is_organizer(outing_id)
    or exists (select 1 from groups g where g.id = group_id and g.scorekeeper_user_id = auth.uid())
  );
create policy players_delete on players for delete to authenticated
  using (
    is_organizer(outing_id)
    or exists (select 1 from groups g where g.id = group_id and g.scorekeeper_user_id = auth.uid())
  );

create policy scores_insert on scores for insert to authenticated
  with check (can_score(outing_id, player_id, group_id) and entered_by = auth.uid());
create policy scores_update on scores for update to authenticated
  using (can_score(outing_id, player_id, group_id));

-- ---------- RPCs ----------
create or replace function generate_share_code()
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I/L
  code text;
begin
  loop
    code := (
      select string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '')
      from generate_series(1, 6)
    );
    exit when not exists (select 1 from outings where share_code = code);
  end loop;
  return code;
end;
$$;

create or replace function create_outing(
  p_course_id uuid,
  p_tee_id uuid,
  p_play_date date,
  p_format outing_format,
  p_skins boolean,
  p_handicap_mode handicap_mode
) returns outings language plpgsql volatile security definer set search_path = public as $$
declare
  v_tee course_tees;
  v_outing outings;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into v_tee from course_tees where id = p_tee_id and course_id = p_course_id;
  if not found then raise exception 'tee not found for course'; end if;

  insert into outings (organizer_id, course_id, tee_id, par_snapshot, stroke_index_snapshot,
                       play_date, format, skins_enabled, handicap_mode, share_code)
  values (auth.uid(), p_course_id, p_tee_id, v_tee.par, v_tee.stroke_index,
          p_play_date, p_format, p_skins, p_handicap_mode, generate_share_code())
  returning * into v_outing;
  return v_outing;
end;
$$;

create or replace function get_outing_by_code(p_code text)
returns setof outings language sql stable security definer set search_path = public as $$
  select * from outings where share_code = upper(trim(p_code));
$$;

create or replace function create_group(
  p_share_code text,
  p_name text,
  p_player_names text[],
  p_handicaps numeric[] default null
) returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_outing outings;
  v_group_id uuid;
  v_name text;
  i int;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into v_outing from outings
    where share_code = upper(trim(p_share_code)) and status in ('setup', 'live');
  if not found then raise exception 'outing not found or already final'; end if;
  if p_player_names is null or array_length(p_player_names, 1) is null then
    raise exception 'at least one player name required';
  end if;

  v_name := coalesce(nullif(trim(p_name), ''),
    'Group ' || (1 + (select count(*) from groups where outing_id = v_outing.id))::text);

  insert into groups (outing_id, name, scorekeeper_user_id)
  values (v_outing.id, v_name, auth.uid())
  returning id into v_group_id;

  for i in 1 .. array_length(p_player_names, 1) loop
    insert into players (outing_id, group_id, display_name, handicap_index)
    values (v_outing.id, v_group_id, trim(p_player_names[i]),
            case when p_handicaps is not null then p_handicaps[i] end);
  end loop;
  return v_group_id;
end;
$$;

create or replace function claim_group(p_group_id uuid)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare v_claimed boolean;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update groups set scorekeeper_user_id = auth.uid()
    where id = p_group_id and scorekeeper_user_id is null;
  v_claimed := found;
  return v_claimed;
end;
$$;

revoke execute on function generate_share_code() from public, anon, authenticated;
grant execute on function create_outing(uuid, uuid, date, outing_format, boolean, handicap_mode) to authenticated;
grant execute on function get_outing_by_code(text) to authenticated;
grant execute on function create_group(text, text, text[], numeric[]) to authenticated;
grant execute on function claim_group(uuid) to authenticated;

-- ---------- realtime ----------
alter publication supabase_realtime add table groups, players, scores;
```

- [ ] **Step 2: Push and spot-check**

```bash
supabase db push
```

Then run the Supabase MCP `get_advisors` (security) — expect no "RLS disabled" findings on our six tables.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0002_security.sql && git commit -m "feat: RLS policies, RPCs (create_outing, create_group, claim_group), realtime"
```

---

### Task 6: RLS/RPC integration tests (permission matrix)

**Files:**
- Create: `tests/integration/rls.test.ts`

These run against the cloud project using three separate anonymous sessions (organizer, scorekeeper, stranger). They are the *failing-test-first* step for the security model — if a policy from Task 5 is wrong, these catch it.

- [ ] **Step 1: Write the tests**

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

function newClient(): SupabaseClient {
  return createClient(url, anonKey, { auth: { persistSession: false } })
}

async function anonSession(): Promise<SupabaseClient> {
  const client = newClient()
  const { error } = await client.auth.signInAnonymously()
  if (error) throw error
  return client
}

describe('RLS permission matrix', () => {
  let organizer: SupabaseClient
  let scorekeeper: SupabaseClient
  let stranger: SupabaseClient
  let outingId: string
  let shareCode: string
  let groupId: string
  let playerId: string

  beforeAll(async () => {
    organizer = await anonSession()
    scorekeeper = await anonSession()
    stranger = await anonSession()

    // organizer creates course + tee + outing
    const { data: course, error: cErr } = await organizer
      .from('courses')
      .insert({
        name: 'Test Muni',
        num_holes: 9,
        created_by: (await organizer.auth.getUser()).data.user!.id,
      })
      .select()
      .single()
    expect(cErr).toBeNull()

    const { data: tee, error: tErr } = await organizer
      .from('course_tees')
      .insert({ course_id: course!.id, name: 'White', par: [4, 4, 3, 5, 4, 4, 3, 5, 4] })
      .select()
      .single()
    expect(tErr).toBeNull()

    const { data: outing, error: oErr } = await organizer.rpc('create_outing', {
      p_course_id: course!.id,
      p_tee_id: tee!.id,
      p_play_date: '2026-07-11',
      p_format: 'stroke',
      p_skins: false,
      p_handicap_mode: 'none',
    })
    expect(oErr).toBeNull()
    outingId = outing!.id
    shareCode = outing!.share_code

    // scorekeeper creates a group with two players
    const { data: gid, error: gErr } = await scorekeeper.rpc('create_group', {
      p_share_code: shareCode,
      p_name: 'The Hackers',
      p_player_names: ['Alice', 'Bob'],
    })
    expect(gErr).toBeNull()
    groupId = gid!

    const { data: players } = await scorekeeper
      .from('players')
      .select()
      .eq('group_id', groupId)
    playerId = players![0].id
  })

  it('share code has 6 chars from the safe alphabet', () => {
    expect(shareCode).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/)
  })

  it('get_outing_by_code resolves for a stranger', async () => {
    const { data } = await stranger.rpc('get_outing_by_code', { p_code: shareCode.toLowerCase() })
    expect(data![0].id).toBe(outingId)
  })

  it('stranger can read groups/players (spectator)', async () => {
    const { data } = await stranger.from('players').select().eq('outing_id', outingId)
    expect(data!.length).toBe(2)
  })

  it('stranger cannot update the outing', async () => {
    await stranger.from('outings').update({ status: 'live' }).eq('id', outingId)
    const { data } = await stranger.from('outings').select('status').eq('id', outingId).single()
    expect(data!.status).toBe('setup') // silently 0 rows updated under RLS
  })

  it('organizer can update the outing', async () => {
    const { error } = await organizer.from('outings').update({ status: 'live' }).eq('id', outingId)
    expect(error).toBeNull()
    const { data } = await organizer.from('outings').select('status').eq('id', outingId).single()
    expect(data!.status).toBe('live')
  })

  it('scorekeeper can write a score for their own player', async () => {
    const uid = (await scorekeeper.auth.getUser()).data.user!.id
    const { error } = await scorekeeper.from('scores').insert({
      outing_id: outingId, hole_number: 1, strokes: 5, player_id: playerId, entered_by: uid,
    })
    expect(error).toBeNull()
  })

  it("stranger cannot write a score for someone else's player", async () => {
    const uid = (await stranger.auth.getUser()).data.user!.id
    const { error } = await stranger.from('scores').insert({
      outing_id: outingId, hole_number: 2, strokes: 4, player_id: playerId, entered_by: uid,
    })
    expect(error).not.toBeNull() // RLS violation
  })

  it('claim_group: only first claimer wins, already-claimed returns false', async () => {
    const { data: claimed } = await stranger.rpc('claim_group', { p_group_id: groupId })
    expect(claimed).toBe(false) // scorekeeper already owns it
  })

  it('no writes after final', async () => {
    await organizer.from('outings').update({ status: 'final' }).eq('id', outingId)
    const uid = (await scorekeeper.auth.getUser()).data.user!.id
    const { error } = await scorekeeper.from('scores').insert({
      outing_id: outingId, hole_number: 3, strokes: 4, player_id: playerId, entered_by: uid,
    })
    expect(error).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
npm test
```

Expected: all pass. If a policy test fails, fix `0002_security.sql` via a new migration (never edit an applied migration), push, re-run.

- [ ] **Step 3: Commit**

```bash
git add tests/ && git commit -m "test: RLS/RPC permission matrix integration tests"
```

---

### Task 7: Supabase client helper + domain types

**Files:**
- Create: `src/lib/supabase.ts`
- Create: `src/lib/types.ts`

- [ ] **Step 1: Write the client helper**

```ts
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

/** Every visitor gets an anonymous session; devices are remembered via localStorage. */
export async function ensureSession() {
  const { data } = await supabase.auth.getSession()
  if (data.session) return data.session
  const { data: signIn, error } = await supabase.auth.signInAnonymously()
  if (error) throw error
  return signIn.session!
}
```

- [ ] **Step 2: Write domain types**

```ts
// src/lib/types.ts
export type OutingFormat = 'stroke' | 'scramble'
export type HandicapMode = 'none' | 'manual' | 'auto'
export type OutingStatus = 'setup' | 'live' | 'final'

export interface Outing {
  id: string
  organizer_id: string
  course_id: string
  tee_id: string
  par_snapshot: number[]
  stroke_index_snapshot: number[] | null
  play_date: string
  format: OutingFormat
  skins_enabled: boolean
  handicap_mode: HandicapMode
  status: OutingStatus
  share_code: string
}

export interface Group {
  id: string
  outing_id: string
  name: string
  scorekeeper_user_id: string | null
}

export interface Player {
  id: string
  outing_id: string
  group_id: string
  display_name: string
  handicap_index: number | null
}
```

(Snake_case here on purpose: these mirror Postgres rows coming straight out of supabase-js. No case-conversion layer.)

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: compiles clean.

- [ ] **Step 4: Commit**

```bash
git add src/ && git commit -m "feat: supabase client helper and domain types"
```

---

### Task 8: Landing page

**Files:**
- Modify: `app/page.tsx` (replace scaffold content)

- [ ] **Step 1: Write the page**

```tsx
// app/page.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function Landing() {
  const [code, setCode] = useState('')
  const router = useRouter()

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-center text-3xl font-bold">⛳ Outter</h1>
      <Link
        href="/create"
        className="rounded-xl bg-green-700 py-4 text-center text-lg font-semibold text-white"
      >
        Create an outing
      </Link>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (code.trim().length === 6) router.push(`/join/${code.trim().toUpperCase()}`)
        }}
        className="flex gap-2"
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="6-char code"
          maxLength={6}
          className="w-full rounded-xl border px-4 py-3 text-center text-lg tracking-widest"
        />
        <button
          type="submit"
          disabled={code.trim().length !== 6}
          className="rounded-xl border px-5 font-semibold disabled:opacity-40"
        >
          Join
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 2: Verify in browser**

`npm run dev`, open `http://localhost:3000` — both entry points render; Join disabled until 6 chars.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx && git commit -m "feat: landing page with create/join entry points"
```

---

### Task 9: Create-outing flow (quick manual course)

**Files:**
- Create: `app/create/page.tsx`

Phase 0 uses manual course entry only (name, 9/18, par grid). GolfCourseAPI search replaces/extends this UI in Phase 1 — the DB writes are identical either way.

- [ ] **Step 1: Write the page**

```tsx
// app/create/page.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, ensureSession } from '@/src/lib/supabase'
import type { HandicapMode, Outing, OutingFormat } from '@/src/lib/types'

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

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">New outing</h1>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Course name</span>
        <input
          value={courseName}
          onChange={(e) => setCourseName(e.target.value)}
          className="rounded-lg border px-3 py-2"
        />
      </label>

      <div className="flex gap-2">
        {([9, 18] as const).map((n) => (
          <button
            key={n}
            onClick={() => setNumHoles(n)}
            className={`flex-1 rounded-lg border py-2 font-semibold ${numHoles === n ? 'bg-green-700 text-white' : ''}`}
          >
            {n} holes
          </button>
        ))}
      </div>

      <fieldset>
        <legend className="text-sm font-medium">Par per hole</legend>
        <div className="grid grid-cols-6 gap-1">
          {pars.slice(0, numHoles).map((p, i) => (
            <label key={i} className="flex flex-col items-center text-xs">
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
                className="w-full rounded border px-1 py-1 text-center"
              />
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Date</span>
        <input
          type="date"
          value={playDate}
          onChange={(e) => setPlayDate(e.target.value)}
          className="rounded-lg border px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Format</span>
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as OutingFormat)}
          className="rounded-lg border px-3 py-2"
        >
          <option value="stroke">Stroke play</option>
          <option value="scramble">Scramble</option>
        </select>
      </label>

      <label className="flex items-center gap-2">
        <input type="checkbox" checked={skins} onChange={(e) => setSkins(e.target.checked)} />
        <span>Skins side game</span>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Handicaps</span>
        <select
          value={handicapMode}
          onChange={(e) => setHandicapMode(e.target.value as HandicapMode)}
          className="rounded-lg border px-3 py-2"
        >
          <option value="none">None (gross)</option>
          <option value="manual">Manual entry</option>
          <option value="auto">Manual + auto-balance groups</option>
        </select>
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        onClick={submit}
        disabled={busy || !courseName.trim()}
        className="rounded-xl bg-green-700 py-3 text-lg font-semibold text-white disabled:opacity-40"
      >
        {busy ? 'Creating…' : 'Create outing'}
      </button>
    </main>
  )
}
```

- [ ] **Step 2: Verify in browser**

Create an outing end-to-end; you should land on `/outing/<uuid>/lobby` (404 for now — lobby is Task 10). Confirm rows exist via Supabase MCP `execute_sql`: `select share_code, status from outings order by created_at desc limit 1;`

- [ ] **Step 3: Commit**

```bash
git add app/create && git commit -m "feat: create-outing flow with manual course entry"
```

---

### Task 10: Lobby — QR code, share code, live group list

**Files:**
- Create: `app/outing/[id]/lobby/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// app/outing/[id]/lobby/page.tsx
'use client'
import { use, useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase, ensureSession } from '@/src/lib/supabase'
import type { Group, Outing, Player } from '@/src/lib/types'

export default function Lobby({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [outing, setOuting] = useState<Outing | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [joinUrl, setJoinUrl] = useState('')

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null

    async function load() {
      await ensureSession()
      const { data: o } = await supabase.from('outings').select().eq('id', id).single()
      setOuting(o)
      if (o) setJoinUrl(`${window.location.origin}/join/${o.share_code}`)
      await refresh()
      channel = supabase
        .channel(`lobby-${id}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'groups', filter: `outing_id=eq.${id}` },
          refresh)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'players', filter: `outing_id=eq.${id}` },
          refresh)
        .subscribe()
    }

    async function refresh() {
      const [{ data: g }, { data: p }] = await Promise.all([
        supabase.from('groups').select().eq('outing_id', id).order('created_at'),
        supabase.from('players').select().eq('outing_id', id).order('created_at'),
      ])
      setGroups(g ?? [])
      setPlayers(p ?? [])
    }

    load()
    return () => { if (channel) supabase.removeChannel(channel) }
  }, [id])

  if (!outing) return <main className="p-6">Loading…</main>

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">Lobby</h1>
      <div className="flex flex-col items-center gap-3 rounded-xl border p-4">
        {joinUrl && <QRCodeSVG value={joinUrl} size={200} />}
        <p className="text-3xl font-mono font-bold tracking-widest">{outing.share_code}</p>
        <p className="text-center text-sm text-gray-500">
          Scan to keep score for your group — or just watch
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Groups ({groups.length})</h2>
        {groups.length === 0 && (
          <p className="text-sm text-gray-500">Waiting for scorekeepers to join…</p>
        )}
        {groups.map((g) => (
          <div key={g.id} className="rounded-lg border p-3">
            <p className="font-semibold">{g.name}</p>
            <p className="text-sm text-gray-600">
              {players.filter((p) => p.group_id === g.id).map((p) => p.display_name).join(', ')}
            </p>
          </div>
        ))}
      </section>
    </main>
  )
}
```

- [ ] **Step 2: Verify in browser**

Open the lobby from Task 9's redirect. QR renders, share code shows. (Live updates verified end-to-end in Task 12.)

- [ ] **Step 3: Commit**

```bash
git add app/outing && git commit -m "feat: lobby with QR code and realtime group list"
```

---

### Task 11: Join flow — chooser, group creation, spectator stub

**Files:**
- Create: `app/join/[code]/page.tsx`
- Create: `app/join/[code]/keep-score/page.tsx`
- Create: `app/outing/[id]/watch/page.tsx`

- [ ] **Step 1: Write the chooser page**

```tsx
// app/join/[code]/page.tsx
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

  if (notFound) return <main className="p-6 text-center">No outing found for code {code}.</main>
  if (!outing) return <main className="p-6">Loading…</main>

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-center text-2xl font-bold">You’re invited ⛳</h1>
      <Link
        href={`/join/${code}/keep-score`}
        className="rounded-xl bg-green-700 py-4 text-center text-lg font-semibold text-white"
      >
        Keep score for my group
      </Link>
      <Link
        href={`/outing/${outing.id}/watch`}
        className="rounded-xl border py-4 text-center text-lg font-semibold"
      >
        Just watch
      </Link>
    </main>
  )
}
```

- [ ] **Step 2: Write the keep-score (group creation) page**

```tsx
// app/join/[code]/keep-score/page.tsx
'use client'
import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, ensureSession } from '@/src/lib/supabase'
import type { Outing } from '@/src/lib/types'

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

  if (!outing) return <main className="p-6">Loading…</main>

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">Your group</h1>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Group name (optional)</span>
        <input
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder="e.g. The Hackers"
          className="rounded-lg border px-3 py-2"
        />
      </label>

      <span className="text-sm font-medium">Players</span>
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
            className="w-full rounded-lg border px-3 py-2"
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
              className="w-20 rounded-lg border px-2 py-2 text-center"
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
          className="self-start text-sm font-semibold text-green-700"
        >
          + Add player
        </button>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        onClick={submit}
        disabled={busy || validNames.length === 0}
        className="rounded-xl bg-green-700 py-3 text-lg font-semibold text-white disabled:opacity-40"
      >
        {busy ? 'Joining…' : "We're in"}
      </button>
    </main>
  )
}
```

- [ ] **Step 3: Write the spectator stub**

```tsx
// app/outing/[id]/watch/page.tsx
'use client'
import { use, useEffect, useState } from 'react'
import { supabase, ensureSession } from '@/src/lib/supabase'
import type { Group, Outing, Player } from '@/src/lib/types'

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
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'groups', filter: `outing_id=eq.${id}` },
          refresh)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'players', filter: `outing_id=eq.${id}` },
          refresh)
        .subscribe()
    }

    load()
    return () => { if (channel) supabase.removeChannel(channel) }
  }, [id])

  if (!outing) return <main className="p-6">Loading…</main>

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">Leaderboard</h1>
      <p className="text-sm text-gray-500">
        Live scoring arrives in Phase 1 — here’s who’s playing:
      </p>
      {groups.map((g) => (
        <div key={g.id} className="rounded-lg border p-3">
          <p className="font-semibold">{g.name}</p>
          <p className="text-sm text-gray-600">
            {players.filter((p) => p.group_id === g.id).map((p) => p.display_name).join(', ')}
          </p>
        </div>
      ))}
    </main>
  )
}
```

- [ ] **Step 4: Verify in browser (two windows)**

Window A: lobby open. Window B (incognito): visit `/join/<CODE>` → Keep score → enter names → submit. Expected: group appears in Window A's lobby *without refresh*.

- [ ] **Step 5: Commit**

```bash
git add app/join app/outing && git commit -m "feat: join flow — chooser, group creation, spectator stub"
```

---

### Task 12: E2E smoke test (two contexts)

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/core-loop.spec.ts`

- [ ] **Step 1: Install Playwright**

```bash
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Write config**

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
  },
})
```

- [ ] **Step 3: Write the smoke test**

```ts
// e2e/core-loop.spec.ts
import { test, expect } from '@playwright/test'

test('create outing → scorekeeper joins → group appears live in lobby', async ({ browser }) => {
  // Organizer context
  const organizer = await browser.newContext()
  const orgPage = await organizer.newPage()
  await orgPage.goto('/create')
  await orgPage.getByLabel('Course name').fill('E2E Links')
  await orgPage.getByRole('button', { name: '9 holes' }).click()
  await orgPage.getByRole('button', { name: 'Create outing' }).click()
  await orgPage.waitForURL(/\/outing\/.+\/lobby/)
  const shareCode = (await orgPage.locator('p.font-mono').textContent())!.trim()
  expect(shareCode).toMatch(/^[A-Z2-9]{6}$/)

  // Scorekeeper context (separate anonymous session)
  const scorekeeper = await browser.newContext()
  const skPage = await scorekeeper.newPage()
  await skPage.goto(`/join/${shareCode}`)
  await skPage.getByRole('link', { name: 'Keep score for my group' }).click()
  await skPage.getByPlaceholder('e.g. The Hackers').fill('The Hackers')
  await skPage.getByPlaceholder('Player 1').fill('Alice')
  await skPage.getByPlaceholder('Player 2').fill('Bob')
  await skPage.getByRole('button', { name: "We're in" }).click()
  await skPage.waitForURL(/\/outing\/.+\/watch/)

  // Group appears in organizer lobby WITHOUT reload (realtime)
  await expect(orgPage.getByText('The Hackers')).toBeVisible({ timeout: 15_000 })
  await expect(orgPage.getByText('Alice, Bob')).toBeVisible()

  await organizer.close()
  await scorekeeper.close()
})
```

Note: form fields in Tasks 9/11 use `<label>` wrapping — if `getByLabel` fails, fall back to `getByPlaceholder`/role selectors as written above.

- [ ] **Step 4: Run it**

```bash
npx playwright test
```

Expected: 1 passed.

- [ ] **Step 5: Add script + commit**

Add `"e2e": "playwright test"` to package.json scripts.

```bash
git add -A && git commit -m "test: two-context E2E smoke of create/join/realtime loop"
```

---

### Task 13: Deploy to Vercel

**Files:**
- None (config lives in Vercel)

- [ ] **Step 1: Deploy**

Use the connected Vercel MCP (`deploy_to_vercel`) or:

```bash
npx vercel --prod
```

Set env vars `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` on the Vercel project (Production).

- [ ] **Step 2: Smoke-check production**

On a phone: create an outing, scan the lobby QR with the camera app on a second phone, join as scorekeeper, confirm the group appears on the first phone. This is Phase 0's definition of done ("shared outing visible on two devices").

- [ ] **Step 3: Commit any generated config**

```bash
git add -A && git commit -m "chore: vercel deployment config" --allow-empty
```

---

## Out of scope for this plan (next plans)

- **Phase 1:** GolfCourseAPI search + caching (server route handler holding the API key), score entry UI, stroke-play engine + countback (TDD pure functions), real leaderboard, results screen, `status` transitions UI.
- **Phase 2:** scramble engine, organizer group editing, claim flow UI for pre-made groups.
- **Phase 3:** proper-net allocation, auto-balance roster + snake draft, skins engine with carryover.
