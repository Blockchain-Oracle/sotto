import { EvidenceColophon, SiteFooter } from "../components/evidence";
import { Hero } from "../components/hero";
import { Honesty } from "../components/honesty";
import { MarksStrip } from "../components/marks-strip";
import { Mechanic } from "../components/mechanic";
import { SiteNav } from "../components/site-nav";

export default function Home() {
  return (
    <div className="site-page">
      <SiteNav />
      <main className="site-main">
        <Hero />
        <MarksStrip />
        <Mechanic />
        <Honesty />
        <EvidenceColophon />
      </main>
      <SiteFooter />
    </div>
  );
}
