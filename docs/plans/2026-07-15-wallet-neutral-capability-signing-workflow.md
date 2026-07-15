---
intent: Let a payer approve one exact Sotto PurchaseCapability creation with a real Canton wallet while keeping payer keys and generic payer authority outside Sotto.
success_criteria: A wallet-neutral signing core, separate Wallet SDK reference connector, OpenRPC adapter contract, exact prepared-create verifier, one-shot execute journal, and one real externally signed Five North capability creation all pass without restoring payer actAs to the shared credential.
risk_level: high
auto_approve: true
branch: codex/phase-3-authority-remediation
worktree: false
---

## Steps

- [x] **Step 1: Freeze the prepared-capability fixture and public RED API**
action: Add `packages/x402-canton/test/prepared-capability-bootstrap.fixtures.ts` with one protobuf `PreparedTransaction` containing the exact authenticated bootstrap create, plus `packages/x402-canton/test/prepared-capability-bootstrap-observation.test.ts` importing the absent `createPreparedCapabilityBootstrapObserver` API and throwing the exact marker `PREPARED_CAPABILITY_OBSERVER_NOT_IMPLEMENTED` if the old surface accepts the fixture.
loop: false
max_iterations: 1
verify: bash -lc 'set +e; output=$(PATH="$HOME/.local/share/mise/installs/node/24.18.0/bin:$PATH" pnpm vitest run packages/x402-canton/test/prepared-capability-bootstrap-observation.test.ts 2>&1); status=$?; test "$status" -ne 0 && grep -q "PREPARED_CAPABILITY_OBSERVER_NOT_IMPLEMENTED\|createPreparedCapabilityBootstrapObserver" <<<"$output"'
gate: human

- [x] **Step 2: Parse the bounded prepare response**
action: Add `packages/x402-canton/src/prepared-capability-bootstrap-types.ts`, `prepared-capability-bootstrap-response.ts`, and `prepared-capability-bootstrap-observation.ts`; require exact camel-case REST response keys, canonical base64, `HASHING_SCHEME_VERSION_V2`, a nonempty prepared transaction no larger than 2 MiB, a total response no larger than 3 MiB, one authenticated bootstrap request, one-use observation provenance, and freshness bounded by the capability expiry.
loop: until the focused observation tests pass
max_iterations: 4
verify: PATH="$HOME/.local/share/mise/installs/node/24.18.0/bin:$PATH" pnpm vitest run packages/x402-canton/test/prepared-capability-bootstrap-observation.test.ts
gate: human

- [x] **Step 3: Add root and metadata RED cases**
action: Add `packages/x402-canton/test/prepared-capability-bootstrap-shape.test.ts` covering zero or multiple roots, non-create roots, extra nodes, unknown node variants, wrong package/template/package-name, changed contract argument, signatories or stakeholders, wrong `actAs`/`readAs`, command ID, user ID, synchronizer, package preference, workflow ID, and record-time bounds; retain a single exact accepted fixture.
loop: false
max_iterations: 1
verify: bash -lc 'set +e; output=$(PATH="$HOME/.local/share/mise/installs/node/24.18.0/bin:$PATH" pnpm vitest run packages/x402-canton/test/prepared-capability-bootstrap-shape.test.ts 2>&1); status=$?; test "$status" -ne 0 && grep -q "prepared capability" <<<"$output"'

- [x] **Step 4: Verify the exact prepared create graph**
action: Add `packages/x402-canton/src/prepared-capability-bootstrap-shape.ts`, `prepared-capability-bootstrap-metadata.ts`, and `prepared-capability-bootstrap-values.ts`; decode once with `@canton-network/core-ledger-proto`, reject unknown protobuf fields, require exactly one create root and no other effects, and compare every node and metadata value against the authenticated bootstrap request.
loop: until the shape tests pass
max_iterations: 4
verify: PATH="$HOME/.local/share/mise/installs/node/24.18.0/bin:$PATH" pnpm vitest run packages/x402-canton/test/prepared-capability-bootstrap-shape.test.ts packages/x402-canton/test/prepared-capability-bootstrap-observation.test.ts
gate: human

