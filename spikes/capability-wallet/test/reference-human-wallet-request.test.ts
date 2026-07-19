import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HUMAN_PURCHASE_NOW } from "../../../packages/x402-canton/test/human-purchase-commitment.fixtures.js";
import {
  parseReferenceHumanWalletRequest,
  REFERENCE_HUMAN_WALLET_REQUEST_VERSION,
  serializeReferenceHumanWalletRequest,
} from "../src/reference-human-wallet-request.js";
import { validReferenceHumanWalletRequest } from "./reference-human-wallet.fixtures.js";

function clone<T>(value: T): T {
  return structuredClone(value);
}

type HostilePayload = {
  [key: string]: unknown;
  request: Record<string, unknown>;
  version: unknown;
};

type HostileMutation = (value: HostilePayload) => void;

function hostilePayload(value: unknown): HostilePayload {
  return value as HostilePayload;
}

function hostileRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

describe("reference human wallet request codec", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("snapshots one exact active human approval request", async () => {
    const request = await validReferenceHumanWalletRequest();
    const originalFirstByte = request.preparedTransaction[0]!;
    const serialized = serializeReferenceHumanWalletRequest(request);
    const mutableRequest = request as {
      preparedTransaction: Uint8Array;
    };
    mutableRequest.preparedTransaction[0]! ^= 0xff;
    const parsed = parseReferenceHumanWalletRequest(serialized);

    expect(serialized.version).toBe(REFERENCE_HUMAN_WALLET_REQUEST_VERSION);
    expect(Buffer.from(parsed.preparedTransaction, "base64")[0]).toBe(
      originalFirstByte,
    );
    expect(parsed).toMatchObject({
      version: "sotto-human-wallet-request-v1",
      approval: {
        action: "pay-for-api-call",
        transferContextHash: request.approval.transferContextHash,
        version: "sotto-human-purchase-approval-v2",
      },
      connectorKind: "wallet-sdk",
      hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
      preparedTransactionHash: parsed.approval.preparedTransactionHash,
    });
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.approval)).toBe(true);
    expect(Object.isFrozen(parsed.approval.signer)).toBe(true);
    expect(parsed.approval.transferContextHash).toBe(
      "sha256:3dcaef2d24057b5f397ee058cd22da8377a56b836e9e607bb15d88856d90ce38",
    );
  });

  const invalidCases: ReadonlyArray<readonly [string, HostileMutation]> = [
    [
      "capability envelope",
      (value) => (value.version = "sotto-reference-wallet-request-v1"),
    ],
    ["extra envelope field", (value) => (value.private = "secret")],
    [
      "capability request",
      (value) => (value.request.version = "sotto-capability-wallet-request-v1"),
    ],
    ["extra request field", (value) => (value.request.execute = true)],
    ["altered session", (value) => (value.request.sessionId = "sha256:bad")],
    [
      "altered approval",
      (value) => (hostileRecord(value.request.approval).action = "send"),
    ],
    [
      "future request",
      (value) => (value.request.createdAt = "2026-07-16T15:01:00.000Z"),
    ],
    [
      "expired request",
      (value) => (value.request.expiresAt = HUMAN_PURCHASE_NOW),
    ],
    [
      "noncanonical bytes",
      (value) =>
        (value.request.preparedTransaction = `${String(
          value.request.preparedTransaction,
        )}=`),
    ],
  ];

  it.each(invalidCases)("rejects a %s", async (_name, mutate) => {
    const serialized = hostilePayload(
      clone(
        serializeReferenceHumanWalletRequest(
          await validReferenceHumanWalletRequest(),
        ),
      ),
    );
    mutate(serialized);
    expect(() => parseReferenceHumanWalletRequest(serialized)).toThrow(
      /reference human wallet request/iu,
    );
  });

  it("rejects oversized prepared bytes", async () => {
    const serialized = clone(
      serializeReferenceHumanWalletRequest(
        await validReferenceHumanWalletRequest(),
      ),
    );
    const hostile = serialized as unknown as {
      request: { preparedTransaction: string };
    };
    hostile.request.preparedTransaction = Buffer.alloc(
      2 * 1024 * 1024 + 1,
    ).toString("base64");
    expect(() => parseReferenceHumanWalletRequest(serialized)).toThrow(
      /reference human wallet request/iu,
    );
  });
});
