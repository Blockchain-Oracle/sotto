import type { HumanReconciliationReadOnlyAdapter } from "../src/index.js";
import { assertStrictJson } from "../../x402-canton/src/strict-json.js";
import {
  LOCAL_RECONCILIATION_PATH,
  MAXIMUM_RECONCILIATION_REQUEST_BYTES,
  MAXIMUM_RECONCILIATION_RESPONSE_BYTES,
  RECONCILIATION_TRANSPORT_TIMEOUT_MS,
  requireBoundedContentLength,
} from "./human-reconciliation-http-contract.postgres.fixture.js";

async function responseBytes(response: Response): Promise<Uint8Array> {
  requireBoundedContentLength(
    response.headers.get("content-length") ?? undefined,
    MAXIMUM_RECONCILIATION_RESPONSE_BYTES,
  );
  if (response.body === null) throw new Error("local response body is absent");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let complete = false;
  try {
    while (true) {
      const current = await reader.read();
      if (current.done) {
        complete = true;
        break;
      }
      total += current.value.byteLength;
      if (total > MAXIMUM_RECONCILIATION_RESPONSE_BYTES) {
        throw new Error("local reconciliation response is too large");
      }
      chunks.push(current.value);
    }
  } finally {
    if (!complete) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export function createBoundedLocalReconciliationAdapter(
  endpoint: string,
): HumanReconciliationReadOnlyAdapter {
  const url = new URL(endpoint);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    url.port === "" ||
    url.pathname !== LOCAL_RECONCILIATION_PATH ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error("local reconciliation endpoint is invalid");
  }
  return async (request, options) => {
    const body = JSON.stringify(request);
    if (
      Buffer.byteLength(body, "utf8") > MAXIMUM_RECONCILIATION_REQUEST_BYTES
    ) {
      throw new Error("local reconciliation request is too large");
    }
    const response = await fetch(url, {
      body,
      headers: { "content-type": "application/json" },
      method: "POST",
      redirect: "error",
      signal: AbortSignal.any([
        options.signal,
        AbortSignal.timeout(RECONCILIATION_TRANSPORT_TIMEOUT_MS),
      ]),
    });
    if (
      response.status !== 200 ||
      response.headers.get("content-type") !== "application/json"
    ) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error("local reconciliation response is invalid");
    }
    const source = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    }).decode(await responseBytes(response));
    assertStrictJson(source, 64, 65_536);
    return JSON.parse(source) as unknown;
  };
}
