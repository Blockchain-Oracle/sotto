import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  createComposeAssistService,
  deriveInputFields,
  validateComposedInput,
} from "../src/services/compose-assist.js";
import { buildServer } from "../src/server.js";
import { fakeDependencies, publishedResource } from "./fakes.js";

let server: FastifyInstance | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

function modelResponse(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const parameterised = publishedResource({
  routeTemplate: "/weather/{city}/{unit}",
});

describe("compose-assist schema", () => {
  it("derives fields from the verified route template only", () => {
    expect(deriveInputFields("/weather/current")).toEqual([]);
    expect(deriveInputFields("/weather/{city}/{unit}")).toEqual([
      "city",
      "unit",
    ]);
  });

  it("accepts only exact conforming objects", () => {
    const fields = ["city", "unit"];
    expect(
      validateComposedInput(fields, { city: "Lagos", unit: "celsius" }),
    ).toEqual({ city: "Lagos", unit: "celsius" });
    expect(validateComposedInput(fields, { city: "Lagos" })).toBeNull();
    expect(
      validateComposedInput(fields, { city: "Lagos", unit: 3 }),
    ).toBeNull();
    expect(
      validateComposedInput(fields, {
        city: "Lagos",
        unit: "c",
        extra: "no",
      }),
    ).toBeNull();
    expect(validateComposedInput(fields, "text")).toBeNull();
  });
});

describe("compose-assist service", () => {
  it("returns validated input from a conforming completion", async () => {
    const service = createComposeAssistService(
      { apiKey: "k".repeat(32), model: "anthropic/claude-sonnet-4.5" },
      async (url, init) => {
        expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
        const payload = JSON.parse(String(init?.body)) as {
          messages: ReadonlyArray<{ content: string }>;
        };
        // The model sees catalog facts and the task only — never a key,
        // token, or URL to call.
        expect(JSON.stringify(payload)).not.toContain("k".repeat(32));
        return modelResponse(
          JSON.stringify({ city: "Lagos", unit: "celsius" }),
        );
      },
    );
    const outcome = await service.compose({
      resource: parameterised,
      task: "Weather in Lagos in celsius",
      signal: AbortSignal.timeout(5_000),
    });
    expect(outcome.status).toBe(200);
    expect(outcome.body).toEqual({
      input: { city: "Lagos", unit: "celsius" },
      fields: ["city", "unit"],
    });
  });

  it("rejects malformed model output with 422", async () => {
    for (const content of [
      "not json at all",
      JSON.stringify({ city: "Lagos" }),
      JSON.stringify({ city: "Lagos", unit: "c", url: "https://evil" }),
      JSON.stringify(["Lagos"]),
    ]) {
      const service = createComposeAssistService(
        { apiKey: "k".repeat(32), model: "m" },
        async () => modelResponse(content),
      );
      const outcome = await service.compose({
        resource: parameterised,
        task: "Weather in Lagos",
        signal: AbortSignal.timeout(5_000),
      });
      expect(outcome.status).toBe(422);
      expect(outcome.body).toMatchObject({ error: "model-output-invalid" });
    }
  });

  it("reports an unreachable model as 502, never fabricating input", async () => {
    const service = createComposeAssistService(
      { apiKey: "k".repeat(32), model: "m" },
      async () => new Response("upstream down", { status: 502 }),
    );
    const outcome = await service.compose({
      resource: parameterised,
      task: "Weather in Lagos",
      signal: AbortSignal.timeout(5_000),
    });
    expect(outcome.status).toBe(502);
    expect(outcome.body).toMatchObject({ error: "model-unreachable" });
  });
});

describe("compose-assist route gate", () => {
  it("answers 503 compose-assist-unavailable without an API key", async () => {
    const party = `sotto-owner::1220${"a".repeat(64)}`;
    const deps = fakeDependencies({
      composeAssist: undefined,
      signer: {
        createWallet: async () =>
          Object.freeze({
            status: 201,
            body: Object.freeze({
              partyId: party,
              walletId: "0".repeat(32),
              fingerprint: `1220${"a".repeat(64)}`,
            }),
          }),
        fundWallet: async () => Object.freeze({ status: 503, body: {} }),
        linkWallet: async () => Object.freeze({ status: 503, body: {} }),
        readWalletProfile: async () => Object.freeze({ status: 404, body: {} }),
        readWalletProfileByParty: async () =>
          Object.freeze({ status: 404, body: {} }),
      },
    });
    server = await buildServer(deps);
    const onboarded = await server.inject({
      method: "POST",
      url: "/v1/onboarding/hosted",
      payload: { ownerHint: "Judge" },
    });
    const cookie = onboarded.cookies.find((c) => c.name === "sotto_session");
    if (cookie === undefined) throw new Error("session cookie absent");
    const response = await server.inject({
      method: "POST",
      url: "/v1/compose-assist",
      cookies: { [cookie.name]: cookie.value },
      payload: { listingId: "x", task: "y" },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: "compose-assist-unavailable",
    });
  });
});
