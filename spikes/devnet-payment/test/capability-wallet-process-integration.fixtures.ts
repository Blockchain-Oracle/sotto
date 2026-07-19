import { PreparedTransaction } from "@canton-network/core-ledger-proto";
import {
  buildBoundedCapabilityBootstrap,
  createPreparedCapabilityBootstrapObserver,
  projectPreparedCapabilityBootstrapApproval,
  verifyPreparedCapabilityBootstrapHash,
  type BoundedCapabilityBootstrapRequest,
  type CapabilityWalletCapabilities,
  type HashVerifiedPreparedCapabilityBootstrap,
  type PreparedCapabilityBootstrapApproval,
} from "@sotto/x402-canton";
import { buildBoundedCapabilityBootstrapPrepareRequest } from "@sotto/x402-canton/internal/bounded-capability-bootstrap-prepare";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { validPreparedCapabilityBootstrapFromPrepare } from "../../../packages/x402-canton/test/prepared-capability-bootstrap.fixtures.js";

const CONNECTOR_ID = "wallet-sdk-process-reference";
const CONNECTOR_ORIGIN = "wallet://process-reference";
const PROCESS_OUTPUT_LIMIT = 1_048_576;

async function runProcess(
  args: string[],
  input?: string | null,
  signal?: AbortSignal,
) {
  const child = spawn(process.execPath, args, {
    cwd: resolve("spikes/capability-wallet"),
    stdio: ["pipe", "pipe", "pipe"],
  });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  let bytes = 0;
  const capture = (target: Buffer[]) => (value: Buffer) => {
    bytes += value.byteLength;
    if (bytes > PROCESS_OUTPUT_LIMIT) child.kill("SIGKILL");
    else target.push(Buffer.from(value));
  };
  child.stdout.on("data", capture(stdout));
  child.stderr.on("data", capture(stderr));
  const abort = () => child.kill("SIGTERM");
  signal?.addEventListener("abort", abort, { once: true });
  if (input === undefined) child.stdin.end();
  else if (input !== null) child.stdin.end(input);
  const code = await new Promise<number | null>((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", resolveExit);
  });
  signal?.removeEventListener("abort", abort);
  const result = {
    stderr: Buffer.concat(stderr).toString("utf8"),
    stdout: Buffer.concat(stdout).toString("utf8"),
  };
  if (signal?.aborted) throw new Error("wallet child process cancelled");
  if (bytes > PROCESS_OUTPUT_LIMIT) {
    throw new Error("wallet child process exceeded output limit");
  }
  if (code !== 0) throw new Error("wallet child process failed");
  return result;
}

async function walletSdkPreparedHash(value: Uint8Array): Promise<Uint8Array> {
  const script = [
    'import { SDK } from "@canton-network/wallet-sdk";',
    'import { PreparedTransaction } from "@canton-network/core-ledger-proto";',
    'import { readFileSync } from "node:fs";',
    'const source = readFileSync(0, "utf8");',
    'const bytes = Buffer.from(source, "base64");',
    "const decoded = PreparedTransaction.fromBinary(bytes);",
    "if (decoded.transaction === undefined) throw new Error(`prepared child transaction missing at ${bytes.length} bytes`);",
    "const hash = await SDK.createOffline().utils.hash.preparedTransaction(decoded);",
    "console.log(hash.toHex());",
  ].join("\n");
  const result = await runProcess(
    ["--input-type=module", "-e", script],
    Buffer.from(value).toString("base64"),
  );
  const hex = result.stdout.trim();
  if (!/^[0-9a-f]{64}$/u.test(hex)) {
    throw new Error("wallet SDK child hash is invalid");
  }
  return new Uint8Array(Buffer.from(hex, "hex"));
}

export async function generateProcessWalletKey(parent: string) {
  const walletDirectory = join(parent, "wallet-owned");
  const keyFile = join(walletDirectory, "payer.key");
  await mkdir(walletDirectory, { mode: 0o700 });
  const script = [
    'import { SDK } from "@canton-network/wallet-sdk";',
    'import { writeFile } from "node:fs/promises";',
    "const sdk = SDK.createOffline();",
    "const keys = sdk.keys.generate();",
    'await writeFile(process.argv.at(-1), Buffer.from(keys.privateKey, "base64"), { flag: "wx", mode: 0o600 });',
    "const fingerprint = await sdk.keys.fingerprint(keys.publicKey);",
    "console.log(JSON.stringify({ fingerprint, publicKey: keys.publicKey }));",
  ].join("\n");
  const result = await runProcess([
    "--input-type=module",
    "-e",
    script,
    keyFile,
  ]);
  const publicIdentity = JSON.parse(result.stdout) as {
    fingerprint: string;
    publicKey: string;
  };
  return { keyFile, publicIdentity, walletDirectory };
}

type ProcessPreparedCapability = Readonly<{
  approval: PreparedCapabilityBootstrapApproval;
  capabilities: CapabilityWalletCapabilities;
  prepared: HashVerifiedPreparedCapabilityBootstrap;
  request: BoundedCapabilityBootstrapRequest;
}>;

