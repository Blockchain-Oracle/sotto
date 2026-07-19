import type { Metadata } from "next";
import { Marketplace } from "../components/marketplace/marketplace";

export const metadata: Metadata = { title: "Marketplace" };

export default function MarketplacePage() {
  return (
    <main className="app-main">
      <Marketplace />
    </main>
  );
}
