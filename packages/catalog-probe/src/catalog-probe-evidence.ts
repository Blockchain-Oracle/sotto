import { createHash } from "node:crypto";
import type {
  NonX402ProbeResult,
  ResourceHealthInput,
  Sha256Identifier,
  VerifiedX402ProbeResult,
} from "@sotto/database";
import type { CatalogProbeInput } from "./catalog-probe-types.js";

export function catalogProbeOperationHash(
  input: CatalogProbeInput,
  expectedNetwork: `canton:${string}`,
): Sha256Identifier {
  const digest = createHash("sha256")
    .update("sotto-catalog-probe-operation-v1\0", "utf8")
    .update(
      JSON.stringify({
        description: input.description,
        expectedNetwork,
        method: input.method,
        name: input.name,
        observationId: input.observationId,
        originId: input.originId,
        resourceId: input.resourceId,
        revisionId: input.revisionId,
        routeTemplate: input.routeTemplate,
      }),
      "utf8",
    )
    .digest("hex");
  return `sha256:${digest}`;
}

export function catalogProbeEvidenceHash(
  input: Readonly<{
    httpStatus: number;
    observedAt: string;
    requestCommitment: string;
    result: VerifiedX402ProbeResult | NonX402ProbeResult;
  }>,
): Sha256Identifier {
  const digest = createHash("sha256")
    .update("sotto-catalog-probe-evidence-v1\0", "utf8")
    .update(JSON.stringify(input), "utf8")
    .digest("hex");
  return `sha256:${digest}`;
}

export function catalogProbeHealthEvidenceHash(
  input: Readonly<{
    latencyMilliseconds: number;
    observedAt: string;
    operationHash: Sha256Identifier;
    requestCommitment: string;
    result: ResourceHealthInput["result"];
  }>,
): Sha256Identifier {
  const digest = createHash("sha256")
    .update("sotto-catalog-probe-health-v1\0", "utf8")
    .update(JSON.stringify(input), "utf8")
    .digest("hex");
  return `sha256:${digest}`;
}
