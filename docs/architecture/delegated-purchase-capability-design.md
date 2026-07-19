# Delegated Purchase Capability Design

Date: 2026-07-13

## Status

Approved for DevNet blocker remediation. This design selects the candidate that
must now be proven; it does not change the current production verdict from
`NO_GO` and does not claim that Five North already supports the complete path.

Live update, 2026-07-15: the current shared identity no longer has named payer
`CanActAs`. Five North accepted interactive preparation of the exact capability
create but rejected direct command submission with HTTP `403`; exact completion
history and payer-scoped ACS showed no effect. This is consistent with the
selected design's authority direction, but it is not proof of the final boundary
because the identity still has participant administration and
execute-as-any-party, and no payer-controlled external signer is connected.

Live update, 2026-07-16: Five North accepted one externally wallet-signed
capability creation without granting the shared machine identity payer rights.
That capability is deliberately unusable for the next paid call because its
exact resource binding names an expired temporary provider origin. It must not
be reused or weakened to fit a replacement origin.

## External-Payer Replacement Execution

The approved remediation reuses the existing external payer rather than
allocating another payer or abandoning active authority. The sequence is:

1. Use the official Wallet SDK DevNet tap flow to prepare funding for the exact
   external payer, decode and verify the prepared mint effects, and sign only in
   the isolated wallet process.
2. Prepare `Revoke` against the exact obsolete capability. The wallet requires
   one consuming root exercise, payer-only acting authority, no descendants or
   value effects, the approved Sotto package/template, and the expected
   synchronizer before it signs.
3. Reconcile both operations from Ledger completion and ACS evidence before
   continuing. An unknown outcome is read-only until resolved; neither command
   is blindly replayed.
4. Start the paid provider and a fresh spike-only tunnel only after funding and
   revocation are complete. Derive the replacement resource binding from the
   observed public provider URL and create one replacement capability through
   the already proven wallet boundary.
5. Immediately run the strict prepared-purchase verifier, execute with agent
   authority only, reconcile settlement, retry the identical HTTP request, and
   require the authentic paid `200` response.
6. Run the otherwise-valid direct payer-transfer negative control with the same
   agent credential and require rejection for missing payer authority.

The alternative of allocating another external payer is rejected because it
would leave obsolete authority active and multiply key, funding, and recovery
state. Reusing the expired capability or relaxing request/resource equality is
also rejected because it would invalidate the signer-boundary evidence.

The Wallet SDK tap is a DevNet/LocalNet funding mechanism, not a production
faucet or custody design. A Cloudflare quick tunnel is permitted only as a
short-lived spike transport and is not a production provider topology. The
production verdict remains `NO_GO` until the entire agent-only paid call,
negative control, visibility, and recovery evidence pass.

## Decision

Use a payer-signed Daml purchase capability for opt-in autonomous buying. The
capability's purchase choice is controlled by the agent and performs the Token
Standard transfer inside the choice consequences.

The final agent-accessible credential may authorize only the agent Party. It
must not have payer `actAs`, execute-as-any-party, participant administration,
or another interface that can submit a generic payer transfer. The funded payer
must be an external Party whose signing authority remains outside Sotto runtime
services. No Sotto runtime, shared validator credential, or operator automation
may hold generic payer authority. If Five North cannot provide that separation,
the candidate remains `NOT PROVEN` unless a different custody boundary is
explicitly presented and accepted.

Daml consequence authorization makes this candidate possible: the consequences
of a choice receive authority from the choice actors and the exercised
contract's signatories. A payer-signed capability can therefore delegate one
vetted purchase choice to an agent without delegating the payer Party itself.

## Product Lanes

This capability is not global onboarding and is not required for providers or
human buyers.

| Lane                    | Purchase policy | Authority                                        |
| ----------------------- | --------------- | ------------------------------------------------ |
| Browse and publish      | none            | public reads or party-backed Sotto owner session |
| Human one-time purchase | none            | exact fresh wallet approval                      |
| Autonomous purchase     | explicit opt-in | active payer-signed purchase capability          |

