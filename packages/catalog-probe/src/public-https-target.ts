import { isIP } from "node:net";
import { requirePublicProbeAddress } from "./probe-address.js";

export type ProbeAddress = Readonly<{ address: string; family: 4 | 6 }>;
export type ProbeAddressResolverRequest = Readonly<{
  hostname: string;
  signal: AbortSignal;
}>;
export type ProbeAddressResolver = (
  request: ProbeAddressResolverRequest,
) => Promise<ReadonlyArray<ProbeAddress>>;

export type PublicHttpsTarget = Readonly<{
  hostname: string;
  resolvedAt: string;
  url: string;
}>;

type TargetAuthority = Readonly<{
  addresses: ReadonlyArray<ProbeAddress>;
  hostname: string;
  url: URL;
}>;

const authorities = new WeakMap<object, TargetAuthority>();

function resolveAnswers(
  resolve: ProbeAddressResolver,
  request: ProbeAddressResolverRequest,
): Promise<ReadonlyArray<ProbeAddress>> {
  return new Promise((accept, reject) => {
    let settled = false;
    const finish = (complete: () => void) => {
      if (settled) return;
      settled = true;
      request.signal.removeEventListener("abort", onAbort);
      complete();
    };
    const onAbort = () =>
      finish(() => reject(new Error("catalog probe DNS interrupted")));
    request.signal.addEventListener("abort", onAbort, { once: true });
    if (request.signal.aborted) return onAbort();
    try {
      void resolve(request).then(
        (answers) => finish(() => accept(answers)),
        (error: unknown) => finish(() => reject(error)),
      );
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

function parseTarget(value: string): URL {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > 8_192) {
    throw new Error("probe target is invalid");
  }
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^\[|\]$/gu, "");
    if (
      url.protocol !== "https:" ||
      url.toString() !== value ||
      url.username !== "" ||
      url.password !== "" ||
      url.hash !== "" ||
      hostname.endsWith(".") ||
      hostname.length > 253 ||
      isIP(hostname) !== 0
    ) {
      throw new Error("unsafe");
    }
    return url;
  } catch {
    throw new Error("probe target is invalid");
  }
}

export async function resolvePublicHttpsTarget(
  value: string,
  resolve: ProbeAddressResolver,
  signal: AbortSignal,
): Promise<PublicHttpsTarget> {
  const url = parseTarget(value);
  if (
    typeof resolve !== "function" ||
    !(signal instanceof AbortSignal) ||
    signal.aborted
  ) {
    throw new Error("probe DNS request is invalid");
  }
  const answers = await resolveAnswers(
    resolve,
    Object.freeze({ hostname: url.hostname, signal }),
  );
  if (!Array.isArray(answers) || answers.length < 1 || answers.length > 16) {
    throw new Error("probe DNS answer count is invalid");
  }
  const validated = answers.map(({ address, family }) =>
    requirePublicProbeAddress(address, family),
  );
  if (new Set(validated.map(({ key }) => key)).size !== validated.length) {
    throw new Error("probe DNS answers must be unique");
  }
  const selected = [...validated].sort((left, right) =>
    Buffer.compare(Buffer.from(left.key), Buffer.from(right.key)),
  );
  const resolvedAt = new Date().toISOString();
  const target = Object.freeze({
    hostname: url.hostname,
    resolvedAt,
    url: url.toString(),
  });
  authorities.set(
    target,
    Object.freeze({
      addresses: Object.freeze(
        selected.map(({ address, family }) =>
          Object.freeze({ address, family }),
        ),
      ),
      hostname: url.hostname,
      url,
    }),
  );
  return target;
}

export function readPublicHttpsTarget(candidate: unknown): TargetAuthority {
  if (typeof candidate !== "object" || candidate === null) {
    throw new Error("public HTTPS probe target is not authenticated");
  }
  const authority = authorities.get(candidate);
  if (authority === undefined) {
    throw new Error("public HTTPS probe target is not authenticated");
  }
  return authority;
}
