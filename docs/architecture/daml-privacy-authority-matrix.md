# Daml Privacy Probe Authority Matrix

## Scope

This is the pre-implementation authority contract for the research-only Sotto
DAR. It tests policy lifecycle, bounded consumption, atomic private context
creation, and stakeholder visibility. It does not prove that the policy controls
Canton Coin or that the current Five North machine credential is a constrained
signer.

## Templates

`PurchasePolicyProbe` is signed by `payer` and observed by `owner` and `agent`.
It records one allowed resource hash and recipient, a per-call limit, remaining
test allowance, expiry, revision, paused state, and consumed attempt IDs.

`PurchaseContextProbe` is signed by `payer` and observed by `owner`, `agent`,
and the selected `provider` fixture. It records only the pre-submission attempt
ID, request commitment, resource hash, policy revision, and amount. It never
stores a prompt, response body, key, authorization header, or resulting update
ID.

## Command Matrix

| Command        | Signatory / observers          | Choice controller   | Submitted `actAs`      | `readAs`       | Required input/disclosure | Current signer             |
| -------------- | ------------------------------ | ------------------- | ---------------------- | -------------- | ------------------------- | -------------------------- |
| Create policy  | payer / owner, agent           | n/a                 | payer                  | none           | none                      | Five North M2M ledger user |
| Consume policy | payer / owner, agent           | agent and payer     | agent, payer           | owner optional | active policy CID         | Five North M2M ledger user |
| Pause policy   | payer / owner, agent           | owner and payer     | owner, payer           | none           | active policy CID         | Five North M2M ledger user |
| Revoke policy  | payer / owner, agent           | owner               | owner                  | none           | active policy CID         | Five North M2M ledger user |
| Create context | payer / owner, agent, provider | only inside Consume | inherited agent, payer | n/a            | atomic child of Consume   | Five North M2M ledger user |

`Consume` is consuming. It rejects paused, expired, duplicate, resource,
recipient, non-positive, per-call, and remaining-limit violations before it
atomically creates one reduced replacement policy and one private context.
Failure creates neither. A stale policy CID cannot consume the replacement.

`Pause` is consuming and creates a paused replacement with a higher revision.
`Revoke` is consuming and creates no replacement. These separate lifecycle
oracles avoid treating a boolean flag as proof of archival revocation.

## Visibility Matrix

| Reader               | Policy  | Context | Reason                            |
| -------------------- | ------- | ------- | --------------------------------- |
| payer                | visible | visible | signatory                         |
| owner                | visible | visible | observer                          |
| agent                | visible | visible | observer                          |
| provider fixture     | absent  | visible | context observer only             |
| fresh outsider party | absent  | absent  | no stakeholder role               |
| public Scan          | absent  | absent  | no public Canton stakeholder role |

During the July 13 probe, Five North's shared M2M token had participant
administration, read-any authority, and named `actAs` rights for the live owner,
agent, and payer roles. Live queries therefore used explicit party-scoped event
formats/readers, and their result proved Daml stakeholder visibility rather than
credential isolation. That historical token state could satisfy both `Consume`
controllers and was an explicit negative signer-boundary result.

On July 15, a read-only recheck found that named external-payer `CanActAs` was
absent, although participant administration and execute-as-any-party remained.
On July 16, that external payer used a wallet-held key to create one real
`BoundedPurchaseCapability`; the Sotto application did not receive the key or
payer authority. Completion history and payer-scoped ACS agreed on exactly one
active capability. No purchase or Canton Coin transfer was part of that action.

## Delegated Capability Matrix

| Operation                 | Contract authority                        | Root `actAs` | Proven state                                      |
| ------------------------- | ----------------------------------------- | ------------ | ------------------------------------------------- |
| Create bounded capability | external payer signatory                  | payer        | Live through Wallet SDK reference connector       |
| Exercise bounded purchase | payer consequence authority; agent choice | agent        | Deterministic Daml and prepared-effect tests only |
| Generic payer transfer    | transfer sender/controller is payer       | agent        | Deterministic rejection; matched live oracle next |
| Pause/revoke capability   | payer-controlled lifecycle                | payer        | Deterministic tests only                          |

The live create proves the setup custody boundary, not the final autonomous
purchase boundary. Production remains `NO_GO` until the same restricted agent
identity succeeds through the capability and fails an otherwise-valid direct
payer transfer, with exact completion and ACS evidence for both conclusions.
