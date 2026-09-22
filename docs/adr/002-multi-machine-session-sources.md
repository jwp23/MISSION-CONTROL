# ADR-002: Multi-machine session sources from the agent-downlink mirror

**Date:** 2026-09-21
**Status:** Accepted

## Context

MISSION-CONTROL reads Claude Code transcripts from `~/.claude/projects` on one
machine. Joe runs Claude Code on several machines and uses agent-downlink,
which keeps a decrypted mirror at `mirror/<machine>/claude-code/projects/` in
the tool's native layout, synced hourly. The dashboard must aggregate tokens
and subagents across machines, break them down per machine and per project,
and behave exactly as today for a user without agent-downlink.

Facts established before deciding:

- The mirror holds `projects/` and `plugins/` only: no `history.jsonl`, no
  `sessions/`. Active-session detection and restore need `~/.claude`.
- The mirror includes this machine's own folder, so reading both it and
  `~/.claude` would double count.
- Projects can only be recognised across machines by path: the same project
  is `/home/mordant23/workspace/jwp23/throwntom` and
  `/Users/jpresley/workspace/jwp23/throwntom`. Transcripts record `cwd`;
  encoded directory names are lossy (`/` and `.` both become `-`).
- Today's `discoverProjects()` walks `scanPath` for directories with
  `.claude/`. It cannot see a remote filesystem, and it already misses
  worktree sessions and anything outside `scanPath`.
- A full parse of the 1.5 GB mirror (3,205 files) measured 5.6 s and ~300 MB
  RSS with the existing parser.

## Decision

Sessions come from a list of *sources*, each `{machine, projectsDir}`,
resolved by a new `server/sources.js`:

- With agent-downlink (`~/.config/agent-downlink/config.toml` present, parsed
  per ADR-001), one source per `mirror/<machine>/claude-code/projects/`.
  This machine's sessions come from the mirror too.
- Without it, or on any detection failure, a single source
  `{machine: null, projectsDir: ~/.claude/projects}`. With one source the UI
  shows no machine breakdown.

Projects are derived from transcripts, not from walking `scanPath`. A
session's project key is its launch `cwd` made home-relative, with a trailing
`/.worktrees/<name>` or `/.claude/worktrees/<name>` stripped. A `cwd` outside
home maps to the synthetic key `(temp)`. Every session counts; subdirectory
launches remain their own project. `scanPath` survives only to map a project
key to a local checkout for beads and restore.

The API gains a `machine` filter beside `project`, and a per-machine
aggregate. Everything downstream — parser, subagent merge, cost, time range,
daily and monthly stats — runs unchanged on the combined session list.

## Trade-offs

- Mirror-only for the local machine, over mirror plus a live `~/.claude`
  overlay: one code path and no need to know which mirror folder is "us",
  chosen for user cognitive load. Cost: data is as fresh as the last downlink
  run; a manual run or a shorter timer closes the gap.
- Home-relative path as identity assumes the same layout under home on every
  machine. Basename alone would merge `jwp23/vibe-md-templates` with
  `kylemoschetto/vibe-md-templates`. An alias map is deferred until a real
  mismatch appears.
- Worktree suffixes are stripped by pattern because a wrong guess is cheap.
  Subdirectory launches are not rolled up because transcripts do not reveal
  the repo root; rolling up would swallow `workspace/ciroos-ai/fde-toolkits`
  into `workspace/ciroos-ai`.
- `(temp)` keeps ~100 scratchpad and fixture directories from becoming
  projects while still counting their tokens.
- Local totals will jump: worktree sessions and sessions outside `scanPath`
  were never counted before.
- Rejected: running today's scanner once per machine (needs the remote
  filesystem, still misses worktrees); a consolidated SQLite/JSON index
  (overhead plus an invalidation problem, given the 5.6 s full parse).
