# Multi-Machine Session Sources

How MISSION-CONTROL reads Claude Code sessions from more than one machine and
presents them as one dashboard. Decisions and rejected alternatives live in
ADR-001, ADR-002 and `context/decisions/beads-local-only.md`; this document
describes the design as it stands.

## Overview

Sessions come from a list of *sources*. Each source is one machine's
`projects/` directory in Claude Code's native layout. With agent-downlink
installed, the list has one entry per machine in its mirror, including this
machine. Without it, the list is the single local `~/.claude/projects` and the
machine dimension is absent from the UI.

```
~/.config/agent-downlink/config.toml ──▶ sources.js ──▶ [{machine, projectsDir}, …]
                                                              │
                     mirror/<machine>/claude-code/projects/<encoded>/*.jsonl
                                                              │
                                        scanner.discoverSessions(sources)
                                                              │
                              parsed sessions tagged {machine, projectKey}
                                                              │
                                  sessionCache ──▶ scopedSessions(query) ──▶ API
```

Data freshness equals the last agent-downlink run. Live-only concerns
(active-session PIDs, session restore) still read the local `~/.claude`.

## Sources (`server/sources.js`)

`resolveSources()` returns `[{ machine, projectsDir }]`.

1. If `~/.config/agent-downlink/config.toml` exists, parse it with
   `smol-toml`. Read `mirror` and `machine`; both must be strings.
2. Resolve `mirror` with `resolveWithin(os.homedir(), mirror)`.
3. For each subdirectory `<m>` of the mirror containing `claude-code/projects/`,
   emit `{ machine: m, projectsDir }`.
4. On any failure — missing keys, wrong type, path outside home, parse error,
   missing mirror, no machine folders — log one line and return the fallback.

Fallback and no-downlink: `[{ machine: null, projectsDir: ~/.claude/projects }]`.

`localMachine()` returns the config's `machine` when the mirror is in use,
otherwise `null`. It is computed per `/api/projects` request, like discovery
today, so a newly mirrored machine appears without a restart.

`historyIndex` becomes `Map<machine, index>`, built once per source at boot
from `<source root>/history.jsonl` when present. The mirror currently lacks
this file; if agent-downlink adds it, summaries and search improve
automatically.

## Scanning and project identity (`server/parser.js`, `server/scanner.js`)

The parser records the first `cwd` seen in a transcript as `session.cwd`.
Later values are ignored so a session that `cd`s into a subdirectory stays
with its launch directory.

`discoverSessions(sources)` replaces `discoverProjects()`. For each source it
lists every `projects/<encoded>/` directory, runs the existing
`listSessionFiles` and subagent merge, and tags each parsed session with
`machine` and `projectKey`. `resolveWithin` guards paths against the source's
`projectsDir` rather than a fixed `~/.claude/projects`. The cache key includes
the machine so identical session ids from two mirrors never collide;
`dedupeBySessionId` remains as a safety net for a transcript copied between
machines.

`projectKey(cwd)` is pure:

| cwd | key |
|-----|-----|
| `/home/u/workspace/jwp23/throwntom` | `workspace/jwp23/throwntom` |
| `/Users/u/workspace/jwp23/throwntom` | `workspace/jwp23/throwntom` |
| `/home/u/workspace/jwp23/x/.worktrees/feat` | `workspace/jwp23/x` |
| `/home/u/workspace/jwp23/x/.claude/worktrees/feat` | `workspace/jwp23/x` |
| `/home/u/workspace/jwp23/throwntom/swift-lint` | `workspace/jwp23/throwntom/swift-lint` |
| `/home/u` | `~` |
| `/home/u/.claude` | `.claude` |
| `/private/tmp/…`, `/tmp/…`, anything else | `(temp)` |

Home is detected by the `/home/<user>/` and `/Users/<user>/` prefixes, not
`os.homedir()`, because the other machine's home differs. `projectName` is the
key's last segment; when two keys share a basename the full key is shown.

`scanPath` no longer decides what is counted. It maps a project key to a local
checkout (`localPath`) for beads and restore and is otherwise optional.

