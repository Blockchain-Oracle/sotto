import { PreparedTransaction } from "@canton-network/core-ledger-proto";
import {
  recomputeWalletPreparedHashPrecheck,
  type CapabilityWalletConnector,
  type VerifiedCapabilityWalletSignature,
} from "@sotto/x402-canton";
import { buildBoundedCapabilityBootstrapPrepareRequest } from "@sotto/x402-canton/internal/bounded-capability-bootstrap-prepare";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { validPreparedCapabilityBootstrapFromPrepare } from "../../../packages/x402-canton/test/prepared-capability-bootstrap.fixtures.js";
import { bootstrapRequest } from "./capability-bootstrap-completion.fixtures.js";

const CONNECTOR_ID = "wallet-runner-reference";
const CONNECTOR_ORIGIN = "wallet://runner-reference";
const SUBMISSION_ID = "2b72142a-7343-4ad7-8db6-7dc74f514029";

function fingerprint(publicKey: Uint8Array): string {
  return `1220${createHash("sha256")
    .update(Buffer.from([0, 0, 0, 12]))
    .update(publicKey)
    .digest("hex")}`;
}

function journalFile(workspaceRoot: string, name: string): Promise<void> {
  return access(
    join(workspaceRoot, "tmp", "devnet-capability-bootstrap", name),
  );
}

export async function capabilityWalletRunnerFixture(
  workspaceRoot: string,
  events: string[],
  mode: "approved" | "rejected" | "wrong-hash" = "approved",
) {
  const request = bootstrapRequest();
  const prepareRequest = buildBoundedCapabilityBootstrapPrepareRequest(request);
  const preparedFixture =
    validPreparedCapabilityBootstrapFromPrepare(prepareRequest);
  const preparationTime =
    BigInt(Date.parse("2026-07-13T19:30:01.000Z")) * 1_000n;
  preparedFixture.metadata!.preparationTime = preparationTime;
  preparedFixture.metadata!.minLedgerEffectiveTime = preparationTime;
  const transaction = PreparedTransaction.toBinary(preparedFixture, {
    writeUnknownFields: false,
  });
  const digest = await recomputeWalletPreparedHashPrecheck(transaction);
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const rawPublicKey = Buffer.from(
    publicKey.export({ format: "jwk" }).x!,
    "base64url",
  );
  const signedBy = fingerprint(rawPublicKey);
  const signature = sign(null, digest, privateKey).toString("base64");
  const packageId =
    request.commands[0]!.CreateCommand.templateId.split(":")[0]!;
  const contractId = "00wallet-created-capability";
  const create = request.commands[0]!.CreateCommand;
  const active = {
    contractEntry: {
      JsActiveContract: {
        createdEvent: {
          contractId,
          createArgument: create.createArguments,
          observers: [create.createArguments.agent],
          packageName: "sotto-control",
          signatories: [request.actAs[0]],
          templateId: create.templateId,
        },
        synchronizerId: request.synchronizerId,
      },
    },
  };
  let activeReads = 0;
  const requestApproval = async () => {
    await journalFile(workspaceRoot, "10-prepared-verified.json");
    await journalFile(workspaceRoot, "11-approval-requested.json");
    events.push("approval");
    return mode === "rejected"
      ? { outcome: "rejected", reason: "user-rejected" }
      : {
          outcome: "approved",
          signature: {
            party: request.actAs[0],
            signature,
            signatureFormat: "SIGNATURE_FORMAT_CONCAT",
            signedBy,
            signingAlgorithm: "SIGNING_ALGORITHM_SPEC_ED25519",
          },
        };
  };
  const connector: CapabilityWalletConnector = {
    discover: async () => {
      events.push("discover");
      return {
        connectorId: CONNECTOR_ID,
        connectorKind: "wallet-sdk",
        explicitApproval: true,
        hashingSchemeVersions: ["HASHING_SCHEME_VERSION_V2"],
        networks: ["canton:devnet"],
        origin: CONNECTOR_ORIGIN,
        packageIds: [packageId],
        payerParty: request.actAs[0],
        preparedTransactionSigning: true,
        signatureFormats: ["SIGNATURE_FORMAT_CONCAT"],
        signingAlgorithms: ["SIGNING_ALGORITHM_SPEC_ED25519"],
        version: "sotto-capability-wallet-capabilities-v1",
      };
    },
    requestApproval,
  };
  return {
    contractId,
    input: {
      connector,
      connectorId: CONNECTOR_ID,
      connectorOrigin: CONNECTOR_ORIGIN,
      execute: async (
        verified: VerifiedCapabilityWalletSignature,
        persist: (value: {
          sessionId: `sha256:${string}`;
          submissionId: string;
          userId: string;
        }) => Promise<void>,
      ) => {
        await journalFile(workspaceRoot, "12-signature-received.json");
        await persist({
          sessionId: verified.sessionId,
          submissionId: SUBMISSION_ID,
          userId: request.userId,
        });
        await journalFile(workspaceRoot, "13-execution-started.json");
        events.push("execute");
        return {
          outcome: "submitted" as const,
          preparedTransactionHash:
            `sha256:${Buffer.from(digest).toString("hex")}` as const,
          sessionId: verified.sessionId,
          submissionId: SUBMISSION_ID,
          userId: request.userId,
        };
      },
      prepare: async () => {
        events.push("prepare");
        return new TextEncoder().encode(
          JSON.stringify({
            costEstimation: null,
            hashingDetails: null,
            hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
            preparedTransaction: Buffer.from(transaction).toString("base64"),
            preparedTransactionHash: Buffer.from(digest).toString("base64"),
          }),
        );
      },
      readActiveCapabilities: async () => {
        events.push(activeReads++ === 0 ? "active-preflight" : "active-final");
        return activeReads === 1 ? [] : [active];
      },
      readCompletion: async () => {
        events.push("completion");
        return {
          classification: "SUCCEEDED" as const,
          completionOffset: 52,
          updateId: `1220${"e".repeat(64)}`,
        };
      },
      readLedgerEndOffset: async () => {
        events.push("ledger-end");
        return 41;
      },
      recomputeOfficialHash: async () => {
        events.push("official-hash");
        return mode === "wrong-hash" ? new Uint8Array(32).fill(9) : digest;
      },
      request,
      resolveRegisteredPublicKey: async () => {
        events.push("resolve-key");
        await journalFile(workspaceRoot, "11-approval-requested.json");
        return {
          fingerprint: signedBy,
          publicKey: rawPublicKey.toString("base64"),
          publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW",
        };
      },
      signal: new AbortController().signal,
      sourceCommit: "a".repeat(40),
      timeoutMilliseconds: 1_000,
      workspaceRoot,
    },
    requestApproval,
  };
}
