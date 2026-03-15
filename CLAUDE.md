# MISSION-CONTROL

## Required Context Files

On session start, read these files in `.claude/` directory:

- **`claude.md`** — Master context, conflict resolution matrix, agent systems
- **`me.md`** — KMo's profile, communication style, decision preferences
- **`voice.md`** — Canonical voice & tone guide for writing as KMo
- **`prd.md`** — Product requirements, features, scope
- **`workflow.md`** — Beads workflow, session lifecycle
- **`infra.md`** — Tech stack, architecture, coding standards
- **`security.md`** — Compliance, secrets, data handling (highest precedence)
- **`team.md`** — Key contacts, roles, authority levels
- **`links.md`** — Critical URLs and external properties
- **`integrations.md`** — External tool connections
- **`changelog.md`** — Version history and completed work

## Conflict Resolution

When context files conflict, follow the precedence order defined in `.claude/claude.md`:

1. `security.md` — Safety & compliance override everything
2. `me.md` — KMo's preferences override process
3. `claude.md` — Global conventions and baseline
4. `prd.md` — Product requirements (can't violate 1-3)
5. `workflow.md` — Process and execution procedures

## Key Commands

| Command | Purpose |
|---------|---------|
| `/gogogo` | Start session: load context, check status, show ready work |
| `/wrapup` | End session: commit, sync beads, push |
| `/scribe` | Document creation & planning dispatcher |
| `/quartermaster` | Analysis & review dispatcher |
| `/story` | Add feature to PRD interactively |
| `/create-prompt` | Build prompts using R.G.C.O.A. framework |

## Directory Layout

```
MISSION-CONTROL/
  CLAUDE.md                  # This file — brain/index
  .claude/                   # Context files, commands, agents
    commands/                # Slash commands
    agents/                  # Sub-agent definitions
  context/                   # Working documents, references, decisions
```
