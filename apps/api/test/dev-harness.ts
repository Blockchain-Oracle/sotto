/**
 * Local design-QA runner: boots the postgres-backed API harness (the same
 * composition the integration tests exercise) on a fixed port with CORS
 * for the app dev server, so screenshots capture REAL rows — a published
 * catalog listing, a real hosted-onboarding session, and journaled
 * purchase intents. Not part of pnpm verify; run manually:
 *
 *   SOTTO_TEST_DATABASE_URL=postgresql://user@127.0.0.1:5432/postgres \
 *   PUBLIC_APP_ORIGIN=http://localhost:4102 \
 *     pnpm --filter @sotto/api exec tsx test/dev-harness.ts
 */
import { startApiPostgresHarness } from "./api-postgres.fixture.js";

const harness = await startApiPostgresHarness("sotto_app_dev_harness", {
  publicAppOrigin: process.env.PUBLIC_APP_ORIGIN ?? "http://localhost:4102",
  port: 4400,
});
process.stdout.write(
  `dev harness listening on :4400 — listing ${harness.listingId}\n`,
);
const shutdown = () => {
  void harness.close().finally(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
