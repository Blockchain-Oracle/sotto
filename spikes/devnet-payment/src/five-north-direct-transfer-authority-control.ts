import type {
  DirectTransferAuthorityControl,
  DirectTransferAuthorityPrepareRequest,
} from "@sotto/x402-canton";
import { FiveNorthRequestFailure } from "./five-north-response.js";
import { parseLocalPrepareResponse } from "./local-prepare-response.js";

type ReadPrepare = (
  request: DirectTransferAuthorityPrepareRequest,
) => Promise<Uint8Array>;

function withoutAuthority(
  request: DirectTransferAuthorityPrepareRequest,
): string {
  const candidate = structuredClone(request) as Record<string, unknown>;
  delete candidate.actAs;
  return JSON.stringify(candidate);
}

function requireExactPair(
  control: DirectTransferAuthorityControl,
): DirectTransferAuthorityControl {
  if (
    typeof control !== "object" ||
    control === null ||
    !Object.isFrozen(control) ||
    !Object.isFrozen(control.agentRequest) ||
    !Object.isFrozen(control.payerRequest) ||
    control.agentRequest.commandId !== control.payerRequest.commandId ||
    control.agentRequest.actAs.length !== 1 ||
    control.payerRequest.actAs.length !== 1 ||
    control.agentRequest.actAs[0] === control.payerRequest.actAs[0] ||
    withoutAuthority(control.agentRequest) !==
      withoutAuthority(control.payerRequest)
  ) {
    throw new Error("direct transfer authority control pair is invalid");
  }
  return control;
}

export async function runFiveNorthDirectTransferAuthorityControl(
  candidate: DirectTransferAuthorityControl,
  readPrepare: ReadPrepare,
) {
  const control = requireExactPair(candidate);
  if (typeof readPrepare !== "function") {
    throw new Error("direct transfer prepare reader is required");
  }
  let agentRejected = false;
  try {
    await readPrepare(control.agentRequest);
  } catch (error) {
    if (
      error instanceof FiveNorthRequestFailure &&
      error.status === 400 &&
      error.code === "MISSING_REQUIRED_AUTHORIZERS"
    ) {
      agentRejected = true;
    } else {
      throw new Error("direct transfer agent rejection is not authoritative", {
        cause: error,
      });
    }
  }
  if (!agentRejected) {
    throw new Error("direct transfer unexpectedly prepared for the agent");
  }
  const prepared = parseLocalPrepareResponse(
    await readPrepare(control.payerRequest),
  );
  prepared.participantHash.fill(0);
  prepared.preparedTransaction.fill(0);
  return Object.freeze({
    agent: "MISSING_PAYER_AUTHORITY" as const,
    commandId: control.agentRequest.commandId,
    executeCalls: 0 as const,
    payer: "PREPARED" as const,
  });
}
