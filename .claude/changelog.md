# Changelog

Purpose: Running log of all notable changes, features, and workflow updates.

> Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
> adhering to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- Story 2: Configurable Terminal Emulator for Session Launch — all 6 acceptance criteria implemented
  - `config.example.json` accepts `terminal` key (default: `ghostty`)
  - `restore.js` refactored with `TERMINALS` map, `buildLaunchArgs()` (pure), `findBinary()` (PATH check)
  - Full-support terminals: ghostty, alacritty, kitty (spawn with `-e` or positional args)
  - Partial-support terminals: cosmic-term (opens in project dir), zeditor (opens/focuses project)
  - Partial terminals return `resumeCommand`; Launch button transitions to "Copy Cmd" (blue) for clipboard copy
  - macOS + ghostty preserves existing AppleScript path; all others use cross-platform spawn
  - POST `/api/restore` reads terminal from config, passes to `restoreSession()`
  - 19 tests covering all terminals, platform routing, error paths, PATH validation, and injection prevention

### Fixed

- Shell injection in `restore.js`: `cwd` and `sessionId` from HTTP request were interpolated bare into `bash -c` strings; now shell-quoted via `shellQuote()`
- Spawn promise race: `resolve()` fired synchronously before spawn `'error'` event could settle, causing silent false-success; now deferred via `process.nextTick` with a `settled` flag
- Fetch `.catch()` in Launch button silently swallowed network errors; now shows error feedback
- `clipboard.writeText()` in Copy Cmd handler was not awaited; "Copied!" could display before write succeeded
- CSS `--blue-dim` variable was not defined; button used hardcoded fallback that didn't match the theme

- Story 1: Subagent Usage Breakdown per Project — all 6 acceptance criteria implemented
  - `mergeSubagentMetrics()` increments `subagentCount` on parent session
  - `aggregateSessions()` returns `totalSubagentCount` across sessions
  - Session table has dedicated "Subs" column (sortable, blank when zero)
  - Tokens-by-Model rollup shows parent vs. subagent token attribution per model row
  - `subagentTokensByModel` tracked through merge and aggregation for attribution
  - 14 tests covering all new backend fields and edge cases
- Beads epic `lg8` with 5 child issues (lg8.1–lg8.5) and dependency chain for Story 1

### Fixed

- Subagent JSONL files (`{uuid}/subagents/*.jsonl`) were never scanned, hiding sonnet/haiku usage and undercounting tokens, costs, and tool calls
- `primaryModel` used first-seen model instead of highest-token-usage model, always showing "opus"

### Added

- Test suite using `node:test` with 8 tests for subagent discovery, metric merging, and primaryModel selection
- `npm test` script in package.json

### Changed

- Upgraded React from 18 to 19 (React 19 removed UMD builds; now loaded via esm.sh CDN + import maps)
- Switched app.js from global destructuring to ESM imports for React
- Upgraded minimum Node.js version from v18 to v24 LTS (v18 reached EOL April 2025)
- Added `.nvmrc` pinning Node 24 for nvm/fnm users
- Added `engines` field to `package.json` enforcing Node >=24.0.0
- Filled in `infra.md` with actual project runtime, framework, and architecture details
- Filled in `sbom.md` technology stack table (Node 24.x, Express ^4.21.0, Chokidar ^3.6.0)

### Added

- Initial project scaffold from vibe-md-templates + VEAP best practices
- Context files: claude.md, prd.md, workflow.md, security.md, infra.md, sbom.md, tests.md
- VEAP additions: me.md (symlink), voice.md (symlink), team.md, links.md, integrations.md
- Scribe and Quartermaster agent systems
- Session commands: /gogogo, /wrapup, /story
- Beads issue tracking initialized

---

## [0.1.0] - 2026-03-15

### Added

- Project scaffolded with full context file structure
- Agent systems (Scribe + Quartermaster) with all specialist sub-agents
- Working directories: context/drafts, references, decisions, daily-notes, projects, templates
