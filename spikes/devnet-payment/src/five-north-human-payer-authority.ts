import { createHash } from "node:crypto";
import type { SpikeConfig } from "./config.js";
import type { FiveNorthHumanWalletProfile } from "./five-north-human-wallet-profile.js";
import {
  createFiveNorthWalletPreflightHttp,
  type FiveNorthWalletPreflightHttp,
} from "./five-north-wallet-preflight-http.js";
import {
  parseAuthenticatedUser,
  parseWalletRights,
} from "./five-north-wallet-preflight-validation.js";
import { readFiveNorthAccessTokenSubject } from "./five-north-token.js";

type Input = Readonly<{
  network: SpikeConfig["network"];
  profile: FiveNorthHumanWalletProfile;
  signal: AbortSignal;
}>;

type AuthorityHttp = Pick<
  FiveNorthWalletPreflightHttp,
  "getJson" | "tokenProvider"
>;

type Dependencies = Readonly<{
  createHttp: (
    network: SpikeConfig["network"],
    options: Readonly<{ signal: AbortSignal }>,
  ) => AuthorityHttp;
}>;

export type FiveNorthHumanPayerNamedRightsResult = Readonly<{
  broadRightsNotAssessed: true;
  namedActAsAbsent: true;
  namedExecuteAsAbsent: true;
  rightsCount: number;
  subjectHash: `sha256:${string}`;
}>;

const DEFAULT_DEPENDENCIES: Dependencies = {
  createHttp: createFiveNorthWalletPreflightHttp,
};

function active(signal: unknown): asserts signal is AbortSignal {
  if (!(signal instanceof AbortSignal)) {
    throw new Error("human payer authority gate signal is invalid");
  }
  if (signal.aborted) throw new Error("human payer authority gate cancelled");
}

function payerParty(profile: FiveNorthHumanWalletProfile): string {
  const party = profile?.party;
  if (
    typeof party !== "string" ||
    party === "" ||
    party.trim() !== party ||
    Buffer.byteLength(party, "utf8") > 512
  ) {
    throw new Error("human payer authority gate Party is invalid");
  }
  return party;
}

export async function requireFiveNorthHumanPayerNamedRightsAbsent(
  input: Input,
  dependencies: Dependencies = DEFAULT_DEPENDENCIES,
): Promise<FiveNorthHumanPayerNamedRightsResult> {
  active(input.signal);
  const party = payerParty(input.profile);
  const http = dependencies.createHttp(input.network, { signal: input.signal });
  const token = await http.tokenProvider.accessToken();
  active(input.signal);
  const tokenSubject = readFiveNorthAccessTokenSubject(token);
  const authenticatedSubject = parseAuthenticatedUser(
    await http.getJson("/v2/authenticated-user", input.signal),
    tokenSubject,
  );
  active(input.signal);
  const rights = parseWalletRights(
    await http.getJson(
      `/v2/users/${encodeURIComponent(authenticatedSubject)}/rights`,
      input.signal,
    ),
  );
  active(input.signal);
  const namedActAsAbsent = !rights.some(
    (right) => right.kind === "act-as" && right.party === party,
  );
  const namedExecuteAsAbsent = !rights.some(
    (right) => right.kind === "execute-as" && right.party === party,
  );
  if (!namedActAsAbsent || !namedExecuteAsAbsent) {
    throw new Error("Five North named human payer right is present");
  }
  return Object.freeze({
    broadRightsNotAssessed: true,
    namedActAsAbsent: true,
    namedExecuteAsAbsent: true,
    rightsCount: rights.length,
    subjectHash: `sha256:${createHash("sha256")
      .update(authenticatedSubject)
      .digest("hex")}`,
  });
}
