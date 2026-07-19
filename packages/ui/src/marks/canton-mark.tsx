import type { ReactNode } from "react";

/**
 * Canton Network mark.
 *
 * The OFFICIAL vector lockups are vendored unmodified at
 * `@sotto/ui/marks/assets/canton-logo-black.svg` (for Carta) and
 * `@sotto/ui/marks/assets/canton-logo-white.svg` (for Notte). Source,
 * retrieval date, and the governing trademark terms are recorded in
 * packages/ui/ASSET-MANIFEST.md. Treatment rules (binding): never recolor,
 * skew, rotate, rescale non-uniformly, crop, or combine the mark with other
 * marks; the DEVNET variant is the untouched mark plus an ADJACENT ambra
 * DEVNET tag, never a modification of the mark itself.
 *
 * The component is bundler-agnostic: apps serve the vendored SVGs (exactly
 * like the fonts) and pass their URLs. When no URL is provided it renders a
 * typographic reference — the word "Canton" set in the working voice. That
 * fallback is NOT the official mark and must never be presented as one.
 */
export interface CantonMarkProps {
  /** URL of the vendored official SVG for the current/light theme. */
  src?: string;
  /** Optional URL of the official white-on-dark SVG for Notte. */
  srcDark?: string;
  /** Renders the adjacent ambra DEVNET tag (DESIGN.md §2 ambra role). */
  devnet?: boolean;
  /** Rendered height of the lockup in px. */
  height?: number;
  className?: string;
}

const ALT = "Canton Network";

export function CantonMark({
  src,
  srcDark,
  devnet = false,
  height = 20,
  className,
}: CantonMarkProps) {
  let mark: ReactNode;
  if (src === undefined) {
    mark = (
      <span
        className="sv-canton-text"
        aria-label={ALT}
        title="Typographic reference — not the official Canton mark"
      >
        Canton
      </span>
    );
  } else if (srcDark === undefined) {
    mark = <img src={src} alt={ALT} height={height} />;
  } else {
    mark = (
      <>
        <img src={src} alt={ALT} height={height} className="sv-only-light" />
        <img src={srcDark} alt={ALT} height={height} className="sv-only-dark" />
      </>
    );
  }
  return (
    <span className={["sv-canton", className].filter(Boolean).join(" ")}>
      {mark}
      {devnet ? <span className="sv-canton-devnet">DEVNET</span> : null}
    </span>
  );
}
