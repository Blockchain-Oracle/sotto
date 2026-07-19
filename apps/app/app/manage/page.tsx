import type { Metadata } from "next";
import { ManageView } from "../../components/manage/manage-view";

export const metadata: Metadata = { title: "Manage APIs" };

export default function ManagePage() {
  return (
    <main className="app-main">
      <ManageView />
    </main>
  );
}
