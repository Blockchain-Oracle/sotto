---
intent: Prevent an autonomous Sotto signer from approving a Canton purchase whose package interpretation or nested ledger effects can drift from the authorized purchase.
success_criteria: A source-pinned selectable-name closure and package-ID union are reviewed, a fresh authenticated selection is committed and submitted exactly, every nested prepared effect is independently verified, all mutations make zero signing calls, and prepare-only evidence passes without signing or spending.
risk_level: high
auto_approve: false
branch: codex/phase-3-authority-remediation
worktree: false
---

# Package Selection And Nested-Effect Signer Boundary Workflow

## Steps

- [x] **Step 1: Verify the source-pinned package closure artifact**

action: Add `scripts/check-package-closure-evidence.mjs` and use it to validate `.thoughts/research/2026-07-14-bounded-purchase-package-closure.md` against the official Canton and Splice pins, the three reviewed Splice DAR hashes, the approved Sotto DAR inventory, the two-name selectable closure, the 58-ID prepared-graph union, required privacy markers, and explicit `NOT PROVEN` stop conditions; do not use Five North credentials.

loop: false

max_iterations: 1

verify: PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:$PATH node scripts/check-package-closure-evidence.mjs .thoughts/research/2026-07-14-bounded-purchase-package-closure.md

gate: human

- [x] **Step 2: Define the package-closure schema RED contract**

action: Add `packages/x402-canton/test/package-preference-closure.test.ts` with one deliberate `PACKAGE_CLOSURE_NOT_IMPLEMENTED` failure covering `sotto-package-closure-v1`, source/DAR pins, separate selectable names and graph package references, canonical UTF-8 sorting, repeated manifest names, and rejection of empty, duplicate, conflicting, unpinned, or non-reproducible entries.

loop: false

max_iterations: 1

verify: sh -c 'PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:$PATH pnpm vitest run packages/x402-canton/test/package-preference-closure.test.ts > /tmp/sotto-package-closure-red.log 2>&1; status=$?; cat /tmp/sotto-package-closure-red.log; test "$status" -ne 0 && rg -q "PACKAGE_CLOSURE_NOT_IMPLEMENTED" /tmp/sotto-package-closure-red.log'

- [x] **Step 3: Implement canonical package-closure validation**

action: Add `packages/x402-canton/src/package-preference-closure.ts` and exports that validate, deep-freeze, canonically sort, and hash source pins, selectable package names, and the independently approved package ID/name/version union without assuming manifest names are unique.

loop: until package-closure tests pass

max_iterations: 3

verify: PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:$PATH pnpm vitest run packages/x402-canton/test/package-preference-closure.test.ts

- [x] **Step 4: Reproduce the concrete reviewed manifests**

action: Add a bounded digest-pinned Splice DAR inventory verifier under `scripts/` plus `spikes/devnet-payment/src/five-north-package-preference-manifest.ts`; reuse the exact 35-entry Sotto inventory and reproduce the three official Splice artifact manifests, two selectable names, 58-ID union, and recorded hashes without committing DARs.

loop: until manifest reproduction tests pass

max_iterations: 3

verify: PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:$PATH pnpm vitest run packages/x402-canton/test/package-preference-closure.test.ts spikes/devnet-payment/test/five-north-package-preference-manifest.test.ts

- [x] **Step 5: Define package metadata verification RED tests**

action: Add focused tests requiring every live returned package ID/name/version tuple to match the independently reproduced artifact union, while allowing historical creation-package references and rejecting name reuse, version reuse, unknown IDs, conflicting ID metadata, and caller-supplied provenance.

loop: false

max_iterations: 1

verify: sh -c 'PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:$PATH pnpm vitest run packages/x402-canton/test/package-reference-verifier.test.ts > /tmp/sotto-package-reference-red.log 2>&1; status=$?; cat /tmp/sotto-package-reference-red.log; test "$status" -ne 0 && rg -q "PACKAGE_REFERENCE_VERIFIER_NOT_IMPLEMENTED" /tmp/sotto-package-reference-red.log'

- [x] **Step 6: Implement independent package metadata verification**

action: Add `packages/x402-canton/src/package-reference-verifier.ts` that verifies live references only from the reviewed artifact union, returns an immutable canonical projection, and never trusts preferred-packages response names or versions as independent provenance.

loop: until package-reference tests pass

max_iterations: 3

verify: PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:$PATH pnpm vitest run packages/x402-canton/test/package-reference-verifier.test.ts packages/x402-canton/test/package-preference-closure.test.ts

- [x] **Step 7: Define authenticated preference observation RED tests**

action: Add separate scope and lifetime tests for exact synchronizer, execution-window `vettingValidAt`, conservative payer/agent/provider/admin union, stable token subject, exact two-name closure equality, response reordering, unique IDs, 60-second age, acquisition duration, clock rollback, caller mutation, and one-use projection claiming.

