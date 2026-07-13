# Five North DevNet Spike Result

Date: 2026-07-13

## Verdict

`NO_GO` for production planning. The research path proved a real
participant-hosted payment, private Daml state, atomic composition, rollback,
and delivery reconciliation through Sotto's direct Five North adapter. It did
not prove a bypass-resistant signer, upstream relay equivalence, an exact Loop
human-payment path on the Five North participant, or public Scan visibility for
the accepted transfer.

## Source And Evidence

- Implementation commit: `01d2d2acad4596fdae9c55601399902fb95543e7`.
- Structured redacted evidence:
  [devnet-spike-evidence.json](devnet-spike-evidence.json).
- A non-shared, cache-disabled clone of the implementation commit passed a
  frozen install, 93 tests across 17 files, every repository guard, both Daml
  builds, and five Daml Script suites.
- The research DAR is `sotto-control` 0.1.0, built with Daml SDK 3.5.2. Node
  24.18.0, pnpm 11.12.0, Java 21.0.11, and DPM 1.0.21 are pinned.

The live transactions were executed from the preceding uncommitted worktree. The
implementation commit is the first immutable post-run snapshot and includes
route-binding and rejection-oracle hardening. The exact source commit at live
execution time is therefore unavailable and is not retroactively claimed.

The evidence bundle contains no credential, access token, raw key, prepared
transaction, request body, or paid response body.

## Network And Adapter Boundary

- Network: Five North Canton DevNet on the shared `5n sandbox` validator.
- Synchronizer:
  `global-domain::1220be58c29e65de40bf273be1dc2b266d43a9a002ea5b18955aeef7aac881bb471a`.
- Ledger API, OIDC, validator Scan-proxy, and Lighthouse service hosts are
  listed without credentials in the structured evidence.
- Settlement used a narrow Ledger API v2 `AmuletRules_Transfer` adapter and a
  temporary Sotto x402-v2-compatible provider. No upstream FTPtech relay or
  provider was used, so upstream interoperability is not established.

## Proven Live

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

The payment amount was 0.2500000000 test Canton Coin. The baseline settlement
was recorded at `2026-07-13T06:37:38.471765Z`; the atomic settlement was
recorded at `2026-07-13T07:17:30.848955Z`. Command IDs, offsets, workflow IDs,
request commitment, and package lifecycle timestamps are in the structured
evidence.

## Visibility Result

The atomic context was visible to agent, owner, payer, and provider. The reduced
policy was visible to agent, owner, and payer, but not provider. A fresh
outsider party saw neither contract in explicit party-scoped ACS queries. They
prove Daml stakeholder semantics, not credential isolation, because the shared
machine credential can read as any party. Outsider event/direct lookup and
public Scan absence were not completed and are not claimed.

## Negative Results And Boundaries

- The shared Five North machine credential has participant administration,
  read-any, and the named payer/agent/provider `actAs` rights. The same
  credential can submit `AmuletRules_Transfer` directly without consuming Sotto
  policy. The baseline transfer succeeded before the policy existed, so this
  signer and funding model is bypassable.
- Atomic composition is available, but the current canonical identifier does not
  independently commit every required challenge, expiry, policy-CID, and
  policy-revision field at a constrained signer boundary. Full purchase
  commitment enforcement is therefore not proven.
- At live execution time, the temporary local provider bridge reconstructed the
  configured public URL instead of preserving the incoming path/query. The
  successful client did request that configured URL, but live route-mutation
  rejection is not proven. The implementation commit fixes this boundary and
  adds wrong-path/query tests.
- Loop and Seaport are authenticated and Seaport exposes custom DAR upload, but
  the Personal workspace has no validator configuration. The Loop party belongs
  to a different participant topology and was rejected as an unknown informee by
  the Five North transfer path. Exact human one-call payment is not proven.
- Outsider absence is proven only for party-scoped ACS queries. Outsider
  event/direct lookup is not proven. Public explorer/Scan visibility of the
  accepted Canton Coin transfer is also not proven because the available route
  did not expose the transaction.
- The provider-failure check used a stopped temporary provider after successful
  deliveries. It proves settlement/delivery separation and no automatic
  repayment, but not first-delivery failure handling in a durable runtime.
- Pre/post authoritative balance snapshots, the exact raw challenge hash, and
  the paid-response hash were not preserved. Same-command submission replay and
  a genuinely ambiguous submission outcome were not exercised live.

## Decision Inputs

- Q-003 remains unresolved. Atomic composition works, but the available
  credential can bypass policy through a generic transfer. That candidate is
  rejected for bounded authority.
- Q-004 remains unresolved. The fixture audience proved owner, agent, payer, and
  provider visibility, but it does not select the production receipt readers.
- Q-005 remains unresolved. Loop is authenticated on a different participant
  topology and did not authorize the same Five North payment.
- Q-006 remains unresolved. A production process/database/queue topology cannot
  be selected before the signer and recovery boundaries are closed.

## Gate Consequence

The spike must not authorize marketplace, Composer, CLI/MCP, bounded-agent, or
Coolify production implementation. Next work is limited to blocker remediation:
a credential that cannot authorize generic transfers, a complete canonical
purchase commitment at that signer boundary, the exact Five North-compatible
human approval route, and public settlement observation.
