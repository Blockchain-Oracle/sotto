/**
 * Internal owner-journal boundary. The unkeyed digest detects corruption only;
 * callers must authenticate the enclosing owner-only hash-chain before restore.
 */
export {
  exportHumanSettlementExpectation,
  HUMAN_SETTLEMENT_EXPECTATION_JOURNAL_SCHEMA,
  restoreHumanSettlementExpectation,
  type PersistedHumanSettlementExpectation,
} from "./human-settlement-expectation-persistence.js";
