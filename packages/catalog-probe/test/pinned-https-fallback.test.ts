import { EventEmitter } from "node:events";
import type { request as requestHttps } from "node:https";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  requestPinnedHttpsProbe,
  resolvePublicHttpsTarget,
} from "../src/index.js";

const URL = "https://provider.example/v1/weather";
const FIRST_ADDRESS = "93.184.216.34";
const SECOND_ADDRESS = "93.184.216.35";

type Attempt = Readonly<{
  response?: Readonly<{ address?: string; status: number }>;
  transportFailure?: boolean;
}>;

function sequencedHttps(attempts: readonly Attempt[]) {
  const requests: Array<EventEmitter & { destroy: ReturnType<typeof vi.fn> }> =
    [];
  const open = vi.fn((_url, _options, onResponse) => {
    const attempt = attempts[requests.length];
    if (attempt === undefined) throw new Error("unexpected HTTPS attempt");
    const request = Object.assign(new EventEmitter(), {
      destroy: vi.fn(),
      end: vi.fn(() => {
        if (attempt.transportFailure === true) {
          request.emit("error", new Error("private socket detail"));
          return;
        }
        if (attempt.response !== undefined) {
          onResponse(
            Object.assign(new EventEmitter(), {
              destroy: vi.fn(),
              rawHeaders: [],
              socket: {
                remoteAddress: attempt.response.address ?? SECOND_ADDRESS,
              },
              statusCode: attempt.response.status,
            }),
          );
        }
      }),
      write: vi.fn(),
    });
    requests.push(request);
    return request;
  });
  return {
    open: open as unknown as typeof requestHttps,
    rawOpen: open,
    requests,
  };
}

async function target() {
  return await resolvePublicHttpsTarget(
    URL,
    async () => [
      { address: SECOND_ADDRESS, family: 4 },
      { address: FIRST_ADDRESS, family: 4 },
    ],
    new AbortController().signal,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-07-18T10:00:00.000Z") });
});

afterEach(() => vi.useRealTimers());

describe("pinned HTTPS address fallback", () => {
  it("tries the next authenticated address after a socket failure", async () => {
    const fake = sequencedHttps([
      { transportFailure: true },
      { response: { status: 200 } },
    ]);

    const response = await requestPinnedHttpsProbe(
      await target(),
      { method: "GET", signal: new AbortController().signal },
      { openHttps: fake.open },
    );

    expect(response.status).toBe(200);
    expect(fake.rawOpen).toHaveBeenCalledTimes(2);
    const pinnedAddresses = fake.rawOpen.mock.calls.map(([, options]) => {
      let selected: string | undefined;
      options.lookup(
        "provider.example",
        {},
        (_error: Error | null, address: string) => {
          selected = address;
        },
      );
      return selected;
    });
    expect(pinnedAddresses).toEqual([FIRST_ADDRESS, SECOND_ADDRESS]);
    expect(
      fake.rawOpen.mock.calls.map(([, options]) => ({
        family: options.family,
        rejectUnauthorized: options.rejectUnauthorized,
        servername: options.servername,
      })),
    ).toEqual([
      {
        family: 4,
        rejectUnauthorized: true,
        servername: "provider.example",
      },
      {
        family: 4,
        rejectUnauthorized: true,
        servername: "provider.example",
      },
    ]);
  });

  it("returns one stable error after every address fails", async () => {
    const fake = sequencedHttps([
      { transportFailure: true },
      { transportFailure: true },
    ]);

    await expect(
      requestPinnedHttpsProbe(
        await target(),
        { method: "GET", signal: new AbortController().signal },
        { openHttps: fake.open },
      ),
    ).rejects.toThrow("catalog HTTPS probe request failed");
    expect(fake.rawOpen).toHaveBeenCalledTimes(2);
  });

  it("does not fall back after an HTTP response validation failure", async () => {
    const fake = sequencedHttps([
      { response: { address: FIRST_ADDRESS, status: 302 } },
      { response: { status: 200 } },
    ]);

    await expect(
      requestPinnedHttpsProbe(
        await target(),
        { method: "GET", signal: new AbortController().signal },
        { openHttps: fake.open },
      ),
    ).rejects.toThrow("catalog HTTPS probe response failed");
    expect(fake.rawOpen).toHaveBeenCalledOnce();
  });

  it("returns the first authenticated HTTP response without fallback", async () => {
    const fake = sequencedHttps([
      { response: { address: FIRST_ADDRESS, status: 503 } },
      { response: { status: 200 } },
    ]);

    const response = await requestPinnedHttpsProbe(
      await target(),
      { method: "GET", signal: new AbortController().signal },
      { openHttps: fake.open },
    );

    expect(response.status).toBe(503);
    expect(fake.rawOpen).toHaveBeenCalledOnce();
  });

  it("cancellation stops the active attempt without fallback", async () => {
    vi.useRealTimers();
    const fake = sequencedHttps([{}, { response: { status: 200 } }]);
    const controller = new AbortController();
    const pending = requestPinnedHttpsProbe(
      await target(),
      { method: "GET", signal: controller.signal },
      { openHttps: fake.open },
    );
    controller.abort("private caller reason");

    await expect(pending).rejects.toThrow("catalog HTTPS probe interrupted");
    expect(fake.rawOpen).toHaveBeenCalledOnce();
    expect(fake.requests[0]!.destroy).toHaveBeenCalledOnce();
  });
});
