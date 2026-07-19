export const HELP_TEXT = `sotto — Canton x402 marketplace CLI (thin client over the Sotto API)

USAGE
  sotto <command> [arguments] [flags]

SESSION (copy-token flow — no device authorization exists server-side yet)
  login [--api-origin <url>] --token <token> [--wallet-url <url>]
        Store the owner-session token you copied from the Sotto app's
        session response. Stored 0600 in ~/.config/sotto/config.json and
        sent only as "Authorization: Bearer" to that API origin.
  whoami        Report API origin, token presence, and session validity.
  logout        Revoke the server session and remove the local token.

CATALOG
  search [query] [--method <m>] [--max-price <atomic>]
        List verified resources. --tag is not supported: the catalog
        carries no tags yet and the CLI will say so instead of ignoring it.
  inspect <listingId|resource-url>
        Show one resource with its fresh server-observed price + timestamp.
  try <resource-url>
        Inspect the listing behind a canonical URL and print the exact
        prepare command. Alias of inspect with purchase guidance.

PURCHASING (a HUMAN approves every spend at the wallet; the CLI never signs)
  buy <listingId> [--max-price <atomic>] [--no-wait]
        Initiate one exact purchase, print the prepared call + request
        commitment (+ prepared hash once verified), then follow the journal
        as a text rail until a terminal state.
  status <attemptId> [--follow]
        Show or follow the full journal state.
  evidence <attemptId>
        Paired settlement/delivery outcome, update ID, explorer URL.
  stats [--window 24h|7d|30d|all]
        Real persisted aggregates; settlement and delivery rates separate.

AGENTS
  mcp serve     Buyer MCP server on stdio (JSON-RPC on stdout, logs on
                stderr). Same token via config or SOTTO_SESSION_TOKEN.

GLOBAL FLAGS
  --json        Machine-readable output on every read command.
  --api-origin  Override the API origin for this invocation.
  --version     Print the CLI version.        --help  This text.

ENVIRONMENT
  SOTTO_API_ORIGIN, SOTTO_SESSION_TOKEN, SOTTO_WALLET_URL, NO_COLOR

EXIT CODES
  0 delivered/ok  1 failure  2 usage  3 no session  4 wallet-rejected
  5 wallet-unsupported  6 settlement-rejected  7 expired
  8 ambiguous or settled-undelivered (reconcile; NEVER auto-retried)`;
