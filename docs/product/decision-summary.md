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
- Seaport Personal supports custom DAR upload but currently has no configured
  validator; its Loop party is not hosted by the Five North spike participant.
- The successful paid path used Sotto's direct Five North adapter and temporary
  provider, not an upstream FTPtech relay/provider. It does not establish
  external-party signer or upstream interoperability.

## 2026-07-13 Spike Decision Inputs

- Q-003: reject the shared M2M credential as the bounded-agent candidate because
  it can authorize a generic transfer without consuming Sotto policy. Continue
  only with a credential/funding candidate that cannot take that path, or
  present an explicit custodian trust boundary for user acceptance.
- Q-004: the live fixture proved Daml visibility for owner, agent, payer, and
  the selected provider, with outsider-zero ACS. This is evidence, not a
  production receipt-audience decision.
- Q-005: the current Loop party is on a different participant topology and did
  not complete the same Five North payment. Human one-call approval remains
  unselected.
- Q-006: no production web/API/MCP/worker/database/queue topology is selected
  under `NO_GO`; durable first-delivery failure and recovery remain unproven.

## Open Gates

- A signer/funding model whose credential cannot bypass Sotto policy through a
  generic transfer path.
- Private receipt reader set.
- Compatible human one-call approval path.
- Public explorer evidence for the accepted Canton Coin transfer.
- Complete canonical challenge/policy commitment enforcement at the final signer
  boundary.
- Final web/API/MCP/worker/database/queue/Coolify topology.

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
