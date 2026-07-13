import type { BoundedPurchaseCommitmentInput } from "../src/index.js";
import {
  readChallengeBytes,
  replaceChallengeObservation,
  mutateChallenge,
  replaceBoundRequest,
  RESOURCE_URL,
} from "./purchase-commitment.fixtures.js";

export type PurchaseMutation = (
  input: BoundedPurchaseCommitmentInput,
) => BoundedPurchaseCommitmentInput;

export function changeChallenge(
  change: Parameters<typeof mutateChallenge>[1],
): PurchaseMutation {
  return (input) => mutateChallenge(input, change);
}

export const validRequestMutations: ReadonlyArray<
  readonly [string, PurchaseMutation]
> = [
  [
    "authorization instance",
    (input) => ({ ...input, authorizationInstanceId: "authorization-8" }),
  ],
  [
    "HTTP method",
    (input) =>
      replaceBoundRequest(input, { method: "POST", url: RESOURCE_URL }),
  ],
  [
    "request query",
    (input) =>
      replaceBoundRequest(input, {
        method: "GET",
        url: `${RESOURCE_URL}&lang=en`,
      }),
  ],
  [
    "authoritative header",
    (input) =>
      replaceBoundRequest(input, {
        headers: [["idempotency-key", "purchase-8"]],
        method: "GET",
        url: RESOURCE_URL,
      }),
  ],
  [
    "request body",
    (input) =>
      replaceBoundRequest(input, {
        body: new TextEncoder().encode("different"),
        method: "GET",
        url: RESOURCE_URL,
      }),
  ],
  [
    "request route",
    (input) =>
      replaceBoundRequest(input, {
        method: "GET",
        url: "https://provider.example/paid/forecast",
      }),
  ],
  [
    "challenge encoding",
    (input) =>
      replaceChallengeObservation(
        input,
        new TextEncoder().encode(
          `${new TextDecoder().decode(readChallengeBytes(input))}\n`,
        ),
      ),
  ],
  [
    "observation time",
    (input) =>
      replaceChallengeObservation(
        input,
        readChallengeBytes(input),
        "2026-07-13T10:00:00.001Z",
      ),
  ],
  [
    "network",
    (input) => ({
      ...changeChallenge(
        (value) => (value.accepts[0]!.network = "canton:test"),
      )(input),
      expectedNetwork: "canton:test",
    }),
  ],
  [
    "amount",
    changeChallenge((value) => (value.accepts[0]!.amount = "2500000001")),
  ],
  [
    "asset",
    changeChallenge((value) => (value.accepts[0]!.asset = "OtherCoin")),
  ],
  [
    "maximum timeout",
    changeChallenge((value) => (value.accepts[0]!.maxTimeoutSeconds = 59)),
  ],
  [
    "execution window",
    changeChallenge(
      (value) => (value.accepts[0]!.extra.executeBeforeSeconds = 44),
    ),
  ],
];
