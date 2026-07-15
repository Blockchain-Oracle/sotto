import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SpikeConfig } from "../src/config.js";
import { verifiedExecuteSignature } from "./five-north-capability-execute-transport.fixtures.js";

const EXECUTE_PATH = "/v2/interactive-submission/execute";
const USER_ID = "ledger-user-6";
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
    return await import("../src/five-north-capability-execute-transport.js");
  } catch (cause) {
    throw new Error("CAPABILITY_EXECUTE_TRANSPORT_NOT_IMPLEMENTED", { cause });
  }
}

function tokenResponse(subject: string, marker = "one"): Response {
  const payload = Buffer.from(JSON.stringify({ sub: subject })).toString(
    "base64url",
  );
  return Response.json({
    access_token: `header.${payload}.${marker}`,
    expires_in: 28_800,
  });
}

describe("Five North capability execute transport", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-15T10:00:00.000Z") });
  });

  afterEach(() => vi.useRealTimers());

  it("executes the exact authenticated prepared transaction once", async () => {
    const { createFiveNorthCapabilityExecuteTransport } =
      await moduleUnderTest();
    const { approved, verified } = await verifiedExecuteSignature();
    const events: string[] = [];
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      if (url === network.tokenUrl) {
        events.push("token");
        return tokenResponse(USER_ID);
      }
      events.push("execute");
      expect(url).toBe(`${network.ledgerUrl}${EXECUTE_PATH}`);
      const body = JSON.parse(String(init?.body));
      expect(init).toMatchObject({ method: "POST", redirect: "error" });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(init?.headers).toMatchObject({
        authorization: expect.stringMatching(/^Bearer /u),
        "content-type": "application/json",
      });
      expect(body).toEqual({
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
    const transport = createFiveNorthCapabilityExecuteTransport(network, {
      fetcher,
      signal: new AbortController().signal,
    });

    const persistStarted = vi.fn(async (started) => {
      events.push("persisted");
      expect(started).toEqual({
        sessionId: approved.sessionId,
        submissionId: expect.any(String),
        userId: USER_ID,
      });
    });
    const result = await transport.execute(verified, persistStarted);

    expect(result).toEqual({
      outcome: "submitted",
      preparedTransactionHash: approved.preparedTransactionHash,
      sessionId: approved.sessionId,
      submissionId: expect.any(String),
      userId: USER_ID,
    });
    expect(JSON.stringify(result)).not.toContain(approved.signature.signature);
    expect(events).toEqual(["token", "persisted", "execute"]);
    expect(persistStarted).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledTimes(2);
    await expect(transport.execute(verified, persistStarted)).rejects.toThrow(
      /claimed/iu,
    );
  });

  it("never retries an execute after 401", async () => {
    const { createFiveNorthCapabilityExecuteTransport } =
      await moduleUnderTest();
    const { verified } = await verifiedExecuteSignature();
    const requests: Array<{ body: string; token: string }> = [];
    let tokens = 0;
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      if (url === network.tokenUrl) {
        tokens += 1;
        return tokenResponse(USER_ID, String(tokens));
      }
      requests.push({
        body: String(init?.body),
        token: String((init?.headers as Record<string, string>).authorization),
      });
      return requests.length === 1
        ? Response.json({ secret: "expired" }, { status: 401 })
        : Response.json({});
    });
    const transport = createFiveNorthCapabilityExecuteTransport(network, {
      fetcher,
      signal: new AbortController().signal,
    });

    await expect(
      transport.execute(verified, async () => undefined),
    ).rejects.toThrow("Five North capability execute failed with HTTP 401");
    expect(tokens).toBe(1);
    expect(requests).toHaveLength(1);
  });

  it("rejects clones and bounds timeout, request, response, and errors", async () => {
    const module = await moduleUnderTest();
    expect(module.CAPABILITY_EXECUTE_TIMEOUT_MS).toBe(10_000);
    expect(module.MAX_CAPABILITY_EXECUTE_REQUEST_BYTES).toBe(2_097_152);
    expect(module.MAX_CAPABILITY_EXECUTE_RESPONSE_BYTES).toBe(2_097_152);
    const { verified } = await verifiedExecuteSignature();
    const fetcher = vi.fn<typeof fetch>();
    expect(() =>
      module.createFiveNorthCapabilityExecuteTransport(network, {
        fetcher,
        signal: new AbortController().signal,
        userId: "caller-controlled",
      } as never),
    ).toThrow(/fields/iu);
    const transport = module.createFiveNorthCapabilityExecuteTransport(
      network,
      { fetcher, signal: new AbortController().signal },
    );

    await expect(
      transport.execute({ ...verified }, async () => undefined),
    ).rejects.toThrow(/authenticated/iu);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
