# Deploying Sotto on Coolify

One git repo, one root [`nixpacks.toml`](../../nixpacks.toml), six Coolify
services + one PostgreSQL. Each service is the **same repo + branch**,
differentiated by the `APP_NAME` env var the shared `nixpacks.toml` reads.
Domain: **usesotto.xyz**. Source: the public repo
`https://github.com/Blockchain-Oracle/sotto` (Build Pack = Nixpacks).

Create each app once in the UI, then script deploys/env from the CLI (`coolify`,
official `coollabsio/coolify-cli`). For **every** service: **Build Pack =
Nixpacks**, **Base Directory = `/`**, **Branch = `main`**, and `APP_NAME` set in
the service environment. The listen port goes in **Ports Exposes**, and the
**Domain** is set as `https://<domain>:<port>` — the port suffix binds the FQDN
to the container port, e.g. `https://api.usesotto.xyz:4104`.

## Shared Five North env (api, signer, worker)

The three backend services each read the same Five North credential set when it
is present; absent, they run in a degraded "five-north-unavailable" mode and
report it honestly (no simulated settlement). Set the full set on api, signer,
and worker:

```
FIVE_NORTH_LEDGER_URL, FIVE_NORTH_VALIDATOR_URL,
FIVE_NORTH_OIDC_ISSUER_URL, FIVE_NORTH_OIDC_TOKEN_URL,
FIVE_NORTH_OIDC_CLIENT_ID, FIVE_NORTH_OIDC_CLIENT_SECRET,
FIVE_NORTH_OIDC_AUDIENCE, FIVE_NORTH_OIDC_SCOPE,
FIVE_NORTH_SYNCHRONIZER_ID
```

These come from the local `.env.local` (never commit them). The api also needs
`FIVE_NORTH_DSO_ADMIN_PARTY` and `FIVE_NORTH_TRANSFER_FACTORY_CONTRACT_ID` for
live purchase initiation.

`PREPARE_AUTHORITY_KEY` and `DELIVERY_KEY` are the AEAD keyring inputs shared by
**api and worker** (they encrypt prepare-authority and delivery material at
rest). Generate each as 32 random bytes hex: `openssl rand -hex 32`. Set the
**same** value on api and worker. `SIGNER_SERVICE_TOKEN` is shared by all three
(the bearer secret the worker/api present to the signer);
`openssl rand -hex 32`.

## Per-service settings

### 1. Site — `usesotto.xyz`

- `APP_NAME` = `@sotto/site` (also the default)
- Port: **4101**
- Build-time env (baked into the static bundle — set before build):
  - `NEXT_PUBLIC_API_ORIGIN=https://api.usesotto.xyz`
  - `NEXT_PUBLIC_DOCS_ORIGIN=https://docs.usesotto.xyz`

### 2. App — `app.usesotto.xyz`

- `APP_NAME=@sotto/app`
- Port: **4102**
- Build-time env (baked in):
  - `NEXT_PUBLIC_API_ORIGIN=https://api.usesotto.xyz`

### 3. Docs — `docs.usesotto.xyz`

- `APP_NAME=@sotto/docs`
- Port: **4103**
- No env needed.

### 4. API — `api.usesotto.xyz`

- `APP_NAME=@sotto/api`
- Port: **4104** (set `API_PORT=4104`)
- Runtime env:
  - `DATABASE_URL` — attach the Coolify Postgres (below).
  - `SESSION_SECRET` — `openssl rand -hex 32`.
  - `SIGNER_SERVICE_URL=https://wallet.usesotto.xyz`, `SIGNER_SERVICE_TOKEN`
    (shared, above).
  - `PUBLIC_APP_ORIGIN=https://app.usesotto.xyz` (CORS allowlist).
  - `PREPARE_AUTHORITY_KEY`, `DELIVERY_KEY` (shared with worker).
  - `OPS_TOKEN` — `openssl rand -hex 32` (operator queue).
  - `CANTON_EXPLORER_BASE_URL` — the Lighthouse public explorer base.
  - `SOURCE_COMMIT` — the deployed commit sha (any stable string).
  - Optional Composer assist: `OPENROUTER_API_KEY`, `COMPOSE_MODEL` (default
    `anthropic/claude-sonnet-4.5`). Absent → compose-assist returns a 503
    instead of guessing.
  - Five North set + `FIVE_NORTH_DSO_ADMIN_PARTY`,
    `FIVE_NORTH_TRANSFER_FACTORY_CONTRACT_ID`.
