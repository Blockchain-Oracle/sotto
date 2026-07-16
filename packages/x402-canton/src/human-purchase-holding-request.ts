import { exactKeys, objectValue } from "./purchase-commitment-primitives.js";
import {
  HOLDING_INTERFACE_QUERY_ID,
  type PurchaseHoldingAcsRequest,
} from "./purchase-holding-types.js";

export function createHumanHoldingAcsRequest(
  payerParty: string,
  activeAtOffset: number,
): PurchaseHoldingAcsRequest {
  return Object.freeze({
    filter: Object.freeze({
      filtersByParty: Object.freeze({
        [payerParty]: Object.freeze({
          cumulative: Object.freeze([
            Object.freeze({
              identifierFilter: Object.freeze({
                InterfaceFilter: Object.freeze({
                  value: Object.freeze({
                    interfaceId: HOLDING_INTERFACE_QUERY_ID,
                    includeCreatedEventBlob: true,
                    includeInterfaceView: true,
                  }),
                }),
              }),
            }),
          ]),
        }),
      }),
    }),
    verbose: false,
    activeAtOffset,
  });
}

export function readHumanHoldingLedgerOffset(response: unknown): number {
  const ledgerEnd = objectValue(response, "human holding Ledger end");
  exactKeys(ledgerEnd, ["offset"], "human holding Ledger end");
  if (
    !Number.isSafeInteger(ledgerEnd.offset) ||
    (ledgerEnd.offset as number) < 0
  ) {
    throw new Error("human holding Ledger offset must be nonnegative");
  }
  return ledgerEnd.offset as number;
}
