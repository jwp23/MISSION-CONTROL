# Beads Stay Local-Only Under Multi-Machine Sources

**Date:** 2026-09-21
**Status:** Accepted

## Decision

With sessions aggregated across machines (ADR-002), bead counts are still read
from the local checkout only. `$/bead` divides *this machine's* spend by the
local checkout's closed count and is labelled "$/bead (this machine)", with a
tooltip saying beads are read from the local checkout. The machine name comes
from the agent-downlink config; when a mirror is in use but the name is
unavailable, `$/bead` shows "—" rather than guessing.

## Rationale

- Bead data lives in each repo's Dolt DB, not in the mirror, so cross-machine
  bead aggregation is a separate effort.
- Bead counts sync via `refs/dolt/data`. For repos that sync across machines,
  the local closed count already includes remote closures, so a local-spend
  numerator understates `$/bead`. For repos that do not sync it is exact.
  Which repos sync has not been verified; the label makes the measurement
  honest either way.
- Rejected: all-machine spend over local bead counts (overstates for
  non-syncing repos and needs no machine name, but contradicts what the
  label would claim).
