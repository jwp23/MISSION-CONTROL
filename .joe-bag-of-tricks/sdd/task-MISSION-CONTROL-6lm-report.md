# Task MISSION-CONTROL-6lm — Report

## Problem
After the type-scale bump (base 14px), the session table's fixed pixel column widths
(set under `table-layout: fixed`) were too narrow for the numeric/date content at
that font size, causing ellipsis truncation of COST, TOKENS, TURNS, DURATION, and
the CREATED/LAST ACTIVE dates — worst at ~950px where COST (the highest-priority
value) truncated to "$36.…".

## Root cause
`public/styles.css` `.session-table` has `table-layout: fixed`, so column widths
are governed entirely by the explicit `width` on each `.col-*` rule, not by content.
The widths (col-date 120px, col-tokens 60px, col-cost 56px, col-duration 64px,
col-turns 44px) were sized for the old, smaller font and never revisited after the
14px base bump. Each of those `td` also inherited `overflow:hidden; text-overflow:
ellipsis; white-space:nowrap` from the base `.session-table td` rule, so the
overflow silently clipped instead of erroring or wrapping.

`formatDate` (public/app.js:29) itself was not the problem — it already returns the
full `YYYY-MM-DD HH:MM` string; the truncation was pure CSS width/overflow, confirmed
before editing.

## Changes

### public/styles.css (~lines 313-402)
For `col-date`, `col-tokens`, `col-cost`, `col-duration`, `col-turns`:
- Widened the fixed `width` to fit the true worst-case rendered content, measured
  live in the browser via Playwright (cloning each populated `td`/`th` off-screen
  and reading `getBoundingClientRect().width`) against the real dataset (309-618
  cells), then adding a safety margin:
  - `col-date`: 120px → 160px (worst case "2026-08-13 14:29" measured ~134px + 16px padding)
  - `col-tokens`: 60px → 80px (worst case "1919.6M" measured ~59px + padding)
  - `col-cost`: 56px → 88px (worst case "$94.19" measured ~50px + padding; given
    extra headroom since cost is the prio-1/must-never-truncate column and will
    grow over time)
  - `col-duration`: 64px → 80px (worst case "26h 57m" measured ~59px + padding)
  - `col-turns`: 44px → 64px (worst case "13126" measured ~42px + padding)
- Added a `td.col-*` override for each of those five columns setting
  `overflow: visible; text-overflow: clip; white-space: nowrap;`, removing the
  inherited ellipsis clipping now that the column is wide enough to hold its
  content. `col-summary` (and `col-project`) were left untouched — they keep
  `overflow:hidden; text-overflow:ellipsis` by design.

`table-layout: fixed` was left in place per the task's guidance (raise explicit
widths instead of switching layout modes, since `col-summary` needs to keep
absorbing the leftover space and shrink-to-fit tricks don't work under `fixed`).

### public/app.js
- Added a `title` field to the `created` and `lastActive` entries in the `COLUMNS`
  array (~line 610), each returning `new Date(ts).toLocaleString()`.
- Wired `c.title(s)` into the `<td title={...}>` attribute in `SessionTable`'s row
  render (~line 791), so both date cells now carry a full local date-time tooltip
  on hover regardless of column width.
- `formatDate` itself was not changed — verified its output already fits the
  widened column.

## Verification
Server was already running on port 9000 (reused, not restarted). Used Playwright
MCP against the live app with real session data (309-618 rows depending on
column).

Viewports tested: 1920, 1366, 1280, 950.

For each width, measured `scrollWidth` vs `clientWidth` on every visible
`col-date`/`col-tokens`/`col-cost`/`col-duration`/`col-turns` cell (this detects
actual content overflow regardless of the CSS `overflow` property) and checked
`document.body.scrollWidth` vs `window.innerWidth` for page-level horizontal
scroll:

| Width | Cells overflowing | Page horizontal scroll |
|-------|--------------------|-------------------------|
| 1920  | 0 / 0 / 0 / 0 / 0  | none (body 1920 = viewport 1920) |
| 1366  | 0 / 0 (duration/turns hidden by prio-3 media query) | none (body 1366 = viewport 1366) |
| 1280  | 0 / 0 (duration/turns hidden) | none (body 1280 = viewport 1280) |
| 950   | 0 (only col-date, col-cost visible; tokens/duration/turns hidden by prio-2/3) | none (body 950 = viewport 950) |

Screenshots (visual confirmation of full, untruncated values) saved to:
- `/tmp/claude-1000/-home-mordant23-workspace-jwp23-MISSION-CONTROL/ffa2d3b4-5b35-457a-8b60-2efef82b7ab2/scratchpad/table-1920.png`
- `/tmp/claude-1000/-home-mordant23-workspace-jwp23-MISSION-CONTROL/ffa2d3b4-5b35-457a-8b60-2efef82b7ab2/scratchpad/table-1366.png`
- `/tmp/claude-1000/-home-mordant23-workspace-jwp23-MISSION-CONTROL/ffa2d3b4-5b35-457a-8b60-2efef82b7ab2/scratchpad/table-1280.png`
- `/tmp/claude-1000/-home-mordant23-workspace-jwp23-MISSION-CONTROL/ffa2d3b4-5b35-457a-8b60-2efef82b7ab2/scratchpad/table-950.png`

At 1920: TOKENS "235.8M", COST "$94.62", DURATION "2h 15m", TURNS "1996", CREATED
"2026-08-13 14:29", LAST ACTIVE "2026-08-13 18:01" — all fully visible.
At 950: COST "$94.62" fully visible (the prio-1 requirement), CREATED date fully
visible; tokens/duration/turns/last-active correctly hidden by the existing
prio-2/prio-3 responsive rules (unchanged behavior).

Hover title confirmed via DOM query:
`document.querySelector('.session-table td.col-date[title]')` → present, e.g.
`title="8/13/2026, 2:29:13 PM"`.

Console: 1 pre-existing, unrelated `favicon.ico 404` warning/error at every
viewport; zero JS errors introduced by this change.

## Concerns / notes
- `col-cost` width (88px) was sized with headroom beyond today's measured max
  ("$94.19") since `formatCost` is unbounded (`n >= 100` just prints
  `n.toFixed(0)` with no cap) and cost is explicitly the never-truncate column —
  it will hold up to ~7-8 digit dollar amounts before truncating again. Not
  bulletproof against unbounded growth, but matches the task's directive to widen
  fixed columns rather than switch layout modes.
- Left `.beads/interactions.jsonl` (modified, pre-existing, unrelated to this
  task) and `.worktrees/` (untracked, pre-existing) alone — not part of this
  commit.
