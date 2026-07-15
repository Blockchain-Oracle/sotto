import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SpikeConfig } from "../src/config.js";
import { createFiveNorthCapabilityExecuteTransport } from "../src/five-north-capability-execute-transport.js";
import { verifiedExecuteSignature } from "./five-north-capability-execute-transport.fixtures.js";

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

function tokenResponse(): Response {
  const payload = Buffer.from(JSON.stringify({ sub: USER_ID })).toString(
    "base64url",
  );
  return Response.json({
    access_token: `header.${payload}.signature`,
    expires_in: 28_800,
  });
}

function transport(fetcher: typeof fetch) {
  return createFiveNorthCapabilityExecuteTransport(network, {
    fetcher,
    signal: new AbortController().signal,
  });
}

describe("Five North capability execute transport security", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-07-15T10:00:00.000Z") });
  });

  afterEach(() => vi.useRealTimers());

  it("rejects an oversized success response and consumes the session", async () => {
    const { verified } = await verifiedExecuteSignature();
    const execute = transport(
      vi.fn<typeof fetch>(async (url) =>
        url === network.tokenUrl
          ? tokenResponse()
          : Response.json(
              { secret: "private-ledger-response" },
              { headers: { "content-length": "2097153" } },
            ),
      ),
    );

    await expect(execute.execute(verified)).rejects.toThrow(
      "capability execute response is invalid",
    );
    await expect(execute.execute(verified)).rejects.toThrow(/claimed/iu);
  });

  it("returns status-only HTTP failures", async () => {
    const { verified } = await verifiedExecuteSignature();
    const execute = transport(
      vi.fn<typeof fetch>(async (url) =>
        url === network.tokenUrl
          ? tokenResponse()
          : Response.json(
              { secret: "private-ledger-rejection" },
              { status: 400 },
            ),
      ),
    );

    let failure: unknown;
    try {
      await execute.execute(verified);
    } catch (error) {
      failure = error;
    }
    expect(failure).toEqual(
      new Error("Five North capability execute failed with HTTP 400"),
    );
    expect(String(failure)).not.toContain("private-ledger-rejection");
  });

  it("redacts thrown transport details", async () => {
    const { verified } = await verifiedExecuteSignature();
    const execute = transport(
      vi.fn<typeof fetch>(async (url) => {
        if (url === network.tokenUrl) return tokenResponse();
        throw new Error("secret socket and credential detail");
      }),
    );

    await expect(execute.execute(verified)).rejects.toEqual(
      new Error("Five North capability execute transport failed"),
    );
  });
});
