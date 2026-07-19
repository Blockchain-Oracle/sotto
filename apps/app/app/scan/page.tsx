import type { Metadata } from "next";
import { ScanFeed } from "../../components/scan/scan-feed";

export const metadata: Metadata = { title: "Scan" };

export default function ScanPage() {
  return (
    <main className="app-main">
      <ScanFeed />
    </main>
  );
}
