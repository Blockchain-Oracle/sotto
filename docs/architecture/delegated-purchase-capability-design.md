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
or another interface that can submit a generic payer transfer.

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
| Funded Canton Coin holding     | payer Party                                                         |
| Purchase capability            | payer signatory; agent observer                                     |
| Capability creation/revocation | payer or explicitly approved owner/payer rule                       |
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
- authorization-instance identifier and payment-attempt identifier.

The capability choice, prepared-transaction verifier, Canton command ID,
provider proof, reconciliation, and private context must all agree on that exact
commitment. Empty policy placeholders are forbidden. The later human lane must
use its own explicit authorization-mode variant.

## Autonomous Purchase Flow

1. Observe a fresh authentic x402 `402` and select exactly one supported Canton
   requirement.
2. Build the canonical HTTP request and complete purchase commitment.
3. Prepare one root capability exercise controlled by the agent.
4. In the choice, reject paused, revoked, expired, exhausted, stale, duplicate,
   or mismatched resource, recipient, amount, commitment, or revision state.
5. Exercise the pinned Token Standard transfer interface inside the choice.
6. Atomically create the reduced replacement capability and private purchase
   context only when the transfer succeeds.
7. Decode the prepared transaction and verify the root exercise, complete
   commitment, transfer effects, package/interface identities, synchronizer, and
   absence of additional roots.
8. Recompute the prepared-transaction hash locally and sign it with only the
   agent Party key.
9. Execute idempotently, reconcile the accepted update, and retry the identical
   paid HTTP request without submitting a second payment.

No raw signing key, prepared transaction, request body, response body, or
authorization header may enter evidence, logs, browser code, Git, or a model.

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
- Cover expiry, pause, revocation, stale contract ID, revision change,
  exhaustion, duplicate attempt, and concurrent consumption.
- Decode sanitized prepared transactions and reject additional roots, changed
  transfer effects, wrong package/interface identifiers, or hash mismatch.
- Keep all deterministic quality, security, source, license, and Daml gates
  green.

## Live Exit Conditions

The candidate closes the authority blocker only after Five North evidence shows:

1. a final credential or external Party key restricted to the agent Party;
2. a payer-created capability funded by payer-owned Canton Coin;
3. one fresh `402 -> constrained capability purchase -> settlement -> 200`;
4. a direct generic payer transfer rejected with that same agent credential;
5. complete commitment agreement in the prepared transaction and accepted
   update;
6. reconciliation and paid retry without a second payment;
7. exact source SHA and redacted update evidence.

If the Token Standard dependency, merchant preapproval, external Party, or
agent-only credential cannot be proven on Five North, the result remains
`NOT PROVEN`; the implementation must not silently fall back to the shared M2M
credential.
