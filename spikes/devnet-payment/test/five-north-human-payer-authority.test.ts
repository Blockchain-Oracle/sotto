import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { SpikeConfig } from "../src/config.js";
import type { FiveNorthHumanWalletProfile } from "../src/five-north-human-wallet-profile.js";
import { requireFiveNorthHumanPayerNamedRightsAbsent } from "../src/five-north-human-payer-authority.js";

const SUBJECT = "validator-devnet-m2m";
const PAYER = `sotto-external-payer::1220${"a".repeat(64)}`;
const OTHER = `sotto-other::1220${"b".repeat(64)}`;
const TOKEN = `header.${Buffer.from(JSON.stringify({ sub: SUBJECT })).toString(
  "base64url",
)}.signature`;

const network: SpikeConfig["network"] = {
  audience: "validator-devnet-m2m",
  clientId: "validator-devnet-m2m",
  clientSecret: "test-secret",
  issuerUrl: "https://auth.sandbox.fivenorth.io/application/o/test",
  ledgerUrl: "https://ledger-api.validator.devnet.sandbox.fivenorth.io",
  scope: "daml_ledger_api",
  tokenUrl: "https://auth.sandbox.fivenorth.io/application/o/token/",
  validatorUrl: "https://wallet.validator.devnet.sandbox.fivenorth.io/api",
};

const profile: FiveNorthHumanWalletProfile = Object.freeze({
  fingerprint: `1220${"a".repeat(64)}`,
  party: PAYER,
  publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW",
  synchronizerId: `global-domain::1220${"c".repeat(64)}`,
  topologyHash: "topology-hash",
});

const broadRights = [
  { kind: { CanExecuteAsAnyParty: { value: {} } } },
  { kind: { ParticipantAdmin: { value: {} } } },
  { kind: { CanReadAsAnyParty: { value: {} } } },
  { kind: { CanActAs: { value: { party: OTHER } } } },
  { kind: { CanExecuteAs: { value: { party: OTHER } } } },
  { kind: { CanReadAs: { value: { party: PAYER } } } },
] as const;

function harness(
  rights: readonly unknown[] = broadRights,
  authenticatedSubject = SUBJECT,
) {
  const getJson = vi.fn(async (path: string) => {
    if (path === "/v2/authenticated-user") {
      return { user: { id: authenticatedSubject } };
    }
    if (path === `/v2/users/${encodeURIComponent(SUBJECT)}/rights`) {
      return { rights };
    }
    throw new Error(`unexpected GET ${path}`);
  });
  const createHttp = vi.fn(() => ({
    getJson,
    headRoute: vi.fn(),
    postJson: vi.fn(),
    tokenProvider: {
      accessToken: vi.fn(async () => TOKEN),
      invalidate: vi.fn(),
    },
  }));
  return { createHttp, getJson };
}

function input(signal = new AbortController().signal) {
  return { network, profile, signal };
}

describe("Five North human payer named-right gate", () => {
  it("passes broad credentials only when exact named payer rights are absent", async () => {
    const dependencies = harness();

    const result = await requireFiveNorthHumanPayerNamedRightsAbsent(
      input(),
      dependencies,
    );

    expect(result).toEqual({
      broadRightsNotAssessed: true,
      namedActAsAbsent: true,
      namedExecuteAsAbsent: true,
      rightsCount: broadRights.length,
      subjectHash: `sha256:${createHash("sha256").update(SUBJECT).digest("hex")}`,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(
      new RegExp(`${SUBJECT}|${PAYER}|${OTHER}`, "u"),
    );
    expect(dependencies.getJson.mock.calls.map(([path]) => path)).toEqual([
      "/v2/authenticated-user",
      `/v2/users/${encodeURIComponent(SUBJECT)}/rights`,
    ]);
  });

  it.each(["CanActAs", "CanExecuteAs"])(
    "rejects an exact named payer %s right",
    async (kind) => {
      const dependencies = harness([
        ...broadRights,
        { kind: { [kind]: { value: { party: PAYER } } } },
      ]);

      await expect(
        requireFiveNorthHumanPayerNamedRightsAbsent(input(), dependencies),
      ).rejects.toThrow(/named human payer right is present/iu);
    },
  );

  it("rejects an authenticated-user mismatch before reading rights", async () => {
    const dependencies = harness(broadRights, "substituted-user");

    await expect(
      requireFiveNorthHumanPayerNamedRightsAbsent(input(), dependencies),
    ).rejects.toThrow(/authenticated user does not match/iu);
    expect(dependencies.getJson).toHaveBeenCalledOnce();
  });

  it("rejects malformed or unknown rights instead of ignoring them", async () => {
    const dependencies = harness([{ kind: { FutureAdmin: { value: {} } } }]);

    await expect(
      requireFiveNorthHumanPayerNamedRightsAbsent(input(), dependencies),
    ).rejects.toThrow(/right kind is unsupported/iu);
  });

  it("rejects cancellation before creating an authenticated client", async () => {
    const dependencies = harness();
    const controller = new AbortController();
    controller.abort("private reason");

    await expect(
      requireFiveNorthHumanPayerNamedRightsAbsent(
        input(controller.signal),
        dependencies,
      ),
    ).rejects.toThrow("human payer authority gate cancelled");
    expect(dependencies.createHttp).not.toHaveBeenCalled();
  });
});
