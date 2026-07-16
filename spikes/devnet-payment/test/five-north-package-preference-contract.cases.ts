import { describe, expect, it, vi } from "vitest";
import type { GetSubject } from "./five-north-package-preference.harness.js";
import {
  network,
  PARTIES,
  preferenceRequest,
  preferenceResponse,
  SUBJECT,
  SYNCHRONIZER,
  tokenResponse,
  VETTING_VALID_AT,
} from "./five-north-package-preference.fixtures.js";

export function registerFiveNorthPreferenceContractCases(
  getSubject: GetSubject,
): void {
  describe("Five North package-preference transport contract", () => {
    it("exposes only the authenticated package-preference reader surface", () => {
      const reader = getSubject().createFiveNorthPackagePreferenceReader(
        network,
        {
          fetcher: vi.fn(async () => tokenResponse()),
          signal: new AbortController().signal,
        },
      );
      expect(Object.keys(reader).sort()).toEqual([
        "readAuthenticatedSubject",
        "readPackageReferences",
      ]);
      expect(reader).not.toHaveProperty("prepare");
      expect(reader).not.toHaveProperty("sign");
      expect(reader).not.toHaveProperty("submit");
    });

    it("makes one exact bounded authenticated POST with a stable subject", async () => {
      const requests: Array<{
        url: string;
        init: RequestInit | undefined;
      }> = [];
      const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
        if (url === network.tokenUrl) return tokenResponse();
        requests.push({ url, init });
        return Response.json(preferenceResponse());
      });
      const reader = getSubject().createFiveNorthPackagePreferenceReader(
        network,
        { fetcher, signal: new AbortController().signal },
      );

      await expect(reader.readAuthenticatedSubject()).resolves.toBe(SUBJECT);
      await expect(
        reader.readPackageReferences(preferenceRequest()),
      ).resolves.toEqual(preferenceResponse().packageReferences);
      await expect(reader.readAuthenticatedSubject()).resolves.toBe(SUBJECT);

      expect(
        fetcher.mock.calls.filter(([url]) => url === network.tokenUrl),
      ).toHaveLength(1);
      expect(requests).toHaveLength(1);
      expect(requests[0]?.url).toBe(
        `${network.ledgerUrl}/v2/interactive-submission/preferred-packages`,
      );
      expect(requests[0]?.init).toMatchObject({
        method: "POST",
        redirect: "error",
      });
      expect(requests[0]?.init?.signal).toBeInstanceOf(AbortSignal);
      const headers = new Headers(requests[0]?.init?.headers);
      expect(headers.get("authorization")).toMatch(/^Bearer header\./u);
      expect(headers.get("authorization")).not.toContain(network.clientSecret);
      expect(headers.get("content-type")).toBe("application/json");
      expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
        packageVettingRequirements: ["sotto-control", "splice-amulet"].map(
          (packageName) => ({ packageName, parties: PARTIES }),
        ),
        synchronizerId: SYNCHRONIZER,
        vettingValidAt: VETTING_VALID_AT,
      });
    });

    it("gives token minting and package acquisition separate ten-second deadlines", async () => {
      const deadlines: number[] = [];
      const timeout = vi
        .spyOn(AbortSignal, "timeout")
        .mockImplementation((milliseconds) => {
          deadlines.push(milliseconds);
          return new AbortController().signal;
        });
      const fetcher = vi.fn(async (url: string) =>
        url === network.tokenUrl
          ? tokenResponse()
          : Response.json(preferenceResponse()),
      );
      const reader = getSubject().createFiveNorthPackagePreferenceReader(
        network,
        { fetcher, signal: new AbortController().signal },
      );

      try {
        await reader.readPackageReferences(preferenceRequest());
        expect(deadlines).toEqual([10_000, 10_000]);
      } finally {
        timeout.mockRestore();
      }
    });

    it.each([
      [
        "missing name",
        (value: ReturnType<typeof preferenceRequest>) =>
          value.packageRequirements.pop(),
      ],
      [
        "reordered names",
        (value: ReturnType<typeof preferenceRequest>) =>
          value.packageRequirements.reverse(),
      ],
      [
        "extra requirement",
        (value: ReturnType<typeof preferenceRequest>) =>
          value.packageRequirements.push({
            packageName: "attacker-package",
            parties: [...PARTIES],
          }),
      ],
      [
        "duplicate requirement",
        (value: ReturnType<typeof preferenceRequest>) =>
          value.packageRequirements.push({
            packageName: value.packageRequirements[0]!.packageName,
            parties: [...value.packageRequirements[0]!.parties],
          }),
      ],
      [
        "unequal parties",
        (value: ReturnType<typeof preferenceRequest>) =>
          value.packageRequirements[0]!.parties.pop(),
      ],
      [
        "unsorted parties",
        (value: ReturnType<typeof preferenceRequest>) =>
          value.packageRequirements[0]!.parties.reverse(),
      ],
      [
        "duplicate party",
        (value: ReturnType<typeof preferenceRequest>) => {
          for (const requirement of value.packageRequirements) {
            requirement.parties.push(PARTIES[0]!);
            requirement.parties.sort();
          }
        },
      ],
      [
        "fourth party",
        (value: ReturnType<typeof preferenceRequest>) => {
          for (const requirement of value.packageRequirements) {
            requirement.parties.push(`sotto-attacker::1220${"f".repeat(64)}`);
            requirement.parties.sort();
          }
        },
      ],
      [
        "bad synchronizer",
        (value: ReturnType<typeof preferenceRequest>) =>
          (value.synchronizerId = "bad"),
      ],
      [
        "bad vetting time",
        (value: ReturnType<typeof preferenceRequest>) =>
          (value.vettingValidAt = "soon"),
      ],
      [
        "extra input",
        (value: ReturnType<typeof preferenceRequest>) =>
          Object.assign(value, { debug: true }),
      ],
    ])("rejects %s before minting a token", async (_label, mutate) => {
      const fetcher = vi.fn(async () => tokenResponse());
      const reader = getSubject().createFiveNorthPackagePreferenceReader(
        network,
        { fetcher, signal: new AbortController().signal },
      );
      const request = preferenceRequest();
      mutate(request);
      await expect(reader.readPackageReferences(request)).rejects.toThrow();
      expect(fetcher).not.toHaveBeenCalled();
    });
  });
}
