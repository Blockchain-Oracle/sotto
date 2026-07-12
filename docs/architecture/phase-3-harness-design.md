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
