import { describe, expect, it } from "vitest";
import { createEvidenceRecord } from "../src/index.js";

describe("createEvidenceRecord", () => {
  it("keeps settlement and delivery as separate outcomes", () => {
    const record = createEvidenceRecord({
      attemptId: "attempt-1",
      delivery: "failed",
      settlement: "accepted",
      updateId: "update-1",
    });

    expect(record.delivery).toBe("failed");
    expect(record.settlement).toBe("accepted");
  });

  it("rejects private request or response content", () => {
    expect(() =>
      createEvidenceRecord({
        attemptId: "attempt-2",
        delivery: "succeeded",
        responseBody: "private result",
        settlement: "accepted",
      }),
    ).toThrow("responseBody");
  });

  it("rejects an unknown settlement outcome", () => {
    expect(() =>
      createEvidenceRecord({
        attemptId: "attempt-3",
        delivery: "succeeded",
        settlement: "probably",
      }),
    ).toThrow("settlement");
  });
});
