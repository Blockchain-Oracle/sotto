import { CANCELLED, NODATA, NOTFOUND, Resolver } from "node:dns/promises";
import type {
  ProbeAddress,
  ProbeAddressResolver,
} from "./public-https-target.js";

type ProbeDnsResolver = Readonly<{
  cancel: () => void;
  resolve4: (hostname: string) => Promise<string[]>;
  resolve6: (hostname: string) => Promise<string[]>;
}>;

type ProbeDnsResolverFactory = () => ProbeDnsResolver;

function errorCode(error: unknown): unknown {
  return typeof error === "object" && error !== null && "code" in error
    ? error.code
    : undefined;
}

async function resolveFamily(
  query: () => Promise<string[]>,
  family: 4 | 6,
): Promise<ProbeAddress[]> {
  try {
    return (await query()).map((address) => ({ address, family }));
  } catch (error) {
    const code = errorCode(error);
    if (code === NODATA || code === NOTFOUND) return [];
    throw error;
  }
}

function deterministicAnswers(answers: ProbeAddress[]): ProbeAddress[] {
  return answers.sort((left, right) =>
    Buffer.compare(
      Buffer.from(`${left.family}:${left.address}`, "utf8"),
      Buffer.from(`${right.family}:${right.address}`, "utf8"),
    ),
  );
}

export function createSystemProbeAddressResolver(
  createResolver: ProbeDnsResolverFactory,
): ProbeAddressResolver {
  return async ({ hostname, signal }) => {
    if (signal.aborted) throw new Error("catalog probe DNS interrupted");
    const resolver = createResolver();
    let rejectInterruption!: (error: Error) => void;
    const interruption = new Promise<never>((_, reject) => {
      rejectInterruption = reject;
    });
    const onAbort = () => {
      resolver.cancel();
      rejectInterruption(new Error("catalog probe DNS interrupted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      const answers = await Promise.race([
        Promise.all([
          resolveFamily(() => resolver.resolve4(hostname), 4),
          resolveFamily(() => resolver.resolve6(hostname), 6),
        ]).then(([ipv4, ipv6]) => deterministicAnswers([...ipv4, ...ipv6])),
        interruption,
      ]);
      if (signal.aborted) throw new Error("catalog probe DNS interrupted");
      return answers;
    } catch (error) {
      if (signal.aborted || errorCode(error) === CANCELLED) {
        throw new Error("catalog probe DNS interrupted", { cause: error });
      }
      resolver.cancel();
      throw new Error("catalog probe DNS failed", { cause: error });
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  };
}

export const resolveSystemProbeAddresses = createSystemProbeAddressResolver(
  () => new Resolver(),
);
