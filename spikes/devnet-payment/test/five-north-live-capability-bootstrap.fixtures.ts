import {
  SOTTO_CONTROL_PACKAGE_ID,
  type BoundedCapabilityBootstrapRequest,
} from "@sotto/x402-canton";
import { loadCapabilityBootstrapJournalState } from "../src/capability-bootstrap-journal.js";
import { AmbiguousTransactionSubmissionError } from "../src/five-north-transaction-submit.js";
import {
  activeCapability,
  DSO,
  factoryResponse,
  holdingEntry,
  submissionResponse,
  SYNCHRONIZER,
  USER_ID,
} from "./five-north-live-capability-bootstrap-values.fixtures.js";

export {
  activeCapability,
  AGENT,
  CONTRACT,
  DSO,
  exactBootstrapRequest,
  FACTORY,
  PAYER,
  PROVIDER,
  RESOURCE,
  SOURCE_COMMIT,
  SYNCHRONIZER,
} from "./five-north-live-capability-bootstrap-values.fixtures.js";

export type FixtureNetworkCounts = Record<
  | "acs"
  | "ledgerEnd"
  | "package"
  | "preferred"
  | "registry"
  | "rules"
  | "submit"
  | "token",
  number
>;

export const EMPTY_COUNTS: Readonly<FixtureNetworkCounts> = Object.freeze({
  acs: 0,
  ledgerEnd: 0,
  package: 0,
  preferred: 0,
  registry: 0,
  rules: 0,
  submit: 0,
  token: 0,
});

export function createLiveBootstrapFixture(
  workspaceRoot: string,
  mode: "ambiguous" | "success" = "success",
) {
  const counts: FixtureNetworkCounts = { ...EMPTY_COUNTS };
  const order: string[] = [];
  let active: unknown[] = [];
  let submittedRequest: BoundedCapabilityBootstrapRequest | undefined;
  let journalWasDurable = false;
  const authenticatedUser = async () => {
    counts.token = 1;
    return USER_ID;
  };
  const transport = {
    factory: {
      holdings: {
        readLedgerEnd: async () => {
          counts.ledgerEnd += 1;
          return { offset: 42 };
        },
        readActiveContracts: async () => {
          counts.acs += 1;
          return [holdingEntry()];
        },
      },
      readAuthenticatedUserId: authenticatedUser,
      registry: async () => {
        counts.registry += 1;
        order.push("factory");
        return factoryResponse();
      },
    },
    networkCallCounts: () => Object.freeze({ ...counts }),
    readActiveCapabilities: async () => {
      counts.ledgerEnd += 1;
      counts.acs += 1;
      return active;
    },
    readiness: {
      readAmuletRules: async () => {
        counts.rules += 1;
        order.push("readiness");
        return {
          amulet_rules: {
            contract: { payload: { dso: DSO } },
            domain_id: SYNCHRONIZER,
          },
        };
      },
      readAuthenticatedUserId: authenticatedUser,
      readPackagePresence: async () => {
        counts.package += 1;
        return {
          archivePayloadSha256: SOTTO_CONTROL_PACKAGE_ID,
          packageId: SOTTO_CONTROL_PACKAGE_ID,
        };
      },
      readPreferredSottoPackage: async () => {
        counts.preferred += 1;
        return {
          packageReferences: [
            {
              packageId: SOTTO_CONTROL_PACKAGE_ID,
              packageName: "sotto-control",
              packageVersion: "0.2.0",
            },
          ],
          synchronizerId: SYNCHRONIZER,
        };
      },
    },
    submit: async (request: BoundedCapabilityBootstrapRequest) => {
      counts.submit += 1;
      order.push("submit");
      submittedRequest = request;
      journalWasDurable = (
        await loadCapabilityBootstrapJournalState(workspaceRoot)
      ).submissionStarted;
      if (mode === "ambiguous") {
        throw new AmbiguousTransactionSubmissionError();
      }
      active = [activeCapability(request)];
      return submissionResponse(request);
    },
  };
  return {
    get active() {
      return active;
    },
    get journalWasDurable() {
      return journalWasDurable;
    },
    order,
    setActive(value: unknown[]) {
      active = value;
    },
    get submittedRequest() {
      return submittedRequest;
    },
    transport,
  };
}
