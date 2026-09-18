import { notFound } from "next/navigation";

import { PreShowWorkspaceForm } from "@/components/pre-show-workspace-form";
import { isLocale } from "@/lib/i18n";
import { loadPreShowWorkspace } from "@/lib/pre-show-workspace";
import { verifyAccessToken } from "@/lib/signed-access";

export const dynamic = "force-dynamic";

export default async function BuyerPreShowPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale, id } = await params;
  const { token = "" } = await searchParams;
  if (!isLocale(locale)) notFound();
  if (process.env.VERCEL_ENV && !verifyAccessToken(token, "buyer_pre_show", id)) notFound();

  const data = await loadPreShowWorkspace(id, "buyer");
  if (!data) notFound();

  return <PreShowWorkspaceForm bookingId={id} party="buyer" token={token} data={data} />;
}
