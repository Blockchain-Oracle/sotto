---
design_type: feature
created_at: 2026-07-16
---

# Wallet-Neutral Human Purchase

## Intent Contract

intent: Let a human payer approve one exact x402-protected HTTP request with a
compatible Canton wallet, settle the matching Canton Coin transfer on Five
North, and receive the authentic paid response without creating a spending
policy or exposing generic signing authority to Sotto.

constraints:

- Browsing, publishing, marketplace management, and one-time human purchases
  remain policy-free.
- The shared Five North machine credential cannot sign or execute as the payer.
- The payer key stays inside the selected wallet and never enters Sotto, a
  browser controlled by Sotto, logs, evidence, Git, Postgres, or Redis.
- Browser or caller values are never authority for the HTTP request, price,
  recipient, instrument, factory, package selection, or settlement.
- A fixture, LocalNet transaction, prepared transaction, or wallet signature
  alone cannot satisfy the live Five North gate.
- Settlement and delivery remain separate outcomes.

success_criteria:

- A wallet-neutral signing core supports the Wallet SDK reference wallet,
  compatible OpenRPC wallets, and future connectors without changing transaction
  verification or execution authority.
- The human lane derives one purchase identity from an authenticated fresh `402`
  and the exact HTTP request, without a `PurchaseCapability`.
- Payer Party and registered signing-key identity come from a fresh
  authenticated Five North topology/onboarding observation, never caller or
  connector input.
- The prepared-transfer verifier proves the exact payer, provider, amount,
  instrument, fee/debit ceiling, change, packages, synchronizer, metadata, and
  complete transaction effects before any wallet is called.
- The wallet independently decodes the transaction, recomputes the Canton V2
  hash, displays the exact purchase, and signs only after explicit approval.
- Execution submits the unchanged prepared bytes and exact payer signature once.
- The paid retry preserves identical canonical request semantics, adds only the
  ignored payment-proof header, and returns the authentic provider `200` without
  a second Ledger submission.

risk_level: high

## Decision

Use the already approved wallet-neutral core with pluggable connectors. Prove
the path first with the source-pinned Wallet SDK reference wallet on the same
Five North topology. Offer Loop or another OpenRPC wallet only after capability
negotiation proves the exact payer Party, network, V2 prepared-transaction
signing, and supported signature scheme.

Do not introduce a custodial signer, restore payer `actAs` to the shared machine
user, or require an autonomous spending capability for this lane.

## Scope

| In scope                              | Out of scope                             |
| ------------------------------------- | ---------------------------------------- |
| Policy-free human purchase identity   | Autonomous capability creation or use    |
| Direct Token Standard transfer        | Shared M2M payer execution               |
| Wallet-neutral connector/session core | Generic wallet, send, or banking UI      |
| Reference-wallet Five North proof     | Claiming unsupported Loop compatibility  |
| OpenRPC capability negotiation        | Production browser wallet implementation |
| Exact settlement and delivery split   | Public explorer implementation           |
| Owner-only spike journal              | PostgreSQL/Redis production topology     |

## Decisions

| #   | Decision        | Choice                                                        | Rejected alternative                                  |
| --- | --------------- | ------------------------------------------------------------- | ----------------------------------------------------- |
| 1   | Human authority | One external-payer wallet signature over exact prepared bytes | Shared credential or hosted generic signer            |
| 2   | Policy          | No capability, allowance, or agent policy in this lane        | Requiring autonomous policy for a human call          |
| 3   | Connector       | Neutral core; reference wallet first, OpenRPC by negotiation  | Loop-only coupling                                    |
| 4   | Transfer        | One direct `TransferFactory_Transfer`                         | Reusing the agent-only `Purchase` choice              |
| 5   | Verification    | Decode every prepared effect before connector invocation      | Hash-only or root-only approval                       |
| 6   | Execution       | Journal, submit unchanged bytes once, then reconcile          | Automatic reprepare or retry after ambiguity          |
| 7   | Delivery        | Retry identical canonical request semantics after settlement  | Treating Ledger acceptance as provider delivery       |
| 8   | Persistence     | Owner-only spike journal; production durability stays open    | Claiming process memory or Redis as durable authority |

## Surface

APIs: Add a policy-free human-purchase commitment and ledger intent, direct
transfer command builder, prepared human-transfer observer, transaction-neutral
wallet signing authority, human approval projection, and human execution claim.
Keep the existing capability APIs as compatibility wrappers rather than
broadening capability authority.

Components: Reuse the canonical HTTP observer, package selection, holding and
registry observations, strict prepared-transaction primitives, wallet handoff,
signature validation, Five North transports, and provider delivery claim. Add a
separate human settlement reconciler because no private `PurchaseContext` or
replacement capability exists.

