# Five North DevNet Spike Result

Date: 2026-07-17 (original payment run: 2026-07-13)

## Verdict

`NO_GO` for production planning. The research path now proves a real
external-agent-only bounded purchase, private Daml state, atomic settlement and
capability reduction, exact paid delivery, cached replay without a second
submission, a matched prepare-only direct-transfer authority control, and a
fully verified policy-free human preparation on Five North. The signer/funding-
authority blocker and the human prepare/effect/hash gate are closed for the
spike.

Production remains blocked by exact human approval, signing, execution,
settlement and paid delivery, public explorer visibility, durable
PostgreSQL-backed delivery/recovery, the production topology, and decisions
Q-004 through Q-006. Upstream relay equivalence is also not established.

## Source And Evidence

- Reviewed implementation commit: `ba1173c92f6bca30abd2692365671e00344c845b`.
- Initial post-run snapshot: `01d2d2acad4596fdae9c55601399902fb95543e7`.
- Wallet-capability remediation commit:
  `ac2c60907ee020757f0daf8c2512322630d73227`.
- External-agent purchase implementation checkpoints: `d0d2d40` and `3780b22`.
- Human prepare-only verification commit: `d5a0cf3`.
- The live external-agent purchase recorded `d12363f` as its tracked source
  commit. Prepared-transaction verifier and provider changes were still dirty
  and uncommitted during that run, so neither later implementation checkpoint is
  retroactively claimed as its exact source.
- Structured redacted evidence:
  [devnet-spike-evidence.json](devnet-spike-evidence.json).
- The earlier July 13 implementation passed a non-shared, cache-disabled clone
  proof with a frozen install, 104 tests across 17 files, every repository
  guard, both Daml builds, and five Daml Script suites.
- The external-agent remediation evidence commit `0f1d872` passed a separate
  non-local clean clone with no Git alternates or private artifacts, an empty
  dependency store, a frozen install, 1,487 tests across 172 files, fresh Daml
  builds/tests, and every repository guard.
- The original July 13 research DAR is `sotto-control` 0.1.0, built with Daml
  SDK 3.5.2. Node 24.18.0, pnpm 11.12.0, Java 21.0.11, and DPM 1.0.21 are
  pinned.

The July 13 transactions were executed from the preceding uncommitted worktree.
The initial post-run commit is their first immutable snapshot; the reviewed
implementation commit adds route binding, exact rejection oracles, exact
AmuletRules identity, pre-submission request-binding enforcement, and exact
Sotto package identity. The exact July 13 source commit is therefore
unavailable. The July 16 external-agent purchase has the narrower provenance
statement above: `d12363f` is the tracked base, not an exact snapshot of the
dirty verifier/provider worktree.

The evidence bundle contains no credential, access token, raw key, prepared
transaction, request body, or paid response body.

## Proven Live Capability Remediation

- On July 16, a wallet-controlled external payer signed one exact
  `BoundedPurchaseCapability` create through the Wallet SDK reference connector.
  The Sotto application never received the raw payer key.
- The wallet independently checked the prepared transaction and Canton V2 hash,
  matched a mode-`0600` one-use policy, persisted the claim before key access,
  and returned one signature. The application recorded execution intent before
  dispatch and did not replay after the immediate response became ambiguous.
- Read-only completion reconciliation found the exact command succeeded at
  offset `4392791`. A payer-scoped ACS read found exactly one matching active
  capability, contract
  `0025b865a38a3a1cea1c730549e2c281f9b8073cdc3b1bf3b1199f7aa48057f877ca121220380798b67236d566550aed355fd3688d0df4f1f5369215726d92753f121b8e4e`.
- The accepted update is
  `12203c28c0e7986e52e2198b1b3401deccbdb5897f7b4a27ade589d2b2d396494496`. The
  action created one capability and submitted zero purchase, settlement, or
  Canton Coin transfer commands.
- This proves the capability-creation custody boundary for the reference-wallet
  spike. It does not prove Loop compatibility or a production wallet service.
  The subsequent purchase and authority-control evidence is recorded separately
  below.

## Proven Live External-Agent Purchase

- One fresh x402 challenge completed an exact `402 -> settle -> 200` flow on
  Five North. The external agent alone exercised the `Purchase` choice; the
  application did not submit with payer `actAs` authority.
- Accepted update
  `1220a389588fc2b677ce956c03af93f65ce537b29aea244e815022cde54b492811e3` settled
  at offset `4404758`. Its effects paid the provider 0.25 Canton Coin, returned
  0.75 to the payer, and created a revision-1 replacement capability with 0.075
  remaining allowance.
- An early lookup at offset `4404757` found no terminal result. Later exact
  reconciliation at offset `4404758` proved success. The implementation now
  treats absence as non-terminal and recognizes only exact success or rejection
  as terminal command completion.
- The first paid retry returned `200`. A byte-identical cached replay returned
  `200` again without a second Ledger submission.
- A matched direct-transfer prepare-only control ran at offset `4406019`. The
  agent result was exactly `MISSING_PAYER_AUTHORITY`, the payer control was
  `PREPARED`, and `executeCalls` remained zero. No direct-transfer control was
  signed, executed, or submitted, so this is an exact authorization oracle, not
  an executed rejection claim.
