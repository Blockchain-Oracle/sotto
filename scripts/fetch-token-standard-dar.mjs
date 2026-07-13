import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FILE = "splice-api-token-transfer-instruction-v1-1.0.0.dar";
const EXPECTED_SHA256 =
  "e4c73aa7ae73fb2fc330b938ffb99f568792321640ba4b9472902aa8d742c994";
const SOURCE =
  "https://raw.githubusercontent.com/canton-network/splice/f9d605c84498384ec2d5138d62af2f40b14882ff/daml/dars/splice-api-token-transfer-instruction-v1-1.0.0.dar";
const MAX_BYTES = 1_048_576;
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const destination = join(root, ".cache", "daml", FILE);

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function verifiedExisting() {
  try {
    const bytes = await readFile(destination);
    if (bytes.byteLength > MAX_BYTES || digest(bytes) !== EXPECTED_SHA256) {
      throw new Error(`Cached ${FILE} failed its pinned SHA-256`);
    }
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

if (!(await verifiedExisting())) {
  const response = await fetch(SOURCE, { redirect: "error" });
  if (!response.ok) {
    throw new Error(
      `Token Standard DAR download failed: HTTP ${response.status}`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) {
    throw new Error(`Token Standard DAR exceeds ${MAX_BYTES} bytes`);
  }
  if (digest(bytes) !== EXPECTED_SHA256) {
    throw new Error("Downloaded Token Standard DAR failed its pinned SHA-256");
  }
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, bytes, { flag: "wx" });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}

process.stdout.write(`Token Standard DAR verified: ${EXPECTED_SHA256}\n`);
