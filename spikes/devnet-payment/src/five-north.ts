import type { SpikeConfig } from "./config.js";
import type {
  OpenMiningRound,
  PayerHolding,
  ScanContract,
} from "./settlement.js";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

async function boundedJson(response: Response): Promise<unknown> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 2_000_000) {
    throw new Error("Five North response exceeds 2000000 bytes");
  }
  const text = new TextDecoder().decode(bytes);
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    if (!response.ok) {
      throw new Error(`Five North request failed with HTTP ${response.status}`);
    }
    throw new Error("Five North response is not JSON");
  }
  if (!response.ok) {
    const failure =
      typeof payload === "object" && payload !== null && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    const code = [failure.code, failure.error, failure.status].find(
      (value): value is string => typeof value === "string",
    );
    const message = [
      failure.message,
      failure.cause,
      failure.error_description,
    ].find((value): value is string => typeof value === "string");
    const detail = [code, message].filter(Boolean).join(": ").slice(0, 500);
    throw new Error(
      `Five North request failed with HTTP ${response.status}${detail === "" ? "" : ` (${detail})`}`,
    );
  }
  return payload;
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function createFiveNorthClient(
  network: SpikeConfig["network"],
  fetcher: Fetcher = fetch,
) {
  let cachedToken: Promise<string> | undefined;

  async function accessToken(): Promise<string> {
    cachedToken ??= (async () => {
      const form = new URLSearchParams({
        audience: network.audience,
        client_id: network.clientId,
        client_secret: network.clientSecret,
        grant_type: "client_credentials",
        scope: network.scope,
      });
      const response = await fetcher(network.tokenUrl, {
        body: form,
        headers: { "content-type": "application/x-www-form-urlencoded" },
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
      const payload = objectValue(await boundedJson(response), "OIDC response");
      if (typeof payload.access_token !== "string") {
        throw new Error("OIDC response requires access_token");
      }
      return payload.access_token;
    })();
    return cachedToken;
  }

  async function ledgerPost(path: string, body: unknown): Promise<unknown> {
    const token = await accessToken();
    return boundedJson(
      await fetcher(`${network.ledgerUrl}${path}`, {
        body: JSON.stringify(body),
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      }),
    );
  }

  async function authorizedGet(url: string): Promise<unknown> {
    const token = await accessToken();
    return boundedJson(
      await fetcher(url, {
        headers: { authorization: `Bearer ${token}` },
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      }),
    );
  }

  function userIdFromToken(token: string): string {
    const payloadPart = token.split(".")[1];
    if (payloadPart === undefined) {
      throw new Error("OIDC access token is not a JWT");
    }
    const payload = objectValue(
      JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")),
      "OIDC token payload",
    );
    if (typeof payload.sub !== "string" || payload.sub === "") {
      throw new Error("OIDC access token requires sub");
    }
    return payload.sub;
  }

  function payerHolding(
    value: unknown,
    payer: string,
  ): PayerHolding | undefined {
    const entry = objectValue(value, "Active contract response");
    const active = objectValue(
      objectValue(entry.contractEntry, "Contract entry").JsActiveContract,
      "Active contract",
    );
    const event = objectValue(active.createdEvent, "Created event");
    if (!Array.isArray(event.interfaceViews)) return undefined;
    for (const candidate of event.interfaceViews) {
      const view = objectValue(
        objectValue(candidate, "Interface view").viewValue,
        "Holding view",
      );
      const instrument = objectValue(view.instrumentId, "Instrument ID");
      if (
        view.owner === payer &&
        view.lock == null &&
        typeof view.amount === "string" &&
        typeof event.contractId === "string" &&
        typeof instrument.admin === "string" &&
        instrument.id === "Amulet"
      ) {
        return {
          amount: view.amount,
          contractId: event.contractId,
          instrumentId: { admin: instrument.admin, id: "Amulet" },
          owner: payer,
        };
      }
    }
    return undefined;
  }

  return {
    async getLedgerEnd(): Promise<number> {
      const response = objectValue(
        await authorizedGet(`${network.ledgerUrl}/v2/state/ledger-end`),
        "Ledger end",
      );
      if (typeof response.offset !== "number") {
        throw new Error("Ledger end requires numeric offset");
      }
      return response.offset;
    },
    async getUserId(): Promise<string> {
      return userIdFromToken(await accessToken());
    },
    async loadSettlementState(payer: string) {
      const token = await accessToken();
      const [rulesResponse, roundsResponse, ledgerEndResponse] =
        await Promise.all([
          authorizedGet(`${network.validatorUrl}/v0/scan-proxy/amulet-rules`),
          authorizedGet(
            `${network.validatorUrl}/v0/scan-proxy/open-and-issuing-mining-rounds`,
          ),
          authorizedGet(`${network.ledgerUrl}/v2/state/ledger-end`),
        ]);
      const rules = objectValue(rulesResponse, "Amulet rules response")
        .amulet_rules as ScanContract;
      const rounds = objectValue(roundsResponse, "Mining rounds response")
        .open_mining_rounds as ReadonlyArray<OpenMiningRound>;
      const offset = objectValue(ledgerEndResponse, "Ledger end").offset;
      if (!Array.isArray(rounds) || typeof offset !== "number") {
        throw new Error("Five North settlement state is incomplete");
      }
      const contracts = await ledgerPost("/v2/state/active-contracts", {
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
      });
      if (!Array.isArray(contracts)) {
        throw new Error("Active contracts response must be an array");
      }
      const holding = contracts
        .map((contract) => payerHolding(contract, payer))
        .find((contract) => contract !== undefined);
      if (holding === undefined) {
        throw new Error("No unlocked payer CC holding is available");
      }
      return {
        amuletRules: rules,
        openMiningRounds: rounds,
        payerHolding: holding,
        userId: userIdFromToken(token),
      } as const;
    },
    async getTransaction(updateId: string, party: string): Promise<unknown> {
      return ledgerPost("/v2/updates/transaction-by-id", {
        updateId,
        transactionFormat: {
          eventFormat: {
            filtersByParty: {
              [party]: {
                cumulative: [
                  {
                    identifierFilter: {
                      WildcardFilter: {
                        value: { includeCreatedEventBlob: false },
                      },
                    },
                  },
                ],
              },
            },
            verbose: false,
          },
          transactionShape: "TRANSACTION_SHAPE_LEDGER_EFFECTS",
        },
      });
    },
    async submitSettlement(body: unknown) {
      const response = objectValue(
        await ledgerPost("/v2/commands/submit-and-wait", body),
        "Settlement response",
      );
      if (
        typeof response.updateId !== "string" ||
        typeof response.completionOffset !== "number"
      ) {
        throw new Error("Settlement response requires updateId and offset");
      }
      return {
        completionOffset: response.completionOffset,
        updateId: response.updateId,
      } as const;
    },
    postLedger: ledgerPost,
  };
}