loop: false

max_iterations: 1

verify: sh -c 'PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:$PATH pnpm vitest run packages/x402-canton/test/package-preference-observation.test.ts > /tmp/sotto-package-observation-red.log 2>&1; status=$?; cat /tmp/sotto-package-observation-red.log; test "$status" -ne 0 && rg -q "PACKAGE_OBSERVATION_NOT_IMPLEMENTED" /tmp/sotto-package-observation-red.log'

gate: human

- [x] **Step 8: Implement authenticated preference observation scope**

action: Add `packages/x402-canton/src/package-preference-observation.ts` and types that accept only independently verified references for the exact two-name requirements, synchronizer, vetting time, conservative parties, acquisition start, and authenticated subject, then expose an immutable projection.

loop: until observation scope tests pass

max_iterations: 3

verify: PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:$PATH pnpm vitest run packages/x402-canton/test/package-preference-observation.test.ts -t 'scope|metadata|ordering|mutation'

gate: human

- [x] **Step 9: Implement observation freshness and one-use claiming**

action: Complete the observation module's 60-second ceiling, execution-time vetting equality, monotonic acquisition checks, token-subject stability, and exactly-once claim that yields one immutable projection consumed by both commitment and command construction.

loop: until all observation tests pass

max_iterations: 3

verify: PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:$PATH pnpm vitest run packages/x402-canton/test/package-preference-observation.test.ts

gate: human

- [x] **Step 10: Define Five North preference transport RED tests**

action: Add `spikes/devnet-payment/test/five-north-package-preference.test.ts` requiring one bounded authenticated POST to the configured preferred-packages endpoint, exact two-name requirements, exact conservative parties, synchronizer and vetting time, bounded response parsing, stable token subject, no ambiguous retry, and no submit/sign surface.

loop: false

max_iterations: 1

verify: sh -c 'PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:$PATH pnpm vitest run spikes/devnet-payment/test/five-north-package-preference.test.ts > /tmp/sotto-five-north-preference-red.log 2>&1; status=$?; cat /tmp/sotto-five-north-preference-red.log; test "$status" -ne 0 && rg -q "FIVE_NORTH_PACKAGE_PREFERENCE_NOT_IMPLEMENTED" /tmp/sotto-five-north-preference-red.log'

gate: human

- [x] **Step 11: Implement the Five North preference reader**

action: Add `spikes/devnet-payment/src/five-north-package-preference.ts`; extend the bounded request and transport modules so the purchase path acquires only the reviewed closure for the exact parties, synchronizer, and execution window with bounded code-only failures and independent artifact metadata verification.

loop: until Five North preference tests pass

max_iterations: 3

verify: PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:$PATH pnpm vitest run spikes/devnet-payment/test/five-north-package-preference.test.ts spikes/devnet-payment/test/five-north-prepare-transport.test.ts spikes/devnet-payment/test/five-north-purchase-readers.test.ts

- [x] **Step 12: Define purchase-v3 canonical migration RED tests**

action: Extend commitment, discriminator, ledger-intent, and mutation tests with one deliberate `PURCHASE_V3_NOT_IMPLEMENTED` failure requiring explicit `sotto-purchase-v3` and `sotto-purchase-attempt-v3`, rejecting v2 at this boundary, binding every closure hash, name, ID, version, party requirement, synchronizer, vetting time, and observation identity, and proving every mutation causes zero downstream prepare or sign calls.

loop: false

max_iterations: 1

verify: sh -c 'PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:$PATH pnpm vitest run packages/x402-canton/test/purchase-commitment-vector.test.ts packages/x402-canton/test/purchase-commitment-mutation.test.ts packages/x402-canton/test/purchase-ledger-intent.test.ts > /tmp/sotto-purchase-v3-red.log 2>&1; status=$?; cat /tmp/sotto-purchase-v3-red.log; test "$status" -ne 0 && rg -q "PURCHASE_V3_NOT_IMPLEMENTED" /tmp/sotto-purchase-v3-red.log'

- [ ] **Step 13: Bind package selection into purchase-v3**

action: Extend the purchase commitment, validation, ledger-intent, parser, and projection modules to consume the claimed authenticated projection, bind its package-name/ID mapping and scope, repin canonical bytes and attempt vectors under v3, and reject stale or mismatched selections.

loop: until commitment and intent tests pass

max_iterations: 3

verify: PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:$PATH pnpm vitest run packages/x402-canton/test/purchase-commitment-vector.test.ts packages/x402-canton/test/purchase-commitment-mutation.test.ts packages/x402-canton/test/purchase-commitment-security.test.ts packages/x402-canton/test/purchase-ledger-intent.test.ts packages/x402-canton/test/purchase-ledger-intent-projection.test.ts

