import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activeCapability,
  AGENT,
  CONTRACT,
  createLiveBootstrapFixture,
  EMPTY_COUNTS,
  exactBootstrapRequest,
  FACTORY,
  PAYER,
  PROVIDER,
  RESOURCE,
  SOURCE_COMMIT,
} from "./five-north-live-capability-bootstrap.fixtures.js";

async function moduleUnderTest() {
  try {
    return await import("../src/five-north-live-capability-bootstrap.js");
  } catch (error) {
    throw new Error("LIVE_CAPABILITY_BOOTSTRAP_NOT_IMPLEMENTED", {
      cause: error,
    });
  }
}

type LiveTransport = ReturnType<typeof createLiveBootstrapFixture>["transport"];

function input(workspaceRoot: string, transport: LiveTransport) {
  return {
    agentParty: AGENT,
    payerParty: PAYER,
    providerParty: PROVIDER,
    resourceUrl: RESOURCE,
    sourceCommit: SOURCE_COMMIT,
    transport,
    workspaceRoot,
  };
}

describe("Five North live capability bootstrap", () => {
  let workspaceRoot: string;

  beforeEach(async () => {
    vi.useFakeTimers({ now: new Date("2026-07-14T10:00:00.000Z") });
    workspaceRoot = await mkdtemp(join(tmpdir(), "sotto-live-bootstrap-"));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(workspaceRoot, { force: true, recursive: true });
  });

  it("runs readiness then factory, journals before one submit, and redacts", async () => {
    const { startFiveNorthLiveCapabilityBootstrap } = await moduleUnderTest();
    const fixture = createLiveBootstrapFixture(workspaceRoot);

    const result = await startFiveNorthLiveCapabilityBootstrap(
      input(workspaceRoot, fixture.transport),
    );

    expect(fixture.order).toEqual(["readiness", "factory", "submit"]);
    expect(fixture.journalWasDurable).toBe(true);
    expect(fixture.submittedRequest).toEqual(exactBootstrapRequest());
    expect(result).toMatchObject({
      resolvedCompatibleClassification: "ONE",
      ledgerMutationObserved: true,
      mode: "start",
      responseAcsAgreement: "MATCHED",
      status: "OBSERVED",
    });
    expect(result.networkCallCounts).toEqual({
      acs: 3,
      ledgerEnd: 3,
      package: 1,
      preferred: 1,
      registry: 1,
      rules: 1,
      submit: 1,
      token: 1,
    });
    expect(Object.values(result.prohibitedCalls)).not.toContain(true);
    const publicJson = JSON.stringify(result);
    for (const secret of [
      AGENT,
      PAYER,
      PROVIDER,
      RESOURCE,
      FACTORY,
      CONTRACT,
      fixture.submittedRequest!.commandId,
      `1220${"f".repeat(64)}`,
      "private-ledger-user",
    ]) {
      expect(publicJson).not.toContain(secret);
    }
  });

  it("requires clean-source identity and an entirely empty preflight", async () => {
    const { startFiveNorthLiveCapabilityBootstrap } = await moduleUnderTest();
    const invalidSource = createLiveBootstrapFixture(workspaceRoot);
    await expect(
      startFiveNorthLiveCapabilityBootstrap({
        ...input(workspaceRoot, invalidSource.transport),
        sourceCommit: "main",
      }),
    ).rejects.toThrow(/source/iu);
    expect(invalidSource.order).toEqual([]);

    const occupiedRoot = await mkdtemp(join(tmpdir(), "sotto-occupied-"));
    const occupied = createLiveBootstrapFixture(occupiedRoot);
    occupied.setActive([activeCapability(exactBootstrapRequest())]);
    await expect(
      startFiveNorthLiveCapabilityBootstrap(
        input(occupiedRoot, occupied.transport),
      ),
    ).rejects.toThrow(/preflight.*empty/iu);
    expect(occupied.order).toEqual(["readiness", "factory"]);
    expect(occupied.transport.networkCallCounts().submit).toBe(0);
    await rm(occupiedRoot, { force: true, recursive: true });
  });

  it("recovers only by exact ACS reconciliation and never resubmits", async () => {
    const {
      recoverFiveNorthLiveCapabilityBootstrap,
      startFiveNorthLiveCapabilityBootstrap,
    } = await moduleUnderTest();
    const fixture = createLiveBootstrapFixture(workspaceRoot, "ambiguous");
    await expect(
      startFiveNorthLiveCapabilityBootstrap(
        input(workspaceRoot, fixture.transport),
      ),
    ).rejects.toThrow(/unresolved/iu);
    const request = fixture.submittedRequest!;
    const counts = { ...EMPTY_COUNTS };
    fixture.setActive([activeCapability(request)]);

    const result = await recoverFiveNorthLiveCapabilityBootstrap({
      networkCallCounts: () => Object.freeze({ ...counts }),
      readActiveCapabilities: async () => {
        counts.ledgerEnd += 1;
        counts.acs += 1;
        return fixture.active;
      },
      sourceCommit: SOURCE_COMMIT,
      workspaceRoot,
    });

    expect(result).toMatchObject({
      resolvedCompatibleClassification: "ONE",
      mode: "recover",
      responseAcsAgreement: "NOT_OBSERVED",
      status: "OBSERVED",
    });
    expect(fixture.transport.networkCallCounts().submit).toBe(1);
    expect(result.networkCallCounts).toEqual({
      ...EMPTY_COUNTS,
      acs: 1,
      ledgerEnd: 1,
    });
  });

  it("labels terminal recovery as durable resolution without a current ACS claim", async () => {
    const {
      recoverFiveNorthLiveCapabilityBootstrap,
      startFiveNorthLiveCapabilityBootstrap,
    } = await moduleUnderTest();
    const fixture = createLiveBootstrapFixture(workspaceRoot);
    await startFiveNorthLiveCapabilityBootstrap(
      input(workspaceRoot, fixture.transport),
    );
    const readActiveCapabilities = vi.fn(async () => []);

    const result = await recoverFiveNorthLiveCapabilityBootstrap({
      networkCallCounts: () => EMPTY_COUNTS,
      readActiveCapabilities,
      sourceCommit: SOURCE_COMMIT,
      workspaceRoot,
    });

    expect(readActiveCapabilities).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      resolvedCompatibleClassification: "ONE",
      status: "OBSERVED",
    });
    expect(result).not.toHaveProperty("compatibleClassification");
    expect(result.networkCallCounts).toEqual(EMPTY_COUNTS);
  });

  it("rejects any prohibited live port before observation", async () => {
    const { startFiveNorthLiveCapabilityBootstrap } = await moduleUnderTest();
    const fixture = createLiveBootstrapFixture(workspaceRoot);
    const unsafeTransport = {
      ...fixture.transport,
      provider: async () => ({ status: 200 }),
    } as unknown as LiveTransport;

    await expect(
      startFiveNorthLiveCapabilityBootstrap({
        ...input(workspaceRoot, unsafeTransport),
      }),
    ).rejects.toThrow(/transport.*keys|surface/iu);
    expect(fixture.order).toEqual([]);
  });
});
