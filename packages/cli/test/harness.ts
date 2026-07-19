import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FetchLike } from "@sotto/purchase-client";
import type { Io } from "../src/output.js";

export const TOKEN = "ab".repeat(32);

export type CapturedIo = Io & {
  readonly out: string[];
  readonly err: string[];
};

export function capturedIo(
  env: Readonly<Record<string, string | undefined>> = {},
): CapturedIo {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
    env,
    isTTY: false,
  };
}

export function tempEnv(
  overrides: Readonly<Record<string, string | undefined>> = {},
): Record<string, string | undefined> {
  return {
    SOTTO_CONFIG_DIR: mkdtempSync(join(tmpdir(), "sotto-cli-test-")),
    ...overrides,
  };
}

export const RESOURCE = Object.freeze({
  listingId: "018f3f24-7d4a-7e2c-a421-0f3473b96021",
  resourceId: "018f3f24-7d4a-7e2c-a421-0f3473b96005",
  resourceRevisionId: "018f3f24-7d4a-7e2c-a421-0f3473b96006",
  listingVersion: 1,
  providerId: "018f3f24-7d4a-7e2c-a421-0f3473b96002",
  providerDisplayName: "Real Weather API",
  normalizedOrigin: "https://weather.example.com",
  name: "Current weather",
  description: "Return current weather for one location.",
  method: "GET",
  routeTemplate: "/weather/current",
  x402Version: 2,
  scheme: "exact",
  network: "canton:devnet",
  asset: "CC",
  recipient: "sotto-weather-provider::1220provider",
  amountAtomic: "2500000000",
  transferMethod: "transfer-factory",
  lastVerifiedAt: "2026-07-18T00:00:01.000Z",
});

export type Route = Readonly<{ status: number; body: unknown }> | Response;

export function fakeApi(
  routes: Readonly<Record<string, Route | (() => Route)>>,
): { calls: string[]; fetch: FetchLike } {
  const calls: string[] = [];
  return {
    calls,
    fetch: async (url, init) => {
      const key = `${init.method} ${decodeURIComponent(new URL(url).pathname)}`;
      calls.push(key);
      const candidate = routes[key];
      const route = typeof candidate === "function" ? candidate() : candidate;
      if (route === undefined) {
        return new Response(
          JSON.stringify({ error: "resource-unknown", detail: "test route" }),
          { status: 404 },
        );
      }
      if (route instanceof Response) return route.clone();
      return new Response(JSON.stringify(route.body), { status: route.status });
    },
  };
}

export function sseBody(
  events: readonly Readonly<{ sequence: number; type: string }>[],
): Response {
  const frames = events
    .map((event) => {
      const data = JSON.stringify({
        sequence: event.sequence,
        type: event.type,
        recordedAt: `2026-07-19T00:00:0${event.sequence}.000Z`,
        updateId: null,
      });
      return `id: ${event.sequence}\nevent: ${event.type}\ndata: ${data}\n\n`;
    })
    .join("");
  return new Response(`: stream-open\n\n${frames}`, { status: 200 });
}
