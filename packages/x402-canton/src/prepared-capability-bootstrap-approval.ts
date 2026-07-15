import { boundedCapabilityBootstrapState } from "./bounded-capability-bootstrap-state.js";
import {
  readHashVerifiedPreparedCapabilityBootstrap,
  type HashVerifiedPreparedCapabilityBootstrap,
} from "./prepared-capability-bootstrap-hash.js";

export const PREPARED_CAPABILITY_APPROVAL_VERSION =
  "sotto-capability-approval-v1" as const;

export type PreparedCapabilityBootstrapApproval = Readonly<{
  action: "create-purchase-capability";
  agentParty: string;
  expiresAt: string;
  instrument: Readonly<{ admin: string; id: string }>;
  limits: Readonly<{
    maximumTotalDebitAtomic: string;
    perCallLimitAtomic: string;
    remainingAllowanceAtomic: string;
  }>;
  network: `canton:${string}`;
  packageId: string;
  payerParty: string;
  preparedTransactionHash: `sha256:${string}`;
  recipientParty: string;
  resourceHash: `sha256:${string}`;
  revision: string;
  synchronizerId: string;
  templateId: string;
  transferFactoryContractId: string;
  version: typeof PREPARED_CAPABILITY_APPROVAL_VERSION;
}>;

export function projectPreparedCapabilityBootstrapApproval(
  verified: HashVerifiedPreparedCapabilityBootstrap,
): PreparedCapabilityBootstrapApproval {
  const observed = readHashVerifiedPreparedCapabilityBootstrap(verified);
  const state = boundedCapabilityBootstrapState(observed.request);
  const expected = state.expected;
  return Object.freeze({
    action: "create-purchase-capability" as const,
    agentParty: expected.agentParty,
    expiresAt: expected.expiresAt,
    instrument: Object.freeze({ ...expected.instrument }),
    limits: Object.freeze({
      maximumTotalDebitAtomic: expected.maximumTotalDebitAtomic,
      perCallLimitAtomic: expected.perCallLimitAtomic,
      remainingAllowanceAtomic: expected.remainingAllowanceAtomic,
    }),
    network: state.network,
    packageId: state.packageId,
    payerParty: expected.payerParty,
    preparedTransactionHash: `sha256:${Buffer.from(
      observed.preparedTransactionHash,
      "base64",
    ).toString("hex")}` as const,
    recipientParty: expected.recipient,
    resourceHash: expected.resourceHash,
    revision: expected.revision,
    synchronizerId: state.synchronizerId,
    templateId: expected.templateId,
    transferFactoryContractId: expected.transferFactoryContractId,
    version: PREPARED_CAPABILITY_APPROVAL_VERSION,
  });
}