- [x] **Step 5: Add the exhaustive prepared-create mutation matrix**
action: Add `packages/x402-canton/test/prepared-capability-bootstrap-mutations.cases.ts` and register it from the shape suite; mutate every capability argument, root identity, party list, package selection, metadata field, timestamp boundary, node seed, and unknown field independently and assert rejection before any wallet connector dependency is invoked.
loop: until every mutation has a unique passing rejection assertion
max_iterations: 4
verify: PATH="$HOME/.local/share/mise/installs/node/24.18.0/bin:$PATH" pnpm vitest run packages/x402-canton/test/prepared-capability-bootstrap-shape.test.ts

- [ ] **Step 6: Project a redacted exact wallet approval summary**
action: Add `packages/x402-canton/src/prepared-capability-bootstrap-approval.ts` and `packages/x402-canton/test/prepared-capability-bootstrap-approval.test.ts`; produce a deeply frozen authenticated projection containing the exact payer, agent, resource hash, recipient, instrument, limits, expiry, revision, transfer factory, network/synchronizer, package ID, and prepared hash while excluding prepared bytes, raw signature material, user credentials, and private authorization data.
loop: until approval projection and secret-seeded redaction tests pass
max_iterations: 4
verify: PATH="$HOME/.local/share/mise/installs/node/24.18.0/bin:$PATH" pnpm vitest run packages/x402-canton/test/prepared-capability-bootstrap-approval.test.ts
gate: human

- [ ] **Step 7: Add the independent V2 hash RED boundary**
action: Add `packages/x402-canton/test/prepared-capability-bootstrap-hash.test.ts` requiring a participant digest, the existing Wallet SDK-compatible precheck, and an injected independent official recomputation to agree byte-for-byte before an approval can be claimed; cover missing, short, long, malformed, stale, and mismatched digests.
loop: false
max_iterations: 1
verify: bash -lc 'set +e; output=$(PATH="$HOME/.local/share/mise/installs/node/24.18.0/bin:$PATH" pnpm vitest run packages/x402-canton/test/prepared-capability-bootstrap-hash.test.ts 2>&1); status=$?; test "$status" -ne 0 && grep -q "prepared capability.*hash\|official.*recomputation" <<<"$output"'

- [ ] **Step 8: Implement authenticated hash verification**
action: Add `packages/x402-canton/src/prepared-capability-bootstrap-hash.ts`; copy prepared bytes before each asynchronous dependency, compare all 32-byte digests in constant time, recheck freshness after each await, authenticate the hash-verified result with process-local provenance, and make its claim one-use.
loop: until the hash and prior verifier suites pass
max_iterations: 4
verify: PATH="$HOME/.local/share/mise/installs/node/24.18.0/bin:$PATH" pnpm vitest run packages/x402-canton/test/prepared-capability-bootstrap-hash.test.ts packages/x402-canton/test/prepared-capability-bootstrap-shape.test.ts packages/x402-canton/test/prepared-capability-bootstrap-approval.test.ts
gate: human

- [ ] **Step 9: Export the prepared-capability verifier boundary**
action: Update `packages/x402-canton/src/index.ts` to export only the observer, verifier, redacted approval types, limits, and connector-safe claim API; keep raw state readers and mutable authority maps internal, and add a public-API test proving those internal readers are absent.
loop: until package build, strict types, and focused tests pass
max_iterations: 3
verify: PATH="$HOME/.local/share/mise/installs/node/24.18.0/bin:$PATH" pnpm --filter @sotto/x402-canton build && PATH="$HOME/.local/share/mise/installs/node/24.18.0/bin:$PATH" pnpm typecheck && PATH="$HOME/.local/share/mise/installs/node/24.18.0/bin:$PATH" pnpm vitest run packages/x402-canton/test/prepared-capability-bootstrap-*.test.ts
gate: human

