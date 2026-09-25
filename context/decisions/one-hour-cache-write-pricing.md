# One-Hour Cache Writes Are Priced at 2× Base Input

**Date:** 2026-09-25
**Status:** Accepted

## Decision

`calculateMessageCost` splits `cache_creation_input_tokens` by TTL using
`usage.cache_creation.ephemeral_1h_input_tokens`. One-hour writes are billed
at twice the model's base input rate; the remainder is billed at the pricing
table's `cacheWrite` rate, which is the five-minute rate. A usage block
without a `cache_creation` breakdown is billed entirely at the five-minute
rate, as before.

The one-hour rate is derived (`input × 2`), not stored. The LiteLLM feed the
pricing service refreshes from has no one-hour field, and Anthropic's
published multipliers are 1.25× for five-minute writes and 2× for one-hour
writes across models.

## Rationale

Claude Code and Cowork both write one-hour cache entries: 344 local
transcripts on this machine carry `ephemeral_1h_input_tokens`, and every
Cowork session does. For a Cowork session with 78,071 one-hour cache-write
tokens on Sonnet 5, the dashboard reported $0.22 while Claude Code's own
`cost-state` record reported $0.34. Re-pricing those tokens at 2× base input
reproduces Claude Code's figure exactly, so the dashboard was undercounting
every session that used the one-hour TTL.

A stored `cacheWrite1h` column was rejected because it would have to be
back-filled across every history entry and the seed, and the refresh path
would immediately produce entries without it.
