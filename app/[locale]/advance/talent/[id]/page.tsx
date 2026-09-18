import { notFound } from "next/navigation";

import { CollaborativeShowAdvanceForm } from "@/components/collaborative-show-advance-form";
import { loadCollaborativeShowAdvance } from "@/lib/collaborative-show-advance";
import { isLocale } from "@/lib/i18n";
import { verifyAccessToken } from "@/lib/signed-access";

export const dynamic = "force-dynamic";

export default async function TalentShowAdvancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale, id } = await params;
  const { token = "" } = await searchParams;
  if (!isLocale(locale)) notFound();
  if (process.env.VERCEL_ENV && !verifyAccessToken(token, "talent_advance", id)) notFound();

  const data = await loadCollaborativeShowAdvance(id, "talent");
  if (!data) notFound();

  return <CollaborativeShowAdvanceForm bookingId={id} party="talent" token={token} data={data} />;
}
