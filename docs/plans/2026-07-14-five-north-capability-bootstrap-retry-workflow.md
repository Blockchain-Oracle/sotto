---
intent: Retry the least-authority Five North BoundedPurchaseCapability bootstrap once after independently proving authentication connectivity is restored.
success_criteria: The exact reviewed implementation remains unchanged, the Five North authentication path is reachable, one newly governed start creates and reconciles exactly one compatible capability, redacted evidence is mode 0600, and no provider, prepare, signer, execution, faucet, payment, delivery, or settlement call occurs.
risk_level: high
auto_approve: false
branch: codex/phase-3-authority-remediation
worktree: false
---

# Five North Least-Authority Capability Bootstrap Retry Workflow

## Steps

- [ ] **Step 1: Revalidate source and authentication connectivity**

action: Prove the tracked bootstrap implementation is unchanged from commit 1181403, the worktree is clean, the owner-only bootstrap journal is absent, and Five North authentication DNS, TCP 443, and HTTPS are reachable before loading credentials.

loop: false

max_iterations: 1

verify: test -z "$(git status --porcelain --untracked-files=all | grep -v '^?? \.hotl/')" && git diff --quiet 1181403 -- package.json pnpm-lock.yaml packages spikes scripts daml docs/architecture docs/designs docs/product docs/quality && test ! -e tmp/devnet-capability-bootstrap && test -n "$(dig +short A auth.sandbox.fivenorth.io 2>/dev/null)" && nc -z -G 8 auth.sandbox.fivenorth.io 443 && curl -4 --connect-timeout 8 --max-time 15 -fsS -o /dev/null https://auth.sandbox.fivenorth.io/

gate: human

- [ ] **Step 2: Execute one newly governed live capability bootstrap**

action: Record fresh human-approved secret_access and external_write actions with new stable idempotency keys, load ignored credentials, invoke pnpm spike:capability:start exactly once, reconcile any durable journal instead of replaying start, and capture only the redacted output in the owner-only live evidence artifact.

loop: false

max_iterations: 1

verify:
  type: artifact
  path: .thoughts/research/2026-07-14-five-north-capability-bootstrap.md
  assert:
    kind: exists

gate: human

- [ ] **Step 3: Verify exact live evidence and zero prohibited calls**

action: Verify the private artifact is a regular mode-0600 file tied to the current source commit, reports OBSERVED and ONE, records a Ledger mutation, and reports every provider, prepare, signer, purchase execution, faucet, payment, and settlement flag as false.

loop: false

max_iterations: 1

verify: test "$(stat -f '%OLp' .thoughts/research/2026-07-14-five-north-capability-bootstrap.md)" = 600 && rg -q 'Status: `OBSERVED`' .thoughts/research/2026-07-14-five-north-capability-bootstrap.md && rg -q 'Compatible classification: `ONE`' .thoughts/research/2026-07-14-five-north-capability-bootstrap.md && rg -q 'Ledger mutation observed: `true`' .thoughts/research/2026-07-14-five-north-capability-bootstrap.md && rg -q 'Prohibited calls: `ZERO`' .thoughts/research/2026-07-14-five-north-capability-bootstrap.md && rg -q "Source commit: `$(git rev-parse HEAD)`" .thoughts/research/2026-07-14-five-north-capability-bootstrap.md

- [ ] **Step 4: Close verification and continuation state**

action: Update the mode-0600 private verification audit and handoff with the fresh HOTL action IDs, journal outcome, exact live classification, network-call counts, and remaining signer, payment, human-approval, public-observation, and production NO_GO boundaries.

loop: false

max_iterations: 1

verify: PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:$PATH node scripts/check-context.mjs && PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:$PATH node scripts/check-package-boundary-audit.mjs .thoughts/verification/2026-07-14-package-selection-signer-boundary.md

gate: human
