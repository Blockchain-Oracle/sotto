import {
  deleteConfig,
  isValidToken,
  readConfig,
  writeConfig,
  type Env,
} from "../config.js";
import { buildClient, CliUsageError } from "../core.js";
import { EXIT, type ExitCode } from "../exit-codes.js";
import { printJson, type Io } from "../output.js";
import type { FetchLike } from "@sotto/purchase-client";

export type SessionCommandInput = Readonly<{
  io: Io;
  env: Env;
  flags: Readonly<Record<string, string | boolean | undefined>>;
  fetchImpl?: FetchLike;
}>;

/**
 * `sotto login`. There is no device-authorization grant server-side yet,
 * so the honest flow is copy-token: establish an owner session in the
 * Sotto app (hosted onboarding or party-proof), copy the session token it
 * shows once, and store it here with 0600 permissions. The token is never
 * echoed back.
 */
export async function loginCommand(
  input: SessionCommandInput,
): Promise<ExitCode> {
  const { io, env, flags } = input;
  const token = typeof flags.token === "string" ? flags.token : undefined;
  const apiOrigin =
    typeof flags["api-origin"] === "string" ? flags["api-origin"] : undefined;
  const walletUrl =
    typeof flags["wallet-url"] === "string" ? flags["wallet-url"] : undefined;
  const existing = readConfig(env);
  const origin = apiOrigin ?? env.SOTTO_API_ORIGIN ?? existing.apiOrigin;
  if (token === undefined) {
    io.stdout("To connect this CLI to your Sotto owner session:");
    io.stdout("");
    io.stdout(
      `  1. Open the Sotto app${origin === undefined ? "" : ` for ${origin}`} ` +
        "and establish an owner session (hosted onboarding or party proof).",
    );
    io.stdout(
      "  2. Copy the one-time session token from the session response " +
        "(the app shows it once; it is the same opaque token the browser " +
        "cookie carries).",
    );
    io.stdout("  3. Run: sotto login --api-origin <api-url> --token <token>");
    io.stdout("");
    io.stdout(
      "The token is stored 0600 in ~/.config/sotto/config.json and sent " +
        "only as an Authorization: Bearer header to that API origin.",
    );
    return EXIT.ok;
  }
  if (!isValidToken(token)) {
    throw new CliUsageError(
      "The session token must be the 64-hex value from the session " +
        "response. Do not paste a cookie header or a signing key.",
    );
  }
  if (origin === undefined) {
    throw new CliUsageError(
      "Pass --api-origin <url> (or set SOTTO_API_ORIGIN) so the token is " +
        "bound to one API origin.",
    );
  }
  const { client } = buildClient(env, { apiOrigin: origin }, input.fetchImpl);
  void client; // origin validated by construction
  const path = writeConfig(env, {
    apiOrigin: origin,
    token,
    ...(walletUrl === undefined
      ? existing.walletUrl === undefined
        ? {}
        : { walletUrl: existing.walletUrl }
      : { walletUrl }),
  });
  io.stdout(`Owner session token stored (0600) at ${path}.`);
  io.stdout(`API origin: ${origin}`);
  io.stdout("Verify it with: sotto whoami");
  return EXIT.ok;
}

export async function whoamiCommand(
  input: SessionCommandInput,
): Promise<ExitCode> {
  const { io, env, flags } = input;
  const context = buildClient(
    env,
    typeof flags["api-origin"] === "string"
      ? { apiOrigin: flags["api-origin"] }
      : {},
    input.fetchImpl,
  );
  const hasToken = context.settings.token !== undefined;
  const sessionValid = hasToken ? await context.client.session.verify() : false;
  const report = {
    apiOrigin: context.client.origin,
    tokenConfigured: hasToken,
    tokenSource: context.settings.tokenSource,
    sessionValid,
  };
  if (flags.json === true) {
    printJson(io, report);
  } else {
    io.stdout(`API origin:   ${report.apiOrigin}`);
    io.stdout(
      `Token:        ${hasToken ? `configured (${report.tokenSource})` : "absent"}`,
    );
    io.stdout(
      `Session:      ${
        sessionValid
          ? "valid owner session"
          : hasToken
            ? "rejected — expired or revoked; run `sotto login` again"
            : "absent — run `sotto login`"
      }`,
    );
  }
  return sessionValid ? EXIT.ok : EXIT.auth;
}

export async function logoutCommand(
  input: SessionCommandInput,
): Promise<ExitCode> {
  const { io, env } = input;
  const config = readConfig(env);
  if (config.token !== undefined && config.apiOrigin !== undefined) {
    try {
      const { client } = buildClient(env, {}, input.fetchImpl);
      await client.session.logout();
      io.stdout("Server session revoked.");
    } catch {
      io.stderr(
        "The API did not confirm revocation; the local token is removed " +
          "anyway. The session still expires server-side on its own TTL.",
      );
    }
  }
  if (config.apiOrigin === undefined && config.walletUrl === undefined) {
    deleteConfig(env);
  } else {
    writeConfig(env, {
      ...(config.apiOrigin === undefined
        ? {}
        : { apiOrigin: config.apiOrigin }),
      ...(config.walletUrl === undefined
        ? {}
        : { walletUrl: config.walletUrl }),
    });
  }
  io.stdout("Local session token removed.");
  return EXIT.ok;
}
