const PACKAGE_ID =
  "4d614496ec9b30b22545fd350ecb9ec999164cfb0b5953f46dbbf937f8918f57";

export const LEGACY_BOOTSTRAP_COMMAND_ID =
  "sotto-capability-bootstrap-v1-e9db1381afd43d39258b1a021aefb6fbc325f4c84b264feaf476bf330a531abe";

export const LEGACY_DIRECT_BOOTSTRAP_INTENT_V1 = Object.freeze({
  request: {
    actAs: ["sotto-spike-payer::1220participant"],
    readAs: [],
    userId: "ledger-user-6",
    commandId: LEGACY_BOOTSTRAP_COMMAND_ID,
    workflowId: "sotto-capability-bootstrap-v1",
    synchronizerId: "global-domain::1220synchronizer",
    packageIdSelectionPreference: [PACKAGE_ID],
    commands: [
      {
        CreateCommand: {
          templateId: `${PACKAGE_ID}:Sotto.Control.PurchaseCapability:BoundedPurchaseCapability`,
          createArguments: {
            payer: "sotto-spike-payer::1220participant",
            agent: "sotto-policy-agent::1220participant",
            resourceBindingVersion: "sotto-resource-v1",
            allowedResourceHash: `sha256:${"a".repeat(64)}`,
            allowedRecipient: "sotto-spike-provider::1220participant",
            instrumentId: { admin: "DSO::1220dso", id: "Amulet" },
            perCallLimit: "0.2500000000",
            remainingAllowance: "1.0000000000",
            maximumTotalDebit: "0.3250000000",
            expiresAt: "2026-07-13T20:30:00.000Z",
            revision: "0",
            paused: false,
            transferFactoryCid: "00transferfactory",
            expectedAdmin: "DSO::1220dso",
          },
        },
      },
    ],
  },
  schema: "sotto-capability-bootstrap-intent-v1",
  sourceCommit: "a".repeat(40),
  validatedAt: "2026-07-13T19:30:00.000Z",
});

export const LEGACY_PREPARED_BOOTSTRAP_INTENT_V1 = Object.freeze({
  ...LEGACY_DIRECT_BOOTSTRAP_INTENT_V1,
  request: {
    actAs: LEGACY_DIRECT_BOOTSTRAP_INTENT_V1.request.actAs,
    commandId: LEGACY_BOOTSTRAP_COMMAND_ID,
    commands: LEGACY_DIRECT_BOOTSTRAP_INTENT_V1.request.commands,
    disclosedContracts: [],
    hashingSchemeVersion: "HASHING_SCHEME_VERSION_V2",
    maxRecordTime: "2026-07-13T19:35:00.000Z",
    packageIdSelectionPreference:
      LEGACY_DIRECT_BOOTSTRAP_INTENT_V1.request.packageIdSelectionPreference,
    prefetchContractKeys: [],
    readAs: [],
    synchronizerId: LEGACY_DIRECT_BOOTSTRAP_INTENT_V1.request.synchronizerId,
    userId: LEGACY_DIRECT_BOOTSTRAP_INTENT_V1.request.userId,
    verboseHashing: false,
  },
});
