import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HUMAN_PURCHASE_NOW } from "../../../packages/x402-canton/test/human-purchase-commitment.fixtures.js";
import {
  parseReferenceHumanWalletRequest,
  serializeReferenceHumanWalletRequest,
} from "../src/reference-human-wallet-request.js";
import { validReferenceHumanWalletRequest } from "./reference-human-wallet.fixtures.js";

type HostileRequest = {
  approval: {
    payerParty: string;
    resourcePath: string;
    signer: {
      publicKeyFormat: string;
      signatureFormat: string;
      signingAlgorithm: string;
    };
  };
  connectorId: string;
  connectorOrigin: string;
};

function assign<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K],
): void {
  target[key] = value;
}

async function hostilePayload(): Promise<{
  request: HostileRequest;
  version: string;
}> {
  return structuredClone(
    serializeReferenceHumanWalletRequest(
      await validReferenceHumanWalletRequest(),
    ),
  ) as unknown as { request: HostileRequest; version: string };
}

describe("reference human wallet request security", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it.each([
    [
      "arbitrary key format",
      (request: HostileRequest) =>
        assign(request.approval.signer, "publicKeyFormat", "anything"),
    ],
    [
      "arbitrary signature format",
      (request: HostileRequest) =>
        assign(request.approval.signer, "signatureFormat", "anything"),
    ],
    [
      "arbitrary signing algorithm",
      (request: HostileRequest) =>
        assign(request.approval.signer, "signingAlgorithm", "anything"),
    ],
    [
      "P-256 signer tuple",
      (request: HostileRequest) => {
        request.approval.signer.publicKeyFormat = "PUBLIC_KEY_FORMAT_DER_SPKI";
        request.approval.signer.signatureFormat = "SIGNATURE_FORMAT_DER";
        request.approval.signer.signingAlgorithm =
          "SIGNING_ALGORITHM_SPEC_EC_DSA_SHA_256";
      },
    ],
    [
      "unrelated payer fingerprint",
      (request: HostileRequest) =>
        assign(
          request.approval,
          "payerParty",
          `sotto-other::1220${"f".repeat(64)}`,
        ),
    ],
    [
      "other connector ID",
      (request: HostileRequest) =>
        assign(request, "connectorId", "openrpc-loop"),
    ],
    [
      "other connector origin",
      (request: HostileRequest) =>
        assign(
          request,
          "connectorOrigin",
          "https://other.example/path?query=1",
        ),
    ],
    [
      "relative resource path",
      (request: HostileRequest) =>
        assign(request.approval, "resourcePath", "pay"),
    ],
    [
      "network resource path",
      (request: HostileRequest) =>
        assign(request.approval, "resourcePath", "//other.example/pay"),
    ],
    [
      "resource path query",
      (request: HostileRequest) =>
        assign(request.approval, "resourcePath", "/pay?secret=1"),
    ],
    [
      "resource path fragment",
      (request: HostileRequest) =>
        assign(request.approval, "resourcePath", "/pay#secret"),
    ],
  ] as const)("rejects an %s", async (_name, mutate) => {
    const payload = await hostilePayload();
    mutate(payload.request);
    expect(() => parseReferenceHumanWalletRequest(payload)).toThrow(
      /reference human wallet request/iu,
    );
  });

  it("rejects a proxy before invoking any reflection trap", () => {
    let ownKeyReads = 0;
    const proxy = new Proxy(
      {},
      {
        ownKeys: () => {
          ownKeyReads += 1;
          return [];
        },
      },
    );

    expect(() => parseReferenceHumanWalletRequest(proxy)).toThrow(
      /reference human wallet request/iu,
    );
    expect(ownKeyReads).toBe(0);
  });
});
