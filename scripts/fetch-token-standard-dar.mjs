import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_ROOT =
  "https://raw.githubusercontent.com/canton-network/splice/f9d605c84498384ec2d5138d62af2f40b14882ff/daml/dars";
const ARTIFACTS = [
  {
    file: "splice-api-token-holding-v1-1.0.0.dar",
    sha256: "ef75f8eb41a65810221784fdb78bb9dfac7cb22245aba14fa7cb7f69c34e0175",
  },
  {
    file: "splice-api-token-metadata-v1-1.0.0.dar",
    sha256: "455eb160cb5abd4ae9918a6fbb9dad471f721adda39f0e5c76feef08d05637fc",
  },
  {
    file: "splice-api-token-transfer-instruction-v1-1.0.0.dar",
    sha256: "e4c73aa7ae73fb2fc330b938ffb99f568792321640ba4b9472902aa8d742c994",
  },
];
const MAX_BYTES = 1_048_576;
const root = dirname(dirname(fileURLToPath(import.meta.url)));

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function verifiedExisting(artifact, destination) {
  try {
    const bytes = await readFile(destination);
    if (bytes.byteLength > MAX_BYTES || digest(bytes) !== artifact.sha256) {
      throw new Error(`Cached ${artifact.file} failed its pinned SHA-256`);
    }
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function verifyArtifact(artifact) {
  const destination = join(root, ".cache", "daml", artifact.file);
  if (await verifiedExisting(artifact, destination)) return;

  const response = await fetch(`${SOURCE_ROOT}/${artifact.file}`, {
    redirect: "error",
  });
  if (!response.ok) {
    throw new Error(
      `${artifact.file} download failed: HTTP ${response.status}`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) {
    throw new Error(`${artifact.file} exceeds ${MAX_BYTES} bytes`);
  }
  if (digest(bytes) !== artifact.sha256) {
    throw new Error(`${artifact.file} failed its pinned SHA-256`);
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

await Promise.all(ARTIFACTS.map(verifyArtifact));
for (const artifact of ARTIFACTS) {
  process.stdout.write(`${artifact.file} verified: ${artifact.sha256}\n`);
}