- [ ] **Step 10: Bound verifier work and measure it**
action: Add `packages/x402-canton/test/prepared-capability-bootstrap-limits.test.ts` for exact and plus-one response bytes, prepared bytes, roots, nodes, fields, value depth, identifier bytes, party counts, and unknown fields; record test-only elapsed microseconds without making latency an authority input.
loop: until exact limits pass and plus-one cases fail closed
max_iterations: 4
verify: PATH="$HOME/.local/share/mise/installs/node/24.18.0/bin:$PATH" pnpm vitest run packages/x402-canton/test/prepared-capability-bootstrap-limits.test.ts
gate: human

- [ ] **Step 11: Review the prepared-create verifier checkpoint**
action: Review the complete prepared-capability diff against `docs/designs/2026-07-15-wallet-neutral-capability-signing-design.md`, the authenticated bootstrap request, Canton V2 protobuf schema, hash contract, mutation coverage, parser bounds, secret redaction, and zero-connector behavior; resolve every BLOCK finding through a separate RED/GREEN cycle.
loop: until the review verdict is READY with no BLOCK finding
max_iterations: 3
verify:
  type: human-review
  prompt: Confirm the exact prepared create and all metadata are independently verified before any wallet connector can be called.
gate: human

- [ ] **Step 12: Define the wallet-neutral connector contract with RED tests**
action: Add `packages/x402-canton/test/capability-wallet-connector.test.ts` defining exact capability negotiation, connector identity, supported network/package/hash scheme/signature formats, one explicit approval request, rejection, timeout, and one signature response; require the absent `createCapabilityWalletSigningSession` API.
loop: false
max_iterations: 1
verify: bash -lc 'set +e; output=$(PATH="$HOME/.local/share/mise/installs/node/24.18.0/bin:$PATH" pnpm vitest run packages/x402-canton/test/capability-wallet-connector.test.ts 2>&1); status=$?; test "$status" -ne 0 && grep -q "createCapabilityWalletSigningSession\|CAPABILITY_WALLET_SESSION_NOT_IMPLEMENTED" <<<"$output"'

- [ ] **Step 13: Implement one-use signing sessions**
action: Add `packages/x402-canton/src/capability-wallet-connector-types.ts` and `capability-wallet-signing-session.ts`; bind a cryptographically random session ID to connector ID, origin, payer, capability-intent hash, prepared hash, network, synchronizer, package, creation time, and expiry; snapshot inputs, enforce a ten-minute maximum, and authenticate one-use state with a private WeakMap.
loop: until the connector session tests pass
max_iterations: 4
verify: PATH="$HOME/.local/share/mise/installs/node/24.18.0/bin:$PATH" pnpm vitest run packages/x402-canton/test/capability-wallet-connector.test.ts
gate: human

- [ ] **Step 14: Parse and verify the party signature envelope**
action: Add `packages/x402-canton/src/capability-wallet-signature.ts` and `packages/x402-canton/test/capability-wallet-signature.test.ts`; require exact payer, canonical base64 signature bytes, supported format and ECDSA-SHA-256 algorithm, canonical `signedBy` fingerprint, registered public-key match where provided, cryptographic signature verification, and no additional parties or signatures.
loop: until signature success, mutation, size, algorithm, fingerprint, and cryptographic failure cases pass
max_iterations: 4
verify: PATH="$HOME/.local/share/mise/installs/node/24.18.0/bin:$PATH" pnpm vitest run packages/x402-canton/test/capability-wallet-signature.test.ts packages/x402-canton/test/capability-wallet-connector.test.ts

- [ ] **Step 15: Create the reusable connector conformance suite**
action: Add `packages/x402-canton/test/capability-wallet-connector.contract.ts`; export a test registrar that every connector adapter must run for discovery, exact scope, approval, user rejection, abort, deadline, mutation, origin binding, replay, malformed response, and zero-signing behavior.
loop: until a recording connector passes every conformance case
max_iterations: 4
verify: PATH="$HOME/.local/share/mise/installs/node/24.18.0/bin:$PATH" pnpm vitest run packages/x402-canton/test/capability-wallet-connector.test.ts packages/x402-canton/test/capability-wallet-signature.test.ts

