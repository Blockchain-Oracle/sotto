import type {
  CapabilityWalletApprovalStarted,
  CapabilityWalletSigningSessionInput,
} from "./capability-wallet-connector-types.js";

export async function persistCapabilityWalletApprovalStarted(
  candidate: CapabilityWalletSigningSessionInput["onApprovalRequested"],
  started: CapabilityWalletApprovalStarted,
): Promise<void> {
  if (candidate === undefined) return;
  if (typeof candidate !== "function") {
    throw new Error("capability wallet approval persistence is invalid");
  }
  try {
    await candidate(Object.freeze({ ...started }));
  } catch {
    throw new Error("capability wallet approval persistence failed");
  }
}
