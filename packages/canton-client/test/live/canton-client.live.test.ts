import { describe, expect, it } from "vitest";
import {
  createFiveNorthClient,
  createFiveNorthTokenProvider,
  readFiveNorthAccessTokenSubject,
  readFiveNorthNetworkConfig,
} from "../../src/index.js";

const REQUIRED_ENVIRONMENT = [
  "FIVE_NORTH_LEDGER_URL",
  "FIVE_NORTH_OIDC_AUDIENCE",
  "FIVE_NORTH_OIDC_CLIENT_ID",
  "FIVE_NORTH_OIDC_CLIENT_SECRET",
  "FIVE_NORTH_OIDC_ISSUER_URL",
  "FIVE_NORTH_OIDC_SCOPE",
  "FIVE_NORTH_OIDC_TOKEN_URL",
  "FIVE_NORTH_VALIDATOR_URL",
  "PAYER_PARTY",
] as const;

const missing = REQUIRED_ENVIRONMENT.filter(
  (name) => (process.env[name] ?? "").trim() === "",
);
if (missing.length > 0) {
  console.warn(
    `SKIPPED: no Five North credentials — set ${missing.join(", ")} to run the canton-client live read-only checks`,
  );
}

describe.skipIf(missing.length > 0)(
  "Five North live read-only checks (no spend, no submission)",
  () => {
    it(
      "mints an OIDC token with a bounded JWT subject",
      { timeout: 60_000 },
      async () => {
        const network = readFiveNorthNetworkConfig(process.env);
        const tokens = createFiveNorthTokenProvider(
          network,
          fetch,
          new AbortController().signal,
        );
        const subject = readFiveNorthAccessTokenSubject(
          await tokens.accessToken(),
        );
        expect(subject.length).toBeGreaterThan(0);
      },
    );

    it("reads the ledger end offset", { timeout: 60_000 }, async () => {
      const network = readFiveNorthNetworkConfig(process.env);
      const offset = await createFiveNorthClient(network).getLedgerEnd();
      expect(Number.isSafeInteger(offset)).toBe(true);
      expect(offset).toBeGreaterThanOrEqual(0);
    });

    it(
      "reads holding contracts for the payer party",
      { timeout: 60_000 },
      async () => {
        const network = readFiveNorthNetworkConfig(process.env);
        const payer = (process.env.PAYER_PARTY ?? "").trim();
        const client = createFiveNorthClient(network);
        const offset = await client.getLedgerEnd();
        const contracts = await client.postLedger(
          "/v2/state/active-contracts",
          {
            filter: {
              filtersByParty: {
                [payer]: {
                  cumulative: [
                    {
                      identifierFilter: {
                        InterfaceFilter: {
                          value: {
                            interfaceId:
                              "#splice-api-token-holding-v1:Splice.Api.Token.HoldingV1:Holding",
                            includeCreatedEventBlob: false,
                            includeInterfaceView: true,
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
            verbose: false,
            activeAtOffset: offset,
          },
        );
        expect(Array.isArray(contracts)).toBe(true);
      },
    );
  },
);