- [ ] **Step 16: Pin the separate Wallet SDK reference workspace**
action: Add `spikes/capability-wallet/package.json` with exact Apache-2.0 dependency `@canton-network/wallet-sdk` version `1.4.0`, `@sotto/x402-canton` as a workspace dependency, and build/test scripts; add `spikes/capability-wallet/tsconfig.build.json`, update `pnpm-lock.yaml` with a frozen install, and add a provenance test asserting npm integrity `sha512-uskdurYd9HgNSXisFUHFkpEFnZTusd0XJ4oBIDnyI2DrM+9TfJk1Z/s2qF1+J2f6B6OswE3oHwyjY39tyXLURg==` and repository `canton-network/wallet`.
loop: until install, license guard, provenance test, and workspace build pass
max_iterations: 4
verify: PATH="$HOME/.local/share/mise/installs/node/24.18.0/bin:$PATH" pnpm install --frozen-lockfile && PATH="$HOME/.local/share/mise/installs/node/24.18.0/bin:$PATH" pnpm --filter @sotto/capability-wallet build && PATH="$HOME/.local/share/mise/installs/node/24.18.0/bin:$PATH" node scripts/check-licenses.mjs

- [ ] **Step 17: Add owner-only Wallet SDK handoff storage**
action: Add `spikes/capability-wallet/src/wallet-handoff-storage.ts` and `spikes/capability-wallet/test/wallet-handoff-storage.test.ts`; require an ignored directory with mode `0700`, request/response/key files with mode `0600`, atomic create-without-overwrite, canonical bounded JSON, no symlinks, no traversal, no group/world access, and deletion of expired raw transaction/signature artifacts.
loop: until filesystem permission, symlink, overwrite, crash, and cleanup tests pass
max_iterations: 4
verify: PATH="$HOME/.local/share/mise/installs/node/24.18.0/bin:$PATH" pnpm vitest run spikes/capability-wallet/test/wallet-handoff-storage.test.ts
gate: human

- [ ] **Step 18: Implement the Wallet SDK reference connector process**
action: Add `spikes/capability-wallet/src/reference-wallet.ts`, `reference-wallet-cli.ts`, and `test/reference-wallet.test.ts`; read one owner-only signing request, independently recompute the V2 hash with the pinned SDK path, render the exact approval summary, require an explicit approval flag supplied outside Sotto, sign with a wallet-owned key file without printing it, emit one canonical response, and erase transient key bytes from application buffers.
loop: until the reference wallet passes the shared connector conformance suite and package build
max_iterations: 5
verify: PATH="$HOME/.local/share/mise/installs/node/24.18.0/bin:$PATH" pnpm vitest run spikes/capability-wallet/test/reference-wallet.test.ts packages/x402-canton/test/capability-wallet-connector.test.ts && PATH="$HOME/.local/share/mise/installs/node/24.18.0/bin:$PATH" pnpm --filter @sotto/capability-wallet build

- [ ] **Step 19: Implement the OpenRPC connector adapter**
action: Add `spikes/devnet-payment/src/openrpc-capability-wallet.ts` and `spikes/devnet-payment/test/openrpc-capability-wallet.test.ts`; support injected embedded or extension providers, negotiate custom prepared-transaction signing and V2 hash support before approval, bind provider origin and payer, pass only the canonical signing session, validate JSON-RPC IDs/errors/results, and return an explicit unsupported verdict for Loop or another provider that lacks the required capability.
loop: until the OpenRPC adapter passes the shared connector contract and malformed-provider tests
max_iterations: 5
verify: PATH="$HOME/.local/share/mise/installs/node/24.18.0/bin:$PATH" pnpm vitest run spikes/devnet-payment/test/openrpc-capability-wallet.test.ts packages/x402-canton/test/capability-wallet-connector.test.ts

