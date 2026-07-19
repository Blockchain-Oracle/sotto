const STATIONS = [
  { key: "challenge", label: "Live 402", kind: "mark" },
  { key: "authorization", label: "Authorization", kind: "mark" },
  { key: "settlement", label: "Canton settlement", kind: "settlement" },
  { key: "retry", label: "Paid retry", kind: "mark" },
  { key: "delivered", label: "Delivered", kind: "mark" },
] as const;

/**
 * The engraved lifecycle rendered as a protocol schema. It reuses the
 * system-rail vocabulary from @sotto/ui and plays the one-shot
 * cue → sound → decay exactly once on load (pure CSS, ≤550ms, honoring
 * prefers-reduced-motion via theme.css). No timestamps are claimed — the
 * time column stays a rest because this is the schema, not live activity.
 */
function HeroRail() {
  return (
    <figure className="site-hero-rail">
      <div
        className="sv-rail site-rail"
        role="list"
        aria-label="Purchase lifecycle schema"
      >
        <span className="sv-rail-staff sv-cue" aria-hidden="true" />
        {STATIONS.map((station, index) => (
          <div className="sv-rail-event" role="listitem" key={station.key}>
            <span
              className={`sv-rail-mark sv-sound site-rail-land-${index}`}
              data-kind={station.kind}
              aria-hidden="true"
            >
              {station.kind === "settlement" ? (
                <>
                  <span className="sv-rail-bar" />
                  <span className="sv-rail-bar sv-rail-bar-thick" />
                </>
              ) : null}
            </span>
            <span className="sv-rail-label">{station.label}</span>
            <span className="sv-rail-at">—</span>
          </div>
        ))}
      </div>
      <figcaption className="site-rail-caption">
        Protocol schema — not live activity.
      </figcaption>
    </figure>
  );
}

export function Hero() {
  return (
    <section className="site-hero">
      <p className="site-kicker">Verified x402 APIs · Canton Network</p>
      <h1 className="site-hero-title">Paid, sotto voce.</h1>
      <p className="site-hero-sub">
        Sotto is the marketplace, execution surface, and evidence layer for
        x402-paid APIs on Canton. A buyer approves one exact paid call in a
        wallet that holds the key outside Sotto; settlement lands as one Canton
        update on Five North DevNet and delivery is recorded separately. An
        agent-signed settlement from the same spike is publicly visible on the
        Lighthouse explorer, while every private purchase context stayed
        invisible to outsiders.
      </p>
      <div className="site-hero-actions">
        <a
          className="sv-btn site-btn-link"
          data-variant="primary"
          href="https://app.usesotto.xyz"
        >
          <span className="sv-btn-label">Open the marketplace</span>
        </a>
        <a
          className="sv-btn site-btn-link"
          data-variant="secondary"
          href="https://docs.usesotto.xyz"
        >
          <span className="sv-btn-label">Read the docs</span>
        </a>
      </div>
      <HeroRail />
    </section>
  );
}
