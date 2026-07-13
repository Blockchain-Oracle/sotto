import { commitHttpRequest } from "@sotto/x402-canton";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

export type SettlementProof = Readonly<{
  attemptId: `sha256:${string}`;
  requestCommitment: `sha256:${string}`;
  updateId: string;
}>;

type ProviderConfig = Readonly<{
  amount: string;
  dsoParty: string;
  maxTimeoutSeconds: number;
  payerParty: string;
  providerParty: string;
  resourceUrl: string;
  synchronizerId: string;
  verifySettlement: (proof: SettlementProof) => Promise<boolean>;
}>;

const sha256Reference = /^sha256:[0-9a-f]{64}$/;
const updateId = /^1220[0-9a-f]{64}$/;

function parseSettlementProof(value: string): SettlementProof {
  if (Buffer.byteLength(value, "utf8") > 4_096) {
    throw new Error("PAYMENT-SIGNATURE exceeds 4096 bytes");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64").toString("utf8"));
  } catch {
    throw new Error("PAYMENT-SIGNATURE must contain base64-encoded JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Settlement proof must be an object");
  }
  const proof = parsed as Record<string, unknown>;
  if (
    typeof proof.attemptId !== "string" ||
    !sha256Reference.test(proof.attemptId) ||
    typeof proof.requestCommitment !== "string" ||
    !sha256Reference.test(proof.requestCommitment) ||
    typeof proof.updateId !== "string" ||
    !updateId.test(proof.updateId)
  ) {
    throw new Error("Settlement proof fields are invalid");
  }
  return proof as SettlementProof;
}

export function encodeSettlementProof(proof: SettlementProof): string {
  return Buffer.from(JSON.stringify(proof), "utf8").toString("base64");
}

function challengeResponse(config: ProviderConfig): Response {
  const binding = commitHttpRequest({ method: "GET", url: config.resourceUrl });
  const challenge = {
    x402Version: 2,
    accepts: [
      {
        scheme: "exact",
        network: "canton:devnet",
        amount: config.amount,
        asset: "CC",
        payTo: config.providerParty,
        maxTimeoutSeconds: config.maxTimeoutSeconds,
        extra: {
          assetTransferMethod: "amulet-rules-transfer",
          executeBeforeSeconds: config.maxTimeoutSeconds,
          feePayer: config.payerParty,
          instrumentId: { admin: config.dsoParty, id: "Amulet" },
          memo: binding.commitment,
          synchronizerId: config.synchronizerId,
        },
      },
    ],
    resource: {
      description: "Sotto Five North paid weather evidence",
      mimeType: "application/json",
      url: config.resourceUrl,
    },
  };
  return new Response(JSON.stringify({ error: "payment_required" }), {
    headers: {
      "content-type": "application/json",
      "PAYMENT-REQUIRED": Buffer.from(JSON.stringify(challenge)).toString(
        "base64",
      ),
    },
    status: 402,
  });
}

export function createPaidResourceHandler(config: ProviderConfig) {
  const configuredUrl = new URL(config.resourceUrl).toString();
  const requestCommitment = commitHttpRequest({
    method: "GET",
    url: configuredUrl,
  }).commitment;
  return async (request: Request): Promise<Response> => {
    if (request.method !== "GET" || request.url !== configuredUrl) {
      return new Response("Not found", { status: 404 });
    }
    const header = request.headers.get("PAYMENT-SIGNATURE");
    if (header === null) {
      return challengeResponse(config);
    }
    let proof: SettlementProof;
    try {
      proof = parseSettlementProof(header);
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error ? error.message : "Invalid settlement proof",
        },
        { status: 400 },
      );
    }
    if (
      proof.requestCommitment !== requestCommitment ||
      !(await config.verifySettlement(proof))
    ) {
      return challengeResponse(config);
    }
    return Response.json({
      paid: true,
      result: { condition: "clear", temperatureCelsius: 24 },
      settlement: { attemptId: proof.attemptId, updateId: proof.updateId },
    });
  };
}

type ProviderServerInput = Readonly<{
  handler: (request: Request) => Promise<Response>;
  port: number;
  resourceUrl: string;
}>;

export async function startPaidProvider(input: ProviderServerInput) {
  const publicUrl = new URL(input.resourceUrl);
  const server = createServer(async (incoming, outgoing) => {
    try {
      if (incoming.method !== "GET") {
        outgoing.writeHead(405).end();
        return;
      }
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) {
          for (const item of value) headers.append(name, item);
        } else if (value !== undefined) {
          headers.set(name, value);
        }
      }
      const requestUrl = new URL(incoming.url ?? "/", publicUrl.origin);
      const response = await input.handler(
        new Request(requestUrl, { headers, method: "GET" }),
      );
      const body = new Uint8Array(await response.arrayBuffer());
      if (body.byteLength > 2_000_000) {
        throw new Error("Provider response exceeds 2000000 bytes");
      }
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, name) => {
        responseHeaders[name] = value;
      });
      outgoing.writeHead(response.status, responseHeaders).end(body);
    } catch {
      outgoing.writeHead(500, { "content-type": "application/json" });
      outgoing.end(JSON.stringify({ error: "provider_failure" }));
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(input.port, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return {
    localUrl: `http://127.0.0.1:${address.port}${publicUrl.pathname}${publicUrl.search}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) =>
          error === undefined ? resolve() : reject(error),
        );
      }),
  } as const;
}
