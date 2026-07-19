"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ApiError, apiRequest } from "./api";

/**
 * Owner-session state (surface map 07/S29). The `sotto_session` cookie is
 * HTTP-only, so the browser keeps only non-secret display facts beside it
 * and PROVES the session by asking the API. Silent restore = one
 * credentialed read; 401 = expired → verify again before protected work.
 */

export type SessionDisplay = Readonly<{
  partyId: string;
  walletLabel: string;
  walletId: string | null;
  walletUrl: string | null;
  fingerprint: string | null;
  expiresAt: string;
}>;

export type SessionStatus = "checking" | "absent" | "active" | "expired";

type SessionContextValue = Readonly<{
  status: SessionStatus;
  display: SessionDisplay | null;
  connectOpen: boolean;
  openConnect: () => void;
  closeConnect: () => void;
  established: (display: SessionDisplay) => void;
  disconnect: () => Promise<void>;
  markExpired: () => void;
}>;

const STORAGE_KEY = "sotto-session-display";

function readStored(): SessionDisplay | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<SessionDisplay>;
    if (
      typeof parsed.partyId !== "string" ||
      typeof parsed.expiresAt !== "string"
    ) {
      return null;
    }
    return {
      partyId: parsed.partyId,
      walletLabel:
        typeof parsed.walletLabel === "string" ? parsed.walletLabel : "Owner",
      walletId: typeof parsed.walletId === "string" ? parsed.walletId : null,
      walletUrl: typeof parsed.walletUrl === "string" ? parsed.walletUrl : null,
      fingerprint:
        typeof parsed.fingerprint === "string" ? parsed.fingerprint : null,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("checking");
  const [display, setDisplay] = useState<SessionDisplay | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);

  useEffect(() => {
    const stored = readStored();
    if (stored === null) {
      setStatus("absent");
      return;
    }
    setDisplay(stored);
    let cancelled = false;
    // Prove the cookie against the API; a 401 is an expired session, an
    // unreachable API leaves the restore honest-unknown (treated absent
    // for protected actions, retried on the next protected call).
    apiRequest("/v1/purchases?limit=1")
      .then(() => {
        if (!cancelled) setStatus("active");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) {
          setStatus("expired");
        } else {
          setStatus("absent");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const established = useCallback((next: SessionDisplay) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage is display-only; the cookie still authenticates.
    }
    setDisplay(next);
    setStatus("active");
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await apiRequest("/v1/session", { method: "DELETE" });
    } finally {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Ignore storage failures; the cookie is already revoked.
      }
      setDisplay(null);
      setStatus("absent");
    }
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      display,
      connectOpen,
      openConnect: () => setConnectOpen(true),
      closeConnect: () => setConnectOpen(false),
      established,
      disconnect,
      markExpired: () => setStatus("expired"),
    }),
    [status, display, connectOpen, established, disconnect],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (value === null) {
    throw new Error("useSession requires <SessionProvider>");
  }
  return value;
}
