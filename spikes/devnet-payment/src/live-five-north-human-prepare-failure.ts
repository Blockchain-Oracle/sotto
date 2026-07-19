import { isCloudflareQuickTunnelRateLimitError } from "./cloudflare-quick-tunnel.js";

const GENERIC_FAILURE = "Five North human read-only preparation failed";

export function projectLiveFiveNorthHumanPrepareFailure(
  error: unknown,
): string {
  return isCloudflareQuickTunnelRateLimitError(error)
    ? `${GENERIC_FAILURE}: provider-tunnel-rate-limited`
    : GENERIC_FAILURE;
}