Storage: The spike writes only owner-only, redacted, hash-chained lifecycle
records. Raw prepared bytes, signatures, keys, challenge bytes, request bodies,
and provider bodies do not enter tracked files or public evidence. PostgreSQL
durability remains a later gate; Redis never authorizes signing, execution, or
settlement.

## End-To-End Flow

```text
Discover wallet and verify payer identity/topology/signature support
  -> authenticate payer Party and registered key from Five North
  -> exact HTTP request
  -> authentic fresh 402 and canonical challenge bytes
  -> policy-free human purchase commitment
  -> fresh payer holdings and TransferFactory context
  -> prepare one direct Token Standard transfer as the payer
  -> decode and verify the complete prepared transaction
  -> independently recompute and compare the V2 hash
  -> display the exact human purchase summary
  -> request approval through the selected wallet connector
  -> verify the payer-scoped signature and registered public key
  -> durably mark execution started
  -> execute the unchanged prepared transaction once
  -> reconcile accepted settlement
  -> retry the byte-identical HTTP request with payment evidence
  -> persist the authentic paid response as delivery evidence
```

## Policy-Free Purchase Identity

The human purchase commitment is a separate versioned schema. It commits:

- canonical method, HTTPS URL, semantic headers, and request-body hash;
- exact raw x402 challenge identity and selected Canton requirement;
- payer, provider, amount, instrument, network, synchronizer, transfer method,
  factory contract, factory implementation, request time, and expiry;
- maximum total payer debit, including bounded fees;
- authenticated package-selection closure and source-pinned package identities;
- authorization instance and collision-resistant attempt identity.

It contains no capability CID, agent Party, policy revision, or allowance. Fresh
holdings and registry choice context are one-use preparation material, not
durable purchase identity.

The human lane uses a separate Token-only package closure. It resolves exactly
the reviewed `splice-amulet` package for the authenticated payer, provider, and
instrument admin on the challenge synchronizer. It does not require or select
`sotto-control`, and it contains no synthetic agent Party.

The transfer carries only privacy-safe Sotto hashes in standard Token metadata.
The command ID also derives from the purchase commitment. Raw URL, query,
headers, body, challenge, and provider response never become public metadata.

## Prepared Transfer Contract

Before a wallet is called, Sotto must prove:

- `HASHING_SCHEME_VERSION_V2` and a locally recomputed participant hash;
- exact payer-only `actAs`, empty `readAs`, synchronizer, deadline, command ID,
  disclosed contracts, and authenticated package-selection preference;
- exactly one root `TransferFactory_Transfer` exercise against the authenticated
  factory and source-pinned Token Standard interface;
- exactly one completed `TransferPreapproval_SendV2` child for the authenticated
  provider preapproval, with only the required config, featured-right, archive,
  Holding-create, and two EventLog descendants;
- exact sender, provider, principal, instrument, request window, input holdings,
  expected admin, Sotto metadata hashes, and registry choice context;
- every input holding belongs to the payer and the exact instrument;
- only `Completed` is accepted, with exact provider output and payer change;
- total debit equals inputs minus payer change, is at least principal, and does
  not exceed the committed maximum;
- the Token Standard fee summary equals total debit minus principal and stays
  within the separately displayed human fee ceiling;
- every input, fetch, exercise, create, archive, result, and metadata contract
  is accounted for, with no rollback, hidden root, unknown field, or unrelated
  effect;
- no Sotto capability, policy, `Purchase`, private `PurchaseContext`, or
  replacement-capability node exists in the human transaction;
- bounded bytes, nodes, value depth, lists, disclosures, and verification work.

After the bounded envelope, protobuf, payer-root, and zero-wallet prechecks are
green, the verifier uses a read-only real Five North preparation to ground the
complete descendant allowlist. Captured bytes stay in owner-only ignored
evidence unless a fully redacted structural fixture is explicitly approved for
tracking. The exhaustive mutation suite is then completed against that observed
shape.

## Wallet Connector Contract

The shared core owns purchase meaning, preparation verification, session
identity, timeout, signature verification, one-shot execution, and recovery.
Connectors own only discovery and explicit approval.

| Connector            | Role                                      | Gate                                                                  |
| -------------------- | ----------------------------------------- | --------------------------------------------------------------------- |
| Wallet SDK reference | First reproducible Five North human proof | External payer key remains in the wallet-owned process                |
| OpenRPC / Loop       | Browser or extension wallet               | Negotiates the same Party, topology, V2 signing, and signature scheme |
| Future connector     | Hardware, mobile, institutional           | Passes the same connector contract and mutation suite                 |

