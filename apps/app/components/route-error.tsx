"use client";

import { Button } from "./ui";

/**
 * Shared route-error body: names the failed boundary and the next safe
 * action (DESIGN.md §6). Each segment's error.tsx wraps this.
 */
export function RouteFailure({
  surface,
  error,
  reset,
}: {
  surface: string;
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="app-main">
      <div className="app-error-band" role="alert">
        <p>
          The {surface} surface failed before it could render —{" "}
          {error.message || "the view threw without a message"}. Reload the
          view; if it fails again, check the Sotto API.
        </p>
        <Button onClick={reset}>Reload view</Button>
      </div>
    </main>
  );
}
