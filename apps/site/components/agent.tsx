/**
 * The agent surface as an interface contract. The CLI and buyer MCP
 * server ship in a later slice of the current build cycle, so nothing
 * below is presented as captured output — it is the command grammar and
 * tool surface those clients are contracted to share with the web
 * Composer: one purchasing core, one catalog, the same receipt and error
 * semantics, and never a raw wallet key.
 */
export function Agent() {
  return (
    <section className="site-section" id="agent">
      <p className="site-kicker">Agents</p>
      <h2 className="site-h2">The same exact call, from a terminal.</h2>
      <p className="site-prose">
        The thin CLI, the buyer MCP server, and the skill reuse one purchasing
        core. An agent can discover a verified resource and request a bounded
        purchase — the model never receives a raw wallet key or an unrestricted
        signing tool.
      </p>
      <div
        className="site-terminal"
        role="figure"
        aria-label="CLI interface contract"
      >
        <div className="site-terminal-head">
          <span>sotto CLI — interface contract</span>
          <span className="site-terminal-tag">schema, not captured output</span>
        </div>
        <pre className="site-terminal-body">
          <code>{`$ sotto try <resource-url>
    resolve the verified listing, replay its live 402,
    prepare ONE bounded call, hand it to the wallet for approval

MCP tools (buyer server, same purchasing core):
    sotto_search      find verified Canton x402 resources
    sotto_prepare     prepare one exact bounded paid call
    sotto_status      settlement and delivery, always separate`}</code>
        </pre>
      </div>
      <p className="site-footnote">
        Interface contract for the current build cycle — the CLI and MCP server
        are not shipped yet, and no execution output is shown here.
      </p>
    </section>
  );
}
