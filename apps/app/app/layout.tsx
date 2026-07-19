import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { cartaTokens, notteTokens } from "../lib/tokens";
import { Shell } from "../components/shell/shell";

import "@sotto/ui/theme.css";
import "@sotto/ui/fonts/fonts.css";
import "@sotto/ui/primitives.css";
import "./app.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://app.usesotto.xyz"),
  title: {
    default: "Sotto — Canton x402 marketplace",
    template: "%s · Sotto",
  },
  description:
    "Verified Canton x402 resources: inspect the live payment contract, " +
    "prepare exact paid calls, and follow settlement and delivery as " +
    "separate facts.",
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
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
