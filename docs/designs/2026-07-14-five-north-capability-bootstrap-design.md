# Five North Least-Authority Capability Bootstrap Design

Status: Approved by Abu on 2026-07-14.

## Objective

Create exactly one short-lived `BoundedPurchaseCapability` on Five North after
the read-only diagnostic proved that the compatible active cardinality is
`ZERO`. This is a real DevNet integration gate. A mock, fixture, locally created
event, or structurally similar object cannot satisfy the result.

The bootstrap creates authority but makes no purchase. It must not contact the
paid provider, prepare a purchase, sign purchase bytes, execute an agent
purchase, request faucet funds, transfer Canton Coin, or claim production
readiness.

## Selected Approach

Use the existing reviewed `sotto-control` 0.2.0 capability contract and the
existing Five North shared machine credential once as the payer bootstrap
authority. The credential remains disqualified from autonomous purchase signing
and production because it retains generic payer authority.

The capability policy is intentionally smaller than the earlier reusable
research fixture:

| Field                        | Approved value                                                   |
| ---------------------------- | ---------------------------------------------------------------- |
| Per-call principal ceiling   | `0.25 CC` (`2500000000` atomic)                                  |
| Lifetime total-debit budget  | `0.325 CC` (`3250000000` atomic)                                 |
| Per-call total-debit ceiling | `0.325 CC` (`3250000000` atomic)                                 |
| Lifetime                     | One hour from live construction                                  |
| Instrument                   | Five North Amulet from authenticated AmuletRules                 |
| Payer                        | Configured Sotto payer                                           |
| Agent                        | Configured Sotto policy agent, distinct from payer               |
| Recipient                    | Configured Sotto provider                                        |
| Resource                     | Exact configured HTTPS origin and path under `sotto-resource-v1` |
| Package                      | Exact approved `sotto-control` package ID                        |
| Factory                      | Fresh direct Token Standard factory with pinned disclosure       |

This budget supports the current full-price spike purchase plus a bounded fee
reserve. It is not described as a universal exactly-once capability: a residual
budget could authorize a lower-priced request for the same resource until the
budget or one-hour expiry is reached. Exact call-count authority would require a
new Daml field and another DAR deployment cycle.

## Real Integration Sequence

1. Require a clean tracked source commit, pinned Node/Java/DPM/Daml toolchains,
   ignored owner-controlled local credential storage, and a recorded HOTL human
   approval for one `secret_access` plus `external_write` action.
2. Create one bounded cancellation scope and a network allowlist containing only
   the OIDC token endpoint, AmuletRules, exact package presence, preferred
   packages, Ledger end, payer-scoped Holding ACS, TransferFactory registry,
   payer-scoped capability ACS, and the single transaction submission endpoint.
3. Authenticate readiness from live AmuletRules, exact package presence,
   preferred `sotto-control` reference, synchronizer, and stable token subject.
4. Read payer Holdings at one Ledger offset and obtain one fresh direct
   TransferFactory response whose disclosed factory contract, creation template,
   synchronizer, and choice arguments are pinned.
5. Construct one `CreateCommand` with only `actAs: [payer]`, no `readAs`, the
   exact Sotto package preference, a deterministic command ID, and the approved
   capability fields.
6. Create an owner-only ignored journal under
   `.thoughts/tmp/devnet-capability-bootstrap`. Persist and fsync the exact
   source-bound intent before any submission marker.
7. Read the payer-scoped exact capability ACS. It must be completely empty, not
   merely free of compatible contracts. Any active capability stops the action
   before submission and requires separate lifecycle analysis.
8. Recheck freshness, fsync the submission-started marker, recheck freshness,
   and issue at most one transaction submission request.
9. Parse an authentic success response when available. In every case, reconcile
   against a fresh payer-scoped capability ACS and require exactly one active
   contract matching every approved field and synchronizer.
10. Persist a terminal journal result and a separate redacted evidence artifact.
    Never resubmit an identical or replacement command automatically.

## Failure And Recovery Semantics

- Before the durable submission marker: fail safely; no Ledger mutation was
  authorized.
- After the marker and before a proven response: outcome is ambiguous. Perform
  read-only ACS reconciliation only.
- Matching active capability: record `submitted` or `reconciled-after-ambiguous`
  and stop.
- Empty ACS after an ambiguous outcome: record no success, retain the journal,
  and stop as unresolved. Do not retry.
- Multiple or mismatched capabilities: fail closed and require human review.
- Restart with a submission marker: recovery may only read and reconcile. It
  cannot submit.
- Restart with a terminal result: return the durable result without network I/O.

The HOTL action idempotency key and the journal operation ID are separate
guards. HOTL records permission and external-effect state; the owner-only
journal prevents process restarts from causing a second Ledger dispatch.

## Evidence And Privacy

The tracked repository stores code and deterministic tests only. Live evidence
stays ignored and mode `0600`. The public-safe projection may contain:

- `OBSERVED`, `NOT_PROVEN`, or `AMBIGUOUS` status;
- whether the post-action compatible classification is `ONE`;
- bounded endpoint call counts;
- whether the response and ACS agreed;
- whether mutation, provider, prepare, signing, execution, payment, and
  settlement calls occurred.

It must not contain tokens, client credentials, Party IDs, contract IDs,
command/update IDs, URLs, request bodies, response bodies, factory data,
prepared bytes, signatures, balances, or raw capability counts.

## Deterministic Acceptance

Tests must prove:

- the approved policy uses the exact limits and a one-hour dynamic expiry;
- any policy, package, party, resource, factory, synchronizer, or authority
  mutation fails before submission;
- the preflight requires an entirely empty capability ACS;
- the journal is owner-only, source-bound, fsynced, exclusive, and hash-chained;
- concurrent starts produce at most one submission;
- a definitive rejection, timeout, lost response, malformed response, or process
  restart never causes an automatic resubmission;
- an ambiguous outcome can become success only through exact ACS reconciliation;
- redacted evidence excludes every private identifier and byte payload; and
- provider, purchase preparation, purchase signing, purchase execution, payment,
  and settlement ports are absent from the live bootstrap surface.

## Live Acceptance

The real integration passes only when all of the following hold:

1. The tracked deterministic and clean-source gates pass at the exact source
   commit.
2. A governed action is approved and begun with a stable idempotency key.
3. The live preflight observes an empty exact capability ACS.
4. At most one real bootstrap submission is dispatched.
5. A fresh live payer-scoped ACS proves exactly one capability matching the
   approved policy and synchronizer.
6. The durable journal and redacted evidence agree.
7. No provider, prepare, purchase signer, purchase execution, payment, faucet,
   or settlement action occurs.

Passing this gate establishes only DevNet capability creation. The independent
signer, direct-transfer bypass oracle, human-wallet approval, public settlement
observation, and durable production attempt journal remain required before
production `GO`.
