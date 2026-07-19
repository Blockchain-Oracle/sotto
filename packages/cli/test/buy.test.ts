import { describe, expect, it } from "vitest";
import { run } from "../src/run.js";
import { writeConfig } from "../src/config.js";
import {
  RESOURCE,
  TOKEN,
  capturedIo,
  fakeApi,
  sseBody,
  tempEnv,
} from "./harness.js";

const ORIGIN = "http://127.0.0.1:4000";
const ATTEMPT = `sha256:${"c".repeat(64)}`;

function purchaseRoutes(
  finalEvent: string,
  deliveryClaimState: string | null,
  attemptState?: string,
) {
  const detailState = attemptState ?? finalEvent;
  return {
    "POST /v1/purchases": {
      status: 201,
      body: {
        attemptId: ATTEMPT,
        outcome: "created",
        state: "intent-created",
        commandId: "cmd-1",
        executeBefore: new Date(Date.now() + 600_000).toISOString(),
        price: {
          indexed: {
            amountAtomic: "2500000000",
            recipient: RESOURCE.recipient,
          },
          observed: {
            amountAtomic: "2500000000",
            recipient: RESOURCE.recipient,
            observedAt: "2026-07-19T00:00:00.000Z",
          },
          changed: false,
        },
      },
    },
    [`GET /v1/purchases/${ATTEMPT}`]: {
      status: 200,
      body: {
        attempt: {
          attemptId: ATTEMPT,
          state: detailState,
          createdAt: "2026-07-19T00:00:00.000Z",
          executeBefore: new Date(Date.now() + 600_000).toISOString(),
          commandId: "cmd-1",
          requestCommitment: `sha256:${"d".repeat(64)}`,
          challengeId: `sha256:${"e".repeat(64)}`,
          purchaseCommitment: `sha256:${"f".repeat(64)}`,
          preparedTransactionHash: null,
          sourceCommit: "abc",
        },
        lifecycle: {},
        events: [],
        settlement: null,
        delivery:
          deliveryClaimState === null
            ? null
            : {
                claimState: deliveryClaimState,
                failureCode:
                  deliveryClaimState === "delivery-failed"
                    ? "provider-500"
                    : null,
                responseStatus: deliveryClaimState === "delivered" ? 200 : null,
                bodyByteCount: null,
                bodySha256: null,
                respondedAt:
                  deliveryClaimState === "delivered"
                    ? "2026-07-19T00:00:09.000Z"
                    : null,
              },
      },
    },
    [`GET /v1/purchases/${ATTEMPT}/events`]: () =>
      sseBody([
        { sequence: 1, type: "intent-created" },
        { sequence: 2, type: "prepared-hash-verified" },
        { sequence: 3, type: "approval-requested" },
        { sequence: 6, type: finalEvent },
      ]),
  };
}

async function runBuy(routes: Parameters<typeof fakeApi>[0]) {
  const env = tempEnv({ SOTTO_API_ORIGIN: ORIGIN });
  writeConfig(env, { apiOrigin: ORIGIN, token: TOKEN });
  const api = fakeApi(routes);
  const io = capturedIo();
  const exit = await run(["buy", RESOURCE.listingId], {
    io,
    env,
    fetchImpl: api.fetch,
  });
  return { exit, io };
}

describe("sotto buy lifecycle rail", () => {
  it("exits 0 when settled AND delivered, printing both facts", async () => {
    const { exit, io } = await runBuy(
      purchaseRoutes("settlement-reconciled", "delivered"),
    );
    expect(exit).toBe(0);
    const text = io.out.join("\n");
    expect(text).toContain("Request commitment: sha256:");
    expect(text).toContain("Human wallet approval requested");
    expect(text).toContain("HUMAN APPROVAL REQUIRED");
    expect(text).toContain("Settlement reconciled on Canton");
    expect(text).toContain("Settled: yes. Delivered: yes.");
  });

  it("exits 4 on wallet rejection", async () => {
    const { exit } = await runBuy(purchaseRoutes("wallet-rejected", null));
    expect(exit).toBe(4);
  });

  it("exits 5 on wallet-unsupported", async () => {
    const { exit } = await runBuy(purchaseRoutes("wallet-unsupported", null));
    expect(exit).toBe(5);
  });

  it("exits 6 on settlement rejection", async () => {
    const { exit } = await runBuy(purchaseRoutes("settlement-rejected", null));
    expect(exit).toBe(6);
  });

  it("exits 8 with reconcile guidance when settled but delivery failed", async () => {
    const { exit, io } = await runBuy(
      purchaseRoutes("settlement-reconciled", "delivery-failed"),
    );
    expect(exit).toBe(8);
    const err = io.err.join("\n");
    expect(err).toContain("Do NOT retry");
    expect(err).toContain(`sotto status ${ATTEMPT}`);
  });

  it("exits 7 when execute-before passes without a terminal event", async () => {
    const routes = purchaseRoutes("settlement-reconciled", null);
    const expired = {
      ...routes,
      "POST /v1/purchases": {
        status: 201,
        body: {
          ...(routes["POST /v1/purchases"] as { body: Record<string, unknown> })
            .body,
          executeBefore: new Date(Date.now() - 1_000).toISOString(),
        },
      },
      [`GET /v1/purchases/${ATTEMPT}/events`]: () =>
        sseBody([
          { sequence: 1, type: "intent-created" },
          { sequence: 2, type: "prepared-hash-verified" },
        ]),
    };
    const { exit, io } = await runBuy(expired);
    expect(exit).toBe(7);
    expect(io.out.join("\n")).toContain("execute-before deadline passed");
  }, 15_000);

  it("refuses --input honestly and initiates nothing", async () => {
    const env = tempEnv({ SOTTO_API_ORIGIN: ORIGIN });
    writeConfig(env, { apiOrigin: ORIGIN, token: TOKEN });
    const api = fakeApi({});
    const io = capturedIo();
    const exit = await run(["buy", RESOURCE.listingId, "--input", "{}"], {
      io,
      env,
      fetchImpl: api.fetch,
    });
    expect(exit).toBe(2);
    expect(api.calls).toEqual([]);
    expect(io.err.join("\n")).toContain("binds no request input");
  });

  it("stops locally when the indexed price exceeds --max-price", async () => {
    const env = tempEnv({ SOTTO_API_ORIGIN: ORIGIN });
    writeConfig(env, { apiOrigin: ORIGIN, token: TOKEN });
    const api = fakeApi({
      [`GET /v1/resources/${RESOURCE.listingId}`]: {
        status: 200,
        body: { resource: RESOURCE },
      },
    });
    const io = capturedIo();
    const exit = await run(["buy", RESOURCE.listingId, "--max-price", "100"], {
      io,
      env,
      fetchImpl: api.fetch,
    });
    expect(exit).toBe(2);
    expect(api.calls).not.toContain("POST /v1/purchases");
    expect(io.err.join("\n")).toContain("Local policy stop");
  });
});
