import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  exportHumanPrepareAuthorityPlaintext,
  parseHumanPrepareAuthorityPlaintext,
  restoreHumanPrepareAuthority,
} from "../src/human-prepare-authority-persistence.js";
import { commitHumanPurchaseForTest } from "../src/human-purchase-commitment.js";
import { readHumanPurchaseLedgerIntent } from "../src/human-purchase-ledger-intent.js";
import {
  HUMAN_PURCHASE_NOW,
  HUMAN_TOKEN_FACTORY_CONFIGURATION,
  createHumanPackageSelection,
  createHumanPurchaseInput,
} from "./human-purchase-commitment.fixtures.js";
import { authenticatedHumanWalletPreflight } from "./human-wallet-connector-preflight.fixtures.js";
import { DSO, PROVIDER } from "./purchase-commitment.fixtures.js";

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) });
});

afterEach(() => vi.useRealTimers());

it("does not poison fresh authorities when persisted material fails", async () => {
  const input = await createHumanPurchaseInput();
  const original = readHumanPurchaseLedgerIntent(
    commitHumanPurchaseForTest(
      input,
      HUMAN_TOKEN_FACTORY_CONFIGURATION,
      "human-authorization-two-phase",
    ),
  );
  const bytes = exportHumanPrepareAuthorityPlaintext(original);
  const payload = JSON.parse(new TextDecoder().decode(bytes)) as {
    requestBindingCanonicalBytes: string;
  };
  const request = JSON.parse(
    Buffer.from(payload.requestBindingCanonicalBytes, "base64").toString(),
  ) as { url: string };
  request.url = "https://provider.example/tampered";
  payload.requestBindingCanonicalBytes = Buffer.from(
    JSON.stringify(request),
  ).toString("base64");
  const tampered = parseHumanPrepareAuthorityPlaintext(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const walletPreflight = await authenticatedHumanWalletPreflight();
  const packageSelection = await createHumanPackageSelection(
    walletPreflight,
    input.paymentObservation,
    DSO,
    PROVIDER,
    original.challenge.executeBefore,
  );
  const fresh = {
    packageSelection,
    trustedConfiguration: HUMAN_TOKEN_FACTORY_CONFIGURATION,
    walletPreflight,
  };

  expect(() => restoreHumanPrepareAuthority(tampered, fresh)).toThrow(
    /request|resource|material/iu,
  );
  expect(
    restoreHumanPrepareAuthority(
      parseHumanPrepareAuthorityPlaintext(bytes),
      fresh,
    ),
  ).toEqual(original);
});
