import type { Metadata } from "next";
import { ProviderDetail } from "../../../components/resource/provider-detail";

export const metadata: Metadata = { title: "Provider" };

export default async function ProviderPage({
  params,
}: {
  params: Promise<{ providerId: string }>;
}) {
  const { providerId } = await params;
  return (
    <main className="app-main">
      <ProviderDetail providerId={providerId} />
    </main>
  );
}
