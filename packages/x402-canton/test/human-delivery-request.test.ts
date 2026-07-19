import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as publicApi from "../src/index.js";
import {
  exportHumanDeliveryRequestPlaintext,
  HUMAN_DELIVERY_REQUEST_VERSION,
  parseHumanDeliveryRequestPlaintext,
} from "../src/human-delivery-request-persistence.js";
import {
  createHumanPaymentObserver,
  MAX_REQUEST_BODY_BYTES,
  readHumanPurchaseLedgerIntent,
} from "../src/index.js";
import { commitHumanPurchaseForTest } from "../src/human-purchase-commitment.js";
import { exportHumanPrepareAuthorityPlaintext } from "../src/human-prepare-authority-persistence.js";
import {
  HUMAN_AUTHORIZATION_INSTANCE_ID,
  HUMAN_PURCHASE_NOW,
  HUMAN_TOKEN_FACTORY_CONFIGURATION,
  createHumanPurchaseInput,
} from "./human-purchase-commitment.fixtures.js";
import { RESOURCE_URL } from "./purchase-commitment.fixtures.js";

const BODY_SECRET = "private-delivery-body";
const QUERY_SECRET = "private-delivery-query";
const URL = `${RESOURCE_URL}&token=${QUERY_SECRET}`;
let sequence = 0;

function paymentRequired(): Response {
  return new Response(null, {
    headers: {
      "PAYMENT-REQUIRED": Buffer.from('{"x402Version":2}').toString("base64"),
    },
    status: 402,
  });
}

async function deliveryIntent(body = new TextEncoder().encode(BODY_SECRET)) {
  const input = await createHumanPurchaseInput({
    mutateChallenge: (challenge) => {
      challenge.resource.url = URL;
    },
    request: {
      additionalAuthoritativeHeaders: ["x-request-mode"],
      body,
      headers: [
        ["x-ignored", "must-not-persist"],
        ["x-request-mode", " human "],
        ["content-type", " application/json "],
      ],
      method: "post",
      url: URL,
    },
  });
  const commitment = commitHumanPurchaseForTest(
    input,
    HUMAN_TOKEN_FACTORY_CONFIGURATION,
    `${HUMAN_AUTHORIZATION_INSTANCE_ID}-delivery-${++sequence}`,
  );
  return {
    input,
    intent: readHumanPurchaseLedgerIntent(commitment),
  };
}

describe("private human delivery request persistence", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date(HUMAN_PURCHASE_NOW) }));
  afterEach(() => vi.useRealTimers());

  it("exports the exact committed application request as a private envelope", async () => {
    const { intent } = await deliveryIntent();
    const plaintext = exportHumanDeliveryRequestPlaintext(intent);
    const request = parseHumanDeliveryRequestPlaintext(plaintext);

    expect(request).toMatchObject({
      version: HUMAN_DELIVERY_REQUEST_VERSION,
      method: "POST",
      url: URL,
      headers: [
        ["content-type", "application/json"],
        ["x-request-mode", "human"],
      ],
      bodyPresent: true,
      bodyHash: intent.request.bodyHash,
      requestCommitment: intent.request.requestCommitment,
    });
    expect(new TextDecoder().decode(request.body)).toBe(BODY_SECRET);
    expect(plaintext.byteLength).toBeLessThanOrEqual(1_114_155);
    expect(JSON.stringify(request.headers)).not.toContain("x-ignored");
  });

  it("normalizes the initial fetch to committed nonempty headers and no empty body", async () => {
    const fetcher = vi.fn(async (request) => {
      expect(request).toEqual({
        headers: [
          ["content-type", "application/json"],
          ["x-request-mode", "human"],
        ],
        method: "POST",
        redirect: "error",
        signal: expect.any(AbortSignal),
        url: RESOURCE_URL,
      });
      return paymentRequired();
    });

    await createHumanPaymentObserver(fetcher)({
      additionalAuthoritativeHeaders: ["x-request-mode"],
      body: new Uint8Array(),
      headers: [
        ["x-ignored", "must-not-be-sent"],
        ["x-request-mode", " human "],
        ["content-type", " application/json "],
        ["idempotency-key", ""],
      ],
      method: "post",
      url: RESOURCE_URL,
    });

    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("returns deterministic non-aliased bytes and defensive body copies", async () => {
    const { intent } = await deliveryIntent();
    const first = exportHumanDeliveryRequestPlaintext(intent);
    const expected = Uint8Array.from(first);
    first.fill(0);
    const second = exportHumanDeliveryRequestPlaintext(intent);
    const request = parseHumanDeliveryRequestPlaintext(second);
    const body = request.body;
    body.fill(0);

    expect(second).toEqual(expected);
    expect(new TextDecoder().decode(request.body)).toBe(BODY_SECRET);
  });

  it("encodes and parses the exact maximum request body", async () => {
    const body = new Uint8Array(MAX_REQUEST_BODY_BYTES).fill(0x5a);
    const { intent } = await deliveryIntent(body);
    const plaintext = exportHumanDeliveryRequestPlaintext(intent);
    const request = parseHumanDeliveryRequestPlaintext(plaintext);

    expect(request.body).toHaveLength(MAX_REQUEST_BODY_BYTES);
    expect(request.body[0]).toBe(0x5a);
    expect(request.body.at(-1)).toBe(0x5a);
    expect(plaintext.byteLength).toBeLessThanOrEqual(1_114_155);
  });

  it("keeps delivery material out of public intent and prepare persistence", async () => {
    const { intent } = await deliveryIntent();
    const prepare = exportHumanPrepareAuthorityPlaintext(intent);

    expect(JSON.stringify(intent)).not.toContain(BODY_SECRET);
    expect(new TextDecoder().decode(prepare)).not.toContain(BODY_SECRET);
    expect(publicApi).not.toHaveProperty("exportHumanDeliveryRequestPlaintext");
    expect(publicApi).not.toHaveProperty("parseHumanDeliveryRequestPlaintext");
  });
});
