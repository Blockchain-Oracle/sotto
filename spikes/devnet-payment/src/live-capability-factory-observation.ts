import { readSpikeConfig } from "./config.js";
import { createFiveNorthBootstrapFactoryObserver } from "./five-north-bootstrap-factory.js";
import { runFiveNorthBootstrapFactoryProbe } from "./five-north-bootstrap-factory-probe.js";
import { createFiveNorthCapabilityReadinessTransport } from "./five-north-capability-readiness-transport.js";
import { createFiveNorthCapabilityReadinessObserver } from "./five-north-capability-readiness.js";
import { createFiveNorthPrepareTransport } from "./five-north-prepare-transport.js";
import { createFiveNorthPurchaseReaders } from "./five-north-purchase-readers.js";

const config = readSpikeConfig(process.env);
const scope = new AbortController();
const readiness = createFiveNorthCapabilityReadinessTransport(config.network, {
  signal: scope.signal,
});
const prepare = createFiveNorthPrepareTransport(
  config.network,
  config.payer.party,
  { signal: scope.signal },
);
const purchaseReaders = createFiveNorthPurchaseReaders(
  prepare,
  config.payer.party,
);

try {
  const result = await runFiveNorthBootstrapFactoryProbe({
    agentParty: config.policy.agentParty,
    nowMilliseconds: Date.now(),
    observeFactory: createFiveNorthBootstrapFactoryObserver({
      holdings: purchaseReaders.holdings,
      readAuthenticatedUserId: prepare.readAuthenticatedUserId,
      registry: purchaseReaders.registry,
    }),
    observeReadiness: createFiveNorthCapabilityReadinessObserver({
      readAmuletRules: readiness.readAmuletRules,
      readAuthenticatedUserId: readiness.readAuthenticatedUserId,
      readPackagePresence: readiness.readPackagePresence,
      readPreferredSottoPackage: readiness.readPreferredSottoPackage,
    }),
    payerParty: config.payer.party,
    providerParty: config.provider.party,
    resourceUrl: config.provider.resourceUrl,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  scope.abort();
}
