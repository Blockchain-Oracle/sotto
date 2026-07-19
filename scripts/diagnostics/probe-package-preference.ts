import { loadEnvFile } from "node:process";
import { readSpikeConfig } from "../../spikes/devnet-payment/src/config.js";
import { createFiveNorthTokenProvider } from "../../spikes/devnet-payment/src/five-north-token.js";

loadEnvFile(new URL("../../.env.local", import.meta.url));
const config = readSpikeConfig(process.env);
const controller = new AbortController();
const token = await createFiveNorthTokenProvider(
  config.network,
  fetch,
  controller.signal,
).accessToken();
const payer =
  "sotto-external-payer::1220e5e6be928d5264069d480d0c30198236a71e2af7d42f519841483fc83fe8b012";
const agent = config.policy.agentParty;
const provider = config.provider.party;
const admin =
  "DSO::1220be58c29e65de40bf273be1dc2b266d43a9a002ea5b18955aeef7aac881bb471a";
const cases = {
  agent: [agent],
  provider: [provider],
  admin: [admin],
  payer: [payer],
  payerAgent: [payer, agent],
  payerAgentProvider: [payer, agent, provider],
  all: [payer, agent, provider, admin],
};
try {
  for (const [name, parties] of Object.entries(cases)) {
    const response = await fetch(
      `${config.network.ledgerUrl}/v2/interactive-submission/preferred-packages`,
      {
        body: JSON.stringify({
          packageVettingRequirements: ["sotto-control", "splice-amulet"].map(
            (packageName) => ({ packageName, parties }),
          ),
          synchronizerId:
            "global-domain::1220be58c29e65de40bf273be1dc2b266d43a9a002ea5b18955aeef7aac881bb471a",
          vettingValidAt: new Date(Date.now() + 5_000).toISOString(),
        }),
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        method: "POST",
      },
    );
    const payload = await response.json().catch(() => null);
    const code =
      typeof payload === "object" && payload !== null && "code" in payload
        ? payload.code
        : null;
    process.stdout.write(
      `${JSON.stringify({ code, name, status: response.status })}\n`,
    );
  }
} finally {
  controller.abort();
}
