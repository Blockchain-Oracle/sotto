import type { Metadata } from "next";
import { AddApiFlow } from "../../components/add-api/flow";

export const metadata: Metadata = { title: "Add API" };

export default function AddApiPage() {
  return (
    <main className="app-main">
      <AddApiFlow />
    </main>
  );
}
