import {
  buildBoundedCapabilityBootstrap,
  FIVE_NORTH_HOLDING_IMPLEMENTATION_PACKAGE_ID,
  FIVE_NORTH_HOLDING_TEMPLATE_PACKAGE_ID,
  FIVE_NORTH_TRANSFER_FACTORY_CREATION_TEMPLATE_ID,
  HOLDING_INTERFACE_ID,
  type BoundedCapabilityBootstrapRequest,
} from "@sotto/x402-canton";
import { buildFiveNorthLeastAuthorityCapabilityPolicy } from "../src/five-north-capability-bootstrap-policy.js";

export const DSO = `DSO::1220${"d".repeat(64)}`;
export const SYNCHRONIZER = `global-domain::1220${"e".repeat(64)}`;
export const PAYER = `sotto-payer::1220${"a".repeat(64)}`;
export const AGENT = `sotto-agent::1220${"b".repeat(64)}`;
export const PROVIDER = `sotto-provider::1220${"c".repeat(64)}`;
export const RESOURCE = "https://provider.private.example/paid?secret=query";
export const FACTORY = "00private-factory";
export const CONTRACT = "00private-capability";
export const SOURCE_COMMIT = "a".repeat(40);
export const USER_ID = "private-ledger-user";

export function holdingEntry() {
  return {
    contractEntry: {
      JsActiveContract: {
        createdEvent: {
          contractId: "00private-holding",
          createdEventBlob: Buffer.from("private holding").toString("base64"),
          interfaceViews: [
            {
              implementationPackageId:
                FIVE_NORTH_HOLDING_IMPLEMENTATION_PACKAGE_ID,
              interfaceId: HOLDING_INTERFACE_ID,
              viewStatus: { code: 0 },
              viewValue: {
                amount: "0.3250000000",
                instrumentId: { admin: DSO, id: "Amulet" },
                lock: null,
                meta: { values: {} },
                owner: PAYER,
              },
            },
          ],
          packageName: "splice-amulet",
          templateId: `${FIVE_NORTH_HOLDING_TEMPLATE_PACKAGE_ID}:Splice.Amulet:Amulet`,
          witnessParties: [PAYER],
        },
        reassignmentCounter: 0,
        synchronizerId: SYNCHRONIZER,
      },
    },
  };
}

export function factoryResponse(): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      choiceContext: {
        choiceContextData: { values: {} },
        disclosedContracts: [
          {
            contractId: FACTORY,
            createdEventBlob: Buffer.from("private factory").toString("base64"),
            synchronizerId: SYNCHRONIZER,
            templateId: FIVE_NORTH_TRANSFER_FACTORY_CREATION_TEMPLATE_ID,
          },
        ],
      },
      factoryId: FACTORY,
      transferKind: "direct",
    }),
  );
}

export function exactBootstrapRequest(): BoundedCapabilityBootstrapRequest {
  const policy = buildFiveNorthLeastAuthorityCapabilityPolicy({
    agentParty: AGENT,
    nowMilliseconds: Date.now(),
    payerParty: PAYER,
    providerParty: PROVIDER,
    resourceUrl: RESOURCE,
  });
  return buildBoundedCapabilityBootstrap({
    ...policy,
    instrument: { admin: DSO, id: "Amulet" },
    network: "canton:devnet",
    synchronizerId: SYNCHRONIZER,
    transferFactoryContractId: FACTORY,
    userId: USER_ID,
  });
}

export function activeCapability(request: BoundedCapabilityBootstrapRequest) {
  const create = request.commands[0]!.CreateCommand;
  return {
    contractEntry: {
      JsActiveContract: {
        createdEvent: {
          contractId: CONTRACT,
          createArgument: create.createArguments,
          observers: [AGENT],
          packageName: "sotto-control",
          signatories: [PAYER],
          templateId: create.templateId,
        },
        synchronizerId: SYNCHRONIZER,
      },
    },
  };
}

export function submissionResponse() {
  return {
    completionOffset: 42,
    updateId: `1220${"f".repeat(64)}`,
  };
}
