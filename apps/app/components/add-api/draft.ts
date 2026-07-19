"use client";

import type {
  ProbeHealth,
  ProbeObservation,
  RegisteredOrigin,
} from "../../lib/types";

/**
 * Resumable Add API draft (surface map 03): non-secret audit state only,
 * kept in sessionStorage so a session expiry or reload preserves the
 * work. No token, cookie, or payment field is ever stored here.
 */
export type AddApiDraft = Readonly<{
  step: 1 | 2 | 3 | 4 | 5;
  providerName: string;
  endpointUrl: string;
  routeTemplate: string;
  resourceName: string;
  resourceDescription: string;
  origin: RegisteredOrigin | null;
  observation: ProbeObservation | null;
  health: ProbeHealth | null;
  probeFailure: Readonly<{ code: string; detail: string }> | null;
  proofId: string | null;
  proofExpiresAt: string | null;
}>;

export const EMPTY_DRAFT: AddApiDraft = Object.freeze({
  step: 1,
  providerName: "",
  endpointUrl: "",
  routeTemplate: "",
  resourceName: "",
  resourceDescription: "",
  origin: null,
  observation: null,
  health: null,
  probeFailure: null,
  proofId: null,
  proofExpiresAt: null,
});

const KEY = "sotto-add-api-draft";

export function readDraft(): AddApiDraft {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw === null) return EMPTY_DRAFT;
    return { ...EMPTY_DRAFT, ...(JSON.parse(raw) as Partial<AddApiDraft>) };
  } catch {
    return EMPTY_DRAFT;
  }
}

export function writeDraft(draft: AddApiDraft): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // The flow still works for this page lifetime.
  }
}

export function clearDraft(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

export const STEPS = [
  "Enter endpoint",
  "Audit live API",
  "Verify origin",
  "Review resources",
  "Publish",
] as const;
