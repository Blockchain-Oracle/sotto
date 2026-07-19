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
- The first production topology is one `web-api` process, one restartable
  worker, one private PostgreSQL authority, and wallet connectors outside the
  application/database trust boundary. Redis is deferred until measurements
  justify it.
- Enriched private receipts are limited to the authenticated owner/payer and the
  initiating agent. Providers receive only the minimum settlement/delivery
  reference; operators and public views receive redacted evidence.
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
- Lighthouse now returns the accepted external-agent settlement anonymously at
  its public transaction endpoint. Its public index had advanced beyond that
  transaction when rechecked on July 17. The later human-wallet settlement was
  still ahead of the public cursor and remains indexing-pending rather than
  failed.

## Spike Decision Inputs

- Q-003: resolved for the spike. Reject the shared M2M credential, and use the
  externally controlled payer plus agent-only bounded capability. The live
  purchase succeeded with only external-agent authority; the matched direct
  prepare control failed for missing payer authority while the payer control
  prepared, with zero execute calls.
- Q-004: resolved. The enriched receipt is readable only by the authenticated
  owner/payer and initiating agent. The provider receives the minimum
  settlement/delivery reference, public and operator views are redacted, and
  unauthorized lookup is existence-hiding.
- Q-005: resolved for the spike through the wallet-neutral reference connector.
  One exact Five North human purchase was approved, signed, executed,
  reconciled, and delivered as `200` without the payer key entering the Sotto
  process. This does not prove Loop compatibility, production wallet custody, or
  a deployed connector service.
- Q-006: resolved as a design decision. One `web-api` process, one restartable
  worker, one private PostgreSQL authority, an explicit migration job, and
  wallet connectors outside the application boundary form the first-release
  topology. The PostgreSQL catalog, purchase journal, and encrypted internal
  prepare-authority checkpoint with generation-bound worker leases now implement
  part of this topology. A one-shot worker library now runs the authenticated
  prepare pipeline outside database transactions and commits the exact fenced
  checkpoint before wallet handoff. The journal and one-shot execution worker
  now also persist approval, wallet decision, verified-signature, and
  execution-started transitions, with the exact execution fence and one
  reconciliation job committed before the execute request. Disposable PostgreSQL
  plus a compiled Wallet SDK child proves this local process path and
  same-process repository reopen. A separate database-only worker now proves
  post-fence reconciliation across actual killed and replacement Node processes:
  generation-fenced reclaim, stale-worker rejection, exact provider-settlement
  verification, and one durable event-6 terminal checkpoint, without wallet,
  signing, prepare, dispatch, or execute authority. This uses real local
  PostgreSQL and bounded loopback HTTP with a synthetic Canton transaction.
  External key custody, pre-fence wallet-handoff recovery, deployed connectors
  and reconciliation transport, live Five North execution through this worker,
  durable delivery recovery, and release evidence remain unproven.

## Open Gates

- Production wallet connector deployment and custody boundary.
- Production prepare-authority key storage, rotation, backup, and recovery.
- A deployed authenticated reconciliation adapter and a live Five North
  post-execution recovery proof.
- A reviewed definitive-absence oracle before any settlement retry; an
  unresolved execution remains reconciliation-only.
- Durable paid delivery, unknown-delivery recovery, and exact response replay
  across process replacement.
- Implemented and deployed web/API/MCP/worker/database/Coolify topology plus a
  reviewed production `GO`.

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

## Takeover Amendments (2026-07-19, product owner)

Recorded from the product owner's explicit direction at the takeover planning
gate. Where these conflict with earlier entries, the amendment wins; everything
else above stands.

1. A marketing site (apex `usesotto.xyz`) and a documentation site
   (`docs.usesotto.xyz`) exist as separate apps. The earlier "no marketing
   landing, no public docs route" rule continues to govern the product app
   itself: inside `app.usesotto.xyz`, `/` is the working marketplace and no
   `/docs` route exists. The marketing site is bound by the same anti-slop and
   no-fabrication rules as every surface.
2. Judge funding is sanctioned scope: real DevNet tap funding with real update
   identifiers, testnet-only, idempotent, inside the hosted-wallet onboarding
   flow. Never a separate page; never simulated.
3. The Composer model provider is OpenRouter, held server-side only. The model
   translates natural-language task input into the selected resource's request
   schema and nothing else: it never sees keys or sessions, never triggers
   payment, and never supplies URLs.
4. The CLI is published as `@sotto/cli` (npm name availability confirmed
   2026-07-19; organization and token provisioned by the product owner at
   publish time).
5. The visual identity is "Sotto Voce" per `DESIGN.md` (identity gate C0), and
   the product mark is the approved "undertone" mark implemented in
   `packages/ui/src/marks/sotto-mark.tsx`.
6. Hosted judge wallets run as an isolated signer service (`apps/signer`, "Sotto
   Reference Wallet") hosting the proven wallet-neutral reference connector. It
   is honestly framed as a hosted reference deployment; wallet sessions, Sotto
   sessions, and autonomous signer authority remain distinct. Production custody
   still requires the open-gate work above.

## Repository Decision

- Local active workspace: `sotto-x402`.
- Payroll GitHub archive: `Blockchain-Oracle/sotto-payroll-archive`.
- Active GitHub product: fresh `Blockchain-Oracle/sotto` history.
- Relevant private context is migrated through an exact checksum manifest; mixed
  historical `.thoughts`, raw clones, secrets, and payroll agent reports are
  not.
