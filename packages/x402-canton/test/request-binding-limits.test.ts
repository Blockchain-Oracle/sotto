import { describe, expect, it } from "vitest";
import { commitHttpRequest } from "../src/index.js";

const URL = "https://provider.example/paid";

describe("HTTP request commitment limits", () => {
  it("accepts a 1 MiB body and rejects one extra byte", () => {
    expect(() =>
      commitHttpRequest({
        body: new Uint8Array(1_048_576),
        method: "POST",
        url: URL,
      }),
    ).not.toThrow();
    expect(() =>
      commitHttpRequest({
        body: new Uint8Array(1_048_577),
        method: "POST",
        url: URL,
      }),
    ).toThrow("body exceeds");
  });

  it("accepts 128 raw headers and rejects one extra tuple", () => {
    const headers = Array.from(
      { length: 129 },
      (_, index) => [`x-ignored-${index}`, "value"] as const,
    );
    expect(() =>
      commitHttpRequest({
        headers: headers.slice(0, 128),
        method: "GET",
        url: URL,
      }),
    ).not.toThrow();
    expect(() =>
      commitHttpRequest({ headers, method: "GET", url: URL }),
    ).toThrow("header tuples");
  });

  it("accepts 61 additional authoritative names and rejects one extra", () => {
    const names = Array.from({ length: 62 }, (_, index) => `x-sotto-${index}`);
    expect(() =>
      commitHttpRequest({
        additionalAuthoritativeHeaders: names.slice(0, 61),
        method: "GET",
        url: URL,
      }),
    ).not.toThrow();
    expect(() =>
      commitHttpRequest({
        additionalAuthoritativeHeaders: names,
        method: "GET",
        url: URL,
      }),
    ).toThrow("authoritative headers");
  });

  it("rejects an oversized URL and canonical representation", () => {
    const urlPrefix = `${URL}?q=`;
    const exactUrl = `${urlPrefix}${"a".repeat(8_192 - Buffer.byteLength(urlPrefix))}`;
    expect(() =>
      commitHttpRequest({ method: "GET", url: exactUrl }),
    ).not.toThrow();
    expect(() =>
      commitHttpRequest({ method: "GET", url: `${exactUrl}a` }),
    ).toThrow("URL exceeds");

    const names = Array.from({ length: 8 }, (_, index) => `x-large-${index}`);
    const empty = commitHttpRequest({
      additionalAuthoritativeHeaders: names,
      headers: names.map((name) => [name, ""] as const),
      method: "GET",
      url: URL,
    });
    const remaining = 65_536 - empty.canonicalBytes.byteLength;
    const values = names.map((_, index) =>
      "a".repeat(
        Math.floor(remaining / names.length) +
          (index < remaining % names.length ? 1 : 0),
      ),
    );
    const exactHeaders = names.map(
      (name, index) => [name, values[index]!] as const,
    );
    expect(
      commitHttpRequest({
        additionalAuthoritativeHeaders: names,
        headers: exactHeaders,
        method: "GET",
        url: URL,
      }).canonicalBytes,
    ).toHaveLength(65_536);
    const oversizedHeaders = exactHeaders.map((header, index) =>
      index === 0 ? ([header[0], `${header[1]}a`] as const) : header,
    );
    expect(() =>
      commitHttpRequest({
        additionalAuthoritativeHeaders: names,
        headers: oversizedHeaders,
        method: "GET",
        url: URL,
      }),
    ).toThrow("canonical request exceeds");
  });
});
