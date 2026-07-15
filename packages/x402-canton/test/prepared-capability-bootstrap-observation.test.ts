import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildBoundedCapabilityBootstrap,
  createPreparedCapabilityBootstrapObserver,
  MAX_PREPARED_CAPABILITY_RESPONSE_BYTES,
  PREPARED_CAPABILITY_BOOTSTRAP_PATH,
} from "../src/index.js";
import { claimPreparedCapabilityBootstrapObservation } from "../src/prepared-capability-bootstrap-observation.js";
import { preparedCapabilityBootstrapResponse } from "./prepared-capability-bootstrap.fixtures.js";

const NOW = Date.parse("2026-07-15T10:00:00.000Z");

const input = {
  agentParty: "sotto-policy-agent::1220participant",
  allowedRecipient: "sotto-spike-provider::1220participant",
  allowedResourceHash: `sha256:${"a".repeat(64)}` as const,
  expiresAt: "2026-07-15T11:00:00.000Z",
  instrument: { admin: "DSO::1220dso", id: "Amulet" },
  maximumTotalDebitAtomic: "3250000000",
  payerParty: "sotto-spike-payer::1220participant",
  perCallLimitAtomic: "2500000000",
  remainingAllowanceAtomic: "10000000000",
  synchronizerId: "global-domain::1220synchronizer",
  transferFactoryContractId: "00transferfactory",
  userId: "ledger-user-6",
} as const;

describe("prepared capability bootstrap observation", () => {
  beforeEach(() => vi.useFakeTimers({ now: NOW }));
  afterEach(() => vi.useRealTimers());

  it("captures one exact authenticated prepared capability create", async () => {
    const request = buildBoundedCapabilityBootstrap(input);
    const read = vi.fn(async () =>
      preparedCapabilityBootstrapResponse(request),
    );
    const observe = createPreparedCapabilityBootstrapObserver(read);

    const observation = await observe(request);

    expect(observation).toMatchObject({
      hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
      preparedTransactionHash: Buffer.alloc(32, 7).toString("base64"),
    });
    expect(read).toHaveBeenCalledWith({
      body: request,
      contentType: "application/json",
      maximumResponseBytes: MAX_PREPARED_CAPABILITY_RESPONSE_BYTES,
      method: "POST",
      path: PREPARED_CAPABILITY_BOOTSTRAP_PATH,
      redirect: "error",
      timeoutMilliseconds: 10_000,
    });
    const state = claimPreparedCapabilityBootstrapObservation(observation);
    expect(state.preparedTransaction.byteLength).toBeGreaterThan(0);
    expect(() =>
      claimPreparedCapabilityBootstrapObservation(observation),
    ).toThrow(/already claimed/u);
    expect(() =>
      claimPreparedCapabilityBootstrapObservation({ ...observation }),
    ).toThrow(/not authenticated/u);
  });

  it.each([
    [
      "unknown response field",
      (response: Record<string, unknown>) => (response.debug = true),
      /response fields/u,
    ],
    [
      "missing core response field",
      (response: Record<string, unknown>) =>
        delete response.preparedTransactionHash,
      /response fields/u,
    ],
    [
      "invalid hashing details",
      (response: Record<string, unknown>) =>
        (response.hashingDetails = { debug: true }),
      /hashing details/u,
    ],
    [
      "invalid cost estimation",
      (response: Record<string, unknown>) =>
        (response.costEstimation = { debug: true }),
      /cost estimation/u,
    ],
    [
      "wrong hashing scheme",
      (response: Record<string, unknown>) =>
        (response.hashingSchemeVersion = "HASHING_SCHEME_VERSION_V1"),
      /hashing scheme V2/u,
    ],
    [
      "noncanonical prepared bytes",
      (response: Record<string, unknown>) =>
        (response.preparedTransaction = "AA"),
      /canonical base64/u,
    ],
    [
      "empty prepared bytes",
      (response: Record<string, unknown>) =>
        (response.preparedTransaction = ""),
      /prepared transaction/u,
    ],
    [
      "wrong hash length",
      (response: Record<string, unknown>) =>
        (response.preparedTransactionHash =
          Buffer.alloc(31).toString("base64")),
      /participant hash/u,
    ],
  ])("rejects %s", async (_name, mutate, message) => {
    const request = buildBoundedCapabilityBootstrap(input);
    const observe = createPreparedCapabilityBootstrapObserver(async () =>
      preparedCapabilityBootstrapResponse(request, mutate),
    );

    await expect(observe(request)).rejects.toThrow(message);
  });

  it("rejects unauthenticated and stale bootstrap requests before reading", async () => {
    const request = buildBoundedCapabilityBootstrap(input);
    const read = vi.fn(async () =>
      preparedCapabilityBootstrapResponse(request),
    );
    const observe = createPreparedCapabilityBootstrapObserver(read);

    await expect(observe({ ...request } as never)).rejects.toThrow(
      /not authenticated/u,
    );
    vi.advanceTimersByTime(60_001);
    await expect(observe(request)).rejects.toThrow(/stale/u);
    expect(read).not.toHaveBeenCalled();
  });

  it("rejects an oversized response before parsing", async () => {
    const request = buildBoundedCapabilityBootstrap(input);
    const observe = createPreparedCapabilityBootstrapObserver(
      async () => new Uint8Array(MAX_PREPARED_CAPABILITY_RESPONSE_BYTES + 1),
    );

    await expect(observe(request)).rejects.toThrow(/response bytes/u);
  });
});
