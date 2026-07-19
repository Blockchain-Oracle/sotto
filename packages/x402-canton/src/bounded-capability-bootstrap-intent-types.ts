import type { BoundedCapabilityBootstrapRequest } from "./bounded-capability-bootstrap.js";

export type PersistedBootstrapIntentV1 = Readonly<{
  request: unknown;
  schema: "sotto-capability-bootstrap-intent-v1";
  sourceCommit: string;
  validatedAt: string;
}>;

export type PersistedBootstrapIntentV2 = Readonly<{
  network: `canton:${string}`;
  request: BoundedCapabilityBootstrapRequest;
  schema: "sotto-capability-bootstrap-intent-v2";
  sourceCommit: string;
  validatedAt: string;
}>;

export type PersistedBootstrapIntent =
  PersistedBootstrapIntentV1 | PersistedBootstrapIntentV2;

export type LegacyBootstrapIntentRestoreOptions = Readonly<{
  legacyNetwork: `canton:${string}`;
}>;
