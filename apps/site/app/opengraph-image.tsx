import { ImageResponse } from "next/og";

import { notteTokens as t } from "../lib/tokens";

export const dynamic = "force-static";
export const alt = "Sotto — Paid, sotto voce. Canton x402 · DEVNET";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The identity card in Notte: the Sotto mark (fixed geometry from
 * @sotto/ui), the manifesto line, and the honest network tag. Colors come
 * from theme.css via lib/tokens — no hex is restated here.
 */
export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        backgroundColor: t.canvas,
        color: t.ink,
      }}
    >
      <svg viewBox="0 0 64 64" width={96} height={96} fill="none">
        <path
          d="M 44 7 L 14 7"
          stroke={t.ink}
          strokeWidth={2.6}
          strokeLinecap="round"
        />
        <circle cx={51} cy={7} r={4.2} fill={t.lapis} />
        <path
          d="M 41 27 A 9 9 0 0 0 23 27 A 9 10 0 0 0 32 37 A 9 10 0 0 1 41 47 A 9 9 0 0 1 23 47"
          stroke={t.ink}
          strokeWidth={7}
          strokeLinecap="round"
        />
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ fontSize: 92, fontWeight: 600, letterSpacing: -2 }}>
          Paid, sotto voce.
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            fontSize: 30,
            color: t.muted,
          }}
        >
          <span>Canton x402</span>
          <span
            style={{
              width: 42,
              height: 2,
              backgroundColor: t.line,
              display: "flex",
            }}
          />
          <span
            style={{
              color: t.ambra,
              border: `1.5px solid ${t.ambra}`,
              borderRadius: 4,
              padding: "2px 14px",
              fontSize: 26,
              letterSpacing: 4,
            }}
          >
            DEVNET
          </span>
        </div>
      </div>
    </div>,
    size,
  );
}
