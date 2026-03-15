# MISSION-CONTROL — Master Context

Purpose: Central reference for the MISSION-CONTROL project. Defines context loading, conflict resolution, and agent coordination.

---

## Required Context Files

To fully understand the operating environment, read these files in this directory:

- **`me.md`** — KMo's profile, preferences, communication style, decision patterns
- **`voice.md`** — Canonical voice & tone guide for writing as KMo (emails, content, comms)
- **`prd.md`** — Product requirements, features, user stories, scope
- **`workflow.md`** — Session lifecycle, beads workflow, branching strategy
- **`infra.md`** — Tech stack, architecture, coding standards, deployment
- **`security.md`** — Compliance, secrets, data handling (**highest precedence**)
- **`sbom.md`** — Software Bill of Materials, approved dependencies
- **`tests.md`** — Testing strategy, frameworks, key scenarios
- **`team.md`** — Key contacts, roles, authority levels
- **`links.md`** — Critical URLs and external properties
- **`integrations.md`** — External tool connections
- **`changelog.md`** — Version history and completed work

Always consult these files before proceeding with any task.

---

## Conflict Resolution Matrix

When instructions in different context files conflict, follow this order of precedence:

| Priority | Authority | Override Power |
|----------|-----------|----------------|
| 1 | `security.md` | Safety & compliance override everything |
| 2 | `me.md` | KMo's preferences override process |
| 3 | `claude.md` (this file) | Global conventions, baseline |
| 4 | `prd.md` | Product requirements (can't violate 1-3) |
| 5 | `infra.md` | Runtime environment facts |
| 6 | `workflow.md` | Process and execution procedures |

### Conflict Resolution Process

If you find a conflict, you **MUST**:

1. **State the conflict clearly** — Identify the specific conflicting instructions and their sources.
2. **Follow the precedence rule** — Apply the priority order above.
3. **Recommend minimal edits** — Suggest changes to harmonize, starting with the lowest-authority document.

---

## Agent Systems

This project includes two agent dispatcher systems:

### `/scribe` — Document Creation & Planning
Routes to specialists for:
- **Project/context setup** (scribe-init): Initialize or update project structure
- **PRD/OPORD drafting** (scribe-opord): Turn requirements into structured deliverables
- **Executive briefs** (scribe-2page): Crisp 1-2 page decision memos
- **Planning sessions** (scribe-co-planning): Facilitate goals, constraints, sequenced next steps

Scribe executes all beads backlog operations.

### `/quartermaster` — Analysis & Review
Routes to specialists for:
- **Priorities review** (backlog-review): Analyze open work, recommend next focus
- **Initiative fit** (feature-fit): Evaluate new ideas against capacity, strategy, risk
- **Technical health** (tech-review): Check for gaps, tech debt, concerns
- **Planning handoff** (coordination): Translate recommendations into actionable Scribe requests

Quartermaster is READ-ONLY on beads.

### Agent Coordination Flow

1. Quartermaster analyzes and recommends (read-only)
2. User approves recommendations
3. Quartermaster coordinates handoff to Scribe
4. Scribe executes beads operations and document updates

When discussing features, architecture, or priorities, proactively suggest the appropriate agent command.

---

## Changelog

Whenever asked about previous work or needing to create commits, consult:

- **`changelog.md`** — Version history, feature additions, completed work
