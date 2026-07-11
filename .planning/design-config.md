# Outter — Design Config (source of truth)

> Masters-inspired heritage identity. Approved 2026-07-11 from the visual identity study.
> Every UI task MUST read this before writing components. These tokens are BINDING —
> do not substitute Tailwind defaults (bg-green-500 etc.) or generic fonts.
> Reference mockup: https://claude.ai/code/artifact/9430c990-3009-4155-9b34-92e7e6184093

## Personality

Heritage golf-club, pitched phone-first. Calm, refined, uncluttered — a clubhouse
leaderboard in every pocket. Restraint over decoration. Inspired by the Masters visual
language, but NOT a clone: no Augusta references, no green-jacket/map logo, no borrowed
taglines. Committed single-theme (parchment world) — no dark mode in v1 by design.

## Color tokens

| Token | Hex | Usage |
|-------|-----|-------|
| `--pine` | `#0E4429` | Primary brand green — buttons, headers, board panels |
| `--pine-deep` | `#08301D` | Darkest green — phone frame, table sub-headers, pot bar |
| `--parchment` | `#F3EEDD` | Page background (warm cream) |
| `--parch-2` | `#EAE2CB` | Hairline borders, row dividers on parchment |
| `--cream` | `#FBF8EF` | Text/fills on green; input surfaces on parchment |
| `--gold` | `#C6A15B` | Accent — rules, active-tab underline, eyebrows |
| `--gold-soft` | `#D8BE86` | Gold text on dark green (labels, meta) |
| `--red` | `#A6231E` | **Under-par scores only** (scoreboard convention) |
| `--ink` | `#16241B` | Primary text on parchment; even-par scores |
| `--sage` | `#6E7A6B` | Muted text, over-par scores, secondary labels |

Neutrals are green-biased on purpose (sage, ink) — never pure gray/black.

## Score color convention (critical, reused everywhere)

Score relative to par:
- **Under par → `--red`** (e.g. `−4`, `−2`)
- **Even par → `--ink`** (`E`)
- **Over par → `--sage`** (e.g. `+1`, `+3`)

This is the signature detail. It applies to the leaderboard "to par" column, score-entry
"to par" readout, and any future stat display.

## Typography

- **Display / voice** — `Georgia, "Times New Roman", serif`. Used for: wordmark, screen
  headings, ALL numerals (leaderboard scores, score-entry value, share-code digits).
  Weight 400 (Georgia carries weight without going bold). No webfont — never fails to load.
- **Interface / body** — `system-ui, -apple-system, "Segoe UI", sans-serif`. Labels,
  buttons, body copy, chips.
- **Numerals** — always `font-variant-numeric: tabular-nums` so scorecard columns align.
- Uppercase labels get `letter-spacing: .12em–.16em`. Wordmark uses `.42em` letter-spacing.
- Sentence case for copy; UPPERCASE reserved for small eyebrow/label text.

## Component patterns

- **Primary button** — `--pine` bg, `--cream` text, `border-radius:13px`, ~15px padding,
  weight 500. One primary per screen.
- **Secondary button** — transparent, `1.5px solid --pine` border, `--pine` text.
- **Green header panel** — `--pine` bg, `--cream` title (Georgia), `--gold-soft` uppercase
  meta line beneath.
- **Tabs** — uppercase, letter-spaced; active tab gets a 2px `--gold` bottom border and
  `--cream` text; inactive `rgba(cream,.55)`.
- **Leaderboard row** — grid `[pos] [player] [thru] [par]`; Georgia numerals for pos & par;
  player name in `--ink` with `--sage` group name beneath; leader row tinted `#EDE5CE`;
  1px `--parch-2` divider.
- **Score stepper** — 58px circular −/+ buttons (`1.5px --pine` border, `--cream` fill,
  Georgia glyphs), giant Georgia value (~66px) between them. Big tap targets for sun/gloves.
- **Share-code digit box** — `--cream` fill, `1px --parch-2` sides, `2px --gold` bottom
  border, Georgia digit in `--pine`.
- **Corners** — 13px on buttons/inputs, 30–38px on phone/screen frames, 6–10px on chips/swatches.
- **Elevation** — one soft shadow on the phone frame only; surfaces are otherwise flat
  (no gradients, no shadows on buttons/cards).

## Copy voice

Clubby but plain. "Organize the round. Track every stroke. Settle the skins." Active voice,
verb-first buttons ("Create an outing", "Join with code", "Save · next hole"). No exclamation
marks in system copy. Sentence case.