An incompatible connector returns an exact unsupported reason. Sotto never falls
back to a shared credential or generic arbitrary-hash signing endpoint.

The first live slice requires the complete reference-wallet connector and only
OpenRPC discovery plus exact unsupported/compatible capability negotiation. A
live OpenRPC signing proof waits for a wallet whose payer Party is on the same
Five North topology; that absence cannot delay the reference-wallet proof.

Connector discovery is compatibility evidence, not payer authority. Before any
payer-scoped holding read or preparation, Sotto claims one fresh opaque payer
identity from a trusted Five North topology/onboarding reader. It binds Party,
network, synchronizer, registered public-key fingerprint, algorithm, and key
format. The connector and wallet identity must match that projection exactly;
they cannot create or replace it.

The approval summary shows resource origin and route, method, provider, payer,
amount, maximum total debit, instrument, network, synchronizer, expiry, and
transaction hash. Secrets and raw request or response bodies remain hidden.

## Execution And Recovery

The wallet response is bound to one random, expiring, one-use session containing
the connector, origin, payer, purchase commitment, prepared hash, network, and
synchronizer. Sotto validates the Party, hash, signature format, algorithm,
fingerprint, and registered public key before execution.

An owner-only journal records privacy-safe lifecycle facts:

```text
intent-created
prepared-verified
approval-requested
signature-received
execution-started
accepted | rejected | ambiguous
delivery-started
delivered | delivery-failed | delivery-unknown
```

The journal is flushed before execution. After `execution-started`, the spike
does not automatically reprepare, resign, or re-execute. An ambiguous result is
reconciled from exact Ledger completion and transfer effects. A settled payment
may still have failed delivery, and that distinction is never collapsed.

## Provider Settlement Oracle

The human lane uses a separate canonical settlement-proof version containing
only `attemptId`, `requestCommitment`, `purchaseCommitment`, `challengeId`, and
`updateId`. The provider already owns the canonical request, payer, provider,
amount, instrument, synchronizer, and issued challenge configuration.

Before delivering, the provider reads the exact update and requires:

- the proof `updateId`, request, challenge, attempt, and purchase hashes match;
- exactly one completed direct Token transfer from the configured payer to the
  provider on the configured synchronizer and instrument;
- exact principal and a linked provider Holding created by that transfer;
- standard Token metadata contains exactly the same privacy-safe Sotto hashes;
- the transfer factory, preapproval, package identities, and update effects are
  the reviewed human-transfer shape; and
- the same update cannot be relabeled with a different attempt or request.

This replaces the capability lane's private `PurchaseContext` oracle. The
provider still verifies settlement before entering the existing delivery-claim
boundary. Production must replace its process-memory claim store with an atomic
PostgreSQL record before it may promise restart-safe delivery.

## Performance Contract

The complete path includes wallet/key preflight, the initial `402`, package and
vetting reads, holding ACS reads, one bounded registry read, one prepare call,
local and wallet verification, one wallet approval, one execute call, completion
and transaction reconciliation, and one paid HTTP retry. No policy transaction
is added. Independent fresh package and holding reads may run concurrently only
after the challenge fixes their common scope.

The wallet is discovered first, then its claimed identity is matched to a fresh
Five North payer/key projection before requesting the `402` or making any
payer-scoped read. The human provider must offer the reviewed maximum ten-minute
challenge window. Before presenting the approval, Sotto requires at least two
minutes remaining for review, signing, execution, and reconciliation. If the
reserve is insufficient, it discards all unsigned material and reacquires a
fresh challenge and every challenge-bound observation. It never refreshes after
approval is shown, signing begins, or execution is journaled.

Every stage records a privacy-safe elapsed time. Latency claims require live
p50/p95/p99 evidence and are not inferred from one spike purchase.

## Verification Contract

verify_steps:

- Pin canonical commitment bytes and run a complete request, challenge,
  authority, amount, fee, package, time, and provenance mutation matrix.
- Prove caller, connector, wallet, Party, topology, registered key, network, and
  synchronizer substitution fail before holdings, registry, prepare, or signing.
- Prove the human package observation selects only `splice-amulet` for the
  authenticated payer/provider/admin scope and rejects `sotto-control`, agents,
  missing parties, or extra package names.
- Require the synthetic direct-transfer graph to pass the human verifier and the
  capability `Purchase` verifier to reject it.
- Mutate every root, preapproval, input, output, change, config fetch, EventLog,
  package, Party, value, fee summary, result, metadata field, and unknown
  protobuf field; every mutation must stop before the connector.
- Run the full discovery, approval, rejection, cancellation, timeout, replay,
  origin, Party, package, hash, algorithm, fingerprint, and signature contract
  for the reference wallet. For OpenRPC in this slice, require discovery,
  identity/topology negotiation, and exact compatible or unsupported behavior.
