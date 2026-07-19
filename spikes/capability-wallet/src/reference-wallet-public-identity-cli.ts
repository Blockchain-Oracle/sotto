import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  readReferenceWalletPublicIdentity,
  type ReferenceWalletPublicIdentity,
} from "./reference-wallet-public-identity.js";

const FINGERPRINT = /^1220[0-9a-f]{64}$/u;

type Dependencies = Readonly<{
  readIdentity: (keyFile: string) => Promise<ReferenceWalletPublicIdentity>;
}>;

function value(arguments_: ReadonlyArray<string>, name: string): string {
  const index = arguments_.indexOf(name);
  if (
    index < 0 ||
    arguments_.lastIndexOf(name) !== index ||
    arguments_[index + 1] === undefined ||
    arguments_[index + 1]!.startsWith("--")
  ) {
    throw new Error("reference wallet identity arguments are invalid");
  }
  return arguments_[index + 1]!;
}

export async function runReferenceWalletPublicIdentityCli(
  arguments_: ReadonlyArray<string>,
  dependencies: Dependencies = {
    readIdentity: readReferenceWalletPublicIdentity,
  },
): Promise<ReferenceWalletPublicIdentity> {
  if (
    arguments_.length !== 4 ||
    arguments_.some(
      (entry, index) => index % 2 === 0 && !entry.startsWith("--"),
    )
  ) {
    throw new Error("reference wallet identity arguments are invalid");
  }
  const keyFile = value(arguments_, "--key-file");
  const expected = value(arguments_, "--expected-fingerprint");
  if (!FINGERPRINT.test(expected)) {
    throw new Error("reference wallet fingerprint approval is invalid");
  }
  const identity = await dependencies.readIdentity(keyFile);
  if (identity.fingerprint !== expected) {
    throw new Error("reference wallet fingerprint does not match approval");
  }
  return identity;
}

async function main(): Promise<void> {
  process.stdout.write(
    `${JSON.stringify(
      await runReferenceWalletPublicIdentityCli(process.argv.slice(2)),
    )}\n`,
  );
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  void main().catch(() => {
    console.error("Reference wallet identity command failed");
    process.exitCode = 1;
  });
}
