import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseLocalPrepareBootstrap,
  selectLocalDisclosures,
} from "../src/local-prepare-fixture.js";

const source = {
  admin: "sotto-local-prepare-admin::1220participant",
  agent: "sotto-local-prepare-agent::1220participant",
  capabilityCid: "00capability",
  executeBefore: "2026-07-13T11:00:00.000000Z",
  expiresAt: "2026-07-13T12:00:00.000000Z",
  holdingCid: "00holding",
  mockHoldingCid: "00holding",
  mockTransferFactoryCid: "00factory",
  payer: "sotto-local-prepare-payer::1220participant",
  provider: "sotto-local-prepare-provider::1220participant",
  requestedAt: "2026-07-13T09:59:59.000000Z",
  transferFactoryCid: "00factory",
};

function contract(
  contractId: string,
  entity: string,
  packageId = "a".repeat(64),
) {
  return {
    contractEntry: {
      JsActiveContract: {
        createdEvent: {
          contractId,
          createdEventBlob: Buffer.alloc(32, 7).toString("base64"),
          templateId: `${packageId}:SottoControlTokenStandardMock:${entity}`,
        },
        synchronizerId: "synchronizer::1220local",
      },
    },
  };
}

describe("local prepare fixture disclosures", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-13T10:00:10.000Z") });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects a requested CID bound to the wrong mock template", () => {
    const bootstrap = parseLocalPrepareBootstrap(source);

    expect(() =>
      selectLocalDisclosures(
        [
          contract("00factory", "MockHolding"),
          contract("00holding", "MockHolding"),
        ],
        bootstrap,
      ),
    ).toThrow(/expected mock template/i);
  });

  it("rejects mock disclosures from different test packages", () => {
    const bootstrap = parseLocalPrepareBootstrap(source);

    expect(() =>
      selectLocalDisclosures(
        [
          contract("00factory", "MockTransferFactory", "a".repeat(64)),
          contract("00holding", "MockHolding", "b".repeat(64)),
        ],
        bootstrap,
      ),
    ).toThrow(/same test package/i);
  });
});
