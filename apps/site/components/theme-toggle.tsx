"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function currentTheme(): Theme {
  const stamped = document.documentElement.getAttribute("data-theme");
  if (stamped === "light" || stamped === "dark") return stamped;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * Carta / Notte switch. The explicit choice is stamped as [data-theme]
 * (theme.css: the stamp wins over prefers-color-scheme) and persisted.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(currentTheme());
  }, []);

  const toggle = () => {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("sotto-theme", next);
    } catch {
      // Persistence is optional; the stamp still applies for this visit.
    }
    setTheme(next);
  };

  return (
    <button
      type="button"
      className="site-theme-toggle"
      onClick={toggle}
      aria-label={
        theme === null
          ? "Switch theme"
          : theme === "dark"
            ? "Switch to the light theme"
            : "Switch to the dark theme"
      }
    >
      <span className="site-theme-dot" aria-hidden="true" />
      {theme === null ? "Theme" : theme === "dark" ? "Notte" : "Carta"}
    </button>
  );
}
