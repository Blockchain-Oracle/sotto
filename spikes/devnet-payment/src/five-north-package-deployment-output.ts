export type FiveNorthPackageDeploymentResult = Readonly<
  Record<string, unknown> & {
    darSha256: string;
    operationId: string;
    outcome:
      "already-present" | "dispatch-unresolved" | "present-after-dispatch";
    packageId: string;
    sourceCommit: string;
    status: "present" | "unknown";
  }
>;

export function formatFiveNorthPackageDeploymentResult(
  result: FiveNorthPackageDeploymentResult,
): string {
  return `${JSON.stringify(
    {
      darSha256: result.darSha256,
      operationId: result.operationId,
      outcome: result.outcome,
      packageId: result.packageId,
      readiness: "not-proven",
      sourceCommit: result.sourceCommit,
      status: result.status,
      vetting: "not-requested",
    },
    null,
    2,
  )}\n`;
}
