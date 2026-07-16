import {
  SDK,
  getPublicKeyFromPrivate,
  signTransactionHash,
} from "@canton-network/wallet-sdk";
import { createWalletHandoffStorage } from "./wallet-handoff-storage.js";
import { withReferenceWalletPrivateKey } from "./reference-wallet-key.js";
import { verifyReferenceWalletPreparedApproval } from "./reference-wallet-prepared.js";
import {
  requireReferenceWalletPolicy,
  requireReferenceWalletSigningKey,
} from "./reference-wallet-policy.js";
import { claimReferenceWalletPolicyAuthorization } from "./reference-wallet-policy-authorization.js";
import {
  parseReferenceWalletRequest,
  parseReferenceWalletResponse,
  referenceWalletResponsePayload,
  serializeReferenceWalletRequest,
} from "./reference-wallet-request.js";
import type {
  ReferenceWalletApprovalResponse,
  ReferenceWalletConnector,
  ReferenceWalletConnectorInput,
  ReferenceWalletRunInput,
} from "./reference-wallet-types.js";

function requireActive(signal: AbortSignal): void {
  if (signal.aborted)
    throw new Error("reference wallet exchange was cancelled");
}

function walletSignal(signal: AbortSignal | undefined): AbortSignal {
  return signal ?? new AbortController().signal;
}

function requireWalletRequestActive(
  signal: AbortSignal,
  expiresAt: string,
): void {
  requireActive(signal);
  if (Date.now() >= Date.parse(expiresAt)) {
    throw new Error("reference wallet approval is no longer active");
  }
}

function handoffIdentifier(sessionId: string): string {
  const value = sessionId.startsWith("sha256:") ? sessionId.slice(7) : "";
  if (!/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error("reference wallet session ID is invalid");
  }
  return value;
}

function snapshotCapabilities(
  value: ReferenceWalletConnectorInput["capabilities"],
) {
  if (value.connectorKind !== "wallet-sdk") {
    throw new Error("reference wallet connector kind must be wallet-sdk");
  }
  return Object.freeze({
    ...value,
    connectorKind: "wallet-sdk" as const,
    hashingSchemeVersions: Object.freeze([...value.hashingSchemeVersions]),
    networks: Object.freeze([...value.networks]),
    packageIds: Object.freeze([...value.packageIds]),
    signatureFormats: Object.freeze([...value.signatureFormats]),
    signingAlgorithms: Object.freeze([...value.signingAlgorithms]),
  });
}

export function createReferenceWalletConnector(
  input: ReferenceWalletConnectorInput,
): ReferenceWalletConnector {
  const capabilities = snapshotCapabilities(input.capabilities);
  const exchange = input.exchange;
  const storage = input.storage;
  return Object.freeze({
    discover: async ({ signal }) => {
      requireActive(signal);
      return capabilities;
    },
    requestApproval: async (request, { signal }) => {
      requireActive(signal);
      const id = handoffIdentifier(request.sessionId);
      await storage.create({
        expiresAt: request.expiresAt,
        id,
        kind: "request",
        payload: serializeReferenceWalletRequest(request),
      });
      requireActive(signal);
      await exchange(id, Object.freeze({ signal }));
      requireActive(signal);
      const response = await storage.read(id, "response");
      return parseReferenceWalletResponse(response.payload, request.sessionId);
    },
  });
}

export async function runReferenceWalletApproval(
  input: ReferenceWalletRunInput,
): Promise<ReferenceWalletApprovalResponse> {
  const signal = walletSignal(input.signal);
  requireActive(signal);
  const storage = await createWalletHandoffStorage({
    rootDirectory: input.rootDirectory,
  });
  requireActive(signal);
  const artifact = await storage.claim(input.handoffId, "request");
  requireActive(signal);
  const request = parseReferenceWalletRequest(artifact.payload);
  requireWalletRequestActive(signal, request.expiresAt);
  const sdk = SDK.createOffline();
  const computed = await sdk.utils.hash.preparedTransaction(
    request.preparedTransaction,
  );
  requireWalletRequestActive(signal, request.expiresAt);
  if (computed.toHex() !== request.preparedTransactionHash.slice(7)) {
    throw new Error("reference wallet prepared transaction hash mismatch");
  }
  verifyReferenceWalletPreparedApproval(request);
  const requestedPolicy = requireReferenceWalletPolicy(
    request,
    input.walletPolicy,
  );
  await input.presentSummary(JSON.stringify(request.approval, null, 2));
  requireWalletRequestActive(signal, request.expiresAt);
  let response: ReferenceWalletApprovalResponse;
  if (!input.approved) {
    response = Object.freeze({
      outcome: "rejected" as const,
      reason: "user-rejected" as const,
    });
  } else {
    const policy =
      input.authorization.mode === "policy"
        ? await claimReferenceWalletPolicyAuthorization(
            input.authorization.policyFile,
            request,
          )
        : requestedPolicy;
    response = await withReferenceWalletPrivateKey(
      input.keyFile,
      async (key) => {
        requireWalletRequestActive(signal, request.expiresAt);
        const privateKey = key.toString("base64");
        const publicKey = getPublicKeyFromPrivate(privateKey);
        const signedBy = await sdk.keys.fingerprint(publicKey);
        requireWalletRequestActive(signal, request.expiresAt);
        requireReferenceWalletSigningKey(signedBy, policy);
        const digest = Buffer.from(
          request.preparedTransactionHash.slice(7),
          "hex",
        ).toString("base64");
        return Object.freeze({
          outcome: "approved" as const,
          signature: Object.freeze({
            party: request.approval.payerParty,
            signature: signTransactionHash(digest, privateKey),
            signatureFormat: "SIGNATURE_FORMAT_CONCAT" as const,
            signedBy,
            signingAlgorithm: "SIGNING_ALGORITHM_SPEC_ED25519" as const,
          }),
        });
      },
    );
  }
  requireWalletRequestActive(signal, request.expiresAt);
  await storage.create({
    expiresAt: request.expiresAt,
    id: input.handoffId,
    kind: "response",
    payload: referenceWalletResponsePayload(request.sessionId, response),
  });
  requireWalletRequestActive(signal, request.expiresAt);
  return response;
}
