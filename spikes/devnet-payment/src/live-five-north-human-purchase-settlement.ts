import { createHash } from "node:crypto";
import type { HumanSettlementExpectation } from "@sotto/x402-canton";
import {
  parseFiveNorthJson,
  readFiveNorthResponse,
} from "./five-north-response.js";
import type { HumanPurchaseSettlementProof } from "./human-purchase-provider-reconciliation.js";
import type { SettlementProof } from "./provider.js";

const MAXIMUM_DELIVERY_BYTES = 2_000_000;

function exactObject(value: unknown, keys: readonly string[]) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...keys].sort())
  );
}

export function humanPurchaseSettlementProof(
  expectation: HumanSettlementExpectation,
  updateId: string,
): HumanPurchaseSettlementProof {
  return Object.freeze({
    attemptId: expectation.attemptId,
    challengeId: expectation.challengeId,
    requestCommitment: expectation.requestCommitment,
    purchaseCommitment: expectation.purchaseCommitment,
    updateId,
  });
}

export function paidHumanPurchaseProof(
  proof: HumanPurchaseSettlementProof,
): SettlementProof {
  return Object.freeze({
    attemptId: proof.attemptId,
    requestCommitment: proof.requestCommitment,
    updateId: proof.updateId,
  });
}

export function createDeferredHumanSettlementVerifier(input: {
  readTransaction: (updateId: string) => Promise<unknown>;
  reconcile: (
    transaction: unknown,
    proof: HumanPurchaseSettlementProof,
    expectation: HumanSettlementExpectation,
  ) => boolean;
}) {
  let authority:
    | Readonly<{
        expectation: HumanSettlementExpectation;
        proof: HumanPurchaseSettlementProof;
      }>
    | undefined;
  return Object.freeze({
    enable: (
      expectation: HumanSettlementExpectation,
      proof: HumanPurchaseSettlementProof,
    ) => {
      if (authority !== undefined) {
        throw new Error("human settlement verifier is already enabled");
      }
      authority = Object.freeze({ expectation, proof });
    },
    verify: async (candidate: SettlementProof): Promise<boolean> => {
      const current = authority;
      if (
        current === undefined ||
        JSON.stringify(candidate) !==
          JSON.stringify(paidHumanPurchaseProof(current.proof))
      ) {
        return false;
      }
      try {
        return input.reconcile(
          await input.readTransaction(candidate.updateId),
          current.proof,
          current.expectation,
        );
      } catch {
        return false;
      }
    },
  });
}

export async function readExactHumanPaidDelivery(
  response: Response,
  proof: SettlementProof,
) {
  if (response.status !== 200) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("live human paid delivery requires HTTP 200");
  }
  const mediaType = (response.headers.get("content-type") ?? "")
    .split(";", 1)[0]!
    .trim()
    .toLowerCase();
  if (mediaType !== "application/json") {
    await response.body?.cancel().catch(() => undefined);
    throw new Error("live human paid delivery content-type is not JSON");
  }
  const bytes = await readFiveNorthResponse(response, MAXIMUM_DELIVERY_BYTES);
  const body = parseFiveNorthJson(bytes, "live human paid delivery");
  const record = body as Record<string, unknown>;
  const result = record?.result as Record<string, unknown>;
  const settlement = record?.settlement as Record<string, unknown>;
  if (
    !exactObject(record, ["paid", "result", "settlement"]) ||
    record.paid !== true ||
    !exactObject(result, ["condition", "temperatureCelsius"]) ||
    result.condition !== "clear" ||
    result.temperatureCelsius !== 24 ||
    !exactObject(settlement, ["attemptId", "updateId"]) ||
    settlement.attemptId !== proof.attemptId ||
    settlement.updateId !== proof.updateId
  ) {
    throw new Error("live human paid delivery body does not match");
  }
  return Object.freeze({
    bodyByteCount: bytes.byteLength,
    bodySha256:
      `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const,
    status: 200 as const,
  });
}
