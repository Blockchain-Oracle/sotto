---
intent: Recover an execution-started human purchase through a PostgreSQL-leased read-only reconciler without any second wallet, signature, preparation, or Ledger execute call.
success_criteria: Real PostgreSQL proves generation-fenced claim, absent-result requeue, exact rejection, exact verified settlement, crash recovery, one terminal journal event, and zero payment-authority dependencies; all repository gates and clean-clone verification pass.
risk_level: high
auto_approve: true
branch: codex/phase-4-human-wallet
worktree: false
---

## Steps

- [x] **Step 1: Extend the reconciliation schema and integrity oracle**
action: Add RED PostgreSQL tests in `packages/database/test/human-reconciliation-schema.postgres.test.ts` for kind-aware completed jobs, event 6, terminal attempt/settlement coherence, reconciliation cursor constraints, and exact migration upgrade/rollback guards. Confirm the old schema fails for the intended constraint. Implement `packages/database/migrations/0010_human_reconciliation.sql` and the minimum row/oracle/type changes so the new tests pass without relaxing legacy prepare-job validation.
loop: until the schema and integrity tests pass
max_iterations: 3
verify: corepack pnpm test:postgres
gate: human

- [ ] **Step 2: Add generation-fenced reconciliation claim and requeue**
action: Add RED real-PostgreSQL tests in `packages/database/test/human-reconciliation-lease.postgres.test.ts` for one `SKIP LOCKED` winner, expired-generation reclaim, stale-generation rejection, exact authenticated scope restoration, monotonic absent cursor advancement, database-time backoff, and a one-connection pool released during external work. Implement narrow claim/defer repository operations in new `purchase-reconcile-lease.ts` and `purchase-reconcile-checkpoint.ts` modules and expose them only through `PurchaseRepository`.
loop: until the lease and requeue tests pass
max_iterations: 3
verify: corepack pnpm test:postgres
gate: human

- [ ] **Step 3: Add atomic terminal reconciliation checkpoints**
action: Add RED PostgreSQL tests in `packages/database/test/human-reconciliation-fence.postgres.test.ts` for exact rejection, exact settlement, concurrent terminal checkpoint, exact replay, changed-result conflict, injected transaction rollback, stale lease, and append-only event hash validation. Implement one generation-fenced transaction that appends event 6, updates attempt and settlement, and completes the reconcile job against event 6.
loop: until terminal checkpoint tests pass
max_iterations: 3
verify: corepack pnpm test:postgres

- [ ] **Step 4: Promote the exact provider settlement verifier**
action: Write RED mutation tests under `packages/x402-canton/test/human-provider-settlement*.test.ts` for the existing exact provider holding and SendV2 proof. Move the pure verifier from spike-only modules into bounded production modules under `packages/x402-canton/src`, export only the verifier and authenticated proof reader needed by reconciliation, and leave compatibility re-exports in the spike so existing live evidence tests remain green.
loop: until the focused verifier and existing spike suites pass
max_iterations: 3
verify: corepack pnpm exec vitest run packages/x402-canton/test/human-provider-settlement*.test.ts spikes/devnet-payment/test/human-purchase-provider-reconciliation.test.ts --testTimeout=120000
gate: human

- [ ] **Step 5: Implement the read-only one-shot reconciliation worker**
action: Add RED unit and security tests in `packages/purchase-worker/test/human-reconciliation-worker*.test.ts` for idle, pending, rejection, verified settlement, malformed or forged success, cancellation, expired lease, adapter failure, and terminal restart. Implement a separate `createHumanReconciliationWorker` whose public dependencies contain only the repository and bounded read-only completion/transaction adapter; its types must make wallet, key, signing, preparation, dispatch, and execute capabilities absent.
loop: until focused worker unit and security tests pass
max_iterations: 3
verify: corepack pnpm exec vitest run packages/purchase-worker/test/human-reconciliation-worker*.test.ts --exclude '**/*.postgres.test.ts'
gate: human

- [ ] **Step 6: Prove real PostgreSQL process replacement**
action: Add `packages/purchase-worker/test/human-reconciliation-worker.postgres.test.ts` using disposable real PostgreSQL and a bounded local read-only HTTP reconciliation endpoint. Prove one lease winner, no held database connection during the external read, absent requeue, old-generation rejection, exact terminal persistence after repository/worker replacement, and compile-time/runtime absence of wallet, key, sign, prepare, dispatch, or execute calls.
loop: until the complete PostgreSQL integration gate passes
max_iterations: 3
verify: corepack pnpm test:postgres

- [ ] **Step 7: Review claims, performance shape, and repository documentation**
action: Update `docs/designs/2026-07-17-production-foundation-design.md`, `docs/product/decision-summary.md`, and `README.md` with only implemented evidence, explicitly separating local integration from Five North evidence and settlement from delivery. Run an independent security/concurrency review over migration 0010, repository fencing, verifier provenance, and the worker dependency surface; resolve every BLOCK finding through a focused RED/GREEN correction.
loop: until documentation checks and independent review have no BLOCK findings
max_iterations: 3
verify: corepack pnpm format:check && corepack pnpm lint && corepack pnpm typecheck

- [ ] **Step 8: Close deterministic and clean-clone verification**
action: Run the full pinned `pnpm verify`, commit the reviewed implementation in conventional commits, then clone the exact final commit with `--no-hardlinks`, frozen-install dependencies, and rerun `pnpm verify` without local credentials, ignored context, build output, caches, or dependency trees. Record exact counts and preserve production `NO_GO` for delivery, deployment, connector custody, and live Five North execution through this worker.
loop: until both workspace and clean-clone gates pass
max_iterations: 3
verify: corepack pnpm verify
gate: human
