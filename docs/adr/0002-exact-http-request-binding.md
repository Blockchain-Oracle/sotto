# ADR 0002: Require Exact HTTP Request Binding

## Status

Accepted on 2026-07-12.

## Context

Sotto must verify what a payment authorizes before any signer releases a
signature. Binding only a resource URL does not prove that the HTTP method,
selected authoritative headers, or request body remained unchanged between the
observed `402` challenge and the paid retry.

The published FTPtech Canton x402 0.6.x contract represents the resource URL in
the x402 envelope and describes an on-ledger resource URL stamp. The inspected
contract does not prove a binding to Sotto's complete canonical HTTP request.

## Decision

Sotto requires a payment authorization to be cryptographically bound to one
canonical HTTP request containing:

- HTTP method;
- normalized resource URL;
- an explicit allowlist of authoritative request headers; and
- a cryptographic hash of the exact request body bytes.

The resulting request commitment must be verified at the signer boundary and
must remain identical through payment creation, settlement, and the paid HTTP
retry. Any mutation fails closed before signing.

Resource-URL-only binding is insufficient. It may be recorded as an upstream
capability, but it cannot satisfy Sotto's request-binding gate.

## Consequences

- A successful upstream settlement does not close the Sotto binding gate unless
  the complete canonical request commitment is proven end to end.
- If the selected FTPtech/Five North path cannot carry and verify that
  commitment, the result is `NOT PROVEN`; Sotto does not weaken the requirement
  to produce a successful demonstration.
- The commitment is evidence-safe: request bodies and sensitive header values
  remain private, while hashes and the canonicalization version may be recorded.
- Canonicalization, mutation resistance, replay behavior, and paid-retry
  equality require explicit contract tests and live DevNet evidence.

## Non-decisions

This ADR does not select a hashing algorithm, canonicalization encoding, header
allowlist, FTPtech adaptation, relay, signer, or production topology. Those
details require a specification grounded in the accepted security and DevNet
contracts.
