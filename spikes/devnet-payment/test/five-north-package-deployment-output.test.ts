import { describe, expect, it } from "vitest";
import { formatFiveNorthPackageDeploymentResult } from "../src/five-north-package-deployment-output.js";

describe("Five North package deployment output", () => {
  it("serializes only redacted package-presence evidence", () => {
    const output = formatFiveNorthPackageDeploymentResult({
      authenticatedUserSha256: `sha256:${"a".repeat(64)}`,
      clientSecret: "do-not-print",
      darSha256: `sha256:${"b".repeat(64)}`,
      operationId: `sha256:${"c".repeat(64)}`,
      outcome: "present-after-dispatch",
      packageId: "d".repeat(64),
      sourceCommit: "e".repeat(40),
      status: "present",
      synchronizerId: `global-domain::1220${"f".repeat(64)}`,
    });

    expect(JSON.parse(output)).toEqual({
      darSha256: `sha256:${"b".repeat(64)}`,
      operationId: `sha256:${"c".repeat(64)}`,
      outcome: "present-after-dispatch",
      packageId: "d".repeat(64),
      readiness: "not-proven",
      sourceCommit: "e".repeat(40),
      status: "present",
      vetting: "not-requested",
    });
    expect(output).not.toContain("do-not-print");
    expect(output).not.toContain("authenticatedUserSha256");
    expect(output).not.toContain("synchronizerId");
  });
});
