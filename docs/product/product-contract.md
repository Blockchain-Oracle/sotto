# Sotto Product Contract

## Objective

Sotto makes real Canton x402 APIs discoverable, usable, and auditable. Providers
publish already-payable resources, buyers and agents invoke them, and the
product connects HTTP challenge, authorization, Canton settlement, API delivery,
and privacy-safe evidence.

## Users

- Public visitor: discovers resources, providers, activity, and health.
- API provider: proves origin control and manages verified resources.
- Human buyer: prepares and, only after the wallet spike succeeds, approves one
  exact paid call.
- Autonomous agent: uses the shared purchase core through MCP, CLI, or skill.
- Sotto operator: reviews unsafe listings and ambiguous attempts.

No team member, employee, invitee, or auditor actor is included.

## Product Requirements

### Marketplace

List verified Canton x402 providers and resources from persisted real data.
Search and filters cover provider, resource, method, tag, price, status, and
activity where those fields exist.

### Provider And Resource Detail

Show verified resources, method, route, description, request/response shape,
fresh server-observed price, recipient, transfer method, compatibility, health,
and a path into Composer.

### Add API

Accept an HTTPS origin or endpoint, discover supported metadata, perform a
server-side live probe, and validate a real x402 `402 Payment Required`
response. Compatibility, origin ownership, merchant readiness, and publication
are separate checks. Browser-submitted payment fields are not authority.

### Owner Session

One Canton-party-backed owner account controls first-release provider/buyer
actions. A replay-safe proof of party control establishes the Sotto session.
Exact wallet signature support must be proven.

### Composer

Select a verified resource, provide task input, prepare the exact paid call, and
show authorization, settlement, delivery, and result as separate persistent
states. A successful state must contain the real paid provider response.

### Agent Interfaces

The buyer MCP server, thin CLI, and skill use the same catalog, purchasing core,
status model, and errors. No interface exposes a raw key or generic signing
tool.

### Private Bounded Agent Control

Do not claim ledger-enforced limits before DevNet proves payer authority,
live-price binding, funding boundary, atomicity, and bypass resistance. Local
policy is labeled local policy.

### Scan And Evidence

List only reliably Sotto-attributed attempts. Transaction detail links the HTTP
challenge, authorization, payment, settlement, delivery, and public explorer
evidence where available. Public views exclude private request/response context.

### Statistics And Operations

Use persisted real attempts and probe observations. Distinguish payment success
from delivery success and support zero, stale, partial, degraded, quarantined,
and reconciliation states.

## Acceptance Contract

- A visitor can find a real verified resource without signing in.
- A non-x402 endpoint is rejected with evidence.
- A valid endpoint is indexed from a server-observed challenge.
- Publishing requires separate origin ownership proof.
- Composer begins from a selected resource and never merges settlement/delivery.
- Successful execution returns the authentic paid response.
- CLI and MCP share stable purchasing semantics without exposing keys.
- No bounded-authority claim ships before bypass testing.
- Public Scan does not reveal private request/response context.
- No seed data appears in runtime metrics.
- A new Sotto DAR and real `402 -> payment -> 200` path run on Five North
  DevNet.

## Non-goals

- Payroll, tax, salary, timesheets, employees, payslips, or auditors.
- Email OTP, organizations, teams, invitations, or role administration.
- Banking, balances, send, withdrawal, swap, bridge, or off-ramp.
- Buyer API keys for x402-protected provider routes.
- Multi-network aggregation or facilitator rankings.
- Fake activity, sample tenants, or proof/demo pages.
