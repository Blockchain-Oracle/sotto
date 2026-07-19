import { Agent } from "../components/agent";
import { EvidenceColophon, SiteFooter } from "../components/evidence";
import { Hero } from "../components/hero";
import { Honesty } from "../components/honesty";
import { MarksStrip } from "../components/marks-strip";
import { Mechanic } from "../components/mechanic";
import { Privacy } from "../components/privacy";
import { SiteNav } from "../components/site-nav";

export default function Home() {
  return (
    <div className="site-page">
      <SiteNav />
      <main className="site-main">
        <Hero />
        <MarksStrip />
        <Mechanic />
        <Privacy />
        <Agent />
        <Honesty />
        <EvidenceColophon />
      </main>
      <SiteFooter />
    </div>
  );
}
