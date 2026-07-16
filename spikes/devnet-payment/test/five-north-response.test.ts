import { expect, it } from "vitest";
import {
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

it("keeps malformed successful JSON outside unsupported classification", () => {
  expect(() =>
    parseFiveNorthJson(new TextEncoder().encode("not-json"), "preflight"),
  ).toThrow("not valid JSON");
});
