import { describe, expect, it } from "vitest";
import { commitResourceRoute } from "../src/resource-route.js";

const resource = "https://provider.example/paid/weather?units=metric";

describe("commitResourceRoute", () => {
  it("matches the pinned sotto-resource-v1 vector", () => {
    expect(commitResourceRoute(resource)).toBe(
      "sha256:f8fe5b158e6d56ef4b320ace4f94600f36c6401e69604469ebc20e45f42605bc",
    );
  });

  it("binds origin and path while intentionally excluding query", () => {
    expect(commitResourceRoute(`${resource}&lang=en`)).toBe(
      commitResourceRoute(resource),
    );
    expect(commitResourceRoute("https://other.example/paid/weather")).not.toBe(
      commitResourceRoute(resource),
    );
    expect(
      commitResourceRoute("https://provider.example/paid/report"),
    ).not.toBe(commitResourceRoute(resource));
  });

  it.each([
    "http://provider.example/paid/weather",
    "https://user@provider.example/paid/weather",
    "https://provider.example/paid/weather#private",
  ])("rejects an unsafe resource URL: %s", (url) => {
    expect(() => commitResourceRoute(url)).toThrow("resource URL");
  });
});
