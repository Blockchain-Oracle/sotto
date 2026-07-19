# Five North DevNet Diagnostics

These scripts hit the REAL Five North DevNet using the credentials in the
ignored root `.env.local`. They exist to reproduce recorded evidence exactly as
it was captured; they never simulate payment, settlement, or visibility. They
are read-only against the ledger unless named otherwise below. No credentials
are embedded; party, contract, package, and update identifiers are recorded
evidence references, not secrets.

Run each script from the repository root after `pnpm build`:

```text
pnpm exec tsx scripts/diagnostics/<name>.ts
node scripts/diagnostics/read-only-five-north-preapproval-probe.mjs
```

## Adopted scripts

| Script                                       | Behavior                                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `check-provider-preapproval.ts`              | Read-only: reports whether the provider transfer preapproval exists.                              |
| `debug-human-recovery.ts`                    | Recovery: resumes a recorded human purchase operation, which may submit its already-signed state. |
| `diagnose-human-provider-settlement.ts`      | Read-only: replays provider-side settlement reconciliation for a recorded human purchase.         |
| `paid-provider-launch.ts`                    | Local server: serves the paid resource on localhost and verifies settlement proofs read-only.     |
| `probe-package-preference.ts`                | Read-only: probes preferred-package resolution for recorded party combinations.                   |
| `read-external-agent-purchase-events.ts`     | Read-only: dumps the event shapes of a recorded purchase transaction.                             |
| `read-external-agent-purchase-visibility.ts` | Read-only: compares purchase visibility across payer, agent, provider, and outsider parties.      |
| `read-only-five-north-preapproval-probe.mjs` | Read-only: probes validator, package, and preapproval endpoints without ledger writes.            |
| `reconcile-live-agent-purchase.ts`           | Read-only: reconciles a recorded live agent purchase journal against ledger completions.          |
| `recover-wallet-capability.ts`               | Recovery: reconciles the capability bootstrap journal; may resume a recorded in-flight operation. |
| `verify-external-agent-paid-delivery.ts`     | Replays a recorded settlement proof against the paid provider; submits no second payment.         |
| `verify-five-north-package.ts`               | Read-only: downloads a package by ID and checks its content hash.                                 |

## Not yet adopted

These remain in the untracked local `tmp/` directory because they do not pass
the repository typecheck gate; gates are not weakened to admit them.

| Script                                | Reason                                                                                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `live-bounded-purchase.ts`            | Drifted: imports `signExternalPartyTransactionHash`, which was replaced by `createExternalPartyBoundedPurchaseSigner`; broken at runtime. |
| `diagnose-human-featured-input.ts`    | Imports `@canton-network/core-ledger-proto` through a deep `node_modules` path whose `dist/esm` entry has no adjacent type declarations.  |
| `diagnose-human-prepared-metadata.ts` | Imports `@canton-network/core-ledger-proto` through a deep `node_modules` path whose `dist/esm` entry has no adjacent type declarations.  |
