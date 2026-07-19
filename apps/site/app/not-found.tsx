import Link from "next/link";

export default function NotFound() {
  return (
    <main className="site-page site-notfound">
      <p className="site-kicker">404</p>
      <h1 className="site-h2">Nothing is engraved at this address.</h1>
      <Link className="site-notfound-link" href="/">
        Return to the front page
      </Link>
    </main>
  );
}
