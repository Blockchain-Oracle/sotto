/**
 * Minimal MCP stdio server: newline-delimited JSON-RPC 2.0. Implemented by
 * hand so the published CLI carries zero runtime dependencies; stdout
 * carries JSON-RPC frames only, and every log goes to stderr.
 */
export const MCP_PROTOCOL_VERSION = "2025-06-18";

export type JsonRpcId = string | number | null;

export type JsonRpcMessage = Readonly<{
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method?: string;
  params?: Readonly<Record<string, unknown>>;
  result?: unknown;
  error?: unknown;
}>;

export type MethodHandler = (
  params: Readonly<Record<string, unknown>>,
) => Promise<unknown> | unknown;

export type McpServerDefinition = Readonly<{
  serverInfo: Readonly<{ name: string; version: string }>;
  methods: Readonly<Record<string, MethodHandler>>;
}>;

export class JsonRpcError extends Error {
  readonly code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
    this.name = "JsonRpcError";
  }
}

export function parseMessage(line: string): JsonRpcMessage | undefined {
  const trimmed = line.trim();
  if (trimmed === "") return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new JsonRpcError(-32700, "parse error: the line was not JSON");
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { jsonrpc?: unknown }).jsonrpc !== "2.0"
  ) {
    throw new JsonRpcError(-32600, "invalid request: jsonrpc 2.0 required");
  }
  return parsed as JsonRpcMessage;
}

/**
 * Handles one incoming message. Returns the serialized response frame, or
 * undefined for notifications (which never get a response).
 */
export async function handleMessage(
  definition: McpServerDefinition,
  message: JsonRpcMessage,
): Promise<string | undefined> {
  const id = message.id;
  const isRequest = id !== undefined;
  if (typeof message.method !== "string") {
    return isRequest
      ? respondError(id, -32600, "invalid request: method missing")
      : undefined;
  }
  if (message.method.startsWith("notifications/")) return undefined;
  const handler =
    message.method === "initialize"
      ? initializeHandler(definition)
      : message.method === "ping"
        ? () => ({})
        : definition.methods[message.method];
  if (handler === undefined) {
    return isRequest
      ? respondError(id, -32601, `method not found: ${message.method}`)
      : undefined;
  }
  try {
    const result = await handler(message.params ?? {});
    return isRequest
      ? JSON.stringify({ jsonrpc: "2.0", id, result })
      : undefined;
  } catch (error) {
    if (!isRequest) return undefined;
    if (error instanceof JsonRpcError) {
      return respondError(id, error.code, error.message);
    }
    return respondError(
      id,
      -32603,
      error instanceof Error ? error.message : "internal error",
    );
  }
}

function initializeHandler(definition: McpServerDefinition): MethodHandler {
  return (params) => {
    const requested = params.protocolVersion;
    return {
      protocolVersion:
        typeof requested === "string" && requested !== ""
          ? requested
          : MCP_PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: definition.serverInfo,
    };
  };
}

function respondError(id: JsonRpcId, code: number, message: string): string {
  return JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });
}

export type StreamLike = Readonly<{
  input: AsyncIterable<string | Uint8Array>;
  write: (frame: string) => void;
  logError: (line: string) => void;
}>;

/** Reads newline-delimited frames until the input ends. */
export async function serveJsonRpc(
  definition: McpServerDefinition,
  streams: StreamLike,
): Promise<void> {
  let buffer = "";
  const decoder = new TextDecoder();
  for await (const chunk of streams.input) {
    buffer +=
      typeof chunk === "string"
        ? chunk
        : decoder.decode(chunk, { stream: true });
    for (;;) {
      const newline = buffer.indexOf("\n");
      if (newline === -1) break;
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      let message: JsonRpcMessage | undefined;
      try {
        message = parseMessage(line);
      } catch (error) {
        if (error instanceof JsonRpcError) {
          streams.write(
            `${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: error.code, message: error.message } })}\n`,
          );
        }
        continue;
      }
      if (message === undefined) continue;
      const response = await handleMessage(definition, message);
      if (response !== undefined) streams.write(`${response}\n`);
    }
  }
}
