import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  exportHumanDeliveryRequestPlaintext,
  parseHumanDeliveryRequestPlaintext,
} from "../src/human-delivery-request-persistence.js";
import {
  parseHumanPrepareAuthorityPlaintext,
  restoreHumanPrepareAuthority,
} from "../src/human-prepare-authority-persistence.js";
import { exportHumanPrepareAuthorityPlaintext } from "../src/human-prepare-authority-export.js";
import { commitHumanPurchaseForTest } from "../src/human-purchase-commitment.js";
import { createHumanPaymentObserver } from "../src/human-payment-observation.js";
import { readHumanPurchaseLedgerIntent } from "../src/human-purchase-ledger-intent.js";
import {
  HUMAN_AUTHORIZATION_INSTANCE_ID,
  HUMAN_PURCHASE_NOW,
  HUMAN_TOKEN_FACTORY_CONFIGURATION,
  createHumanPackageSelection,
  createHumanPurchaseInput,
} from "./human-purchase-commitment.fixtures.js";
import { authenticatedHumanWalletPreflight } from "./human-wallet-connector-preflight.fixtures.js";
import { DSO, PROVIDER } from "./purchase-commitment.fixtures.js";

let sequence = 0;

async function fixture() {
  const input = await createHumanPurchaseInput({
    request: {
      body: new TextEncoder().encode("private-security-body"),
      headers: [["content-type", "application/octet-stream"]],
      method: "POST",
      url: "https://provider.example/paid/weather?units=metric",
    },
  });
  const intent = readHumanPurchaseLedgerIntent(
    commitHumanPurchaseForTest(
      input,
      HUMAN_TOKEN_FACTORY_CONFIGURATION,
      `${HUMAN_AUTHORIZATION_INSTANCE_ID}-security-${++sequence}`,
    ),
  );
  return { input, intent };
}

describe("private human delivery request security", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("rejects forged intents without exposing or consuming authentic material", async () => {
    const { intent } = await fixture();

    expect(() =>
      exportHumanDeliveryRequestPlaintext(structuredClone(intent)),
    ).toThrow(/not authenticated/iu);
    expect(() => exportHumanDeliveryRequestPlaintext(intent)).not.toThrow();
  });

  it.each([
    "connection",
    "content-length",
    "expect",
    "host",
    "keep-alive",
    "proxy-connection",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
  ])("rejects transport-controlled header %s before fetch", async (name) => {
    const fetcher = vi.fn(
      async () =>
        new Response(null, {
          headers: {
            "PAYMENT-REQUIRED":
              Buffer.from('{"x402Version":2}').toString("base64"),
          },
          status: 402,
        }),
    );

    await expect(
      createHumanPaymentObserver(fetcher)({
        additionalAuthoritativeHeaders: [name],
        headers: [[name, "caller-controlled"]],
        method: "POST",
        url: "https://provider.example/paid/weather",
      }),
    ).rejects.toThrow(/forbidden.*header/iu);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects truncation, trailing bytes, and body mutation fail closed", async () => {
    const { intent } = await fixture();
    const plaintext = exportHumanDeliveryRequestPlaintext(intent);
    const malformed = [
      plaintext.subarray(0, plaintext.byteLength - 1),
      Uint8Array.from([...plaintext, 0]),
      Uint8Array.from(plaintext, (value, index) =>
        index === plaintext.byteLength - 1 ? value ^ 1 : value,
      ),
    ];

    for (const candidate of malformed) {
      let failure: unknown;
      try {
        parseHumanDeliveryRequestPlaintext(candidate);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).not.toContain("private-security-body");
    }
  });

  it("does not restore delivery authority through prepare persistence", async () => {
    const { input, intent } = await fixture();
    const handle = parseHumanPrepareAuthorityPlaintext(
      exportHumanPrepareAuthorityPlaintext(intent),
    );
    vi.advanceTimersByTime(1);
    const walletPreflight = await authenticatedHumanWalletPreflight();
    const packageSelection = await createHumanPackageSelection(
      walletPreflight,
      input.paymentObservation,
      DSO,
      PROVIDER,
      intent.challenge.executeBefore,
    );
    const restored = restoreHumanPrepareAuthority(handle, {
      packageSelection,
      trustedConfiguration: HUMAN_TOKEN_FACTORY_CONFIGURATION,
      walletPreflight,
    });

    expect(() => exportHumanDeliveryRequestPlaintext(restored)).toThrow(
      /delivery request.*not authenticated/iu,
    );
    expect(() => exportHumanDeliveryRequestPlaintext(intent)).not.toThrow();
  });
});
