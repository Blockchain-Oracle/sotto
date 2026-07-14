import { describe, expect, it, vi } from "vitest";
import type { GetSubject } from "./five-north-package-preference.harness.js";
import {
  network,
  preferenceRequest,
  preferenceResponse,
  SUBJECT,
  tokenResponse,
} from "./five-north-package-preference.fixtures.js";

export function registerFiveNorthPreferenceSecurityCases(
  getSubject: GetSubject,
): void {
  describe("Five North package-preference transport security", () => {
    it("does not retry a rejected or uncertain preference POST", async () => {
      for (const outcome of ["unauthorized", "uncertain"] as const) {
        let ledgerCalls = 0;
        const fetcher = vi.fn(async (url: string) => {
          if (url === network.tokenUrl) return tokenResponse();
          ledgerCalls += 1;
          if (outcome === "uncertain") throw new Error("uncertain transport");
          return new Response(null, { status: 401 });
        });
        const reader = getSubject().createFiveNorthPackagePreferenceReader(
          network,
          { fetcher, signal: new AbortController().signal },
        );
        await expect(
          reader.readPackageReferences(preferenceRequest()),
        ).rejects.toThrow();
        expect(ledgerCalls).toBe(1);
      }
    });

    it("rejects a refreshed token subject change before the ledger POST", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-14T10:00:00.000Z"));
      let mintCalls = 0;
      let ledgerCalls = 0;
      const fetcher = vi.fn(async (url: string) => {
        if (url === network.tokenUrl) {
          mintCalls += 1;
          return tokenResponse(
            mintCalls === 1 ? SUBJECT : `${SUBJECT}-attacker`,
            10,
          );
        }
        ledgerCalls += 1;
        return Response.json(preferenceResponse());
      });
      const reader = getSubject().createFiveNorthPackagePreferenceReader(
        network,
        { fetcher, signal: new AbortController().signal },
      );

      try {
        await expect(reader.readAuthenticatedSubject()).resolves.toBe(SUBJECT);
        await vi.advanceTimersByTimeAsync(9_001);
        await expect(
          reader.readPackageReferences(preferenceRequest()),
        ).rejects.toThrow(/subject/u);
        expect(mintCalls).toBe(2);
        expect(ledgerCalls).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it("rejects an oversized streamed response and cancels the body", async () => {
      let cancelled = false;
      const fetcher = vi.fn(async (url: string) => {
        if (url === network.tokenUrl) return tokenResponse();
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new Uint8Array(65_537));
            },
            cancel() {
              cancelled = true;
            },
          }),
        );
      });
      const reader = getSubject().createFiveNorthPackagePreferenceReader(
        network,
        { fetcher, signal: new AbortController().signal },
      );
      await expect(
        reader.readPackageReferences(preferenceRequest()),
      ).rejects.toThrow(/byte limit/i);
      expect(cancelled).toBe(true);
    });

    it.each([
      ["root keys", () => ({ ...preferenceResponse(), debug: true })],
      [
        "synchronizer",
        () => ({ ...preferenceResponse(), synchronizerId: "other" }),
      ],
      [
        "missing reference",
        () => ({
          ...preferenceResponse(),
          packageReferences: preferenceResponse().packageReferences.slice(1),
        }),
      ],
      [
        "duplicate name",
        () => ({
          ...preferenceResponse(),
          packageReferences: [
            preferenceResponse().packageReferences[0],
            preferenceResponse().packageReferences[0],
          ],
        }),
      ],
      [
        "reference keys",
        () => ({
          ...preferenceResponse(),
          packageReferences: preferenceResponse().packageReferences.map(
            (value, index) =>
              index === 0 ? { ...value, artifactIds: ["caller"] } : value,
          ),
        }),
      ],
      [
        "package ID",
        () => ({
          ...preferenceResponse(),
          packageReferences: preferenceResponse().packageReferences.map(
            (value, index) =>
              index === 0 ? { ...value, packageId: "bad" } : value,
          ),
        }),
      ],
    ])("rejects invalid %s response", async (_label, response) => {
      const fetcher = vi.fn(async (url: string) =>
        url === network.tokenUrl ? tokenResponse() : Response.json(response()),
      );
      const reader = getSubject().createFiveNorthPackagePreferenceReader(
        network,
        { fetcher, signal: new AbortController().signal },
      );
      await expect(
        reader.readPackageReferences(preferenceRequest()),
      ).rejects.toThrow();
    });

    it("returns bounded code-only diagnostics", async () => {
      const fetcher = vi.fn(async (url: string) =>
        url === network.tokenUrl
          ? tokenResponse()
          : Response.json(
              {
                code: "INVALID_ARGUMENT",
                message: "private body",
                secret: "hide",
              },
              { status: 400 },
            ),
      );
      const reader = getSubject().createFiveNorthPackagePreferenceReader(
        network,
        { fetcher, signal: new AbortController().signal },
      );
      const failure = reader.readPackageReferences(preferenceRequest());
      await expect(failure).rejects.toThrow("HTTP 400 (INVALID_ARGUMENT)");
      await expect(failure).rejects.not.toThrow(/private body|hide/u);
    });

    it("rejects cancellation or malformed token identity without a ledger POST", async () => {
      const controller = new AbortController();
      controller.abort("private reason");
      const cancelledFetch = vi.fn(async () => tokenResponse());
      const cancelled = getSubject().createFiveNorthPackagePreferenceReader(
        network,
        { fetcher: cancelledFetch, signal: controller.signal },
      );
      await expect(
        cancelled.readPackageReferences(preferenceRequest()),
      ).rejects.toThrow(/cancelled/u);
      expect(cancelledFetch).not.toHaveBeenCalled();

      const malformedFetch = vi.fn(async () => tokenResponse(""));
      const malformed = getSubject().createFiveNorthPackagePreferenceReader(
        network,
        { fetcher: malformedFetch, signal: new AbortController().signal },
      );
      await expect(malformed.readAuthenticatedSubject()).rejects.toThrow(
        /subject/u,
      );
      expect(malformedFetch).toHaveBeenCalledTimes(1);
    });
  });
}