- [ ] **Step 20: Harden connector privacy and replay behavior**
action: Add `packages/x402-canton/test/capability-wallet-security.cases.ts` and adapter-specific security cases covering cloned sessions, changed origin, payer, package, network, synchronizer, summary, hash, stale time, duplicate approval, duplicate signature, oversized response, key-like strings, raw prepared bytes in logs/evidence, and post-claim connector calls.
loop: until all connector security cases pass with zero calls at the correct boundary
max_iterations: 4
verify: PATH="$HOME/.local/share/mise/installs/node/24.18.0/bin:$PATH" pnpm vitest run packages/x402-canton/test/capability-wallet-*.test.ts spikes/capability-wallet/test/*.test.ts spikes/devnet-payment/test/openrpc-capability-wallet.test.ts

- [ ] **Step 21: Review the connector and signing-session checkpoint**
action: Review both connector implementations, session provenance, signature verification, private-key isolation, filesystem permissions, OpenRPC origin binding, timeout behavior, dependency provenance, and secret/log redaction; resolve every BLOCK finding with focused RED/GREEN tests before any external Party or live signer is created.
loop: until the review verdict is READY with no BLOCK finding
max_iterations: 3
verify:
  type: human-review
  prompt: Confirm the Sotto process cannot access the wallet key or obtain a signature for a different prepared transaction.
gate: human

- [ ] **Step 22: Add the exact Canton execute transport RED contract**
action: Add `spikes/devnet-payment/test/five-north-capability-execute-transport.test.ts` covering `/v2/interactive-submission/execute`, unchanged prepared bytes, V2 scheme, authenticated user, unique submission ID, empty deduplication period, one payer signature, exact format/algorithm/fingerprint, one network call, 10-second timeout, 2 MiB request cap, bounded response, 401 refresh, and safe status-only errors.
loop: false
max_iterations: 1
verify: bash -lc 'set +e; output=$(PATH="$HOME/.local/share/mise/installs/node/24.18.0/bin:$PATH" pnpm vitest run spikes/devnet-payment/test/five-north-capability-execute-transport.test.ts 2>&1); status=$?; test "$status" -ne 0 && grep -q "capability execute\|createFiveNorthCapabilityExecuteTransport" <<<"$output"'

- [ ] **Step 23: Implement the bounded execute transport**
action: Add `spikes/devnet-payment/src/five-north-capability-execute-transport.ts`; consume only authenticated signed-session state, build the exact current Canton REST envelope, reject raw caller-supplied fields, use the approved Five North origin/path, bound bytes/time/redirects, redact response bodies, and expose one claimed execution result for reconciliation.
loop: until execute transport and existing Five North transport tests pass
max_iterations: 5
verify: PATH="$HOME/.local/share/mise/installs/node/24.18.0/bin:$PATH" pnpm vitest run spikes/devnet-payment/test/five-north-capability-execute-transport.test.ts spikes/devnet-payment/test/five-north-capability-bootstrap-transport.test.ts spikes/devnet-payment/test/five-north-transaction-submit.test.ts
gate: human

- [ ] **Step 24: Extend the bootstrap journal for wallet execution**
action: Update `spikes/devnet-payment/src/capability-bootstrap-journal-primitives.ts`, `capability-bootstrap-journal.ts`, `capability-bootstrap-journal-storage.ts`, and their tests with `prepared-verified`, `approval-requested`, `signature-received`, and `execution-started` records containing only hashes, connector kind, timestamps, and identifiers; preserve backward-readable direct-submit records without permitting them in the wallet runner.
loop: until journal transition, fsync, crash, legacy, and redaction tests pass
max_iterations: 5
verify: PATH="$HOME/.local/share/mise/installs/node/24.18.0/bin:$PATH" pnpm vitest run spikes/devnet-payment/test/capability-bootstrap-journal*.test.ts spikes/devnet-payment/test/capability-bootstrap-lease.test.ts

- [ ] **Step 25: Build the wallet-neutral capability runner**
action: Add `spikes/devnet-payment/src/capability-wallet-bootstrap-runner.ts` and `spikes/devnet-payment/test/capability-wallet-bootstrap-runner.test.ts`; sequence empty preflight, cursor persistence, prepare, complete semantic/hash verification, journal persistence, connector approval, signature verification, execution-start persistence, one execute, completion read, exact ACS read, and dual-evidence resolution.
loop: until success, wallet rejection, verifier rejection, and exact ordering tests pass
max_iterations: 5
verify: PATH="$HOME/.local/share/mise/installs/node/24.18.0/bin:$PATH" pnpm vitest run spikes/devnet-payment/test/capability-wallet-bootstrap-runner.test.ts

- [ ] **Step 26: Prove ambiguous execution recovery without replay**
action: Add `spikes/devnet-payment/test/capability-wallet-bootstrap-recovery.test.ts`; cover timeout before execute, timeout after `execution-started`, malformed 200, HTTP 4xx/5xx, process crash, accepted completion with exact ACS, rejected completion with empty ACS, and unresolved disagreement while asserting zero reprepare, resign, or re-execute calls.
loop: until every recovery case reaches the exact durable verdict
max_iterations: 5
verify: PATH="$HOME/.local/share/mise/installs/node/24.18.0/bin:$PATH" pnpm vitest run spikes/devnet-payment/test/capability-wallet-bootstrap-recovery.test.ts spikes/devnet-payment/test/capability-wallet-bootstrap-runner.test.ts

- [ ] **Step 27: Add the disposable real-process connector integration test**
action: Add `spikes/devnet-payment/test/capability-wallet-process-integration.test.ts`; spawn the separate Wallet SDK reference CLI against an owner-only temporary directory, use a generated test key and the complete prepared-create protobuf, require the real child-process signature to verify in Sotto, and prove cancellation/mutation leaves execute at zero; label the result deterministic integration, never Five North evidence.
loop: until the real child-process path passes without importing wallet key material into the Sotto process
max_iterations: 5
verify: PATH="$HOME/.local/share/mise/installs/node/24.18.0/bin:$PATH" pnpm vitest run spikes/devnet-payment/test/capability-wallet-process-integration.test.ts

- [ ] **Step 28: Run the complete deterministic workspace gate**
action: Run the entire pinned repository gate, fix only failures attributable to this workflow through scoped RED/GREEN cycles, and retain the existing direct-submit evidence and `NO_GO` claims unchanged.
loop: until the complete gate passes from the beginning
max_iterations: 4
verify: PATH="$HOME/.local/share/mise/installs/node/24.18.0/bin:$PATH" pnpm verify

- [ ] **Step 29: Prove a frozen-install non-shared clean clone**
action: Create a temporary `git clone --no-hardlinks` of the exact wallet-integration checkpoint, use an empty pnpm store/cache, run `pnpm install --frozen-lockfile` and `pnpm verify` under Node 24.18.0, and assert `.env.local`, `.thoughts`, `tmp`, wallet keys, prepared bytes, signatures, build output, and dependency stores are absent from the clone before deleting it.
loop: until the clean-clone gate passes from committed source
max_iterations: 3
verify:
  type: human-review
  prompt: Confirm the recorded clean-clone transcript shows a frozen install, complete verify pass, and absence of every private artifact class.
gate: human

- [ ] **Step 30: Perform the pre-live security review**
action: Review the exact committed diff for payer-key isolation, package and prepared-effect completeness, signature authenticity, connector confusion, OpenRPC origin attacks, journal durability, ambiguous outcomes, network allowlists, secret persistence, and direct-submit fallback; resolve every BLOCK or WARN affecting live safety before accessing credentials.
loop: until the review verdict is READY with no BLOCK or live-safety WARN finding
max_iterations: 3
verify:
  type: human-review
  prompt: Confirm the committed path cannot sign or execute without the exact external payer, exact prepared hash, and one explicit wallet approval.
gate: human

- [ ] **Step 31: Add the external-payer onboarding command and dry-run tests**
action: Add `spikes/capability-wallet/src/five-north-external-payer.ts`, `five-north-external-payer-cli.ts`, and tests; generate the wallet key only inside the separate wallet process, persist it mode `0600`, derive and validate the public-key fingerprint, build the current external-party onboarding request, default to dry-run redacted output, and require a distinct explicit live flag for one mutation.
loop: until dry-run, permissions, fingerprint, redaction, abort, and mutation tests pass
max_iterations: 5
verify: PATH="$HOME/.local/share/mise/installs/node/24.18.0/bin:$PATH" pnpm vitest run spikes/capability-wallet/test/five-north-external-payer.test.ts && PATH="$HOME/.local/share/mise/installs/node/24.18.0/bin:$PATH" pnpm --filter @sotto/capability-wallet build
gate: human

- [ ] **Step 32: Run a read-only Five North wallet preflight**
action: Add `spikes/devnet-payment/src/five-north-wallet-preflight.ts` and tests, then run the command with ignored local configuration to verify token subject, interactive prepare/execute endpoint reachability, external-party onboarding capability, Sotto package visibility, synchronizer, agent Party, and absence of payer `actAs`; write only a mode-`0600` redacted preflight under `.thoughts/research`.
loop: until the read-only preflight returns a complete supported or exact unsupported verdict
max_iterations: 3
verify:
  type: artifact
  path: .thoughts/research
  assert:
    kind: matches-glob
    value: "2026-07-15-five-north-wallet-preflight*.md"
gate: human

- [ ] **Step 33: Approve the exact live capability and external payer**
action: Present the redacted external payer fingerprint, agent, resource hash, recipient, instrument, limits, expiry, transfer factory, Sotto package, synchronizer, connector, and zero-purchase statement; require an explicit human approval before onboarding or signing, without exposing key bytes, tokens, prepared bytes, or signature bytes.
loop: false
max_iterations: 1
verify:
  type: human-review
  prompt: Approve the exact displayed one-time external payer onboarding and PurchaseCapability creation.
gate: human

- [ ] **Step 34: Onboard one real wallet-controlled external payer**
action: Run the reviewed live onboarding command exactly once, persist the wallet key only in the owner-only wallet directory, reconcile party/topology state after any ambiguous response, and record a redacted payer Party, public-key fingerprint, synchronizer, timestamps, source commit, and verdict under `.thoughts/research`.
loop: false
max_iterations: 1
verify:
  type: artifact
  path: .thoughts/research
  assert:
    kind: matches-glob
    value: "2026-07-15-five-north-external-payer*.md"

- [ ] **Step 35: Execute one real externally signed capability creation**
action: Run the wallet-neutral bootstrap once with the real external payer: prepare on Five North, verify exact prepared effects and V2 hash, obtain the Wallet SDK reference signature after the approved summary, fsync `execution-started`, execute once, and stop on acceptance, rejection, or ambiguity without retry.
loop: false
max_iterations: 1
verify:
  type: human-review
  prompt: Confirm the private journal records exactly one prepare, one wallet approval, one signature, and at most one execute with no direct command submit.
gate: human

- [ ] **Step 36: Reconcile and record the real Five North result**
action: Read exact completion history and payer-scoped ACS, require one matching capability for success, verify outsider/private visibility only where authorized, and update `docs/architecture/devnet-spike-result.md`, `docs/architecture/daml-privacy-authority-matrix.md`, and a redacted structured evidence artifact without claiming funding, agent purchase, Loop compatibility, human one-call purchase, or production `GO` unless separately proven.
loop: until tracked and private evidence agree with the live authorities
max_iterations: 3
verify: PATH="$HOME/.local/share/mise/installs/node/24.18.0/bin:$PATH" node scripts/check-claims.mjs && PATH="$HOME/.local/share/mise/installs/node/24.18.0/bin:$PATH" node scripts/check-source.mjs && git diff --check
gate: human

- [ ] **Step 37: Close the wallet integration checkpoint**
action: Run `pnpm verify`, perform a final no-hardlinks empty-cache clean clone, request final security and evidence reviews, commit deterministic code and redacted evidence separately, and preserve production `NO_GO` plus the next agent-only purchase/direct-transfer-bypass gate.
loop: until workspace, clean clone, and final review all pass
max_iterations: 3
verify:
  type: human-review
  prompt: Confirm the final committed source is reproducible, the live evidence is real and redacted, no wallet key or raw signing artifact is tracked, and remaining gates are explicit.
gate: human
