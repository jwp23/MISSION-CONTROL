# Multi-Machine Session Sources

How MISSION-CONTROL reads Claude Code sessions from more than one machine,
and Cowork sessions from the Claude Desktop app, and presents them as one
dashboard. Decisions and rejected alternatives live in ADR-001, ADR-002,
ADR-003 and `context/decisions/beads-local-only.md`; this document describes
the design as it stands.

## Overview

Sessions come from a list of *sources*. A source is either one machine's
`projects/` directory in Claude Code's native layout, or this machine's
Claude Desktop Cowork directory. With agent-downlink installed, the list has
one entry per machine in its mirror, including this machine. Without it, the
list is the single local `~/.claude/projects` and the machine dimension is
absent from the UI. When the Cowork directory exists, one Cowork source is
appended in either case.

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

```
~/Library/Application Support/Claude/local-agent-mode-sessions/
  <account>/<org>/local_<id>-….json          title, folders, cliSessionId
  <account>/<org>/<id>/.claude/projects/session/<uuid>.jsonl
                                              │
                            scanner.discoverCoworkSessions(source)
                                              │
              parsed sessions tagged {source: 'cowork', machine, projectKey}
```

Data freshness equals the last agent-downlink run. Live-only concerns
(active-session PIDs, session restore) still read the local `~/.claude`.
Cowork transcripts are read live from the Desktop app's directory.

## Sources (`server/sources.js`)

`resolveSources()` returns `{ sources: [{ kind?, machine, projectsDir }], localMachine }`.

1. If `~/.config/agent-downlink/config.toml` exists, parse it with
   `smol-toml`. Read `mirror` and `machine`; both must be strings.
2. Resolve `mirror` with `resolveWithin(os.homedir(), mirror)`.
3. For each subdirectory `<m>` of the mirror containing `claude-code/projects/`,
   emit `{ machine: m, projectsDir }`.
4. On any failure — missing keys, wrong type, path outside home, parse error,
   missing mirror, no machine folders — log one line and return the fallback.

Fallback and no-downlink: `[{ machine: null, projectsDir: ~/.claude/projects }]`.

5. If `~/Library/Application Support/Claude/local-agent-mode-sessions` exists
   (`opts.coworkDir` in tests), append
   `{ kind: 'cowork', machine: localMachine, projectsDir: <that dir> }`.
   This runs after the fallback too, so a broken downlink config still
   yields local plus Cowork. Claude Code sources carry no `kind`.

`localMachine` is the config's `machine` when the mirror is in use, otherwise
`null`. Resolution runs per `/api/projects` request, like discovery today, so
a newly mirrored machine appears without a restart.

`historyIndex` becomes `Map<machine, index>`, built once per source at boot
from `<source root>/history.jsonl` when present. The mirror currently lacks
this file; if agent-downlink adds it, summaries and search improve
automatically.

## Scanning and project identity (`server/parser.js`, `server/scanner.js`)

The parser records the first `cwd` seen in a transcript as `session.cwd`.
Later values are ignored so a session that `cd`s into a subdirectory stays
with its launch directory.

`discoverSessions(sources)` replaces `discoverProjects()`. For each Claude
Code source it lists every `projects/<encoded>/` directory, runs the existing
`listSessionFiles` and subagent merge, and tags each parsed session with
`machine` and `projectKey`. A source with `kind: 'cowork'` is routed to
`discoverCoworkSessions` instead (below). `resolveWithin` guards paths against the source's
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

| Cowork session, no attached folder | `(cowork)` |

Home is detected by the `/home/<user>/` and `/Users/<user>/` prefixes, not
`os.homedir()`, because the other machine's home differs. `projectName` is the
key's last segment; when two keys share a basename the full key is shown.

`localPath(key)` is `~/<key>` when that directory exists on this machine; beads
and restore need it. It is null for `(temp)` and `(cowork)`. `scanPath` is removed from `config.json` (a breaking
config change); a leftover key is ignored.

## Cowork sessions (`server/scanner.js`)

`discoverCoworkSessions(source)` walks `<projectsDir>/<account>/<org>/` and,
for each `local_*.json` it can parse, builds a project descriptor whose
`sessionsDir` is `<org>/<id>/.claude/projects/session` where `<id>` is the
first eight characters of the file's `sessionId` after the `local_` prefix.
That descriptor goes through the same `getProjectSessions` path as a Claude
Code project, so parsing, subagent merge and the mtime cache are shared.
Each parsed session is then overlaid with the metadata:

| Field | Value |
|-------|-------|
| `source` | `'cowork'` |
| `sessionName` | transcript name if present, else `meta.title` |
| `cwd` | `meta.userSelectedFolders[0]`, or null |
| `projectKey` | `projectKey(cwd)`, or `(cowork)` when there is no folder |

The transcript's own `cwd` is the VM's `/private/var/empty` and is never
used. A metadata file that is missing, unparsable or lacks a string
`sessionId` skips that session with one log line. A metadata file whose
transcript folder does not exist yields nothing. The `machine` tag is the
source's, so machine filtering and the By Machine rollup include Cowork
sessions on the machine they ran on. Session ids are UUIDs, so
`dedupeBySessionId` needs no change.

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
| `POST /api/restore/:id` | Returns 400 `Cowork sessions cannot be resumed from the dashboard` when the cached session's `source` is `cowork`. |
| `GET /api/wip`, `PUT …/status`, `PUT …/summary`, `GET /api/active` | Unchanged. Overrides key on session id, which is a UUID. |

Session rows gain `source` (`'cowork'` or undefined).

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
  or null, the project has a `localPath`, and `s.source` is not `cowork`;
  restore receives `localPath`. Cowork rows show a `COWORK` pill before the
  session name in the summary cell.
- **Rollup**: a `By Machine` block after `Time` — sessions, tokens, subagents,
  cost per machine for the current project and range, hidden when empty,
  always listing every machine.
- **$/bead**: with `beads.machine` set, label `$/Bead (this machine)`,
  tooltip "Spend on this machine ÷ beads closed in the local checkout",
  numerator from `/api/stats?machine=<beads.machine>`. With machines present
  but `beads.machine` null, renders `—`. Single-source: unchanged.

New CSS: the Machine column width and the `.machine-select` picker styling.

## Single-machine behaviour

`/api/machines` returns `[]`, so no machine UI renders and `?machine=` is
never sent. Every session has `machine: null`; `$/bead` uses total spend with
no label change; LAUNCH shows on every row with a `localPath`. Totals rise on
upgrade because worktree sessions and sessions outside `scanPath` now count,
a checkout with no sessions no longer appears in the sidebar, and `scanPath`
is removed from the config.

## Error handling

- Downlink config problems degrade to the local source with one log line.
- A missing Cowork directory adds no source and logs nothing; a bad
  `local_*.json` skips one session with one log line.
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
home, empty mirror, Cowork dir present and absent), `projectKey` (the table
above), `discoverCoworkSessions` (fixture with metadata and transcript;
title, folder, no folder, malformed metadata, missing transcript),
`scopedSessions` (filter composition), `/api/machines` shape, and
`/api/beads` machine labelling.

Frontend has no test harness. Acceptance is a headless Playwright pass at
fixed viewports against the real mirror: picker shows two machines;
`throwntom` appears once in the sidebar; By Machine sums equal the headline
total; selecting a machine re-scopes sidebar, table and rollup; a run with
no downlink config shows no machine UI.
