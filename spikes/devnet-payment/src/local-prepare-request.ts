import { APPROVED_BOUNDED_PURCHASE_CAPABILITY_TEMPLATE_ID } from "@sotto/x402-canton";
import type {
  LocalDisclosure,
  LocalPrepareBootstrap,
} from "./local-prepare-fixture.js";

const digest = (digit: string): `sha256:${string}` =>
  `sha256:${digit.repeat(64)}`;

export function buildLocalPrepareRequest(
  fixture: LocalPrepareBootstrap,
  disclosures: readonly [LocalDisclosure, LocalDisclosure],
): Record<string, unknown> {
  return {
    userId: "daml-script",
    commandId: "sotto-local-prepare-smoke-v1",
    commands: [
      {
        ExerciseCommand: {
          templateId: APPROVED_BOUNDED_PURCHASE_CAPABILITY_TEMPLATE_ID,
          contractId: fixture.capabilityCid,
          choice: "Purchase",
          choiceArgument: {
            attemptId: digest("1"),
            purchaseCommitment: digest("2"),
            requestCommitment: digest("3"),
            challengeId: digest("4"),
            resourceHash: digest("0"),
            recipient: fixture.provider,
            amount: "0.2500000000",
            requestedAt: fixture.requestedAt,
            executeBefore: fixture.executeBefore,
            inputHoldingCids: [fixture.holdingCid],
            extraArgs: { context: { values: {} }, meta: { values: {} } },
            expectedRevision: "0",
          },
        },
      },
    ],
    actAs: [fixture.agent],
    readAs: [],
    disclosedContracts: disclosures,
    synchronizerId: disclosures[0].synchronizerId,
    packageIdSelectionPreference: [],
    verboseHashing: false,
    prefetchContractKeys: [],
    maxRecordTime: fixture.executeBefore,
    hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
  };
}
