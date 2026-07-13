import {
  BOUNDED_PURCHASE_CAPABILITY_QUERY_ID,
  FIVE_NORTH_TRANSFER_FACTORY_IMPLEMENTATION_ID,
  HOLDING_INTERFACE_QUERY_ID,
} from "@sotto/x402-canton";

const MAX_REQUEST_BYTES = 4_194_304;
const PARTY_PATTERN = /^[^\s:]+::1220[0-9a-f]{64}$/u;
export const TRANSFER_PREAPPROVAL_PROPOSAL_QUERY_ID =
  "#splice-wallet:Splice.Wallet.TransferPreapproval:TransferPreapprovalProposal" as const;
export const TRANSFER_PREAPPROVAL_QUERY_ID =
  "#splice-amulet:Splice.AmuletRules:TransferPreapproval" as const;

export function boundedPrepareBody(value: unknown, label: string): string {
  let body: string;
  try {
    body = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    throw new Error(`${label} is not serializable`);
  }
  if (Buffer.byteLength(body, "utf8") > MAX_REQUEST_BYTES) {
    throw new Error(`${label} exceeds byte limit`);
  }
  return body;
}

function boundedOffset(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error("Five North ACS offset must be nonnegative");
  }
  return value as number;
}

function cantonParty(value: unknown, label: string, sottoOnly = false): string {
  if (
    typeof value !== "string" ||
    !PARTY_PATTERN.test(value) ||
    (sottoOnly && !value.startsWith("sotto-"))
  ) {
    throw new Error(`${label} must be an exact Canton Party`);
  }
  return value;
}

function activeContractsBody(
  payer: string,
  activeAtOffset: number,
  identifierFilters: readonly unknown[],
  verbose: boolean,
): unknown {
  return {
    filter: {
      filtersByParty: {
        [payer]: {
          cumulative: identifierFilters.map((identifierFilter) => ({
            identifierFilter,
          })),
        },
      },
    },
    verbose,
    activeAtOffset: boundedOffset(activeAtOffset),
  };
}

export function capabilityContractsBody(
  payer: string,
  activeAtOffset: number,
): unknown {
  return activeContractsBody(
    payer,
    activeAtOffset,
    [
      {
        TemplateFilter: {
          value: {
            templateId: BOUNDED_PURCHASE_CAPABILITY_QUERY_ID,
            includeCreatedEventBlob: false,
          },
        },
      },
    ],
    true,
  );
}

export function holdingContractsBody(
  payer: string,
  activeAtOffset: number,
): unknown {
  return activeContractsBody(
    payer,
    activeAtOffset,
    [
      {
        InterfaceFilter: {
          value: {
            interfaceId: HOLDING_INTERFACE_QUERY_ID,
            includeCreatedEventBlob: true,
            includeInterfaceView: true,
          },
        },
      },
    ],
    false,
  );
}

export function transferFactoryContractsBody(
  dsoParty: string,
  activeAtOffset: number,
): unknown {
  return activeContractsBody(
    cantonParty(dsoParty, "TransferFactory DSO"),
    activeAtOffset,
    [
      {
        TemplateFilter: {
          value: {
            templateId: FIVE_NORTH_TRANSFER_FACTORY_IMPLEMENTATION_ID,
            includeCreatedEventBlob: false,
          },
        },
      },
    ],
    true,
  );
}

export function preferredWalletPackageBody(
  receiverParty: string,
  validatorParty: string,
): unknown {
  return {
    packageVettingRequirements: [
      {
        packageName: "splice-wallet",
        parties: [
          cantonParty(receiverParty, "preapproval receiver", true),
          cantonParty(validatorParty, "validator operator"),
        ],
      },
    ],
  };
}

export function preferredSottoPackageBody(
  payerParty: string,
  agentParty: string,
): unknown {
  const payer = cantonParty(payerParty, "capability payer", true);
  const agent = cantonParty(agentParty, "capability agent", true);
  if (payer === agent) {
    throw new Error("capability payer and agent must be distinct");
  }
  return {
    packageVettingRequirements: [
      {
        packageName: "sotto-control",
        parties: [payer, agent],
      },
    ],
  };
}

export function preapprovalStateContractsBody(
  receiverParty: string,
  activeAtOffset: number,
): unknown {
  return activeContractsBody(
    cantonParty(receiverParty, "preapproval receiver", true),
    activeAtOffset,
    [TRANSFER_PREAPPROVAL_PROPOSAL_QUERY_ID, TRANSFER_PREAPPROVAL_QUERY_ID].map(
      (templateId) => ({
        TemplateFilter: {
          value: {
            templateId,
            includeCreatedEventBlob: false,
          },
        },
      }),
    ),
    true,
  );
}

export function requirePreapprovalReceiverParty(value: unknown): string {
  return cantonParty(value, "preapproval receiver", true);
}
