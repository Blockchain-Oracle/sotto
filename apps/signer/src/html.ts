const ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replaceAll(/[&<>"']/gu, (match) => ESCAPES[match] ?? match);
}

/** Converts a CC atomic integer string (10 decimals) to a display value. */
export function formatCantonCoin(atomic: string): string {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(atomic)) return atomic;
  const padded = atomic.padStart(11, "0");
  return `${padded.slice(0, -10)}.${padded.slice(-10)} CC`;
}

// Inline token values mirror DESIGN.md section 2 (Sotto Voce). This page is
// dependency-free server-rendered HTML; once packages/ui/src/theme.css lands
// these move behind that single token source.
const STYLE = `
:root { --canvas: #f6f5f1; --surface: #fffefb; --ink: #16181f;
  --muted: #63666f; --line: #e3e1d8; --lapis: #2b3fc4; --ambra: #9a6a00;
  --rosso: #b3261e; }
@media (prefers-color-scheme: dark) {
  :root { --canvas: #10131a; --surface: #171b24; --ink: #ecedec;
    --muted: #8e91a0; --line: #252a36; --lapis: #6d7df2; --ambra: #d9a03f;
    --rosso: #ef6a5f; } }
* { box-sizing: border-box; margin: 0; }
body { background: var(--canvas); color: var(--ink); font: 14px/1.5 "Geist",
  ui-sans-serif, system-ui, -apple-system, sans-serif; padding: 32px 16px; }
main { margin: 0 auto; max-width: 640px; }
h1 { font-size: 18px; font-weight: 600; margin-bottom: 4px; }
p.note { color: var(--muted); margin-bottom: 16px; }
section { background: var(--surface); border: 1px solid var(--line);
  border-radius: 4px; padding: 16px; }
dl { display: grid; gap: 8px 16px; grid-template-columns: max-content 1fr; }
dt { color: var(--muted); font-size: 11px; letter-spacing: .1em;
  text-transform: uppercase; padding-top: 2px; }
dd { font-family: "Geist Mono", ui-monospace, monospace;
  font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.status { border: 1px solid var(--line); border-radius: 999px;
  display: inline-block; font-size: 12px; margin-bottom: 16px;
  padding: 2px 10px; }
.actions { display: flex; gap: 8px; margin-top: 16px; }
button { border: 1px solid var(--line); border-radius: 4px;
  cursor: pointer; font: inherit; padding: 8px 16px; }
button.approve { background: var(--lapis); border-color: var(--lapis);
  color: #fffefb; }
button.reject { background: transparent; color: var(--rosso); }
ul.approvals { list-style: none; }
ul.approvals li { border-top: 1px solid var(--line); padding: 8px 0; }
ul.approvals a { color: var(--lapis); }
.deadline { color: var(--ambra); }
`;

export function renderPage(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body><main>${body}</main></body>
</html>`;
}