gate: human

- [ ] **Step 14: Define exact command preference RED tests**

action: Extend command and security tests with one deliberate `COMMAND_PREFERENCE_NOT_IMPLEMENTED` failure requiring a non-empty unique lexical package-ID list exactly equal to the committed name-sorted mapping projection and rejecting empty, reordered, missing, extra, stale, separately constructed, or twice-claimed preferences before preparation.

loop: false

max_iterations: 1

verify: sh -c 'PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:$PATH pnpm vitest run packages/x402-canton/test/bounded-purchase-command.test.ts packages/x402-canton/test/bounded-purchase-command-security.test.ts > /tmp/sotto-command-preference-red.log 2>&1; status=$?; cat /tmp/sotto-command-preference-red.log; test "$status" -ne 0 && rg -q "COMMAND_PREFERENCE_NOT_IMPLEMENTED" /tmp/sotto-command-preference-red.log'

- [ ] **Step 15: Submit the exact non-empty package preference**

action: Extend bounded command types and construction so the prepare request carries the exact committed lexical package-ID list and freshness is rechecked immediately before construction; integrate the same claimed projection into `prepare-only-purchase.ts` before holdings, registry, and preparation.

loop: until command and prepare-only tests pass

max_iterations: 3

verify: PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:$PATH pnpm vitest run packages/x402-canton/test/bounded-purchase-command.test.ts packages/x402-canton/test/bounded-purchase-command-security.test.ts spikes/devnet-payment/test/prepare-only-purchase.test.ts

- [ ] **Step 16: Replace the root-only prepared fixture with effectful RED coverage**

action: Rewrite the prepared purchase fixture to model the root, TransferFactory exercise, input Holding fetch/consumption, receiver and change Holding creates, replacement capability, PurchaseContext, and exact result; add a deliberate `PREPARED_EFFECTS_NOT_IMPLEMENTED` failure proving the old root-only graph is not signable.

loop: false

max_iterations: 1

verify: sh -c 'PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:$PATH pnpm vitest run packages/x402-canton/test/prepared-purchase-effects.test.ts packages/x402-canton/test/prepared-purchase-validation.test.ts > /tmp/sotto-prepared-effects-red.log 2>&1; status=$?; cat /tmp/sotto-prepared-effects-red.log; test "$status" -ne 0 && rg -q "PREPARED_EFFECTS_NOT_IMPLEMENTED" /tmp/sotto-prepared-effects-red.log'

- [ ] **Step 17: Implement typed graph and factory-subtree verification**

action: Add `prepared-purchase-effects.ts`; extend graph and root parsing to retain typed parent/child nodes and verify the exact factory CID, creation template, V1 interface, selected implementation package, actor/stakeholder sets, transfer arguments, registry context, empty metadata, and Completed result while rejecting absent, additional, Pending, Failed, or unknown exercises.

loop: until root, graph, and factory mutation tests pass

max_iterations: 3

verify: PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:$PATH pnpm vitest run packages/x402-canton/test/prepared-purchase-root.test.ts packages/x402-canton/test/prepared-purchase-graph.test.ts packages/x402-canton/test/prepared-purchase-effects.test.ts -t 'root|factory|exercise|package|actor|result'

- [ ] **Step 18: Implement capability and context effect verification**

action: Verify exactly one replacement capability and PurchaseContext, exact root-result contract references, revision increment, allowance debit, challenge/request/purchase commitments, parties, and rejection of missing, duplicate, extra, or mutated Sotto creates.

loop: until capability and context mutation tests pass

max_iterations: 3

verify: PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:$PATH pnpm vitest run packages/x402-canton/test/prepared-purchase-effects.test.ts -t 'capability|context|revision|commitment|allowance'

- [ ] **Step 19: Implement Holding linkage and debit verification**

action: Verify one-to-one input, archive, receiver, and change Holding linkage; exact owner, instrument, principal, amount, and contract references; debit conservation; fee and allowance bounds; and rejection of every unclassified value-bearing effect.

loop: until Holding and accounting mutation tests pass

max_iterations: 3

verify: PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:$PATH pnpm vitest run packages/x402-canton/test/prepared-purchase-effects.test.ts packages/x402-canton/test/prepared-purchase-metadata.test.ts packages/x402-canton/test/prepared-purchase-validation.test.ts -t 'holding|debit|fee|amount|unclassified|linkage'

- [ ] **Step 20: Add the zero-signing boundary matrix**

