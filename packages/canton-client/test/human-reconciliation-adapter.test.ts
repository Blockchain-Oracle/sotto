import { describe, expect, it } from "vitest";
import { createFiveNorthHumanReconciliationAdapter } from "../src/index.js";
import {
  checkpointEntry,
  completionEntry,
  createFakeFiveNorthFetcher,
  FAKE_NETWORK,
  fakeProbeRequest,
} from "./five-north-fake-transport.fixture.js";

const UPDATE_ID = `1220${"ab".repeat(32)}`;

function probeOptions() {
  return Object.freeze({ signal: new AbortController().signal });
}

describe("Five North human reconciliation adapter transport contract (injected fake fetcher, no real settlement)", () => {
  it("classifies an empty scan window as pending at the ledger end", async () => {
    const request = fakeProbeRequest();
    const { calls, fetcher } = createFakeFiveNorthFetcher({
      ledgerEnd: () => ({ offset: request.beginExclusive }),
    });
    const adapter = createFiveNorthHumanReconciliationAdapter(FAKE_NETWORK, {
      fetcher,
    });

    await expect(adapter(request, probeOptions())).resolves.toEqual({
      outcome: "pending",
      scannedThroughOffset: request.beginExclusive,
    });
    expect(
      calls.some((call) => call.url.includes("/v2/commands/completions")),
    ).toBe(false);
  });

  it("classifies an absent completion as pending with the scanned-through offset", async () => {
    const request = fakeProbeRequest();
    const { calls, fetcher } = createFakeFiveNorthFetcher({
      completions: () => [checkpointEntry(12)],
      ledgerEnd: () => ({ offset: 12 }),
    });
    const adapter = createFiveNorthHumanReconciliationAdapter(FAKE_NETWORK, {
      fetcher,
    });

    await expect(adapter(request, probeOptions())).resolves.toEqual({
      outcome: "pending",
      scannedThroughOffset: 12,
    });
    const page = calls.find((call) =>
      call.url.includes("/v2/commands/completions"),
    );
    expect(page?.body).toEqual({
      beginExclusive: request.beginExclusive,
      parties: [request.payerParty],
      userId: request.userId,
    });
  });

  it("classifies a terminal rejection with its completion offset and gRPC status", async () => {
    const request = fakeProbeRequest();
    const { fetcher } = createFakeFiveNorthFetcher({
      completions: () => [
        completionEntry({
          actAs: [request.payerParty],
          commandId: request.commandId,
          offset: 11,
          status: { code: 9 },
          submissionId: request.submissionId,
          userId: request.userId,
        }),
        checkpointEntry(12),
      ],
      ledgerEnd: () => ({ offset: 12 }),
    });
    const adapter = createFiveNorthHumanReconciliationAdapter(FAKE_NETWORK, {
      fetcher,
    });

    await expect(adapter(request, probeOptions())).resolves.toEqual({
      outcome: "rejected",
      completionOffset: 11,
      statusCode: 9,
      submissionId: request.submissionId,
      synchronizerId: request.synchronizerId,
    });
  });

  it("returns a successful completion with the raw provider transaction untouched", async () => {
    const request = fakeProbeRequest();
    const rawTransaction = Object.freeze({
      arbitrary: Object.freeze({ nested: true, values: [1, "two"] }),
      transaction: Object.freeze({ updateId: UPDATE_ID }),
    });
    const { calls, fetcher } = createFakeFiveNorthFetcher({
      completions: () => [
        completionEntry({
          actAs: [request.payerParty],
          commandId: request.commandId,
          offset: 11,
          status: { code: 0 },
          submissionId: request.submissionId,
          updateId: UPDATE_ID,
          userId: request.userId,
        }),
        checkpointEntry(12),
      ],
      ledgerEnd: () => ({ offset: 12 }),
      transaction: () => rawTransaction,
    });
    const adapter = createFiveNorthHumanReconciliationAdapter(FAKE_NETWORK, {
      fetcher,
    });

    await expect(adapter(request, probeOptions())).resolves.toEqual({
      outcome: "succeeded",
      completionOffset: 11,
      updateId: UPDATE_ID,
      submissionId: request.submissionId,
      synchronizerId: request.synchronizerId,
      transaction: rawTransaction,
    });
    const read = calls.find((call) =>
      call.url.endsWith("/v2/updates/transaction-by-id"),
    );
    const body = read?.body as Record<string, unknown>;
    expect(body.updateId).toBe(UPDATE_ID);
    const format = body.transactionFormat as Record<string, unknown>;
    expect(format.transactionShape).toBe("TRANSACTION_SHAPE_LEDGER_EFFECTS");
    const eventFormat = format.eventFormat as Record<string, unknown>;
    expect(
      Object.keys(eventFormat.filtersByParty as Record<string, unknown>),
    ).toEqual([request.providerParty]);
  });

  it("passes through unverified transaction payloads because the worker owns verification", async () => {
    const request = fakeProbeRequest();
    const nonsense = Object.freeze({ paid: "not-a-settlement", junk: [null] });
    const { fetcher } = createFakeFiveNorthFetcher({
      completions: () => [
        completionEntry({
          actAs: [request.payerParty],
          commandId: request.commandId,
          offset: 11,
          status: { code: 0 },
          updateId: UPDATE_ID,
          userId: request.userId,
        }),
        checkpointEntry(12),
      ],
      ledgerEnd: () => ({ offset: 12 }),
      transaction: () => nonsense,
    });
    const adapter = createFiveNorthHumanReconciliationAdapter(FAKE_NETWORK, {
      fetcher,
    });

    const result = (await adapter(request, probeOptions())) as Record<
      string,
      unknown
    >;
    expect(result.outcome).toBe("succeeded");
    expect(result.transaction).toEqual(nonsense);
  });

  it("skips completions for other commands while scanning the window", async () => {
    const request = fakeProbeRequest();
    const { fetcher } = createFakeFiveNorthFetcher({
      completions: () => [
        completionEntry({
          actAs: [request.payerParty],
          commandId: "some-other-command",
          offset: 11,
          status: { code: 0 },
          updateId: UPDATE_ID,
          userId: request.userId,
        }),
        checkpointEntry(12),
      ],
      ledgerEnd: () => ({ offset: 12 }),
    });
    const adapter = createFiveNorthHumanReconciliationAdapter(FAKE_NETWORK, {
      fetcher,
    });

    await expect(adapter(request, probeOptions())).resolves.toEqual({
      outcome: "pending",
      scannedThroughOffset: 12,
    });
  });
});
