import { createHash } from "node:crypto";
import { loadEnvFile } from "node:process";
import { readFiveNorthNetworkConfig } from "../../spikes/devnet-payment/src/config.js";
import { approveFiveNorthPrepareNetwork } from "../../spikes/devnet-payment/src/five-north-prepare-network.js";
import { readFiveNorthResponse } from "../../spikes/devnet-payment/src/five-north-response.js";
import { createFiveNorthTokenProvider } from "../../spikes/devnet-payment/src/five-north-token.js";

const packageId = process.argv[2]!;
if (!/^[0-9a-f]{64}$/u.test(packageId))
  throw new Error("package ID is invalid");
loadEnvFile(".env.local");
const controller = new AbortController();
const network = approveFiveNorthPrepareNetwork(
  readFiveNorthNetworkConfig(process.env),
);
const token = await createFiveNorthTokenProvider(
  network,
  fetch,
  controller.signal,
).accessToken();
const response = await fetch(
  `${network.ledgerUrl}/v2/packages/${encodeURIComponent(packageId)}`,
  {
    headers: { authorization: `Bearer ${token}` },
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  },
);
const bytes = await readFiveNorthResponse(response, 4 * 1024 * 1024);
controller.abort();
const digest = createHash("sha256").update(bytes).digest("hex");
process.stdout.write(
  `${JSON.stringify({
    byteLength: bytes.byteLength,
    contentType: response.headers.get("content-type"),
    hashMatchesPackageId: digest === packageId,
    status: response.status,
  })}\n`,
);
