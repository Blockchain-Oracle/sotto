import { describe, expect, it } from "vitest";
import * as publicApi from "../src/index.js";

describe("reference wallet public API isolation", () => {
  it("does not expose wallet-only approval or raw signing capabilities", () => {
    expect(publicApi).not.toHaveProperty("runReferenceWalletApproval");
    expect(publicApi).not.toHaveProperty("SDK");
    expect(publicApi).not.toHaveProperty("signTransactionHash");
  });

  it("keeps the Sotto-side connector available", () => {
    expect(publicApi.createReferenceWalletConnector).toBeTypeOf("function");
    expect(publicApi.createWalletHandoffStorage).toBeTypeOf("function");
  });
});
