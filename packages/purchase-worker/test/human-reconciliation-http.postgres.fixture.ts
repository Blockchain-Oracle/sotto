import { once } from "node:events";
import { createServer, type IncomingMessage } from "node:http";
import type { HumanReconciliationProbeRequest } from "../src/index.js";
import { assertStrictJson } from "../../x402-canton/src/strict-json.js";
import {
  LOCAL_RECONCILIATION_PATH,
  MAXIMUM_RECONCILIATION_REQUEST_BYTES,
  MAXIMUM_RECONCILIATION_RESPONSE_BYTES,
  requireBoundedContentLength,
} from "./human-reconciliation-http-contract.postgres.fixture.js";
const PROBE_KEYS = [
  "beginExclusive",
  "commandId",
  "payerParty",
  "providerParty",
  "submissionId",
  "synchronizerId",
  "userId",
] as const;

async function requestBytes(request: IncomingMessage): Promise<Uint8Array> {
  requireBoundedContentLength(
    request.headers["content-length"],
    MAXIMUM_RECONCILIATION_REQUEST_BYTES,
  );
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const candidate of request) {
    const chunk = Buffer.from(candidate);
    total += chunk.byteLength;
    if (total > MAXIMUM_RECONCILIATION_REQUEST_BYTES) {
      request.destroy();
      throw new Error("local reconciliation request is too large");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}

function probeRequest(bytes: Uint8Array): HumanReconciliationProbeRequest {
  const source = new TextDecoder("utf-8", {
    fatal: true,
    ignoreBOM: true,
  }).decode(bytes);
  assertStrictJson(source, 8, 32);
  const candidate = JSON.parse(source) as Record<string, unknown>;
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    Array.isArray(candidate) ||
    JSON.stringify(Object.keys(candidate).sort()) !==
      JSON.stringify([...PROBE_KEYS].sort()) ||
    !Number.isSafeInteger(candidate.beginExclusive) ||
    (candidate.beginExclusive as number) < 0 ||
    PROBE_KEYS.slice(1).some(
      (key) =>
        typeof candidate[key] !== "string" ||
        (candidate[key] as string).length === 0,
    )
  ) {
    throw new Error("local reconciliation probe is invalid");
  }
  return Object.freeze({
    beginExclusive: candidate.beginExclusive as number,
    commandId: candidate.commandId as string,
    payerParty: candidate.payerParty as string,
    providerParty: candidate.providerParty as string,
    submissionId: candidate.submissionId as string,
    synchronizerId: candidate.synchronizerId as string,
    userId: candidate.userId as string,
  });
}

export async function createBoundedLocalReconciliationEndpoint(
  read: (request: HumanReconciliationProbeRequest) => Promise<unknown>,
) {
  const requests: HumanReconciliationProbeRequest[] = [];
  const server = createServer(
    {
      headersTimeout: 5_000,
      keepAliveTimeout: 1_000,
      maxHeaderSize: 8_192,
      requestTimeout: 5_000,
    },
    async (request, response) => {
      try {
        if (
          request.method !== "POST" ||
          request.url !== LOCAL_RECONCILIATION_PATH ||
          request.headers["content-type"] !== "application/json" ||
          ["authorization", "cookie", "payment-signature", "x-api-key"].some(
            (name) => request.headers[name] !== undefined,
          )
        ) {
          throw new Error("local reconciliation request identity is invalid");
        }
        const probe = probeRequest(await requestBytes(request));
        requests.push(probe);
        const body = JSON.stringify(await read(probe));
        if (
          Buffer.byteLength(body, "utf8") >
          MAXIMUM_RECONCILIATION_RESPONSE_BYTES
        ) {
          throw new Error("local reconciliation result is too large");
        }
        response.writeHead(200, {
          connection: "close",
          "content-length": Buffer.byteLength(body, "utf8"),
          "content-type": "application/json",
        });
        response.end(body);
      } catch {
        if (!response.headersSent) response.writeHead(500);
        response.end();
      }
    },
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("local reconciliation endpoint is absent");
  }
  return Object.freeze({
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
    requestCount: () => requests.length,
    requests: () => Object.freeze([...requests]),
    url: `http://127.0.0.1:${address.port}${LOCAL_RECONCILIATION_PATH}`,
  });
}
