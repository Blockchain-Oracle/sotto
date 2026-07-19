import { link, lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { MAX_PREPARE_RESPONSE_BYTES } from "@sotto/x402-canton";

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

async function requireRealDirectory(path: string): Promise<void> {
  let status;
  try {
    status = await lstat(path);
  } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error;
    try {
      await mkdir(path, { mode: 0o700 });
    } catch (mkdirError) {
      if (errorCode(mkdirError) !== "EEXIST") throw mkdirError;
    }
    status = await lstat(path);
  }
  if (status.isSymbolicLink()) {
    throw new Error("local prepare artifact path contains a symlink");
  }
  if (!status.isDirectory()) {
    throw new Error("local prepare artifact parent is not a directory");
  }
}

async function resolveArtifactTarget(
  workspaceRoot: string,
  requestedPath: string,
): Promise<string> {
  const workspace = await realpath(workspaceRoot);
  const tmpRoot = join(workspace, "tmp");
  await requireRealDirectory(tmpRoot);
  const target = resolve(workspace, requestedPath);
  const child = relative(tmpRoot, target);
  if (
    child === "" ||
    child === ".." ||
    child.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(child)
  ) {
    throw new Error("local prepare artifact must stay below workspace tmp");
  }
  let parent = tmpRoot;
  const parentRelative = relative(tmpRoot, dirname(target));
  for (const segment of parentRelative.split(/[\\/]/u).filter(Boolean)) {
    parent = join(parent, segment);
    await requireRealDirectory(parent);
  }
  return target;
}

export async function persistLocalPrepareArtifact(
  workspaceRoot: string,
  requestedPath: string,
  bytes: Uint8Array,
): Promise<void> {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength === 0 ||
    bytes.byteLength > MAX_PREPARE_RESPONSE_BYTES
  ) {
    throw new Error("local prepare artifact bytes are invalid");
  }
  const target = await resolveArtifactTarget(workspaceRoot, requestedPath);
  try {
    await lstat(target);
    throw new Error("local prepare artifact already exists");
  } catch (error) {
    if (error instanceof Error && error.message.includes("already exists")) {
      throw error;
    }
    if (errorCode(error) !== "ENOENT") throw error;
  }
  const temporary = join(
    dirname(target),
    `.${basename(target)}.${randomUUID()}.tmp`,
  );
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    try {
      await link(temporary, target);
    } catch (error) {
      if (errorCode(error) === "EEXIST") {
        throw new Error("local prepare artifact already exists", {
          cause: error,
        });
      }
      throw error;
    }
  } finally {
    await handle?.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
  }
}
