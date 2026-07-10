# Golf Outing Organizer + Live Leaderboard — v1 Design

> A phone-first PWA for organizing a group golf round and tracking scores live on everyone's phone. No paper card, no doing math on the 18th green.

This design consolidates the original product spec with decisions made during brainstorming (2026-07-10). Where this doc differs from the original spec, this doc wins.

---

## 1. Decisions

| Decision | Choice |
|---|---|
| Account model | Hybrid — anonymous join via Supabase anonymous auth, optional account upgrade later (upgrade flow deferred to Phase 4) |
| Formats | Base format `stroke` or `scramble`, plus optional **Skins side game** toggle (not a third standalone format) |
| Handicaps | Per-outing mode: None / Manual / Manual + Auto-balance. **Proper net** (per-hole stroke allocation by stroke index); simple-net fallback when stroke index is unavailable |
| Course data | **GolfCourseAPI** (golfcourseapi.com) with permanent DB caching + **manual entry fallback** |
| Tees | Organizer picks **one tee set per outing**; par/stroke-index snapshotted onto the outing |
| Score entry | Players enter **their own** scores; organizer can promote **scorekeepers** who can enter/edit anyone's |
| Hole counts | Both **9 and 18** supported from launch |
| Platform | PWA — Next.js (App Router, TypeScript, Tailwind) on Vercel; Supabase cloud (Postgres, anonymous auth, Realtime) |
| Build scope | Phases 0–3 (Phase 4 polish deferred until the core survives a real round) |
| Conventions | Supabase-idiomatic schema (real FKs, RLS). The user's Kotlin/Micronaut database rules do NOT apply to this project |

---

## 2. Core loop

1. Organizer creates an outing — picks course (API search or manual), tee set, date, format, skins toggle, handicap mode.
2. Shares a join link / 6-char code. Players tap it, type their name, they're in. No signup.
3. (Optional) App balances teams by handicap if auto-balance mode is on; organizer can override.
4. Game day: players enter scores hole-by-hole on their own phone; scorekeepers can enter for anyone.
5. Leaderboard updates live for the whole group via Supabase Realtime.
6. Round ends: app settles results (winner, skins won, net/gross), organizer finalizes.

---

## 3. Course data flow

- **Search:** organizer's course picker queries GolfCourseAPI (free tier: 50 req/day; Pro $9.99/mo if outgrown). Search results are fetched server-side (API key stays secret).
- **Cache:** every course fetched from the API is stored permanently in `courses` + `course_tees`. Cached courses are searched first; the API is only hit for new lookups. Gameplay never touches the API.
- **Manual fallback:** organizer can hand-enter a course (name, hole count, par per hole, optional stroke index per hole) when the API lacks it or quota is exhausted. Manual courses are saved and reusable.
- **Snapshot:** at outing creation, the selected tee's `par[]` and `stroke_index[]` arrays are copied onto the outing row, so course edits can never corrupt a live or historical round.

---

## 4. Data model (Postgres / Supabase)

```
courses
  id            uuid pk
  external_id   text null unique   -- GolfCourseAPI id; null for manual courses
  name          text
  city          text null
  state         text null
  num_holes     int                -- 9 or 18
  created_by    uuid null          -- organizer who added it (manual courses)
  created_at    timestamptz

course_tees
  id            uuid pk
  course_id     uuid fk -> courses
  name          text               -- "White", "Blue", ...
  gender        text null          -- from API tee data
  yardage       int null
  par           int[]              -- per hole
  stroke_index  int[] null         -- per hole, 1..n; null if unknown (manual entry)

outings
  id            uuid pk
  organizer_id  uuid               -- auth.uid() of creator (anonymous or real)
  course_id     uuid fk -> courses
  tee_id        uuid fk -> course_tees
  par_snapshot  int[]              -- copied from tee at creation
  stroke_index_snapshot int[] null -- copied from tee at creation
  play_date     date
  format        enum('stroke','scramble')
  skins_enabled boolean default false
  handicap_mode enum('none','manual','auto')
  status        enum('setup','live','final')
  share_code    text unique        -- 6-char join code
  created_at    timestamptz

players
  id            uuid pk
  outing_id     uuid fk -> outings
  user_id       uuid               -- auth.uid() (anonymous session or real account)
  display_name  text
  handicap_index numeric null
  team_id       uuid null fk -> teams
  is_scorekeeper boolean default false  -- organizer is implicitly a scorekeeper
  joined_at     timestamptz
  unique(outing_id, user_id)

teams
  id            uuid pk
  outing_id     uuid fk -> outings
  name          text

scores
  id            uuid pk
  outing_id     uuid fk -> outings  -- denormalized for realtime filter + RLS
  hole_number   int
  strokes       int
  player_id     uuid null fk -> players  -- set for stroke format
  team_id       uuid null fk -> teams    -- set for scramble format
  entered_by    uuid                      -- auth.uid() of writer
  updated_at    timestamptz
  unique nulls not distinct (outing_id, hole_number, player_id, team_id)

profiles      -- Phase 4; only for users who upgrade to accounts
```

