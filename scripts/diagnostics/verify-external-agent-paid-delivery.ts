import { loadEnvFile } from "node:process";
import { readSpikeConfig } from "../../spikes/devnet-payment/src/config.js";
import {
  encodeSettlementProof,
  type SettlementProof,
} from "../../spikes/devnet-payment/src/provider.js";

loadEnvFile(new URL("../../.env.local", import.meta.url));
const resourceUrl = readSpikeConfig(process.env).provider.resourceUrl;
const proof: SettlementProof = {
  attemptId:
    "sha256:b2bfdc417cb1de5ee12bc3cb15b024ff6f99f691661ae891bd16355679631efa",
  requestCommitment:
    "sha256:433bf6865292680d4110afefb16d9281721da2cd86476fa2e2a3759673372fe8",
  updateId:
    "1220a389588fc2b677ce956c03af93f65ce537b29aea244e815022cde54b492811e3",
};

async function retry(candidate: SettlementProof) {
  const response = await fetch(resourceUrl, {
    headers: { "PAYMENT-SIGNATURE": encodeSettlementProof(candidate) },
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  return {
    body: Buffer.from(await response.arrayBuffer()).toString("base64"),
    contentType: response.headers.get("content-type"),
    status: response.status,
  } as const;
}

const mutation = await retry({
  ...proof,
  attemptId: `sha256:${"0".repeat(64)}`,
});
const exact = await retry(proof);
const cached = await retry(proof);
if (
  mutation.status !== 402 ||
  exact.status !== 200 ||
  JSON.stringify(cached) !== JSON.stringify(exact)
) {
  throw new Error("paid delivery verifier did not fail closed");
}
process.stdout.write(
  `${JSON.stringify({ cachedResponseIdentical: true, exactStatus: exact.status, mutationStatus: mutation.status, secondPaymentSubmitted: false })}\n`,
);
