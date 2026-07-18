import {
  createCapabilityWalletSigningSession,
  verifyCapabilityWalletSignature,
} from "@sotto/x402-canton";
import {
  createReferenceWalletConnector,
  createWalletHandoffStorage,
} from "../../capability-wallet/src/index.js";
import {
  lstat,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFiveNorthCapabilityExecuteTransport } from "../src/five-north-capability-execute-transport.js";
import {
  createProcessPreparedCapability,
  generateProcessWalletKey,
  runReferenceWalletProcess,
  writeProcessWalletPolicy,
} from "./capability-wallet-process-integration.fixtures.js";

const cleanups: string[] = [];
afterEach(async () => {
  await Promise.all(
    cleanups
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true })),
  );
});

async function processScenario(
  exchange: (input: {
    handoffId: string;
    keyFile: string;
    policyFile: string;
    rootDirectory: string;
    signal: AbortSignal;
  }) => Promise<unknown>,
  policyAuthorized = false,
) {
  const parent = await realpath(
    await mkdtemp(join(tmpdir(), "sotto-wallet-process-")),
  );
  cleanups.push(parent);
  const handoffRoot = join(parent, ".capability-wallet");
  const storage = await createWalletHandoffStorage({
    rootDirectory: handoffRoot,
  });
  const { keyFile, publicIdentity } = await generateProcessWalletKey(parent);
  const prepared = await createProcessPreparedCapability();
  const policyFile = join(parent, "wallet-policy.json");
  await writeProcessWalletPolicy(
    policyFile,
    prepared.approval,
    publicIdentity.fingerprint,
    policyAuthorized,
  );
  const connector = createReferenceWalletConnector({
    capabilities: prepared.capabilities,
    exchange: async (handoffId, { signal }) => {
      await exchange({
        handoffId,
        keyFile,
        policyFile,
        rootDirectory: handoffRoot,
        signal,
      });
    },
    storage,
  });
  return { connector, keyFile, parent, policyFile, prepared, publicIdentity };
}

async function signingSession(
  scenario: Awaited<ReturnType<typeof processScenario>>,
  signal?: AbortSignal,
  prepared = scenario.prepared.prepared,
) {
  return createCapabilityWalletSigningSession({
    connector: scenario.connector,
    connectorId: scenario.prepared.capabilities.connectorId,
    connectorOrigin: scenario.prepared.capabilities.origin,
    prepared,
    ...(signal === undefined ? {} : { signal }),
    timeoutMilliseconds: 10_000,
  });
}

async function mutatePolicy(
  path: string,
  mutate: (policy: Record<string, unknown>) => void,
): Promise<void> {
  const policy = JSON.parse(await readFile(path, "utf8")) as Record<
    string,
    unknown
  >;
  mutate(policy);
  const canonical = Object.fromEntries(
    Object.entries(policy).sort(([left], [right]) =>
      Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")),
    ),
  );
  await writeFile(path, JSON.stringify(canonical));
}

type PolicyMutation = (policy: Record<string, unknown>) => void;

