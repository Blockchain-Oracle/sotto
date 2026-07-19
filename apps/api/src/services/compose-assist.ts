import type { PublicPublishedResource } from "@sotto/database";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_RESPONSE_BYTES = 262_144;
const MAX_TASK_BYTES = 4_096;
const REQUEST_TIMEOUT_MS = 60_000;
const TEMPLATE_PARAMETER = /\{([A-Za-z_][A-Za-z0-9_]{0,63})\}/gu;

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export type ComposeAssistOutcome = Readonly<{
  status: number;
  body: Readonly<Record<string, unknown>>;
}>;

export type ComposeAssistService = Readonly<{
  compose(
    input: Readonly<{
      resource: PublicPublishedResource;
      task: string;
      signal: AbortSignal;
    }>,
  ): Promise<ComposeAssistOutcome>;
}>;

/**
 * Request-input schema derived from the catalog record itself: every
 * `{parameter}` in the verified route template becomes one required string
 * field. There is no invented schema — a parameterless resource takes an
 * empty input object.
 */
export function deriveInputFields(routeTemplate: string): readonly string[] {
  const fields = new Set<string>();
  for (const match of routeTemplate.matchAll(TEMPLATE_PARAMETER)) {
    const name = match[1];
    if (name !== undefined) fields.add(name);
  }
  return Object.freeze([...fields]);
}

export function validateComposedInput(
  fields: readonly string[],
  candidate: unknown,
): Readonly<Record<string, string>> | null {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    Array.isArray(candidate)
  ) {
    return null;
  }
  const record = candidate as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== fields.length) return null;
  const output: Record<string, string> = {};
  for (const field of fields) {
    const value = record[field];
    if (
      typeof value !== "string" ||
      value === "" ||
      Buffer.byteLength(value, "utf8") > 1_024
    ) {
      return null;
    }
    output[field] = value;
  }
  return Object.freeze(output);
}

function fail(
  status: number,
  error: string,
  detail: string,
): ComposeAssistOutcome {
  return Object.freeze({ status, body: Object.freeze({ error, detail }) });
}

async function readBounded(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error("model response body is absent");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Error("model response exceeds its byte boundary");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * OpenRouter-backed Composer assistant. The model sees only public catalog
 * facts and the user's task text; it never sees keys, session tokens, or
 * URLs to call, it cannot trigger payment, and its output is accepted only
 * when it is a strict JSON object conforming to the derived input schema.
 */
export function createComposeAssistService(
  configuration: Readonly<{ apiKey: string; model: string }>,
  fetcher: Fetcher = fetch,
): ComposeAssistService {
  return Object.freeze({
    compose: async ({ resource, task, signal }) => {
      if (
        typeof task !== "string" ||
        task.trim() === "" ||
        Buffer.byteLength(task, "utf8") > MAX_TASK_BYTES
      ) {
        return fail(
          400,
          "task-invalid",
          "Provide a non-empty task description up to 4096 bytes.",
        );
      }
      const fields = deriveInputFields(resource.routeTemplate);
      const instruction =
        "You prepare request input for one verified Canton x402 API " +
        "resource. Respond with ONLY a strict JSON object — no prose, no " +
        "code fences. The object must contain exactly these string keys: " +
        `${JSON.stringify(fields)}. Resource: ${resource.method} ` +
        `${resource.routeTemplate} — ${resource.name}: ` +
        `${resource.description}`;
      let content: string;
      try {
        const response = await fetcher(OPENROUTER_URL, {
          method: "POST",
          headers: {
            authorization: `Bearer ${configuration.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: configuration.model,
            messages: [
              { role: "system", content: instruction },
              { role: "user", content: task },
            ],
          }),
          redirect: "error",
          signal: AbortSignal.any([
            signal,
            AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          ]),
        });
        if (response.status !== 200) {
          await response.body?.cancel().catch(() => undefined);
          return fail(
            502,
            "model-unreachable",
            `OpenRouter answered ${response.status}. Retry, or compose the ` +
              "input by hand.",
          );
        }
        const payload = JSON.parse(await readBounded(response)) as {
          choices?: ReadonlyArray<{ message?: { content?: unknown } }>;
        };
        const candidate = payload.choices?.[0]?.message?.content;
        if (typeof candidate !== "string") {
          throw new Error("model completion is absent");
        }
        content = candidate;
      } catch {
        return fail(
          502,
          "model-unreachable",
          "The OpenRouter call failed before a completion arrived. Retry, " +
            "or compose the input by hand.",
        );
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        return fail(
          422,
          "model-output-invalid",
          "The model did not return strict JSON. Retry, or compose the " +
            "input by hand.",
        );
      }
      const input = validateComposedInput(fields, parsed);
      if (input === null) {
        return fail(
          422,
          "model-output-invalid",
          "The model output does not conform to the resource's input " +
            "schema. Retry, or compose the input by hand.",
        );
      }
      return Object.freeze({
        status: 200,
        body: Object.freeze({ input, fields }),
      });
    },
  });
}
