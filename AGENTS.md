# Sotto - Agent Router

Sotto is the Canton-focused marketplace, execution surface, and evidence layer
for x402-paid APIs. The repository currently exists to run the real Five North
payment and authority spike before production implementation begins.

## Required Source Order

1. `docs/product/product-contract.md` - accepted product scope and non-goals.
2. `docs/product/decision-summary.md` - accepted decisions and unresolved gates.
3. `docs/architecture/devnet-spike-plan.md` - accepted execution boundary.
4. `docs/quality/quality-contract.md` - mandatory engineering and release gates.
5. `README.md` - public implemented-status statement.

Optional private depth is restored under ignored `.thoughts` from the exact
tracked `context/manifest.json`. Required authority must never depend on private
context being present.

## Current Stage

- Fresh repository and curated context split.
- No production runtime exists.
- Do not translate the UI prototype into runtime code during the split/spike
  plan.
- The next implementation is the minimal quality workspace and real DevNet
  evidence path described by the accepted plan.

## Product Rules

- Marketplace, Add API, Composer, Scan, transaction evidence, CLI, buyer MCP,
  skill, and private bounded agent-control direction are accepted.
- One Canton-party-backed owner account is the first-release account model.
- A wallet session, Sotto application session, and autonomous signer are distinct.
- API enablement, Canton merchant readiness, and marketplace listing are distinct.
- Reuse existing Canton x402 packages and credit their source.
- Never claim global Canton coverage, private Canton Coin settlement,
  non-custody, atomicity, or ledger-enforced limits without exact evidence.
- Settlement and delivery are separate outcomes.
- Runtime metrics and transactions must be persisted real events; honest zero is
  required before activity exists.

## Prohibited Scope

- Payroll, employees, payslips, employer/auditor personas.
- Email OTP, organization/team/invitation/role administration.
- Generic wallet, balance, send, withdrawal, bridge, swap, or banking UI.
- Public sample/showcase tenant, `/demo`, `/proof`, or public `/docs` surface.
- Multi-network or facilitator leaderboard.
- Prototype fixtures imported by runtime source.

## DevNet Gates

Production planning requires:

1. a new x402-specific Sotto DAR uploaded, vetted, and exercised on Five North;
2. one authentic `402 -> sign -> settle -> 200` request;
3. exact facilitator/relay/participant requirements;
4. live-price and request binding at the signer boundary;
5. atomic policy/transfer behavior or an explicit `NOT PROVEN` result;
6. public settlement visibility with absent outsider private context;
7. a reviewed `GO` plus explicit decisions for the signer, receipt audience,
   human approval path, and production topology.

## Security Rules

- Raw signer keys never enter browsers, models, logs, evidence, or Git.
- Server-side API probing must defend against SSRF, redirect abuse, DNS rebinding,
  oversized responses, unsafe content, and unbounded timeouts.
- Browser-submitted price, recipient, network, scheme, and compatibility are
  never authoritative.
- Secrets live only in ignored local files or deployment secret stores.
- Five North is multi-tenant: use `sotto-` parties and never enumerate unrelated
  parties or users.

## Repository Rules

- `.thoughts` is ignored and never committed.
- No payroll runtime, raw research clone, generated DAR, dependency tree, build
  output, wallet file, or environment file enters Git.
- x402scan has no repository-level license. Learn from behavior and information
  architecture; never copy its source.
- FTPtech and official x402 source may be reused only with compatible licensing,
  attribution, and a recorded source pin.
- Conventional commits, protected `main`, pull-request-only changes after the
  bootstrap commit.
- Target 200 source lines; warn above 200; hard cap 300, excluding generated
  artifacts, migrations, lockfiles, fixtures, and snapshots.

## Current Commands

The repository has no application toolchain yet. Valid current checks are:

```text
node scripts/context-sync.mjs verify --source <archive-root>
git diff --check
```

Add commands here only after the workspace actually provides them.
