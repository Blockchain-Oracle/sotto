import { expect, it } from "vitest";
import {
  FiveNorthRequestFailure,
  isFiveNorthUnsupportedResponse,
  parseFiveNorthJson,
  readFiveNorthResponse,
} from "../src/five-north-response.js";

it("classifies only exact unsupported HTTP statuses", async () => {
  const unsupported = await readFiveNorthResponse(
    Response.json({ code: "NOT_FOUND" }, { status: 404 }),
    1_024,
  ).catch((error: unknown) => error);
  const forbidden = await readFiveNorthResponse(
    Response.json({ code: "PERMISSION_DENIED" }, { status: 403 }),
    1_024,
  ).catch((error: unknown) => error);

  expect(isFiveNorthUnsupportedResponse(unsupported)).toBe(true);
  expect(isFiveNorthUnsupportedResponse(forbidden)).toBe(false);
});

it("preserves only a sanitized missing-authority classification", async () => {
  const error = await readFiveNorthResponse(
    Response.json(
      {
        code: "INVALID_ARGUMENT",
        message:
          "requires authorizers sotto-payer::private but only sotto-agent::private were given",
      },
      { status: 400 },
    ),
    1_024,
  ).catch((failure: unknown) => failure);

  expect(error).toBeInstanceOf(FiveNorthRequestFailure);
  expect(error).toMatchObject({
    code: "MISSING_REQUIRED_AUTHORIZERS",
    message:
      "Five North request failed with HTTP 400 (MISSING_REQUIRED_AUTHORIZERS)",
    status: 400,
  });
  expect(JSON.stringify(error)).not.toContain("sotto-payer");
  expect(JSON.stringify(error)).not.toContain("sotto-agent");
});

it("does not upgrade a generic authorization failure to missing authorizers", async () => {
  const error = await readFiveNorthResponse(
    Response.json(
      {
        code: "INVALID_ARGUMENT",
        message: "authorization failed for private detail",
      },
      { status: 400 },
    ),
    1_024,
  ).catch((failure: unknown) => failure);

  expect(error).toMatchObject({ code: "AUTHORIZATION_REJECTED", status: 400 });
});

it("keeps malformed successful JSON outside unsupported classification", () => {
  expect(() =>
    parseFiveNorthJson(new TextEncoder().encode("not-json"), "preflight"),
  ).toThrow("not valid JSON");
});
