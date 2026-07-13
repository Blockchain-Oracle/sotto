const ERROR_RESPONSE_LIMIT = 65_536;
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_.-]{0,63}$/u;

async function cancelBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

async function boundedBytes(
  response: Response,
  maximumBytes: number,
): Promise<Uint8Array> {
  const declared = response.headers.get("content-length");
  if (declared !== null) {
    if (!/^(?:0|[1-9]\d*)$/u.test(declared)) {
      await cancelBody(response);
      throw new Error("Five North response content-length is invalid");
    }
    const declaredBytes = Number(declared);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes > maximumBytes) {
      await cancelBody(response);
      throw new Error("Five North response exceeds byte limit");
    }
  }
  if (response.body === null) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let complete = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        complete = true;
        break;
      }
      total += value.byteLength;
      if (total > maximumBytes) {
        throw new Error("Five North response exceeds byte limit");
      }
      chunks.push(value);
    }
    const output = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return output;
  } finally {
    if (!complete) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function failureCode(bytes: Uint8Array): string {
  try {
    const value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return "";
    }
    const record = value as Record<string, unknown>;
    const code = [record.code, record.error, record.status].find(
      (candidate): candidate is string => typeof candidate === "string",
    );
    return code !== undefined && ERROR_CODE_PATTERN.test(code) ? code : "";
  } catch {
    return "";
  }
}

export async function readFiveNorthResponse(
  response: Response,
  maximumBytes: number,
): Promise<Uint8Array> {
  const bytes = await boundedBytes(
    response,
    response.ok ? maximumBytes : ERROR_RESPONSE_LIMIT,
  );
  if (!response.ok) {
    const code = failureCode(bytes);
    throw new Error(
      `Five North request failed with HTTP ${response.status}${code === "" ? "" : ` (${code})`}`,
    );
  }
  return bytes;
}

export function parseFiveNorthJson(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}
