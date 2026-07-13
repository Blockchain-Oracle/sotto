import type { PurchaseMutation } from "./purchase-commitment-request-mutations.js";
import { changeChallenge } from "./purchase-commitment-request-mutations.js";

export const validLedgerMutations: ReadonlyArray<
  readonly [string, PurchaseMutation]
> = [
  [
    "payer",
    (input) => ({
      ...changeChallenge(
        (value) =>
          (value.accepts[0]!.extra.feePayer = "sotto-payer-2::1220payer"),
      )(input),
      payerParty: "sotto-payer-2::1220payer",
    }),
  ],
  [
    "recipient",
    (input) => ({
      ...changeChallenge(
        (value) => (value.accepts[0]!.payTo = "sotto-provider-2::1220provider"),
      )(input),
      capability: {
        ...input.capability,
        recipient: "sotto-provider-2::1220provider",
      },
    }),
  ],
  [
    "instrument admin",
    (input) => ({
      ...changeChallenge(
        (value) =>
          (value.accepts[0]!.extra.instrumentId.admin = "DSO-2::1220dso"),
      )(input),
      tokenFactory: { ...input.tokenFactory, expectedAdmin: "DSO-2::1220dso" },
    }),
  ],
  [
    "instrument id",
    changeChallenge(
      (value) => (value.accepts[0]!.extra.instrumentId.id = "Amulet2"),
    ),
  ],
  [
    "synchronizer",
    changeChallenge(
      (value) =>
        (value.accepts[0]!.extra.synchronizerId = "global-domain-2::1220sync"),
    ),
  ],
  [
    "capability agent",
    (input) => ({
      ...input,
      capability: {
        ...input.capability,
        agentParty: "sotto-agent-2::1220agent",
      },
    }),
  ],
  [
    "capability CID",
    (input) => ({
      ...input,
      capability: { ...input.capability, contractId: "00capability8" },
    }),
  ],
  [
    "capability template",
    (input) => ({
      ...input,
      capability: {
        ...input.capability,
        templateId: `${"b".repeat(64)}:Sotto.Control.PurchaseCapability:BoundedPurchaseCapability`,
      },
    }),
  ],
  [
    "capability revision",
    (input) => ({
      ...input,
      capability: { ...input.capability, revision: "8" },
    }),
  ],
  [
    "per-call limit",
    (input) => ({
      ...input,
      capability: { ...input.capability, perCallLimitAtomic: "3000000001" },
    }),
  ],
  [
    "remaining allowance",
    (input) => ({
      ...input,
      capability: {
        ...input.capability,
        remainingAllowanceAtomic: "10000000001",
      },
    }),
  ],
  [
    "maximum total debit",
    (input) => ({
      ...input,
      capability: {
        ...input.capability,
        maximumTotalDebitAtomic: "2750000001",
      },
    }),
  ],
  [
    "capability expiry",
    (input) => ({
      ...input,
      capability: {
        ...input.capability,
        expiresAt: "2026-07-13T11:00:00.001Z",
      },
    }),
  ],
  [
    "factory CID",
    (input) => ({
      ...input,
      tokenFactory: { ...input.tokenFactory, contractId: "00tokenfactory8" },
    }),
  ],
];
