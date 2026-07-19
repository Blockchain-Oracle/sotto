import type { CatalogProbeOptions } from "./catalog-probe-types.js";

export type CatalogProbeNetworkState = Readonly<{
  caller?: AbortSignal;
  deadline: AbortSignal;
  signal: AbortSignal;
}>;

export type ValidatedCatalogProbeOptions = Readonly<{
  caller?: AbortSignal;
  networkTimeoutMilliseconds: number;
}>;

export function validateCatalogProbeOptions(
  options: CatalogProbeOptions,
): ValidatedCatalogProbeOptions {
  if (
    typeof options !== "object" ||
    options === null ||
    Array.isArray(options) ||
    Object.keys(options).some(
      (key) => key !== "signal" && key !== "networkTimeoutMilliseconds",
    )
  ) {
    throw new Error("catalog probe options are invalid");
  }
  const timeout = options.networkTimeoutMilliseconds ?? 10_000;
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 30_000) {
    throw new Error("catalog probe network timeout must be 1-30000ms");
  }
  const caller = options.signal;
  if (caller !== undefined && !(caller instanceof AbortSignal)) {
    throw new Error("catalog probe signal is invalid");
  }
  if (caller?.aborted === true) throw new Error("catalog probe cancelled");
  return Object.freeze({
    ...(caller === undefined ? {} : { caller }),
    networkTimeoutMilliseconds: timeout,
  });
}

export function catalogProbeNetworkSignal(
  options: ValidatedCatalogProbeOptions,
): CatalogProbeNetworkState {
  if (options.caller?.aborted === true) {
    throw new Error("catalog probe cancelled");
  }
  const deadline = AbortSignal.timeout(options.networkTimeoutMilliseconds);
  return Object.freeze({
    ...(options.caller === undefined ? {} : { caller: options.caller }),
    deadline,
    signal:
      options.caller === undefined
        ? deadline
        : AbortSignal.any([options.caller, deadline]),
  });
}

export function catalogProbeResourceUrl(
  normalizedOrigin: string,
  route: string,
): string {
  try {
    const origin = new URL(normalizedOrigin);
    const url = new URL(route, `${origin.origin}/`);
    if (
      origin.origin !== normalizedOrigin ||
      origin.protocol !== "https:" ||
      url.origin !== origin.origin ||
      url.pathname !== route ||
      url.search !== "" ||
      url.hash !== ""
    ) {
      throw new Error("mismatch");
    }
    return url.toString();
  } catch {
    throw new Error("catalog probe origin is invalid");
  }
}

export function catalogProbeInterruption(
  state: CatalogProbeNetworkState,
): Error | undefined {
  if (state.caller?.aborted === true)
    return new Error("catalog probe cancelled");
  if (state.deadline.aborted)
    return new Error("catalog probe deadline exceeded");
  return undefined;
}
