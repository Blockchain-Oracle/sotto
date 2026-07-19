import { parseArgs } from "node:util";
import {
  SottoApiError,
  SottoTransportError,
  type FetchLike,
} from "@sotto/purchase-client";
import type { Env } from "./config.js";
import { CliAuthError, CliUsageError } from "./core.js";
import { EXIT, type ExitCode } from "./exit-codes.js";
import { HELP_TEXT } from "./help.js";
import type { Io } from "./output.js";
import { buyCommand } from "./commands/buy.js";
import { inspectCommand, searchCommand } from "./commands/catalog.js";
import {
  loginCommand,
  logoutCommand,
  whoamiCommand,
} from "./commands/session.js";
import {
  evidenceCommand,
  statsCommand,
  statusCommand,
} from "./commands/status.js";
import { serveMcp } from "./mcp/serve.js";
import type { StreamLike } from "./mcp/protocol.js";
import { CLI_VERSION } from "./version.js";

export type RunOptions = Readonly<{
  io: Io;
  env: Env;
  fetchImpl?: FetchLike;
  mcpStreams?: StreamLike;
}>;

const FLAG_OPTIONS = {
  "api-origin": { type: "string" },
  "max-price": { type: "string" },
  "no-wait": { type: "boolean" },
  "wallet-url": { type: "string" },
  follow: { type: "boolean" },
  help: { type: "boolean" },
  input: { type: "string" },
  json: { type: "boolean" },
  method: { type: "string" },
  tag: { type: "string" },
  token: { type: "string" },
  version: { type: "boolean" },
  window: { type: "string" },
} as const;

function mapError(io: Io, error: unknown): ExitCode {
  if (error instanceof CliUsageError) {
    io.stderr(error.message);
    return EXIT.usage;
  }
  if (error instanceof CliAuthError) {
    io.stderr(error.message);
    return EXIT.auth;
  }
  if (error instanceof SottoApiError) {
    if (error.code === "session-required") {
      io.stderr(
        "The owner session is absent, expired, or revoked. Run " +
          "`sotto login` with a fresh token from the Sotto app.",
      );
      return EXIT.auth;
    }
    io.stderr(`${error.code}: ${error.detail ?? `HTTP ${error.status}`}`);
    return EXIT.failure;
  }
  if (error instanceof SottoTransportError) {
    io.stderr(error.message);
    return EXIT.failure;
  }
  io.stderr(error instanceof Error ? error.message : String(error));
  return EXIT.failure;
}

/** Parses argv, dispatches one command, and maps every error to an exit code. */
export async function run(
  argv: readonly string[],
  options: RunOptions,
): Promise<ExitCode> {
  const { io, env } = options;
  let parsed: ReturnType<
    typeof parseArgs<{ options: typeof FLAG_OPTIONS; allowPositionals: true }>
  >;
  try {
    parsed = parseArgs({
      args: [...argv],
      options: FLAG_OPTIONS,
      allowPositionals: true,
      strict: true,
    });
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error));
    io.stderr("Run `sotto --help` for usage.");
    return EXIT.usage;
  }
  const flags = parsed.values as Readonly<
    Record<string, string | boolean | undefined>
  >;
  const [command, ...positionals] = parsed.positionals;
  if (flags.version === true) {
    io.stdout(CLI_VERSION);
    return EXIT.ok;
  }
  if (command === undefined || flags.help === true) {
    io.stdout(HELP_TEXT);
    return command === undefined && flags.help !== true ? EXIT.usage : EXIT.ok;
  }
  const input = {
    io,
    env,
    positionals,
    flags,
    ...(options.fetchImpl === undefined
      ? {}
      : { fetchImpl: options.fetchImpl }),
  };
  try {
    switch (command) {
      case "login":
        return await loginCommand(input);
      case "whoami":
        return await whoamiCommand(input);
      case "logout":
        return await logoutCommand(input);
      case "search":
        return await searchCommand(input);
      case "inspect":
        return await inspectCommand(input, false);
      case "try":
        return await inspectCommand(input, true);
      case "buy":
        return await buyCommand(input);
      case "status":
        return await statusCommand(input);
      case "evidence":
        return await evidenceCommand(input);
      case "stats":
        return await statsCommand(input);
      case "mcp": {
        if (positionals[0] !== "serve") {
          io.stderr("Usage: sotto mcp serve");
          return EXIT.usage;
        }
        if (options.mcpStreams === undefined) {
          io.stderr("MCP stdio streams are unavailable in this environment.");
          return EXIT.failure;
        }
        await serveMcp(env, options.mcpStreams);
        return EXIT.ok;
      }
      default:
        io.stderr(`Unknown command: ${command}. Run \`sotto --help\`.`);
        return EXIT.usage;
    }
  } catch (error) {
    return mapError(io, error);
  }
}
