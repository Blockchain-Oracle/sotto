import { describe, expect, it, vi } from "vitest";
import { buildFiveNorthPreapprovalProposal } from "../src/five-north-preapproval-proposal.js";
import { createFiveNorthPreapprovalSubmitter } from "../src/five-north-preapproval-submitter.js";
import type { SpikeConfig } from "../src/config.js";

const network: SpikeConfig["network"] = {
  audience: "validator-devnet-m2m",
  clientId: "validator-devnet-m2m",
  clientSecret: "test-secret",
  issuerUrl:
    "https://auth.sandbox.fivenorth.io/application/o/validator-devnet-m2m",
  ledgerUrl: "https://ledger-api.validator.devnet.sandbox.fivenorth.io",
  scope: "daml_ledger_api",
  tokenUrl: "https://auth.sandbox.fivenorth.io/application/o/token/",
  validatorUrl:
    "https://wallet.validator.devnet.sandbox.fivenorth.io/api/validator",
};
const request = buildFiveNorthPreapprovalProposal({
  expectedDso: `DSO::1220${"3".repeat(64)}`,
  packageId: "f".repeat(64),
  receiverParty: `sotto-spike-provider::1220${"1".repeat(64)}`,
  synchronizerId: `global-domain::1220${"4".repeat(64)}`,
  userId: "ledger-user-6",
  validatorParty: `five-north-validator::1220${"2".repeat(64)}`,
});

describe("Five North preapproval submitter", () => {
  it("exposes only one authenticated proposal submission", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      void init;
      if (url === network.tokenUrl) {
        return Response.json({
          access_token: "opaque-token",
          expires_in: 3600,
        });
      }
      if (url.endsWith("/v2/commands/submit-and-wait-for-transaction")) {
        return Response.json({ transaction: { commandId: request.commandId } });
      }
      throw new Error(`unexpected URL ${url}`);
    });
    const submit = createFiveNorthPreapprovalSubmitter(network, {
      fetcher,
      signal: new AbortController().signal,
    });

    await expect(submit(request)).resolves.toEqual({
      transaction: { commandId: request.commandId },
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [, init] = fetcher.mock.calls[1]!;
    expect(JSON.parse(String(init?.body))).toEqual({ commands: request });
  });

  it("rejects a cloned request before token or network access", async () => {
    const fetcher = vi.fn();
    const submit = createFiveNorthPreapprovalSubmitter(network, {
      fetcher,
      signal: new AbortController().signal,
    });

    await expect(submit(structuredClone(request))).rejects.toThrow(
      "not authenticated",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});
