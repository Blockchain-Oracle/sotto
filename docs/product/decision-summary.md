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

## Open Gates

- Agent signer, funding, mandate lifecycle, atomicity, and bypass model.
- Private receipt reader set.
- Compatible human one-call approval path.
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
