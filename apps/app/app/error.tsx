"use client";

import { Button } from "../components/ui";

/**
 * Route error boundary: names the failed boundary and the next safe
 * action (DESIGN.md §6) — never a bare "Something went wrong".
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="app-main">
      <div className="app-error-band" role="alert">
        <p>
          This surface failed before it could render —{" "}
          {error.message || "the view threw without a message"}. Reload the
          view; if it fails again, check the Sotto API.
        </p>
        <Button onClick={reset}>Reload view</Button>
      </div>
    </main>
  );
}
