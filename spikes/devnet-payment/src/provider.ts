import { commitHttpRequest } from "@sotto/x402-canton";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createInMemoryProviderDeliveryClaims } from "./provider-delivery-claim.js";
import {
  encodeSettlementProof,
  parseSettlementProofHeader,
  type SettlementProof,
} from "./provider-settlement-proof.js";

const FORCE_CLOSE_AFTER_MS = 1_000;
const CLOSE_GIVE_UP_AFTER_MS = 3_000;

export { encodeSettlementProof, type SettlementProof };

type ProviderConfig = Readonly<{
  amount: string;
  assetTransferMethod?: "amulet-rules-transfer" | "transfer-factory";
  deliverPaidResource?: (proof: SettlementProof) => Promise<Response>;
  dsoParty: string;
  maxTimeoutSeconds: number;
  payerParty: string;
  providerParty: string;
  resourceUrl: string;
  synchronizerId: string;
  verifySettlement: (proof: SettlementProof) => Promise<boolean>;
}>;

function challengeResponse(
  config: ProviderConfig,
  assetTransferMethod: "amulet-rules-transfer" | "transfer-factory",
): Response {
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
          assetTransferMethod,
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
  const deliveryClaims = createInMemoryProviderDeliveryClaims();
  const assetTransferMethod =
    config.assetTransferMethod ?? "amulet-rules-transfer";
  if (
    assetTransferMethod !== "amulet-rules-transfer" &&
    assetTransferMethod !== "transfer-factory"
  ) {
    throw new Error("Provider asset transfer method is invalid");
  }
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
      return challengeResponse(config, assetTransferMethod);
    }
    let proof: SettlementProof;
    try {
      proof = parseSettlementProofHeader(header);
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error ? error.message : "Invalid settlement proof",
        },
        { status: 400 },
      );
    }
    if (proof.requestCommitment !== requestCommitment) {
      return challengeResponse(config, assetTransferMethod);
    }
    const response = await deliveryClaims.claim(proof, {
      verify: () => config.verifySettlement(proof),
      deliver: () => {
        if (config.deliverPaidResource !== undefined) {
          return config.deliverPaidResource(proof);
        }
        return Promise.resolve(
          Response.json({
            paid: true,
            result: { condition: "clear", temperatureCelsius: 24 },
            settlement: {
              attemptId: proof.attemptId,
              updateId: proof.updateId,
            },
          }),
        );
      },
    });
    return response ?? challengeResponse(config, assetTransferMethod);
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
        let settled = false;
        const finish = (error?: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(forceTimer);
          clearTimeout(giveUpTimer);
          if (error === undefined) {
            resolve();
          } else {
            reject(error);
          }
        };
        const forceTimer = setTimeout(() => {
          server.closeAllConnections();
        }, FORCE_CLOSE_AFTER_MS);
        const giveUpTimer = setTimeout(finish, CLOSE_GIVE_UP_AFTER_MS);
        server.close((error) => finish(error));
      }),
  } as const;
}
