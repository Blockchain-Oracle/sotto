import type { Env } from "../config.js";
import { buildClient, requireToken } from "../core.js";
import { CLI_VERSION } from "../version.js";
import {
  serveJsonRpc,
  type McpServerDefinition,
  type StreamLike,
} from "./protocol.js";
import { TOOL_DEFINITIONS, callTool } from "./tools.js";
import type { FetchLike } from "@sotto/purchase-client";

/**
 * `sotto mcp serve` — the buyer MCP server over stdio. Auth is the same
 * stored session token (or SOTTO_SESSION_TOKEN) the CLI uses; there is no
 * key material anywhere in this process and no generic signing tool in
 * the tool list. Stdout stays pure JSON-RPC; diagnostics go to stderr.
 */
export function buildMcpDefinition(
  env: Env,
  fetchImpl?: FetchLike,
): McpServerDefinition {
  const context = buildClient(env, {}, fetchImpl);
  requireToken(context.settings);
  return Object.freeze({
    serverInfo: Object.freeze({ name: "sotto", version: CLI_VERSION }),
    methods: Object.freeze({
      "tools/list": () => ({
        tools: TOOL_DEFINITIONS.map((tool) => ({
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: tool.annotations,
        })),
      }),
      "tools/call": async (params: Readonly<Record<string, unknown>>) => {
        const name = typeof params.name === "string" ? params.name : "";
        const args =
          typeof params.arguments === "object" && params.arguments !== null
            ? (params.arguments as Readonly<Record<string, unknown>>)
            : {};
        return callTool(context.client, name, args);
      },
    }),
  });
}

export async function serveMcp(env: Env, streams: StreamLike): Promise<void> {
  const definition = buildMcpDefinition(env);
  streams.logError(
    `sotto mcp serve: stdio JSON-RPC against ${env.SOTTO_API_ORIGIN ?? "configured origin"} — logs on stderr only`,
  );
  await serveJsonRpc(definition, streams);
}
