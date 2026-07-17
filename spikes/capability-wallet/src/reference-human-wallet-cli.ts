import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { runReferenceHumanWalletApproval } from "./reference-human-wallet-runner.js";

const HANDOFF_ID = /^[0-9a-f]{64}$/u;

type CliArguments =
  | Readonly<{
      approved: false;
      handoffId: string;
      rootDirectory: string;
    }>
  | Readonly<{
      approved: true;
      handoffId: string;
      keyFile: string;
      rootDirectory: string;
    }>;

type CliDependencies = Readonly<{
  present: (summary: string) => void | Promise<void>;
  prompt: (question: string) => Promise<string>;
  runApproval?: typeof runReferenceHumanWalletApproval;
}>;

const USAGE =
  "usage: reference-human-wallet --root DIR --handoff-id ID (--approve --key-file FILE | --reject)";

function readArguments(arguments_: readonly string[]): CliArguments {
  const values = new Map<string, string>();
  const decisions = new Set<string>();
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!;
    if (argument === "--approve" || argument === "--reject") {
      if (decisions.has(argument)) throw new Error(USAGE);
      decisions.add(argument);
      continue;
    }
    if (
      argument !== "--root" &&
      argument !== "--handoff-id" &&
      argument !== "--key-file"
    ) {
      throw new Error(USAGE);
    }
    const value = arguments_[index + 1];
    if (
      value === undefined ||
      value === "" ||
      value.startsWith("--") ||
      values.has(argument)
    ) {
      throw new Error(USAGE);
    }
    values.set(argument, value);
    index += 1;
  }
  const rootDirectory = values.get("--root");
  const handoffId = values.get("--handoff-id");
  const keyFile = values.get("--key-file");
  const approved = decisions.has("--approve");
  if (
    rootDirectory === undefined ||
    handoffId === undefined ||
    !HANDOFF_ID.test(handoffId) ||
    decisions.size !== 1 ||
    (approved ? keyFile === undefined : keyFile !== undefined)
  ) {
    throw new Error(USAGE);
  }
  return approved
    ? Object.freeze({ approved, handoffId, keyFile: keyFile!, rootDirectory })
    : Object.freeze({ approved, handoffId, rootDirectory });
}

export async function confirmReferenceHumanWalletApproval(input: {
  handoffId: string;
  present: (summary: string) => void | Promise<void>;
  prompt: (question: string) => Promise<string>;
  summary: string;
}): Promise<void> {
  await input.present(input.summary);
  const answer = await input.prompt(
    `Type the exact handoff ID ${input.handoffId} to approve: `,
  );
  if (answer !== input.handoffId) {
    throw new Error(
      "reference human wallet approval confirmation did not match",
    );
  }
}

export async function runReferenceHumanWalletCli(
  arguments_: readonly string[],
  dependencies: CliDependencies,
): Promise<"approved" | "rejected"> {
  const parsed = readArguments(arguments_);
  const presentSummary = parsed.approved
    ? (summary: string) =>
        confirmReferenceHumanWalletApproval({
          handoffId: parsed.handoffId,
          present: dependencies.present,
          prompt: dependencies.prompt,
          summary,
        })
    : async (summary: string) => dependencies.present(summary);
  const runApproval =
    dependencies.runApproval ?? runReferenceHumanWalletApproval;
  const response = await runApproval({ ...parsed, presentSummary });
  return response.outcome;
}

async function terminalPrompt(question: string): Promise<string> {
  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return await terminal.question(question);
  } finally {
    terminal.close();
  }
}

async function main(): Promise<void> {
  const outcome = await runReferenceHumanWalletCli(process.argv.slice(2), {
    present: (summary) => console.log(summary),
    prompt: terminalPrompt,
  });
  console.log(JSON.stringify({ outcome }));
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  void main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "reference human wallet failed",
    );
    process.exitCode = 1;
  });
}
