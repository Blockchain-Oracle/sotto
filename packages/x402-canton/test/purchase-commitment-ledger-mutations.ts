import type { PurchaseMutation } from "./purchase-commitment-request-mutations.js";
import { replaceCapability } from "./purchase-commitment.fixtures.js";
import { changeChallenge } from "./purchase-commitment-request-mutations.js";

export const validLedgerMutations: ReadonlyArray<
  readonly [string, PurchaseMutation]
> = [
  [
    "payer",
    (input) => {
      const changed = changeChallenge(
        (value) =>
          (value.accepts[0]!.extra.feePayer = "sotto-payer-2::1220payer"),
      )(input);
      return replaceCapability(
        { ...changed, payerParty: "sotto-payer-2::1220payer" },
        (capability) => ({
          ...capability,
          payerParty: "sotto-payer-2::1220payer",
        }),
      );
    },
  ],
  [
    "recipient",
    (input) => {
      const changed = changeChallenge(
        (value) => (value.accepts[0]!.payTo = "sotto-provider-2::1220provider"),
      )(input);
      return replaceCapability(changed, (capability) => ({
        ...capability,
        recipient: "sotto-provider-2::1220provider",
      }));
    },
  ],
  [
    "instrument admin",
    (input) => {
      const changed = changeChallenge(
        (value) =>
          (value.accepts[0]!.extra.instrumentId.admin = "DSO-2::1220dso"),
      )(input);
      return replaceCapability(
        {
          ...changed,
          tokenFactory: {
            ...input.tokenFactory,
            expectedAdmin: "DSO-2::1220dso",
          },
        },
        (capability) => ({
          ...capability,
          expectedAdmin: "DSO-2::1220dso",
          instrument: { ...capability.instrument, admin: "DSO-2::1220dso" },
        }),
      );
    },
  ],
  [
    "instrument id",
    (input) =>
      replaceCapability(
        changeChallenge(
          (value) => (value.accepts[0]!.extra.instrumentId.id = "Amulet2"),
        )(input),
        (capability) => ({
          ...capability,
          instrument: { ...capability.instrument, id: "Amulet2" },
        }),
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
    (input) =>
      replaceCapability(input, (capability) => ({
        ...capability,
        agentParty: "sotto-agent-2::1220agent",
      })),
  ],
  [
    "capability CID",
    (input) =>
      replaceCapability(input, (capability) => ({
        ...capability,
        contractId: "00capability8",
      })),
  ],
  [
    "capability revision",
    (input) =>
      replaceCapability(input, (capability) => ({
        ...capability,
        revision: "8",
      })),
  ],
  [
    "per-call limit",
    (input) =>
      replaceCapability(input, (capability) => ({
        ...capability,
        perCallLimitAtomic: "3000000001",
      })),
  ],
  [
    "remaining allowance",
    (input) =>
      replaceCapability(input, (capability) => ({
        ...capability,
        remainingAllowanceAtomic: "10000000001",
      })),
  ],
  [
    "maximum total debit",
    (input) =>
      replaceCapability(input, (capability) => ({
        ...capability,
        maximumTotalDebitAtomic: "3250000001",
      })),
  ],
  [
    "capability expiry",
    (input) =>
      replaceCapability(input, (capability) => ({
        ...capability,
        expiresAt: "2026-07-13T11:00:00.001Z",
      })),
  ],
  [
    "factory CID",
    (input) =>
      replaceCapability(
        {
          ...input,
          tokenFactory: {
            ...input.tokenFactory,
            contractId: "00tokenfactory8",
          },
        },
        (capability) => ({
          ...capability,
          transferFactoryContractId: "00tokenfactory8",
        }),
      ),
  ],
];
