---
design_type: feature
created_at: 2026-07-14
---

# Package Selection And Nested-Effect Signer Boundary

## Intent Contract

intent: Prevent an autonomous Sotto signer from approving a Canton purchase
whose package interpretation or nested ledger effects can drift from the
authorized purchase.

constraints:

- Raw payer keys never enter Sotto, browsers, models, logs, evidence, or Git.
- The shared Five North machine credential cannot serve as the final signer.
- Package selection and prepared effects must both be verified; neither may
  substitute for the other.
- Marketplace publishing, browsing, and human purchases remain policy-free.
- Postgres or Redis cannot become authority for current Canton package selection
  or prepared transaction meaning.
- An in-process branded observation cannot serve as authority across an
  independent signer boundary.
- No live signing, payment, or faucet request occurs in this feature slice.

success_criteria:

- A fresh authenticated snapshot binds the complete upgrade-selectable
  package-name to package-ID mapping for the exact purchase parties and
  synchronizer. A separate source-pinned artifact union bounds every package ID
  permitted in the prepared graph.
- Every selected content-addressed package ID is independently verified against
  immutable metadata declaring the committed package name.
- Canonical purchase bytes bind the sorted snapshot, and the submitted command
  carries exactly the same non-empty package IDs.
- The canonical purchase and attempt formats receive explicit new versions;
  older bytes are rejected rather than silently reinterpreted.
- Empty, stale, duplicated, ambiguous, incorrectly scoped, or mutated snapshots
  cause zero signing calls.
- The prepared-transaction verifier independently validates every allowed root,
  nested exercise, fetch, create, archive, party, package/interface identifier,
  value effect, fee bound, and result shape.
- A prepare-only Five North run proves the selected packages and nested effects
  without signing or spending.
- The deterministic and clean-clone quality gates pass before a separate live
  signer review.

risk_level: high

## Verification Contract

verify_steps:

- Run focused package-snapshot tests covering authentication, exact scope,
  freshness, exhaustive package-name coverage, sorting, duplicates, ambiguity,
  and mutation resistance.
- Run canonical-vector and command-builder tests proving the snapshot changes
  the attempt ID and commitment and that the command carries the identical
  non-empty selection.
- Run a complete nested-node mutation matrix proving any additional, missing,
  reordered, wrongly packaged, or value-changing effect results in zero signing
  calls.
- Bound prepared bytes, graph size, depth, and verification work; retain linear
  traversal over the decoded graph.
- Tighten the generic verifier ceilings to an observed and reviewed purchase
  envelope before signer approval.
- Run the complete pinned `pnpm verify` gate in the active workspace and a fresh
  non-shared Git clone.
- Run one prepare-only Five North observation and retain only redacted package,
  hash, node-shape, timing, and verdict evidence.
- Confirm manually that no signing capability or live-spend path was introduced.
- Complete deterministic verification and a human security review before the
  prepare-only observation accesses local credentials.

## Governance Contract

approval_gates:

- The combined package-selection and nested-effect design requires user approval
  before implementation; approved on 2026-07-14.
- Any inability to prove the exhaustive package-name closure stops execution at
  `NOT PROVEN` before canonical or signer integration.
- A human security review is required after deterministic verifier tests and
  before any prepare-only live observation.
- A second explicit user decision and verification audit are required before
  connecting an independent signer or spending test CC.

rollback: Revert the feature commits as a group; retain the current fail-closed
`NO_GO` boundary and the prior redacted research evidence.

ownership: Codex owns implementation and reproducible evidence; Abu owns the
human gates and any later signer, custody, or live-spend decision.

## Scope

| In scope                                 | Out of scope                        |
| ---------------------------------------- | ----------------------------------- |
| Authenticated preferred-package snapshot | Production signer deployment        |
| Exhaustive package-name closure proof    | Shared M2M credential as signer     |
| Canonical sorted package selection       | Live payment or faucet request      |
| Non-empty command preference             | Marketplace and publishing runtime  |
| Strict nested prepared-effect verifier   | Human wallet integration            |
| Prepare-only live evidence               | Postgres, Redis, queues, or Coolify |
| Performance and resource bounds          | Production `GO` decision            |

## Decisions

