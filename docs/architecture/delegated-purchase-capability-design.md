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
   network, scheme, transfer method, payer, recipient, amount, asset, fee payer,
   instrument, and synchronizer;
4. `capability` with contract ID, revision, resource-binding version, resource
   hash, recipient, per-call limit, remaining allowance, maximum total debit,
   and expiry;
5. `tokenFactory` with interface ID, factory contract ID, implementation
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
complete request. Remaining allowance and per-call limit track transfer
principal in atomic instrument units. Maximum total debit caps the net reduction
of payer-owned holdings in that instrument, including payer-paid fees; it is not
the gross value of input holdings consumed and recreated.

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
for transport and hashing so caller mutation cannot change the commitment.

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

If the Token Standard dependency, merchant preapproval, external Party, or
agent-only credential cannot be proven on Five North, the result remains
`NOT PROVEN`; the implementation must not silently fall back to the shared M2M
credential.
