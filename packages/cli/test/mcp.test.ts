import { describe, expect, it } from "vitest";
import {
  handleMessage,
  parseMessage,
  serveJsonRpc,
  type JsonRpcMessage,
} from "../src/mcp/protocol.js";
import { TOOL_DEFINITIONS } from "../src/mcp/tools.js";
import { buildMcpDefinition } from "../src/mcp/serve.js";
import { CliAuthError } from "../src/core.js";
import { writeConfig } from "../src/config.js";
import { RESOURCE, TOKEN, fakeApi, tempEnv } from "./harness.js";

const ORIGIN = "http://127.0.0.1:4000";

function definitionWith(routes: Parameters<typeof fakeApi>[0]) {
  const env = tempEnv({ SOTTO_API_ORIGIN: ORIGIN });
  writeConfig(env, { apiOrigin: ORIGIN, token: TOKEN });
  return buildMcpDefinition(env, fakeApi(routes).fetch);
}

const request = (
  id: number,
  method: string,
  params?: Record<string, unknown>,
): JsonRpcMessage => ({
  jsonrpc: "2.0",
  id,
  method,
  ...(params ? { params } : {}),
});

describe("MCP tool surface", () => {
  it("declares the five buyer tools with schemas and annotations", () => {
    expect(TOOL_DEFINITIONS.map((tool) => tool.name)).toEqual([
      "search_resources",
      "inspect_resource",
      "purchase",
      "purchase_status",
      "get_evidence",
    ]);
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.inputSchema).toMatchObject({ type: "object" });
      expect(typeof tool.annotations.readOnlyHint).toBe("boolean");
    }
    const purchase = TOOL_DEFINITIONS.find((tool) => tool.name === "purchase");
    expect(purchase?.annotations.readOnlyHint).toBe(false);
    expect(purchase?.description).toContain("HUMAN must approve");
    const names = TOOL_DEFINITIONS.map((tool) => tool.name).join(" ");
    expect(names).not.toMatch(/sign|key|transfer/u);
  });

  it("refuses to start without a session token", () => {
    const env = tempEnv({ SOTTO_API_ORIGIN: ORIGIN });
    expect(() => buildMcpDefinition(env, fakeApi({}).fetch)).toThrow(
      CliAuthError,
    );
  });
});

describe("JSON-RPC framing", () => {
  it("answers initialize with capabilities and echoes the protocol version", async () => {
    const definition = definitionWith({});
    const response = await handleMessage(
      definition,
      request(1, "initialize", { protocolVersion: "2025-06-18" }),
    );
    const parsed = JSON.parse(response ?? "") as {
      result: { protocolVersion: string; serverInfo: { name: string } };
    };
    expect(parsed.result.protocolVersion).toBe("2025-06-18");
    expect(parsed.result.serverInfo.name).toBe("sotto");
  });

  it("ignores notifications and rejects unknown methods", async () => {
    const definition = definitionWith({});
    expect(
      await handleMessage(definition, {
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    ).toBeUndefined();
    const unknown = JSON.parse(
      (await handleMessage(definition, request(2, "resources/list"))) ?? "",
    ) as { error: { code: number } };
    expect(unknown.error.code).toBe(-32601);
  });

  it("lists tools and calls search_resources over the shared core", async () => {
    const definition = definitionWith({
      "GET /v1/resources": { status: 200, body: { resources: [RESOURCE] } },
    });
    const listed = JSON.parse(
      (await handleMessage(definition, request(3, "tools/list"))) ?? "",
    ) as { result: { tools: Array<{ name: string }> } };
    expect(listed.result.tools).toHaveLength(5);
    const called = JSON.parse(
      (await handleMessage(
        definition,
        request(4, "tools/call", {
          name: "search_resources",
          arguments: { query: "weather" },
        }),
      )) ?? "",
    ) as { result: { content: Array<{ text: string }>; isError?: boolean } };
    expect(called.result.isError).toBeUndefined();
    expect(called.result.content[0]?.text).toContain(RESOURCE.listingId);
  });

  it("states the human-approval boundary in the purchase result", async () => {
    const definition = definitionWith({
      "POST /v1/purchases": {
        status: 201,
        body: {
          attemptId: `sha256:${"c".repeat(64)}`,
          outcome: "created",
          state: "intent-created",
          commandId: "cmd",
          executeBefore: "2026-07-19T01:00:00.000Z",
          price: { changed: false },
        },
      },
    });
    const called = JSON.parse(
      (await handleMessage(
        definition,
        request(5, "tools/call", {
          name: "purchase",
          arguments: { listingId: RESOURCE.listingId },
        }),
      )) ?? "",
    ) as { result: { content: Array<{ text: string }> } };
    expect(called.result.content[0]?.text).toContain(
      "A HUMAN must approve this exact prepared call",
    );
    expect(called.result.content[0]?.text).not.toContain(TOKEN);
  });

  it("returns API failures as isError tool results, code verbatim", async () => {
    const definition = definitionWith({
      "POST /v1/purchases": {
        status: 503,
        body: { error: "five-north-unavailable", detail: "not configured" },
      },
    });
    const called = JSON.parse(
      (await handleMessage(
        definition,
        request(6, "tools/call", {
          name: "purchase",
          arguments: { listingId: RESOURCE.listingId },
        }),
      )) ?? "",
    ) as { result: { content: Array<{ text: string }>; isError?: boolean } };
    expect(called.result.isError).toBe(true);
    expect(called.result.content[0]?.text).toContain("five-north-unavailable");
  });

  it("keeps stdout pure: bad lines answer parse errors, frames end with newline", async () => {
    const definition = definitionWith({});
    const frames: string[] = [];
    await serveJsonRpc(definition, {
      input: (async function* () {
        yield "not json\n";
        yield `${JSON.stringify(request(7, "ping"))}\n`;
      })(),
      write: (frame) => frames.push(frame),
      logError: () => undefined,
    });
    expect(frames).toHaveLength(2);
    expect(frames.every((frame) => frame.endsWith("\n"))).toBe(true);
    expect(JSON.parse(frames[0] ?? "")).toMatchObject({
      error: { code: -32700 },
    });
    expect(JSON.parse(frames[1] ?? "")).toMatchObject({ id: 7, result: {} });
  });

  it("parses only jsonrpc-2.0 lines", () => {
    expect(parseMessage("")).toBeUndefined();
    expect(() => parseMessage('{"jsonrpc":"1.0"}')).toThrow();
  });
});