If no capability exists, autonomous purchase is unavailable. Browsing,
publishing, Composer preparation, and the eventual one-time human path remain
available according to their own accepted gates.

## Rejected Alternatives

### Shared or low-balance payer credential

Reducing the balance limits losses but does not prevent arbitrary transfers. The
July 13 Five North spike proved that the then-authorized shared M2M credential
could bypass Sotto policy with a generic transfer. The July 15 removal of named
payer `CanActAs` prevents the current credential from serving as the
capability-creation signer; it does not make that shared credential an accepted
agent signer. This candidate remains rejected.

### Transfer instruction or allocation alone

These Token Standard primitives bind useful settlement fields, but creating or
executing them still requires their defined sender and other controller
authority. They do not independently create reusable bounded agent authority.
They may be used beneath the Sotto capability where their workflow fits.

### Narrow custodian signer

A separately isolated payer signer with a complete verifier is a fallback only
if the ledger-enforced capability cannot run on Five North. Its key remains able
to authorize generic payer transfers, so its custody and trust boundary would
require separate explicit acceptance and must never be described as
non-custodial or ledger-enforced.

## Authority Matrix

| Boundary                       | Required authority                                                  |
| ------------------------------ | ------------------------------------------------------------------- |
| Funded Canton Coin holding     | external payer Party; user-controlled signing authority             |
| Purchase capability            | payer signatory; distinct agent observer                            |
| Capability creation/revocation | payer only                                                          |
| Purchase choice                | agent controller only                                               |
| Nested token transfer          | payer authority inherited only inside capability consequences       |
| Agent credential               | agent Party only                                                    |
| Provider receipt               | Token Standard merchant preapproval or separately proven acceptance |
| Generic payer transfer         | impossible with the agent credential alone                          |

A compromised agent may consume every active capability it controls, subject to
their on-ledger resource, recipient, amount, allowance, expiry, revision, and
replay constraints. It may not spend outside those capabilities. Capability
creation rejects an agent Party equal to the payer Party; otherwise the
delegated-authority boundary would collapse into generic payer authority.

## Purchase Commitment

Define one versioned `sotto-purchase-v2` commitment over:

- x402 version, network, scheme, and transfer method;
- canonical request-binding version and commitment, including method, URL,
  authoritative headers, and exact body digest;
- challenge identity and observed time;
- payer, recipient, instrument, amount, synchronizer, and execution expiry;
- capability contract ID, full approved template ID, revision, committed agent
  Party, allowed resource, per-call limit, and remaining allowance;
- trusted Token Standard factory/admin identity and maximum total payer debit;
- authorization-instance identifier and payment-attempt identifier.

The capability choice, prepared-transaction verifier, Canton command ID,
provider proof, reconciliation, and private context must all agree on that exact
commitment. Empty policy placeholders are forbidden. The later human lane must
use its own explicit authorization-mode variant.

### Canonical byte contract

The implementation must pin one UTF-8 JSON fixture before signer work. The
object uses this fixed key order and contains no optional, `null`, or undefined
members:

1. `version` and `authorizationMode`;
2. `request` with binding version, request commitment, and body hash;
3. `challenge` with x402 version, challenge ID, observed time, execution expiry,
   network, scheme, transfer method, payer, recipient, amount, asset, fee payer,
   instrument, and synchronizer;
4. `capability` with agent Party, contract ID, full template ID, revision,
   resource-binding version, resource hash, recipient, per-call limit, remaining
   allowance, maximum total debit, and expiry;
5. `tokenFactory` with interface ID, factory contract ID, disclosed creation
   template ID, and trusted expected admin;
6. authorization-instance ID and attempt ID.

The challenge ID is SHA-256 of the exact decoded `PAYMENT-REQUIRED` header bytes
after the existing size/base64 checks. Hashes use lowercase hexadecimal with a
`sha256:` prefix. Amounts and allowances use unsigned base-10 atomic integer
strings without leading zeroes except `0`. Revisions use unsigned base-10
integer strings. Times use UTC ISO 8601 with exactly millisecond precision.
Party, contract, package/interface, and synchronizer identifiers are preserved
exactly after bounded validation. Canonicalization performs no locale-dependent
sorting or implicit numeric conversion.

