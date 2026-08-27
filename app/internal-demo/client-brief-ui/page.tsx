import { notFound } from "next/navigation";

import { ClientBriefForm } from "@/components/client-brief-form";

export const dynamic = "force-dynamic";

export default function ClientBriefUiPreviewPage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <ClientBriefForm />;
}