- The direct control ran with `d0d2d40` as the tracked commit and the exact
  pinned-holding parser fix still uncommitted. `3780b22` is the immediate
  post-run snapshot of that source tree, not a retroactive run-time commit.
- Implementation checkpoints `d0d2d40` and `3780b22` preserve the hardened
  verifier, signer authorization, provider retry boundary, terminal recovery,
  and direct authority control. They are post-run snapshots rather than a
  retroactive exact source claim for the live purchase.

## Proven Live Human Prepare-Only Gate

- On July 17, the clean tracked source at `d5a0cf3` observed a fresh provider
  `402`, authenticated the reference-wallet payer profile, selected live payer
  holdings, acquired current package preference and TransferFactory context, and
  requested one real Five North interactive preparation.
- The verifier decoded the complete prepared Token transfer graph and checked
  its roots, descendants, packages, parties, input contracts, result shapes,
  recipient, instrument, amount, fee/debit accounting, metadata, and time
  bounds. It then independently recomputed the official Canton V2 prepared-
  transaction hash and matched the participant response.
- The safe terminal status was `prepared-hash-verified-not-signed`. The path
  requested no wallet approval, performed no signing operation, made zero
  execute calls, submitted no settlement, performed no paid retry, and caused no
  Canton Coin debit.
- This closes the human preparation/effect/hash gate only. It does not prove
  approval UX, a wallet-held signature, execution, settlement, authentic paid
  delivery, Loop compatibility, or production custody.

## Network And Adapter Boundary

- Network: Five North Canton DevNet on the shared `5n sandbox` validator.
- Synchronizer:
  `global-domain::1220be58c29e65de40bf273be1dc2b266d43a9a002ea5b18955aeef7aac881bb471a`.
- Ledger API, OIDC, validator Scan-proxy, and Lighthouse service hosts are
  listed without credentials in the structured evidence.
- The original July 13 settlement used a narrow Ledger API v2
  `AmuletRules_Transfer` adapter. The external-agent remediation exercised the
  Sotto `Purchase` capability and nested standard token transfer through the
  direct Five North adapter and temporary Sotto provider. No upstream FTPtech
  relay or provider was used, so upstream interoperability is not established.

## Earlier July 13 Live Evidence

- A participant-hosted Sotto payer completed a real
  `402 -> Canton Coin transfer -> 200` through Sotto's direct Five North adapter
  and temporary HTTPS provider. Replaying the same proof returned `200` without
  submitting a second payment. This does not prove the external-party signer
  gate or upstream relay/provider equivalence.
- The `sotto-control` DAR was uploaded through Ledger API v2 and the package was
  present on the participant. Package ID:
  `f72d7eb34869dc6de68db89ecb1b1d11bef9ed1379e6a1903590f9e735cb963e`.
- The policy package rejected over-limit, duplicate, stale-CID, expired, paused,
  revoked, and conflicting consumption in local Daml Script coverage. Its live
  stakeholder views matched the authority matrix.
- One fresh HTTP challenge produced one accepted Canton update that exercised
  `PurchasePolicyProbe.Consume`, created one reduced policy and one private
  `PurchaseContextProbe`, and exercised `AmuletRules_Transfer`.
- An amount-mutated combined command was rejected before the accepted command.
  The original policy and payer holding remained unchanged. The original run did
  not durably retain the server's exact rejection reason; the committed runner
  now requires `amount exceeds per-call limit` before classifying a future run
  as that oracle.
- The accepted proof returned HTTP `[402, 200, 200]`. After the temporary
  provider was stopped, the same settlement still reconciled as accepted, the
  reduced allowance remained consumed, and no second payment was submitted.

## Evidence Identifiers

| Evidence                             | Identifier                                                                                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline attempt                     | `sha256:0b12cd116a897ad29b99d8f1ef9a70fc0c8aa0e721c33f13e84dfde74e4a1204`                                                                    |
| Baseline payment update              | `12208b5fae8a0600ead0fbca599484b4b44f43f9d3fde063dd0ebea2abd6966bde75`                                                                       |
| First policy create update           | `122028174e1f5e80933ee80366f63ca278c6134e0a77e29b8ff133ea9fd2431f58cf`                                                                       |
| First policy consume update          | `12200427f26233c7f5be019d9785a28ff63e1d341ae98915d11e5cf97efed85af1b4`                                                                       |
| Atomic attempt                       | `sha256:ddf4c78367ab53edb38f73f76270ff42cfe2512e527b31afc35342a20114ea64`                                                                    |
| Atomic policy create update          | `12201d95dd4825992c4033700d8256f0755f5bd5679a60ed9fa141470c307d4eaa2c`                                                                       |
| Atomic payment/policy/context update | `1220a32bf2bc1e922dc6afab829b8d04de41630d23548df495cd78d75273595da7e7`                                                                       |
| Atomic reduced policy                | `00e32e7e431d20e4466fea529293d086e43bfeac5e7185a708104a21d8e935bd88ca1212208f5964421a15cf31097c298f0d6e17ea17273263e80c4c7c6c1047b51b5d0462` |
| Atomic private context               | `001a9e05a9616f0cdde67eebadbeb1321261690642bfe15888e06debf94071e361ca12122022d61e5456ec74dd464e61b0b101a1826697e90cc8062e0a31868be49ce5bd6d` |
| Wallet capability create update      | `12203c28c0e7986e52e2198b1b3401deccbdb5897f7b4a27ade589d2b2d396494496`                                                                       |
| Wallet-created capability            | `0025b865a38a3a1cea1c730549e2c281f9b8073cdc3b1bf3b1199f7aa48057f877ca121220380798b67236d566550aed355fd3688d0df4f1f5369215726d92753f121b8e4e` |
| External-agent purchase update       | `1220a389588fc2b677ce956c03af93f65ce537b29aea244e815022cde54b492811e3`                                                                       |

