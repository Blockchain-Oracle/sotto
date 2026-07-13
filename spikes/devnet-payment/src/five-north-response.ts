const ERROR_RESPONSE_LIMIT = 65_536;

function sanitizedDiagnostic(value: string): string {
  return [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f ? " " : character;
    })
    .join("");
}

async function boundedBytes(
  response: Response,
  maximumBytes: number,
): Promise<Uint8Array> {
  const declared = response.headers.get("content-length");
  if (declared !== null && Number(declared) > maximumBytes) {
    throw new Error("Five North response exceeds byte limit");
  }
  if (response.body === null) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new Error("Five North response exceeds byte limit");
    }
    chunks.push(value);
  }
  return new Uint8Array(Buffer.concat(chunks, total));
}

function failureDetail(bytes: Uint8Array): string {
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
    const message = [
      record.message,
      record.cause,
      record.error_description,
    ].find((candidate): candidate is string => typeof candidate === "string");
    return sanitizedDiagnostic(
      [code, message].filter(Boolean).join(": "),
    ).slice(0, 500);
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
    const detail = failureDetail(bytes);
    throw new Error(
      `Five North request failed with HTTP ${response.status}${detail === "" ? "" : ` (${detail})`}`,
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
