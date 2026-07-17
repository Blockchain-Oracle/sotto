import {
  FIVE_NORTH_HOLDING_IMPLEMENTATION_PACKAGE_ID,
  type HumanWalletConnector,
} from "@sotto/x402-canton";
import { describe, expect, it, vi } from "vitest";
import type { SpikeConfig } from "../src/config.js";
import type { FiveNorthWalletPreflightHttp } from "../src/five-north-wallet-preflight-http.js";
import type { FiveNorthHumanWalletProfile } from "../src/five-north-human-wallet-profile.js";
import {
  createFiveNorthReadOnlyHumanWalletConnector,
  createFiveNorthReferenceHumanWalletPreflight,
} from "../src/five-north-reference-human-wallet.js";

const FINGERPRINT = `1220${"a".repeat(64)}` as `1220${string}`;
const PARTY = `sotto-external-payer::${FINGERPRINT}`;
const SYNCHRONIZER = `global-domain::1220${"b".repeat(64)}`;
const SUBJECT = "validator-devnet-m2m";
const PROFILE: FiveNorthHumanWalletProfile = Object.freeze({
  fingerprint: FINGERPRINT,
  party: PARTY,
  publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW",
  synchronizerId: SYNCHRONIZER,
  topologyHash: Buffer.from([
    0x12,
    0x20,
    ...new Uint8Array(32).fill(7),
  ]).toString("base64"),
});
const NETWORK: SpikeConfig["network"] = Object.freeze({
  audience: SUBJECT,
  clientId: SUBJECT,
  clientSecret: "private-client-secret",
  issuerUrl:
    "https://auth.sandbox.fivenorth.io/application/o/validator-devnet-m2m",
  ledgerUrl: "https://ledger-api.validator.devnet.sandbox.fivenorth.io",
  scope: "daml_ledger_api",
  tokenUrl: "https://auth.sandbox.fivenorth.io/application/o/token/",
  validatorUrl:
    "https://wallet.validator.devnet.sandbox.fivenorth.io/api/validator",
});

function token(subject = SUBJECT): string {
  return `header.${Buffer.from(JSON.stringify({ sub: subject })).toString(
    "base64url",
  )}.signature`;
}

function http(
  input: {
    authenticatedUser?: string;
    party?: string;
    subjects?: string[];
    synchronizer?: string;
  } = {},
): FiveNorthWalletPreflightHttp {
  const subjects = [...(input.subjects ?? [SUBJECT, SUBJECT])];
  return Object.freeze({
    getJson: vi.fn(async (path: string) => {
      if (path === "/v2/authenticated-user") {
        return { user: { id: input.authenticatedUser ?? SUBJECT } };
      }
      if (path === `/v2/parties/${encodeURIComponent(PARTY)}`) {
        return { partyDetails: [{ party: input.party ?? PARTY }] };
      }
      if (path === "/v2/state/connected-synchronizers") {
        return {
          connectedSynchronizers: [
            { synchronizerId: input.synchronizer ?? SYNCHRONIZER },
          ],
        };
      }
      throw new Error(`unexpected human wallet path ${path}`);
    }),
    headRoute: vi.fn(),
    postJson: vi.fn(),
    tokenProvider: {
      accessToken: vi.fn(async () => token(subjects.shift() ?? SUBJECT)),
      invalidate: vi.fn(),
    },
  });
}

function dependencies(transport: FiveNorthWalletPreflightHttp) {
  return {
    createHttp: vi.fn(() => transport),
    readProfile: vi.fn(async () => PROFILE),
  };
}

