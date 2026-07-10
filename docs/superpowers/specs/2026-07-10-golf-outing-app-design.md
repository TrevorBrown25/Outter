# Golf Outing Organizer + Live Leaderboard — v1 Design

> A phone-first PWA for organizing a group golf round and tracking scores live. One scorekeeper per group scans a QR code and keeps the card; everyone else watches the leaderboard live. No paper card, no doing math on the 18th green.

This design consolidates the original product spec with decisions made during brainstorming (2026-07-10, revised same day for the QR/scorekeeper join model). Where this doc differs from the original spec, this doc wins.

---

## 1. Decisions

| Decision | Choice |
|---|---|
| Join model | **QR code / link, scorekeepers only.** One scorekeeper per playing group scans the outing QR, enters an optional group name + player names. Players are roster entries, not users — no per-player accounts or devices |
| Spectators | Same QR offers a **read-only live leaderboard** path for everyone else — no name entry, no signup |
| Account model | Anonymous Supabase sessions for organizer + scorekeeper devices; optional account upgrade later (Phase 4) |
| Formats | Base format `stroke` or `scramble`, plus optional **Skins side game** toggle (not a third standalone format) |
| Groups = teams | One concept: a **group** is the score-keeping unit AND the team (scramble/team play). No separate teams table |
| Handicaps | Per-outing mode: None / Manual / Manual + Auto-balance. **Proper net** (per-hole stroke allocation by stroke index); simple-net fallback when stroke index is unavailable |
| Auto-balance flow | Organizer pre-enters the full roster (names + handicaps) in the lobby; app deals balanced groups via snake draft; scorekeepers **claim** their pre-made group at scan time. Manual/none modes use type-names-at-scan |
| Course data | **GolfCourseAPI** (golfcourseapi.com) with permanent DB caching + **manual entry fallback** |
| Tees | Organizer picks **one tee set per outing**; par/stroke-index snapshotted onto the outing |
| Hole counts | Both **9 and 18** supported from launch |
| Platform | **PWA** — Next.js (App Router, TypeScript, Tailwind) on Vercel; Supabase cloud (Postgres, anonymous auth, Realtime). QR codes are just join URLs — phone cameras scan them natively, no in-app scanner or native app needed |
| Build scope | Phases 0–3 (Phase 4 polish deferred until the core survives a real round) |
| Conventions | Supabase-idiomatic schema (real FKs, RLS). The user's Kotlin/Micronaut database rules do NOT apply to this project |

---

## 2. Core loop

1. Organizer creates an outing — picks course (API search or manual), tee set, date, format, skins toggle, handicap mode.
2. Lobby shows a **QR code** (and share link / 6-char code) for the outing.
3. Each group's scorekeeper scans it, taps **"Keep score for my group,"** and either:
   - types an optional group name + their players' names (+ handicaps in manual mode), or
   - **claims a pre-made group** (auto-balance mode, roster pre-entered by the organizer).
4. Everyone else who scans lands on the **live leaderboard, read-only**.
5. Game day: scorekeepers enter their group's scores hole-by-hole; all screens update live via Supabase Realtime.
6. Round ends: app settles results (winner, skins won, net/gross); organizer finalizes.

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
  share_code    text unique        -- 6-char join code; QR encodes the join URL containing it
  created_at    timestamptz

groups          -- the score-keeping unit AND the team
  id                  uuid pk
  outing_id           uuid fk -> outings
  name                text                -- "Group 1" default, or scorekeeper/organizer-chosen
  scorekeeper_user_id uuid null           -- anon auth.uid() of the device keeping score;
                                          -- null until claimed (auto-balance pre-made groups)
  created_at          timestamptz

players         -- roster entries, NOT users
  id            uuid pk
  outing_id     uuid fk -> outings
  group_id      uuid fk -> groups
  display_name  text
  handicap_index numeric null
  created_at    timestamptz

scores
  id            uuid pk
  outing_id     uuid fk -> outings  -- denormalized for realtime filter + RLS
  hole_number   int
  strokes       int
  player_id     uuid null fk -> players  -- set for stroke format
  group_id      uuid null fk -> groups   -- set for scramble format
  entered_by    uuid                      -- auth.uid() of writer
  updated_at    timestamptz
  unique nulls not distinct (outing_id, hole_number, player_id, group_id)

