# Development Workflow

Purpose: This file explains the step-by-step process for building and implementing project features using **beads** (`bd`) for workflow tracking.

---

## 1. Session Startup

On session start, orient yourself with the current work state:

```bash
bd ready --json          # Get unblocked work as structured data
bd list --status open    # See all open issues
bd stale --days 7        # Find neglected issues
```

Review the output to understand:
- What work is ready to be claimed
- What's currently in progress (may need continuation)
- Any blockers or dependencies

---

## 2. Planning with Beads

When the user requests implementation of a feature or set of changes:

### Break Work into Issues

Create **fine-grained** issues for each discrete piece of work.

```bash
bd create "Implement auth endpoint" --type feature
bd create "Add auth tests" --type task
bd create "Update API docs for auth" --type chore
bd create "Fix login crash" --type bug -p 0
```

### Issue Types

| Type | Use For |
|------|---------|
| `bug` | Defects, errors, crashes |
| `feature` | New functionality |
| `task` | General work items |
| `epic` | Large initiatives (parent of multiple issues) |
| `chore` | Maintenance, docs, cleanup |

### Priority Levels

| Priority | Meaning |
|----------|---------|
| `-p 0` | Critical — production down, security issue |
| `-p 1` | High — blocking other work |
| `-p 2` | Medium — normal feature work (default) |
| `-p 3` | Low — nice to have |
| `-p 4` | Backlog — future consideration |

### Issue Dependencies

```bash
bd create "Fix database connection" --blocks AES-42
bd create "Add input validation" --parent AES-40
bd create "Fix flaky test in auth" --discovered-from AES-42
```

### User-Requested Work During Sessions

When the user requests new features during a session:

1. **Pause implementation** — Don't start coding new requests immediately
2. **Create bead(s)** — One per discrete piece of work
3. **Link appropriately** — Use `--parent` or `--discovered-from`
4. **Confirm with user** — Show created beads before proceeding
5. **Mark in_progress** — Then begin implementation

**Exception:** Skip bead creation for typo fixes, minor tweaks, or scope clarifications.

---

## 3. Branching Strategy

All work is done on feature branches merged to `main` via pull request.

```
feature/<work-id>-<short-description>
fix/<work-id>-<short-description>
```

**Never merge PRs to main without explicit human approval.**

---

## 4. Execution Process

### Issue Statuses

| Status | Meaning |
|--------|---------|
| `open` | Ready to start (default) |
| `in_progress` | Currently being worked on |
| `blocked` | Waiting on dependency |
| `deferred` | Postponed for later |
| `closed` | Completed |

### Claim and Execute

```bash
bd update <id> --status in_progress
# ... perform the work ...
bd close <id>
```

### On Failure

1. Do not close the issue
2. Add context via `bd comment <id> "Error: [description]"`
3. Create follow-up issues if needed
4. Seek user guidance before continuing

---

## 5. Code Commit Workflow

Follow Conventional Commits format:

```
feat: add user login button
fix: resolve null pointer in auth handler
docs: update API documentation
refactor: extract validation logic
```

After completing work:

```bash
git add .
git commit -m "feat: [description]"
bd sync
git push
```

---

## 6. Session Completion

Before ending a work session:

1. **File issues** for any remaining or discovered work
2. **Run quality gates** (tests, linters, builds) if code changed
3. **Close completed issues** via `bd close <id>`
4. **Push** all commits
5. **Sync beads** via `bd sync`
6. **Hand off** — provide context for next session

---

## 7. Agent-Assisted Workflows

### When to Suggest Scribe (`/scribe`)
- Set up a new project → `/scribe setup`
- Draft requirements → `/scribe draft PRD for [feature]`
- Create executive summaries → `/scribe brief about [topic]`
- Run a planning session → `/scribe plan [topic]`

### When to Suggest Quartermaster (`/quartermaster`)
- Prioritize work → `/quartermaster review backlog`
- Integrate a new feature → `/quartermaster add [feature]`
- Assess code health → `/quartermaster review tech`
- Execute plans → `/quartermaster coordinate`
