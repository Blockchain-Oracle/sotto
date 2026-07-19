import type { PaymentAuthorization } from "./authorization.js";

export type PreparedPaymentIntent = Readonly<{
  amount: string;
  asset: string;
  expiresAt: string;
  instrumentId: Readonly<{ admin: string; id: string }>;
  network: string;
  payerParty: string;
  recipient: string;
  requestCommitment: string;
  scheme: string;
  synchronizerId: string;
  transferMethod: string;
}>;

export type PreparedPayment = Readonly<{
  intent: PreparedPaymentIntent;
  preparedTransaction: Uint8Array;
  preparedTransactionHash: string;
}>;

export type SignerBoundaryDependencies = Readonly<{
  claimAttempt: (attemptId: string) => Promise<boolean>;
  recomputeHash?: (preparedTransaction: Uint8Array) => Promise<string>;
  signHash: (hash: string) => Promise<Readonly<{ paymentReference: string }>>;
}>;

type SigningInput = Readonly<{
  authorization: PaymentAuthorization;
  now: Date;
  prepared: PreparedPayment;
}>;

export type SignedPaymentReference = Readonly<{
  attemptId: string;
  paymentReference: string;
  preparedTransactionHash: string;
}>;

function assertSame(field: string, actual: string, expected: string): void {
  if (actual !== expected) {
    throw new Error(`Prepared payment changed ${field}`);
  }
}

function verifyIntent(input: SigningInput): void {
  const { authorization, prepared } = input;
  const { requirement } = authorization;
  if (input.now.getTime() >= Date.parse(authorization.expiresAt)) {
    throw new Error("Payment authorization is stale");
  }
  const comparisons = [
    [
      "request commitment",
      prepared.intent.requestCommitment,
      authorization.requestCommitment,
    ],
    ["payer", prepared.intent.payerParty, authorization.payerParty],
    ["amount", prepared.intent.amount, requirement.amount],
    ["asset", prepared.intent.asset, requirement.asset],
    ["recipient", prepared.intent.recipient, requirement.payTo],
    ["network", prepared.intent.network, requirement.network],
    ["scheme", prepared.intent.scheme, requirement.scheme],
    [
      "transfer method",
      prepared.intent.transferMethod,
      requirement.extra.assetTransferMethod,
    ],
    [
      "synchronizer",
      prepared.intent.synchronizerId,
      requirement.extra.synchronizerId,
    ],
    ["expiry", prepared.intent.expiresAt, authorization.expiresAt],
    [
      "instrument admin",
      prepared.intent.instrumentId.admin,
      requirement.extra.instrumentId.admin,
    ],
    [
      "instrument id",
      prepared.intent.instrumentId.id,
      requirement.extra.instrumentId.id,
    ],
  ] as const;
  for (const [field, actual, expected] of comparisons) {
    assertSame(field, actual, expected);
  }
}

export async function verifyAndSignPayment(
  input: SigningInput,
  dependencies: SignerBoundaryDependencies,
): Promise<SignedPaymentReference> {
  verifyIntent(input);
  if (dependencies.recomputeHash === undefined) {
    throw new Error("Signer boundary requires local recomputeHash");
  }
  const recomputedHash = await dependencies.recomputeHash(
    input.prepared.preparedTransaction,
  );
  assertSame(
    "prepared transaction hash",
    recomputedHash,
    input.prepared.preparedTransactionHash,
  );
  if (!(await dependencies.claimAttempt(input.authorization.attemptId))) {
    throw new Error("Payment attempt is already claimed");
  }
  const signed = await dependencies.signHash(recomputedHash);
  if (signed.paymentReference.trim() === "") {
    throw new Error("Signer returned an empty payment reference");
  }
  return {
    attemptId: input.authorization.attemptId,
    paymentReference: signed.paymentReference,
    preparedTransactionHash: recomputedHash,
  };
}
