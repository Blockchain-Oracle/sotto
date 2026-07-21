<h1 align="center">Sotto</h1>

<p align="center"><b>The marketplace, execution surface, and evidence layer for x402-paid APIs on Canton.</b></p>

<p align="center">
  <a href="https://app.usesotto.xyz">App</a> ·
  <a href="https://usesotto.xyz">Website</a> ·
  <a href="https://docs.usesotto.xyz">Docs</a> ·
  <a href="https://www.npmjs.com/package/@usesotto/cli">CLI</a> ·
  <a href="https://github.com/Blockchain-Oracle/sotto">Source</a>
</p>

Providers publish APIs that already return a valid Canton x402 payment
challenge. Buyers and agents discover those resources, prepare an **exact** paid
call, approve it in a wallet, and watch it settle on Canton — with **settlement
and delivery kept as separate facts** the whole way. The public moments are
named every time: the Canton Coin transfer is visible on the ledger; the task
input, the paid response, and the enriched receipt stay party-scoped.

⚠️ **Read this first.** Sotto runs on Canton Five North DevNet. This is
unaudited DevNet software and every payment is test Canton Coin; production
wallet custody, mainnet, and ledger-enforced limits are not claimed — see
[What we do not claim](#what-we-do-not-claim).

It is not a general Canton block explorer, not a custodial bank, and not a
mixer. It is a Canton x402 marketplace with honest boundaries: real settlement
evidence where it exists, and a designed "not proven yet" state everywhere it
does not.

## Live deployments

| Surface                | URL                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------- |
| Product site           | <https://usesotto.xyz>                                                                  |
| Marketplace app        | <https://app.usesotto.xyz>                                                              |
| Documentation          | <https://docs.usesotto.xyz>                                                             |
| API                    | <https://api.usesotto.xyz> (`GET /healthz`)                                             |
| Sotto Reference Wallet | <https://wallet.usesotto.xyz>                                                           |
| CLI (npm)              | `npm install -g @usesotto/cli` — [package](https://www.npmjs.com/package/@usesotto/cli) |
| Source code            | <https://github.com/Blockchain-Oracle/sotto>                                            |

The hosted app is built against these endpoints (`NEXT_PUBLIC_API_ORIGIN`,
`NEXT_PUBLIC_DOCS_ORIGIN`). Local builds fall back to localhost services, so
nothing below requires the hosted stack. Deployment topology and the full
per-service environment matrix live in
[`docs/deploy/coolify.md`](docs/deploy/coolify.md).

## Install the CLI

The command is `sotto`; the agent-facing MCP server ships inside the same
package (`sotto mcp serve`).

```bash
npm install -g @usesotto/cli
sotto --help
sotto search                       # browse the verified catalog
sotto try https://<resource-url>   # inspect a resource and prepare a call
```

The CLI never holds a key. A purchase requests human wallet approval and prints
the wallet approval URL; ambiguous outcomes are reported for reconciliation,
never blindly retried.

## Quickstart (local)

Prerequisites: **Node 24.18.0** and **pnpm 11.12.0** (`corepack enable`). The
repo enforces the pinned toolchain.

```bash
pnpm install
pnpm build            # builds every workspace
pnpm verify           # the full deterministic gate (lint, typecheck, tests, Daml)
```

Run the surfaces:

```bash
pnpm --filter @sotto/site dev     # product site  → http://localhost:4101
pnpm --filter @sotto/app dev      # marketplace   → http://localhost:4102
pnpm --filter @sotto/docs dev     # documentation → http://localhost:4103
```

The backend (`@sotto/api`, `@sotto/signer`, `@sotto/worker`) needs a PostgreSQL
and, for live settlement, the Five North credential set — see
`docs/deploy/coolify.md`. Live DevNet execution is intentionally outside
`pnpm verify`.

## Repository layout

```
apps/
  site/       marketing site (Next.js) — usesotto.xyz
  app/        the product: marketplace, Composer, Scan, Add API — app.usesotto.xyz
  docs/       Fumadocs documentation + llms.txt — docs.usesotto.xyz
  api/        Fastify web-api composition root — api.usesotto.xyz
  signer/     Sotto Reference Wallet — isolated custody service — wallet.usesotto.xyz
  worker/     restartable prepare / execution / reconciliation / probe loops
packages/
  ui/               design system ("Sotto Voce" — tokens, marks, primitives)
  x402-canton/      x402 challenge, request binding, human-purchase pipeline
  canton-client/    real Five North transports + the reconciliation adapter
  database/         PostgreSQL persistence + migrations + sotto-migrate
  purchase-worker/  the durable prepare/execute/reconcile worker factories
  catalog-probe/    cert-pinned server-side x402 probe
  purchase-client/  typed REST+SSE client — the one purchasing core
  cli/              @usesotto/cli + buyer MCP server (thin over purchase-client)
daml/               the sotto-control DAR (Bootstrap, PurchaseCapability, PrivacyProbe)
spikes/             evidence-reproduction CLIs (never imported by apps/packages)
skills/sotto/       the Sotto agent skill (search / inspect / ask / purchase / reconcile / stop)
docs/               product contract, decisions, architecture, deploy notes
```

## Architecture

The purchase lifecycle is the spine, and every stage is a real, separately
persisted fact:

```
provider 402  →  prepare exact call  →  human wallet approval  →  Canton settle  →  paid retry  →  deliver
   (live)          (request binding)      (Reference Wallet)       (real update)    (200 or fail)   (or settled-undelivered)
```

- **`@sotto/api`** composes the catalog, probe, and purchase core into one
  web-api process; it re-fetches the live 402 before every purchase so
  browser-submitted price/recipient/network are never authority, and streams the
  journal to the app over SSE (every event is a committed row).
- **`@sotto/signer`** (the Sotto Reference Wallet) is the custody boundary: it
  holds per-owner Ed25519 keys, independently recomputes the Canton V2 prepared
  hash and the `sotto-http-request-v1` commitment, and signs **only** verified
  prepared purchases — never a generic transfer. Raw keys never leave it.
- **`@sotto/worker`** runs the prepare → approval → execute → reconcile loops
  against the real Five North transports in `@sotto/canton-client`.
- The **wallet session**, the **Sotto session**, and the **autonomous signer**
  are three distinct authorities, kept separate by design.

## Evidence

The Five North DevNet spike proved a real
`402 → wallet-sign → Canton settle → authentic 200` path. Selected accepted
updates (test Canton Coin, 0.25 CC per call, synchronizer
`global-domain::1220be58…471a`, package `sotto-control` `f72d7eb3…b963e`):

| What                                                         | Accepted update  |
| ------------------------------------------------------------ | ---------------- |
| Human-wallet purchase, delivered `200`                       | `1220a2a5…aca37` |
| External-agent bounded-capability purchase                   | `1220a389…811e3` |
| Settled-but-undelivered (recovered honestly, never replayed) | `1220bd60…6b21`  |

The external-agent settlement is independently visible on the public Lighthouse
explorer; the outsider ACS read found zero private contexts. Full identifiers
and provenance:
[`docs/architecture/devnet-spike-result.md`](docs/architecture/devnet-spike-result.md).
**No mocked payment or fixture transaction can satisfy those gates.**

## What we do not claim

- **Not production.** Production wallet custody, key rotation/recovery, a
  deployed connector service, and a reviewed release `GO` remain open.
- **Not mainnet.** Canton Five North DevNet only; every amount is test Canton
  Coin.
- **No ledger-enforced limits yet.** Local policy caps are labeled local policy;
  a bounded-authority claim ships only after live bypass-resistance proof.
- **Settlement is never delivery.** A settled payment whose delivery failed is
  shown as `settled-undelivered`, never as success.
- **No fabricated activity.** Metrics and Scan show honest zero until real
  events exist.

## Verification

```bash
pnpm verify           # toolchain, format, lint, build, typecheck, unit + real-Postgres
                      # integration, repo guards, secretlint, audit, Daml build + tests
```

## Repository provenance

Sotto has fresh history. The prior payroll product is archived separately at
<https://github.com/Blockchain-Oracle/sotto-payroll-archive> and is not an
implementation base for this repository.

## Credits and licenses

Sotto reuses and credits FTPtech's existing Canton x402 facilitator, payer, and
middleware work. Canton, Canton Coin, and the Canton Network mark are property
of Digital Asset (Switzerland) GmbH; see
[`packages/ui/ASSET-MANIFEST.md`](packages/ui/ASSET-MANIFEST.md) for mark usage
terms. Licensed under Apache-2.0.
