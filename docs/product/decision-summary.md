# Decision Summary

## Accepted

- The active product is Sotto Canton x402, not payroll.
- The prior payroll repository is a separate archive, not an implementation
  base.
- Required product surfaces are marketplace, Add API, provider/resource detail,
  Composer, Scan, transaction evidence, statistics/health, owner session, thin
  CLI, buyer MCP, skill, and operator moderation.
- Canton is the only first-release rail.
- Existing Canton x402 infrastructure is reused and credited.
- Private bounded agent-purchase authority is the Canton differentiation.
- First release uses one Canton-party-backed owner account, without teams.
- Sotto sessions use replay-safe party-control proof, not email OTP.
- Human wallet and autonomous signer paths are separate.
- No ledger-enforced claim ships before live-price, funding, atomicity, and
  bypass proof.
- Coolify is the eventual application host; Five North is the mandatory ledger.
- Product research, specification, stories/design, planning, implementation, and
  verification remain separate Context Engineering stages.
- The accepted x402 prototype is design evidence only.
- The clean split and DevNet spike plan is the current execution authority.

## Research Facts

- FTPtech already ships Canton x402 facilitator, payer, middleware, MCP, and
  reference integration packages.
- Its external payer holds a local Ed25519 key and verifies relay-prepared token
  transfers before signing.
- Existing MCP caps are process-local policy, not a private Daml mandate.
- A signer with unrestricted payer authority can bypass a separate mandate.
- Loop browser support for third-party Daml packages cannot be assumed.
- Canton Coin settlement may be public through Scan; separate Sotto context can
  remain party-scoped.
- x402scan is a behavioral/design reference but has no repository-level license.
- Five North accepts one command transaction containing Sotto policy
  consumption, private context creation, and the standard Canton Coin transfer.
- The shared Five North machine credential can also submit the transfer without
  consuming policy, so it is not a bounded signer or funding boundary.
- A later Five North run used an external agent that alone exercised a
  payer-signed `Purchase` capability. The accepted update paid the provider,
  returned payer change, and reduced the capability in one transaction.
- An otherwise identical direct-transfer preparation failed for the external
  agent with the exact missing-payer-authority oracle, while the payer control
  prepared. Execution was disabled for both controls, so this is not claimed as
  an executed rejection.
- A later policy-free human prepare-only run used a real Five North `402`, payer
  holdings, package preference, TransferFactory context, and interactive
  preparation. Its complete effects and official Canton V2 hash verified, with
  no wallet approval, signature, execution, settlement, delivery, or Canton Coin
  debit.
- A subsequent policy-free human-wallet run used the wallet-neutral reference
  connector. The isolated payer wallet displayed and approved the exact GET,
  recipient, 0.25 CC principal, 0.075 CC fee ceiling, 0.325 CC debit ceiling,
  network, synchronizer, package, and expiry; it then signed outside the Sotto
  process. Five North accepted the transaction, the provider independently
  reconciled its exact SendV2 and holding, and the identical paid retry returned
  the authentic JSON `200`.
- The immediately preceding human attempt also settled but lost delivery after
  an over-strict provider-view `commandId` check closed its ephemeral tunnel.
  Its owner-only journal recovered the exact successful update as
  `settled-undelivered`; it was not replayed or mislabeled as delivered.
- Seaport Personal supports custom DAR upload but currently has no configured
  validator; its Loop party is not hosted by the Five North spike participant.
- The original July 13 paid path used Sotto's direct Five North adapter and
  temporary provider, not an upstream FTPtech relay/provider. The later
  external-agent run establishes that signer boundary, but neither run
  establishes upstream interoperability.

## Spike Decision Inputs

- Q-003: resolved for the spike. Reject the shared M2M credential, and use the
  externally controlled payer plus agent-only bounded capability. The live
  purchase succeeded with only external-agent authority; the matched direct
  prepare control failed for missing payer authority while the payer control
  prepared, with zero execute calls.
- Q-004: the latest live purchase context was visible to payer, agent, and
  provider. An outsider saw zero contexts and received `404` for direct
  transaction lookup. This is evidence, not a production receipt-audience
  decision.
- Q-005: resolved for the spike through the wallet-neutral reference connector.
  One exact Five North human purchase was approved, signed, executed,
  reconciled, and delivered as `200` without the payer key entering the Sotto
  process. This does not prove Loop compatibility, production wallet custody, or
  a deployed connector service.
- Q-006: no production web/API/MCP/worker/database/queue topology is selected
  under `NO_GO`. The spike now has an owner-only append-only recovery journal,
  including terminal delivered recovery, but its temporary provider and
  in-memory delivery claims are not PostgreSQL-backed production durability.

## Open Gates

- Private receipt reader set.
- Production wallet connector deployment and custody boundary.
- Public explorer evidence for the accepted Canton Coin transfer.
- Durable PostgreSQL-backed delivery, unknown-outcome recovery, and replay
  state.
- Final web/API/MCP/worker/database/queue/Coolify topology and a reviewed
  production `GO`.

These questions are resolved only from the DevNet spike and explicit product
decisions. Code, prototypes, and research cannot approve themselves.

## Rejected Or Not Approved

- Payroll product scope.
- Public demo/showcase/sample-tenant architecture.
- Email OTP authentication.
- Organization/team/invitation/role administration.
- Auditor product.
- Generic wallet/banking/send/withdrawal surfaces.
- Multi-network x402scan clone or facilitator leaderboard.
- Fake transactions, metrics, explorer evidence, or successful settlement.

## Repository Decision

- Local active workspace: `sotto-x402`.
- Payroll GitHub archive: `Blockchain-Oracle/sotto-payroll-archive`.
- Active GitHub product: fresh `Blockchain-Oracle/sotto` history.
- Relevant private context is migrated through an exact checksum manifest; mixed
  historical `.thoughts`, raw clones, secrets, and payroll agent reports are
  not.
