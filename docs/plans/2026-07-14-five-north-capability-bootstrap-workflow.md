---
intent: Create exactly one least-authority BoundedPurchaseCapability on Five North with a durable single-dispatch journal and exact payer-scoped reconciliation.
success_criteria: The reviewed fixed policy, shared authenticated subject, endpoint allowlist, start/recovery orchestration, full deterministic and clean-clone gates, and one governed real Five North bootstrap all pass without provider, prepare, purchase signing, execution, payment, faucet, or settlement calls.
risk_level: high
auto_approve: false
branch: codex/phase-3-authority-remediation
worktree: false
---

# Five North Least-Authority Capability Bootstrap Workflow

## Steps

- [ ] **Step 1: Verify approved design and zero-cardinality authority**

action: Verify the tracked approved bootstrap design, the private mode-0600 ZERO diagnostic, and the package-boundary audit marker; retain the explicit shared-credential and production NO_GO limitations.

loop: false

max_iterations: 1

verify: PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:$PATH node scripts/check-package-boundary-audit.mjs .thoughts/verification/2026-07-14-package-selection-signer-boundary.md

gate: human

- [ ] **Step 2: Define least-authority policy RED tests**

action: Add focused tests requiring a one-hour policy with 2500000000 per-call principal, 3250000000 lifetime total debit, 3250000000 per-call total debit, exact configured payer/agent/provider/resource, and rejection of caller-selected limits or lifetime.

loop: false

max_iterations: 1

verify: sh -c 'PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:$PATH pnpm vitest run spikes/devnet-payment/test/five-north-capability-bootstrap-policy.test.ts > /tmp/sotto-capability-policy-red.log 2>&1; status=$?; cat /tmp/sotto-capability-policy-red.log; test "$status" -ne 0 && rg -q "LEAST_AUTHORITY_POLICY_NOT_IMPLEMENTED" /tmp/sotto-capability-policy-red.log'

gate: human

- [ ] **Step 3: Implement and reuse the fixed bootstrap policy**

action: Add the fixed least-authority policy constructor and use it in the read-only factory probe and live orchestration boundary without changing the Daml package.

loop: until policy tests pass

max_iterations: 3

verify: PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:$PATH pnpm vitest run spikes/devnet-payment/test/five-north-capability-bootstrap-policy.test.ts spikes/devnet-payment/test/five-north-bootstrap-factory-probe.test.ts

gate: human

- [ ] **Step 4: Define shared-authentication and endpoint-guard RED tests**

action: Add tests requiring one injectable token provider across readiness, prepare, and bootstrap submit; exact submission-token subject equality; approved endpoint/method/count limits; one submission maximum; cancellation; and rejection of provider, prepare, faucet, payment, and unknown endpoints before network.

loop: false

max_iterations: 1

verify: sh -c 'PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:$PATH pnpm vitest run spikes/devnet-payment/test/five-north-capability-bootstrap-transport.test.ts > /tmp/sotto-capability-transport-red.log 2>&1; status=$?; cat /tmp/sotto-capability-transport-red.log; test "$status" -ne 0 && rg -q "CAPABILITY_BOOTSTRAP_TRANSPORT_NOT_IMPLEMENTED" /tmp/sotto-capability-transport-red.log'

gate: human

- [ ] **Step 5: Implement shared authentication and bootstrap transport**

action: Extend existing Five North transports with an injected token provider, add a subject-bound bootstrap submitter and exact network guard, and preserve all existing default behavior and tests.

loop: until bootstrap transport tests pass

max_iterations: 3

verify: PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:$PATH pnpm vitest run spikes/devnet-payment/test/five-north-capability-bootstrap-transport.test.ts spikes/devnet-payment/test/five-north-capability-readiness-transport.test.ts spikes/devnet-payment/test/five-north-prepare-transport.test.ts spikes/devnet-payment/test/five-north-transaction-submit.test.ts

gate: human

- [ ] **Step 6: Define live orchestration and redaction RED tests**

action: Add tests for clean-source input, readiness then factory then exact request, entirely empty preflight, fsynced journal before one submit, exact post-ACS reconciliation, recovery-only restart, safe output, and absence of provider/prepare/purchase-sign/purchase-execute/payment ports.

