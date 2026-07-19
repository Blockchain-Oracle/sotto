import { PreparedTransaction } from "@canton-network/core-ledger-proto";
import {
  buildBoundedCapabilityBootstrapPrepareRequest,
  type BoundedCapabilityBootstrapPrepareRequest,
} from "../src/bounded-capability-bootstrap-prepare.js";
import { type BoundedCapabilityBootstrapRequest } from "../src/bounded-capability-bootstrap.js";
import {
  fixtureIdentifier,
  fixtureRecord,
  fixtureScalar,
  fixtureTimestamp,
} from "./prepared-purchase-value.fixtures.js";

const HOLDING_PACKAGE_ID =
  "718a0f77e505a8de22f188bd4c87fe74101274e9d4cb1bfac7d09aec7158d35b";

export const CAPABILITY_BOOTSTRAP_INPUT = Object.freeze({
  agentParty: "sotto-policy-agent::1220participant",
  allowedRecipient: "sotto-spike-provider::1220participant",
  allowedResourceHash: `sha256:${"a".repeat(64)}` as const,
  expiresAt: "2026-07-15T11:00:00.000Z",
  instrument: Object.freeze({ admin: "DSO::1220dso", id: "Amulet" }),
  maximumTotalDebitAtomic: "3250000000",
  network: "canton:devnet" as const,
  payerParty: "sotto-spike-payer::1220participant",
  perCallLimitAtomic: "2500000000",
  remainingAllowanceAtomic: "10000000000",
  synchronizerId: "global-domain::1220synchronizer",
  transferFactoryContractId: "00transferfactory",
  userId: "ledger-user-6",
});

function createCommand(request: BoundedCapabilityBootstrapPrepareRequest) {
  const create = request.commands[0]?.CreateCommand;
  if (create === undefined) {
    throw new Error("prepared capability fixture create is absent");
  }
  return create;
}

function capabilityArgument(request: BoundedCapabilityBootstrapPrepareRequest) {
  const create = createCommand(request);
  const value = create.createArguments;
  return fixtureRecord(create.templateId, [
    ["payer", fixtureScalar("party", value.payer)],
    ["agent", fixtureScalar("party", value.agent)],
    [
      "resourceBindingVersion",
      fixtureScalar("text", value.resourceBindingVersion),
    ],
    ["allowedResourceHash", fixtureScalar("text", value.allowedResourceHash)],
    ["allowedRecipient", fixtureScalar("party", value.allowedRecipient)],
    [
      "instrumentId",
      fixtureRecord(
        `${HOLDING_PACKAGE_ID}:Splice.Api.Token.HoldingV1:InstrumentId`,
        [
          ["admin", fixtureScalar("party", value.instrumentId.admin)],
          ["id", fixtureScalar("text", value.instrumentId.id)],
        ],
      ),
    ],
    ["perCallLimit", fixtureScalar("numeric", value.perCallLimit)],
    ["remainingAllowance", fixtureScalar("numeric", value.remainingAllowance)],
    ["maximumTotalDebit", fixtureScalar("numeric", value.maximumTotalDebit)],
    ["expiresAt", fixtureTimestamp(value.expiresAt)],
    ["revision", fixtureScalar("int64", value.revision)],
    ["paused", fixtureScalar("bool", value.paused)],
    [
      "transferFactoryCid",
      fixtureScalar("contractId", value.transferFactoryCid),
    ],
    ["expectedAdmin", fixtureScalar("party", value.expectedAdmin)],
  ]);
}

export function validPreparedCapabilityBootstrap(
  request: BoundedCapabilityBootstrapRequest,
) {
  const prepareRequest = buildBoundedCapabilityBootstrapPrepareRequest(request);
  return validPreparedCapabilityBootstrapFromPrepare(prepareRequest);
}

export function validPreparedCapabilityBootstrapFromPrepare(
  prepareRequest: BoundedCapabilityBootstrapPrepareRequest,
) {
  const create = createCommand(prepareRequest);
  const preparationTime =
    BigInt(Date.parse("2026-07-15T10:00:01.000Z")) * 1_000n;
  const maxRecordTime =
    BigInt(Date.parse(prepareRequest.maxRecordTime)) * 1_000n;
  return PreparedTransaction.create({
    transaction: {
      version: "2.1",
      roots: ["0"],
      nodes: [
        {
          nodeId: "0",
          versionedNode: {
            oneofKind: "v1",
            v1: {
              nodeType: {
                oneofKind: "create",
                create: {
                  lfVersion: "2.1",
                  contractId: "00prepared-capability",
                  packageName: "sotto-control",
                  templateId: fixtureIdentifier(create.templateId),
                  argument: capabilityArgument(prepareRequest),
                  signatories: [create.createArguments.payer],
                  stakeholders: [
                    create.createArguments.payer,
                    create.createArguments.agent,
                  ],
                },
              },
            },
          },
        },
      ],
      nodeSeeds: [{ nodeId: 0, seed: new Uint8Array(32).fill(7) }],
    },
    metadata: {
      submitterInfo: {
        actAs: [create.createArguments.payer],
        commandId: prepareRequest.commandId,
      },
      synchronizerId: prepareRequest.synchronizerId,
      mediatorGroup: 0,
      transactionUuid: "00000000-0000-4000-8000-000000000002",
      preparationTime,
      inputContracts: [],
      globalKeyMapping: [],
      minLedgerEffectiveTime: preparationTime,
      maxLedgerEffectiveTime: maxRecordTime - 1_000n,
      maxRecordTime,
    },
  });
}

export type PreparedCapabilityBootstrapFixture = ReturnType<
  typeof validPreparedCapabilityBootstrap
>;

export function preparedCapabilityBootstrapResponse(
  request: BoundedCapabilityBootstrapRequest,
  mutateResponse?: (response: Record<string, unknown>) => void,
  mutatePrepared?: (prepared: PreparedCapabilityBootstrapFixture) => void,
  mutatePreparedBytes?: (prepared: Uint8Array) => Uint8Array,
): Uint8Array {
  const fixture = validPreparedCapabilityBootstrap(request);
  mutatePrepared?.(fixture);
  const canonical = PreparedTransaction.toBinary(fixture, {
    writeUnknownFields: false,
  });
  const prepared = mutatePreparedBytes?.(canonical) ?? canonical;
  const response: Record<string, unknown> = {
    preparedTransaction: Buffer.from(prepared).toString("base64"),
    preparedTransactionHash: Buffer.alloc(32, 7).toString("base64"),
    hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
    hashingDetails: null,
    costEstimation: null,
  };
  mutateResponse?.(response);
  return new TextEncoder().encode(JSON.stringify(response));
}
