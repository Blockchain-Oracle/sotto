import { describe, expect, it } from "vitest";
import {
  createOpenRpcRequest,
  OPENRPC_METHOD_NOT_FOUND,
  readOpenRpcResult,
} from "../src/openrpc-capability-wallet-jsonrpc.js";

export function registerRawOpenRpcSecurityCases(): void {
  describe("strict raw JSON-RPC transport", () => {
    it("creates a correlated JSON-RPC 2.0 request", () => {
      const request = createOpenRpcRequest("sotto_test", { value: 1 });

      expect(request).toEqual({
        id: expect.stringMatching(/^sotto-openrpc-[0-9a-f]{32}$/u),
        jsonrpc: "2.0",
        method: "sotto_test",
        params: { value: 1 },
      });
      expect(
        readOpenRpcResult(
          { id: request.id, jsonrpc: "2.0", result: "ok" },
          request.id,
        ),
      ).toBe("ok");
    });

    it.each([
      ["wrong version", (id: string) => ({ id, jsonrpc: "1.0", result: {} })],
      [
        "wrong id",
        () => ({ id: "sotto-openrpc-wrong", jsonrpc: "2.0", result: {} }),
      ],
      [
        "result and error",
        (id: string) => ({
          error: { code: -32601, message: "Method not found" },
          id,
          jsonrpc: "2.0",
          result: {},
        }),
      ],
      [
        "extra field",
        (id: string) => ({ id, jsonrpc: "2.0", result: {}, x: 1 }),
      ],
    ])("rejects a %s response", (_name, response) => {
      const request = createOpenRpcRequest("sotto_test", {});
      expect(() => readOpenRpcResult(response(request.id), request.id)).toThrow(
        /OpenRPC/iu,
      );
    });

    it.each([
      ["fractional code", { code: -32601.5, message: "Method not found" }],
      ["string code", { code: "-32601", message: "Method not found" }],
      ["missing message", { code: -32601 }],
      ["extra member", { code: -32601, message: "Method not found", x: 1 }],
    ])("rejects a malformed %s error object", (_name, error) => {
      const request = createOpenRpcRequest("sotto_test", {});
      expect(() =>
        readOpenRpcResult(
          { error, id: request.id, jsonrpc: "2.0" },
          request.id,
        ),
      ).toThrow("OpenRPC wallet error object is invalid");
    });

    it("maps only canonical method-not-found", () => {
      const request = createOpenRpcRequest("sotto_test", {});
      expect(
        readOpenRpcResult(
          {
            error: { code: -32601, message: "Method not found" },
            id: request.id,
            jsonrpc: "2.0",
          },
          request.id,
        ),
      ).toBe(OPENRPC_METHOD_NOT_FOUND);
    });
  });
}
