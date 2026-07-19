---
design_type: feature
created_at: 2026-07-15
---

# Wallet-Neutral Capability Signing

## Intent Contract

intent: Let a payer approve one exact Sotto `PurchaseCapability` creation with a
real Canton wallet while keeping the payer key and generic payer authority
outside Sotto.

constraints:

- The shared Five North machine credential must not regain payer `actAs` and
  cannot serve as the wallet or final signer.
- Raw private keys never enter Sotto runtime, browsers controlled by Sotto,
  models, logs, evidence, Git, or the application database.
- Loop support for Sotto's custom Daml package is not assumed; compatibility is
  detected before a signing request is offered.
- Wallet approval is required only for capability creation and revocation or a
  separate human purchase. Browsing, publishing, and marketplace management
  remain policy-free.
- A prepared transaction, signature, fixture, or LocalNet run cannot satisfy the
  Five North integration gate.
- No production marketplace, Postgres, Redis, queue, or Coolify topology is
  introduced by this spike slice.

success_criteria:

- One wallet-neutral signing-session core accepts only an independently verified
  capability-create transaction and exposes a narrow connector port.
- A Wallet SDK reference connector signs outside Sotto and completes one real
  Five North external-party capability creation.
- An OpenRPC connector can support Loop or another compatible wallet without
  changing preparation, verification, execution, or reconciliation authority.
- The verifier proves one exact `PurchaseCapability` create root, exact
  arguments, parties, package selection, synchronizer, submission metadata, and
  no hidden transaction effects before any connector is called.
- Sotto and the wallet independently recompute the Canton V2 prepared
  transaction hash. Any mismatch or semantic mutation causes zero signing and
  execution calls.
- Execution submits the unchanged prepared transaction and exact party signature
  once, then requires both an accepted completion and the exact payer-scoped ACS
  contract.
- Wallet rejection, timeout, stale preparation, malformed signature, ambiguous
  execution, and restart behavior remain fail-closed and privacy-safe.

risk_level: critical

## Decision

Use a wallet-neutral core with pluggable connectors. Implement the Wallet SDK
reference connector as the first real DevNet path and an OpenRPC connector for
Loop and other compatible wallets. Do not hard-wire Sotto to a single wallet or
host a generic payer signing service.

The connector supplies only wallet capabilities, approval, and an externally
produced signature. It never decides transaction meaning. The shared core owns
canonical intent, preparation, semantic verification, hash verification,
one-shot execution, and reconciliation.

## Connector Model

| Connector                   | Purpose                                                                  | Acceptance boundary                                                           |
| --------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Wallet SDK reference wallet | First reproducible Five North proof and offline/local approval           | Key stays in the wallet-owned process and storage                             |
| OpenRPC wallet provider     | Browser extension, embedded provider, Loop, or another compatible wallet | Capability negotiation must prove custom prepared-transaction signing support |
| Future connector            | Hardware, mobile, or institutional wallet                                | Implements the same narrow session contract and passes the mutation suite     |

Sotto presents compatible connectors discovered at runtime. An incompatible
wallet remains visible as unsupported with an exact reason; Sotto never falls
back to shared credentials or a generic transfer endpoint.

## End-To-End Flow

```text
Connect wallet
  -> authenticate the wallet-controlled payer Party
  -> prepare one exact PurchaseCapability create
  -> decode the complete prepared transaction
  -> verify root, fields, parties, packages, metadata, and zero hidden effects
  -> recompute the Canton V2 final hash
  -> display the exact capability summary
  -> request one explicit wallet approval
  -> receive a party-scoped signature bundle
  -> verify session, party, hash, algorithm, format, and key fingerprint
  -> durably mark execution started
  -> execute the unchanged prepared transaction once
  -> reconcile exact completion and payer-scoped ACS
```

The wallet approval view shows the payer, agent, resource restriction, recipient
restriction, instrument, per-call limit, remaining total-debit allowance,
maximum total debit, expiry, revision, transfer factory, network, synchronizer,
and package identity. No generic send or arbitrary-signing action is exposed.

## Prepared Transaction Contract

Before requesting a signature, Sotto must prove:

- `HASHING_SCHEME_VERSION_V2` and a locally recomputed final hash;
- exactly one root and exactly one create node;
- the source-pinned `sotto-control` package, module, template, package name, and
  selected package IDs;
- exact capability arguments derived from the reviewed bootstrap policy;
- payer as the sole signatory and payer plus agent as stakeholders;
- payer as the only `actAs` Party and no unexpected `readAs` Party;
- exact command ID, user ID, synchronizer, submission timing, and package
  preference;
- no exercise, fetch, lookup, rollback, extra create, or unknown protobuf field;
- bounded byte size, graph size, value depth, field count, and verification
  work.

