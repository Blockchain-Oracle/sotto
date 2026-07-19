"use client";

/** Errors name the failed boundary and the next safe action. */
export default function DocsError({ reset }: { reset: () => void }) {
  return (
    <div className="docs-error" role="alert">
      <p className="docs-error-title">
        This documentation page failed to render.
      </p>
      <p className="docs-error-detail">
        The docs content boundary raised an error. Reload the page, or return to
        the docs index.
      </p>
      <div className="docs-error-actions">
        <button type="button" onClick={reset}>
          Reload this page
        </button>
        <a href="/docs">Open the docs index</a>
      </div>
    </div>
  );
}
