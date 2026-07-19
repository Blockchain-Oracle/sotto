"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { SottoMark, Toaster, TooltipProvider } from "../ui";
import { SessionProvider } from "../../lib/session";
import { CommandSearch } from "../search/command-search";
import { ConnectOverlay } from "../session/connect-overlay";
import { OwnerControl } from "./owner-control";
import { RailStrip } from "./rail-strip";
import { ThemeToggle } from "./theme-toggle";

const TABS = [
  { href: "/", label: "Marketplace" },
  { href: "/scan", label: "Scan" },
  { href: "/stats", label: "Stats" },
  { href: "/composer", label: "Composer" },
  { href: "/add-api", label: "Add API", command: true },
] as const;

const CRUMBS: readonly Readonly<{ prefix: string; label: string }>[] = [
  { prefix: "/resources/", label: "Resource" },
  { prefix: "/providers/", label: "Provider" },
  { prefix: "/scan/", label: "Attempt" },
  { prefix: "/manage/origins/", label: "Origin" },
];

function activeTab(pathname: string): string {
  if (pathname === "/") return "/";
  if (pathname.startsWith("/resources") || pathname.startsWith("/providers")) {
    return "/";
  }
  const match = TABS.find(
    (tab) => tab.href !== "/" && pathname.startsWith(tab.href),
  );
  return match?.href ?? "";
}

function crumbFor(pathname: string): string | null {
  const found = CRUMBS.find(
    (crumb) =>
      pathname.startsWith(crumb.prefix) && pathname !== crumb.prefix.slice(-1),
  );
  if (found !== undefined) return found.label;
  if (pathname.startsWith("/manage")) return "Manage APIs";
  if (pathname.startsWith("/ops")) return "Operator";
  return null;
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const crumb = crumbFor(pathname);
  const current = activeTab(pathname);

  return (
    <SessionProvider>
      <TooltipProvider>
        <header className="app-header">
          <div className="app-header-row">
            <Link href="/" className="app-brand" aria-label="Sotto marketplace">
              <SottoMark size={26} />
              <span>Sotto</span>
            </Link>
            {crumb === null ? null : (
              <span className="app-crumb">
                <span className="app-crumb-sep" aria-hidden="true">
                  /
                </span>
                <span className="app-crumb-current">{crumb}</span>
              </span>
            )}
            <div className="app-header-controls">
              <span className="app-devnet">
                <span className="sv-badge" data-tone="ambra">
                  Canton DevNet
                </span>
              </span>
              <button
                type="button"
                className="app-search-trigger"
                onClick={() => setSearchOpen(true)}
                aria-label="Search resources, providers, and transactions"
              >
                <span className="app-search-hint">Search</span>
                <kbd>⌘K</kbd>
              </button>
              <ThemeToggle />
              <OwnerControl />
            </div>
          </div>
        </header>
        <nav className="app-tabs-row" aria-label="Primary">
          <div className="app-tabs">
            {TABS.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className="app-tab"
                data-active={current === tab.href ? "true" : undefined}
                data-command={
                  "command" in tab && tab.command ? "true" : undefined
                }
              >
                {tab.label}
              </Link>
            ))}
          </div>
        </nav>
        <RailStrip />
        {children}
        <CommandSearch open={searchOpen} onOpenChange={setSearchOpen} />
        <ConnectOverlay />
        <Toaster />
      </TooltipProvider>
    </SessionProvider>
  );
}
