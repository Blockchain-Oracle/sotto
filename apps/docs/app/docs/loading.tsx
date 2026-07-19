/** Preserves the docs page geometry while a page loads. */
export default function Loading() {
  return (
    <div className="docs-loading" aria-busy="true" aria-label="Loading page">
      <div className="docs-loading-title" />
      <div className="docs-loading-line" />
      <div className="docs-loading-line" />
      <div className="docs-loading-line docs-loading-line-short" />
    </div>
  );
}
