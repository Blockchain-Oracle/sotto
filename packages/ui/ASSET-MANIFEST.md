# @sotto/ui asset manifest

Governs every vendored third-party asset in this package (DESIGN.md §2: partner
brand colors appear only inside their official marks, and this manifest governs
every mark). Sotto's own marks (`src/marks/sotto-mark.tsx`,
`src/marks/dynamic-marking.tsx`) are original work under the repository license
and take colors from theme tokens only.

## Canton Network logomark — OFFICIAL, vendored unmodified

- Files: `src/marks/assets/canton-logo-black.svg`,
  `src/marks/assets/canton-logo-white.svg`
- Source (exact URLs, linked from the official brand kit page):
  - https://www.canton.network/hubfs/canton-logo-black.svg
  - https://www.canton.network/hubfs/canton-logo-white.svg
- Brand kit / terms page: https://www.canton.network/brand-kit-trademark-use
- Retrieved: 2026-07-19
- Ownership: the Canton Marks are the exclusive property of Digital Asset
  (Switzerland) GmbH. Use is governed by the Canton Brand Guidelines on the page
  above (non-exclusive, revocable permission — not an open license).
- Binding treatment rules (from the guidelines and DESIGN.md):
  - Never modify, recolor, re-draw, skew, rotate, crop, change the scale
    non-uniformly, or combine the mark with any other mark or text lockup. The
    two vendored files are byte-identical to the official downloads.
  - The black lockup is for Carta (light) surfaces; the white lockup is for
    Notte (dark) surfaces.
  - DEVNET variant = the untouched mark plus an ADJACENT ambra `DEVNET` text tag
    (`CantonMark devnet` prop) — never an edit of the mark.
  - Required attribution wherever the mark is used (footnote or similarly
    visible): "Canton is a registered trademark of Digital Asset (Switzerland)
    GmbH. Digital Asset is not affiliated with, and has not sponsored or
    endorsed, this product."
  - No official standalone icon-only mark is published in the brand kit; do NOT
    extract the diamond glyph from the lockup. If an icon-only mark is needed,
    request it via legal@digitalasset.com — do not fake one.
- Component: `src/marks/canton-mark.tsx`. Apps serve the vendored SVGs and pass
  their URLs; the no-URL fallback is a typographic reference (the word
  "Canton"), clearly documented as NOT the official mark.

## Fonts — vendored unmodified woff2 (4 files, cap is 6 per DESIGN.md §3)

All four files are unmodified `files/*.woff2` artifacts from Fontsource npm
packages (retrieved 2026-07-19) and are licensed under the SIL Open Font License
1.1 (OFL-1.1), which permits bundling and redistribution with software provided
the fonts are not sold by themselves.

| File                                | Package (npm)                   | Version | License |
| ----------------------------------- | ------------------------------- | ------- | ------- |
| `fraunces-latin-opsz-normal.woff2`  | `@fontsource-variable/fraunces` | 5.3.0   | OFL-1.1 |
| `geist-sans-latin-400-normal.woff2` | `@fontsource/geist-sans`        | 5.3.0   | OFL-1.1 |
| `geist-sans-latin-600-normal.woff2` | `@fontsource/geist-sans`        | 5.3.0   | OFL-1.1 |
| `geist-mono-latin-400-normal.woff2` | `@fontsource/geist-mono`        | 5.3.0   | OFL-1.1 |

Upstream typefaces: Fraunces © Undercase Type (OFL-1.1,
https://github.com/undercasetype/Fraunces); Geist © Vercel (OFL-1.1,
https://github.com/vercel/geist-font). `src/fonts/fonts.css` declares the faces;
apps serve the woff2 files statically.
