import type { PackagePreferenceReader } from "@sotto/x402-canton";
import type { SpikeConfig } from "../src/config.js";

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export type SubjectModule = Readonly<{
  createFiveNorthPackagePreferenceReader(
    network: SpikeConfig["network"],
    options: Readonly<{ fetcher?: Fetcher; signal: AbortSignal }>,
  ): PackagePreferenceReader;
}>;

export type GetSubject = () => SubjectModule;