The wallet repeats hash recomputation and verifies the decoded approval summary
against the prepared bytes. A connector cannot replace either verifier with a
boolean approval claim.

## Signing Session Contract

Each signing session is bound to one random session ID, origin, payer Party,
prepared-transaction hash, capability-intent hash, connector ID, creation time,
expiry, network, and synchronizer. The session is one-use.

The wallet response must contain only the supported party signature envelope:
party, signature bytes, signature format, signing algorithm, and `signedBy`
fingerprint. Sotto validates canonical encoding and verifies the signature
against the registered public key where current topology evidence permits it.
Raw prepared bytes and signatures stay in private bounded memory or owner-only
temporary storage and never enter public evidence.

Wallet cancellation, origin mismatch, payer mismatch, session replay, stale
preparation, unsupported algorithm, invalid fingerprint, signature mismatch, or
connector timeout stops before execution.

## Execution And Recovery

Execution uses the Canton interactive-submission `execute` endpoint with the
unchanged prepared transaction, V2 hashing scheme, exact payer signatures, and a
unique submission ID. The direct command-submit route is not part of this flow.

The spike journal records only privacy-safe hashes and lifecycle state:

```text
intent-created
prepared-verified
approval-requested
signature-received
execution-started
accepted | rejected | ambiguous
acs-confirmed
```

The journal is fsynced before execution. After `execution-started`, no automatic
reprepare, resign, or re-execute is allowed. Recovery reads completion history
and exact payer-scoped ACS. An ambiguous outcome remains ambiguous until those
authorities agree.

## Real Integration Proof

Deterministic fixtures protect parser and mutation behavior but cannot close the
integration gate. The live proof requires:

1. a real external payer Party whose signing key is wallet-controlled;
2. a real Five North preparation using the reviewed Sotto package;
3. an explicit approval through the Wallet SDK reference connector or a proven
   compatible OpenRPC wallet;
4. an externally produced signature over the locally verified V2 hash;
5. one real interactive execution;
6. an accepted completion and the exact created capability in payer-scoped ACS;
7. redacted evidence containing hashes, IDs, timestamps, connector kind, and
   verdict only.

Capability creation does not perform an x402 purchase. Funding and the first
agent-only capability exercise remain later, separately reviewed live gates.

## Verification Contract

- Drive implementation with RED/GREEN tests for every prepared field, hidden
  effect, package, party, metadata, hash, signature, session, expiry, replay,
  connector, execution, and recovery mutation.
- Run connector contract tests once for the shared port and reuse them for the
  Wallet SDK and OpenRPC adapters.
- Require zero connector calls for every preparation or verification failure and
  zero execute calls for every approval or signature failure.
- Bound network calls, response bytes, signing windows, and parser work.
- Run `pnpm verify`, an empty-cache non-shared clean clone, and a fresh review
  before any live signer or external-party mutation.
- Run the live Five North operation exactly once under an owner-only journal;
  reconcile rather than retry an unknown result.

## Governance Contract

approval_gates:

- Abu approved the wallet-neutral core with pluggable connectors on 2026-07-15.
- A code-review checkpoint is required after the prepared-create verifier and
  before connecting a wallet.
- A second checkpoint is required after connector/session hardening and before
  external-party onboarding or live execution.
- Production remains `NO_GO` until the subsequent agent-only purchase, direct
  payer-transfer rejection, human one-call path, public visibility, and final
  verification gates pass.

rollback: Revert the wallet-integration feature commits as a group, retain the
current direct-submit `HTTP 403` evidence, and preserve the fail-closed `NO_GO`.

ownership: Codex owns implementation, reproducible verification, and redacted
evidence. The wallet owns payer keys and approval. Five North owns participant
and synchronizer enforcement. Abu owns any later custody or production `GO`
decision.

## Rejected Alternatives

- Loop-only integration: custom-package and topology compatibility are not yet
  proven, and product authority must not depend on one provider.
- Sotto-hosted generic signer: it retains payer-wide spending power and creates
  a custodial bypass.
- Restoring payer `actAs` to the shared M2M user: this recreates the exact
  policy bypass the remediation is designed to remove.
- Treating preparation as approval: a prepared transaction has no payer
  signature and cannot satisfy the authority gate.
- Persisting keys or raw signatures in Postgres or Redis: neither storage layer
  is a wallet or signing authority.

## Documentation Basis

- Canton external signing uses interactive preparation followed by execution of
  the unchanged prepared transaction and party signatures.
- The V2 final hash commits the transaction and metadata and must be recomputed
  independently before signing.
- Current Canton wallet guidance supports both embedded and external OpenRPC
  wallet providers and recommends decoding and visualizing prepared effects.
- `@canton-network/wallet-sdk` remains the source-pinned reference integration;
  its private-key convenience APIs are confined to the wallet-owned connector,
  never the Sotto core.
