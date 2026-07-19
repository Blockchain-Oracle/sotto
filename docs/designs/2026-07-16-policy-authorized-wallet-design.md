# Policy-Authorized Unattended Wallet Design

## Decision

The Five North reference wallet may approve one `PurchaseCapability` create
without a chat prompt when the independently verified prepared transaction
matches an owner-only policy exactly. This is the autonomous capability-setup
lane. It does not change the separate human-purchase lane.

## Why

The previous live path required both a workflow approval and an interactive
wallet handoff. The wallet handoff expired after sixty seconds while the owner
was away, even though the prepared transaction was valid. Ordinary development
must not depend on a synchronous chat response.

## Alternatives

1. **Policy-authorized unattended wallet — selected.** Keeps the key in the
   separate wallet process while allowing one exact, pre-authorized create.
2. **Longer interactive approval queue.** Safer than sixty seconds but still
   blocks unattended development.
3. **Give the agent payer authority.** Operationally simple but rejected because
   it permits arbitrary payer transfers.

## Authority Boundary

The owner-only canonical policy must bind:

- one authorization identifier and one permitted approval;
- connector ID and origin;
- payer, agent, recipient, instrument, and resource hash;
- Canton network, synchronizer, Sotto package/template, and transfer factory;
- maximum per-call, remaining-allowance, and total-debit values;
- a maximum capability lifetime and policy expiry.

The wallet must still verify the complete prepared create graph and the
participant, precheck, and official V2 hashes before consulting the policy. It
must persist a mode-`0600` one-use claim before returning the signature. A
policy mismatch, stale policy, used authorization, malformed policy, wrong
prepared effect, or storage failure produces zero signature and zero execute.

## Execution and Recovery

The application keeps its durable journal and at-most-once execute boundary.
Read-only calls and tests do not require approval. The workflow controller is
only an invisible audit/idempotency record for the single external write; it is
not a user-facing approval surface.

The live checkpoint creates one capability only. It performs no purchase and no
Canton Coin transfer. After execution, completion history and payer-scoped ACS
must agree before success is recorded.

## Stop Condition

Once the policy-authorized create succeeds and reconciles, close this authority
spike. Do not add another verifier layer without a reproduced live defect; move
next to the PostgreSQL-backed marketplace and provider-publishing foundation.
