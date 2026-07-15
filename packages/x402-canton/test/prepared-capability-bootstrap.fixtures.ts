import { PreparedTransaction } from "@canton-network/core-ledger-proto";
import type { BoundedCapabilityBootstrapRequest } from "../src/index.js";
import {
  fixtureIdentifier,
  fixtureRecord,
  fixtureScalar,
  fixtureTimestamp,
} from "./prepared-purchase-value.fixtures.js";

const HOLDING_PACKAGE_ID =
  "718a0f77e505a8de22f188bd4c87fe74101274e9d4cb1bfac7d09aec7158d35b";

function createCommand(request: BoundedCapabilityBootstrapRequest) {
  const create = request.commands[0]?.CreateCommand;
  if (create === undefined) {
    throw new Error("prepared capability fixture create is absent");
  }
  return create;
}

function capabilityArgument(request: BoundedCapabilityBootstrapRequest) {
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
  const create = createCommand(request);
  const preparationTime =
    BigInt(Date.parse("2026-07-15T10:00:01.000Z")) * 1_000n;
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
                  argument: capabilityArgument(request),
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
        commandId: request.commandId,
      },
      synchronizerId: request.synchronizerId,
      mediatorGroup: 0,
      transactionUuid: "00000000-0000-4000-8000-000000000002",
      preparationTime,
      inputContracts: [],
      globalKeyMapping: [],
      minLedgerEffectiveTime: preparationTime,
      maxLedgerEffectiveTime: preparationTime + 299_000_000n,
      maxRecordTime: preparationTime + 300_000_000n,
    },
  });
}

export function preparedCapabilityBootstrapResponse(
  request: BoundedCapabilityBootstrapRequest,
  mutate?: (response: Record<string, unknown>) => void,
): Uint8Array {
  const prepared = PreparedTransaction.toBinary(
    validPreparedCapabilityBootstrap(request),
    { writeUnknownFields: false },
  );
  const response: Record<string, unknown> = {
    preparedTransaction: Buffer.from(prepared).toString("base64"),
    preparedTransactionHash: Buffer.alloc(32, 7).toString("base64"),
    hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
    hashingDetails: null,
    costEstimation: null,
  };
  mutate?.(response);
  return new TextEncoder().encode(JSON.stringify(response));
}
