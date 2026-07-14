import { describe, expect, it, vi } from "vitest";
import type { GetSubject } from "./five-north-package-preference.harness.js";
import {
  network,
  PARTIES,
  preferenceRequest,
  preferenceResponse,
  tokenResponse,
} from "./five-north-package-preference.fixtures.js";

export function registerFiveNorthPreferenceHardeningCases(
  getSubject: GetSubject,
): void {
  describe("Five North package-preference transport hardening", () => {
    it("rejects an unapproved network before any request", () => {
      const fetcher = vi.fn(async () => tokenResponse());
      expect(() =>
        getSubject().createFiveNorthPackagePreferenceReader(
          { ...network, ledgerUrl: "https://attacker.example" },
          { fetcher, signal: new AbortController().signal },
        ),
      ).toThrow(/approved Five North/u);
      expect(fetcher).not.toHaveBeenCalled();
    });

    it("snapshots the exact request before token acquisition", async () => {
      const request = preferenceRequest();
      let sentBody: unknown;
      const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
        if (url === network.tokenUrl) {
          request.packageRequirements.splice(0);
          return tokenResponse();
        }
        sentBody = JSON.parse(String(init?.body)) as unknown;
        return Response.json(preferenceResponse());
      });
      const reader = getSubject().createFiveNorthPackagePreferenceReader(
        network,
        { fetcher, signal: new AbortController().signal },
      );

      await reader.readPackageReferences(request);
      expect(sentBody).toMatchObject({
        packageVettingRequirements: [
          { packageName: "sotto-control", parties: PARTIES },
          { packageName: "splice-amulet", parties: PARTIES },
        ],
      });
    });

    it("accepts canonical UTF-8 party ordering", async () => {
      const parties = [
        `DSO::1220${"d".repeat(64)}`,
        `sotto-agent::1220${"a".repeat(64)}`,
        `sotto-\ue000::1220${"b".repeat(64)}`,
        `sotto-\u{10000}::1220${"c".repeat(64)}`,
      ].sort((left, right) =>
        Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")),
      );
      const request = preferenceRequest();
      for (const requirement of request.packageRequirements) {
        requirement.parties = [...parties];
      }
      const fetcher = vi.fn(async (url: string) =>
        url === network.tokenUrl
          ? tokenResponse()
          : Response.json(preferenceResponse()),
      );
      const reader = getSubject().createFiveNorthPackagePreferenceReader(
        network,
        { fetcher, signal: new AbortController().signal },
      );

      await expect(reader.readPackageReferences(request)).resolves.toHaveLength(
        2,
      );
    });

    it("canonicalizes and deeply freezes reversed references", async () => {
      const response = preferenceResponse();
      response.packageReferences.reverse();
      const fetcher = vi.fn(async (url: string) =>
        url === network.tokenUrl ? tokenResponse() : Response.json(response),
      );
      const reader = getSubject().createFiveNorthPackagePreferenceReader(
        network,
        { fetcher, signal: new AbortController().signal },
      );

      const references =
        await reader.readPackageReferences(preferenceRequest());
      expect(references).toEqual(preferenceResponse().packageReferences);
      expect(Object.isFrozen(references)).toBe(true);
      expect(
        (references as ReadonlyArray<unknown>).every(Object.isFrozen),
      ).toBe(true);
    });

    it("performs a fresh package POST for every read", async () => {
      let ledgerCalls = 0;
      const fetcher = vi.fn(async (url: string) => {
        if (url === network.tokenUrl) return tokenResponse();
        ledgerCalls += 1;
        return Response.json(preferenceResponse());
      });
      const reader = getSubject().createFiveNorthPackagePreferenceReader(
        network,
        { fetcher, signal: new AbortController().signal },
      );

      await reader.readPackageReferences(preferenceRequest());
      await reader.readPackageReferences(preferenceRequest());
      expect(ledgerCalls).toBe(2);
    });

    it.each([
      [
        "duplicate package IDs",
        () => {
          const response = preferenceResponse();
          response.packageReferences[1]!.packageId =
            response.packageReferences[0]!.packageId;
          return Response.json(response);
        },
      ],
      [
        "an oversized package version",
        () => {
          const response = preferenceResponse();
          response.packageReferences[0]!.packageVersion = "v".repeat(129);
          return Response.json(response);
        },
      ],
      [
        "a non-JSON media type",
        () =>
          new Response(JSON.stringify(preferenceResponse()), {
            headers: { "content-type": "text/html" },
          }),
      ],
    ])("rejects %s", async (_label, response) => {
      const fetcher = vi.fn(async (url: string) =>
        url === network.tokenUrl ? tokenResponse() : response(),
      );
      const reader = getSubject().createFiveNorthPackagePreferenceReader(
        network,
        { fetcher, signal: new AbortController().signal },
      );
      await expect(
        reader.readPackageReferences(preferenceRequest()),
      ).rejects.toThrow();
    });

    it("does not expose an uncertain transport exception", async () => {
      const fetcher = vi.fn(async (url: string) => {
        if (url === network.tokenUrl) return tokenResponse();
        throw new Error("private transport details");
      });
      const reader = getSubject().createFiveNorthPackagePreferenceReader(
        network,
        { fetcher, signal: new AbortController().signal },
      );
      const failure = reader.readPackageReferences(preferenceRequest());
      await expect(failure).rejects.toThrow(
        "Five North package preference transport failed",
      );
      await expect(failure).rejects.not.toThrow(/private transport details/u);
    });
  });
}
