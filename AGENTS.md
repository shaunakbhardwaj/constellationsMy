# AGENTS.md

## Repo Rules

This workspace keeps two project-tracking markdown files up to date:

- [WORK_LOG.md](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/WORK_LOG.md)
- [.project_memory.md](/Users/shaunakbhardwaj/conductor/workspaces/Maps/sarajevo/.project_memory.md)

## Required Update Policy

After every meaningful agent run that changes code, plans, architecture, UX, or product direction, update both files accordingly.

### `WORK_LOG.md`

Use this for:

- what changed in the run
- implementation details
- UX/product/design decisions made
- constraints, tradeoffs, and known limitations

### `.project_memory.md`

Use this for:

- durable project memory
- active TODOs
- major decisions
- suggested next steps
- open questions

## How To Update The Files

### Update `WORK_LOG.md` like a narrative changelog

After each meaningful run, add or update an entry that explains:

1. what was changed
2. why it was changed
3. what design, UX, product, or architecture decisions were made
4. what was intentionally deferred or kept lightweight
5. what verification was completed

`WORK_LOG.md` should read like a human explanation of the run, not a raw dump of edits.

### Update `.project_memory.md` like persistent project state

Keep these sections current:

- `Current Product Direction`
- `Major Decisions Locked In`
- `What Exists Now`
- `In Progress`
- `Current Gaps`
- `Next Milestone`
- `Suggested Next Steps`
- `Backlog`
- `Open Questions`

### What belongs in `In Progress`

Only include work that is actively underway or immediately next.

Something belongs in `In Progress` only if at least one of these is true:

- code has already started
- the implementation plan is concrete and the work is effectively committed
- it is the active focus of the current phase

Do not put vague ideas or distant features in `In Progress`.

Use:

- `In Progress` for active work
- `Backlog` for future work
- `Open Questions` for unresolved decisions

### Minimum required delta after a run

At minimum, every meaningful run must update the files with:

1. what changed
2. what decisions were made or revised
3. what is now in progress
4. what the next milestone is
5. what open questions remain

## Minimum expectation after each run

Every run should update these files with:

1. what was done
2. what decisions were made
3. what remains to do

If nothing meaningful changed, say so explicitly rather than silently skipping the update.
