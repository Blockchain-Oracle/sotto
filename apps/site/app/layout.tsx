import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { cartaTokens, notteTokens } from "../lib/tokens";

import "@sotto/ui/theme.css";
import "@sotto/ui/fonts/fonts.css";
import "@sotto/ui/primitives.css";
import "./site.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://usesotto.xyz"),
  title: "Sotto — Paid, sotto voce.",
  description:
    "Verified Canton x402 APIs. Exact human-approved paid calls, settled on Canton DevNet with public explorer evidence.",
  openGraph: {
    title: "Sotto — Paid, sotto voce.",
    description:
      "Verified Canton x402 APIs. Exact human-approved paid calls, settled on Canton DevNet with public explorer evidence.",
    url: "https://usesotto.xyz",
    siteName: "Sotto",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: cartaTokens.canvas },
    { media: "(prefers-color-scheme: dark)", color: notteTokens.canvas },
  ],
};

/**
 * Applied before paint so an explicit theme choice never flashes.
 * theme.css resolves the tokens: [data-theme] wins over the media query.
 */
const themeInit = `(function(){try{var t=localStorage.getItem("sotto-theme");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