describe("separate-process capability wallet", { timeout: 30_000 }, () => {
  it("signs from one exact policy without terminal input", async () => {
    const scenario = await processScenario(async (input) => {
      await runReferenceWalletProcess({
        ...input,
        approvalMode: "policy",
      });
    }, true);

    await expect(signingSession(scenario)).resolves.toMatchObject({
      outcome: "approved",
    });
    const claims = (await readdir(scenario.parent)).filter((name) =>
      name.startsWith(".used-reference-wallet-policy-"),
    );
    expect(claims).toHaveLength(1);
    expect((await lstat(join(scenario.parent, claims[0]!))).mode & 0o777).toBe(
      0o600,
    );

    const replay = await createProcessPreparedCapability();
    await expect(
      signingSession(scenario, undefined, replay.prepared),
    ).rejects.toThrow(/approval failed/iu);
  });

  const policyMutations: ReadonlyArray<readonly [string, PolicyMutation]> = [
    [
      "recipient",
      (policy) => {
        policy.recipientParty = "sotto-attacker::1220participant";
      },
    ],
    [
      "resource",
      (policy) => {
        policy.resourceHash = `sha256:${"d".repeat(64)}`;
      },
    ],
    [
      "limit",
      (policy) => {
        policy.perCallLimitAtomic = "2400000000";
      },
    ],
    [
      "lifetime",
      (policy) => {
        policy.maximumCapabilityLifetimeSeconds = 300;
      },
    ],
    [
      "expiry",
      (policy) => {
        policy.validUntil = new Date(Date.now() - 1).toISOString();
      },
    ],
  ];

  it.each(policyMutations)(
    "rejects a mismatched policy %s without a claim",
    async (_name, mutate) => {
      const scenario = await processScenario(async (input) => {
        await runReferenceWalletProcess({
          ...input,
          approvalMode: "policy",
        });
      }, true);
      await mutatePolicy(scenario.policyFile, mutate);

      await expect(signingSession(scenario)).rejects.toThrow(
        /approval failed/iu,
      );
      expect(
        (await readdir(scenario.parent)).filter((name) =>
          name.startsWith(".used-reference-wallet-policy-"),
        ),
      ).toEqual([]);
    },
  );

  it("verifies the real child-process signature and reaches execute", async () => {
    const outputs: string[] = [];
    const scenario = await processScenario(async (input) => {
      const result = await runReferenceWalletProcess(input);
      outputs.push(result.stdout, result.stderr);
    });
    const session = await signingSession(scenario);
    const verified = await verifyCapabilityWalletSignature(session, {
      resolveRegisteredPublicKey: async () => ({
        fingerprint: scenario.publicIdentity.fingerprint,
        publicKey: scenario.publicIdentity.publicKey,
        publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW",
      }),
    });
    let ledgerCalls = 0;
    const transport = createFiveNorthCapabilityExecuteTransport(
      {
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
      },
      {
        fetcher: async (url) => {
          if (
            url === "https://auth.sandbox.fivenorth.io/application/o/token/"
          ) {
            const subject = Buffer.from(
              JSON.stringify({ sub: scenario.prepared.request.userId }),
            ).toString("base64url");
            return Response.json({
              access_token: `header.${subject}.signature`,
              expires_in: 28_800,
            });
          }
          ledgerCalls += 1;
          return Response.json({});
        },
        signal: new AbortController().signal,
      },
    );
    await expect(
      transport.execute(verified, async () => undefined),
    ).resolves.toMatchObject({ outcome: "submitted" });
    expect(ledgerCalls).toBe(1);
    expect(outputs.join("\n")).not.toMatch(/privateKey|test-secret/iu);
    expect((await lstat(scenario.keyFile)).size).toBe(64);
    expect((await lstat(scenario.keyFile)).mode & 0o777).toBe(0o600);
  });

  it("cancels the waiting child without reaching execute", async () => {
    const controller = new AbortController();
    const execute = vi.fn();
    const scenario = await processScenario(async (input) => {
      setTimeout(() => controller.abort(), 100);
      await runReferenceWalletProcess({ ...input, approveInput: false });
    });

    await expect(signingSession(scenario, controller.signal)).rejects.toThrow(
      /approval failed|cancelled/iu,
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects a mutated handoff without reaching execute", async () => {
    const execute = vi.fn();
    const scenario = await processScenario(async (input) => {
      const path = join(input.rootDirectory, `${input.handoffId}.request.json`);
      const artifact = JSON.parse(await readFile(path, "utf8")) as {
        payload: { request: { preparedTransactionHash: string } };
      };
      artifact.payload.request.preparedTransactionHash = `sha256:${"0".repeat(64)}`;
      await writeFile(path, JSON.stringify(artifact), { mode: 0o600 });
      await runReferenceWalletProcess(input);
    });

    await expect(signingSession(scenario)).rejects.toThrow(/approval failed/iu);
    expect(execute).not.toHaveBeenCalled();
  });
});