The attempt ID uses a separate `sotto-payment-attempt-v2` preimage containing
the complete ordered purchase object before its `attemptId` member is appended.
This avoids a circular hash while ensuring that any request, challenge, payer,
capability, limit, expiry, or factory mutation produces a different attempt.

`sotto-resource-v1` hashes the UTF-8 bytes of fixed-order JSON containing the
canonical request origin and pathname. It deliberately excludes query and method
because the capability controls a route while `sotto-http-request-v1` binds each
complete request. Per-call limit tracks transfer principal in atomic instrument
units. Remaining allowance is the lifetime total-debit budget and decreases by
the exact net reduction of payer-owned holdings, including payer-paid holding
fees. Maximum total debit caps that same net reduction for one purchase; neither
limit uses the gross value of input holdings consumed and recreated.

The selected requirement's memo must equal the canonical request commitment, and
its fee payer must equal the authorized payer. The challenge ID still binds the
complete decoded challenge bytes. Neither a standalone caller assertion nor an
uncommitted requirement object may substitute for the authenticated challenge
carrier.

The purchase builder accepts an opaque server-captured payment observation, not
caller-provided challenge bytes or an observation timestamp. The observation is
issued only after an authentic HTTP `402` with canonical base64
`PAYMENT-REQUIRED`, retains exact decoded bytes in private runtime state, and
exposes only status, capture time, and challenge hash. It expires after ten
minutes and rejects material wall-clock rollback. Raw challenge bytes never
enter its serializable surface.

The production capability constructor uses a trusted ACS reader for the exact
requested contract and Ledger offset; direct construction is test-only. It
accepts only `sotto-control` 0.2.0 package
`4d614496ec9b30b22545fd350ecb9ec999164cfb0b5953f46dbbf937f8918f57` and the
approved capability template, derived from the current Daml source. Caller
fields are not authoritative, and a Daml change requires a new version and pin.
Fresh registry choice context and disclosed contracts are one-use preparation
inputs, not durable identity. Canton includes disclosed events in the prepared
hash, so the signer verifies exact roots/effects, recomputes the hash, and never
reuses registry context.

## Autonomous Purchase Flow

1. Observe a fresh authentic x402 `402` and select exactly one supported Canton
   requirement.
2. Build the canonical HTTP request and complete purchase commitment.
3. Load the authenticated capability event plus fresh registry context and
   prepare one root capability exercise controlled by the committed agent.
4. In the choice, reject paused, revoked, expired, exhausted, stale, duplicate,
   or mismatched resource, recipient, amount, maximum debit, commitment, or
   revision state.
5. Exercise the pinned Token Standard transfer interface inside the choice.
6. Pattern-match the Token Standard result. Only
   `TransferInstructionResult_Completed` from the pinned factory may create the
   reduced replacement capability and private purchase context. The capability
   computes total payer debit from payer-visible input and sender-change
   holdings. A parent choice authorized by agent and payer cannot fetch a new
   holding whose only stakeholders are provider and registry admin, so exact
   receiver holding/amount validation belongs to the prepared-transaction
   verifier in step 7. Adding provider or registry-admin authority to the root
   would invalidate the agent-only boundary. `Pending` and `Failed` abort the
   parent choice so every nested effect rolls back.
7. Decode the prepared transaction and verify the root exercise, complete
   commitment, trusted factory/admin, transfer effects, recipient holdings,
   bounded total payer debit, package/interface identities, synchronizer, and
   absence of additional roots or value effects.
8. Recompute the prepared-transaction hash locally and sign it with only the
   agent Party key.
9. Execute idempotently, reconcile the accepted update, and retry the identical
   paid HTTP request without submitting a second payment.

No raw signing key, prepared transaction, request body, response body, or
authorization header may enter evidence, logs, browser code, Git, or a model.

The capability is consuming and its contract ID plus revision are committed into
each purchase. A successful purchase produces a new contract ID and revision, so
replaying the old commitment fails without carrying an unbounded list of used
attempts in the replacement capability.

