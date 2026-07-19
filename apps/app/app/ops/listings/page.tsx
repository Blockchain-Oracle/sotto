import type { Metadata } from "next";
import { OpsListings } from "../../../components/ops/ops-listings";

export const metadata: Metadata = { title: "Operator · Listings" };

export default function OpsListingsPage() {
  return (
    <main className="app-main">
      <div className="app-page-head">
        <div>
          <h1 className="app-page-title">Listing moderation</h1>
          <p className="app-page-sub">
            Internal operator surface — separate bearer token, no owner session
            crossover.
          </p>
        </div>
      </div>
      <OpsListings />
    </main>
  );
}
