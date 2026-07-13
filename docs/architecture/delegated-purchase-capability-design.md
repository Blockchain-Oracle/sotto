# Delegated Purchase Capability Design

Date: 2026-07-13

## Status

Approved for DevNet blocker remediation. This design selects the candidate that
must now be proven; it does not change the current production verdict from
`NO_GO` and does not claim that Five North already supports the complete path.

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
Five North spike already proved that the shared M2M credential can bypass Sotto
policy with a generic transfer. This candidate remains rejected.

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
| Purchase capability            | payer signatory; agent observer                                     |
| Capability creation/revocation | payer only                                                          |
| Purchase choice                | agent controller only                                               |
| Nested token transfer          | payer authority inherited only inside capability consequences       |
| Agent credential               | agent Party only                                                    |
| Provider receipt               | Token Standard merchant preapproval or separately proven acceptance |
| Generic payer transfer         | impossible with the agent credential alone                          |

A compromised agent may consume every active capability it controls, subject to
their on-ledger resource, recipient, amount, allowance, expiry, revision, and
replay constraints. It may not spend outside those capabilities.

## Purchase Commitment

Define one versioned `sotto-purchase-v2` commitment over:

- x402 version, network, scheme, and transfer method;
- canonical request-binding version and commitment, including method, URL,
  authoritative headers, and exact body digest;
- challenge identity and observed time;
- payer, recipient, instrument, amount, synchronizer, and execution expiry;
- capability contract ID, revision, allowed resource, per-call limit, and
  remaining allowance;
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
   network, scheme, transfer method, payer, recipient, amount, asset,
   instrument, and synchronizer;
4. `capability` with contract ID, revision, resource hash, recipient, per-call
   limit, remaining allowance, maximum total debit, and expiry;
5. `tokenFactory` with interface ID and trusted expected admin;
6. authorization-instance ID and attempt ID.

The challenge ID is SHA-256 of the exact decoded `PAYMENT-REQUIRED` header bytes
after the existing size/base64 checks. Hashes use lowercase hexadecimal with a
`sha256:` prefix. Amounts and allowances use unsigned base-10 atomic integer
strings without leading zeroes except `0`. Revisions use unsigned base-10
integer strings. Times use UTC ISO 8601 with exactly millisecond precision.
Party, contract, package/interface, and synchronizer identifiers are preserved
exactly after bounded validation. Canonicalization performs no locale-dependent
sorting or implicit numeric conversion.

## Autonomous Purchase Flow

1. Observe a fresh authentic x402 `402` and select exactly one supported Canton
   requirement.
2. Build the canonical HTTP request and complete purchase commitment.
3. Prepare one root capability exercise controlled by the agent.
4. In the choice, reject paused, revoked, expired, exhausted, stale, duplicate,
   or mismatched resource, recipient, amount, maximum debit, commitment, or
   revision state.
5. Exercise the pinned Token Standard transfer interface inside the choice.
6. Pattern-match the Token Standard result. Only
   `TransferInstructionResult_Completed` with the expected receiver holdings may
   create the reduced replacement capability and private purchase context.
   `Pending` and `Failed` abort the parent choice so every nested effect rolls
   back.
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
  `f9d605c84498384ec2d5138d62af2f40b14882ff`. The official DAR SHA-256 is
  `e4c73aa7ae73fb2fc330b938ffb99f568792321640ba4b9472902aa8d742c994`.
- Prepared-transaction verification should use the smaller pinned
  `@canton-network/core-tx-visualizer@1.7.0` and
  `@canton-network/core-ledger-proto@1.7.0` surfaces. The official internal
  signing controller signs a supplied hash without performing Sotto's semantic
  validation and is not an acceptable verifier.
- Token Standard interface definitions must be brought in through a reproducible
  pinned package or DAR dependency with the resulting Daml lock information
  tracked. Generated DARs themselves remain excluded from Git.

Any reused source requires its compatible license, attribution, and exact pin.

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
- Bound prepared bytes, node count, tree depth, and decode/hash time; oversized,
  over-deep, and timeout cases must make zero signing calls.
- Verify expected admin, receiver holdings and amount, maximum fee/total debit,
  and absence of unapproved value effects.
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

If the Token Standard dependency, merchant preapproval, external Party, or
agent-only credential cannot be proven on Five North, the result remains
`NOT PROVEN`; the implementation must not silently fall back to the shared M2M
credential.
