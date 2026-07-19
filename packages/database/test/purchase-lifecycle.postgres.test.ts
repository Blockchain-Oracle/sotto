import { afterAll, beforeAll, expect, it } from "vitest";
import type { HumanPurchasePersistenceBinding } from "../src/index.js";
import {
  catalogHumanPurchaseIntent,
  humanPurchaseBinding,
  PURCHASE_SOURCE_COMMIT,
} from "./purchase-journal.fixtures.js";
import {
  createPurchaseTestRuntime,
  testPrivateDeliveryKeyring,
  testPrepareAuthorityKeyring,
} from "./purchase-postgres.fixtures.js";

let context: Awaited<ReturnType<typeof createPurchaseTestRuntime>>;

beforeAll(async () => {
  context = await createPurchaseTestRuntime("sotto_purchase_lifecycle_test");
});

afterAll(async () => context?.database.drop());

it("drains admitted initialization and rejects work after close begins", async () => {
  const intent = await catalogHumanPurchaseIntent();
  let releaseBinding!: (binding: HumanPurchasePersistenceBinding) => void;
  let resolverStarted!: () => void;
  const started = new Promise<void>((resolve) => (resolverStarted = resolve));
  const binding = new Promise<HumanPurchasePersistenceBinding>(
    (resolve) => (releaseBinding = resolve),
  );
  const purchase = context.runtime.createPurchaseRepository({
    databaseUrl: context.database.databaseUrl,
    privateDeliveryKeyring: testPrivateDeliveryKeyring(context.runtime),
    prepareAuthorityKeyring: testPrepareAuthorityKeyring(context.runtime),
    sourceCommit: PURCHASE_SOURCE_COMMIT,
    resolveHumanPurchaseBinding: async () => {
      resolverStarted();
      return binding;
    },
  });
  const initialization = purchase.initializeHumanPurchaseAttempt(intent);
  await started;
  const firstClose = purchase.close();
  const secondClose = purchase.close();

  await expect(purchase.initializeHumanPurchaseAttempt(intent)).rejects.toThrow(
    "purchase repository is closed",
  );
  expect(firstClose).toBe(secondClose);
  releaseBinding(humanPurchaseBinding);
  await expect(initialization).resolves.toMatchObject({ outcome: "created" });
  await expect(firstClose).resolves.toBeUndefined();
});