## Performance Shape

Capability setup is a separate opt-in action, not a per-purchase operation. An
existing capability purchase should remain one Canton command transaction that
combines capability consumption, Token Standard transfer, private context, and
replacement capability creation.

No latency or throughput claim follows from this design. The deployed path must
measure complete `402 -> 200` latency, prepared-sign-execute time,
reconciliation lag, concurrency, and the incremental cost of the capability.

The deterministic request boundary caps bodies at 1 MiB, URLs at 8 KiB, raw
header tuples at 128, authoritative headers at 64 including the three base
headers, and canonical request bytes at 64 KiB. The observer snapshots bounded
body bytes before its first asynchronous operation and uses independent copies
for transport and hashing so caller mutation cannot change the commitment. The
Daml choice caps input, receiver, and sender-change holding lists at 16 before
its quadratic uniqueness checks. One consuming capability deliberately
serializes purchases: production parallelism may use payer-created capabilities
with disjoint budgets, never duplicate one allowance across concurrent shards.

## Source Boundary

Use current official Canton and Daml sources, not remembered APIs:

- Daml delegation pattern:
  `https://github.com/digital-asset/daml/blob/main/sdk/docs/sharable/sdk/sdlc-howtos/smart-contracts/develop/patterns/delegation.rst`.
- Canton Wallet SDK package `@canton-network/wallet-sdk` version `1.4.0`,
  Apache-2.0, source commit `13822ef748fc6245042eb20d4460b42b8ff3ce3f` in
  `https://github.com/canton-network/wallet`.
- Canton Network Token Standard interface
  `splice-api-token-transfer-instruction-v1` version `1.0.0`, package ID
  `55ba4deb0ad4662c4168b39859738a0e91388d252286480c7331b3f71a517281`, from the
  Apache-2.0 `canton-network/splice` tag `0.6.1` and commit
  `f9d605c84498384ec2d5138d62af2f40b14882ff`. Its direct Holding and Metadata
  interface dependencies are pinned from that same commit. The official DAR file
  SHA-256 values are:
  - Transfer Instruction:
    `e4c73aa7ae73fb2fc330b938ffb99f568792321640ba4b9472902aa8d742c994`;
  - Holding: `ef75f8eb41a65810221784fdb78bb9dfac7cb22245aba14fa7cb7f69c34e0175`;
  - Metadata:
    `455eb160cb5abd4ae9918a6fbb9dad471f721adda39f0e5c76feef08d05637fc`.
- Five North's preferred `splice-wallet` package for the provider preapproval
  bootstrap is version `0.1.21`, package ID
  `f799a58fa53dfe48bae52bd5dbcc2b578a7d4dfee3ae3f4eb7635fe9a8cc67d3`. The exact
  tuple is pinned here and independently traced to the official Apache-2.0
  `hyperledger-labs/splice` tag `0.6.9`, commit
  `bc6a3587e7ea94230ba0c36c638945282c52b304`. Runtime discovery must require the
  exact package ID, name, and version; it rejects a package that merely reuses
  the same name and version with a different package ID.
- Five North currently renders payer Holding interface views through
  `splice-amulet` version `0.1.21`, package ID
  `73e9ffdb6b0bc19a5f67372b118103926da11547ab9109eccae47e4e4cc35d6f`, from the
  Apache-2.0 `canton-network/splice` tag `0.6.11` and commit
  `fd93f86ac42ce3a08985dcd0baae530b4f235f60`. The release DAR SHA-256 is
  `c26e1a4064afc9329167f90ad6f7e6f7236bc395fe480d1f113adc4e0168124c`. Existing
  payer contracts retain their exact 0.1.20 creation-template package ID
  `23f47481dab6b1ec01339d6e14494d85bb2844c25f45b26fc5c9ef4cd4942d1f`. Sotto pins
  creation template and interface implementation independently; package-upgrade
  rendering must never be accepted from semver or equality assumptions alone.
