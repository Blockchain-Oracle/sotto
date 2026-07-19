import { readFileSync, statSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  configPath,
  readConfig,
  resolveSettings,
  writeConfig,
} from "../src/config.js";
import { TOKEN, tempEnv } from "./harness.js";

describe("CLI config store", () => {
  it("writes the token file with 0600 and the directory with 0700", () => {
    const env = tempEnv();
    const path = writeConfig(env, {
      apiOrigin: "http://127.0.0.1:4000",
      token: TOKEN,
    });
    expect(statSync(path).mode & 0o777).toBe(0o600);
    const stored = JSON.parse(readFileSync(path, "utf8")) as {
      token?: string;
    };
    expect(stored.token).toBe(TOKEN);
    expect(readConfig(env)).toMatchObject({ token: TOKEN });
  });

  it("fails closed on malformed or wrong-shaped config", () => {
    const env = tempEnv();
    writeFileSync(configPath(env), "{not json", { mode: 0o600 });
    expect(readConfig(env)).toEqual({});
    writeFileSync(configPath(env), JSON.stringify({ token: "short" }), {
      mode: 0o600,
    });
    expect(readConfig(env).token).toBeUndefined();
  });

  it("lets SOTTO_SESSION_TOKEN and SOTTO_API_ORIGIN override the file", () => {
    const env = tempEnv({
      SOTTO_API_ORIGIN: "http://127.0.0.1:9000",
      SOTTO_SESSION_TOKEN: "ef".repeat(32),
    });
    writeConfig(env, { apiOrigin: "http://127.0.0.1:4000", token: TOKEN });
    const settings = resolveSettings(env);
    expect(settings.apiOrigin).toBe("http://127.0.0.1:9000");
    expect(settings.token).toBe("ef".repeat(32));
    expect(settings.tokenSource).toBe("env");
  });

  it("reports the config as the token source when no env token exists", () => {
    const env = tempEnv();
    writeConfig(env, { apiOrigin: "http://127.0.0.1:4000", token: TOKEN });
    expect(resolveSettings(env).tokenSource).toBe("config");
    expect(resolveSettings(tempEnv()).tokenSource).toBe("absent");
  });
});
