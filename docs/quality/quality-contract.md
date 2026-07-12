# Quality Contract

## Toolchain

Resolve and pin current Node, pnpm, Java, DPM/Daml, TypeScript, framework, test,
database, and container versions from official documentation when each layer is
introduced. Do not inherit versions from payroll or reference repositories.

## Root Verification

Once the workspace exists, one root `pnpm verify` command must orchestrate every
deterministic non-browser, non-live gate:

- formatting, lint, strict typecheck, unit and contract/integration tests;
- every runnable/package build;
- Daml build and Daml Script tests;
- file-length, secret, license, vulnerability, product, claim, and contamination
  guards;
- router/context-manifest verification;
- `git diff --check`.

CI runs the same command from a frozen, cache-disabled clean clone and pins CI
actions by commit SHA.

## Test Boundary

- Unit mocks are allowed at external interfaces.
- Integration tests use disposable real services and explicit test fixtures.
- No fixture may enter runtime source or public metrics.
- DevNet success requires real parties, funds, contracts, settlement, provider
  response, update evidence, and visibility queries.

## Security

- Never expose raw Canton keys to models, browsers, logs, evidence, or Git.
- Separate provider credentials, application sessions, signer credentials, and
  operator credentials.
- Probe endpoints with SSRF, DNS/IP, redirect, timeout, content-type, and size
  defenses.
- Bind payments to canonical request data and deterministic idempotency.
- Keep production database/Redis private when those services are selected.
- Redact prompts, results, secrets, auth headers, raw payment payloads, and
  keys.

## Reliability

- Bound every network call and retry.
- Distinguish liveness, dependency readiness, and worker heartbeat.
- Reconcile unknown settlement before retry.
- Prove restart durability for attempts, jobs, and registration state.
- Establish latency and resource budgets from the real deployed environment.

## Browser And Accessibility

- Test accepted product journeys and every payment/delivery split state.
- Verify keyboard operation, focus, dialogs, labels, landmarks, and contrast.
- Assert no page-level overflow at 390, 768, 1280, and 1440 pixels.
- Use real product data or honest zero in judged/runtime routes.

## Containers And Release

- Build independently health-checkable non-root images after topology is
  decided.
- Verify graceful shutdown, migration/recovery, image vulnerability policy, and
  accidentally included secret/development files.
- Coolify release requires TLS, private services, backup/restore, restart
  persistence, health, smoke, and rollback evidence.
- Canton release separately requires the real Five North DAR/payment/privacy
  evidence defined by the spike plan.

## Source Policy

- Conventional commits and protected `main`.
- Target 200 hand-written source lines, warning above 200, hard cap 300.
- Generated bindings, migrations, lockfiles, snapshots, fixtures, and build
  output are excluded from the source-line cap.
- README and product copy describe only implemented, verified behavior.
- Third-party code requires license compatibility, attribution, and a source
  pin.
