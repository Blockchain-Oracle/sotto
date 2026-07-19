import { expect, it } from "vitest";
import { readExactHumanPaidDelivery } from "../src/live-five-north-human-purchase-settlement.js";

const proof = Object.freeze({
  attemptId: `sha256:${"a".repeat(64)}` as const,
  requestCommitment: `sha256:${"b".repeat(64)}` as const,
  updateId: `1220${"c".repeat(64)}`,
});

function body() {
  return JSON.stringify({
    paid: true,
    result: { condition: "clear", temperatureCelsius: 24 },
    settlement: { attemptId: proof.attemptId, updateId: proof.updateId },
  });
}

it("requires the exact JSON media type for the authentic paid body", async () => {
  await expect(
    readExactHumanPaidDelivery(
      new Response(body(), {
        headers: { "content-type": "text/plain" },
        status: 200,
      }),
      proof,
    ),
  ).rejects.toThrow(/content.?type|JSON/iu);
});

it("accepts only the exact expected authentic JSON body", async () => {
  await expect(
    readExactHumanPaidDelivery(
      new Response(body(), {
        headers: { "content-type": "application/json; charset=utf-8" },
        status: 200,
      }),
      proof,
    ),
  ).resolves.toMatchObject({ bodyByteCount: body().length, status: 200 });
});
