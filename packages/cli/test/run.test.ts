import { describe, expect, it } from "vitest";
import { run } from "../src/run.js";
import { writeConfig } from "../src/config.js";
import { CLI_VERSION } from "../src/version.js";
import { RESOURCE, TOKEN, capturedIo, fakeApi, tempEnv } from "./harness.js";

const ORIGIN = "http://127.0.0.1:4000";

describe("sotto command dispatch", () => {
  it("prints help and version", async () => {
    const io = capturedIo();
    expect(await run(["--version"], { io, env: tempEnv() })).toBe(0);
    expect(io.out[0]).toBe(CLI_VERSION);
    const help = capturedIo();
    expect(await run(["--help"], { io: help, env: tempEnv() })).toBe(0);
    expect(help.out.join("\n")).toContain("EXIT CODES");
    expect(help.out.join("\n")).toContain("copy-token flow");
  });

  it("answers usage errors with exit 2", async () => {
    const io = capturedIo();
    expect(await run(["frobnicate"], { io, env: tempEnv() })).toBe(2);
    expect(
      await run(["buy"], { io, env: tempEnv({ SOTTO_API_ORIGIN: ORIGIN }) }),
    ).toBe(2);
    expect(
      await run(["search", "--tag", "weather"], {
        io,
        env: tempEnv({ SOTTO_API_ORIGIN: ORIGIN }),
      }),
    ).toBe(2);
    expect(io.err.join("\n")).toContain("no tags yet");
  });

  it("requires an origin before any API call", async () => {
    const io = capturedIo();
    expect(await run(["search"], { io, env: tempEnv() })).toBe(2);
    expect(io.err.join("\n")).toContain("SOTTO_API_ORIGIN");
  });

  it("renders search results as JSON without truncation", async () => {
    const api = fakeApi({
      "GET /v1/resources": { status: 200, body: { resources: [RESOURCE] } },
    });
    const io = capturedIo();
    const exit = await run(["search", "weather", "--json"], {
      io,
      env: tempEnv({ SOTTO_API_ORIGIN: ORIGIN }),
      fetchImpl: api.fetch,
    });
    expect(exit).toBe(0);
    const parsed = JSON.parse(io.out.join("\n")) as {
      resources: Array<Record<string, unknown>>;
    };
    expect(parsed.resources[0]?.listingId).toBe(RESOURCE.listingId);
    expect(parsed.resources[0]?.recipient).toBe(RESOURCE.recipient);
  });

  it("answers an honest empty search result", async () => {
    const api = fakeApi({
      "GET /v1/resources": { status: 200, body: { resources: [] } },
    });
    const io = capturedIo();
    expect(
      await run(["search", "--json"], {
        io,
        env: tempEnv({ SOTTO_API_ORIGIN: ORIGIN }),
        fetchImpl: api.fetch,
      }),
    ).toBe(0);
    expect(JSON.parse(io.out.join("\n"))).toEqual({ resources: [] });
  });

  it("filters search by method and max price", async () => {
    const api = fakeApi({
      "GET /v1/resources": { status: 200, body: { resources: [RESOURCE] } },
    });
    const io = capturedIo();
    await run(["search", "--method", "POST", "--json"], {
      io,
      env: tempEnv({ SOTTO_API_ORIGIN: ORIGIN }),
      fetchImpl: api.fetch,
    });
    expect(JSON.parse(io.out.join("\n"))).toEqual({ resources: [] });
    const cheap = capturedIo();
    await run(["search", "--max-price", "100", "--json"], {
      io: cheap,
      env: tempEnv({ SOTTO_API_ORIGIN: ORIGIN }),
      fetchImpl: api.fetch,
    });
    expect(JSON.parse(cheap.out.join("\n"))).toEqual({ resources: [] });
  });

  it("resolves a canonical URL through try and prints prepare guidance", async () => {
    const api = fakeApi({
      "GET /v1/resources": { status: 200, body: { resources: [RESOURCE] } },
      [`GET /v1/resources/${RESOURCE.listingId}/health`]: {
        status: 200,
        body: { resourceId: RESOURCE.resourceId, health: null },
      },
    });
    const io = capturedIo();
    const exit = await run(
      ["try", "https://weather.example.com/weather/current"],
      {
        io,
        env: tempEnv({ SOTTO_API_ORIGIN: ORIGIN }),
        fetchImpl: api.fetch,
      },
    );
    expect(exit).toBe(0);
    const text = io.out.join("\n");
    expect(text).toContain(`sotto buy ${RESOURCE.listingId}`);
    expect(text).toContain("2500000000 CC (atomic units)");
    expect(text).toContain("2026-07-18T00:00:01.000Z (server-observed)");
  });

  it("refuses buy without a session token (exit 3) before any request", async () => {
    const api = fakeApi({});
    const io = capturedIo();
    const exit = await run(["buy", RESOURCE.listingId], {
      io,
      env: tempEnv({ SOTTO_API_ORIGIN: ORIGIN }),
      fetchImpl: api.fetch,
    });
    expect(exit).toBe(3);
    expect(api.calls).toEqual([]);
    expect(io.err.join("\n")).toContain("sotto login");
  });

  it("maps session-required from the API to exit 3", async () => {
    const env = tempEnv({ SOTTO_API_ORIGIN: ORIGIN });
    writeConfig(env, { apiOrigin: ORIGIN, token: TOKEN });
    const api = fakeApi({
      [`GET /v1/purchases/${"sha256:" + "a".repeat(64)}`]: {
        status: 401,
        body: { error: "session-required", detail: "expired" },
      },
    });
    const io = capturedIo();
    const exit = await run(["status", `sha256:${"a".repeat(64)}`], {
      io,
      env,
      fetchImpl: api.fetch,
    });
    expect(exit).toBe(3);
  });

  it("never echoes the token in login output", async () => {
    const env = tempEnv();
    const io = capturedIo();
    const exit = await run(
      ["login", "--api-origin", ORIGIN, "--token", TOKEN],
      { io, env },
    );
    expect(exit).toBe(0);
    expect(io.out.join("\n")).not.toContain(TOKEN);
    expect(io.err.join("\n")).not.toContain(TOKEN);
  });

  it("rejects a non-token secret pasted to login", async () => {
    const io = capturedIo();
    const exit = await run(
      ["login", "--api-origin", ORIGIN, "--token=not-a-64-hex-session-token"],
      { io, env: tempEnv() },
    );
    expect(exit).toBe(2);
    expect(io.err.join("\n")).toContain("64-hex");
  });
});
