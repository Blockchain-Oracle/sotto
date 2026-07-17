import { expect, it, vi } from "vitest";
import { encodeSettlementProof } from "../src/provider.js";
import { createPinnedCloudflarePaidFetcher } from "../src/cloudflare-pinned-paid-fetch.js";

const route = Object.freeze({
  address: "104.16.0.1",
  family: 4 as const,
  origin: "https://human-live.trycloudflare.com" as const,
  close: async () => undefined,
});

const proof = Object.freeze({
  attemptId: `sha256:${"a".repeat(64)}` as const,
  requestCommitment: `sha256:${"b".repeat(64)}` as const,
  updateId: `1220${"c".repeat(64)}`,
});

function exactRequest(signal = new AbortController().signal) {
  return {
    headers: [["PAYMENT-SIGNATURE", encodeSettlementProof(proof)]],
    method: "GET",
    redirect: "error",
    signal,
  } as const;
}

it("sends one canonical paid GET through the pinned Cloudflare address", async () => {
  const signal = new AbortController().signal;
  const requestHttps = vi.fn(async () =>
    Response.json({ paid: true, result: "authentic" }),
  );
  const fetcher = createPinnedCloudflarePaidFetcher(
    route,
    `${route.origin}/paid/weather`,
    { requestHttps },
  );
  const paymentSignature = encodeSettlementProof(proof);

  const response = await fetcher(`${route.origin}/paid/weather`, {
    headers: [["PAYMENT-SIGNATURE", paymentSignature]],
    method: "GET",
    redirect: "error",
    signal,
  });

  expect(response.status).toBe(200);
  expect(requestHttps).toHaveBeenCalledWith({
    address: route.address,
    family: 4,
    paymentSignature,
    signal: expect.any(AbortSignal),
    url: new URL(`${route.origin}/paid/weather`),
  });
});

it.each([
  ["different origin", "https://other.trycloudflare.com/paid/weather", {}],
  ["different path", `${route.origin}/other`, {}],
  ["query", `${route.origin}/paid/weather?secret=x`, {}],
  ["fragment", `${route.origin}/paid/weather#private`, {}],
  ["credentials", `https://user@human-live.trycloudflare.com/paid/weather`, {}],
  ["method", `${route.origin}/paid/weather`, { method: "POST" }],
  ["redirect", `${route.origin}/paid/weather`, { redirect: "follow" }],
  [
    "lowercase header",
    `${route.origin}/paid/weather`,
    { headers: [["payment-signature", encodeSettlementProof(proof)]] },
  ],
  [
    "extra header",
    `${route.origin}/paid/weather`,
    {
      headers: [
        ["PAYMENT-SIGNATURE", encodeSettlementProof(proof)],
        ["x-private", "forbidden"],
      ],
    },
  ],
  [
    "malformed proof",
    `${route.origin}/paid/weather`,
    { headers: [["PAYMENT-SIGNATURE", "not-base64"]] },
  ],
  ["body", `${route.origin}/paid/weather`, { body: "private" }],
  ["extra option", `${route.origin}/paid/weather`, { cache: "no-store" }],
] as const)(
  "rejects %s before paid network I/O",
  async (_label, url, mutation) => {
    const requestHttps = vi.fn();
    const fetcher = createPinnedCloudflarePaidFetcher(
      route,
      `${route.origin}/paid/weather`,
      { requestHttps },
    );

    await expect(
      fetcher(url, { ...exactRequest(), ...mutation } as never),
    ).rejects.toThrow();
    expect(requestHttps).not.toHaveBeenCalled();
  },
);

it("settles its timeout even when the paid requester ignores the signal", async () => {
  const timeout = new AbortController();
  const requestHttps = vi.fn(() => new Promise<Response>(() => undefined));
  const fetcher = createPinnedCloudflarePaidFetcher(
    route,
    `${route.origin}/paid/weather`,
    {
      requestHttps,
      timeoutSignal: (milliseconds) => {
        expect(milliseconds).toBe(10_000);
        return timeout.signal;
      },
    },
  );
  const pending = fetcher(`${route.origin}/paid/weather`, exactRequest());

  timeout.abort();

  await expect(
    Promise.race([
      pending,
      new Promise<Response>((resolve) =>
        setTimeout(() => resolve(new Response(null, { status: 299 })), 20),
      ),
    ]),
  ).rejects.toThrow(/paid.*interrupted/iu);
  expect(requestHttps).toHaveBeenCalledOnce();
});