**Realtime filter key:** every score row carries `outing_id` so clients subscribe to exactly their outing's changes.

### RLS sketch

- `outings`: readable by its players (or by share code lookup via an RPC); writable by organizer only.
- `players`: readable within the outing; a user can insert/update their own row; organizer can update any (teams, scorekeeper promotion).
- `scores`: readable within the outing; writable if the score's `player_id` maps to the caller's own player row, OR the caller's player row has `is_scorekeeper = true` (or is the organizer). Scramble team scores writable by any member of that team or a scorekeeper.
- Writes rejected when `outings.status = 'final'`.
- Join-by-code is an RPC (`join_outing(share_code, display_name, handicap_index?)`) so codes can't be enumerated by table scans.

---

## 5. Scoring engine

Pure TypeScript functions — no DB access, same inputs → same leaderboard. Built TDD. Portable to a future native app.

```ts
interface ScoringFormat {
  computeLeaderboard(input: {
    players: Player[];
    teams: Team[];
    scores: Score[];
    par: number[];
    strokeIndex: number[] | null;
    handicapMode: HandicapMode;
  }): LeaderboardRow[];
}
```

- **Stroke play** — sum strokes per player; gross + net columns when handicaps are on. Ties broken by countback: back-9/back-6/back-3 (18 holes) or back-3/back-2/back-1 (9 holes).
- **Scramble** — one score per team per hole; sum team strokes. Gross only in v1 (team handicap % allocation flagged as a later config).
- **Skins (side game)** — computed from the same per-hole scores as the base format (player scores for stroke, team scores for scramble). Lowest score on a hole wins the skin; ties carry the pot to the next hole. With handicaps on, uses **net per-hole** scores (requires proper net). Rendered as a second leaderboard tab.

### Proper net (per-hole stroke allocation)

- Playing handicap `h` (rounded handicap index for v1), stroke index `SI[hole] ∈ 1..n`:
  - hole receives `floor(h / n) + (SI[hole] <= h % n ? 1 : 0)` strokes.
  - Works for 9- and 18-hole rounds and handicaps > n.
- **Fallback:** if the outing's `stroke_index_snapshot` is null (manual course without SI), use simple net (subtract full handicap from total) and label the leaderboard "simple net". Skins with handicaps requires stroke index; otherwise skins runs gross with a UI note.

### Team auto-balancer (`handicap_mode = 'auto'`)

Snake draft: sort players by handicap, deal into N teams 1‑2‑3‑3‑2‑1. Deterministic and explainable. Organizer can manually override any assignment in the lobby.

---

## 6. Realtime & offline

- Supabase Realtime `postgres_changes` subscription on `scores` filtered by `outing_id`; also on `players` (lobby joins) during setup.
- Any score write → all clients receive the row → recompute leaderboard locally via the pure scoring functions.
- Optimistic UI: writer sees their entry instantly; realtime reconciles. Last-write-wins on the unique constraint.
- Full offline write queue is Phase 4; v1 relies on optimistic UI + retry-on-error.

---

## 7. Auth & identity

- Joiners and organizers: Supabase **anonymous sign-in** — a real session with zero friction, so devices remember players and scores are attributable via `user_id`.
- Account upgrade (email/OAuth link, history carry-over) is Phase 4 — schema (`user_id` on players) supports it from day one.

---

## 8. Screen flow (phone-first)

1. **Landing** — "Create outing" / "Join with code."
2. **Create outing** — course search (API + cached) or manual add, tee pick, date, format, skins toggle, handicap mode.
3. **Lobby** — share link/code, players join live, organizer sets/auto-balances teams and promotes scorekeepers.
4. **Live round** — big tappable score entry for the current hole, swipe between holes; scorekeepers get a player switcher; leaderboard (+ skins tab) one tab away.
5. **Results** — final leaderboard, skins settled, organizer finalizes the round.

---

## 9. Build phases (scope: 0–3)

- **Phase 0 — skeleton:** Next.js + Supabase projects, schema + RLS, anonymous auth, create-outing → join-by-code → shared outing visible on two devices.
- **Phase 1 — stroke play, live:** course search/cache/manual entry, score entry UI, realtime leaderboard, stroke-play engine, countback ties, results screen. *Shippable.*
- **Phase 2 — teams + scramble:** teams, manual assignment, scorekeeper roles, scramble engine, snake-draft auto-balancer.
- **Phase 3 — skins + handicaps:** proper-net allocation, manual handicap input, skins engine with carryover (gross + net), simple-net fallback.

**Deferred (Phase 4 / backlog):** history + stats, account upgrade flow, offline write queue, shareable recap, ads, more formats (Best Ball, Stableford, Nassau, Match Play), native app.

---

## 10. Testing

- Scoring engines (stroke, scramble, skins, net allocation, countback, snake draft): pure-function unit tests, TDD, including 9-hole variants, carryover chains, and handicap > hole-count cases.
- RLS: integration tests against a local/branch Supabase instance for the score-write permission matrix (own score / scorekeeper / stranger / finalized outing).
- Core loop: Playwright E2E — create → join on second context → enter scores → both leaderboards update.
