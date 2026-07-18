import { describe, expect, it } from "vitest";
import { validateProbeObservation } from "../src/publication-probe-validation.js";
import { validateOriginProof } from "../src/publication-proof-validation.js";
import { validatePublicationRequest } from "../src/publication-request-validation.js";
import { validateProviderOriginRegistration } from "../src/catalog-validation.js";
import {
  originProof,
  originRegistration,
  publication,
  verifiedProbe,
} from "./publication.fixtures.js";

function probeWith(
  mutate: (
    probe: Record<string, unknown>,
    result: Record<string, unknown>,
  ) => void,
) {
  const probe = structuredClone(verifiedProbe) as unknown as Record<
    string,
    unknown
  >;
  const result = probe.result as Record<string, unknown>;
  mutate(probe, result);
  return probe;
}

describe("publication input validation", () => {
  it.each([
    ["an unpaired surrogate", "Weather\ud800API"],
    ["a bidirectional override", "Weather\u202eIPA"],
    ["a non-ASCII space", "Weather\u00a0API"],
  ])("rejects resource names containing %s", (_label, name) => {
    expect(() =>
      validateProbeObservation(
        probeWith((_probe, result) => {
          result.name = name;
        }) as never,
      ),
    ).toThrow(/name/iu);
  });

  it.each([
    ["an unpaired surrogate", "Weather\ud800API"],
    ["a bidirectional override", "Weather\u202eIPA"],
    ["a non-ASCII space", "Weather\u00a0API"],
  ])("rejects provider names containing %s", (_label, displayName) => {
    expect(() =>
      validateProviderOriginRegistration({
        ...originRegistration,
        providerDisplayName: displayName,
      }),
    ).toThrow(/display name/iu);
  });

  it.each([
    [
      "lowercase method",
      (probe: Record<string, unknown>) => (probe.method = "get"),
    ],
    [
      "query-bearing route",
      (probe: Record<string, unknown>) => (probe.routeTemplate = "/paid?x=1"),
    ],
    [
      "empty Canton network",
      (_probe: Record<string, unknown>, result: Record<string, unknown>) =>
        (result.network = "canton:"),
    ],
    [
      "zero amount",
      (_probe: Record<string, unknown>, result: Record<string, unknown>) =>
        (result.amountAtomic = "0"),
    ],
    [
      "noncanonical amount",
      (_probe: Record<string, unknown>, result: Record<string, unknown>) =>
        (result.amountAtomic = "025"),
    ],
    [
      "non-402 verified response",
      (probe: Record<string, unknown>) => (probe.httpStatus = 200),
    ],
  ])("rejects a %s", (_label, mutate) => {
    expect(() =>
      validateProbeObservation(
        probeWith((probe, result) => mutate(probe, result)) as never,
      ),
    ).toThrow();
  });

  it("rejects private evidence and callbacks as unexpected members", () => {
    expect(() =>
      validateProbeObservation({
        ...verifiedProbe,
        rawChallenge: "private",
      } as never),
    ).toThrow(/keys/iu);
    expect(() =>
      validateOriginProof({ ...originProof, walletKey: "private" } as never),
    ).toThrow(/keys/iu);
    expect(() =>
      validatePublicationRequest({
        ...publication,
        fetch: () => null,
      } as never),
    ).toThrow(/keys/iu);
  });

  it("rejects noncanonical timestamps and unknown nested protocol members", () => {
    expect(() =>
      validateOriginProof({
        ...originProof,
        verifiedAt: "2026-07-18T00:00:00.000000Z",
      }),
    ).toThrow(/verifiedAt/u);
    expect(() =>
      validateProbeObservation({
        ...verifiedProbe,
        result: { ...verifiedProbe.result, header: "PAYMENT-REQUIRED" },
      } as never),
    ).toThrow(/keys/iu);
  });
});
