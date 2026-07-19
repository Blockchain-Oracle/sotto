import { describe, expect, it } from "vitest";
import {
  SottoApiError,
  SottoResponseShapeError,
  SottoResponseTooLargeError,
  SottoTransportError,
} from "../src/errors.js";
import { createTransport, readBounded } from "../src/http.js";

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("transport", () => {
  it("passes the server's error code and detail through verbatim", async () => {
    const transport = createTransport({
      origin: "http://127.0.0.1:1",
      fetch: async () =>
        json(404, {
          error: "resource-unknown",
          detail: "No published resource matches this listing.",
        }),
    });
    const failure = await transport
      .request({ method: "GET", path: "/v1/resources/x" })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(SottoApiError);
    expect((failure as SottoApiError).code).toBe("resource-unknown");
    expect((failure as SottoApiError).status).toBe(404);
    expect((failure as SottoApiError).detail).toContain("No published");
  });

  it("sends the bearer token only when one is configured", async () => {
    const seen: Array<Record<string, string>> = [];
    const transport = createTransport({
      origin: "http://127.0.0.1:1",
      token: () => "ab".repeat(32),
      fetch: async (_url, init) => {
        seen.push({ ...init.headers });
        return json(200, {});
      },
    });
    await transport.request({ method: "GET", path: "/v1/purchases" });
    expect(seen[0]?.authorization).toBe(`Bearer ${"ab".repeat(32)}`);

    const anonymous = createTransport({
      origin: "http://127.0.0.1:1",
      fetch: async (_url, init) => {
        seen.push({ ...init.headers });
        return json(200, {});
      },
    });
    await anonymous.request({ method: "GET", path: "/v1/resources" });
    expect(seen[1]?.authorization).toBeUndefined();
  });

  it("wraps a fetch failure as a transport error with the cause", async () => {
    const transport = createTransport({
      origin: "http://127.0.0.1:1",
      fetch: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    const failure = await transport
      .request({ method: "GET", path: "/healthz" })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(SottoTransportError);
  });

  it("rejects non-JSON success bodies as a shape error", async () => {
    const transport = createTransport({
      origin: "http://127.0.0.1:1",
      fetch: async () => new Response("<html>", { status: 200 }),
    });
    await expect(
      transport.request({ method: "GET", path: "/v1/resources" }),
    ).rejects.toBeInstanceOf(SottoResponseShapeError);
  });

  it("bounds response reads and fails loudly past the limit", async () => {
    const oversized = new Response(`"${"x".repeat(64)}"`, { status: 200 });
    await expect(readBounded(oversized, 16)).rejects.toBeInstanceOf(
      SottoResponseTooLargeError,
    );
    const transport = createTransport({
      origin: "http://127.0.0.1:1",
      maxResponseBytes: 8,
      fetch: async () => json(200, { padded: "y".repeat(64) }),
    });
    await expect(
      transport.request({ method: "GET", path: "/v1/stats" }),
    ).rejects.toBeInstanceOf(SottoResponseTooLargeError);
  });
});