describe("Five North reference human wallet", () => {
  it("builds exact read-only Wallet SDK capabilities", async () => {
    const connector: HumanWalletConnector =
      createFiveNorthReadOnlyHumanWalletConnector(PROFILE);
    const signal = new AbortController().signal;

    await expect(connector.discover({ signal })).resolves.toEqual({
      version: "sotto-human-wallet-capabilities-v1",
      approvalVersions: ["sotto-human-purchase-approval-v1"],
      connectorId: "wallet-sdk-reference",
      connectorKind: "wallet-sdk",
      explicitApproval: true,
      hashingSchemeVersions: ["HASHING_SCHEME_VERSION_V2"],
      networks: ["canton:devnet"],
      origin: "wallet://sotto-reference",
      packageIds: [FIVE_NORTH_HOLDING_IMPLEMENTATION_PACKAGE_ID],
      payerParty: PARTY,
      preparedTransactionSigning: true,
      signingKey: {
        fingerprint: FINGERPRINT,
        publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW",
        purpose: "SIGNING",
        signatureFormat: "SIGNATURE_FORMAT_CONCAT",
        signingAlgorithm: "SIGNING_ALGORITHM_SPEC_ED25519",
      },
      synchronizerIds: [SYNCHRONIZER],
    });
    await expect(connector.requestApproval({}, { signal })).rejects.toThrow(
      /read-only/iu,
    );
  });

  it("authenticates the journal identity against fresh Five North reads", async () => {
    const transport = http();
    const source = dependencies(transport);
    const signal = new AbortController().signal;

    await expect(
      createFiveNorthReferenceHumanWalletPreflight(
        {
          keyFile: "/workspace/.capability-wallet/payer.key",
          network: NETWORK,
          signal,
          workspaceRoot: "/workspace",
        },
        source,
      ),
    ).resolves.toMatchObject({
      connectorId: "wallet-sdk-reference",
      connectorKind: "wallet-sdk",
      origin: "wallet://sotto-reference",
      outcome: "compatible",
    });
    expect(source.readProfile).toHaveBeenCalledOnce();
    expect(transport.getJson).toHaveBeenCalledWith(
      `/v2/parties/${encodeURIComponent(PARTY)}`,
      expect.any(AbortSignal),
    );
    expect(transport.getJson).toHaveBeenCalledWith(
      "/v2/state/connected-synchronizers",
      expect.any(AbortSignal),
    );
    expect(transport.postJson).not.toHaveBeenCalled();
  });

  it.each([
    ["Party", { party: `sotto-other::${FINGERPRINT}` }],
    ["synchronizer", { synchronizer: `other-domain::1220${"c".repeat(64)}` }],
    ["authenticated user", { authenticatedUser: "other-subject" }],
    ["subject", { subjects: [SUBJECT, "changed-subject"] }],
  ])("rejects live %s drift", async (_label, mutation) => {
    await expect(
      createFiveNorthReferenceHumanWalletPreflight(
        {
          keyFile: "/workspace/.capability-wallet/payer.key",
          network: NETWORK,
          signal: new AbortController().signal,
          workspaceRoot: "/workspace",
        },
        dependencies(http(mutation)),
      ),
    ).rejects.toThrow();
  });

  it("settles a hung live identity read at the ten-second boundary", async () => {
    vi.useFakeTimers({ now: new Date("2026-07-13T10:00:00.000Z") });
    const operationSignals: AbortSignal[] = [];
    const transport: FiveNorthWalletPreflightHttp = Object.freeze({
      getJson: vi.fn(async (_path: string, signal?: AbortSignal) => {
        if (signal !== undefined) operationSignals.push(signal);
        return await new Promise<never>(() => undefined);
      }),
      headRoute: vi.fn(),
      postJson: vi.fn(),
      tokenProvider: {
        accessToken: vi.fn(async () => token()),
        invalidate: vi.fn(),
      },
    });
    const pending = createFiveNorthReferenceHumanWalletPreflight(
      {
        keyFile: "/workspace/.capability-wallet/payer.key",
        network: NETWORK,
        signal: new AbortController().signal,
        workspaceRoot: "/workspace",
      },
      dependencies(transport),
    );
    const rejection = expect(pending).rejects.toThrow(/deadline/iu);

    try {
      await vi.advanceTimersByTimeAsync(10_001);
      await rejection;
      expect(operationSignals).toHaveLength(1);
      expect(operationSignals[0]?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("bounds a hung isolated profile read with the same deadline", async () => {
    vi.useFakeTimers({ now: new Date("2026-07-13T10:00:00.000Z") });
    const createHttp = vi.fn();
    const pending = createFiveNorthReferenceHumanWalletPreflight(
      {
        keyFile: "/workspace/.capability-wallet/payer.key",
        network: NETWORK,
        signal: new AbortController().signal,
        workspaceRoot: "/workspace",
      },
      {
        createHttp,
        readProfile: async () => await new Promise<never>(() => undefined),
      },
    );
    const rejection = expect(pending).rejects.toThrow(/deadline/iu);

    try {
      await vi.advanceTimersByTimeAsync(10_001);
      await rejection;
      expect(createHttp).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels a hung isolated profile read immediately", async () => {
    const controller = new AbortController();
    const pending = createFiveNorthReferenceHumanWalletPreflight(
      {
        keyFile: "/workspace/.capability-wallet/payer.key",
        network: NETWORK,
        signal: controller.signal,
        workspaceRoot: "/workspace",
      },
      {
        createHttp: vi.fn(),
        readProfile: async () => await new Promise<never>(() => undefined),
      },
    );
    const rejection = expect(pending).rejects.toThrow(/cancelled/iu);

    controller.abort("private reason");
    await rejection;
  });
});