## API (`server/index.js`)

Every listing or aggregating route takes `?project=<projectKey>`,
`?machine=<name>`, `?from=`, `?to=`. One helper, `scopedSessions(query)`,
applies dedupe → project → machine → range and replaces the per-route copies
of that chain.

| Route | Change |
|-------|--------|
| `GET /api/projects` | Runs discovery, groups by `projectKey`. Returns `{ key, name, sessionCount, aggregate, localPath }`. Accepts `?machine=`. |
| `GET /api/projects/:encodedPath/sessions` | Removed. The frontend uses `/api/sessions/all?project=`. |
| `GET /api/sessions/all`, `/api/stats`, `/api/daily-stats`, `/api/monthly-stats`, `/api/search` | Use `scopedSessions`. Rows gain `machine`, `projectKey`; `encodedPath`, `projectPath` are dropped. `projectCount` is distinct keys in scope. |
| `GET /api/machines` | New. `[{ machine, sessionCount, aggregate }]` for the current project and range. `[]` with a single unnamed source. |
| `GET /api/beads` | Matches `?project=` via `localPath`. Response gains `machine: localMachine()`. |
| `GET /api/wip`, `PUT …/status`, `PUT …/summary`, `POST /api/restore/:id`, `GET /api/active` | Unchanged. Overrides key on session id, which is a UUID. |

`?project=` carries a project key, not an encoded path. No compatibility
shim for the old parameter.

## Frontend (`public/app.js`)

- `selectedMachine` (null = all) joins `selectedProject` and `timeRange` as
  scope state. One `scopeQS()` builds the query string for every fetch.
- **Machine picker**: a `<select>` in the top bar, "All machines" plus each
  entry from `/api/machines`. Rendered only when that list is non-empty.
  Changing it clears search results and refetches everything.
- **Sidebar**: keyed on `p.key`, shows `p.name`, refetches with `?machine=`.
  The active dot compares against `p.localPath`.
- **Session table**: a `Machine` column (prio 3, collapses first) when
  machines exist. LAUNCH renders only when `s.machine` is the local machine
  or null and the project has a `localPath`; restore receives `localPath`.
- **Rollup**: a `By Machine` block after `Time` — sessions, tokens, subagents,
  cost per machine for the current project and range, hidden when empty,
  always listing every machine.
- **$/bead**: with `beads.machine` set, label `$/Bead (this machine)`,
  tooltip "Spend on this machine ÷ beads closed in the local checkout",
  numerator from `/api/stats?machine=<beads.machine>`. With machines present
  but `beads.machine` null, renders `—`. Single-source: unchanged.

No new CSS beyond the column width.

## Single-machine behaviour

`/api/machines` returns `[]`, so no machine UI renders and `?machine=` is
never sent. Every session has `machine: null`; `$/bead` uses total spend with
no label change; LAUNCH shows on every row with a `localPath`. Totals rise on
upgrade because worktree sessions and sessions outside `scanPath` now count,
and a checkout with no sessions no longer appears in the sidebar.

## Error handling

- Downlink config problems degrade to the local source with one log line.
- A transcript that fails to parse is logged and skipped, as today.
- A partial trailing line in a mid-sync transcript is tolerated by the parser
  (verified: 3,205 mirror files parsed with zero failures).
- Beads and restore silently do not apply when a project has no `localPath`.

## Performance

Full parse of the current mirror (1.5 GB, 3,205 files) measured 5.6 s and
~300 MB RSS with the existing parser. The mtime-keyed cache makes later
requests cheap. No index or database.

## Testing

Server: unit tests for `resolveSources` (present, absent, malformed, outside
home, empty mirror), `projectKey` (the table above), `scopedSessions`
(filter composition), `/api/machines` shape, and `/api/beads` machine
labelling.

Frontend has no test harness. Acceptance is a headless Playwright pass at
fixed viewports against the real mirror: picker shows two machines;
`throwntom` appears once in the sidebar; By Machine sums equal the headline
total; selecting a machine re-scopes sidebar, table and rollup; a run with
no downlink config shows no machine UI.
