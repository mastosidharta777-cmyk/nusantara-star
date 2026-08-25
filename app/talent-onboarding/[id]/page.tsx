import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

import { TalentVideoUploader } from "@/components/talent-video-uploader";
import { verifyAccessToken } from "@/lib/signed-access";

export const dynamic = "force-dynamic";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export default async function TalentOnboardingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ token?: string }> }) {
  const { id } = await params;
  const { token = "" } = await searchParams;
  if (!verifyAccessToken(token, "talent_onboarding", id)) notFound();

  const supabase = getServerClient();
  const { data: talent, error } = await supabase.from("talents").select("id,name,status").eq("id", id).maybeSingle();
  if (error || !talent || talent.status === "inactive") notFound();

  return <TalentVideoUploader talentId={id} token={token} talentName={talent.name} />;
}
