import { chmod, mkdtemp, readFile, realpath, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { evaluateFiveNorthWalletPreflight } from "../src/five-north-wallet-preflight.js";
import { writeFiveNorthWalletPreflightReport } from "../src/five-north-wallet-preflight-report.js";

const AGENT = "sotto-agent::1220agent";
const PAYER = "sotto-payer::1220payer";

it("writes only a mode-0600 redacted wallet preflight report", async () => {
  const workspaceRoot = await realpath(
    await mkdtemp(join(tmpdir(), "sotto-preflight-")),
  );
  await chmod(workspaceRoot, 0o700);
  const result = evaluateFiveNorthWalletPreflight(
    {
      agentParty: AGENT,
      agentPartyVisible: true,
      authenticatedSubject: "private-authenticated-subject",
      executeRouteReachable: true,
      externalPartyTopologySupported: true,
      packageVisible: true,
      preferredPackageConfirmed: true,
      prepareRouteReachable: true,
      rights: [{ kind: "execute-as", party: AGENT }, { kind: "execute-any" }],
      synchronizerConfirmed: true,
    },
    { agentParty: AGENT, payerParty: PAYER },
  );

  const path = await writeFiveNorthWalletPreflightReport({
    observedAt: "2026-07-16T06:45:00.000Z",
    result,
    sourceCommit: "a".repeat(40),
    workspaceRoot,
  });
  const contents = await readFile(path, "utf8");

  expect(path).toBe(
    join(
      workspaceRoot,
      ".thoughts/research/2026-07-15-five-north-wallet-preflight.md",
    ),
  );
  expect((await stat(path)).mode & 0o777).toBe(0o600);
  expect(contents).toContain("Verdict: `UNSUPPORTED`");
  expect(contents).toContain("PAYER_AUTHORITY_PRESENT");
  for (const privateValue of [
    "private-authenticated-subject",
    AGENT,
    PAYER,
    "Bearer ",
    "topologyTransactions",
  ]) {
    expect(contents).not.toContain(privateValue);
  }
});
