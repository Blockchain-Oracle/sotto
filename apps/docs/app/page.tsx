import { redirect } from "next/navigation";

/** The docs domain has one job — everything lives under /docs. */
export default function Home() {
  redirect("/docs");
}
