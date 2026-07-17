import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as publicApi from "../src/index.js";
import { createHumanWalletConnectorPreflight } from "../src/human-wallet-connector-preflight.js";
import {
  prepareHumanWalletConnectorPreflightBinding,
  prepareHumanWalletConnectorPreflightSessionClaim,
  readAuthenticatedHumanWalletConnectorPreflight,
} from "../src/human-wallet-connector-preflight-state.js";
import { HUMAN_PURCHASE_NOW } from "./human-purchase-commitment.fixtures.js";
import {
  HUMAN_CONNECTOR_CAPABILITIES,
  HUMAN_PACKAGE_ID,
  humanPreflightInput,
} from "./human-wallet-connector-preflight.fixtures.js";

const PURCHASE = `sha256:${"d".repeat(64)}`;

describe("human wallet preflight provenance and privacy", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("exposes only the exact safe public handle", async () => {
    const result = await createHumanWalletConnectorPreflight(
      humanPreflightInput(),
    );
    if (result.outcome !== "compatible") throw new Error("preflight failed");

    expect(Object.keys(result)).toEqual([
      "version",
      "outcome",
      "preflightId",
      "connectorId",
      "connectorKind",
      "origin",
      "observedAt",
    ]);
    const serialized = JSON.stringify(result);
    for (const secret of [
      HUMAN_CONNECTOR_CAPABILITIES.payerParty,
      HUMAN_CONNECTOR_CAPABILITIES.signingKey.fingerprint,
      HUMAN_CONNECTOR_CAPABILITIES.networks[0],
      HUMAN_CONNECTOR_CAPABILITIES.synchronizerIds[0],
      HUMAN_PACKAGE_ID,
      "validator-devnet-m2m",
    ]) {
      expect(serialized).not.toContain(secret);
    }
    expect(publicApi).not.toHaveProperty(
      "prepareHumanWalletConnectorPreflightBinding",
    );
    expect(publicApi).not.toHaveProperty(
      "prepareHumanWalletConnectorPreflightSessionClaim",
    );
  });

  it("rejects forged and cloned handles", async () => {
    const result = await createHumanWalletConnectorPreflight(
      humanPreflightInput(),
    );
    expect(() =>
      readAuthenticatedHumanWalletConnectorPreflight({ ...result }),
    ).toThrow(/not authenticated/u);
    expect(() =>
      readAuthenticatedHumanWalletConnectorPreflight({
        version: "sotto-human-wallet-preflight-v1",
        outcome: "compatible",
      }),
    ).toThrow(/not authenticated/u);
  });

  it("mints distinct random handles for identical compatible wallets", async () => {
    const first = await createHumanWalletConnectorPreflight(
      humanPreflightInput(),
    );
    const second = await createHumanWalletConnectorPreflight(
      humanPreflightInput(),
    );
    expect(first.outcome).toBe("compatible");
    expect(second.outcome).toBe("compatible");
    if (first.outcome !== "compatible" || second.outcome !== "compatible") {
      throw new Error("preflight failed");
    }
    expect(first.preflightId).not.toBe(second.preflightId);
  });

  it("binds and claims authority only through atomic narrow operations", async () => {
    const result = await createHumanWalletConnectorPreflight(
      humanPreflightInput(),
    );
    const binding = prepareHumanWalletConnectorPreflightBinding(
      result,
      PURCHASE,
    );
    const authority = binding.authority;
    expect(Object.isFrozen(authority)).toBe(true);
    expect(Object.isFrozen(authority.connector)).toBe(true);
    expect(() =>
      prepareHumanWalletConnectorPreflightBinding(
        result,
        `sha256:${"e".repeat(64)}`,
      ),
    ).not.toThrow();
    binding.commit();
    expect(() =>
      prepareHumanWalletConnectorPreflightBinding(
        result,
        `sha256:${"e".repeat(64)}`,
      ),
    ).toThrow(/already bound/u);
    const claim = prepareHumanWalletConnectorPreflightSessionClaim(
      result,
      PURCHASE,
    );
    expect(claim.authority).toBe(authority);
    claim.commit();
    expect(() =>
      prepareHumanWalletConnectorPreflightSessionClaim(result, PURCHASE),
    ).toThrow(/already claimed/u);
  });

  it("gives concurrent binding and session tickets exactly one winner", async () => {
    const bindingResult = await createHumanWalletConnectorPreflight(
      humanPreflightInput(),
    );
    const firstBinding = prepareHumanWalletConnectorPreflightBinding(
      bindingResult,
      PURCHASE,
    );
    const losingBinding = prepareHumanWalletConnectorPreflightBinding(
      bindingResult,
      `sha256:${"e".repeat(64)}`,
    );
    firstBinding.commit();
    expect(() => losingBinding.commit()).toThrow(/already bound/u);

    const sessionResult = await createHumanWalletConnectorPreflight(
      humanPreflightInput(),
    );
    prepareHumanWalletConnectorPreflightBinding(
      sessionResult,
      PURCHASE,
    ).commit();
    const firstClaim = prepareHumanWalletConnectorPreflightSessionClaim(
      sessionResult,
      PURCHASE,
    );
    const losingClaim = prepareHumanWalletConnectorPreflightSessionClaim(
      sessionResult,
      PURCHASE,
    );
    firstClaim.commit();
    expect(() => losingClaim.commit()).toThrow(/already claimed/u);
  });

  it("rejects stale and rolled-back clocks", async () => {
    const stale = await createHumanWalletConnectorPreflight(
      humanPreflightInput(),
    );
    vi.advanceTimersByTime(60_001);
    expect(() => readAuthenticatedHumanWalletConnectorPreflight(stale)).toThrow(
      /stale/u,
    );

    vi.setSystemTime(new Date(HUMAN_PURCHASE_NOW));
    const rollback = await createHumanWalletConnectorPreflight(
      humanPreflightInput(),
    );
    vi.setSystemTime(new Date(Date.parse(HUMAN_PURCHASE_NOW) - 5_001));
    expect(() =>
      readAuthenticatedHumanWalletConnectorPreflight(rollback),
    ).toThrow(/clock moved backwards/u);
  });
});
