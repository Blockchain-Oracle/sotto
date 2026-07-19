"use client";

import { useEffect, useState } from "react";

type Choice = "light" | "dark" | "system";

function storedChoice(): Choice {
  try {
    const raw = localStorage.getItem("sotto-theme");
    if (raw === "light" || raw === "dark") return raw;
  } catch {
    // Fall through to system.
  }
  return "system";
}

const ORDER: readonly Choice[] = ["light", "dark", "system"];
const LABEL: Readonly<Record<Choice, string>> = {
  light: "Carta",
  dark: "Notte",
  system: "System",
};

/**
 * Light / dark / system cycle. An explicit choice stamps [data-theme]
 * (theme.css: the stamp wins over prefers-color-scheme) and persists;
 * "system" removes the stamp so the media query decides.
 */
export function ThemeToggle() {
  const [choice, setChoice] = useState<Choice | null>(null);

  useEffect(() => {
    setChoice(storedChoice());
  }, []);

  const cycle = () => {
    const current = choice ?? storedChoice();
    const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length] as Choice;
    if (next === "system") {
      document.documentElement.removeAttribute("data-theme");
      try {
        localStorage.removeItem("sotto-theme");
      } catch {
        // Persistence is optional.
      }
    } else {
      document.documentElement.setAttribute("data-theme", next);
      try {
        localStorage.setItem("sotto-theme", next);
      } catch {
        // Persistence is optional; the stamp still applies for this visit.
      }
    }
    setChoice(next);
  };

  return (
    <button
      type="button"
      className="app-search-trigger"
      onClick={cycle}
      aria-label={
        choice === null ? "Switch theme" : `Theme: ${LABEL[choice]}. Switch`
      }
    >
      {choice === null ? "Theme" : LABEL[choice]}
    </button>
  );
}
