import { describe, expect, it } from "vitest";
import { createFiveNorthHumanReconciliationAdapter } from "../src/index.js";
import {
  checkpointEntry,
  completionEntry,
  createFakeFiveNorthFetcher,
  FAKE_NETWORK,
  fakeJwt,
  fakeProbeRequest,
} from "./five-north-fake-transport.fixture.js";

const UPDATE_ID = `1220${"cd".repeat(32)}`;

function probeOptions() {
  return Object.freeze({ signal: new AbortController().signal });
}

describe("Five North human reconciliation adapter bounds (injected fake fetcher, no real settlement)", () => {
  it("rejects a completion page that is not an array", async () => {
    const { fetcher } = createFakeFiveNorthFetcher({
      completions: () => ({ not: "an array" }),
      ledgerEnd: () => ({ offset: 12 }),
    });
    const adapter = createFiveNorthHumanReconciliationAdapter(FAKE_NETWORK, {
      fetcher,
    });

    await expect(
      adapter(fakeProbeRequest(), probeOptions()),
    ).rejects.toThrowError("completion page is invalid");
  });

  it("rejects a completion stream entry with unexpected keys", async () => {
    const { fetcher } = createFakeFiveNorthFetcher({
      completions: () => [{ bogus: 1 }],
      ledgerEnd: () => ({ offset: 12 }),
    });
    const adapter = createFiveNorthHumanReconciliationAdapter(FAKE_NETWORK, {
      fetcher,
    });

    await expect(
      adapter(fakeProbeRequest(), probeOptions()),
    ).rejects.toThrowError("completion stream entry keys are invalid");
  });

  it("rejects a malformed ledger-end payload", async () => {
    const { fetcher } = createFakeFiveNorthFetcher({
      ledgerEnd: () => ({ offset: "not-a-number" }),
    });
    const adapter = createFiveNorthHumanReconciliationAdapter(FAKE_NETWORK, {
      fetcher,
    });

    await expect(
      adapter(fakeProbeRequest(), probeOptions()),
    ).rejects.toThrowError("human reconciliation Ledger end is invalid");
  });

  it("rejects an oversized completion response before parsing it", async () => {
    const { fetcher } = createFakeFiveNorthFetcher({
      completions: () => new Response("x".repeat(2_000_001), { status: 200 }),
      ledgerEnd: () => ({ offset: 12 }),
    });
    const adapter = createFiveNorthHumanReconciliationAdapter(FAKE_NETWORK, {
      fetcher,
    });

    await expect(
      adapter(fakeProbeRequest(), probeOptions()),
    ).rejects.toThrowError("Five North response exceeds byte limit");
  });

  it("rejects an oversized ledger-end response before parsing it", async () => {
    const { fetcher } = createFakeFiveNorthFetcher({
      ledgerEnd: () => new Response("x".repeat(65_537), { status: 200 }),
    });
    const adapter = createFiveNorthHumanReconciliationAdapter(FAKE_NETWORK, {
      fetcher,
    });

    await expect(
      adapter(fakeProbeRequest(), probeOptions()),
    ).rejects.toThrowError("Five North response exceeds byte limit");
  });

  it("rejects a token whose subject does not match the probe user", async () => {
    const { fetcher } = createFakeFiveNorthFetcher({
      completions: () => [checkpointEntry(12)],
      ledgerEnd: () => ({ offset: 12 }),
      token: () => ({
        access_token: fakeJwt("someone-else"),
        expires_in: 3_600,
      }),
    });
    const adapter = createFiveNorthHumanReconciliationAdapter(FAKE_NETWORK, {
      fetcher,
    });

    await expect(
      adapter(fakeProbeRequest(), probeOptions()),
    ).rejects.toThrowError(
      "capability completion token subject does not match",
    );
  });

  it("rejects duplicate command completions in one scan window", async () => {
    const request = fakeProbeRequest();
    const duplicate = (offset: number) =>
      completionEntry({
        actAs: [request.payerParty],
        commandId: request.commandId,
        offset,
        status: { code: 0 },
        updateId: UPDATE_ID,
        userId: request.userId,
      });
    const { fetcher } = createFakeFiveNorthFetcher({
      completions: () => [duplicate(11), duplicate(12)],
      ledgerEnd: () => ({ offset: 12 }),
    });
    const adapter = createFiveNorthHumanReconciliationAdapter(FAKE_NETWORK, {
      fetcher,
    });

    await expect(adapter(request, probeOptions())).rejects.toThrowError(
      "duplicate command completions observed",
    );
  });

  it("refuses to probe once the caller signal is aborted", async () => {
    const { calls, fetcher } = createFakeFiveNorthFetcher({});
    const adapter = createFiveNorthHumanReconciliationAdapter(FAKE_NETWORK, {
      fetcher,
    });
    const controller = new AbortController();
    controller.abort();

    await expect(
      adapter(fakeProbeRequest(), { signal: controller.signal }),
    ).rejects.toThrowError("human reconciliation probe cancelled");
    expect(calls).toEqual([]);
  });

  it("rejects a probe request with unexpected keys", async () => {
    const { fetcher } = createFakeFiveNorthFetcher({});
    const adapter = createFiveNorthHumanReconciliationAdapter(FAKE_NETWORK, {
      fetcher,
    });

    await expect(
      adapter(fakeProbeRequest({ extra: "field" }), probeOptions()),
    ).rejects.toThrowError("human reconciliation probe request is invalid");
  });

  it("rejects a probe request with a negative begin offset", async () => {
    const { fetcher } = createFakeFiveNorthFetcher({});
    const adapter = createFiveNorthHumanReconciliationAdapter(FAKE_NETWORK, {
      fetcher,
    });

    await expect(
      adapter(fakeProbeRequest({ beginExclusive: -1 }), probeOptions()),
    ).rejects.toThrowError("human reconciliation begin offset is invalid");
  });

  it("requires an AbortSignal on every probe call", async () => {
    const { fetcher } = createFakeFiveNorthFetcher({});
    const adapter = createFiveNorthHumanReconciliationAdapter(FAKE_NETWORK, {
      fetcher,
    });

    await expect(
      adapter(
        fakeProbeRequest(),
        {} as unknown as Readonly<{ signal: AbortSignal }>,
      ),
    ).rejects.toThrowError(
      "human reconciliation probe requires an AbortSignal",
    );
  });
});
