import {
  createFiveNorthHumanPackageSelectionClaimer,
  createFiveNorthTokenProvider,
  parseFiveNorthJson,
  readFiveNorthResponse,
} from "@sotto/canton-client";
import {
  createHumanPayerIdentityObserver,
  createHumanPaymentObserver,
  createHumanPurchaseCommitter,
  createHumanWalletConnectorPreflight,
  FIVE_NORTH_HOLDING_IMPLEMENTATION_PACKAGE_ID,
  HUMAN_PURCHASE_APPROVAL_VERSION,
  HUMAN_WALLET_CAPABILITIES_VERSION,
  readHumanPurchaseLedgerIntent,
  type HumanPurchaseLedgerIntent,
  type HumanWalletConnector,
} from "@sotto/x402-canton";
import type { ApiFiveNorthEnvironment } from "../env.js";
import type { SignerWalletClient } from "../signer-client.js";
import {
  createInitiationPayerIdentityReader,
  type HostedWalletProfile,
} from "./payer-identity.js";

const CONNECTOR_ID = "sotto-signer-service";
const CONNECTOR_ORIGIN = "wallet://sotto-signer";
const HUMAN_CHALLENGE_WINDOW_MS = 600_000;
const MAXIMUM_ALLOWED_FEE_ATOMIC = "1000000000";
const MAXIMUM_FEE_ATOMIC = "750000000";
const LEDGER_END_LIMIT = 8_192;
const FINGERPRINT = /^1220[0-9a-f]{64}$/u;

export class PayerProfileUnavailableError extends Error {
  readonly code = "PAYER_PROFILE_UNAVAILABLE";

  constructor(detail: string) {
    super(detail);
    this.name = "PayerProfileUnavailableError";
  }
}

export type AssembledPurchaseIntent = Readonly<{
  intent: HumanPurchaseLedgerIntent;
  beginExclusive: number;
}>;

export type IntentAssemblerInput = Readonly<{
  request: Readonly<{ method: string; url: string }>;
  response402: Response;
  providerParty: string;
  partyId: string;
  signal: AbortSignal;
}>;

export type IntentAssembler = (
  input: IntentAssemblerInput,
) => Promise<AssembledPurchaseIntent>;

function readProfile(
  partyId: string,
  body: Readonly<Record<string, unknown>>,
): HostedWalletProfile {
  const { walletId, fingerprint, publicKeyFormat } = body;
  if (
    typeof walletId !== "string" ||
    typeof fingerprint !== "string" ||
    !FINGERPRINT.test(fingerprint) ||
    publicKeyFormat !== "PUBLIC_KEY_FORMAT_RAW"
  ) {
    throw new PayerProfileUnavailableError(
      "The signer wallet profile is incomplete for this party.",
    );
  }
  if (
    body.partyId !== partyId ||
    typeof body.synchronizerId !== "string" ||
    typeof body.topologyHash !== "string"
  ) {
    throw new PayerProfileUnavailableError(
      "The signer wallet has not completed Five North onboarding for this " +
        "party. Complete hosted onboarding, then retry the purchase.",
    );
  }
  return Object.freeze({
    walletId,
    party: partyId,
    fingerprint: fingerprint as `1220${string}`,
    publicKeyFormat: "PUBLIC_KEY_FORMAT_RAW" as const,
    synchronizerId: body.synchronizerId,
    topologyHash: body.topologyHash,
  });
}

function readOnlyConnector(profile: HostedWalletProfile): HumanWalletConnector {
  const capabilities = Object.freeze({
    version: HUMAN_WALLET_CAPABILITIES_VERSION,
    approvalVersions: Object.freeze([HUMAN_PURCHASE_APPROVAL_VERSION]),
    connectorId: CONNECTOR_ID,
    connectorKind: "wallet-sdk" as const,
    explicitApproval: true as const,
    hashingSchemeVersions: Object.freeze(["HASHING_SCHEME_VERSION_V2"]),
    networks: Object.freeze(["canton:devnet" as const]),
    origin: CONNECTOR_ORIGIN,
    packageIds: Object.freeze([FIVE_NORTH_HOLDING_IMPLEMENTATION_PACKAGE_ID]),
    payerParty: profile.party,
    preparedTransactionSigning: true as const,
    signingKey: Object.freeze({
      fingerprint: profile.fingerprint,
      publicKeyFormat: profile.publicKeyFormat,
      purpose: "SIGNING" as const,
      signatureFormat: "SIGNATURE_FORMAT_CONCAT" as const,
      signingAlgorithm: "SIGNING_ALGORITHM_SPEC_ED25519" as const,
    }),
    synchronizerIds: Object.freeze([profile.synchronizerId]),
  });
  return Object.freeze({
    discover: async () => capabilities,
    requestApproval: async () => {
      throw new Error("purchase initiation never requests wallet approval");
    },
  });
}

