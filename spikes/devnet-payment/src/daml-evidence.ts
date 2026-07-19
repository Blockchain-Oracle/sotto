import {
  sottoTemplateId,
  type SottoTemplateEntity,
} from "./daml-template-ids.js";

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function buildActiveContractRequest(
  party: string,
  templateId: string,
  activeAtOffset: number,
) {
  return {
    filter: {
      filtersByParty: {
        [party]: {
          cumulative: [
            {
              identifierFilter: {
                TemplateFilter: {
                  value: { includeCreatedEventBlob: false, templateId },
                },
              },
            },
          ],
        },
      },
    },
    verbose: false,
    activeAtOffset,
  } as const;
}

export function findCreatedContract(
  response: unknown,
  packageId: string,
  entityName: SottoTemplateEntity,
) {
  const events = record(record(response)?.transaction)?.events;
  if (!Array.isArray(events)) {
    throw new Error("Transaction requires events");
  }
  const templateId = sottoTemplateId(packageId, entityName);
  const matches = events
    .map((event) => record(record(event)?.CreatedEvent))
    .filter((event) => event?.templateId === templateId);
  if (matches.length !== 1) {
    throw new Error(`Expected one created ${entityName} contract`);
  }
  const contract = matches[0];
  if (
    typeof contract?.contractId !== "string" ||
    record(contract.createArgument) === undefined
  ) {
    throw new Error(`Created ${entityName} contract is incomplete`);
  }
  return {
    contractId: contract.contractId,
    createArgument: record(contract.createArgument) ?? {},
  } as const;
}

export function activeContracts(response: unknown) {
  if (!Array.isArray(response)) {
    throw new Error("Active contracts response must be an array");
  }
  return response.flatMap((entry) => {
    const active = record(
      record(record(entry)?.contractEntry)?.JsActiveContract,
    );
    const event = record(active?.createdEvent);
    const argument = record(event?.createArgument);
    return typeof event?.contractId === "string" && argument !== undefined
      ? [{ contractId: event.contractId, createArgument: argument }]
      : [];
  });
}

export function activeContractCount(response: unknown): number {
  return activeContracts(response).length;
}
