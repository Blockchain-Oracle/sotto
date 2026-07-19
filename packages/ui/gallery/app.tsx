import { useState } from "react";
import {
  Badge,
  SottoMark,
  SystemStrip,
  Toaster,
  TooltipProvider,
} from "../src/index.js";
import { RailSpecimens } from "./specimens/rail.js";
import { EvidenceSpecimens } from "./specimens/evidence.js";
import { ControlSpecimens } from "./specimens/controls.js";
import { MarkSpecimens } from "./specimens/marks.js";

type ThemeChoice = "auto" | "light" | "dark";

export function GalleryApp() {
  const [theme, setTheme] = useState<ThemeChoice>("auto");
  const [motion, setMotion] = useState(true);

  const applyTheme = (next: ThemeChoice) => {
    setTheme(next);
    const rootElement = document.documentElement;
    if (next === "auto") delete rootElement.dataset.theme;
    else rootElement.dataset.theme = next;
  };
  const applyMotion = (on: boolean) => {
    setMotion(on);
    const rootElement = document.documentElement;
    if (on) delete rootElement.dataset.motion;
    else rootElement.dataset.motion = "off";
  };

  return (
    <TooltipProvider>
      <SystemStrip tone="ambra">
        Canton DevNet · CC test value only · gallery renders SPECIMEN shapes,
        not live activity
      </SystemStrip>
      <header className="g-header">
        <SottoMark size={30} />
        <h1>Sotto Voce</h1>
        <Badge tone="ambra">Specimen</Badge>
        <div className="g-controls">
          {(["auto", "light", "dark"] as const).map((choice) => (
            <button
              key={choice}
              type="button"
              className="sv-btn"
              data-variant={theme === choice ? "primary" : "secondary"}
              onClick={() => applyTheme(choice)}
            >
              {choice}
            </button>
          ))}
          <button
            type="button"
            className="sv-btn"
            data-variant={motion ? "secondary" : "primary"}
            onClick={() => applyMotion(!motion)}
          >
            {motion ? "motion on" : "motion off"}
          </button>
        </div>
      </header>
      <p className="g-note">
        Dev-only component gallery. Every value below is a SPECIMEN in the real
        DevNet shape (0.25 CC, 1220… fingerprints); nothing here is recorded
        activity.
      </p>
      <main className="g-main">
        <RailSpecimens />
        <EvidenceSpecimens />
        <ControlSpecimens />
        <MarkSpecimens />
      </main>
      <Toaster />
    </TooltipProvider>
  );
}
