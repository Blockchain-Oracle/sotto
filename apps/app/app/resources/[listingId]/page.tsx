import type { Metadata } from "next";
import { ResourceDetail } from "../../../components/resource/resource-detail";

export const metadata: Metadata = { title: "Resource" };

export default async function ResourcePage({
  params,
}: {
  params: Promise<{ listingId: string }>;
}) {
  const { listingId } = await params;
  return (
    <main className="app-main">
      <ResourceDetail listingId={listingId} />
    </main>
  );
}
