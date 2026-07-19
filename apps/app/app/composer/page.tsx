import type { Metadata } from "next";
import { Suspense } from "react";
import { Composer } from "../../components/composer/composer";
import { DetailSkeleton } from "../../components/marketplace/skeletons";

export const metadata: Metadata = { title: "Composer" };

export default function ComposerPage() {
  return (
    <main className="app-main" data-wide="true">
      <Suspense
        fallback={
          <div style={{ padding: 24 }}>
            <DetailSkeleton />
          </div>
        }
      >
        <Composer />
      </Suspense>
    </main>
  );
}