- Health: `GET /healthz`.

### 5. Signer (Sotto Reference Wallet) — `wallet.usesotto.xyz`

- `APP_NAME=@sotto/signer`
- Port: **4105** (set `SIGNER_PORT=4105`)
- **`SIGNER_HOST=0.0.0.0`** — the signer binds loopback by default (the local
  custody posture); behind Coolify's proxy it must bind all interfaces or the
  proxy and the worker cannot reach it.
- **Persistent storage (required):** the per-judge Ed25519 keys live under
  `SIGNER_KEY_DIR` and must survive redeploys. Add a Coolify persistent volume
  mounted at **`/data`** and set `SIGNER_KEY_DIR=/data/signer-keys` — a
  _subdirectory_ the signer creates itself at mode 0700 (mount points are often
  0755, which the owner-only check rejects, so never point `SIGNER_KEY_DIR` at
  the mount root).
- Runtime env:
  - `SIGNER_SERVICE_TOKEN` (shared, above).
  - `WALLET_SESSION_SECRET` — `openssl rand -hex 32` (distinct from the api's
    `SESSION_SECRET`; the wallet session is a separate authority).
  - `PUBLIC_WALLET_ORIGIN=https://wallet.usesotto.xyz`.
  - Five North set (the tap/onboarding routes 503 without it).

### 6. Worker (background) — no ingress

- `APP_NAME=@sotto/worker`
- No domain, no Ports Exposes (it opens no socket).
- Runtime env:
  - `DATABASE_URL` (same Postgres as the api).
  - `WORKER_LEASE_OWNER` — a stable identifier for this worker instance.
  - `PREPARE_AUTHORITY_KEY`, `DELIVERY_KEY` (shared with api).
  - `SIGNER_SERVICE_URL=https://wallet.usesotto.xyz`, `SIGNER_SERVICE_TOKEN`.
  - `SOURCE_COMMIT`.
  - `HUMAN_WALLET_PUBLIC_KEYS` — the registered payer public-key material
    (public keys only; the worker re-fingerprints downstream).
  - Five North set.

### PostgreSQL

Add a Coolify **PostgreSQL** resource in the Sotto project. Copy its internal
connection string into `DATABASE_URL` on api and worker.

## Migrations (run before the first api/worker rollout)

The schema is applied by an explicit job, never at app boot. The
`@sotto/database` package ships a `sotto-migrate` bin. Run it once against the
Postgres before deploying api/worker, and again after any migration-adding
release — e.g. as a Coolify **one-off command** on the api service, or locally:

```bash
DATABASE_URL=postgres://…  pnpm --filter @sotto/database exec sotto-migrate
```

It is idempotent (already-applied migrations are skipped).

## DNS

Point these A records at the Coolify server IP **86.48.5.116** (Coolify's proxy
issues TLS via Let's Encrypt once each FQDN is set):

```
usesotto.xyz          → 86.48.5.116
app.usesotto.xyz      → 86.48.5.116
docs.usesotto.xyz     → 86.48.5.116
api.usesotto.xyz      → 86.48.5.116
wallet.usesotto.xyz   → 86.48.5.116
```

On Cloudflare set these records to **DNS-only (grey cloud)** so Coolify can
issue certificates. (`worker` has no DNS — it is a background service.)

## Build-order caveat

The Next apps (site, app) bake `NEXT_PUBLIC_*` at **build** time. If a service
URL changes, **redeploy** the client that references it — a runtime env change
alone does not take effect. Deploy order: Postgres → migrate → api → signer →
worker → app → site → docs.

## Scripted deploys

Once each app exists, deploy from the CLI (a Deploy-permission token):

```bash
coolify deploy uuid <uuid>                 # one service
coolify deploy batch <uuid>,<uuid> --force # several
```

Copy each service UUID from `coolify app list` or the app's Coolify URL.
