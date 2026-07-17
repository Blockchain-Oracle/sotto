import { FIVE_NORTH_HOLDING_IMPLEMENTATION_PACKAGE_ID } from "@sotto/x402-canton";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HUMAN_PAYER,
  HUMAN_SYNCHRONIZER,
} from "../../../packages/x402-canton/test/human-payer-identity.fixtures.js";
import { createFiveNorthHumanPackageSelectionClaimer } from "../src/five-north-human-package-preference.js";
import {
  network,
  tokenResponse,
} from "./five-north-package-preference.fixtures.js";
import { prepareOnlyHumanInput } from "./prepare-only-human-purchase.fixtures.js";

const NOW = "2026-07-13T10:00:00.000Z";
const EXECUTE_BEFORE = "2026-07-13T10:10:00.000Z";
const CHALLENGE_ID = `sha256:${"a".repeat(64)}` as const;
const DSO = `DSO::1220${"d".repeat(64)}`;
const PROVIDER = `sotto-provider::1220${"e".repeat(64)}`;

function packageResponse(extra = false) {
  return {
    packageReferences: [
      {
        packageId: FIVE_NORTH_HOLDING_IMPLEMENTATION_PACKAGE_ID,
        packageName: "splice-amulet",
        packageVersion: "0.1.21",
      },
      ...(extra
        ? [
            {
              packageId:
                "4d614496ec9b30b22545fd350ecb9ec999164cfb0b5953f46dbbf937f8918f57",
              packageName: "sotto-control",
              packageVersion: "0.2.0",
            },
          ]
        : []),
    ],
    synchronizerId: HUMAN_SYNCHRONIZER,
  };
}

beforeEach(() => vi.useFakeTimers({ now: new Date(NOW) }));
afterEach(() => vi.useRealTimers());

describe("Five North human package preference", () => {
  it("claims one exact authenticated splice-amulet selection", async () => {
    let ledgerBody: unknown;
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === network.tokenUrl) {
        return tokenResponse("validator-devnet-m2m");
      }
      ledgerBody = JSON.parse(String(init?.body)) as unknown;
      return Response.json(packageResponse());
    });
    const walletPreflight = await (
      await prepareOnlyHumanInput([])
    ).createWalletPreflight(new AbortController().signal);
    const signal = new AbortController().signal;
    const claim = createFiveNorthHumanPackageSelectionClaimer(network, {
      fetcher,
      signal,
    });

    await expect(
      claim({
        adminParty: DSO,
        challengeId: CHALLENGE_ID,
        challengeObservedAt: NOW,
        executeBefore: EXECUTE_BEFORE,
        providerParty: PROVIDER,
        signal,
        walletPreflight,
      }),
    ).resolves.toMatchObject({
      packageIds: [FIVE_NORTH_HOLDING_IMPLEMENTATION_PACKAGE_ID],
      references: [
        {
          packageId: FIVE_NORTH_HOLDING_IMPLEMENTATION_PACKAGE_ID,
          packageName: "splice-amulet",
          packageVersion: "0.1.21",
        },
      ],
      synchronizerId: HUMAN_SYNCHRONIZER,
      vettingValidAt: EXECUTE_BEFORE,
    });
    expect(ledgerBody).toEqual({
      packageVettingRequirements: [
        {
          packageName: "splice-amulet",
          parties: [DSO, HUMAN_PAYER, PROVIDER].sort((left, right) =>
            Buffer.compare(Buffer.from(left), Buffer.from(right)),
          ),
        },
      ],
      synchronizerId: HUMAN_SYNCHRONIZER,
      vettingValidAt: EXECUTE_BEFORE,
    });
  });

  it("rejects an autonomous Sotto package in the human response", async () => {
    const fetcher = vi.fn(async (url: string) =>
      url === network.tokenUrl
        ? tokenResponse("validator-devnet-m2m")
        : Response.json(packageResponse(true)),
    );
    const walletPreflight = await (
      await prepareOnlyHumanInput([])
    ).createWalletPreflight(new AbortController().signal);
    const signal = new AbortController().signal;

    await expect(
      createFiveNorthHumanPackageSelectionClaimer(network, {
        fetcher,
        signal,
      })({
        adminParty: DSO,
        challengeId: CHALLENGE_ID,
        challengeObservedAt: NOW,
        executeBefore: EXECUTE_BEFORE,
        providerParty: PROVIDER,
        signal,
        walletPreflight,
      }),
    ).rejects.toThrow();
  });
});
