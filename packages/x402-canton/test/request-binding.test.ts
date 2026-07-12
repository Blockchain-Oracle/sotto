import { describe, expect, it } from "vitest";
import { commitHttpRequest } from "../src/request-binding.js";

const body = new TextEncoder().encode('{"task":"café"}');
const baseInput = {
  body,
  headers: [
    ["Idempotency-Key", " attempt-1 "],
    ["Content-Type", " application/json "],
  ] as const,
  method: "post",
  url: "https://EXAMPLE.com:443/pay?b=2&a=1",
};

describe("commitHttpRequest", () => {
  it("produces the pinned sotto-http-request-v1 commitment", () => {
    const result = commitHttpRequest(baseInput);

    expect(new TextDecoder().decode(result.canonicalBytes)).toBe(
      '{"version":"sotto-http-request-v1","method":"POST","url":"https://example.com/pay?b=2&a=1","headers":[{"name":"content-encoding","value":""},{"name":"content-type","value":"application/json"},{"name":"idempotency-key","value":"attempt-1"}],"bodySha256":"2d84908757e0a97d880563f4d23fdcbd9d65e9137b9f59794eabe39fccb3608d"}',
    );
    expect(result).toMatchObject({
      bodySha256:
        "2d84908757e0a97d880563f4d23fdcbd9d65e9137b9f59794eabe39fccb3608d",
      commitment:
        "sha256:b742d0a16c15ecd090a596bf2f5b52e836301fbd851d9ac63b2fd2b7cac9ac08",
      version: "sotto-http-request-v1",
    });
  });

  it("ignores the v2 payment signature transport header", () => {
    const unpaid = commitHttpRequest(baseInput);
    const paid = commitHttpRequest({
      ...baseInput,
      headers: [...baseInput.headers, ["PAYMENT-SIGNATURE", "private-proof"]],
    });

    expect(paid.commitment).toBe(unpaid.commitment);
  });

  it.each([
    ["method", { method: "PUT" }],
    ["path", { url: "https://example.com/other?b=2&a=1" }],
    ["query", { url: "https://example.com/pay?a=1&b=2" }],
    ["content type", { headers: [["content-type", "text/plain"]] }],
    ["body", { body: new TextEncoder().encode('{"task":"cafe"}') }],
  ])("changes the commitment after a %s mutation", (_name, mutation) => {
    const original = commitHttpRequest(baseInput);
    const changed = commitHttpRequest({ ...baseInput, ...mutation });

    expect(changed.commitment).not.toBe(original.commitment);
  });

  it("binds sorted resource-specific authoritative headers", () => {
    const result = commitHttpRequest({
      ...baseInput,
      additionalAuthoritativeHeaders: ["x-task-mode", "accept"],
      headers: [
        ...baseInput.headers,
        ["X-Task-Mode", " precise "],
        ["Accept", " application/json "],
      ],
    });
    const canonical = new TextDecoder().decode(result.canonicalBytes);

    expect(canonical.indexOf('"name":"accept"')).toBeLessThan(
      canonical.indexOf('"name":"content-encoding"'),
    );
    expect(canonical).toContain(
      '{"name":"x-task-mode","value":"precise"}',
    );
  });

  it.each([
    ["non-HTTPS URL", { url: "http://example.com/pay" }, "HTTPS"],
    ["URL userinfo", { url: "https://user@example.com/pay" }, "userinfo"],
    ["URL fragment", { url: "https://example.com/pay#private" }, "fragment"],
    ["invalid method", { method: "PO ST" }, "method"],
    [
      "duplicate authoritative header",
      {
        headers: [
          ["Content-Type", "application/json"],
          ["content-type", "text/plain"],
        ],
      },
      "Duplicate",
    ],
    [
      "forbidden authoritative header",
      { additionalAuthoritativeHeaders: ["authorization"] },
      "forbidden",
    ],
  ])("rejects %s", (_name, mutation, message) => {
    expect(() => commitHttpRequest({ ...baseInput, ...mutation })).toThrow(
      message,
    );
  });
});