- Five North's current registry factory contract was created under
  `splice-amulet` version `0.1.9`, package ID
  `a5b055492fb8f08b2e7bc0fc94da6da50c39c2e1d7f24cd5ea8db12fc87c1332`, from the
  same official Splice 0.6.11 release. Its release DAR SHA-256 is
  `fd5b422530e9b4cd72ce78918144bb0a96099700523c8cbef8e257e4706275f8`. That
  creation template is committed separately from the package preference that
  will interpret the interface exercise.
- Prepared-transaction structural decoding uses exactly pinned
  `@canton-network/core-ledger-proto@1.7.0` with recursive unknown-field
  rejection. Its schema predates some Canton 3.5.6 fields, so encountering an
  unsupported field is a hard `NOT SIGNABLE` result rather than permission to
  discard it.
- Exactly pinned `@canton-network/core-tx-visualizer@1.7.0`, from the Apache-2.0
  Canton Wallet source commit `13822ef748fc6245042eb20d4460b42b8ff3ce3f`, may
  provide only a fast hash precheck. It is not the authoritative signer
  boundary.
- Authoritative prepared-transaction hashing must match the Apache-2.0 Canton
  `v3.5.6` implementation at commit `5ec182991db5d26c7c78920101467f3101ff6c11`.
  The participant response and the local verifier compare the canonical raw
  32-byte digest. The locally installed Canton JAR has a separate license and
  must not be committed, redistributed, or packaged.
- Canton hashing scheme V2 does not bind `maxRecordTime` or the global-key
  mapping. Purchase expiry therefore remains enforced by the committed Daml
  `executeBefore` value and ledger-time bounds. A future V3 path may bind
  `maxRecordTime` only after exact participant and source compatibility is
  proven.
- The official internal signing controller signs a supplied hash without
  performing Sotto's semantic validation and is not an acceptable verifier.
- Token Standard interface definitions must be brought in through a reproducible
  pinned package or DAR dependency with the resulting Daml lock information
  tracked. Generated DARs themselves remain excluded from Git.

Any reused source requires its compatible license, attribution, and exact pin.

## Five North Package Presence Gate

Before capability execution, the exact `sotto-control` 0.2.0 package must be
present on the Five North participant. This is a one-time operator control-plane
action, not a marketplace or purchase hot-path operation. Run it only from a
clean committed source tree with the ignored `.env.local` values:

```text
pnpm spike:package
```

The command rebuilds no authority from caller input. It loads only the Five
North Ledger/OIDC configuration, snapshots the generated approved research DAR
through one no-follow file handle, enforces the Daml 3.5.2 toolchain, validates
the exact 35-package inventory, and repeats the clean-source checkpoint after
inspection. The approved main package is
`4d614496ec9b30b22545fd350ecb9ec999164cfb0b5953f46dbbf937f8918f57`.

Five North validation uses the observed synchronizer. Upload is allowed at most
once, explicitly sends `vetAllPackages=false`, and never retries after a durable
dispatch marker. All token acquisition, token-subject equality, authority-age,
DAR-hash, size, cancellation, and request construction checks finish before an
owner-only hash-chained journal fsyncs that marker immediately before the POST.
If the response is lost, every restart is read-only until exact package-list and
downloaded archive-hash evidence proves presence; otherwise the result stays
`dispatch-unresolved`.

The redacted result says `vetting: not-requested` and `readiness: not-proven`.
Package presence does not prove preferred-package selection, vetting, template
readiness, capability execution, descendant effects, restricted signing, bypass
resistance, or production readiness. The shared participant-admin M2M credential
is accepted only for this package administration probe and remains rejected as a
payment signer.

Performance is bounded for this control path. A new operation first mints or
reuses one cached token and observes AmuletRules authority. An already-present
check then uses one package list and one exact package download. An absent
package adds one participant validation, one upload, one reconciliation list,
and one exact package download. A terminal journal result performs no network
call. No Postgres or Redis dependency is introduced at this spike gate.

## TransferFactory Discovery Boundary

Five North does not expose the remote Canton Coin `TransferFactory` through the
party-scoped Ledger ACS used by Sotto. The participant rejects package-ID
template filters in favor of package-name references, and the accepted
package-name and interface queries return no scoped factory contract. Sotto must
not use an any-party ACS query on the shared multi-tenant participant.

