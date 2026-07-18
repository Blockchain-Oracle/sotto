---
intent: Persist the exact human-wallet approval and one-shot Canton execution boundary so a verified purchase is submitted at most once and every uncertain result becomes reconciliation-only.
success_criteria: Existing PostgreSQL data upgrades safely; the strict settlement expectation, approval, wallet outcome, signature verification, execution start, and one reconcile job are durable and idempotent; real wallet calls and execute HTTP run outside transactions; no raw signing material is stored; real PostgreSQL integration and the complete pinned gate pass.
risk_level: medium
auto_approve: true
branch: codex/phase-4-human-wallet
worktree: false
---

## Steps

- [x] **Step 1: Write the durable lifecycle migration RED tests**
action: Add `packages/database/test/human-execution-upgrade.postgres.test.ts` and extend `packages/database/test/migrations.postgres.test.ts` to require migration `0009_human_execution_boundary`, safe upgrade of existing event-1/event-2 attempts, a strict settlement-expectation row, approval/signature/rejection/execution states, and a `purchase-reconcile` outbox kind while preserving the existing lifecycle query result.
loop: false
max_iterations: 1
verify: bash -lc 'set +e; output=$(mise exec node@24.18.0 -- corepack pnpm test:postgres 2>&1); status=$?; test "$status" -ne 0 && grep -Eq "0009_human_execution_boundary|settlement|execution" <<<"$output"'

- [x] **Step 2: Implement the human execution migration**
action: Add `packages/database/migrations/0009_human_execution_boundary.sql`; expand purchase-attempt and append-only event constraints through `approval-requested`, `wallet-rejected`, `wallet-unsupported`, `signature-verified`, and `execution-started`; add bounded identity/timestamp columns; add a `settlements` table holding canonical strict expectation JSON and its digest; and permit one deduplicated ready `purchase-reconcile` job without weakening existing prepare-job lease coherence.
loop: until both migration suites pass
max_iterations: 4
verify: mise exec node@24.18.0 -- corepack pnpm test:postgres
gate: auto

- [x] **Step 3: Write the atomic settlement-checkpoint RED tests**
action: Extend `packages/database/test/purchase-lifecycle.postgres.test.ts` with cases requiring `completeHumanPrepare` to atomically store the exact exported `HumanSettlementExpectation`, digest, event 2, hashes, completed prepare job, and retired preparation authority; add mutated/structural-clone expectation and forced-write failure cases proving full rollback.
loop: false
max_iterations: 1
verify: bash -lc 'set +e; output=$(mise exec node@24.18.0 -- corepack pnpm test:postgres 2>&1); status=$?; test "$status" -ne 0 && grep -Eqi "settlement|expectation|prepared" <<<"$output"'

- [x] **Step 4: Persist and restore the strict settlement expectation**
action: Update `packages/database/src/purchase-prepare-checkpoint-validation.ts` and `purchase-prepare-checkpoint.ts`, adding small settlement persistence helpers under `packages/database/src/`; derive the expectation only from the authenticated hash-verified prepared purchase, store canonical bounded JSON and its digest in the same transaction as event 2, and expose a strict lifecycle read that restores the authenticated expectation through `@sotto/x402-canton/internal/human-settlement-expectation-journal`.
loop: until checkpoint, package build, and strict type tests pass
max_iterations: 4
verify: mise exec node@24.18.0 -- corepack pnpm test:postgres && mise exec node@24.18.0 -- corepack pnpm vitest run packages/x402-canton/test/human-settlement-expectation.test.ts && mise exec node@24.18.0 -- corepack pnpm typecheck
gate: auto

- [x] **Step 5: Write repository transition RED tests**
action: Add `packages/database/test/human-execution-lifecycle.postgres.test.ts` covering exact approval replay, conflicting session/connector/prepared hash, concurrent approval writers, terminal rejection and unsupported outcomes, signature verification without raw signature persistence, execution-start atomicity, one reconcile job, database failure before execution, concurrent execution-start winners, and restart reads that remain reconciliation-only.
loop: false
max_iterations: 1
verify: bash -lc 'set +e; output=$(mise exec node@24.18.0 -- corepack pnpm test:postgres 2>&1); status=$?; test "$status" -ne 0 && grep -Eqi "recordHumanApprovalRequested|beginHumanExecution|human execution" <<<"$output"'

