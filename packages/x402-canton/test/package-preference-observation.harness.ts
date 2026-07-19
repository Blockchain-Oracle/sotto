import { vi } from "vitest";
import type {
  claimScope,
  observationScope,
} from "./package-preference-observation.fixtures.js";
import {
  OBSERVED_AT,
  SUBJECT,
} from "./package-preference-observation.fixtures.js";

export type ReadRequest = Readonly<{
  packageRequirements: ReadonlyArray<
    Readonly<{ packageName: string; parties: ReadonlyArray<string> }>
  >;
  synchronizerId: string;
  vettingValidAt: string;
}>;

export type Reader = Readonly<{
  readAuthenticatedSubject(): Promise<unknown>;
  readPackageReferences(request: ReadRequest): Promise<unknown>;
}>;

export type Observation = Readonly<{
  observationId: string;
  observedAt: string;
}>;

export type Projection = Readonly<{
  version: string;
  closureHash: string;
  references: ReadonlyArray<
    Readonly<{
      packageId: string;
      packageName: string;
      packageVersion: string;
      artifactIds: ReadonlyArray<string>;
    }>
  >;
  packageIds: ReadonlyArray<string>;
  parties: ReadonlyArray<string>;
  synchronizerId: string;
  vettingValidAt: string;
  acquiredAt: string;
  authenticatedSubject: string;
}>;

export type SubjectModule = Readonly<{
  createPackagePreferenceObserver(
    reader: Reader,
  ): (scope: ReturnType<typeof observationScope>) => Promise<Observation>;
  claimPackagePreferenceObservation(
    observation: unknown,
    scope: ReturnType<typeof claimScope>,
  ): Projection;
}>;

export type GetSubject = () => SubjectModule;

export async function withObservedClock(
  run: () => Promise<void>,
): Promise<void> {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(OBSERVED_AT));
  try {
    await run();
  } finally {
    vi.useRealTimers();
  }
}

export function reader(
  references: unknown,
  requests: ReadRequest[] = [],
  subjects: readonly unknown[] | undefined = [SUBJECT, SUBJECT],
  duringRead: () => void = () => undefined,
): Reader {
  const subjectValues = subjects ?? [SUBJECT, SUBJECT];
  let subjectIndex = 0;
  return {
    readAuthenticatedSubject: async () => subjectValues[subjectIndex++],
    readPackageReferences: async (request) => {
      requests.push(request);
      duringRead();
      return references;
    },
  };
}
