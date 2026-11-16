# Forced to Wipe: design

Mode: **Operate**. A guild officer on a PC (1440px+), evening, scanning who is levelling, who keeps dying, who is geared. Scanability and sorting beat decoration; brand lives in precise details. Phone still works (cards and a bottom tab bar under 880px) but desktop is the primary surface.

## World
"War ledger": a Horde war-room roster. Warm blackened iron, ember red for everything interactive, brass reserved for records and rank one. Dense tabular data set in a condensed industrial face. No gradients on text, no coloured side-borders, no nested cards, no eyebrow labels, no section numbers, no hero-metric tiles.

## Tokens (already in css/base.css; use them, add new ones there only if essential)
- Surfaces: `--bg #100e0d`, `--surface #181513`, `--surface-2 #211d1a`, `--surface-3 #2a2521`, hairlines `--line #342e29`, `--line-strong #4a423b`.
- Text: `--text #efe7da`, `--muted #ada296`, `--faint #7d7368` (faint is for non-essential decoration only, below 4.5:1 on small text).
- Accent `--accent #ea5a2c` (ember): active sort, links, focus, primary button. `--on-accent` for text on it. `--brass #d1a64f`: records (#1 in a leaderboard/column best) only. Status: `--ok`, `--warn`, `--danger`.
- Heat ramp `--heat-0..4` for data-cell shading (0 lowest, 4 highest in the column). Class colours stay fills only (`--cls` via `[data-class]`), the class name is always text.
- Type: `--font-display` Big Shoulders Display 700/800, UPPERCASE for wordmark and section headings, tracking 0.02em, also for large numerals; `--font` IBM Plex Sans 400/500/600 for everything else, `font-variant-numeric: tabular-nums` on all numbers (set on body). Scale `--fs-xs` .. `--fs-4xl`.
- Radius 10px (`--radius`), 6px small. Depth = `--shadow` (offset + blur), hairlines for structure. One motion moment: on route change rows/blocks fade+rise 14px over 260ms with `--ease-out`, staggered 18ms per item (max 12 items), disabled by prefers-reduced-motion. Hover/focus transitions 120ms.
- Browser surfaces are already themed (selection, caret, scrollbars, focus ring); keep them.

## Shell (all views)
Desktop: one top bar, left wordmark (display face, uppercase, large) with a single muted line under it: "Horde . PvP . 13 members . Updated 5 min ago . data lags 20-40 min"; centre or right of it the nav as text tabs (Roster, Stats, Level-ups) with an ember underline on the active one; far right the Refresh button and a small "Export" menu (details/summary or three quiet links) for the CSV downloads. The bottom tab bar and the footer are phone-only (< 880px). Content width max 1360px, 32px gutters.

## Roster (desktop >= 880px): a sortable ledger, not cards
- Above the table one summary line in the display face, not tiles: "13 members . avg level 23.9 . top Jeezus Khryst Lv 35 . last level-up none yet", then a **class composition bar**: a single horizontal bar 12px tall split into segments per class (width = member count, fill = class colour) with the class names and counts printed below as text.
- Controls on one row: search, class, rank, activity (existing behaviours). Sorting is by clicking column headers (aria-sort, ember arrow, second click reverses); remove the "Sort:" select on desktop but keep it for phone.
- Columns: Member (class swatch, full name, then "Priest . Troll" muted on a second line), Lv (display-face numerals, right-aligned, default sort desc), iLvl (number plus a slim 4px meter scaled to the guild's top iLvl), Rank, Talents (main tree name+points bold, other trees muted), Professions (up to two chips "Tailoring 150/225" each with a 3px meter under it), Last seen (status dot + relative time, dot colours ok/warn/danger via the activity thresholds), Last level-up. Rows 56px, hairline separators, hover highlights the row with --surface-2, sticky header. Row click expands a detail strip (secondary skills, all stats links, "Full details" link) with aria-expanded; keyboard operable.
- Under 880px keep the existing card list (restyled with the new tokens). Render both and switch with CSS, or switch on matchMedia; do not duplicate logic.

## Stats: a heat matrix
- Top: one row of six **record holders**, not cards: label (muted), name (link) and value in display numerals, brass value. Most deaths, quests, dungeons, boss kills, honorable kills, best BG win rate (min 2 played).
- Main: ONE sortable matrix with grouped column headers (Deaths | Quests | Dungeons & bosses | PvP). Each numeric cell is shaded with the heat ramp by its rank within the column (quintiles, computed in JS, applied with classes `.h0`..`.h4`, no inline styles), the column best value is bold, ties share a class. No overlay bars (they misaligned). Per-level columns are the same treatment. A member without data shows an em dash and sinks when sorting. Sticky header and sticky first column under 1100px. Row hover draws a crosshair (row highlight + column header tint). Click a row to expand boss kills.
- Below: **Boss board** as a table, not cards: one row per boss grouped under dungeon sub-headers; columns Boss, Guild kills, then who (class-swatch dots with member first names and counts as text), sorted by instance total.

## Member page (desktop): two columns
- Left (sticky, 340px): identity block, name in display face at 3rem, class swatch, "Priest . Troll . Rank 1", status line, then Level as a huge display numeral (6rem max) with "levels gained 7d / 30d" beneath it as two small figures. No card boxes: a single hairline-bordered panel at most.
- Right: titled sections separated by space and hairlines (no nested cards): **Progress** (level-over-time chart; when under 2 history points show a one-line muted note, not a big dashed empty state), **Professions** (each skill as a row: name, value/max, 6px meter, secondary skills in a second group), **Talents** (each tree as a row with points and a meter), **Statistics** (a 4-column definition grid; every figure followed by a muted "#2 of 13" guild rank for that stat), **Boss kills** (compact table).
- Back link top-left "Roster".

## Level-ups
Feed grouped by day: a narrow date column on the left (display numerals for the day, muted month) and entries to its right, each "Name  32 -> 33" with the new level in display numerals and the class swatch; filter by member stays. Beside the feed on desktop a "Most levels gained (7 days)" ranked list with proportional text-labelled meters. Empty state: one calm paragraph, no dashed box, saying levelling is recorded from the first refresh and when the next one runs.

## Copy and states
Real labels, no filler. Every view keeps loading skeleton, empty, error-with-retry and the stale banner (restyled: warn colour text on --surface-2, a 1px warn border, not a thick left border). Buttons: primary = ember fill; secondary = hairline outline. Tap targets >= 44px under 880px. Contrast >= 4.5:1 for all text. All API strings via textContent. No inline styles or scripts (CSP). No new dependencies.