Package readiness and factory authority are therefore separate gates. The
readiness gate proves only exact `sotto-control` package presence, the preferred
package ID/name/version for the payer and agent, synchronizer agreement, and a
stable authenticated token subject. It cannot produce a capability bootstrap
request or claim factory readiness.

Factory authority comes from a fresh bounded Token Standard
`POST /registry/transfer-instruction/v1/transfer-factory` response using exact
transfer choice arguments and a fixed payer-holding observation. Before the
factory ID may enter a payer-signed capability, Sotto must require `direct`,
require exactly one disclosed contract whose contract ID equals the returned
factory ID, and pin that disclosure's creation template and synchronizer. An
all-null optional debug envelope is discarded; partial or non-null debug fields
are rejected. The observation is one-use and short-lived.

Each purchase reacquires its own choice context and disclosed contracts because
the Token Standard permits choice-specific context. It must return the same
factory ID and pinned creation template stored in the capability. Bootstrap
context is never reused for payment preparation, and a factory change makes the
old capability unusable until the payer creates a replacement.

This adds one registry call to the opt-in capability bootstrap and preserves one
fresh registry call per autonomous purchase. It removes an unproductive ACS scan
and introduces no Postgres or Redis dependency. A later production control-plane
may persist capability/factory status in Postgres, but neither a database row
nor Redis cache may replace the live registry and disclosure checks.

## Deterministic Proof Before Live Spend

- Pin canonical purchase bytes and hash.
- Mutate every committed field and prove a different commitment plus zero
  signing calls.
- Prove agent-only capability exercise succeeds in Daml Script.
- Prove agent-only direct payer transfer fails.
- Require Token Standard `Completed`; prove `Pending` and `Failed` roll back all
  capability/context state.
- Cover expiry, pause, revocation, stale contract ID, revision change,
  exhaustion, duplicate attempt, and concurrent consumption.
- Decode sanitized prepared transactions and reject additional roots, changed
  transfer effects, wrong package/interface identifiers, or hash mismatch.
- Reject an empty command package-selection preference before signing. Pin the
  reviewed package-upgrade interpretation from current Five North package
  preference evidence, or prove equivalent exact child-effect validation; a
  later DAR upload must not silently change the nested interface exercise.
- Keep canonical `creationTemplateId` pinned to the exact factory creation
  template and separate from interface implementation/package selection. Its
  byte, attempt-ID, and commitment vectors are independently pinned.
- Bound prepared bytes, node count, tree depth, and decode/hash time; oversized,
  over-deep, and timeout cases must make zero signing calls.
- Keep the hot path to one strict protobuf decode plus bounded linear
  `O(nodes + edges + values)` inspection. Run the official hash implementation
  as a persistent bounded helper rather than starting a JVM for each purchase;
  the visualizer precheck cannot replace this helper.
- Verify expected admin and maximum fee/total debit in the Daml path. Verify
  receiver holdings and amount plus absence of unapproved value effects in the
  prepared-transaction verifier, where the complete create effects are available
  without adding root authorization.
- Keep all deterministic quality, security, source, license, and Daml gates
  green.

## Live Exit Conditions

The candidate closes the authority blocker only after Five North evidence shows:

1. an external payer Party with no generic payer authority in any Sotto runtime
   or shared credential, plus a complete custody/rights inventory;
2. a final credential or external Party key restricted to the agent Party;
3. a payer-created capability funded by payer-owned Canton Coin;
4. one fresh `402 -> constrained capability purchase -> settlement -> 200`;
5. a direct generic payer transfer rejected with that same agent credential by a
   Canton authorization error, using otherwise-valid fresh transfer inputs;
6. an authorized control proving those same transfer inputs are valid, with the
   only decisive difference being payer authority;
7. complete commitment agreement in the prepared transaction and accepted
   update;
8. reconciliation and paid retry without a second payment;
9. exact source SHA and redacted update evidence.

If any Token Standard, merchant, external-party, or agent-credential gate fails,
the result remains `NOT PROVEN`; never fall back to the shared M2M credential.
