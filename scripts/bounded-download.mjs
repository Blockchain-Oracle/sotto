import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";

function tooLarge(label, maximumBytes) {
  return new Error(`${label} exceeds ${maximumBytes} bytes`);
}

export async function readBoundedFile(path, maximumBytes) {
  const label = basename(path);
  const metadata = await stat(path);
  if (metadata.size > maximumBytes) throw tooLarge(label, maximumBytes);

  const bytes = await readFile(path);
  if (bytes.byteLength > maximumBytes) throw tooLarge(label, maximumBytes);
  return bytes;
}

export async function readBoundedResponse(response, maximumBytes, label) {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) {
      throw new Error(`${label} has invalid content-length`);
    }
    if (Number(declaredLength) > maximumBytes) {
      throw tooLarge(label, maximumBytes);
    }
  }
  if (response.body === null) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw tooLarge(label, maximumBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
