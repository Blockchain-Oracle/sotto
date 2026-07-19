import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { readFiveNorthNetworkConfig } from "../../spikes/devnet-payment/src/config.js";
import { readinessParty } from "../../spikes/devnet-payment/src/five-north-capability-readiness-validation.js";
import { recoverHumanPurchase } from "../../spikes/devnet-payment/src/human-purchase-recovery.js";

const workspaceRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
loadEnvFile(resolve(workspaceRoot, ".env.local"));

try {
  const result = await recoverHumanPurchase({
    network: readFiveNorthNetworkConfig(process.env),
    operationId:
      "sha256:1fe4760aa7c66acebda2bf898c3deace878a229cf9dd34e904cf4467099ed41a",
    providerParty: readinessParty(
      process.env.PROVIDER_PARTY,
      "human provider",
      true,
    ),
    signal: new AbortController().signal,
    sourceCommit: "85cb16e54c4253c7b68c9767c17d6cfbc342d930",
    workspaceRoot,
  });
  console.log(JSON.stringify(result));
} catch (error) {
  const cause = error instanceof Error ? error.cause : undefined;
  console.error(
    JSON.stringify({
      cause:
        cause instanceof Error
          ? { message: cause.message, name: cause.name }
          : cause === undefined
            ? null
            : String(cause),
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : "UnknownError",
    }),
  );
  process.exitCode = 1;
}
