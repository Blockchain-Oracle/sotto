import { chmod, mkdtemp, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { runFiveNorthWalletPreflight } from "../src/five-north-wallet-preflight-runner.js";

const AGENT = "sotto-agent::1220agent";
const PAYER = "sotto-payer::1220payer";

it("runs one preflight and returns only its redacted result", async () => {
  const workspaceRoot = await realpath(
    await mkdtemp(join(tmpdir(), "sotto-preflight-runner-")),
  );
  await chmod(workspaceRoot, 0o700);
  const collect = vi.fn(async () => ({
    agentParty: AGENT,
    agentPartyVisible: true,
    authenticatedSubject: "private-subject",
    executeRouteReachable: true,
    externalPartyTopologySupported: true,
    packageVisible: true,
    preferredPackageConfirmed: true,
    prepareRouteReachable: true,
    rights: [{ kind: "execute-as" as const, party: AGENT }],
    synchronizerConfirmed: true,
  }));

  const output = await runFiveNorthWalletPreflight({
    agentParty: AGENT,
    collect,
    payerParty: PAYER,
    sourceCommit: "b".repeat(40),
    workspaceRoot,
  });

  expect(collect).toHaveBeenCalledOnce();
  expect(collect).toHaveBeenCalledWith({
    agentParty: AGENT,
    payerParty: PAYER,
  });
  expect(output.result.verdict).toBe("SUPPORTED");
  expect(output.reportPath).toMatch(/five-north-wallet-preflight\.md$/u);
  expect(JSON.stringify(output)).not.toContain("private-subject");
});
