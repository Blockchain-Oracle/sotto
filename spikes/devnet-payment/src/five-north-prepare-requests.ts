import {
  APPROVED_BOUNDED_PURCHASE_CAPABILITY_TEMPLATE_ID,
  HOLDING_INTERFACE_QUERY_ID,
} from "@sotto/x402-canton";

const MAX_REQUEST_BYTES = 4_194_304;

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

function activeContractsBody(
  payer: string,
  activeAtOffset: number,
  identifierFilter: unknown,
  verbose: boolean,
): unknown {
  return {
    filter: {
      filtersByParty: {
        [payer]: { cumulative: [{ identifierFilter }] },
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
    {
      TemplateFilter: {
        value: {
          templateId: APPROVED_BOUNDED_PURCHASE_CAPABILITY_TEMPLATE_ID,
          includeCreatedEventBlob: false,
        },
      },
    },
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
    {
      InterfaceFilter: {
        value: {
          interfaceId: HOLDING_INTERFACE_QUERY_ID,
          includeCreatedEventBlob: true,
          includeInterfaceView: true,
        },
      },
    },
    false,
  );
}
