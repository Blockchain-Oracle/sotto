import { createHash } from "node:crypto";

process.loadEnvFile(".env.local");

const required = (name) => {
  const value = process.env[name];
  if (value === undefined || value.trim() === "")
    throw new Error(`missing ${name}`);
  return value;
};
const validatorUrl = required("FIVE_NORTH_VALIDATOR_URL").replace(/\/$/u, "");
const ledgerUrl = required("FIVE_NORTH_LEDGER_URL").replace(/\/$/u, "");
const provider = required("PROVIDER_PARTY");
const tokenResponse = await fetch(required("FIVE_NORTH_OIDC_TOKEN_URL"), {
  body: new URLSearchParams({
    audience: required("FIVE_NORTH_OIDC_AUDIENCE"),
    client_id: required("FIVE_NORTH_OIDC_CLIENT_ID"),
    client_secret: required("FIVE_NORTH_OIDC_CLIENT_SECRET"),
    grant_type: "client_credentials",
    scope: required("FIVE_NORTH_OIDC_SCOPE"),
  }),
  headers: { "content-type": "application/x-www-form-urlencoded" },
  method: "POST",
  redirect: "error",
  signal: AbortSignal.timeout(10_000),
});
if (!tokenResponse.ok) throw new Error(`token HTTP ${tokenResponse.status}`);
const tokenPayload = await tokenResponse.json();
if (typeof tokenPayload.access_token !== "string")
  throw new Error("token missing");
const authorization = { authorization: `Bearer ${tokenPayload.access_token}` };
const boundedJson = async (response) => {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 2_000_000) throw new Error("response too large");
  return bytes.byteLength === 0
    ? null
    : JSON.parse(new TextDecoder().decode(bytes));
};
const digest = (value) =>
  createHash("sha256").update(String(value)).digest("hex");

const validatorUserResponse = await fetch(`${validatorUrl}/v0/validator-user`, {
  method: "GET",
  redirect: "error",
  signal: AbortSignal.timeout(10_000),
});
const validatorUser = await boundedJson(validatorUserResponse);
const operatorParty = validatorUser?.party_id;

const preapprovalResponse = await fetch(
  `${validatorUrl}/v0/admin/transfer-preapprovals/by-party/${encodeURIComponent(provider)}`,
  {
    headers: authorization,
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  },
);
const preapproval = await boundedJson(preapprovalResponse);

const packageMapCandidates = await Promise.all(
  ["/v2/packages/package-name-map", "/v2/packages"].map(async (path) => {
    const response = await fetch(`${ledgerUrl}${path}`, {
      headers: authorization,
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
    const payload = await boundedJson(response).catch(() => null);
    return {
      path,
      status: response.status,
      keys:
        payload !== null &&
        typeof payload === "object" &&
        !Array.isArray(payload)
          ? Object.keys(payload).sort()
          : [],
      count: Array.isArray(payload)
        ? payload.length
        : Array.isArray(payload?.packageIds)
          ? payload.packageIds.length
          : null,
    };
  }),
);

const packagePreferenceResponse = await fetch(
  `${ledgerUrl}/v2/interactive-submission/preferred-packages`,
  {
    body: JSON.stringify({
      packageVettingRequirements: [
        {
          packageName: "splice-wallet",
          parties: [provider, operatorParty],
        },
      ],
    }),
    headers: { ...authorization, "content-type": "application/json" },
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  },
);
const packagePreference = await boundedJson(packagePreferenceResponse);
const walletReference = Array.isArray(packagePreference?.packageReferences)
  ? packagePreference.packageReferences.find(
      (candidate) => candidate?.packageName === "splice-wallet",
    )
  : undefined;
const ledgerEndResponse = await fetch(`${ledgerUrl}/v2/state/ledger-end`, {
  headers: authorization,
  method: "GET",
  redirect: "error",
  signal: AbortSignal.timeout(10_000),
});
const ledgerEnd = await boundedJson(ledgerEndResponse);
let proposals = null;
if (
  typeof walletReference?.packageId === "string" &&
  Number.isSafeInteger(ledgerEnd?.offset)
) {
  const proposalTemplate =
    "#splice-wallet:Splice.Wallet.TransferPreapproval:TransferPreapprovalProposal";
  const proposalResponse = await fetch(
    `${ledgerUrl}/v2/state/active-contracts`,
    {
      body: JSON.stringify({
        activeAtOffset: ledgerEnd.offset,
        filter: {
          filtersByParty: {
            [provider]: {
              cumulative: [
                {
                  identifierFilter: {
                    TemplateFilter: {
                      value: {
                        includeCreatedEventBlob: false,
                        templateId: proposalTemplate,
                      },
                    },
                  },
                },
              ],
            },
          },
        },
        verbose: false,
      }),
      headers: { ...authorization, "content-type": "application/json" },
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    },
  );
  const payload = await boundedJson(proposalResponse);
  proposals = {
    count: Array.isArray(payload) ? payload.length : null,
    errorCode:
      payload !== null && typeof payload === "object"
        ? (payload.code ?? payload.grpcCodeValue ?? null)
        : null,
    errorMessage:
      payload !== null &&
      typeof payload === "object" &&
      typeof payload.cause === "string"
        ? payload.cause.slice(0, 240)
        : null,
    status: proposalResponse.status,
  };
}

console.log(
  JSON.stringify(
    {
      operator: {
        featured: validatorUser?.featured === true,
        partyFormat:
          typeof operatorParty === "string" && operatorParty.includes("::1220"),
        partySha256:
          typeof operatorParty === "string" ? digest(operatorParty) : null,
        status: validatorUserResponse.status,
      },
      packages: packageMapCandidates,
      preferredWalletPackage: {
        idFormat:
          typeof walletReference?.packageId === "string" &&
          /^[0-9a-f]{64}$/u.test(walletReference.packageId),
        packageId: walletReference?.packageId ?? null,
        status: packagePreferenceResponse.status,
        synchronizerFormat:
          typeof packagePreference?.synchronizerId === "string" &&
          packagePreference.synchronizerId.includes("::1220"),
        version: walletReference?.packageVersion ?? null,
      },
      proposals,
      preapproval: {
        exists: preapprovalResponse.status === 200,
        status: preapprovalResponse.status,
        topLevelKeys:
          preapproval !== null &&
          typeof preapproval === "object" &&
          !Array.isArray(preapproval)
            ? Object.keys(preapproval).sort()
            : [],
      },
    },
    null,
    2,
  ),
);
