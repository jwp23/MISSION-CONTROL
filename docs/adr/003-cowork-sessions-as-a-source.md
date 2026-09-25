# ADR-003: Claude Desktop Cowork sessions as a session source

**Date:** 2026-09-25
**Status:** Accepted

## Context

Joe runs Cowork in the Claude Desktop macOS app alongside Claude Code and
wants Cowork spend and activity in the dashboard. A read-only probe of
`~/Library/Application Support/Claude/` established:

- Cowork runs a bundled Claude Code inside a VM and keeps one folder per
  session at `local-agent-mode-sessions/<account>/<org>/<id>/`, holding a
  Claude Code-format transcript at `.claude/projects/session/<uuid>.jsonl`.
  The existing parser reads these files unchanged; the two sessions on this
  machine produced model, tokens, cost, turns and duration.
- A sibling `local_<id>-….json` holds `title`, `model`, `createdAt`,
  `lastActivityAt`, `isArchived`, `userSelectedFolders` and `cliSessionId`
  (the transcript's session id). The `<id>` directory name is the first
  eight characters of that file's `sessionId` field, less the `local_`
  prefix.
- The transcript's `cwd` is `/private/var/empty` (the VM), so project
  identity cannot come from `cwd`; the attached folders are the only link
  to a project.
- `remote-session-spaces.json` lists cloud Cowork sessions that have no
  local transcript.
- Nothing is mirrored into `~/.claude/projects`, so no double counting.
- Chat conversations are not on disk in any usable form.
- The app registers a `claude://` URL scheme with routes for chat, Claude
  Code and shared artifacts, but none that opens a Cowork session.
- `claude-code-sessions/` holds only an empty `scheduled-tasks.json`.

## Decision

Cowork sessions are a second *kind* of source, not a second machine. When
the Cowork directory exists, `resolveSources()` appends
`{ kind: 'cowork', machine: <localMachine>, projectsDir: <that directory> }`
to the source list. The scanner walks account and org folders, reads each
`local_*.json`, parses the transcript folder it names with the existing
per-project path, and then overlays the metadata: `source: 'cowork'`, the
title as the session name when the transcript has none, and the project key
from the first attached folder.

A Cowork session with no attached folder gets the synthetic project key
`(cowork)`, alongside `(temp)`. `localPath` is null for it, so beads and
restore do not apply.

The session row carries `source`. The frontend tags Cowork rows and never
offers LAUNCH for them; the restore endpoint refuses them. Cloud-only Cowork
sessions, chat conversations and opening a Cowork session are out of scope.

## Trade-offs

- Source kind over a synthetic machine name: Cowork sessions belong to the
  machine they ran on, so machine filtering and the By Machine rollup keep
  working. Cost: a `kind` branch in discovery instead of a uniform loop.
- First attached folder as project identity: sessions with several folders
  are attributed to one project rather than split or given a composite key.
  Chosen because it reuses `projectKey` and matches how most sessions are
  started. A session with no folder lands in `(cowork)` rather than being
  dropped, so totals stay complete.
- Metadata read from `local_*.json` rather than the transcript: the title
  and folders exist nowhere else. Cost: a malformed metadata file skips the
  whole session, logged once, rather than showing a session with no project.
- macOS-only path with no config override: the Desktop app stores data in
  one place per platform and only macOS is in use. A Linux or Windows path
  can be added when someone has one to test against.
