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
      await execute.createDispatch(verified, {});
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
    const execute = transport(fetcher);

    await expect(execute.createDispatch({ ...verified }, {})).rejects.toThrow(
      /authenticated/iu,
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not POST to execute while creating the dispatch", async () => {
    const { approved, verified } = await verifiedHumanExecuteSession();
    let executeRequests = 0;
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      if (url === network.tokenUrl) return tokenResponse();
      executeRequests += 1;
      return Response.json({});
    });
    const execute = transport(fetcher);

    const dispatch = await execute.createDispatch(verified, {});

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(executeRequests).toBe(0);
    expect(JSON.stringify(dispatch)).not.toContain(
      approved.signature.signature,
    );
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
    const dispatch = await execute.createDispatch(verified, {});

    let failure: unknown;
    try {
      await dispatch.execute({});
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

    const dispatch = await execute.createDispatch(verified, {});
    await expect(dispatch.execute({})).rejects.toEqual(
      new Error("Five North human wallet execute response is invalid"),
    );
    await expect(dispatch.execute({})).rejects.toThrow(/claimed/iu);
  });

  it("bounds a hung execute request and propagates an abort signal", async () => {
    vi.useRealTimers();
    const { verified } = await verifiedHumanExecuteSession();
    let executeSignal: AbortSignal | undefined;
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      if (url === network.tokenUrl) return tokenResponse();
      executeSignal = init?.signal ?? undefined;
      return await new Promise<Response>(() => undefined);
    });
    const execute = transport(fetcher);
    const dispatch = await execute.createDispatch(verified, {});
    const controller = new AbortController();
    const pending = dispatch.execute({ signal: controller.signal });
    controller.abort("private abort reason");

    await expect(pending).rejects.toEqual(
      new Error("Five North human wallet execute transport failed"),
    );
    expect(executeSignal).toBeInstanceOf(AbortSignal);
    expect(executeSignal?.aborted).toBe(true);
  });

  it("enforces the ten-second deadline for a hung execute endpoint", async () => {
    const { verified } = await verifiedHumanExecuteSession();
    let executeSignal: AbortSignal | undefined;
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      if (url === network.tokenUrl) return tokenResponse();
      executeSignal = init?.signal ?? undefined;
      return await new Promise<Response>(() => undefined);
    });
    const dispatch = await transport(fetcher).createDispatch(verified, {});
    const pending = dispatch.execute({});
    const rejected = expect(pending).rejects.toEqual(
      new Error("Five North human wallet execute transport failed"),
    );

    await vi.advanceTimersByTimeAsync(10_000);

    await rejected;
    expect(executeSignal?.aborted).toBe(true);
  });
});
