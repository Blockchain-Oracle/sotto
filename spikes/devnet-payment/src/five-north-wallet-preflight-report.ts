import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { chmod, mkdir, open, realpath, rename, unlink } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import {
  FIVE_NORTH_WALLET_PREFLIGHT_VERSION,
  type FiveNorthWalletPreflightResult,
} from "./five-north-wallet-preflight.js";

const REPORT_NAME = "2026-07-15-five-north-wallet-preflight.md";
const SOURCE_COMMIT = /^[0-9a-f]{40}$/u;
const SUBJECT_HASH = /^sha256:[0-9a-f]{64}$/u;
const WRITE_FLAGS =
  constants.O_WRONLY |
  constants.O_CREAT |
  constants.O_EXCL |
  constants.O_NOFOLLOW;

type Input = Readonly<{
  observedAt: string;
  result: FiveNorthWalletPreflightResult;
  sourceCommit: string;
  workspaceRoot: string;
}>;

function canonicalTime(value: string): string {
  if (new Date(value).toISOString() !== value) {
    throw new Error("wallet preflight report time is invalid");
  }
  return value;
}

function validateResult(result: FiveNorthWalletPreflightResult): void {
  if (
    result.version !== FIVE_NORTH_WALLET_PREFLIGHT_VERSION ||
    (result.verdict !== "SUPPORTED" && result.verdict !== "UNSUPPORTED") ||
    !SUBJECT_HASH.test(result.subjectHash) ||
    !Array.isArray(result.reasons) ||
    typeof result.checks !== "object" ||
    result.checks === null ||
    Object.values(result.checks).some((value) => typeof value !== "boolean")
  ) {
    throw new Error("wallet preflight report result is invalid");
  }
}

function reportContents(input: Input): string {
  validateResult(input.result);
  if (!SOURCE_COMMIT.test(input.sourceCommit)) {
    throw new Error("wallet preflight report source commit is invalid");
  }
  const checks = Object.entries(input.result.checks)
    .map(([name, passed]) => `- ${name}: \`${passed ? "PASS" : "FAIL"}\``)
    .join("\n");
  const reasons =
    input.result.reasons.length === 0
      ? "- None"
      : input.result.reasons.map((reason) => `- ${reason}`).join("\n");
  return `# Five North Wallet Preflight — 2026-07-15

- Source commit: \`${input.sourceCommit}\`
- Observed at: \`${canonicalTime(input.observedAt)}\`
- Version: \`${input.result.version}\`
- Subject hash: \`${input.result.subjectHash}\`
- Verdict: \`${input.result.verdict}\`

## Checks

${checks}

## Reasons

${reasons}

## Boundary

This was a read-only Five North preflight. It did not allocate a Party, sign or
execute a transaction, grant a right, submit a command, or move funds. Raw
tokens, user IDs, Party IDs, topology bytes, public keys, and private keys are
intentionally absent.
`;
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(
    directory,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function writeFiveNorthWalletPreflightReport(
  input: Input,
): Promise<string> {
  const root = resolve(input.workspaceRoot);
  if ((await realpath(root)) !== root) {
    throw new Error("wallet preflight workspace must not be symbolic");
  }
  const directory = join(root, ".thoughts", "research");
  await mkdir(directory, { mode: 0o700, recursive: true });
  await chmod(directory, 0o700);
  const resolvedDirectory = await realpath(directory);
  if (!resolvedDirectory.startsWith(`${root}${sep}`)) {
    throw new Error("wallet preflight report directory escapes workspace");
  }
  const target = join(resolvedDirectory, REPORT_NAME);
  const temporary = join(
    resolvedDirectory,
    `.${REPORT_NAME}.${process.pid}-${randomUUID()}.tmp`,
  );
  try {
    const handle = await open(temporary, WRITE_FLAGS, 0o600);
    try {
      await handle.writeFile(reportContents(input), "utf8");
      await handle.chmod(0o600);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, target);
    await chmod(target, 0o600);
    await syncDirectory(resolvedDirectory);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
  return target;
}
