import type { Metadata } from "next";
import { EvidenceDetail } from "../../../components/scan/evidence-detail";

export const metadata: Metadata = { title: "Transaction evidence" };

export default async function EvidencePage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  return (
    <main className="app-main">
      <EvidenceDetail attemptId={decodeURIComponent(attemptId)} />
    </main>
  );
}