profiles      -- Phase 4; only for organizers/scorekeepers who upgrade to accounts
```

**Realtime filter key:** every score row carries `outing_id` so clients subscribe to exactly their outing's changes.

### RLS sketch

- **Outing access via RPC:** `get_outing(share_code)` resolves a code to the outing for anyone with the code (spectators included); codes can't be enumerated by table scans. Organizer-only writes on `outings`.
- **Groups:** readable within the outing. Created by any authenticated (anon) session holding the share code — via `create_group(share_code, name?, players[])` RPC which also inserts the roster and sets `scorekeeper_user_id = auth.uid()`. Claiming a pre-made group: `claim_group(group_id)` sets `scorekeeper_user_id` if currently null. Organizer can rename/reassign/delete any group.
- **Players:** readable within the outing; insert/update by their group's scorekeeper or the organizer.
- **Scores:** readable within the outing (spectators read too). Writable only if the caller is the organizer, or is the scorekeeper of the group that the score's `player_id`/`group_id` belongs to. Writes rejected when `outings.status = 'final'`.
- **Spectators:** need only an anonymous session + share code; all their policies are read-only.

---

## 5. Scoring engine

Pure TypeScript functions — no DB access, same inputs → same leaderboard. Built TDD. Portable to a future native app.

```ts
interface ScoringFormat {
  computeLeaderboard(input: {
    players: Player[];
    groups: Group[];
    scores: Score[];
    par: number[];
    strokeIndex: number[] | null;
    handicapMode: HandicapMode;
  }): LeaderboardRow[];
}
```

- **Stroke play** — sum strokes per player; gross + net columns when handicaps are on. Ties broken by countback: back-9/back-6/back-3 (18 holes) or back-3/back-2/back-1 (9 holes).
- **Scramble** — one score per group per hole; sum group strokes. Gross only in v1 (team handicap % allocation flagged as a later config).
- **Skins (side game)** — computed from the same per-hole scores as the base format (player scores for stroke, group scores for scramble). Lowest score on a hole wins the skin; ties carry the pot to the next hole. With handicaps on, uses **net per-hole** scores (requires proper net). Rendered as a second leaderboard tab.

### Proper net (per-hole stroke allocation)

- Playing handicap `h` (rounded handicap index for v1), stroke index `SI[hole] ∈ 1..n`:
  - hole receives `floor(h / n) + (SI[hole] <= h % n ? 1 : 0)` strokes.
  - Works for 9- and 18-hole rounds and handicaps > n.
- **Fallback:** if the outing's `stroke_index_snapshot` is null (manual course without SI), use simple net (subtract full handicap from total) and label the leaderboard "simple net". Skins with handicaps requires stroke index; otherwise skins runs gross with a UI note.

### Group auto-balancer (`handicap_mode = 'auto'`)

- Organizer pre-enters the full roster (names + handicap indexes) in the lobby.
- Snake draft: sort players by handicap, deal into N groups 1‑2‑3‑3‑2‑1. Deterministic and explainable. Organizer can drag players between groups to override.
- Pre-made groups start with `scorekeeper_user_id = null`; on game day each group's scorekeeper scans the QR and claims their group from the unclaimed list.

---

## 6. Realtime & offline

- Supabase Realtime `postgres_changes` subscription on `scores` filtered by `outing_id`; also on `groups`/`players` (lobby formation) during setup.
- Any score write → all clients (scorekeepers and spectators) receive the row → recompute leaderboard locally via the pure scoring functions.
- Optimistic UI: the writing scorekeeper sees their entry instantly; realtime reconciles. Last-write-wins on the unique constraint.
- Full offline write queue is Phase 4; v1 relies on optimistic UI + retry-on-error.

---

## 7. Auth & identity

- Organizer and scorekeeper devices: Supabase **anonymous sign-in** — a real session with zero friction, so the device is remembered (a scorekeeper who reopens the tab still owns their group) and score writes are attributable via `entered_by`.
- Spectators: anonymous session too (needed for RLS reads/realtime), but no identity captured beyond that.
- Players are roster entries only — they have no sessions and no accounts.
- Account upgrade (email/OAuth link, outing history) is Phase 4 and applies to organizers/scorekeepers.

---

## 8. Screen flow (phone-first)

1. **Landing** — "Create outing" / "Join with code."
2. **Create outing** (organizer) — course search (API + cached) or manual add, tee pick, date, format, skins toggle, handicap mode. Auto-balance mode adds a roster-entry step (names + handicaps → snake-drafted groups, drag to override).
3. **Lobby** (organizer) — big QR code + share link/code; groups appear live as scorekeepers join; organizer can rename/edit groups and start the round.
4. **Join** (from QR/link) — two buttons: **"Keep score for my group"** (create group: optional name + player names; or claim a pre-made group in auto mode) and **"Just watch"** (straight to leaderboard).
5. **Live round** (scorekeeper) — big tappable score entry for the current hole for each player in their group (one score per hole in scramble), swipe between holes; leaderboard (+ skins tab) one tab away.
6. **Leaderboard** (spectator) — live leaderboard + skins tab, read-only.
7. **Results** — final leaderboard, skins settled, organizer finalizes the round.

---

## 9. Build phases (scope: 0–3)

- **Phase 0 — skeleton:** Next.js + Supabase projects, schema + RLS, anonymous auth, create-outing → QR/code join → group creation → shared outing visible on two devices.
- **Phase 1 — stroke play, live:** course search/cache/manual entry, scorekeeper score entry UI, spectator leaderboard, realtime updates, stroke-play engine, countback ties, results screen. *Shippable.*
- **Phase 2 — scramble + group management:** scramble engine (one score per group), organizer group editing, group claim flow.
- **Phase 3 — skins + handicaps:** proper-net allocation, manual handicap input, auto-balance roster + snake draft, skins engine with carryover (gross + net), simple-net fallback.

**Deferred (Phase 4 / backlog):** history + stats, account upgrade flow, offline write queue, shareable recap, ads, more formats (Best Ball, Stableford, Nassau, Match Play), native app.

---

## 10. Testing

- Scoring engines (stroke, scramble, skins, net allocation, countback, snake draft): pure-function unit tests, TDD, including 9-hole variants, carryover chains, and handicap > hole-count cases.
- RLS: integration tests against a local/branch Supabase instance for the permission matrix (organizer / group's scorekeeper / other group's scorekeeper / spectator / finalized outing), plus group-claim races (two devices claiming the same group).
- Core loop: Playwright E2E — create → scorekeeper joins in second context and enters group + scores → spectator context sees live leaderboard updates.