loop: false

max_iterations: 1

verify: sh -c 'PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:$PATH pnpm vitest run spikes/devnet-payment/test/five-north-live-capability-bootstrap.test.ts > /tmp/sotto-live-capability-red.log 2>&1; status=$?; cat /tmp/sotto-live-capability-red.log; test "$status" -ne 0 && rg -q "LIVE_CAPABILITY_BOOTSTRAP_NOT_IMPLEMENTED" /tmp/sotto-live-capability-red.log'

- [ ] **Step 7: Implement start, recovery, and redacted output**

action: Add the dependency-injected live orchestrator, clean-source CLI entry, start/recover package scripts, fresh capability ACS reader, and fixed allowlist evidence projection; reuse the existing readiness, factory, journal, runner, recovery, and reconciliation modules.

loop: until live orchestration tests pass

max_iterations: 3

verify: PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:$PATH pnpm vitest run spikes/devnet-payment/test/five-north-live-capability-bootstrap.test.ts spikes/devnet-payment/test/capability-bootstrap-journal-runner.test.ts spikes/devnet-payment/test/capability-bootstrap-recovery-security.test.ts spikes/devnet-payment/test/capability-bootstrap-runner.test.ts

- [ ] **Step 8: Run focused security and privacy review**

action: Review the complete bootstrap diff for shared-subject binding, endpoint escape, duplicate dispatch, durable ambiguity, unsafe output, policy widening, and accidental purchase/payment surfaces; correct accepted findings through RED/GREEN cycles.

loop: until no blocking finding remains

max_iterations: 3

verify: PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:$PATH pnpm vitest run spikes/devnet-payment/test/five-north-capability-bootstrap-policy.test.ts spikes/devnet-payment/test/five-north-capability-bootstrap-transport.test.ts spikes/devnet-payment/test/five-north-live-capability-bootstrap.test.ts spikes/devnet-payment/test/capability-bootstrap-recovery-security.test.ts

gate: human

- [ ] **Step 9: Run and commit the complete deterministic gate**

action: Run the pinned workspace verification, correct only in-scope failures, and commit the reviewed implementation and documentation with a clean tracked tree.

loop: until complete verification passes and tracked changes are committed

max_iterations: 3

verify: test -z "$(git status --porcelain --untracked-files=all | grep -v '^?? \.hotl/')" && PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:/Users/abu/.dpm/bin:$PATH JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home pnpm verify

- [ ] **Step 10: Verify exact HEAD from a clean non-shared clone**

action: Clone current HEAD without shared objects, install from the frozen lockfile, run the complete pinned gate without credentials, private context, journal, cache, dependencies, or build output, and remove the clone.

loop: until clean-clone verification passes

max_iterations: 2

verify: tmpdir="$(mktemp -d)" && trap 'rm -rf "$tmpdir"' EXIT && git clone --no-local . "$tmpdir/repo" && cd "$tmpdir/repo" && PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:/Users/abu/.dpm/bin:$PATH pnpm install --frozen-lockfile && PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:/Users/abu/.dpm/bin:$PATH JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home pnpm verify

- [ ] **Step 11: Execute one governed real Five North bootstrap**

action: After recording a human-approved secret_access plus external_write action with a stable idempotency key, load ignored credentials and run the start command exactly once. If the action becomes interrupted or ambiguous, reconcile the HOTL action and owner-only journal without replaying start. Capture only mode-0600 redacted evidence.

loop: false

max_iterations: 1

verify:
  type: artifact
  path: .thoughts/research/2026-07-14-five-north-capability-bootstrap.md
  assert:
    kind: exists

gate: human

- [ ] **Step 12: Close bootstrap verification and handoff**

action: Update the private verification audit and handoff with deterministic, clean-clone, action, journal, and live ACS evidence; distinguish real capability creation from still-unproven prepare, signer, payment, human approval, public observation, and production gates.

loop: false

max_iterations: 1

verify: PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:$PATH node scripts/check-context.mjs && PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:$PATH node scripts/check-package-boundary-audit.mjs .thoughts/verification/2026-07-14-package-selection-signer-boundary.md

gate: human