export async function createProcessPreparedCapability(): Promise<ProcessPreparedCapability> {
  const now = Date.now();
  const request = buildBoundedCapabilityBootstrap({
    agentParty: "sotto-process-agent::1220participant",
    allowedRecipient: "sotto-process-provider::1220participant",
    allowedResourceHash: `sha256:${"a".repeat(64)}`,
    expiresAt: new Date(now + 3_600_000).toISOString(),
    instrument: { admin: "DSO::1220dso", id: "Amulet" },
    maximumTotalDebitAtomic: "3250000000",
    network: "canton:devnet",
    payerParty: "sotto-process-payer::1220participant",
    perCallLimitAtomic: "2500000000",
    remainingAllowanceAtomic: "10000000000",
    synchronizerId: "global-domain::1220synchronizer",
    transferFactoryContractId: `00${"2".repeat(64)}`,
    userId: "ledger-user-6",
  });
  const prepareRequest = buildBoundedCapabilityBootstrapPrepareRequest(request);
  const fixture = validPreparedCapabilityBootstrapFromPrepare(prepareRequest);
  const createNode = fixture.transaction?.nodes[0]?.versionedNode;
  if (
    createNode?.oneofKind !== "v1" ||
    createNode.v1.nodeType.oneofKind !== "create"
  ) {
    throw new Error("process capability fixture create is absent");
  }
  createNode.v1.nodeType.create.contractId = `00${"1".repeat(64)}`;
  const preparationTime = BigInt(now + 1_000) * 1_000n;
  fixture.metadata!.preparationTime = preparationTime;
  fixture.metadata!.minLedgerEffectiveTime = preparationTime;
  const preparedTransaction = PreparedTransaction.toBinary(fixture, {
    writeUnknownFields: false,
  });
  const digest = await walletSdkPreparedHash(preparedTransaction);
  const observation = await createPreparedCapabilityBootstrapObserver(
    async () =>
      new TextEncoder().encode(
        JSON.stringify({
          costEstimation: null,
          hashingDetails: null,
          hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
          preparedTransaction:
            Buffer.from(preparedTransaction).toString("base64"),
          preparedTransactionHash: Buffer.from(digest).toString("base64"),
        }),
      ),
  )(request);
  const prepared = await verifyPreparedCapabilityBootstrapHash(observation, {
    recomputeOfficialHash: walletSdkPreparedHash,
  });
  const approval = projectPreparedCapabilityBootstrapApproval(prepared);
  const capabilities: CapabilityWalletCapabilities = Object.freeze({
    connectorId: CONNECTOR_ID,
    connectorKind: "wallet-sdk",
    explicitApproval: true,
    hashingSchemeVersions: Object.freeze([
      "HASHING_SCHEME_VERSION_V2" as const,
    ]),
    networks: Object.freeze([approval.network]),
    origin: CONNECTOR_ORIGIN,
    packageIds: Object.freeze([approval.packageId]),
    payerParty: approval.payerParty,
    preparedTransactionSigning: true,
    signatureFormats: Object.freeze(["SIGNATURE_FORMAT_CONCAT" as const]),
    signingAlgorithms: Object.freeze([
      "SIGNING_ALGORITHM_SPEC_ED25519" as const,
    ]),
    version: "sotto-capability-wallet-capabilities-v1",
  });
  return { approval, capabilities, prepared, request };
}

export async function writeProcessWalletPolicy(
  path: string,
  approval: Awaited<
    ReturnType<typeof createProcessPreparedCapability>
  >["approval"],
  signingFingerprint: string,
  policyAuthorized = false,
) {
  const identity = {
    agentParty: approval.agentParty,
    connectorId: CONNECTOR_ID,
    connectorOrigin: CONNECTOR_ORIGIN,
    instrumentAdmin: approval.instrument.admin,
    instrumentId: approval.instrument.id,
    network: approval.network,
    packageId: approval.packageId,
    payerParty: approval.payerParty,
    signingFingerprint,
    synchronizerId: approval.synchronizerId,
    templateId: approval.templateId,
    transferFactoryContractId: approval.transferFactoryContractId,
  };
  const policy = policyAuthorized
    ? {
        ...identity,
        approvalMode: "policy",
        authorizationId: `sha256:${"c".repeat(64)}`,
        maximumApprovals: 1,
        maximumCapabilityLifetimeSeconds: 3_600,
        maximumTotalDebitAtomic: approval.limits.maximumTotalDebitAtomic,
        perCallLimitAtomic: approval.limits.perCallLimitAtomic,
        recipientParty: approval.recipientParty,
        remainingAllowanceAtomic: approval.limits.remainingAllowanceAtomic,
        resourceHash: approval.resourceHash,
        revision: approval.revision,
        validUntil: new Date(Date.now() + 10 * 60_000).toISOString(),
        version: "sotto-reference-wallet-policy-v2",
      }
    : identity;
  const canonical = Object.fromEntries(
    Object.entries(policy).sort(([left], [right]) =>
      Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")),
    ),
  );
  await writeFile(path, JSON.stringify(canonical), {
    flag: "wx",
    mode: 0o600,
  });
}

export function runReferenceWalletProcess(input: {
  approveInput?: boolean;
  approvalMode?: "interactive" | "policy";
  handoffId: string;
  keyFile: string;
  policyFile: string;
  rootDirectory: string;
  signal: AbortSignal;
}) {
  const cli = resolve("spikes/capability-wallet/dist/reference-wallet-cli.js");
  const approvalFlag =
    input.approvalMode === "policy" ? "--policy-authorized" : "--approve";
  return runProcess(
    [
      cli,
      "--root",
      input.rootDirectory,
      "--handoff-id",
      input.handoffId,
      "--policy-file",
      input.policyFile,
      approvalFlag,
      "--key-file",
      input.keyFile,
    ],
    input.approvalMode === "policy"
      ? undefined
      : input.approveInput === false
        ? null
        : `${input.handoffId}\n`,
    input.signal,
  );
}
