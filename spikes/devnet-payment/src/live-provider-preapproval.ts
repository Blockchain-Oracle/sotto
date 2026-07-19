import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { readCleanSourceCheckpoint } from "./clean-source-checkpoint.js";
import { readSpikeConfig } from "./config.js";
import { createFiveNorthPrepareTransport } from "./five-north-prepare-transport.js";
import {
  discoverFiveNorthPreapprovalProposal,
  readFiveNorthValidatorParty,
} from "./five-north-preapproval-discovery.js";
import {
  recoverJournaledFiveNorthPreapproval,
  startJournaledFiveNorthPreapproval,
} from "./five-north-preapproval-journal-runner.js";
import { createFiveNorthPreapprovalSubmitter } from "./five-north-preapproval-submitter.js";

const workspaceRoot = resolve(
  fileURLToPath(new URL("../../..", import.meta.url)),
);
const mode = process.argv[2] ?? "start";
if (mode !== "start" && mode !== "recover") {
  throw new Error("preapproval mode must be start or recover");
}

const sourceCommit = await readCleanSourceCheckpoint(workspaceRoot);
const config = readSpikeConfig(process.env);
const scope = new AbortController();
const transport = createFiveNorthPrepareTransport(
  config.network,
  config.payer.party,
  { signal: scope.signal },
);

try {
  const readStateContracts = () =>
    transport.readPreapprovalStateContracts(config.provider.party);
  const result =
    mode === "recover"
      ? await recoverJournaledFiveNorthPreapproval({
          readStateContracts,
          sourceCommit,
          workspaceRoot,
        })
      : await (async () => {
          const [amuletRules, authenticatedUserId, validatorUser] =
            await Promise.all([
              transport.readAmuletRules(),
              transport.readAuthenticatedUserId(),
              transport.readValidatorUser(),
            ]);
          const validatorParty = readFiveNorthValidatorParty(validatorUser);
          const preferredWalletPackage =
            await transport.readPreferredWalletPackage(
              config.provider.party,
              validatorParty,
            );
          const request = discoverFiveNorthPreapprovalProposal({
            amuletRules,
            authenticatedUserId,
            preferredWalletPackage,
            receiverParty: config.provider.party,
            validatorUser,
          });
          return startJournaledFiveNorthPreapproval({
            readStateContracts,
            request,
            sourceCommit,
            submit: createFiveNorthPreapprovalSubmitter(config.network, {
              signal: scope.signal,
            }),
            workspaceRoot,
          });
        })();
  process.stdout.write(
    `${JSON.stringify(
      {
        activeAtOffset: result.activeAtOffset,
        mode,
        outcome: result.outcome,
        proposalUpdateId:
          "proposalUpdateId" in result
            ? (result.proposalUpdateId ?? null)
            : null,
        sourceCommit,
        status: result.status,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  scope.abort();
}
