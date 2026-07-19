import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

import { SottoMark } from "@/components/sotto-mark-client";

export function baseOptions(): BaseLayoutProps {
  return {
    links: [
      { external: true, text: "Marketplace", url: "https://app.usesotto.xyz" },
      { external: true, text: "usesotto.xyz", url: "https://usesotto.xyz" },
    ],
    nav: {
      title: (
        <>
          <SottoMark size={22} />
          <span style={{ fontWeight: 600, letterSpacing: "-0.01em" }}>
            Sotto Docs
          </span>
        </>
      ),
    },
  };
}
