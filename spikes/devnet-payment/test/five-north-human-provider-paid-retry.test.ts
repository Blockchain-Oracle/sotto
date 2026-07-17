import { commitHttpRequest } from "@sotto/x402-canton";
import { expect, it, vi } from "vitest";
import {
  encodeSettlementProof,
  type SettlementProof,
} from "../src/provider.js";
import { startFiveNorthHumanProviderSession } from "../src/five-north-human-provider-session.js";

const PAYER = `sotto-external-payer::1220${"a".repeat(64)}`;
const PROVIDER = `sotto-provider::1220${"b".repeat(64)}`;
const DSO = `DSO::1220${"c".repeat(64)}`;
const SYNCHRONIZER = `global-domain::1220${"d".repeat(64)}`;
const ORIGIN = "https://human-live.trycloudflare.com" as const;
const RESOURCE_URL = `${ORIGIN}/paid/weather`;
const proof = Object.freeze({
  attemptId: `sha256:${"e".repeat(64)}`,
  requestCommitment: commitHttpRequest({
    method: "GET",
    url: RESOURCE_URL,
  }).commitment,
  updateId: `1220${"1".repeat(64)}`,
}) satisfies SettlementProof;

function input(
  verifySettlement?: (value: SettlementProof) => Promise<boolean>,
) {
  return {
    dsoParty: DSO,
    payerParty: PAYER,
    port: 8_791,
    providerParty: PROVIDER,
    signal: new AbortController().signal,
    synchronizerId: SYNCHRONIZER,
    ...(verifySettlement === undefined ? {} : { verifySettlement }),
  };
}

function dependencies() {
  let handler!: (request: Request) => Promise<Response>;
  const unsigned = vi.fn(
    async (url: string, init: RequestInit = {}) =>
      await handler(
        new Request(url, {
          ...(init.headers === undefined ? {} : { headers: init.headers }),
          ...(init.method === undefined ? {} : { method: init.method }),
        }),
      ),
  );
  const paid = vi.fn(
    async (
      url: string,
      request: Readonly<{
        headers: readonly [readonly ["PAYMENT-SIGNATURE", string]];
        method: "GET";
      }>,
    ) =>
      await handler(
        new Request(url, {
          headers: request.headers.map(
            ([name, value]) => [name, value] as [string, string],
          ),
          method: request.method,
        }),
      ),
  );
  return {
    paid,
    values: {
      createPinnedFetcher: () => unsigned,
      createPinnedPaidFetcher: () => paid,
      resolveOrigin: async () => ["104.16.0.1"],
      startProvider: async (candidate: {
        handler: typeof handler;
        port: number;
      }) => {
        handler = candidate.handler;
        return {
          close: async () => undefined,
          localUrl: `http://127.0.0.1:${candidate.port}/paid/weather`,
        };
      },
      startTunnel: async () => ({
        close: async () => undefined,
        origin: ORIGIN,
      }),
    },
  };
}

it("uses one canonical paid retry after exact settlement verification", async () => {
  const verifySettlement = vi.fn(async (candidate: SettlementProof) => {
    expect(candidate).toEqual(proof);
    return true;
  });
  const { paid, values } = dependencies();
  const session = await startFiveNorthHumanProviderSession(
    input(verifySettlement),
    values,
  );

  await expect(
    session.fetchAuthorized({
      headers: [],
      method: "GET",
      redirect: "error",
      signal: new AbortController().signal,
      url: session.resourceUrl,
    }),
  ).resolves.toMatchObject({ status: 402 });
  const response = await session.retryPaid(proof);

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({ paid: true });
  expect(verifySettlement).toHaveBeenCalledWith(proof);
  expect(paid).toHaveBeenCalledWith(session.resourceUrl, {
    headers: [["PAYMENT-SIGNATURE", encodeSettlementProof(proof)]],
    method: "GET",
    redirect: "error",
    signal: expect.any(AbortSignal),
  });
  await expect(session.retryPaid(proof)).resolves.toMatchObject({
    status: 200,
  });
  expect(verifySettlement).toHaveBeenCalledOnce();
  expect(paid).toHaveBeenCalledTimes(2);
  await expect(
    session.retryPaid({ ...proof, updateId: `1220${"2".repeat(64)}` }),
  ).rejects.toThrow(/different.*proof/iu);
  expect(paid).toHaveBeenCalledTimes(2);
  await session.close();
});

it("keeps the prepare-only settlement verifier false by default", async () => {
  const { values } = dependencies();
  const session = await startFiveNorthHumanProviderSession(input(), values);

  await expect(session.retryPaid(proof)).rejects.toThrow(/paid.*200/iu);
  await session.close();
});
