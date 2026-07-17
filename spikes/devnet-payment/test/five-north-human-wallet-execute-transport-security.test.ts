import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HUMAN_PURCHASE_NOW } from "../../../packages/x402-canton/test/human-purchase-commitment.fixtures.js";
import type { SpikeConfig } from "../src/config.js";
import { createFiveNorthHumanWalletExecuteTransport } from "../src/five-north-human-wallet-execute-transport.js";
import { verifiedHumanExecuteSession } from "./five-north-human-wallet-execute-transport.fixtures.js";

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
  return createFiveNorthHumanWalletExecuteTransport(network, {
    fetcher,
    signal: new AbortController().signal,
  });
}

describe("Five North human wallet execute transport security", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("redacts failures while acquiring the execution token", async () => {
    const { approved, verified } = await verifiedHumanExecuteSession();
    const execute = transport(
      vi.fn<typeof fetch>(async () => {
        throw new Error(`private ${approved.signature.signature}`);
      }),
    );

    let failure: unknown;
    try {
      await execute.execute(verified, async () => undefined);
    } catch (error) {
      failure = error;
    }
    expect(failure).toEqual(
      new Error("Five North human wallet execute token acquisition failed"),
    );
    expect(String(failure)).not.toContain(approved.signature.signature);
  });

  it("rejects clones before network or durable effects", async () => {
    const { verified } = await verifiedHumanExecuteSession();
    const fetcher = vi.fn<typeof fetch>();
    const persist = vi.fn(async () => undefined);
    const execute = transport(fetcher);

    await expect(execute.execute({ ...verified }, persist)).rejects.toThrow(
      /authenticated/iu,
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it("does not POST when durable execution-start persistence fails", async () => {
    const { verified } = await verifiedHumanExecuteSession();
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      if (url === network.tokenUrl) return tokenResponse();
      return Response.json({});
    });
    const execute = transport(fetcher);

    await expect(
      execute.execute(verified, async () => {
        throw new Error("private journal detail");
      }),
    ).rejects.toEqual(
      new Error("human wallet execute start persistence failed"),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("returns status-only HTTP failures and never retries", async () => {
    const { approved, verified } = await verifiedHumanExecuteSession();
    const fetcher = vi.fn<typeof fetch>(async (url) =>
      url === network.tokenUrl
        ? tokenResponse()
        : Response.json(
            { secret: approved.signature.signature },
            { status: 401 },
          ),
    );
    const execute = transport(fetcher);

    let failure: unknown;
    try {
      await execute.execute(verified, async () => undefined);
    } catch (error) {
      failure = error;
    }
    expect(failure).toEqual(
      new Error("Five North human wallet execute failed with HTTP 401"),
    );
    expect(String(failure)).not.toContain(approved.signature.signature);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("bounds success responses and consumes the verified session", async () => {
    const { verified } = await verifiedHumanExecuteSession();
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

    await expect(
      execute.execute(verified, async () => undefined),
    ).rejects.toEqual(
      new Error("Five North human wallet execute response is invalid"),
    );
    await expect(
      execute.execute(verified, async () => undefined),
    ).rejects.toThrow(/claimed/iu);
  });
});
