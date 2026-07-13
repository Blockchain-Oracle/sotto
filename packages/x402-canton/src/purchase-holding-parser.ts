import {
  damlDecimalToAtomic,
  exactKeys,
  identifier,
  objectValue,
} from "./purchase-commitment-primitives.js";
import { canonicalDisclosureBlob } from "./purchase-disclosure-validation.js";
import type { BoundedPurchaseLedgerIntent } from "./purchase-ledger-intent.js";
import { snapshotStrictJsonObject } from "./strict-json-value.js";
import {
  FIVE_NORTH_HOLDING_IMPLEMENTATION_PACKAGE_ID,
  HOLDING_INTERFACE_ID,
  MAX_HOLDING_ACS_ENTRIES,
  MAX_HOLDING_ACS_RESPONSE_BYTES,
  MAX_HOLDING_BLOB_BYTES,
  MAX_PURCHASE_HOLDINGS,
  MAX_TOTAL_HOLDING_BLOB_BYTES,
  type SelectedPurchaseHolding,
} from "./purchase-holding-types.js";

type ParsedPurchaseHolding = Readonly<{
  contractId: string;
  selected?: SelectedPurchaseHolding;
}>;

function matchingView(event: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(event.interfaceViews)) {
    throw new Error("holding interfaceViews must be an array");
  }
  const matches = event.interfaceViews.filter((candidate) => {
    const view = objectValue(candidate, "holding interface view");
    return view.interfaceId === HOLDING_INTERFACE_ID;
  });
  if (matches.length !== 1) {
    throw new Error("holding requires exactly one approved interface view");
  }
  const view = objectValue(matches[0], "holding interface view");
  const status = objectValue(view.viewStatus, "holding viewStatus");
  if (status.code !== 0) throw new Error("holding interface view failed");
  if (
    view.implementationPackageId !==
    FIVE_NORTH_HOLDING_IMPLEMENTATION_PACKAGE_ID
  ) {
    throw new Error("holding implementation package is not approved");
  }
  return view;
}

function parseEntry(
  value: unknown,
  intent: BoundedPurchaseLedgerIntent,
): ParsedPurchaseHolding {
  const entry = objectValue(value, "holding ACS entry");
  const contractEntry = objectValue(
    entry.contractEntry,
    "holding contractEntry",
  );
  exactKeys(contractEntry, ["JsActiveContract"], "holding contractEntry");
  const active = objectValue(
    contractEntry.JsActiveContract,
    "holding active contract",
  );
  if (
    !Number.isSafeInteger(active.reassignmentCounter) ||
    (active.reassignmentCounter as number) < 0
  ) {
    throw new Error("holding reassignmentCounter must be nonnegative");
  }
  const event = objectValue(active.createdEvent, "holding created event");
  const contractId = identifier(event.contractId, "holding contractId");
  const templateId = identifier(event.templateId, "holding templateId", 512);
  if (
    !new RegExp(
      `^${FIVE_NORTH_HOLDING_IMPLEMENTATION_PACKAGE_ID}:[^:\\s]+:[^:\\s]+$`,
    ).test(templateId)
  ) {
    throw new Error("holding templateId package is not approved");
  }
  const view = matchingView(event);
  const valueView = objectValue(view.viewValue, "holding viewValue");
  exactKeys(
    valueView,
    ["owner", "instrumentId", "amount", "lock", "meta"],
    "holding viewValue",
  );
  const instrument = objectValue(
    valueView.instrumentId,
    "holding instrumentId",
  );
  exactKeys(instrument, ["admin", "id"], "holding instrumentId");
  snapshotStrictJsonObject(valueView.meta, "holding metadata", {
    maximumBytes: 16_384,
    maximumDepth: 8,
    maximumNodes: 256,
  });
  const amountAtomic = damlDecimalToAtomic(valueView.amount, "holding amount");
  const synchronizerId = identifier(
    active.synchronizerId,
    "holding synchronizerId",
  );
  const owner = identifier(valueView.owner, "holding owner");
  if (event.witnessParties !== undefined) {
    if (
      !Array.isArray(event.witnessParties) ||
      !event.witnessParties.includes(intent.challenge.payerParty)
    ) {
      throw new Error("holding payer is not a witness");
    }
  }
  const eligible =
    owner === intent.challenge.payerParty &&
    instrument.admin === intent.challenge.instrument.admin &&
    instrument.id === intent.challenge.instrument.id &&
    synchronizerId === intent.challenge.synchronizerId &&
    valueView.lock === null &&
    BigInt(amountAtomic) > 0n;
  if (!eligible) return { contractId };
  const blob = canonicalDisclosureBlob(
    event.createdEventBlob,
    "holding createdEventBlob",
    MAX_HOLDING_BLOB_BYTES,
  );
  return {
    contractId,
    selected: {
      amountAtomic,
      disclosure: Object.freeze({
        templateId,
        contractId,
        createdEventBlob: blob.value,
        synchronizerId,
      }),
    },
  };
}

export function selectPurchaseHoldings(
  response: unknown,
  intent: BoundedPurchaseLedgerIntent,
): readonly SelectedPurchaseHolding[] {
  if (!Array.isArray(response) || response.length > MAX_HOLDING_ACS_ENTRIES) {
    throw new Error("holding ACS response exceeds entry limit");
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(response);
  } catch {
    throw new Error("holding ACS response is not serializable");
  }
  if (Buffer.byteLength(serialized, "utf8") > MAX_HOLDING_ACS_RESPONSE_BYTES) {
    throw new Error("holding ACS response exceeds byte limit");
  }
  const parsed = response.map((entry) => parseEntry(entry, intent));
  const ids = new Set(parsed.map(({ contractId }) => contractId));
  if (ids.size !== parsed.length)
    throw new Error("holding contractId is duplicated");
  const holdings = parsed.flatMap(({ selected }) =>
    selected === undefined ? [] : [selected],
  );
  holdings.sort((left, right) => {
    const amountOrder = BigInt(right.amountAtomic) - BigInt(left.amountAtomic);
    return amountOrder === 0n
      ? Buffer.compare(
          Buffer.from(left.disclosure.contractId, "utf8"),
          Buffer.from(right.disclosure.contractId, "utf8"),
        )
      : amountOrder > 0n
        ? 1
        : -1;
  });
  const target =
    BigInt(intent.capability.maximumTotalDebitAtomic) <
    BigInt(intent.capability.remainingAllowanceAtomic)
      ? BigInt(intent.capability.maximumTotalDebitAtomic)
      : BigInt(intent.capability.remainingAllowanceAtomic);
  const selected: SelectedPurchaseHolding[] = [];
  let total = 0n;
  let blobBytes = 0;
  for (const holding of holdings.slice(0, MAX_PURCHASE_HOLDINGS)) {
    selected.push(holding);
    total += BigInt(holding.amountAtomic);
    blobBytes += Buffer.from(
      holding.disclosure.createdEventBlob,
      "base64",
    ).byteLength;
    if (blobBytes > MAX_TOTAL_HOLDING_BLOB_BYTES) {
      throw new Error("selected holding disclosures exceed byte limit");
    }
    if (total >= target) return Object.freeze(selected);
  }
  throw new Error("eligible payer holdings do not cover the debit ceiling");
}
