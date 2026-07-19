import type { Metadata } from "next";
import { ManageView } from "../../../../components/manage/manage-view";

export const metadata: Metadata = { title: "Origin management" };

export default async function OriginPage({
  params,
}: {
  params: Promise<{ originId: string }>;
}) {
  const { originId } = await params;
  return (
    <main className="app-main">
      <ManageView originId={originId} />
    </main>
  );
}
