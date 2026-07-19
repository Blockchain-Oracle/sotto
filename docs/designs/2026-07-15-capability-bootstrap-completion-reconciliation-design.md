# Capability Bootstrap Completion Reconciliation Design

Status: Approved under Abu's explicit delegated recommendation on 2026-07-15.

## Objective

Make a future one-shot Five North `BoundedPurchaseCapability` bootstrap
recoverable without guessing from a timed-out HTTP response or replaying a
command. Persist the command-completion starting point before submission, then
require Canton completion evidence and exact capability ACS evidence to agree.

This design does not authorize another live bootstrap. It changes deterministic
recovery code only. Any later DevNet write requires a new governed operation,
new stable action keys, and separate human approval. It never authorizes a
purchase, signer, execution, payment, faucet, delivery, or settlement call.

## Evidence From The Failed Retry

The completed retry issued one submission request but received an ambiguous
transport outcome. Three payer-scoped exact ACS recoveries found no compatible
capability. A later bounded query of the official Canton 3.5.2 completion
service covered history from ledger begin through a captured ledger end and
found no completion for the exact persisted command. The operation was therefore
terminally reconciled as a failed no-commit: one transport submission attempt,
zero Ledger completions, zero Ledger mutations, and no capability.

The missing system boundary was not another credential. It was a durable
pre-submit completion cursor and a reviewed completion parser available to the
journal recovery path.

## Approaches Considered

### 1. Continue With ACS-Only Recovery

This is the current implementation. It is simple and proves success when one
exact compatible contract appears, but an empty ACS cannot distinguish a
rejected command, a request that never reached the Ledger, or delayed
visibility. It is rejected because it preserves the ambiguity observed live.

### 2. Persisted Completion Cursor Plus Exact ACS — Selected

Capture the payer-visible Ledger end before submission, persist and fsync it in
the journal, then submit once. After any response or ambiguity, query the
official command-completion service from that cursor through a freshly captured
end and reconcile the exact command, authenticated user, and payer. Then query
the exact capability ACS at or after that captured completion end. The two
oracles must agree before a terminal result is recorded.

This preserves the reviewed one-root creation request and one-shot submit
endpoint while closing the recovery gap with the smallest protocol change.

### 3. Replace Submit-And-Wait With A New Async Submission Architecture

An asynchronous submission plus long-lived completion consumer could also work,
but it changes the transport and operational topology before the narrow DevNet
gate is proven. It is deferred until production durability work.

## Durable Journal Sequence

The journal remains ignored, owner-only, exclusive, and fsynced:

1. `00-intent.json`: exact source-bound bootstrap request.
2. `05-completion-cursor.json`: authenticated pre-submit Ledger offset,
   operation ID, timestamp, and hash-chain link to the intent.
3. `10-submission-started.json`: durable permission to dispatch exactly once,
   chained to the cursor rather than directly to the intent.
4. `30-resolved.json`: one exact compatible capability proven by completion and
   ACS, retaining the existing success result.
5. `30-failed.json`: definitive command rejection plus empty exact ACS. It is a
   terminal no-effect record and makes recovery perform no network call.

Existing version-one journals without a cursor remain readable for audit, but
they can never authorize a new submission. A new start must have the cursor
durable before it may create the submission-started record.

Cursorless legacy recovery records may retain their historical null offset and
update ID. Every cursor-backed terminal success must retain the exact completion
offset and update ID; null metadata is rejected once a cursor exists. Legacy
records remain loadable for audit but cannot produce current live evidence.

## Completion Reader

The reader uses the official Canton Ledger API v3.5.2 JSON route:

- `POST /v2/commands/completions`
- request body: exact `userId`, `parties: [payer]`, and `beginExclusive`
- bounded query: `limit=1000` and a short stream idle timeout
- bounded response bytes, pages, entries, and total acquisition time

It validates every response variant, advances only through monotonic completion
or checkpoint offsets, and stops only after reaching the captured reconciliation
end. It accepts at most one completion for the exact command. The completion's
user and `actAs` authority must match the persisted request.

The reader returns only one of:

- `SUCCEEDED` with a nonempty update ID and completion offset;
- `REJECTED` with the numeric Canton status code and completion offset; or
- `ABSENT_COMPLETE` after the bounded window is fully covered.

No token, Party ID, command ID, update ID, endpoint, raw response, or offset may
enter public evidence.

## Dual-Oracle Decision Table

| Completion result | Exact capability ACS                       | Decision                                        |
| ----------------- | ------------------------------------------ | ----------------------------------------------- |
| `SUCCEEDED`       | one exact match                            | Persist success                                 |
| `SUCCEEDED`       | empty, duplicate, or mismatch              | Fail closed; inconsistent Ledger observation    |
| `REJECTED`        | empty                                      | Persist terminal failed no-commit               |
| `REJECTED`        | any active capability                      | Fail closed; contradictory evidence             |
| `ABSENT_COMPLETE` | one exact match                            | Fail closed; completion history is inconsistent |
| `ABSENT_COMPLETE` | empty                                      | Remain unresolved; never replay automatically   |
| any result        | duplicate or nonmatching active capability | Fail closed for human review                    |

An authentic submit-and-wait success response is useful corroboration but is not
independently terminal. Success still requires the exact completion and ACS
pair.

## Network And Authority Boundary

The capability bootstrap network guard adds only the exact completion route. It
keeps the existing token subject, payer-only authority, endpoint allowlist,
single-submit limit, cancellation scope, response caps, and prohibited-port
absence. Completion and ACS reads share the same authenticated subject used for
readiness and submission.

The cursor is captured after the empty ACS preflight and freshness check, then
persisted before the submission-started marker. A cancellation or crash before
the marker cannot submit. A crash after the marker can only reconcile.

## Deterministic Acceptance

Tests must prove:

- submission is impossible until the exact cursor is durably hash-chained;
- recovery never invokes the submitter;
- completion success plus one exact ACS match resolves once;
- rejection plus empty ACS writes a terminal failed record once;
- absent completion plus empty ACS stays unresolved without rewriting state;
- completion/ACS contradictions fail closed;
- wrong command, user, payer, offsets, variants, status shapes, duplicate
  completions, oversized pages, excessive pages, and nonmonotonic pagination are
  rejected;
- legacy cursorless journals remain readable but cannot start or resubmit;
- terminal success or failure returns from durable state without network;
- concurrent processes still produce at most one submission; and
- redacted evidence and errors expose no private identifiers or response data.

## Live Acceptance For A Later Governed Operation

A new live bootstrap may be proposed only after focused tests, the complete
pinned repository gate, clean-source verification, and adversarial review pass.
That later run must prove the cursor is durable before its one submission, then
show one exact successful completion and one exact compatible capability at or
after the completion offset. Until then, live capability creation and production
remain `NOT_PROVEN` and `NO_GO`.
