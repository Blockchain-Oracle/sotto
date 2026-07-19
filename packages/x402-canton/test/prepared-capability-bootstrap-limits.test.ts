import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_PREPARED_CAPABILITY_RESPONSE_BYTES,
  MAX_PREPARED_CAPABILITY_TRANSACTION_BYTES,
} from "../src/index.js";
import { parsePreparedCapabilityBootstrapResponse } from "../src/prepared-capability-bootstrap-response.js";
import { CAPABILITY_BOOTSTRAP_INPUT } from "./prepared-capability-bootstrap.fixtures.js";
import {
  capabilityArgumentRecord,
  capabilityRootCreate,
  observePreparedCapabilityLimit,
  preparedCapabilityValueDepth,
  rawCapabilityResponse,
} from "./prepared-capability-bootstrap-limits.fixtures.js";
import { fixtureScalar } from "./prepared-purchase-value.fixtures.js";

const NOW = Date.parse("2026-07-15T10:00:00.000Z");

describe("prepared capability verifier limits", () => {
  beforeEach(() => vi.useFakeTimers({ now: NOW }));
  afterEach(() => vi.useRealTimers());

  it("accepts the exact response ceiling and rejects plus one byte", () => {
    const base = rawCapabilityResponse(new Uint8Array([1]));
    const exact = new Uint8Array(MAX_PREPARED_CAPABILITY_RESPONSE_BYTES);
    exact.set(base);
    exact.fill(0x20, base.byteLength);

    expect(
      parsePreparedCapabilityBootstrapResponse(exact).preparedTransaction,
    ).toEqual(new Uint8Array([1]));
    expect(() =>
      parsePreparedCapabilityBootstrapResponse(
        new Uint8Array(MAX_PREPARED_CAPABILITY_RESPONSE_BYTES + 1),
      ),
    ).toThrow(/response bytes/iu);
  });

  it("accepts the exact prepared-byte ceiling and rejects plus one byte", () => {
    const exact = new Uint8Array(MAX_PREPARED_CAPABILITY_TRANSACTION_BYTES);
    expect(
      parsePreparedCapabilityBootstrapResponse(rawCapabilityResponse(exact))
        .preparedTransaction,
    ).toHaveLength(MAX_PREPARED_CAPABILITY_TRANSACTION_BYTES);
    expect(() =>
      parsePreparedCapabilityBootstrapResponse(
        rawCapabilityResponse(
          new Uint8Array(MAX_PREPARED_CAPABILITY_TRANSACTION_BYTES + 1),
        ),
      ),
    ).toThrow(/prepared transaction.*bounded/iu);
  });

  it("accepts one root and node and rejects either plus one", async () => {
    await expect(observePreparedCapabilityLimit()).resolves.toBeDefined();
    await expect(
      observePreparedCapabilityLimit((prepared) =>
        prepared.transaction!.roots.push("0"),
      ),
    ).rejects.toThrow(/one exact create root/iu);
    await expect(
      observePreparedCapabilityLimit((prepared) =>
        prepared.transaction!.nodes.push({
          ...structuredClone(prepared.transaction!.nodes[0]!),
          nodeId: "1",
        }),
      ),
    ).rejects.toThrow(/one exact create root/iu);
  });

  it("accepts 16 reviewed fields at depth three and rejects plus one", async () => {
    await expect(
      observePreparedCapabilityLimit((prepared) => {
        const argument = capabilityArgumentRecord(prepared);
        const nested = argument.fields.find(
          ({ label }) => label === "instrumentId",
        )?.value;
        expect(argument.fields).toHaveLength(14);
        expect(nested?.sum.oneofKind).toBe("record");
        if (nested?.sum.oneofKind !== "record") return;
        expect(nested.sum.record.fields).toHaveLength(2);
        expect(
          preparedCapabilityValueDepth(capabilityRootCreate(prepared).argument),
        ).toBe(3);
      }),
    ).resolves.toBeDefined();
    await expect(
      observePreparedCapabilityLimit((prepared) =>
        capabilityArgumentRecord(prepared).fields.push({
          label: "unexpected",
          value: fixtureScalar("text", "extra"),
        }),
      ),
    ).rejects.toThrow(/fields do not match/iu);
    await expect(
      observePreparedCapabilityLimit((prepared) => {
        const field = capabilityArgumentRecord(prepared).fields.find(
          ({ label }) => label === "instrumentId",
        );
        if (field?.value === undefined) throw new Error("instrument is absent");
        field.value = {
          sum: { oneofKind: "optional", optional: { value: field.value } },
        };
        expect(
          preparedCapabilityValueDepth(capabilityRootCreate(prepared).argument),
        ).toBe(4);
      }),
    ).rejects.toThrow(/capability instrument/iu);
  });

  it("accepts a 512-byte contract ID and rejects 513 bytes", async () => {
    await expect(
      observePreparedCapabilityLimit(
        (prepared) =>
          (capabilityRootCreate(prepared).contractId = "a".repeat(512)),
      ),
    ).resolves.toBeDefined();
    await expect(
      observePreparedCapabilityLimit(
        (prepared) =>
          (capabilityRootCreate(prepared).contractId = "a".repeat(513)),
      ),
    ).rejects.toThrow(/contract ID.*bounded/iu);
  });

  it("accepts exact party counts and rejects one extra stakeholder", async () => {
    await expect(
      observePreparedCapabilityLimit((prepared) => {
        expect(capabilityRootCreate(prepared).signatories).toHaveLength(1);
        expect(capabilityRootCreate(prepared).stakeholders).toHaveLength(2);
      }),
    ).resolves.toBeDefined();
    await expect(
      observePreparedCapabilityLimit((prepared) =>
        capabilityRootCreate(prepared).stakeholders.push(
          CAPABILITY_BOOTSTRAP_INPUT.allowedRecipient,
        ),
      ),
    ).rejects.toThrow(/stakeholders.*parties/iu);
  });

  it("rejects one unknown field and records non-authoritative test timing", async () => {
    const started = process.hrtime.bigint();
    const observation = await observePreparedCapabilityLimit();
    const elapsedMicroseconds = Number(
      (process.hrtime.bigint() - started) / 1_000n,
    );
    expect(elapsedMicroseconds).toBeGreaterThanOrEqual(0);
    expect(observation).not.toHaveProperty("elapsedMicroseconds");
    await expect(
      observePreparedCapabilityLimit(
        undefined,
        (bytes) => new Uint8Array([...bytes, 0x98, 0x06, 0x01]),
      ),
    ).rejects.toThrow(/protobuf/iu);
  });
});
