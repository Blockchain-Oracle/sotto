import { SottoMark } from "./ui-client";
import { ThemeToggle } from "./theme-toggle";

export function SiteNav() {
  return (
    <header className="site-nav">
      <a className="site-nav-brand" href="/" aria-label="Sotto">
        <SottoMark size={26} />
        <span className="site-nav-name">Sotto</span>
      </a>
      <nav className="site-nav-links" aria-label="Primary">
        <a href="https://app.usesotto.xyz">Marketplace</a>
        <a href="https://docs.usesotto.xyz">Docs</a>
        <a href="https://github.com/Blockchain-Oracle/sotto-x402">Source</a>
        <ThemeToggle />
      </nav>
    </header>
  );
}
