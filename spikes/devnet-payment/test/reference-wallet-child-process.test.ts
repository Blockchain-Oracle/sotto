import { expect, it, vi } from "vitest";
import {
  createReferenceWalletInteractiveExchange,
  createReferenceWalletPolicyExchange,
} from "../src/reference-wallet-child-process.js";

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

it("runs policy-authorized signing without terminal input", async () => {
  const runChild = vi.fn(async () => "policy-approved");
  const exchange = createReferenceWalletPolicyExchange(
    {
      keyFile: "/wallet/payer.key",
      policyFile: "/wallet/policy.json",
      rootDirectory: "/wallet/.capability-wallet",
      workspaceRoot: "/workspace",
    },
    { runChild },
  );
  const signal = new AbortController().signal;

  await exchange("b".repeat(64), { signal });

  expect(runChild).toHaveBeenCalledWith({
    arguments: [
      "--root",
      "/wallet/.capability-wallet",
      "--handoff-id",
      "b".repeat(64),
      "--policy-file",
      "/wallet/policy.json",
      "--policy-authorized",
      "--key-file",
      "/wallet/payer.key",
    ],
    script: "/workspace/spikes/capability-wallet/src/reference-wallet-cli.ts",
    signal,
    workspaceRoot: "/workspace",
  });
});
