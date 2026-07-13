import { timingSafeEqual } from "node:crypto";
import {
  parseLocalPrepareBootstrap,
  selectLocalDisclosures,
} from "./local-prepare-fixture.js";
import {
  localObject,
  parseLocalPrepareResponse,
  readLocalJson,
  readLocalPrepareBytes,
} from "./local-prepare-response.js";
import { buildLocalPrepareRequest } from "./local-prepare-request.js";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export type LocalPrepareSmokeInput = Readonly<{
  baseUrl: string;
  bootstrap: unknown;
  fetcher: Fetcher;
  persistRaw: (bytes: Uint8Array) => Promise<void>;
  recomputePrecheck: (preparedTransaction: Uint8Array) => Promise<Uint8Array>;
}>;

export type LocalPrepareSmokeResult = Readonly<{
  canonicalParticipantHashBytes: 32;
  disclosureCount: 2;
  fixture: "local-mock-effects";
  precheckMatches: true;
  preparedTransactionBytes: number;
  status: "prepared-local-mock-not-signed";
}>;

function requireLoopbackBase(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    url.port !== "7575" ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error("local prepare requires exact loopback JSON API base");
  }
  return url.origin;
}

export async function runLocalPrepareSmoke(
  input: LocalPrepareSmokeInput,
): Promise<LocalPrepareSmokeResult> {
  const base = requireLoopbackBase(input.baseUrl);
  const bootstrap = parseLocalPrepareBootstrap(input.bootstrap);
  const ledgerEnd = localObject(
    await readLocalJson(
      await input.fetcher(`${base}/v2/state/ledger-end`, {
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(5_000),
      }),
      "local ledger end",
    ),
    "local ledger end",
  );
  if (
    !Number.isSafeInteger(ledgerEnd.offset) ||
    (ledgerEnd.offset as number) < 0
  ) {
    throw new Error("local ledger end offset is invalid");
  }
  const activeContracts = await readLocalJson(
    await input.fetcher(`${base}/v2/state/active-contracts`, {
      body: JSON.stringify({
        filter: {
          filtersByParty: {
            [bootstrap.admin]: {
              cumulative: [
                {
                  identifierFilter: {
                    WildcardFilter: {
                      value: { includeCreatedEventBlob: true },
                    },
                  },
                },
              ],
            },
          },
        },
        verbose: true,
        activeAtOffset: ledgerEnd.offset,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    }),
    "local ACS response",
  );
  const disclosures = selectLocalDisclosures(activeContracts, bootstrap);
  const responseBytes = await readLocalPrepareBytes(
    await input.fetcher(`${base}/v2/interactive-submission/prepare`, {
      body: JSON.stringify(buildLocalPrepareRequest(bootstrap, disclosures)),
      headers: { "content-type": "application/json" },
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    }),
  );
  const parsed = parseLocalPrepareResponse(responseBytes);
  const precheck = await input.recomputePrecheck(
    new Uint8Array(parsed.preparedTransaction),
  );
  if (
    precheck.byteLength !== 32 ||
    !timingSafeEqual(Buffer.from(parsed.participantHash), Buffer.from(precheck))
  ) {
    throw new Error("local wallet precheck does not match participant hash");
  }
  await input.persistRaw(new Uint8Array(responseBytes));
  return Object.freeze({
    canonicalParticipantHashBytes: 32 as const,
    disclosureCount: 2 as const,
    fixture: "local-mock-effects" as const,
    precheckMatches: true as const,
    preparedTransactionBytes: parsed.preparedTransaction.byteLength,
    status: "prepared-local-mock-not-signed" as const,
  });
}
