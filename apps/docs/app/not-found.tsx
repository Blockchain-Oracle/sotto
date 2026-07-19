import Link from "next/link";

export default function NotFound() {
  return (
    <main className="docs-notfound">
      <p className="docs-notfound-code">404</p>
      <h1>No page is published at this address.</h1>
      <Link href="/docs">Open the docs index</Link>
    </main>
  );
}
