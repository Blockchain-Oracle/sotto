import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildBoundedCapabilityBootstrap,
  createPreparedCapabilityBootstrapObserver,
  type BoundedCapabilityBootstrapRequest,
} from "../src/index.js";
import {
  preparedCapabilityBootstrapResponse,
  type PreparedCapabilityBootstrapFixture,
} from "./prepared-capability-bootstrap.fixtures.js";

const NOW = Date.parse("2026-07-15T10:00:00.000Z");
const input = {
  agentParty: "sotto-policy-agent::1220participant",
  allowedRecipient: "sotto-spike-provider::1220participant",
  allowedResourceHash: `sha256:${"a".repeat(64)}` as const,
  expiresAt: "2026-07-15T11:00:00.000Z",
  instrument: { admin: "DSO::1220dso", id: "Amulet" },
  maximumTotalDebitAtomic: "3250000000",
  payerParty: "sotto-spike-payer::1220participant",
  perCallLimitAtomic: "2500000000",
  remainingAllowanceAtomic: "10000000000",
  synchronizerId: "global-domain::1220synchronizer",
  transferFactoryContractId: "00transferfactory",
  userId: "ledger-user-6",
} as const;

type PreparedMutation = (prepared: PreparedCapabilityBootstrapFixture) => void;

function rootCreate(prepared: PreparedCapabilityBootstrapFixture) {
  const node = prepared.transaction?.nodes[0]?.versionedNode;
  if (node?.oneofKind !== "v1") throw new Error("fixture root is absent");
  const value = node.v1.nodeType;
  if (value.oneofKind !== "create") throw new Error("fixture root is invalid");
  return value.create;
}

function mutateArgumentParty(
  prepared: PreparedCapabilityBootstrapFixture,
): void {
  const argument = rootCreate(prepared).argument;
  if (argument?.sum.oneofKind !== "record") {
    throw new Error("fixture argument is absent");
  }
  const payer = argument.sum.record.fields.find(
    ({ label }) => label === "payer",
  );
  if (payer?.value?.sum.oneofKind !== "party") {
    throw new Error("fixture payer is absent");
  }
  payer.value.sum.party = "sotto-attacker::1220participant";
}

const preparedMutations: ReadonlyArray<readonly [string, PreparedMutation]> = [
  ["zero roots", (value) => void value.transaction?.roots.splice(0)],
  ["multiple roots", (value) => value.transaction?.roots.push("0")],
  [
    "a non-create root",
    (value) => {
      const wrapper = value.transaction!.nodes[0]!.versionedNode;
      if (wrapper.oneofKind !== "v1") throw new Error("fixture root is absent");
      wrapper.v1.nodeType = { oneofKind: undefined };
    },
  ],
  [
    "an extra node",
    (value) =>
      value.transaction?.nodes.push(
        structuredClone(value.transaction.nodes[0]!),
      ),
  ],
  [
    "the wrong package name",
    (value) => (rootCreate(value).packageName = "other"),
  ],
  [
    "the wrong template package",
    (value) => (rootCreate(value).templateId!.packageId = "f".repeat(64)),
  ],
  ["a changed contract argument", mutateArgumentParty],
  [
    "wrong signatories",
    (value) => void rootCreate(value).signatories.splice(0),
  ],
  ["wrong stakeholders", (value) => void rootCreate(value).stakeholders.pop()],
  [
    "wrong actAs metadata",
    (value) => (value.metadata!.submitterInfo!.actAs = [input.agentParty]),
  ],
  [
    "the wrong command ID",
    (value) => (value.metadata!.submitterInfo!.commandId = "wrong-command"),
  ],
  [
    "the wrong synchronizer",
    (value) => (value.metadata!.synchronizerId = "wrong::synchronizer"),
  ],
  [
    "hidden input effects",
    (value) =>
      value.metadata?.inputContracts.push({
        contract: {
          oneofKind: "v1",
          v1: structuredClone(rootCreate(value)),
        },
        createdAt: 1n,
        eventBlob: new Uint8Array([1]),
      }),
  ],
  [
    "hidden key effects",
    (value) => value.metadata?.globalKeyMapping.push({} as never),
  ],
  [
    "an invalid record-time bound",
    (value) => (value.metadata!.maxRecordTime = 0n),
  ],
];

describe("prepared capability bootstrap shape", () => {
  beforeEach(() => vi.useFakeTimers({ now: NOW }));
  afterEach(() => vi.useRealTimers());

  it("builds the exact interactive prepare request envelope", () => {
    const request = buildBoundedCapabilityBootstrap(input);

    expect(Object.keys(request).sort()).toEqual(
      [
        "actAs",
        "commandId",
        "commands",
        "disclosedContracts",
        "hashingSchemeVersion",
        "maxRecordTime",
        "packageIdSelectionPreference",
        "prefetchContractKeys",
        "readAs",
        "synchronizerId",
        "userId",
        "verboseHashing",
      ].sort(),
    );
  });

  it("accepts one exact prepared capability create", async () => {
    const request = buildBoundedCapabilityBootstrap(input);
    const observe = createPreparedCapabilityBootstrapObserver(async () =>
      preparedCapabilityBootstrapResponse(request),
    );

    await expect(observe(request)).resolves.toBeDefined();
  });

  it.each(preparedMutations)("rejects %s", async (_name, mutate) => {
    const request = buildBoundedCapabilityBootstrap(input);
    const observe = createPreparedCapabilityBootstrapObserver(async () =>
      preparedCapabilityBootstrapResponse(request, undefined, mutate),
    );

    await expect(observe(request)).rejects.toThrow(/prepared capability/iu);
  });

  it.each([
    ["userId", "wrong-user"],
    ["readAs", [input.agentParty]],
    ["workflowId", "wrong-workflow"],
    ["packageIdSelectionPreference", ["f".repeat(64)]],
  ])("rejects a caller-forged %s before transport", async (field, value) => {
    const request = buildBoundedCapabilityBootstrap(input);
    const read = vi.fn(async () =>
      preparedCapabilityBootstrapResponse(request),
    );
    const observe = createPreparedCapabilityBootstrapObserver(read);
    const forged = structuredClone(request) as unknown as Record<
      string,
      unknown
    >;
    forged[field] = value;

    await expect(
      observe(forged as BoundedCapabilityBootstrapRequest),
    ).rejects.toThrow(/not authenticated/iu);
    expect(read).not.toHaveBeenCalled();
  });
});
