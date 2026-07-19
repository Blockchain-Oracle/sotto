/**
 * code-block — plain pre/code in the testifying voice (no highlighter).
 * Captured output shown here must be REAL; never present fabricated
 * terminal output as evidence (DESIGN.md §8).
 */
export interface CodeBlockProps {
  code: string;
  /** Uppercase mono caption, e.g. "402 CHALLENGE". */
  label?: string;
  className?: string;
}

export function CodeBlock({ code, label, className }: CodeBlockProps) {
  return (
    <figure className={["sv-code", className].filter(Boolean).join(" ")}>
      {label === undefined ? null : (
        <figcaption className="sv-code-label">{label}</figcaption>
      )}
      <pre className="sv-code-pre">
        <code>{code}</code>
      </pre>
    </figure>
  );
}
