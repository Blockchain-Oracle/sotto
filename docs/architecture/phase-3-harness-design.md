# Phase 3 Baseline Payment Harness Design

## Decision

Implement a fail-closed, credential-independent observation harness before
integrating a payer, signer, relay, or wallet. The harness earns trustworthy
inputs for the real Five North payment without claiming settlement.

## Flow

1. Build a canonical description of the configured HTTP request and assign a
   stable attempt identifier.
2. Fetch the configured resource and require an authentic `402 Payment Required`
   response.
3. Parse the x402 v2 challenge and select only the `exact` requirement for the
   configured Canton DevNet network.
4. Validate the amount, asset, recipient, expiry, and request binding before any
   signer is allowed to receive the requirement.
5. Persist a redacted local observation containing stable hashes, timestamps,
   public protocol fields, HTTP status, and source versions.
6. Stop before signing unless a separately verified payer adapter is installed.

## Safety Boundary

Evidence must not contain credentials, authorization headers, keys, prepared
transactions, or request and response bodies. Redirects, timeouts, and response
size are bounded. Duplicate execution uses deterministic idempotency; an unknown
settlement outcome must be reconciled before any payment retry.

The human-wallet capability lane remains separate. It records party login,
exact-payment approval, facilitator-proof compatibility, paid retry, and custom
DAR authorization independently and cannot inherit an external signer result.

## Tests

- Reject non-402 responses, malformed challenges, unsupported schemes and
  networks, expired requirements, and missing request binding.
- Select one exact Canton DevNet requirement deterministically.
- Reject mutations to recipient, amount, asset, network, expiry, and request
  binding.
- Verify deterministic attempt identifiers and redacted evidence output.
- Model duplicate, expired, and unknown-outcome behavior without submitting a
  payment.

## Deferred Live Work

Restore and pin the compatible Apache-2.0 FTPtech source, confirm the live wire
format, and integrate the signer/relay only after the private Five North and
x402 configuration is available. Only a real `402 -> settle -> 200` execution
can satisfy the DevNet gate.

## Live Settlement Amendment

Five North access on 2026-07-13 proved the participant, OIDC, wallet, and Scan
proxy boundaries. The public Scan registry rejects direct access, the signed-in
Loop party is on a different DevNet topology, and newly allocated parties need
explicit Ledger API `actAs` rights. These results reject two candidate paths:

1. a public Scan plus token-standard transfer-factory adapter cannot currently
   obtain choice disclosures from the Five North sandbox;
2. the existing Loop party cannot receive this sandbox's Canton Coin because it
   is unknown on the sandbox synchronizer.

The selected narrow baseline adapter uses only supported Five North surfaces:

1. an isolated `sotto-spike-payer-*` and `sotto-spike-provider-*` on the shared
   participant;
2. a one-time wallet transfer offer to fund the payer, accepted by the payer and
   completed by Five North wallet automation;
3. validator Scan-proxy responses for the current `AmuletRules` and open mining
   round disclosures;
4. a Ledger API `AmuletRules_Transfer` from the payer holding to the provider,
   using a deterministic command ID derived from both the payment attempt and
   exact HTTP request commitment;
5. update-ID reconciliation before the original HTTP request is retried;
6. provider delivery only when the payment reference, deterministic command ID,
   payer, recipient, amount, and request commitment match the accepted
   settlement record.

The live package rejected an output `meta` field with `INVALID_ARGUMENT`, and a
known successful Five North transaction confirms that the deployed
`TransferOutput` wire type contains only `receiver`, `receiverFeeRatio`, and
`amount`. Sotto therefore does not invent a metadata extension. The command ID
is the public-safe correlation field returned on the accepted transaction; its
hash commits to both the attempt ID and request commitment, and the provider
also compares the proof commitment with the challenge it issued. This proves
application-level request binding, not a new ledger-enforced transfer policy.

This adapter can earn a real Five North settlement and HTTP delivery result. It
does **not** satisfy the external-party signer gate: both sandbox parties are
participant-hosted and the machine client currently authorizes both payer and
provider. That limitation remains explicit evidence for the Phase 3 verdict and
must not be described as an external-party or non-custodial payment.
