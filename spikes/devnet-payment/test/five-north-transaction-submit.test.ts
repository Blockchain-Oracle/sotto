import { describe, expect, it, vi } from "vitest";
import {
  AmbiguousTransactionSubmissionError,
  createFiveNorthTransactionSubmitter,
} from "../src/five-north-transaction-submit.js";

const ledgerUrl = "https://ledger.example.test";

function submitter(
  fetcher: typeof fetch,
  accessToken = vi.fn(async () => "token"),
) {
  return {
    accessToken,
    submit: createFiveNorthTransactionSubmitter({
      accessToken,
      fetcher,
      ledgerUrl,
    }),
  };
}

describe("Five North transaction submitter", () => {
  it("rejects an oversized request before authentication or transport", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const setup = submitter(fetcher);

    await expect(setup.submit({ payload: "x".repeat(65_536) })).rejects.toThrow(
      "request exceeds byte limit",
    );
    expect(setup.accessToken).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("bounds the response and cancels before JSON parsing", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json(
        { transaction: {} },
        { headers: { "content-length": "2000001" } },
      ),
    );
    const setup = submitter(fetcher);

    await expect(setup.submit({ commands: [] })).rejects.toBeInstanceOf(
      AmbiguousTransactionSubmissionError,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("classifies a transport failure as ambiguous without leaking its cause", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new Error("secret socket detail");
    });
    const setup = submitter(fetcher);

    await expect(setup.submit({ commands: [] })).rejects.toThrow(
      "submission outcome is ambiguous",
    );
    await expect(setup.submit({ commands: [] })).rejects.not.toThrow(
      "secret socket detail",
    );
  });

  it("preserves a bounded definitive HTTP rejection", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json(
        { code: "INVALID_ARGUMENT", secret: "hidden" },
        { status: 400 },
      ),
    );
    const setup = submitter(fetcher);

    await expect(setup.submit({ commands: [] })).rejects.toThrow(
      "HTTP 400 (INVALID_ARGUMENT)",
    );
    await expect(setup.submit({ commands: [] })).rejects.not.toThrow("hidden");
  });

  it.each([408, 429, 500, 502, 503, 504])(
    "classifies HTTP %i as an ambiguous submission outcome",
    async (status) => {
      const fetcher = vi.fn<typeof fetch>(async () =>
        Response.json({ code: "UNAVAILABLE" }, { status }),
      );
      const setup = submitter(fetcher);

      await expect(setup.submit({ commands: [] })).rejects.toBeInstanceOf(
        AmbiguousTransactionSubmissionError,
      );
    },
  );

  it("classifies an unreadable rejection body as ambiguous", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error("secret transport detail"));
            },
          }),
          { status: 400 },
        ),
    );
    const setup = submitter(fetcher);

    await expect(setup.submit({ commands: [] })).rejects.toBeInstanceOf(
      AmbiguousTransactionSubmissionError,
    );
  });

  it("uses a bounded non-redirecting POST", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({ transaction: { events: [] } }),
    );
    const setup = submitter(fetcher);

    await expect(setup.submit({ commands: [] })).resolves.toEqual({
      transaction: { events: [] },
    });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(
      `${ledgerUrl}/v2/commands/submit-and-wait-for-transaction`,
    );
    expect(init).toMatchObject({ method: "POST", redirect: "error" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});
