import type { Metadata } from "next";
import { StatsView } from "../../components/stats/stats-view";

export const metadata: Metadata = { title: "Stats" };

export default function StatsPage() {
  return (
    <main className="app-main">
      <StatsView />
    </main>
  );
}
