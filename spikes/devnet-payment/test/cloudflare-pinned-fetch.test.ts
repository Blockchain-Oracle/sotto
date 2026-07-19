import { expect, it, vi } from "vitest";
import { createPinnedCloudflareFetcher } from "../src/cloudflare-pinned-fetch.js";

const route = Object.freeze({
  address: "104.16.0.1",
  family: 4 as const,
  origin: "https://human-live.trycloudflare.com" as const,
  close: async () => undefined,
});

it("preserves the HTTPS hostname while pinning the resolved address", async () => {
  const signal = new AbortController().signal;
  const requestHttps = vi.fn(
    async () =>
      new Response(null, {
        headers: { "PAYMENT-REQUIRED": "challenge" },
        status: 402,
      }),
  );
  const fetcher = createPinnedCloudflareFetcher(
    route,
    `${route.origin}/paid/weather`,
    { requestHttps },
  );

  const response = await fetcher(`${route.origin}/paid/weather`, {
    headers: new Headers(),
    method: "GET",
    redirect: "error",
    signal,
  });

  expect(response.status).toBe(402);
  expect(requestHttps).toHaveBeenCalledWith({
    address: route.address,
    family: 4,
    signal,
    url: new URL(`${route.origin}/paid/weather`),
  });
});

it.each([
  ["different origin", "https://other.trycloudflare.com/paid/weather", {}],
  ["different path", `${route.origin}/other`, {}],
  ["query parameters", `${route.origin}/paid/weather?secret=x`, {}],
  ["URL fragment", `${route.origin}/paid/weather#private`, {}],
  [
    "URL credentials",
    `https://user@human-live.trycloudflare.com/paid/weather`,
    {},
  ],
  ["non-GET method", `${route.origin}/paid/weather`, { method: "POST" }],
  [
    "redirect following",
    `${route.origin}/paid/weather`,
    { redirect: "follow" },
  ],
  [
    "request headers",
    `${route.origin}/paid/weather`,
    { headers: { secret: "x" } },
  ],
  ["request body", `${route.origin}/paid/weather`, { body: "private" }],
] as const)("rejects %s before network I/O", async (_label, url, mutation) => {
  const requestHttps = vi.fn();
  const fetcher = createPinnedCloudflareFetcher(
    route,
    `${route.origin}/paid/weather`,
    { requestHttps },
  );

  await expect(
    fetcher(url, {
      method: "GET",
      redirect: "error",
      signal: new AbortController().signal,
      ...mutation,
    }),
  ).rejects.toThrow();
  expect(requestHttps).not.toHaveBeenCalled();
});
