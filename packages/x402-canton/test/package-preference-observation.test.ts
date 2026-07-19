import { beforeAll } from "vitest";
import { registerPackagePreferenceAuthorityCases } from "./package-preference-observation-authority.cases.js";
import type { SubjectModule } from "./package-preference-observation.harness.js";
import { registerPackagePreferenceLifetimeCases } from "./package-preference-observation-lifetime.cases.js";
import { registerPackagePreferenceScopeCases } from "./package-preference-observation-scope.cases.js";

let subject: SubjectModule;

beforeAll(async () => {
  const subjectPath = "../src/package-preference-observation.js";
  try {
    subject = (await import(subjectPath)) as SubjectModule;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("package-preference-observation")
    ) {
      throw new Error("PACKAGE_OBSERVATION_NOT_IMPLEMENTED", { cause: error });
    }
    throw error;
  }
});

const getSubject = (): SubjectModule => subject;

registerPackagePreferenceScopeCases(getSubject);
registerPackagePreferenceAuthorityCases(getSubject);
registerPackagePreferenceLifetimeCases(getSubject);