action: Add `bounded-purchase-signer-boundary.ts` with an injected claim port and recording fake only; require fresh authenticated package selection, exact command preference, complete semantic prepared verification, official local hash recomputation, one claim, and opaque signing, while every package, party, node, result, value, fee, expiry, hash, replay, or unknown-effect mutation leaves signing at zero calls. Do not use `.env`, a signer URL, a real signer, or claim durability.

loop: until the signer boundary matrix passes

max_iterations: 3

verify: PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:$PATH pnpm vitest run packages/x402-canton/test/bounded-purchase-signer-boundary.test.ts

gate: human

- [ ] **Step 21: Add a bounded redacted prepared-shape recorder**

action: Add `prepared-purchase-shape.ts` and tests producing only reviewed identifiers, node kinds, consuming flags, edge counts, value-shape hashes, input counts, work-unit counters, and timing; prohibit raw values, parties, contract IDs, prepared bytes, and server bodies.

loop: until shape privacy tests pass

max_iterations: 3

verify: PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:$PATH pnpm vitest run packages/x402-canton/test/prepared-purchase-shape.test.ts

- [ ] **Step 22: Tighten deterministic resource envelopes**

action: Replace generic ceilings with reviewed byte, node, edge, depth, input, output, and work-unit limits; add at-cap acceptance and over-cap rejection tests, retain one decode and bounded linear traversal, and record elapsed timing as informational only.

loop: until resource-limit tests pass

max_iterations: 3

verify: PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:$PATH pnpm vitest run packages/x402-canton/test/prepared-purchase-limits.test.ts packages/x402-canton/test/prepared-purchase-validation.test.ts packages/x402-canton/test/bounded-purchase-signer-boundary.test.ts

- [ ] **Step 23: Run the complete deterministic workspace gate**

action: Run pinned workspace verification, correct only failures caused by this feature, preserve the no-sign/no-spend boundary, and commit the reviewed tracked implementation and documentation with conventional commits.

loop: until the complete workspace gate passes and tracked changes are committed

max_iterations: 3

verify: test -z "$(git status --porcelain --untracked-files=all | grep -v '^?? \.hotl/')" && PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:/Users/abu/.dpm/bin:$PATH JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home pnpm verify

- [ ] **Step 24: Verify current HEAD from a clean non-shared clone**

action: Clone current HEAD without shared objects into a temporary directory, install from the frozen lockfile, run the complete pinned gate without `.env.local`, `.thoughts`, prior dependencies, or build output, then remove the temporary directory.

loop: until the clean-clone gate passes

max_iterations: 2

verify: tmpdir="$(mktemp -d)" && trap 'rm -rf "$tmpdir"' EXIT && git clone --no-local . "$tmpdir/repo" && cd "$tmpdir/repo" && PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:/Users/abu/.dpm/bin:$PATH pnpm install --frozen-lockfile && PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:/Users/abu/.dpm/bin:$PATH JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home pnpm verify

- [ ] **Step 25: Perform the pre-observation security review**

action: Add `scripts/check-package-boundary-audit.mjs`, review current HEAD and deterministic evidence for closure exhaustiveness, source and ID/name provenance, package TOCTOU, process-bound branding, ambiguous-outcome refresh, shared-credential bypass, evidence privacy, version migration, zero-signing behavior, and absence of live signing or spending, then record required markers and verdict in `.thoughts/verification/2026-07-14-package-selection-signer-boundary.md`.

loop: false

max_iterations: 1

verify: PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:$PATH node scripts/check-package-boundary-audit.mjs .thoughts/verification/2026-07-14-package-selection-signer-boundary.md

gate: human

- [ ] **Step 26: Capture one explicit-preference prepared shape**

action: After a separately recorded human `secret_access` approval, run one authenticated prepare-only request with the exact committed preference, capture only `.thoughts/research/2026-07-14-five-north-prepared-purchase-shape.md`, and stop on unreviewed packages/effects or an ambiguous response. Do not sign, execute, settle, request faucet funds, or retry.

loop: false

max_iterations: 1

verify:
  type: artifact
  path: .thoughts/research/2026-07-14-five-north-prepared-purchase-shape.md
  assert:
    kind: exists

gate: human

- [ ] **Step 27: Close the Context Engineering verdict**

action: Update the private verification audit with active, clean-clone, security-review, and prepare-only evidence; record exact pass/fail traceability and remaining restricted-signer, human-approval, public-Scan, and Postgres blockers; retain explicit `NO_GO` and do not authorize signer deployment, payment, faucet use, marketplace runtime, Redis authority, or production planning.

loop: false

max_iterations: 1

verify: PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:$PATH node scripts/check-context.mjs && PATH=/Users/abu/.local/share/mise/installs/node/24.18.0/bin:$PATH node scripts/check-package-boundary-audit.mjs .thoughts/verification/2026-07-14-package-selection-signer-boundary.md

gate: human