- [x] **Step 6: Implement idempotent repository transitions**
action: Add bounded transition validation and SQL modules under `packages/database/src/`; extend `purchase-types.ts`, `purchase.ts`, and `index.ts` with `recordHumanApprovalRequested`, `recordHumanWalletDecision`, `recordHumanSignatureVerified`, `beginHumanExecution`, and `readHumanPurchaseLifecycle`; append exact hash-chained events under row locks, make exact replays idempotent, reject skips/conflicts, and atomically create one ready reconcile job before any execute call can be authorized.
loop: until lifecycle, migration, package build, and strict type tests pass
max_iterations: 5
verify: mise exec node@24.18.0 -- corepack pnpm test:postgres && mise exec node@24.18.0 -- corepack pnpm typecheck
gate: auto

- [x] **Step 7: Write the wallet execution orchestrator RED tests**
action: Add `packages/purchase-worker/test/human-wallet-execution-worker.test.ts` and a disposable-PostgreSQL companion suite requiring approval to commit before the real connector call, rejection/unsupported to make zero execute calls, signature verification to persist no raw bytes, execution start plus reconcile job to commit before one execute HTTP call, database failure to make zero execute calls, an execute failure to remain reconciliation-only, and external waits not to occupy a one-connection PostgreSQL pool.
loop: false
max_iterations: 1
verify: bash -lc 'set +e; output=$(mise exec node@24.18.0 -- corepack pnpm vitest run packages/purchase-worker/test/human-wallet-execution-worker.test.ts 2>&1); status=$?; test "$status" -ne 0 && grep -Eqi "createHumanWalletExecutionWorker|human wallet execution" <<<"$output"'

- [x] **Step 8: Implement the wallet execution orchestrator**
action: Add `packages/purchase-worker/src/human-wallet-execution-worker.ts` and its types; accept only the authenticated prepare-worker handoff, call `createHumanWalletSigningSession`, use its approval callback to persist event 3 before connector invocation, persist exact terminal wallet outcomes, persist signature verification metadata only, generate one submission identity, commit `execution-started` and the reconcile job, then invoke one injected bounded execute transport outside PostgreSQL; expose an explicit uncertain outcome after the durable fence and never resubmit.
loop: until worker unit, real PostgreSQL, package build, and strict type tests pass
max_iterations: 5
verify: mise exec node@24.18.0 -- corepack pnpm vitest run packages/purchase-worker/test/human-wallet-execution-worker.test.ts && mise exec node@24.18.0 -- corepack pnpm test:postgres && mise exec node@24.18.0 -- corepack pnpm typecheck
gate: auto

- [ ] **Step 9: Prove the real PostgreSQL and Wallet SDK companion path**
action: Extend `packages/purchase-worker/test/human-prepare-worker.postgres.test.ts` or add `human-wallet-execution-worker.postgres.test.ts` to run disposable real PostgreSQL, the compiled reference Wallet SDK companion process with a generated test key, and a bounded local execute HTTP endpoint; prove one approval, one valid signature, one durable execution start, one execute call, one reconcile job, process-reopened lifecycle recovery, and zero Redis dependency.
loop: until the compiled integration passes repeatedly with no leaked private artifacts
max_iterations: 4
verify: mise exec node@24.18.0 -- corepack pnpm test:postgres && mise exec node@24.18.0 -- corepack pnpm vitest run spikes/capability-wallet/test/reference-human-wallet-process.test.ts && mise exec node@24.18.0 -- corepack pnpm lint && mise exec node@24.18.0 -- corepack pnpm format:check
gate: auto

- [ ] **Step 10: Close the deterministic execution-boundary checkpoint**
action: Update `docs/designs/2026-07-17-production-foundation-design.md` and the implemented-status text in `README.md` with the exact durable boundary and remaining connector-restart, reconciliation, delivery, and live Five North gates; run source-cap and secret checks, resolve every scoped review blocker through focused RED/GREEN tests, then run the complete pinned repository gate from the beginning.
loop: until the complete repository gate passes with no review blocker
max_iterations: 4
verify: mise exec node@24.18.0 -- corepack pnpm verify
gate: auto
