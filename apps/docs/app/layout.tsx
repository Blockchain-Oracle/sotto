import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@sotto/ui/theme.css";
import "@sotto/ui/fonts/fonts.css";
import "fumadocs-ui/style.css";
import "./global.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://docs.usesotto.xyz"),
  title: { default: "Sotto Docs", template: "%s · Sotto Docs" },
  description:
    "Documentation for Sotto — the marketplace and evidence layer for x402-paid APIs on Canton (Five North DevNet).",
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* Stamp both: fumadocs internals key on .dark, the Sotto tokens
            in theme.css key on [data-theme]. */}
        <RootProvider theme={{ attribute: ["class", "data-theme"] }}>
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
