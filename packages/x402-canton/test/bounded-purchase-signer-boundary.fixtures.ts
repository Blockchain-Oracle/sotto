import { expect, vi } from "vitest";
import {
  buildBoundedPurchasePrepareRequest,
  signBoundedPurchase,
} from "../src/index.js";
import {
  preparedPurchaseBytes,
  type PreparedPurchaseFixture,
} from "./prepared-purchase.fixtures.js";
import { purchaseCommandInputs } from "./transfer-factory-observation.fixtures.js";

export const SIGNER_BOUNDARY_DIGEST = new Uint8Array(32).fill(7);

type BoundaryOptions = Readonly<{
  claimed?: boolean;
  mutate?: (prepared: PreparedPurchaseFixture) => void;
  officialDigest?: Uint8Array;
  participantDigest?: Uint8Array;
  prepareEffect?: () => void;
  claimEffect?: () => void;
}>;

function prepareResponse(
  transaction: Uint8Array,
  digest: Uint8Array,
): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      preparedTransaction: Buffer.from(transaction).toString("base64"),
      preparedTransactionHash: Buffer.from(digest).toString("base64"),
      hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
      hashingDetails: null,
      costEstimation: null,
    }),
  );
}

export async function signerBoundaryFixture(options: BoundaryOptions = {}) {
  const { intent, holdings, packageSelection, registry } =
    await purchaseCommandInputs();
  const request = buildBoundedPurchasePrepareRequest(
    intent,
    holdings,
    registry,
    packageSelection,
  );
  const events: string[] = [];
  const participantDigest = options.participantDigest ?? SIGNER_BOUNDARY_DIGEST;
  const dependencies = {
    readPreparedPurchase: vi.fn(async () => {
      events.push("prepare");
      options.prepareEffect?.();
      return prepareResponse(
        preparedPurchaseBytes(intent, request, options.mutate),
        participantDigest,
      );
    }),
    recomputeOfficialHash: vi.fn(async () => {
      events.push("hash");
      return new Uint8Array(options.officialDigest ?? SIGNER_BOUNDARY_DIGEST);
    }),
    claimAttempt: vi.fn(async (claim: unknown) => {
      void claim;
      events.push("claim");
      options.claimEffect?.();
      return options.claimed ?? true;
    }),
    signOpaque: vi.fn(async (input: unknown) => {
      void input;
      events.push("sign");
      return { signingReference: "signing:opaque-reference" };
    }),
  };
  return { dependencies, events, intent, request };
}

export async function expectZeroSigning(
  options: BoundaryOptions,
): Promise<void> {
  const { dependencies, request } = await signerBoundaryFixture(options);
  await expect(signBoundedPurchase(request, dependencies)).rejects.toThrow();
  expect(dependencies.signOpaque).not.toHaveBeenCalled();
}
