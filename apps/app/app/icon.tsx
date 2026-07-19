import { ImageResponse } from "next/og";

import { notteTokens as t } from "../lib/tokens";

export const dynamic = "force-static";
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/** The glyph variant of the Sotto mark (geometry from @sotto/ui). */
export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        backgroundColor: t.canvas,
      }}
    >
      <svg viewBox="0 0 64 64" width={64} height={64} fill="none">
        <path
          d="M 41 22 A 9 9 0 0 0 23 22 A 9 10 0 0 0 32 32 A 9 10 0 0 1 41 42 A 9 9 0 0 1 23 42"
          stroke={t.ink}
          strokeWidth={8}
          strokeLinecap="round"
        />
      </svg>
    </div>,
    size,
  );
}
