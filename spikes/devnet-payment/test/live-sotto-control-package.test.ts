import { describe, expect, it, vi } from "vitest";
import type { VerifiedSottoControlDar } from "../src/five-north-dar-artifact.js";
import type { FiveNorthPackageDeploymentTransport } from "../src/five-north-package-deployment.js";
import { runLiveSottoControlPackage } from "../src/live-sotto-control-package.js";

const environment = {
  FIVE_NORTH_LEDGER_URL: "https://ledger.example",
  FIVE_NORTH_OIDC_AUDIENCE: "ledger-audience",
  FIVE_NORTH_OIDC_CLIENT_ID: "client",
  FIVE_NORTH_OIDC_CLIENT_SECRET: "secret-value",
  FIVE_NORTH_OIDC_ISSUER_URL: "https://issuer.example",
  FIVE_NORTH_OIDC_SCOPE: "ledger-scope",
  FIVE_NORTH_OIDC_TOKEN_URL: "https://issuer.example/token/",
  FIVE_NORTH_VALIDATOR_URL: "https://validator.example/api/validator",
};

describe("live sotto-control package command", () => {
  it("runs only the journaled deployment and writes redacted presence", async () => {
    const artifact = {
      darByteLength: 697_883,
      darSha256: `sha256:${"a".repeat(64)}`,
      packageId: "b".repeat(64),
      sourceCommit: "c".repeat(40),
    } as unknown as VerifiedSottoControlDar;
    const transport = {} as FiveNorthPackageDeploymentTransport;
    let scopeSignal: AbortSignal | undefined;
    const loadEnvironment = vi.fn();
    const loadArtifact = vi.fn(async () => artifact);
    const createTransport = vi.fn((_network, options) => {
      scopeSignal = options.signal;
      return transport;
    });
    const start = vi.fn(async () => ({
      darSha256: artifact.darSha256,
      operationId: `sha256:${"d".repeat(64)}`,
      outcome: "present-after-dispatch" as const,
      packageId: artifact.packageId,
      sourceCommit: artifact.sourceCommit,
      status: "present" as const,
    }));
    const write = vi.fn();

    await runLiveSottoControlPackage({
      createTransport,
      environment,
      loadArtifact,
      loadEnvironment,
      start,
      workspaceRoot: "/workspace",
      write,
    });

    expect(loadEnvironment).toHaveBeenCalledWith("/workspace/.env.local");
    expect(loadArtifact).toHaveBeenCalledWith({
      workspaceRoot: "/workspace",
    });
    expect(start).toHaveBeenCalledWith({
      artifact,
      transport,
      workspaceRoot: "/workspace",
    });
    expect(scopeSignal?.aborted).toBe(true);
    expect(JSON.parse(String(write.mock.calls[0]![0]))).toMatchObject({
      readiness: "not-proven",
      status: "present",
      vetting: "not-requested",
    });
    expect(String(write.mock.calls[0]![0])).not.toContain("secret-value");
  });
});