- Require zero execution calls for every verifier, approval, or signature
  failure and exactly one claim for the accepted path.
- Run `pnpm verify` under the pinned toolchain, then the same gate from an
  empty-cache non-shared clone.
- Complete independent security and scope/performance reviews before accessing
  wallet credentials or executing a transaction.
- After protobuf bounds, envelope, payer root, and zero-wallet-on-failure tests
  are green, run a read-only Five North preparation to ground the actual graph.
  Then finish the exhaustive effect mutation matrix and require those captured
  bytes to pass without weakening any fail-closed case.
- Run one controlled wallet-approved Five North execution, reconcile exact
  settlement, and require the authentic paid `200`.
- Finish with a Context Engineering verification audit that preserves any
  missing public-explorer, durability, or topology claim as `NO_GO`.

## Real Integration Proof

Deterministic fixtures may test parser and mutation behavior only. The live gate
requires:

1. the real Five North paid provider returns a fresh `402`;
2. fresh payer holdings and registry context are read from Five North;
3. Five North prepares the exact direct transfer;
4. both Sotto and the wallet decode the actual prepared transaction and
   recompute its V2 hash;
5. a human approves the exact displayed purchase through the reference wallet or
   a proven compatible OpenRPC wallet;
6. the external payer signature executes the unchanged transaction once;
7. exact settlement effects reconcile to the payer and provider;
8. the paid retry preserves the exact method, URL, body, and semantic headers;
   only the ignored `PAYMENT-SIGNATURE` proof header differs, and the provider
   recomputes the identical request commitment before returning the authentic
   `200`;
9. redacted evidence records only hashes, IDs, timestamps, connector kind,
   statuses, and public-safe settlement facts.

No live spend occurs before the deterministic verifier, connector contract, full
repository gate, clean-clone proof, and independent security review pass.

## Governance Contract

approval_gates:

- Abu approved the wallet-neutral core with pluggable connectors on 2026-07-15
  and instructed Codex to continue autonomously on 2026-07-16.
- The separate human wallet approval remains an intrinsic cryptographic action:
  it approves the exact displayed transaction, not a shell command.
- A review checkpoint is required before connecting the wallet and again before
  live execution.
- Production remains `NO_GO` until this live path, public settlement evidence,
  durable PostgreSQL recovery, topology selection, and the final verification
  audit pass.

rollback: Revert the Phase 4 human-purchase commits, retain the closed Phase 3
authority evidence unchanged, and keep production `NO_GO`.

ownership: Sotto owns preparation and semantic verification. The wallet owns
keys and approval. Five North owns participant execution and settlement. The
provider owns delivery. No one component may claim the others' result.

## Rejected Alternatives

- Capability-required human buying: violates the accepted policy-free lane.
- Loop-only integration: the current Loop Party is on a different topology and
  cannot block the Wallet SDK reference proof.
- Sotto-hosted generic signer: retains payer-wide spending authority.
- Shared M2M payer execution: recreates the bypass closed in Phase 3.
- Approving only a hash without decoding effects: cannot prove purchase meaning.
- Treating preparation, signature, or settlement as delivery: collapses distinct
  authorities and produces false success.

## Risks & Open Questions

- Five North may produce a direct-transfer graph that differs from the current
  external-preapproval conformance shape. The live read-only preparation must
  refine the allowlist without accepting unexplained effects.
- Token metadata may be exposed to a broader audience than Sotto context. Only
  privacy-safe hashes are allowed, and the live verifier must confirm their
  exact representation.
- The current Loop Party is on another participant topology. Loop remains
  unsupported for this payment unless negotiation proves the same payer and Five
  North network.
- Human approval adds user latency. It is deliberate for the policy-free lane;
  only measured deployed latency can justify later UX or concurrency changes.
- A process-local spike journal cannot prove restart durability. PostgreSQL
  recovery remains a production blocker after the live human proof.
- Settlement may succeed while the provider retry fails. Recovery must preserve
  that split and must not automatically charge again.
- Five North may not expose a usable authenticated registered-key query for the
  external payer. If onboarding evidence cannot bind the Party to the exact
  fingerprint independently of the connector, live signing stops at
  `NOT PROVEN`.

## Documentation Basis

- Canton Wallet Integration Guide: prepare, independently recompute the prepared
  transaction hash, sign outside the dApp, and execute unchanged bytes.
- Canton dApp guidance: wallets may expose prepared-transaction signing through
  OpenRPC, but support must be negotiated rather than assumed.
- Sotto product contract, quality contract, delegated-capability design, and
  Phase 3 Five North evidence at commit `23ecd28`.