The payment amount was 0.2500000000 test Canton Coin. The baseline settlement
was recorded at `2026-07-13T06:37:38.471765Z`; the atomic settlement was
recorded at `2026-07-13T07:17:30.848955Z`. Command IDs, offsets, workflow IDs,
request commitment, and package lifecycle timestamps are in the structured
evidence.

## Visibility Result

For the external-agent purchase, payer, agent, and provider could each read the
private purchase context. The outsider read found zero matching contexts, and
the outsider's direct transaction lookup returned `404`. Lighthouse also
returned `404` while its index was stale, so public explorer visibility is not
proven.

The atomic context was visible to agent, owner, payer, and provider. The reduced
policy was visible to agent, owner, and payer, but not provider. A fresh
outsider party saw neither contract in explicit party-scoped ACS queries. They
prove Daml stakeholder semantics, not credential isolation, because the shared
machine credential can read as any party. Those earlier results remain
historical evidence; the external-agent visibility result above is the current
spike boundary.

## Negative Results And Boundaries

- At the July 13 spike, the shared Five North machine credential had participant
  administration, read-any, and the named payer/agent/provider `actAs` rights.
  That credential submitted `AmuletRules_Transfer` directly without consuming
  Sotto policy. The baseline transfer succeeded before the policy existed, so
  that signer and funding model was bypassable.
- A July 15 read-only authority recheck found 66 current rights. Participant
  administration and execute-as-any-party remained, but named external-payer
  `CanActAs` was absent. The July 16 wallet-signed capability create then
  succeeded without granting that authority to the Sotto application. The later
  agent-only capability purchase and matched direct prepare-only authority
  control close this signer/funding blocker for the spike. The control was not
  executed and is not claimed as an on-ledger rejected transfer.
- At the July 13 live execution time, the temporary local provider bridge
  reconstructed the configured public URL instead of preserving the incoming
  path/query. The successful client did request that configured URL, but that
  run did not prove live route-mutation rejection. The implementation commit
  fixes this boundary and adds wrong-path/query tests.
- Loop and Seaport are authenticated and Seaport exposes custom DAR upload, but
  the Personal workspace has no validator configuration. The Loop party belongs
  to a different participant topology and was rejected as an unknown informee by
  the Five North transfer path. The reference-wallet human preparation now
  passes complete effect and hash verification, but exact human approval,
  signing, settlement, and delivery are not proven.
- Outsider private-context absence and outsider direct-transaction `404` are
  proven for the external-agent update. Public explorer/Scan visibility is not:
  Lighthouse returned `404` while its index was stale.
- The provider-failure check used a stopped temporary provider after successful
  deliveries. It proves settlement/delivery separation and no automatic
  repayment, but not first-delivery failure handling in a durable runtime.
- The latest provider retry and unknown-delivery state is explicitly
  process-memory spike state. A process restart loses that coordination;
  PostgreSQL-backed delivery, replay, and recovery state is required before
  production.
- Pre/post authoritative balance snapshots, the exact raw challenge hash, and
  the paid-response hash were not preserved. Same-command submission replay and
  a genuinely ambiguous submission outcome were not exercised live.

## Decision Inputs

- Q-003 is resolved for the spike. The agent-only bounded purchase succeeded,
  and the matched prepare-only direct-transfer oracle proved missing payer
  authority with zero execute calls.
- Q-004 remains unresolved. The current audience proof covers payer, agent, and
  provider with outsider absence, but it does not select the production receipt
  readers.
- Q-005 remains unresolved. The reference-wallet path now prepares and verifies
  the exact Five North transfer, but it has not approved, signed, executed, or
  delivered that payment. Loop is authenticated on a different participant
  topology and did not authorize the same Five North payment.
- Q-006 remains unresolved. Durable PostgreSQL delivery/recovery and the final
  process/database/queue topology are not selected.

## Gate Consequence

The spike must not yet authorize marketplace, Composer, CLI/MCP, bounded-agent,
or Coolify production implementation. The signer/funding-authority proof is no
longer the blocker, and the human preparation/effect/hash gate is complete. Next
work is exact wallet-neutral human approval, signing, execution, settlement and
paid delivery, followed by public settlement observation, durable PostgreSQL-
backed delivery/recovery and production topology, and explicit decisions Q-004
through Q-006.
