import { createHash } from "node:crypto";
import type { HumanPurchaseHoldingReader } from "../src/index.js";
import {
  buildReviewedPackagePreferenceClosure,
  claimHumanPackagePreferenceObservation,
  createHumanPackagePreferenceObserver,
} from "../src/index.js";
import { commitHumanPurchaseForTest } from "../src/human-purchase-commitment.js";
import { readHumanPurchaseLedgerIntent } from "../src/human-purchase-ledger-intent.js";
import { comparePackages } from "../src/package-preference-artifact-validation.js";
import {
  HUMAN_PURCHASE_EXPIRES_AT,
  HUMAN_AUTHORIZATION_INSTANCE_ID,
  HUMAN_TOKEN_FACTORY_CONFIGURATION,
  createHumanPurchaseInput,
  type HumanPurchaseFixtureOptions,
} from "./human-purchase-commitment.fixtures.js";
import {
  HUMAN_PAYER,
  HUMAN_SYNCHRONIZER,
} from "./human-payer-identity.fixtures.js";
import { validClosureInput } from "./package-preference-closure.fixtures.js";
import { DSO, PROVIDER } from "./purchase-commitment.fixtures.js";
import { holdingEntry } from "./purchase-holding-observation.fixtures.js";

let authorizationSequence = 0;

export function humanHoldingEntry(contractId: string, amount: string) {
  const entry = holdingEntry(contractId, amount);
  const active = entry.contractEntry.JsActiveContract;
  active.synchronizerId = HUMAN_SYNCHRONIZER;
  active.createdEvent.witnessParties = [HUMAN_PAYER];
  active.createdEvent.interfaceViews[0]!.viewValue.owner = HUMAN_PAYER;
  return entry;
}

export async function authenticatedHumanPurchaseIntent(
  options: HumanPurchaseFixtureOptions = {},
) {
  const input = await createHumanPurchaseInput(options);
  return commitHumanIntent(input);
}

function commitHumanIntent(
  input: Awaited<ReturnType<typeof createHumanPurchaseInput>>,
) {
  return readHumanPurchaseLedgerIntent(
    commitHumanPurchaseForTest(
      input,
      HUMAN_TOKEN_FACTORY_CONFIGURATION,
      `${HUMAN_AUTHORIZATION_INSTANCE_ID}-${++authorizationSequence}`,
    ),
  );
}

export async function authenticatedHumanPurchaseIntentWithWindow(
  seconds: number,
) {
  const input = await createHumanPurchaseInput({
    mutateChallenge: (challenge) => {
      challenge.accepts[0]!.maxTimeoutSeconds = seconds;
      challenge.accepts[0]!.extra.executeBeforeSeconds = seconds;
    },
  });
  return commitHumanIntent(input);
}

function closureForPackage(packageId: string) {
  const input = validClosureInput();
  const artifact = input.artifacts.find(({ name }) => name === "splice-amulet");
  if (artifact === undefined) throw new Error("test splice artifact is absent");
  artifact.mainPackageId = packageId;
  artifact.packages = artifact.packages
    .map((entry) =>
      entry.name === "splice-amulet" ? { ...entry, packageId } : entry,
    )
    .sort(comparePackages);
  artifact.manifestSha256 = createHash("sha256")
    .update(
      `${artifact.packages
        .map(({ name, version, packageId: id }) => `${name}\t${version}\t${id}`)
        .join("\n")}\n`,
    )
    .digest("hex");
  input.artifacts = [artifact];
  input.graphPackages = structuredClone(artifact.packages);
  input.selectablePackageNames = ["splice-amulet"];
  return buildReviewedPackagePreferenceClosure(input);
}

export async function authenticatedHumanPurchaseIntentForPackage(
  packageId: string,
) {
  const input = await createHumanPurchaseInput();
  const closure = closureForPackage(packageId);
  const scope = {
    adminParty: DSO,
    challengeId: input.paymentObservation.challengeId,
    challengeObservedAt: input.paymentObservation.observedAt,
    closure,
    executeBefore: HUMAN_PURCHASE_EXPIRES_AT,
    payerIdentity: input.payerIdentity,
    providerParty: PROVIDER,
    vettingValidAt: "2026-07-16T15:00:30.000Z",
  };
  const observation = await createHumanPackagePreferenceObserver({
    readAuthenticatedSubject: async () => "validator-devnet-m2m",
    readPackageReferences: async () => [
      {
        packageId,
        packageName: "splice-amulet",
        packageVersion: "0.1.21",
      },
    ],
  })(scope);
  const packageSelection = claimHumanPackagePreferenceObservation(
    observation,
    scope,
  );
  return readHumanPurchaseLedgerIntent(
    commitHumanPurchaseForTest(
      { ...input, packageSelection },
      HUMAN_TOKEN_FACTORY_CONFIGURATION,
      `${HUMAN_AUTHORIZATION_INSTANCE_ID}-${++authorizationSequence}`,
    ),
  );
}

export function humanHoldingReader(
  contracts: unknown[],
  offset = 42,
): HumanPurchaseHoldingReader {
  return {
    readLedgerEnd: async () => ({ offset }),
    readActiveContracts: async () => contracts,
  };
}