| #   | Decision                   | Choice                                                                                                              | Rejected alternatives                                                                       |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | Package and effect defense | Require both an authenticated package snapshot and independent prepared-effect verification                         | Preference-only leaves semantic verifier gaps; verifier-only leaves package-selection races |
| 2   | Snapshot timing            | Acquire a fresh snapshot for each autonomous purchase preparation                                                   | Long-lived cache can survive topology or vetting changes                                    |
| 3   | Canonical representation   | Bind mappings by package name then ID; submit the exact unique ID set in lexical ID order                           | Request order is not Canton semantics; unsorted input creates multiple encodings            |
| 4   | Exhaustiveness             | Keep the reviewed selectable-name closure separate from the source-pinned package-ID union allowed in the graph     | Treating every transitive dependency as a live preference or guessing from one observation  |
| 5   | Failure mode               | Reject empty, stale, ambiguous, duplicate, or mismatched selection before preparation or signing                    | Falling back to participant defaults                                                        |
| 6   | Prepared verification      | Allow only the exact purchase root and reviewed nested effect graph                                                 | Root-only verification or graph-size checks without semantic checks                         |
| 7   | Product exposure           | Apply the boundary only to opt-in autonomous purchases                                                              | Forcing policy configuration on marketplace publishers or human buyers                      |
| 8   | Persistence                | Use an injected claim port and recording fake only; durability remains unproven until a later Postgres-backed slice | Claiming in-memory state is durable or using Redis as authority                             |
| 9   | Signer trust               | A later signer reacquires selection or verifies an audience- and expiry-bound cryptographic attestation             | Passing an application WeakMap brand across a process boundary                              |
| 10  | Retry authority            | Require a durable Postgres attempt journal before any later live signing or spend                                   | Refreshing selection and repreparing after signing or ambiguous dispatch                    |

## Surface

APIs: Add a branded, authenticated package-selection observation scoped to the
purchase parties, synchronizer, package-name requirements, and acquisition time.
The purchase commitment, ledger intent, and command builder consume the
authenticated projection rather than caller-supplied package IDs.

The reviewed closure has two different projections. The live selectable
projection resolves the exact upgrade-selectable names (`sotto-control` and
`splice-amulet`) to one ID each. The artifact projection contains every
source-pinned package ID/name/version tuple allowed to occur in the prepared
graph, including historical creation packages and fixed transitive dependencies.
Neither projection may be substituted for the other.

Storage: This spike adds no database. The observation is one-use and short-lived
in process. A claim-port recording fake proves call order and zero-signing
behavior but is explicitly not durable. Only redacted package IDs, hashes,
timing, and verdicts may enter private evidence. A later live-spend slice must
persist attempts and ambiguous outcomes in Postgres before signing. Persisted
snapshots remain audit inputs only; the signer must reacquire current authority.
Redis never authorizes freshness, signing, deduplication, or settlement.

Components: Extend the x402-Canton package-selection contract, canonical
purchase projection, command builder, prepared-transaction semantic verifier,
signer boundary, Five North preferred-package reader, prepare-only runner, and
their mutation/performance tests.

Files touched: The package-selection and canonical purchase modules under
`packages/x402-canton`, the prepared-purchase verifier modules, the Five North
prepare readers and runner, focused tests, and redacted architecture evidence.

## Reviewed Deterministic Envelope

These are fail-closed verifier limits, not production latency or throughput
claims. They retain room for the accepted maximum of 16 input Holdings while
removing the earlier generic parser-scale ceilings.

| Resource                |                       Limit |
| ----------------------- | --------------------------: |
| Prepare response        |                       3 MiB |
| Prepared transaction    |                       2 MiB |
| Graph                   | 64 nodes, 63 edges, depth 8 |
| Metadata inputs         |                20 contracts |
| Receiver/change outputs |                     16 each |
| Value traversal         |  4,096 work units, depth 16 |
| Input event blobs       |   256 KiB each, 1 MiB total |

Verification retains one protobuf decode. The recorded elapsed microseconds are
informational evidence only and never authorize package selection, claiming, or
signing.

## Risks & Open Questions

- The participant may not expose enough metadata to prove every selectable
  nested implementation package. If so, the feature stops at `NOT PROVEN`.
- Package preferences constrain selection but do not prove economic effects; the
  nested verifier remains mandatory.
- Prepared transaction schemas may represent interface and template identifiers
  differently across Canton releases. Only current pinned schema evidence may
  enter the verifier.
- A per-purchase preferred-packages read adds one network round trip. This is
  accepted for opt-in autonomous payments because settlement latency dominates,
  while ordinary marketplace traffic is unaffected. It may run alongside other
  read-only purchase acquisition after the challenge scope is fixed.
- The final signer isolation, human approval path, and public settlement view
  remain separate production blockers after this feature.
