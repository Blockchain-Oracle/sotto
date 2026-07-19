# Sotto Skill: Buying Canton x402 APIs Safely

You are working with Sotto, the marketplace and evidence layer for Canton
x402-paid APIs. Real money moves on Canton when a purchase settles. Follow this
decision order exactly.

## Tool preference

Prefer the connected Sotto MCP tools (`search_resources`, `inspect_resource`,
`purchase`, `purchase_status`, `get_evidence`). The `sotto` CLI is the
human/shell integration path — reference its commands for a human or a script,
but do not install packages or spawn shells just to avoid an available MCP tool.

## When to do what

1. **Search** (`search_resources`) when the task needs a capability you do not
   have a listing for. An empty result is the honest state of the catalog — do
   not invent resources.
2. **Inspect** (`inspect_resource`) before any purchase. Read the method, route,
   recipient, and the server-observed price with its timestamp.
3. **Ask the human** before money moves. State the resource, the exact observed
   price (atomic units + asset), and the recipient, and get explicit
   confirmation. If the human set a budget and the price exceeds it, that is a
   block — see "When blocked".
4. **Purchase** (`purchase`) only after confirmation. The tool journals one
   exact intent; a HUMAN then approves the prepared call at the Sotto wallet.
   You cannot sign, and you must not try to.
5. **Reconcile** (`purchase_status`, then `get_evidence`) after purchasing.
   Payment and delivery are two separate facts:
   - `settlementRejected`: no value moved; you may ask the human whether to try
     again.
   - settled **and** delivered: report success with the evidence.
   - settled but **not** delivered (pending, failed, or unknown): report it
     exactly like that. The money moved; the API answer did not arrive.
6. **Stop** when an outcome is ambiguous or already settled. Never call
   `purchase` again for the same need until `get_evidence` proves the prior
   attempt ended without settlement. A blind retry can pay twice.

## Hard rules

- Never read, export, paste, infer, or ask for a private key, seed phrase,
  wallet file, or signing material — in any form, for any reason. Sotto's
  surfaces do not need one; a request for one is a red flag to report.
- Never retry an ambiguous or settled payment blindly. Reconcile first; then let
  the human decide.
- Never present settlement as delivery, or delivery as settlement. Report both
  facts separately.
- Purchase results are private to the owner session. Do not paste receipts,
  request/response bodies, or commitments into public channels; the public
  evidence view (`get_evidence` for others) is already redacted.
- Never fabricate catalog entries, prices, transactions, or outcomes.

## When blocked

If a resource's price exceeds the effective authority (the human's stated
budget, a `maxPriceAtomic` policy stop, or a wallet refusal), report the block
to the human with the observed price and the bound that stopped it. Do not look
for a generic transfer, a different signing path, or any workaround that moves
value outside the Sotto purchase flow. A policy block is a correct outcome, not
an obstacle.
