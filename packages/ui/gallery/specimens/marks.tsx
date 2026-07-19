import {
  Badge,
  CantonMark,
  Card,
  DynamicMarking,
  SottoMark,
} from "../../src/index.js";
import cantonBlack from "../../src/marks/assets/canton-logo-black.svg";
import cantonWhite from "../../src/marks/assets/canton-logo-white.svg";

export function MarkSpecimens() {
  return (
    <section className="g-section">
      <h2>marks &amp; type</h2>
      <div className="g-stack">
        <Card title="Sotto mark — Mark 1 · The undertone">
          <div className="g-row">
            <SottoMark size={64} />
            <SottoMark size={32} />
            <SottoMark size={64} variant="glyph" />
            <SottoMark size={20} variant="glyph" />
            <DynamicMarking size={40} />
          </div>
        </Card>
        <Card
          title="Canton Network — official mark, vendored unmodified"
          aside={<Badge tone="ambra">Devnet</Badge>}
        >
          <div className="g-row">
            <CantonMark src={cantonBlack} srcDark={cantonWhite} height={22} />
            <CantonMark
              src={cantonBlack}
              srcDark={cantonWhite}
              height={22}
              devnet
            />
            <CantonMark devnet />
          </div>
          <p className="g-caption" style={{ marginTop: 10 }}>
            Last item is the documented typographic fallback, not the official
            mark. Canton is a registered trademark of Digital Asset
            (Switzerland) GmbH; see ASSET-MANIFEST.md.
          </p>
        </Card>
        <Card title="Type voices">
          <p className="g-voice-display">
            Quiet, engraved, precise — the speaking voice.
          </p>
          <p style={{ margin: "6px 0" }}>
            The working voice carries product UI, body, controls, and labels.
          </p>
          <p className="g-voice-mono" style={{ margin: 0 }}>
            0.25 CC · 1220a91e…7c2f · 2026-07-19 14:03:22 UTC — the testifying
            voice.
          </p>
        </Card>
      </div>
    </section>
  );
}
