import { beforeAll } from "vitest";
import { registerFiveNorthPreferenceContractCases } from "./five-north-package-preference-contract.cases.js";
import { registerFiveNorthPreferenceHardeningCases } from "./five-north-package-preference-hardening.cases.js";
import type { SubjectModule } from "./five-north-package-preference.harness.js";
import { registerFiveNorthPreferenceSecurityCases } from "./five-north-package-preference-security.cases.js";

let subject: SubjectModule;

beforeAll(async () => {
  const subjectPath = "../src/five-north-package-preference.js";
  try {
    subject = (await import(subjectPath)) as SubjectModule;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("five-north-package-preference")
    ) {
      throw new Error("FIVE_NORTH_PACKAGE_PREFERENCE_NOT_IMPLEMENTED", {
        cause: error,
      });
    }
    throw error;
  }
});

const getSubject = (): SubjectModule => subject;

registerFiveNorthPreferenceContractCases(getSubject);
registerFiveNorthPreferenceHardeningCases(getSubject);
registerFiveNorthPreferenceSecurityCases(getSubject);
