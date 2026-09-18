import { notFound } from "next/navigation";

import { PreShowWorkspaceForm } from "@/components/pre-show-workspace-form";
import { isLocale } from "@/lib/i18n";
import { loadPreShowWorkspace } from "@/lib/pre-show-workspace";
import { verifyAccessToken } from "@/lib/signed-access";

export const dynamic = "force-dynamic";

export default async function TalentPreShowPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale, id } = await params;
  const { token = "" } = await searchParams;
  if (!isLocale(locale)) notFound();
  if (process.env.VERCEL_ENV && !verifyAccessToken(token, "talent_pre_show", id)) notFound();

  const data = await loadPreShowWorkspace(id, "talent");
  if (!data) notFound();

  return <PreShowWorkspaceForm bookingId={id} party="talent" token={token} data={data} />;
}
