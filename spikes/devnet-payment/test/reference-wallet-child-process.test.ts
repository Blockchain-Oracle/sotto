import { expect, it, vi } from "vitest";
import { createReferenceWalletInteractiveExchange } from "../src/reference-wallet-child-process.js";

it("cannot auto-enter the wallet approval confirmation", async () => {
  const runInteractive = vi.fn(async (input: Record<string, unknown>) => {
    expect(input).not.toHaveProperty("standardInput");
  });
  const exchange = createReferenceWalletInteractiveExchange(
    {
      keyFile: "/wallet/payer.key",
      policyFile: "/wallet/policy.json",
      rootDirectory: "/wallet/.capability-wallet",
      workspaceRoot: "/workspace",
    },
    { runInteractive },
  );
  const signal = new AbortController().signal;

  await exchange("a".repeat(64), { signal });

  expect(runInteractive).toHaveBeenCalledOnce();
  expect(runInteractive).toHaveBeenCalledWith({
    arguments: [
      "--root",
      "/wallet/.capability-wallet",
      "--handoff-id",
      "a".repeat(64),
      "--policy-file",
      "/wallet/policy.json",
      "--approve",
      "--key-file",
      "/wallet/payer.key",
    ],
    script: "/workspace/spikes/capability-wallet/src/reference-wallet-cli.ts",
    signal,
    workspaceRoot: "/workspace",
  });
});
