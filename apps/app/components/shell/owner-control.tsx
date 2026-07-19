"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Badge, Button, CopyChip, formatUtc, truncateParty } from "../ui";
import { useSession } from "../../lib/session";

/**
 * Owner control (surface map 01/07): "Connect Canton wallet" when no
 * session exists; a compact connected-party pill with the active-session
 * menu otherwise. No email, organization, or account route exists.
 */
export function OwnerControl() {
  const session = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (
        containerRef.current !== null &&
        event.target instanceof Node &&
        !containerRef.current.contains(event.target)
      ) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [menuOpen]);

  if (session.status === "checking") {
    return (
      <span className="app-owner-pill" aria-label="Restoring session">
        …
      </span>
    );
  }

  if (session.display === null || session.status === "absent") {
    return (
      <Button variant="primary" onClick={session.openConnect}>
        <span className="app-connect-full">Connect Canton wallet</span>
        <span className="app-connect-short">Connect</span>
      </Button>
    );
  }

  const display = session.display;
  const expired = session.status === "expired";

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        className="app-owner-pill"
        data-state={expired ? "expired" : undefined}
        onClick={() => setMenuOpen((open) => !open)}
        aria-expanded={menuOpen}
      >
        {truncateParty(display.partyId)}
        {expired ? " · expired" : ""}
      </button>
      {menuOpen ? (
        <div className="app-menu" role="menu" aria-label="Owner session">
          <div className="app-menu-section">
            <strong>{display.walletLabel}</strong>
            <CopyChip value={display.partyId} kind="party" />
            <span>
              <Badge tone="ambra">Canton DevNet</Badge>
            </span>
            <span className="app-cell-sub app-mono">
              {expired
                ? "Session expired — verify again"
                : `Session expires ${formatUtc(new Date(display.expiresAt))}`}
            </span>
          </div>
          {expired ? (
            <button
              type="button"
              className="app-menu-item"
              onClick={() => {
                setMenuOpen(false);
                session.openConnect();
              }}
            >
              Verify for Sotto
            </button>
          ) : (
            <Link
              className="app-menu-item"
              href="/manage"
              onClick={() => setMenuOpen(false)}
            >
              Manage APIs
            </Link>
          )}
          <button
            type="button"
            className="app-menu-item"
            onClick={() => {
              setMenuOpen(false);
              void session.disconnect();
            }}
          >
            Disconnect from Sotto
          </button>
        </div>
      ) : null}
    </div>
  );
}
