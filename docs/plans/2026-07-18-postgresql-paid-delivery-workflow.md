---
intent: Deliver one already-reconciled human purchase through a PostgreSQL-fenced worker, persist an encrypted bounded response, and replay it after process replacement without another wallet, Ledger, or provider call.
success_criteria: Real PostgreSQL and loopback HTTP prove one composite delivery claim, one attempted dispatch, generation fencing, no database connection during HTTP, encrypted request/response material, exact cached application-response replay, fail-closed delivery-unknown recovery, and no Redis; all repository and clean-clone gates pass.
risk_level: high
auto_approve: true
branch: codex/phase-4-human-wallet
worktree: false
---

## Accepted boundary

- Settlement and delivery remain separate outcomes.
- The durable delivery identity is exactly `(update_id, attempt_id, request_commitment)`.
- A successful settlement checkpoint creates delivery work atomically. A rejected
  settlement never creates delivery work.
- Network I/O happens outside PostgreSQL transactions and without holding a pool
  connection.
- A lease may be reclaimed before dispatch. Once a durable dispatch fence exists,
  any missing or incomplete response is `delivery-unknown` and is never
  automatically dispatched again.
- PostgreSQL cannot make arbitrary HTTP side effects exactly once. The proved
  contract is one fenced attempt, exact successful replay, and fail-closed unknown
  delivery.
- Request and response bodies are bounded and AEAD-encrypted with keys outside the
  database. Authorization, cookies, wallet keys, signatures, prepared transactions,
  and payment-proof headers are never persisted.
- The first integration uses PostgreSQL 18 and a real bounded loopback HTTP process.
  It is not new Five North evidence and does not issue a production `GO`.
- Redis is not part of the authority or durability path.

## Performance contract

- Request body: at most 1 MiB; URL: at most 8 KiB; request headers: at most 128.
- Response body: at most 2,000,000 bytes; response headers have an explicit small
  allowlist and aggregate bound.
- Claim and checkpoint transactions are short; provider I/O uses one absolute
  deadline and one selected destination, with no redirects or address fallback.
- Local timings are diagnostic only. No p50/p95/p99 production claim comes from a
  single local or live purchase.

## Steps

- [ ] **Step 1: Freeze the PostgreSQL delivery schema and encrypted payload boundary**
action: Add RED PostgreSQL tests for `private_attempt_payloads`, unique composite `delivery_claims`, encrypted `delivery_responses`, exact state/check constraints, rejected-settlement exclusion, successful-settlement scheduling, upgrade, and rollback. Add pure RED tests for canonical private request/response envelopes and AEAD tamper/key/AAD rejection. Implement migration `0011_paid_delivery.sql` and the minimum encryption/validation modules.
loop: until focused crypto and real-PostgreSQL schema tests pass
max_iterations: 3
verify: corepack pnpm exec vitest run packages/database/test/private-delivery-*.test.ts packages/database/test/human-delivery-schema.postgres.test.ts

- [ ] **Step 2: Persist the exact request at attempt creation**
action: Add RED tests proving the authenticated request snapshot is projected once, forbidden and uncommitted transport headers cannot enter delivery material, initialization stores it atomically with the purchase, idempotent replay verifies identical plaintext, mutation conflicts, and no private value appears in public rows or errors. Implement the narrow authenticated projection and `private_attempt_payloads` store without changing wallet or prepare authority.
loop: until focused unit and PostgreSQL initialization tests pass
max_iterations: 3
verify: corepack pnpm exec vitest run packages/x402-canton/test/human-delivery-request*.test.ts packages/database/test/human-delivery-payload*.test.ts

- [ ] **Step 3: Add generation-fenced delivery claim and dispatch fence**
action: Add RED real-PostgreSQL tests for one `SKIP LOCKED` winner, expired pre-dispatch reclaim, exact composite identity, stale-generation rejection, database-time leases, atomic dispatch fence, and recovery of an expired dispatched lease directly to `delivery-unknown` without returning dispatch authority. Implement claim, defer-before-dispatch, mark-dispatching, and unknown-recovery repository operations.
loop: until delivery claim/fence tests pass
max_iterations: 3
verify: corepack pnpm exec vitest run packages/database/test/human-delivery-lease*.postgres.test.ts

- [ ] **Step 4: Add atomic response checkpoint and exact replay**
action: Add RED PostgreSQL tests for bounded encrypted response storage, canonical safe headers, delivered checkpoint, exact replay after repository replacement, AEAD corruption/key failure, concurrent terminal checkpoint, stale generation, conflicting result, and transaction rollback. Implement one terminal delivered transaction and a read-only replay operation; implement explicit `delivery-unknown` checkpoint for post-fence failures.
loop: until delivery terminal and replay tests pass
max_iterations: 3
verify: corepack pnpm exec vitest run packages/database/test/human-delivery-terminal*.postgres.test.ts packages/database/test/human-delivery-replay*.postgres.test.ts

- [ ] **Step 5: Implement the capability-minimal one-shot delivery worker**
action: Add RED worker tests for idle, bounded paid request, exact proof derivation, cancellation, pre-dispatch defer, post-fence unknown, streamed response limits, redirect/non-success rejection, safe response headers, and cached replay. Implement a worker whose only dependencies are the delivery repository and one bounded HTTP adapter; wallet, key, approval, signing, prepare, Ledger execute, and settlement mutation capabilities must be absent.
loop: until focused worker unit/security tests pass
max_iterations: 3
verify: corepack pnpm exec vitest run packages/purchase-worker/test/human-delivery-worker*.test.ts --exclude '**/*.postgres.test.ts'

- [ ] **Step 6: Prove real PostgreSQL, HTTP, and process replacement**
action: Use disposable PostgreSQL 18, a real loopback HTTP server, and actual Node child processes to prove two-worker contention yields one request, pool size one remains available during blocked HTTP, pre-dispatch death is reclaimable, post-dispatch death becomes unknown with zero redispatch, successful checkpoint replays exact cached status/body/safe headers with the provider offline, and logs contain no private body/proof/key material.
loop: until the full process integration matrix passes consistently
max_iterations: 3
verify: corepack pnpm test:postgres

- [ ] **Step 7: Review, document, and close reproducibility**
action: Run independent security, concurrency, claims, and performance reviews; resolve every BLOCK finding with a focused RED/GREEN correction. Update the production foundation, decision summary, and README with only implemented local evidence. Run the full pinned gate, commit conventional checkpoints, then prove the exact final commit from a no-hardlink empty-cache clone without credentials, ignored context, build output, or dependency trees. Preserve production `NO_GO` for live recovery, connector custody, deployment, backup/restore, and final audit.
loop: until reviewers are READY and both workspace and clean-clone verification pass
max_iterations: 3
verify: corepack pnpm verify

## Verification checkpoint

The slice is complete only when the repository contains the migration, encrypted
payload and response authorities, generation-fenced repository, one-shot worker,
real PostgreSQL/HTTP/process tests, reviewed claim updates, full verification, and
clean-clone proof. Unit fakes may stand only at the external HTTP port; PostgreSQL
behavior must use the real disposable PostgreSQL service.
