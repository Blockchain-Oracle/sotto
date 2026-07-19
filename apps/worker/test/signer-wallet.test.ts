import { describe, expect, it, vi } from "vitest";
import type { HumanWalletApprovalRequest } from "@sotto/x402-canton";
import type {
  SignerApprovalRequest,
  SignerApprovalState,
  SignerClient,
} from "../src/signer-client.js";
import { createSignerHumanWalletConnector } from "../src/signer-wallet.js";
import type { HumanPrepareAuthorityRestoreScope } from "@sotto/x402-canton/internal/human-prepare-authority-persistence";

const FINGERPRINT = `1220${"a".repeat(64)}` as const;
const PAYER = `sotto-external-payer::${FINGERPRINT}`;
const NOW = Date.parse("2026-07-19T10:00:00.000Z");

const scope = {
  connector: {
    connectorId: "sotto-signer-service",
    connectorKind: "wallet-sdk",
    expectedPackageId: "c".repeat(64),
    origin: "wallet://sotto-signer",
  },
  payerIdentity: {
    keyPurpose: "SIGNING",
    network: "canton:devnet",
    party: PAYER,
    publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW",
    publicKeyFingerprint: FINGERPRINT,
    signatureFormat: "SIGNATURE_FORMAT_CONCAT",
    signingAlgorithm: "SIGNING_ALGORITHM_SPEC_ED25519",
    synchronizerId: `global-domain::1220${"b".repeat(64)}`,
    topologyHash: `1220${"d".repeat(64)}`,
  },
} as unknown as HumanPrepareAuthorityRestoreScope;

// Transport-contract test double: an injected in-memory signer transport,
// never a simulated payment or settlement.
function fakeSigner(states: ReadonlyArray<SignerApprovalState>) {
  const created: SignerApprovalRequest[] = [];
  let reads = 0;
  const signer: SignerClient = {
    createApproval: async (request) => {
      created.push(request);
      return { approvalId: "approval-1", approvalUrl: "https://signer/a/1" };
    },
    readApproval: async () => {
      const state = states[Math.min(reads, states.length - 1)]!;
      reads += 1;
      return state;
    },
  };
  return { created, signer, reads: () => reads };
}

function approvalRequest(): HumanWalletApprovalRequest {
  return {
    version: "sotto-human-wallet-request-v1",
    approval: {
      attemptId: `sha256:${"e".repeat(64)}`,
      executeBefore: "2026-07-19T10:10:00.000Z",
      payerParty: PAYER,
      requestCommitment: `sha256:${"f".repeat(64)}`,
      signer: {
        publicKeyFingerprint: FINGERPRINT,
        publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW",
        signatureFormat: "SIGNATURE_FORMAT_CONCAT",
        signingAlgorithm: "SIGNING_ALGORITHM_SPEC_ED25519",
      },
    },
    connectorId: "sotto-signer-service",
    connectorKind: "wallet-sdk",
    connectorOrigin: "wallet://sotto-signer",
    createdAt: "2026-07-19T10:00:00.000Z",
    expiresAt: "2026-07-19T10:09:00.000Z",
    hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
    preparedTransaction: Buffer.alloc(24, 9),
    preparedTransactionHash: `sha256:${"1".repeat(64)}`,
    sessionId: `sha256:${"2".repeat(64)}`,
  } as unknown as HumanWalletApprovalRequest;
}

describe("signer-service human wallet connector", () => {
  it("hands off one approval and maps approved signatures", async () => {
    const { created, signer } = fakeSigner([
      {
        state: "approved",
        decidedAt: "2026-07-19T10:00:03.000Z",
        signature: {
          format: "SIGNATURE_FORMAT_CONCAT",
          signedBy: FINGERPRINT,
          signatureBase64: Buffer.alloc(64, 4).toString("base64"),
        },
      },
    ]);
    const connector = createSignerHumanWalletConnector({
      signer,
      scope,
      now: () => NOW,
    });
    const request = approvalRequest();
    const response = (await connector.requestApproval(request, {
      signal: new AbortController().signal,
    })) as Record<string, unknown>;
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      operationId: request.approval.attemptId,
      walletId: PAYER,
      approvalSummary: request.approval,
      preparedTransactionHash: request.preparedTransactionHash,
      requestCommitment: request.approval.requestCommitment,
    });
    // Deadline is executeBefore minus the human signing reserve (120s),
    // bounded by the session expiry.
    expect(created[0]!.expiresAt).toBe("2026-07-19T10:08:00.000Z");
    expect(response).toEqual({
      version: "sotto-human-wallet-response-v1",
      outcome: "approved",
      preparedTransactionHash: request.preparedTransactionHash,
      sessionId: request.sessionId,
      signature: {
        party: PAYER,
        signature: Buffer.alloc(64, 4).toString("base64"),
        signatureFormat: "SIGNATURE_FORMAT_CONCAT",
        signedBy: FINGERPRINT,
        signingAlgorithm: "SIGNING_ALGORITHM_SPEC_ED25519",
      },
    });
  });

  it("returns the canonical user rejection", async () => {
    const { signer } = fakeSigner([{ state: "rejected" }]);
    const connector = createSignerHumanWalletConnector({
      signer,
      scope,
      now: () => NOW,
    });
    const request = approvalRequest();
    await expect(
      connector.requestApproval(request, {
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      version: "sotto-human-wallet-response-v1",
      outcome: "rejected",
      reason: "user-rejected",
      sessionId: request.sessionId,
    });
  });

  it("polls pending decisions and stops at the reserve deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      const { signer, reads } = fakeSigner([{ state: "pending" }]);
      const connector = createSignerHumanWalletConnector({ signer, scope });
      const run = connector.requestApproval(approvalRequest(), {
        signal: new AbortController().signal,
      });
      const failure = expect(run).rejects.toThrowError(
        "signer wallet approval reserve is exhausted",
      );
      await vi.advanceTimersByTimeAsync(8 * 60 * 1_000);
      await failure;
      expect(reads()).toBeGreaterThan(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails when a signature was already collected or expired", async () => {
    const collected = fakeSigner([
      { state: "approved", decidedAt: "2026-07-19T10:00:03.000Z" },
    ]);
    const connector = createSignerHumanWalletConnector({
      signer: collected.signer,
      scope,
      now: () => NOW,
    });
    await expect(
      connector.requestApproval(approvalRequest(), {
        signal: new AbortController().signal,
      }),
    ).rejects.toThrowError("signer wallet signature was already collected");
    const expired = fakeSigner([{ state: "expired" }]);
    const expiredConnector = createSignerHumanWalletConnector({
      signer: expired.signer,
      scope,
      now: () => NOW,
    });
    await expect(
      expiredConnector.requestApproval(approvalRequest(), {
        signal: new AbortController().signal,
      }),
    ).rejects.toThrowError("signer wallet approval expired");
  });

  it("refuses handoffs that lack the signing reserve", async () => {
    const { created, signer } = fakeSigner([{ state: "pending" }]);
    const connector = createSignerHumanWalletConnector({
      signer,
      scope,
      now: () => Date.parse("2026-07-19T10:09:30.000Z"),
    });
    await expect(
      connector.requestApproval(approvalRequest(), {
        signal: new AbortController().signal,
      }),
    ).rejects.toThrowError("signer wallet approval lacks the signing reserve");
    expect(created).toHaveLength(0);
  });
});
