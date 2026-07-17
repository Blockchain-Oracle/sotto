import type { Value } from "@canton-network/core-ledger-proto";
import type { HumanPurchasePrepareRequest } from "../src/index.js";
import type { HumanPreparedPurchaseFixture } from "./human-prepared-purchase.fixtures.js";
import {
  fixtureRecord,
  fixtureScalar,
} from "./prepared-purchase-value.fixtures.js";
import { EXTERNAL_PURCHASE_CONTEXT } from "./transfer-factory-observation.fixtures.js";

const REL_TIME_RECORD_ID =
  "b70db8369e1c461d5c70f1c86f526a29e9776c655e6ffc2560f95b05ccb8b946:DA.Time.Types:RelTime";

export function optional(value?: Value): Value {
  return {
    sum: {
      oneofKind: "optional",
      optional: value === undefined ? {} : { value },
    },
  };
}

function recordField(value: Value | undefined, label: string): Value {
  if (value?.sum.oneofKind !== "record") {
    throw new Error("test external config record is absent");
  }
  const field = value.sum.record.fields.find(
    (candidate) => candidate.label === label,
  )?.value;
  if (field === undefined) throw new Error(`test ${label} field is absent`);
  return field;
}

function transferConfig(prepared: HumanPreparedPurchaseFixture) {
  const input = prepared.metadata?.inputContracts.find(
    ({ contract }) =>
      contract.oneofKind === "v1" &&
      contract.v1.contractId ===
        EXTERNAL_PURCHASE_CONTEXT.externalPartyConfigState,
  );
  if (input?.contract.oneofKind !== "v1") {
    throw new Error("test external config input is absent");
  }
  const transfer = recordField(input.contract.v1.argument, "transferConfig");
  if (transfer.sum.oneofKind !== "record") {
    throw new Error("test transfer config record is absent");
  }
  return transfer.sum.record;
}

export function removeTokenTtl(prepared: HumanPreparedPurchaseFixture): void {
  const transfer = transferConfig(prepared);
  const matching = transfer.fields.filter(
    ({ label }) => label === "tokenStandardMaxTTL",
  );
  if (matching.length !== 1) {
    throw new Error("test token TTL must exist exactly once before removal");
  }
  transfer.fields = transfer.fields.filter(
    ({ label }) => label !== "tokenStandardMaxTTL",
  );
}

export function replaceTokenTtl(
  prepared: HumanPreparedPurchaseFixture,
  value: Value,
): void {
  const transfer = transferConfig(prepared);
  const ttl = transfer.fields.filter(
    ({ label }) => label === "tokenStandardMaxTTL",
  );
  if (ttl.length !== 1) throw new Error("test token TTL is absent");
  ttl[0]!.value = value;
}

export function addHistoricalTokenTtl(
  prepared: HumanPreparedPurchaseFixture,
): void {
  const transfer = transferConfig(prepared);
  if (transfer.fields.some(({ label }) => label === "tokenStandardMaxTTL")) {
    throw new Error("test historical token TTL is already present");
  }
  transfer.fields.push({ label: "tokenStandardMaxTTL", value: optional() });
}

export function selectedSourceRequest(
  request: HumanPurchasePrepareRequest,
  packageId: string,
): HumanPurchasePrepareRequest {
  const clone = structuredClone(request);
  const disclosures = clone.disclosedContracts as unknown as Array<{
    contractId: string;
    templateId: string;
  }>;
  const disclosure = disclosures.find(
    ({ contractId }) =>
      contractId === EXTERNAL_PURCHASE_CONTEXT.externalPartyConfigState,
  );
  if (disclosure === undefined) {
    throw new Error("test external config disclosure is absent");
  }
  const [, moduleName, entityName] = disclosure.templateId.split(":");
  disclosure.templateId = `${packageId}:${moduleName}:${entityName}`;
  return clone;
}

export function validRelativeTime(): Value {
  return optional(
    fixtureRecord(REL_TIME_RECORD_ID, [
      ["microseconds", fixtureScalar("int64", "60000000")],
    ]),
  );
}
