import { loadEnvFile } from "node:process";
import { reconcileBoundedPurchaseProviderTransaction } from "../../spikes/devnet-payment/src/bounded-purchase-provider-reconciliation.js";
import { readSpikeConfig } from "../../spikes/devnet-payment/src/config.js";
import { createFiveNorthClient } from "../../spikes/devnet-payment/src/five-north.js";
import {
  createPaidResourceHandler,
  startPaidProvider,
} from "../../spikes/devnet-payment/src/provider.js";

loadEnvFile(new URL("../../.env.local", import.meta.url));
const config = readSpikeConfig(process.env);
const client = createFiveNorthClient(config.network);
const resourceUrl = config.provider.resourceUrl;
const handler = createPaidResourceHandler({
  amount: "2500000000",
  assetTransferMethod: "transfer-factory",
  dsoParty:
    "DSO::1220be58c29e65de40bf273be1dc2b266d43a9a002ea5b18955aeef7aac881bb471a",
  maxTimeoutSeconds: 120,
  payerParty:
    "sotto-external-payer::1220e5e6be928d5264069d480d0c30198236a71e2af7d42f519841483fc83fe8b012",
  providerParty: config.provider.party,
  resourceUrl,
  synchronizerId:
    "global-domain::1220be58c29e65de40bf273be1dc2b266d43a9a002ea5b18955aeef7aac881bb471a",
  verifySettlement: async (proof) => {
    try {
      return reconcileBoundedPurchaseProviderTransaction(
        await client.getTransaction(proof.updateId, config.provider.party),
        proof,
        {
          agentParty:
            "sotto-external-agent::12206e0e95b6aa27cfb8836e30d432e19ab918a01a5507eb1601004ac2a007d5cdbf",
          amuletTemplateId:
            "73e9ffdb6b0bc19a5f67372b118103926da11547ab9109eccae47e4e4cc35d6f:Splice.Amulet:Amulet",
          amount: "0.2500000000",
          capabilityRevision: "0",
          challengeId:
            "sha256:84a0414589be83f03f12972361bce4279bc1067a8a5588cd2506b03791b26f76",
          dsoParty:
            "DSO::1220be58c29e65de40bf273be1dc2b266d43a9a002ea5b18955aeef7aac881bb471a",
          inputHoldingContractIds: [
            "00818d557e118db0c360cb3e21e41979840a30e17753d875f4e4472b8cdcdaf973ca12122001afadcb50561e389ce6c5255cd22c16efeee8c2f1ca6009cd4e6fb7e466527c",
          ],
          packageId:
            "4d614496ec9b30b22545fd350ecb9ec999164cfb0b5953f46dbbf937f8918f57",
          payerParty:
            "sotto-external-payer::1220e5e6be928d5264069d480d0c30198236a71e2af7d42f519841483fc83fe8b012",
          providerParty: config.provider.party,
          purchaseCommitment:
            "sha256:84f4985631a7d1f99c122f55d2c7f17bfcb35e8f0da5d22a3a5c948fec534e42",
          resourceHash:
            "sha256:047401110fced14522cb54ee647802040f579befd40c7b1647438d31d5e3c1bc",
          synchronizerId:
            "global-domain::1220be58c29e65de40bf273be1dc2b266d43a9a002ea5b18955aeef7aac881bb471a",
          transferContext: {
            externalPartyConfigState:
              "00f460a3d2e13ac1f5bc6718624ce77c4e239c17a95e05b6c9d25cdb7b99413408ca12122030d1cd93db2cacbdcc3ee8cffe335ef16db216ff9199b605febe19ad0165737b",
            featuredAppRight:
              "0089ee974ece7cfd0c2f6ca0c5bfe8c565ae2df413c2f28cf7704eb021a0ed7e0cca1212209928af5393e80a9d5fe296251af6c408aa54b00f383336c30593c55e78ed8dd6",
          },
          transferPreapprovalContractId:
            "007453ba9a6abfe7caf44945d10e5bef2218dcb8637451a6d416460f15d17796ebca121220e099074a28563a21a73b677ced6e5fe667b04cb8c89fea15e9bcd0b4dbbf715a",
          transferPreapprovalTemplateId:
            "73e9ffdb6b0bc19a5f67372b118103926da11547ab9109eccae47e4e4cc35d6f:Splice.AmuletRules:TransferPreapproval",
        },
      );
    } catch {
      return false;
    }
  },
});
const server = await startPaidProvider({ handler, port: 8788, resourceUrl });
process.stdout.write(
  `${JSON.stringify({ localUrl: server.localUrl, resourceUrl, status: "READY" })}\n`,
);
await new Promise(() => undefined);
