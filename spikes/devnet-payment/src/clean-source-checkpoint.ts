import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isAbsolute } from "node:path";

type Execute = (arguments_: readonly string[]) => Promise<string>;
const execFileAsync = promisify(execFile);

async function executeGit(arguments_: readonly string[]): Promise<string> {
  const result = await execFileAsync("git", [...arguments_], {
    encoding: "utf8",
    maxBuffer: 1_048_576,
  });
  return result.stdout;
}

export async function readCleanSourceCheckpoint(
  workspaceRoot: string,
  execute: Execute = executeGit,
): Promise<string> {
  if (!isAbsolute(workspaceRoot)) {
    throw new Error("source checkpoint workspace root must be absolute");
  }
  const head = (
    await execute(["-C", workspaceRoot, "rev-parse", "HEAD"])
  ).trim();
  if (!/^[0-9a-f]{40}$/u.test(head)) {
    throw new Error("source checkpoint requires a full Git SHA-1");
  }
  const status = await execute([
    "-C",
    workspaceRoot,
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);
  if (status !== "") {
    throw new Error("source checkpoint requires a clean working tree");
  }
  return head;
}
