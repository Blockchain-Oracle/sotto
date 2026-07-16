import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { runReferenceWalletApproval } from "./reference-wallet.js";
import { readReferenceWalletPolicy } from "./reference-wallet-policy.js";

export async function confirmReferenceWalletApproval(input: {
  approved: boolean;
  handoffId: string;
  present: (summary: string) => void | Promise<void>;
  prompt: (question: string) => Promise<string>;
  summary: string;
}): Promise<void> {
  await input.present(input.summary);
  if (!input.approved) return;
  const answer = await input.prompt(
    `Type the exact handoff ID ${input.handoffId} to approve: `,
  );
  if (answer !== input.handoffId) {
    throw new Error("reference wallet approval confirmation did not match");
  }
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

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const rootDirectory = flag("--root");
  const handoffId = flag("--handoff-id");
  const keyFile = flag("--key-file");
  const policyFile = flag("--policy-file");
  const approve = process.argv.includes("--approve");
  const policyAuthorized = process.argv.includes("--policy-authorized");
  const reject = process.argv.includes("--reject");
  const decisions = [approve, policyAuthorized, reject].filter(Boolean).length;
  if (
    rootDirectory === undefined ||
    handoffId === undefined ||
    policyFile === undefined ||
    decisions !== 1 ||
    ((approve || policyAuthorized) && keyFile === undefined)
  ) {
    throw new Error(
      "usage: reference-wallet --root DIR --handoff-id ID --policy-file FILE ((--approve | --policy-authorized) --key-file FILE | --reject)",
    );
  }
  const base = {
    handoffId,
    presentSummary: (summary: string) =>
      policyAuthorized
        ? console.log(summary)
        : confirmReferenceWalletApproval({
            approved: approve,
            handoffId,
            present: (value) => console.log(value),
            prompt: terminalPrompt,
            summary,
          }),
    rootDirectory,
    walletPolicy: await readReferenceWalletPolicy(policyFile),
  };
  const response = await runReferenceWalletApproval(
    policyAuthorized
      ? {
          ...base,
          approved: true,
          authorization: { mode: "policy", policyFile },
          keyFile: keyFile!,
        }
      : approve
        ? {
            ...base,
            approved: true,
            authorization: { mode: "interactive" },
            keyFile: keyFile!,
          }
        : { ...base, approved: false },
  );
  console.log(JSON.stringify({ outcome: response.outcome }));
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  void main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "reference wallet failed",
    );
    process.exitCode = 1;
  });
}
