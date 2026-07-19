import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_PREPARED_TRANSACTION_BYTES } from "@sotto/x402-canton";
import { HUMAN_PURCHASE_NOW } from "../../../packages/x402-canton/test/human-purchase-commitment.fixtures.js";
import type { SpikeConfig } from "../src/config.js";
import { verifiedHumanExecuteSession } from "./five-north-human-wallet-execute-transport.fixtures.js";

const EXECUTE_PATH = "/v2/interactive-submission/execute";
const USER_ID = "human-ledger-user-7";
const network: SpikeConfig["network"] = {
  audience: "validator-devnet-m2m",
  clientId: "validator-devnet-m2m",
  clientSecret: "test-secret",
  issuerUrl:
    "https://auth.sandbox.fivenorth.io/application/o/validator-devnet-m2m",
  ledgerUrl: "https://ledger-api.validator.devnet.sandbox.fivenorth.io",
  scope: "daml_ledger_api",
  tokenUrl: "https://auth.sandbox.fivenorth.io/application/o/token/",
  validatorUrl:
    "https://wallet.validator.devnet.sandbox.fivenorth.io/api/validator",
};

async function moduleUnderTest() {
  try {
    return await import("../src/five-north-human-wallet-execute-transport.js");
  } catch (cause) {
    throw new Error("HUMAN_WALLET_EXECUTE_TRANSPORT_NOT_IMPLEMENTED", {
      cause,
    });
  }
}

function tokenResponse(): Response {
  const payload = Buffer.from(JSON.stringify({ sub: USER_ID })).toString(
    "base64url",
  );
  return Response.json({
    access_token: `header.${payload}.signature`,
    expires_in: 28_800,
  });
}

describe("Five North human wallet execute transport", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("creates a safe dispatch without executing, then submits exactly once", async () => {
    const { createFiveNorthHumanWalletExecuteTransport } =
      await moduleUnderTest();
    const { approved, verified } = await verifiedHumanExecuteSession();
    const events: string[] = [];
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      if (url === network.tokenUrl) {
        events.push("token");
        return tokenResponse();
      }
      events.push("execute");
      expect(url).toBe(`${network.ledgerUrl}${EXECUTE_PATH}`);
      expect(init).toMatchObject({ method: "POST", redirect: "error" });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(init?.headers).toMatchObject({
        authorization: expect.stringMatching(/^Bearer /u),
        "content-type": "application/json",
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        deduplicationPeriod: { Empty: {} },
        hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
        partySignatures: {
          signatures: [
            {
              party: approved.payerParty,
              signatures: [
                {
                  format: approved.signature.signatureFormat,
                  signature: approved.signature.signature,
                  signedBy: approved.signature.signedBy,
                  signingAlgorithmSpec: approved.signature.signingAlgorithm,
                },
              ],
            },
          ],
        },
        preparedTransaction: Buffer.from(approved.preparedTransaction).toString(
          "base64",
        ),
        submissionId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
        ),
        userId: USER_ID,
      });
      return Response.json({});
    });
    const execute = createFiveNorthHumanWalletExecuteTransport(network, {
      fetcher,
      signal: new AbortController().signal,
    });
    const dispatch = await execute.createDispatch(verified, {
      signal: new AbortController().signal,
    });

    expect(events).toEqual(["token"]);
    expect(dispatch).toMatchObject({
      preparedTransactionHash: approved.preparedTransactionHash,
      sessionId: approved.sessionId,
      submissionId: expect.any(String),
      userId: USER_ID,
    });
    expect(Object.keys(dispatch).sort()).toEqual([
      "execute",
      "preparedTransactionHash",
      "sessionId",
      "submissionId",
      "userId",
    ]);
    const publicDispatch = JSON.stringify(dispatch);
    expect(publicDispatch).not.toContain(approved.signature.signature);
    expect(publicDispatch).not.toContain(
      Buffer.from(approved.preparedTransaction).toString("base64"),
    );

    const result = await dispatch.execute({
      signal: new AbortController().signal,
    });

    expect(result).toEqual({
      outcome: "submitted",
      preparedTransactionHash: approved.preparedTransactionHash,
    });
    expect(JSON.stringify(result)).not.toContain(approved.signature.signature);
    expect(events).toEqual(["token", "execute"]);
    await expect(dispatch.execute({})).rejects.toThrow(/claimed/iu);
    await expect(execute.createDispatch(verified, {})).rejects.toThrow(
      /claimed/iu,
    );
  });

  it("pins bounded execute resources", async () => {
    const module = await moduleUnderTest();
    expect(module.HUMAN_WALLET_EXECUTE_TIMEOUT_MS).toBe(10_000);
    expect(module.MAX_HUMAN_WALLET_EXECUTE_REQUEST_BYTES).toBe(3_145_728);
    const maximumPreparedBase64Bytes =
      4 * Math.ceil(MAX_PREPARED_TRANSACTION_BYTES / 3);
    expect(
      module.MAX_HUMAN_WALLET_EXECUTE_REQUEST_BYTES -
        maximumPreparedBase64Bytes,
    ).toBeGreaterThanOrEqual(65_536);
    expect(module.MAX_HUMAN_WALLET_EXECUTE_RESPONSE_BYTES).toBe(2_097_152);
  });
});
