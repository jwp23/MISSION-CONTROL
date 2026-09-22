# ADR-001: smol-toml for reading the agent-downlink config

**Date:** 2026-09-21
**Status:** Accepted

## Context

MISSION-CONTROL auto-detects an agent-downlink mirror by reading
`~/.config/agent-downlink/config.toml` for two keys, `mirror` and `machine`.
Node has no built-in TOML parser. The project's runtime dependencies are
`express` and `chokidar`; the user prefers a minimal tree and asked what
security exposure a third dependency adds.

Two options were weighed:

1. A dependency: `smol-toml`, a spec-compliant TOML parser.
2. A hand-rolled regex extracting the two keys line by line (~10 lines).

Registry and advisory facts for `smol-toml@1.8.0`, checked 2026-09-21:

- Zero dependencies; no `install`/`postinstall` scripts; SLSA provenance
  attestation; BSD-3-Clause; 109 KB unpacked; last published 2026-08-11.
- Single maintainer.
- Three past advisories, all denial of service from malicious TOML input,
  patched in 1.3.1, 1.6.1 and 1.7.1 (GHSA-pqhp-25j4-6hq9,
  GHSA-v3rj-xjv7-4jmq, GHSA-7w5x-hrqm-74c2).

## Decision

Add `smol-toml` with a version floor of `>=1.7.1` (declared `^1.8.0`, lockfile
committed), and parse the config with these mitigations:

1. Read only `mirror` and `machine`; type-check both as strings.
2. Resolve `mirror` through `resolveWithin(homedir, mirror)` so the scanner
   cannot be pointed outside the home directory.
3. Wrap the parse in try/catch; any failure degrades to the local `~/.claude`
   source with one log line and never crashes the server.

## Trade-offs

- Gained: correct parsing that survives quoting or formatting changes in
  agent-downlink's config writer. A regex would break silently.
- Given up: a zero-dependency solution. The residual risk is a
  single-maintainer supply chain. The DoS advisories barely apply because the
  only TOML parsed is the user's own config file; an attacker who can write it
  already owns the account, and the worst case is a startup hang on a
  local-only dashboard.
- Path containment means a mirror on an encrypted volume outside home, which
  agent-downlink's own docs suggest, is not supported; it falls back to local
  with a log line. Revisit if the mirror is actually moved.
