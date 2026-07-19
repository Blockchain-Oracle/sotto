import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspectHumanPreparedPurchaseStructure } from "../src/human-prepared-purchase-validation.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  humanPreparedPurchaseBytes,
  humanPreparedPurchaseCommandInputs,
} from "./human-prepared-purchase.fixtures.js";
import {
  addHistoricalTokenTtl,
  optional,
  removeTokenTtl,
  replaceTokenTtl,
  selectedSourceRequest,
  validRelativeTime,
} from "./human-prepared-purchase-config-upgrade.fixtures.js";
import { fixtureScalar } from "./prepared-purchase-value.fixtures.js";

describe("human prepared external config upgrades", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("accepts the historical four-field TransferConfigV2", async () => {
    const { intent, request } = await humanPreparedPurchaseCommandInputs();
    const bytes = humanPreparedPurchaseBytes(intent, request);

    expect(() =>
      inspectHumanPreparedPurchaseStructure(bytes, intent, request),
    ).not.toThrow();
  });

  it("rejects an unexpected fifth field for the historical source", async () => {
    const { intent, request } = await humanPreparedPurchaseCommandInputs();
    const bytes = humanPreparedPurchaseBytes(
      intent,
      request,
      addHistoricalTokenTtl,
    );

    expect(() =>
      inspectHumanPreparedPurchaseStructure(bytes, intent, request),
    ).toThrow(/external transfer config.*fields/iu);
  });

  it("accepts the selected-source five-field TransferConfigV2", async () => {
    const { intent, request } = await humanPreparedPurchaseCommandInputs();
    const selectedRequest = selectedSourceRequest(
      request,
      intent.packageSelection.packageIds[0],
    );
    const bytes = humanPreparedPurchaseBytes(intent, selectedRequest);

    expect(() =>
      inspectHumanPreparedPurchaseStructure(bytes, intent, selectedRequest),
    ).not.toThrow();
  });

  it("accepts a selected-source token TTL with exact RelTime semantics", async () => {
    const { intent, request } = await humanPreparedPurchaseCommandInputs();
    const selectedRequest = selectedSourceRequest(
      request,
      intent.packageSelection.packageIds[0],
    );
    const bytes = humanPreparedPurchaseBytes(
      intent,
      selectedRequest,
      (prepared) => replaceTokenTtl(prepared, validRelativeTime()),
    );

    expect(() =>
      inspectHumanPreparedPurchaseStructure(bytes, intent, selectedRequest),
    ).not.toThrow();
  });

  it("accepts a selected-source upgraded historical config", async () => {
    const { intent, request } = await humanPreparedPurchaseCommandInputs();
    const selectedRequest = selectedSourceRequest(
      request,
      intent.packageSelection.packageIds[0],
    );
    const bytes = humanPreparedPurchaseBytes(
      intent,
      selectedRequest,
      removeTokenTtl,
    );

    expect(() =>
      inspectHumanPreparedPurchaseStructure(bytes, intent, selectedRequest),
    ).not.toThrow();
  });

  it("rejects an unapproved config source package", async () => {
    const { intent, request } = await humanPreparedPurchaseCommandInputs();
    const unapprovedRequest = selectedSourceRequest(request, "f".repeat(64));
    const bytes = humanPreparedPurchaseBytes(intent, unapprovedRequest);

    expect(() =>
      inspectHumanPreparedPurchaseStructure(bytes, intent, unapprovedRequest),
    ).toThrow(/external config.*source package/iu);
  });

  it("rejects a selected-source token TTL with a malformed Some value", async () => {
    const { intent, request } = await humanPreparedPurchaseCommandInputs();
    const selectedRequest = selectedSourceRequest(
      request,
      intent.packageSelection.packageIds[0],
    );
    const bytes = humanPreparedPurchaseBytes(
      intent,
      selectedRequest,
      (prepared) =>
        replaceTokenTtl(
          prepared,
          optional(fixtureScalar("text", "not-relative-time")),
        ),
    );

    expect(() =>
      inspectHumanPreparedPurchaseStructure(bytes, intent, selectedRequest),
    ).toThrow(/token TTL|relative time/iu);
  });
});