function executeBefore(observedAt: string): string {
  const milliseconds = Date.parse(observedAt) + HUMAN_CHALLENGE_WINDOW_MS;
  if (!Number.isSafeInteger(milliseconds)) {
    throw new Error("human challenge deadline is invalid");
  }
  return new Date(milliseconds).toISOString();
}

/**
 * Live Five North intent assembler, mirroring the DevNet spike's
 * initialization path step for step: signer wallet profile, real payer
 * liveness reads, one real 402 observation, a live package-preference
 * claim, then the pinned trusted configuration commits the purchase. The
 * resulting ledger intent is exactly what
 * `initializeHumanPurchaseAttempt` journals; the worker prepares from it.
 */
export function createFiveNorthIntentAssembler(
  fiveNorth: ApiFiveNorthEnvironment,
  signer: SignerWalletClient,
): IntentAssembler {
  return async (input) => {
    const profileResult = await signer.readWalletProfileByParty(input.partyId, {
      signal: input.signal,
    });
    if (profileResult.status !== 200) {
      throw new PayerProfileUnavailableError(
        "The signer service has no hosted wallet for this party. Complete " +
          "hosted onboarding, then retry the purchase.",
      );
    }
    const profile = readProfile(input.partyId, profileResult.body);
    const preflight = await createHumanWalletConnectorPreflight(
      {
        connector: readOnlyConnector(profile),
        connectorId: CONNECTOR_ID,
        connectorKind: "wallet-sdk",
        connectorOrigin: CONNECTOR_ORIGIN,
        expectedPackageId: FIVE_NORTH_HOLDING_IMPLEMENTATION_PACKAGE_ID,
        observePayerIdentity: createHumanPayerIdentityObserver(
          createInitiationPayerIdentityReader({
            network: fiveNorth.config,
            profile,
            signal: input.signal,
          }),
        ),
      },
      { signal: input.signal },
    );
    if (preflight.outcome !== "compatible") {
      throw new Error(
        `signer wallet preflight is ${preflight.reason} for this purchase`,
      );
    }
    const payment = await createHumanPaymentObserver(
      async () => input.response402,
    )(input.request, { signal: input.signal });
    const claimPackageSelection = createFiveNorthHumanPackageSelectionClaimer(
      fiveNorth.config,
      { signal: input.signal },
    );
    const packageSelection = await claimPackageSelection({
      adminParty: fiveNorth.dsoAdminParty,
      challengeId: payment.challengeId,
      challengeObservedAt: payment.observedAt,
      executeBefore: executeBefore(payment.observedAt),
      providerParty: input.providerParty,
      signal: input.signal,
      walletPreflight: preflight,
    });
    const commitPurchase = createHumanPurchaseCommitter({
      contractId: fiveNorth.transferFactoryContractId,
      expectedAdmin: fiveNorth.dsoAdminParty,
      expectedAsset: "CC",
      expectedInstrumentId: "Amulet",
      maximumAllowedFeeAtomic: MAXIMUM_ALLOWED_FEE_ATOMIC,
    });
    const intent = readHumanPurchaseLedgerIntent(
      commitPurchase({
        maximumFeeAtomic: MAXIMUM_FEE_ATOMIC,
        packageSelection,
        paymentObservation: payment,
        walletPreflight: preflight,
      }),
    );
    return Object.freeze({
      intent,
      beginExclusive: await readLedgerEnd(fiveNorth, input.signal),
    });
  };
}

async function readLedgerEnd(
  fiveNorth: ApiFiveNorthEnvironment,
  signal: AbortSignal,
): Promise<number> {
  const tokens = createFiveNorthTokenProvider(fiveNorth.config, fetch, signal);
  const response = await fetch(
    `${fiveNorth.config.ledgerUrl}/v2/state/ledger-end`,
    {
      headers: { authorization: `Bearer ${await tokens.accessToken()}` },
      method: "GET",
      redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
    },
  );
  const body = parseFiveNorthJson(
    await readFiveNorthResponse(response, LEDGER_END_LIMIT),
    "Five North ledger end",
  );
  const offset =
    typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>).offset
      : undefined;
  if (
    typeof offset !== "number" ||
    !Number.isSafeInteger(offset) ||
    offset < 0
  ) {
    throw new Error("Five North ledger end offset is invalid");
  }
  return offset;
}
