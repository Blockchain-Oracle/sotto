import { describe, expect, it, vi } from "vitest";
import { SOTTO_CONTROL_PACKAGE_ID } from "@sotto/x402-canton";
import {
  fiveNorthHasApprovedSottoPackage,
  proveFiveNorthSottoControlPackagePresent,
  type FiveNorthPackageDeploymentTransport,
} from "../src/five-north-package-deployment.js";

const otherPackage = "b".repeat(64);

function transport(presence: unknown): FiveNorthPackageDeploymentTransport {
  return {
    listPackageIds: vi.fn(),
    observeDeploymentAuthority: vi.fn(),
    readPackagePresence: vi.fn(async () => presence),
    uploadDar: vi.fn(),
    validateDar: vi.fn(),
  };
}

describe("Five North sotto-control package presence", () => {
  it("selects only the exact approved package from a bounded list", () => {
    expect(
      fiveNorthHasApprovedSottoPackage({
        packageIds: [otherPackage, SOTTO_CONTROL_PACKAGE_ID],
      }),
    ).toBe(true);
    expect(
      fiveNorthHasApprovedSottoPackage({ packageIds: [otherPackage] }),
    ).toBe(false);
  });

  it("rejects malformed or duplicate package lists", () => {
    expect(() =>
      fiveNorthHasApprovedSottoPackage({ packageIds: "not-an-array" }),
    ).toThrow("package list");
    expect(() =>
      fiveNorthHasApprovedSottoPackage({
        packageIds: [SOTTO_CONTROL_PACKAGE_ID, SOTTO_CONTROL_PACKAGE_ID],
      }),
    ).toThrow("duplicates");
  });

  it("proves exact downloaded package presence without claiming readiness", async () => {
    const network = transport({
      archivePayloadSha256: SOTTO_CONTROL_PACKAGE_ID,
      packageId: SOTTO_CONTROL_PACKAGE_ID,
    });
    await expect(
      proveFiveNorthSottoControlPackagePresent(network),
    ).resolves.toBeUndefined();
    expect(network.readPackagePresence).toHaveBeenCalledWith(
      SOTTO_CONTROL_PACKAGE_ID,
    );
  });

  it("rejects an unproven package payload", async () => {
    await expect(
      proveFiveNorthSottoControlPackagePresent(
        transport({
          archivePayloadSha256: otherPackage,
          packageId: SOTTO_CONTROL_PACKAGE_ID,
        }),
      ),
    ).rejects.toThrow("presence");
  });
});
