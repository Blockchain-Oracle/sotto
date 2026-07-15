import type { Value } from "@canton-network/core-ledger-proto";
import {
  CAPABILITY_BOOTSTRAP_INPUT,
  type PreparedCapabilityBootstrapFixture,
} from "./prepared-capability-bootstrap.fixtures.js";
import {
  fixtureScalar,
  fixtureTimestamp,
} from "./prepared-purchase-value.fixtures.js";

type Mutation = (prepared: PreparedCapabilityBootstrapFixture) => void;
type MutationCase = readonly [string, Mutation];

function rootCreate(prepared: PreparedCapabilityBootstrapFixture) {
  const wrapper = prepared.transaction?.nodes[0]?.versionedNode;
  if (wrapper?.oneofKind !== "v1") throw new Error("fixture root is absent");
  const root = wrapper.v1.nodeType;
  if (root.oneofKind !== "create") throw new Error("fixture root is invalid");
  return root.create;
}

function argumentField(
  prepared: PreparedCapabilityBootstrapFixture,
  name: string,
): { value?: Value } {
  const argument = rootCreate(prepared).argument;
  if (argument?.sum.oneofKind !== "record") {
    throw new Error("fixture argument is absent");
  }
  const field = argument.sum.record.fields.find(({ label }) => label === name);
  if (field === undefined) throw new Error(`fixture ${name} is absent`);
  return field;
}

function replace(name: string, value: Value): Mutation {
  return (prepared) => (argumentField(prepared, name).value = value);
}

const values: ReadonlyArray<MutationCase> = [
  [
    "payer",
    replace(
      "payer",
      fixtureScalar("party", CAPABILITY_BOOTSTRAP_INPUT.agentParty),
    ),
  ],
  [
    "agent",
    replace(
      "agent",
      fixtureScalar("party", CAPABILITY_BOOTSTRAP_INPUT.payerParty),
    ),
  ],
  [
    "resource binding",
    replace("resourceBindingVersion", fixtureScalar("text", "wrong")),
  ],
  [
    "resource hash",
    replace(
      "allowedResourceHash",
      fixtureScalar("text", `sha256:${"b".repeat(64)}`),
    ),
  ],
  [
    "recipient",
    replace(
      "allowedRecipient",
      fixtureScalar("party", CAPABILITY_BOOTSTRAP_INPUT.agentParty),
    ),
  ],
  [
    "per-call limit",
    replace("perCallLimit", fixtureScalar("numeric", "0.2499999999")),
  ],
  [
    "allowance",
    replace("remainingAllowance", fixtureScalar("numeric", "0.9999999999")),
  ],
  [
    "maximum debit",
    replace("maximumTotalDebit", fixtureScalar("numeric", "0.3249999999")),
  ],
  [
    "expiry",
    replace("expiresAt", fixtureTimestamp("2026-07-15T10:59:59.999Z")),
  ],
  ["revision", replace("revision", fixtureScalar("int64", "1"))],
  ["paused", replace("paused", fixtureScalar("bool", true))],
  [
    "transfer factory",
    replace("transferFactoryCid", fixtureScalar("contractId", "00other")),
  ],
  [
    "expected admin",
    replace(
      "expectedAdmin",
      fixtureScalar("party", CAPABILITY_BOOTSTRAP_INPUT.agentParty),
    ),
  ],
  [
    "instrument admin",
    (prepared) => {
      const value = argumentField(prepared, "instrumentId").value;
      if (value?.sum.oneofKind !== "record")
        throw new Error("instrument absent");
      value.sum.record.fields[0]!.value = fixtureScalar(
        "party",
        CAPABILITY_BOOTSTRAP_INPUT.agentParty,
      );
    },
  ],
  [
    "instrument ID",
    (prepared) => {
      const value = argumentField(prepared, "instrumentId").value;
      if (value?.sum.oneofKind !== "record")
        throw new Error("instrument absent");
      value.sum.record.fields[1]!.value = fixtureScalar("text", "Other");
    },
  ],
];

const structure: ReadonlyArray<MutationCase> = [
  ["transaction version", (value) => (value.transaction!.version = "2.0")],
  ["node ID", (value) => (value.transaction!.nodes[0]!.nodeId = "1")],
  ["missing seed", (value) => void value.transaction!.nodeSeeds.splice(0)],
  ["wrong seed node", (value) => (value.transaction!.nodeSeeds[0]!.nodeId = 1)],
  [
    "short seed",
    (value) => (value.transaction!.nodeSeeds[0]!.seed = new Uint8Array(31)),
  ],
  [
    "extra seed",
    (value) =>
      value.transaction!.nodeSeeds.push(
        structuredClone(value.transaction!.nodeSeeds[0]!),
      ),
  ],
  ["root LF version", (value) => (rootCreate(value).lfVersion = "2.0")],
  ["empty create CID", (value) => (rootCreate(value).contractId = "")],
  [
    "template module",
    (value) => (rootCreate(value).templateId!.moduleName = "Wrong"),
  ],
  [
    "template entity",
    (value) => (rootCreate(value).templateId!.entityName = "Wrong"),
  ],
  [
    "duplicate signatory",
    (value) =>
      rootCreate(value).signatories.push(CAPABILITY_BOOTSTRAP_INPUT.payerParty),
  ],
  [
    "extra stakeholder",
    (value) =>
      rootCreate(value).stakeholders.push(
        CAPABILITY_BOOTSTRAP_INPUT.allowedRecipient,
      ),
  ],
  [
    "argument record ID",
    (value) => {
      const argument = rootCreate(value).argument;
      if (argument?.sum.oneofKind !== "record")
        throw new Error("argument absent");
      argument.sum.record.recordId!.entityName = "Wrong";
    },
  ],
  [
    "missing argument field",
    (value) => {
      const argument = rootCreate(value).argument;
      if (argument?.sum.oneofKind !== "record")
        throw new Error("argument absent");
      argument.sum.record.fields.pop();
    },
  ],
];

const metadata: ReadonlyArray<MutationCase> = [
  ["missing metadata", (value) => delete value.metadata],
  ["missing submitter", (value) => delete value.metadata!.submitterInfo],
  [
    "transaction UUID",
    (value) => (value.metadata!.transactionUuid = "invalid"),
  ],
  [
    "preparation before request",
    (value) => (value.metadata!.preparationTime -= 1_000_001n),
  ],
  [
    "preparation after clock tolerance",
    (value) => (value.metadata!.preparationTime += 5_000_001n),
  ],
  ["maximum record time", (value) => (value.metadata!.maxRecordTime! += 1n)],
  [
    "missing minimum ledger time",
    (value) => delete value.metadata!.minLedgerEffectiveTime,
  ],
  [
    "minimum after preparation",
    (value) => (value.metadata!.minLedgerEffectiveTime! += 2_000_000n),
  ],
  [
    "maximum before preparation",
    (value) => (value.metadata!.maxLedgerEffectiveTime = 0n),
  ],
  [
    "maximum at record time",
    (value) => {
      const maximum = value.metadata!.maxRecordTime;
      if (maximum === undefined) throw new Error("fixture record time absent");
      value.metadata!.maxLedgerEffectiveTime = maximum;
    },
  ],
];

export const PREPARED_CAPABILITY_MUTATIONS = Object.freeze([
  ...values,
  ...structure,
  ...metadata,
]);
