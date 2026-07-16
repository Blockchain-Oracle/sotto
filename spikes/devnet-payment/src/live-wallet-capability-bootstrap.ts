import { loadEnvFile } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  createReferenceWalletConnector,
  createWalletHandoffStorage,
  recomputeReferenceWalletPreparedHash,
} from "@sotto/capability-wallet";
import {
  SOTTO_CONTROL_PACKAGE_ID,
  type BoundedCapabilityBootstrapRequest,
} from "@sotto/x402-canton";
import { readCapabilityBootstrapCompletion } from "./capability-bootstrap-completion.js";
import { readCleanSourceCheckpoint } from "./clean-source-checkpoint.js";
import { readSpikeConfig } from "./config.js";
import { createFiveNorthCapabilityCompletionPageReader } from "./five-north-capability-completion-transport.js";
import { createFiveNorthCapabilityExecuteTransport } from "./five-north-capability-execute-transport.js";
import { createFiveNorthPrepareTransport } from "./five-north-prepare-transport.js";
import { createFiveNorthTokenProvider } from "./five-north-token.js";
import { startFiveNorthWalletCapabilityBootstrap } from "./five-north-wallet-capability-bootstrap.js";
import { createFiveNorthWalletCapabilityTransport } from "./five-north-wallet-capability-transport.js";
import {
  createReferenceWalletInteractiveExchange,
  readReferenceWalletChildIdentity,
  registeredReferenceWalletKeyResolver,
} from "./reference-wallet-child-process.js";
import { parseLiveWalletCapabilityBootstrapArguments } from "./live-wallet-capability-bootstrap-arguments.js";

export { parseLiveWalletCapabilityBootstrapArguments };

function ledgerOffset(value: unknown): number {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("live wallet capability ledger end is invalid");
  }
  const offset = (value as Record<string, unknown>).offset;
  if (!Number.isSafeInteger(offset) || (offset as number) < 0) {
    throw new Error("live wallet capability ledger offset is invalid");
  }
  return offset as number;
}

async function main(): Promise<void> {
  const input = parseLiveWalletCapabilityBootstrapArguments(
    process.argv.slice(2),
  );
  const workspaceRoot = resolve(
    fileURLToPath(new URL("../../..", import.meta.url)),
  );
  const sourceCommit = await readCleanSourceCheckpoint(workspaceRoot);
  loadEnvFile(resolve(workspaceRoot, ".env.local"));
  const config = readSpikeConfig(process.env);
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  try {
    const prepareTransport = createFiveNorthPrepareTransport(
      config.network,
      input.payerParty,
      { signal: controller.signal },
    );
    const tokenProvider = createFiveNorthTokenProvider(
      config.network,
      fetch,
      controller.signal,
    );
    const readPage = createFiveNorthCapabilityCompletionPageReader({
      fetcher: fetch,
      ledgerUrl: config.network.ledgerUrl,
      payerParty: input.payerParty,
      signal: controller.signal,
      tokenProvider,
    });
    const readLedgerEndOffset = async () =>
      ledgerOffset(await prepareTransport.readLedgerEnd());
    const readCompletion = (
      beginExclusive: number,
      request: BoundedCapabilityBootstrapRequest,
    ) =>
      readCapabilityBootstrapCompletion({
        beginExclusive,
        readLedgerEndOffset,
        readPage,
        request,
      });
    const execute = createFiveNorthCapabilityExecuteTransport(config.network, {
      signal: controller.signal,
    }).execute;
    const transport = createFiveNorthWalletCapabilityTransport({
      execute,
      prepareTransport,
      readCompletion,
    });
    const walletRoot = resolve(workspaceRoot, ".capability-wallet");
    const identity = await readReferenceWalletChildIdentity({
      expectedFingerprint: input.expectedFingerprint,
      keyFile: input.keyFile,
      signal: controller.signal,
      workspaceRoot,
    });
    const connectorId = "wallet-sdk-reference";
    const connectorOrigin = "wallet://sotto-reference";
    const connector = createReferenceWalletConnector({
      capabilities: {
        connectorId,
        connectorKind: "wallet-sdk",
        explicitApproval: true,
        hashingSchemeVersions: ["HASHING_SCHEME_VERSION_V2"],
        networks: ["canton:devnet"],
        origin: connectorOrigin,
        packageIds: [SOTTO_CONTROL_PACKAGE_ID],
        payerParty: input.payerParty,
        preparedTransactionSigning: true,
        signatureFormats: ["SIGNATURE_FORMAT_CONCAT"],
        signingAlgorithms: ["SIGNING_ALGORITHM_SPEC_ED25519"],
        version: "sotto-capability-wallet-capabilities-v1",
      },
      exchange: createReferenceWalletInteractiveExchange({
        keyFile: input.keyFile,
        policyFile: input.policyFile,
        rootDirectory: walletRoot,
        workspaceRoot,
      }),
      storage: await createWalletHandoffStorage({ rootDirectory: walletRoot }),
    });
    const result = await startFiveNorthWalletCapabilityBootstrap({
      approval: {
        agentParty: config.policy.agentParty,
        expiresAt: input.expiresAt,
        instrumentAdmin: input.instrumentAdmin,
        payerParty: input.payerParty,
        providerParty: config.provider.party,
        resourceHash: input.resourceHash,
        synchronizerId: input.synchronizerId,
        transferFactoryContractId: input.transferFactoryContractId,
      },
      ports: {
        ...transport,
        connector,
        connectorId,
        connectorOrigin,
        recomputeOfficialHash: recomputeReferenceWalletPreparedHash,
        resolveRegisteredPublicKey: registeredReferenceWalletKeyResolver({
          identity,
          payerParty: input.payerParty,
        }),
        signal: controller.signal,
        timeoutMilliseconds: 60_000,
      },
      sourceCommit,
      workspaceRoot,
    });
    process.stdout.write(
      `${JSON.stringify({
        result,
        schema: "sotto-live-wallet-capability-bootstrap-v1",
        status: "OBSERVED",
      })}\n`,
    );
  } finally {
    controller.abort();
    process.removeListener("SIGINT", abort);
    process.removeListener("SIGTERM", abort);
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  void main().catch(() => {
    console.error("Five North wallet capability bootstrap failed");
    process.exitCode = 1;
  });
}
