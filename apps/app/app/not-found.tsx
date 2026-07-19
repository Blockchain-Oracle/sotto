import Link from "next/link";
import { RestState } from "../components/ui";

export default function NotFound() {
  return (
    <main className="app-main">
      <RestState
        title="Nothing is engraved at this address."
        detail="The route does not match a Sotto surface."
        action={<Link href="/">Return to the marketplace</Link>}
      />
    </main>
  );
}
