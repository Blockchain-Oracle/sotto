import { describe, expect, it, vi } from "vitest";
import {
  CAPABILITY_COMPLETION_QUERY,
  createFiveNorthCapabilityCompletionPageReader,
} from "../src/five-north-capability-completion-transport.js";

const ledgerUrl = "https://ledger.example.test";
const payerParty = "sotto-payer::1220participant";
const userId = "ledger-user-6";

function token(subject = userId): string {
  const payload = Buffer.from(JSON.stringify({ sub: subject })).toString(
    "base64url",
  );
  return `header.${payload}.signature`;
}

function query() {
  return {
    beginExclusive: 41,
    limit: 1_000 as const,
    parties: [payerParty] as const,
    userId,
  };
}

function setup(
  response: Response,
  subject = userId,
  signal = new AbortController().signal,
) {
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    void url;
    void init;
    return response;
  });
  const accessToken = vi.fn(async () => token(subject));
  const read = createFiveNorthCapabilityCompletionPageReader({
    fetcher,
    ledgerUrl,
    payerParty,
    signal,
    tokenProvider: { accessToken, invalidate: vi.fn() },
  });
  return { accessToken, fetcher, read };
}

describe("Five North capability completion transport", () => {
  it("uses the exact bounded authenticated request", async () => {
    const page = [{ completionResponse: { Empty: {} } }];
    const { fetcher, read } = setup(Response.json(page));

    await expect(read(query())).resolves.toEqual(page);
    expect(fetcher).toHaveBeenCalledWith(
      `${ledgerUrl}${CAPABILITY_COMPLETION_QUERY}`,
      expect.objectContaining({
        body: JSON.stringify({
          beginExclusive: 41,
          parties: [payerParty],
          userId,
        }),
        method: "POST",
        redirect: "error",
        signal: expect.any(AbortSignal),
      }),
    );
    const headers = new Headers(fetcher.mock.calls[0]![1]?.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${token()}`);
    expect(headers.get("content-type")).toBe("application/json");
  });

  it.each([
    { ...query(), beginExclusive: -1 },
    { ...query(), limit: 999 },
    { ...query(), parties: ["different-party"] },
    { ...query(), userId: "" },
  ])(
    "rejects an invalid query before secrets or network",
    async (candidate) => {
      const { accessToken, fetcher, read } = setup(Response.json([]));

      await expect(read(candidate as never)).rejects.toThrow(/query/iu);
      expect(accessToken).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("rejects token-subject drift before the completion request", async () => {
    const { fetcher, read } = setup(Response.json([]), "different-user");

    await expect(read(query())).rejects.toThrow(/subject/iu);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("enforces response bytes and strict JSON", async () => {
    const oversized = setup(
      new Response("", { headers: { "content-length": "2000001" } }),
    );
    await expect(oversized.read(query())).rejects.toThrow(/byte limit/iu);

    const malformed = setup(new Response("not-json"));
    await expect(malformed.read(query())).rejects.toThrow(/valid JSON/iu);
  });

  it("rejects cancellation before token or network", async () => {
    const controller = new AbortController();
    controller.abort();
    const { accessToken, fetcher, read } = setup(
      Response.json([]),
      userId,
      controller.signal,
    );

    await expect(read(query())).rejects.toThrow(/cancelled/iu);
    expect(accessToken).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
