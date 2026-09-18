import { notFound } from "next/navigation";

import { CollaborativeShowAdvanceForm } from "@/components/collaborative-show-advance-form";
import { loadCollaborativeShowAdvance } from "@/lib/collaborative-show-advance";
import { isLocale } from "@/lib/i18n";
import { verifyAccessToken } from "@/lib/signed-access";

export const dynamic = "force-dynamic";

export default async function BuyerShowAdvancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale, id } = await params;
  const { token = "" } = await searchParams;
  if (!isLocale(locale)) notFound();
  if (process.env.VERCEL_ENV && !verifyAccessToken(token, "buyer_advance", id)) notFound();

  const data = await loadCollaborativeShowAdvance(id, "buyer");
  if (!data) notFound();

  return <CollaborativeShowAdvanceForm bookingId={id} party="buyer" token={token} data={data} />;
}
