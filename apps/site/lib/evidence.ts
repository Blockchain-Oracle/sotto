/**
 * Every fact on the marketing surface is read from the tracked evidence
 * bundle — docs/architecture/devnet-spike-evidence.json — so the site can
 * never drift from what the repository actually proves. No value on this
 * page is invented here.
 */
import spike from "../../../docs/architecture/devnet-spike-evidence.json";

export const network = spike.environment.network;
export const participant = spike.environment.participant;
export const synchronizerId = spike.environment.synchronizerId;
export const explorerHost = spike.environment.serviceHosts.explorer;

/** The original sotto-control research DAR (July 13 run). */
export const sottoControlPackageId = spike.damlPackage.packageId;
export const sottoControlVersion = spike.damlPackage.version;

/** Canton Coin amounts in the bundle are atomic with 10 decimal places. */
function fromAtomic(atomic: string): string {
  const padded = atomic.padStart(11, "0");
  const whole = padded.slice(0, -10);
  const fraction = padded.slice(-10).replace(/0+$/, "");
  return fraction === "" ? whole : `${whole}.${fraction}`;
}

/** The proven wallet-neutral human-wallet purchase (July 17 run). */
export const humanPurchase = {
  method: spike.request.method,
  amountCantonCoin: fromAtomic(spike.humanWalletPurchase.amountAtomic),
  feeCeilingCantonCoin: fromAtomic(spike.humanWalletPurchase.maximumFeeAtomic),
  totalDebitCeilingCantonCoin: fromAtomic(
    spike.humanWalletPurchase.maximumTotalDebitAtomic,
  ),
  networkLabel: spike.environment.network,
  packageName: spike.humanWalletPurchase.selectedPackage.packageName,
  packageVersion: spike.humanWalletPurchase.selectedPackage.packageVersion,
  updateId: spike.humanWalletPurchase.completion.updateId,
  offset: spike.humanWalletPurchase.completion.offset,
  deliveryStatus: spike.humanWalletPurchase.delivery.status,
  deliveryBodyBytes: spike.humanWalletPurchase.delivery.bodyByteCount,
  journalStages: spike.humanWalletPurchase.journal.stages,
} as const;

/** The honest settled-undelivered predecessor of the delivered purchase. */
export const settledUndelivered = {
  updateId:
    spike.humanWalletPurchase.precedingSettledUndeliveredOperation.updateId,
  offset:
    spike.humanWalletPurchase.precedingSettledUndeliveredOperation
      .completionOffset,
  recoveredStatus:
    spike.humanWalletPurchase.precedingSettledUndeliveredOperation
      .recoveredStatus,
} as const;

/** The external-agent purchase whose settlement is publicly indexed. */
export const externalAgentPurchase = {
  updateId: spike.externalAgentPurchase.updateId,
  offset: spike.externalAgentPurchase.offset,
  explorerHttpStatus:
    spike.visibility.externalAgentPurchase.publicExplorer.transactionHttpStatus,
  explorerRecordTime:
    spike.visibility.externalAgentPurchase.publicExplorer.transactionRecordTime,
  outsiderContexts: spike.visibility.externalAgentPurchase.outsider.context,
} as const;
