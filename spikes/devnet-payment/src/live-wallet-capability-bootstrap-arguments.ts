import { isAbsolute } from "node:path";

const VALUE_FLAGS = [
  "--expected-fingerprint",
  "--expires-at",
  "--instrument-admin",
  "--key-file",
  "--payer-party",
  "--policy-file",
  "--resource-hash",
  "--synchronizer-id",
  "--transfer-factory-contract-id",
] as const;
const FINGERPRINT = /^1220[0-9a-f]{64}$/u;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const CONTRACT_ID = /^00[0-9a-f]{64,510}$/u;
const DSO = /^DSO::1220[0-9a-f]{64}$/u;
const SYNCHRONIZER = /^global-domain::1220[0-9a-f]{64}$/u;

export type LiveWalletCapabilityBootstrapArguments = Readonly<{
  expectedFingerprint: string;
  expiresAt: string;
  instrumentAdmin: string;
  keyFile: string;
  payerParty: string;
  policyFile: string;
  resourceHash: `sha256:${string}`;
  synchronizerId: string;
  transferFactoryContractId: string;
}>;

export function parseLiveWalletCapabilityBootstrapArguments(
  arguments_: ReadonlyArray<string>,
): LiveWalletCapabilityBootstrapArguments {
  if (arguments_.length !== VALUE_FLAGS.length * 2) {
    throw new Error("live wallet capability required arguments are missing");
  }
  const values = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 2) {
    const name = arguments_[index]!;
    const value = arguments_[index + 1]!;
    if (
      !(VALUE_FLAGS as readonly string[]).includes(name) ||
      values.has(name) ||
      value === "" ||
      value.startsWith("--")
    ) {
      throw new Error("live wallet capability arguments are invalid");
    }
    values.set(name, value);
  }
  const expectedFingerprint = values.get("--expected-fingerprint")!;
  const expiresAt = values.get("--expires-at")!;
  const instrumentAdmin = values.get("--instrument-admin")!;
  const keyFile = values.get("--key-file")!;
  const payerParty = values.get("--payer-party")!;
  const policyFile = values.get("--policy-file")!;
  const resourceHash = values.get("--resource-hash")!;
  const synchronizerId = values.get("--synchronizer-id")!;
  const transferFactoryContractId = values.get(
    "--transfer-factory-contract-id",
  )!;
  if (
    !FINGERPRINT.test(expectedFingerprint) ||
    payerParty !== `sotto-external-payer::${expectedFingerprint}` ||
    !DSO.test(instrumentAdmin) ||
    !SHA256.test(resourceHash) ||
    !SYNCHRONIZER.test(synchronizerId) ||
    !CONTRACT_ID.test(transferFactoryContractId) ||
    !isAbsolute(keyFile) ||
    !isAbsolute(policyFile) ||
    new Date(Date.parse(expiresAt)).toISOString() !== expiresAt
  ) {
    throw new Error("live wallet capability arguments are invalid");
  }
  return Object.freeze({
    expectedFingerprint,
    expiresAt,
    instrumentAdmin,
    keyFile,
    payerParty,
    policyFile,
    resourceHash: resourceHash as `sha256:${string}`,
    synchronizerId,
    transferFactoryContractId,
  });
}
