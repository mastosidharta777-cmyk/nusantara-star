import { createClient } from "@supabase/supabase-js";

import { AdminDirectInquiryActions } from "@/components/admin-direct-inquiry-actions";
import { availabilityLabel } from "@/lib/ui-language";

type Props = { briefId: string };

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server environment is not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function AdminDirectInquiryPanel({ briefId }: Props) {
  const supabase = getServerClient();
  const { data: brief, error: briefError } = await supabase
    .from("briefs")
    .select("request_mode,requested_talent_id,budget_min,budget_max")
    .eq("id", briefId)
    .single();
  if (briefError) throw new Error(briefError.message);
  if (brief?.request_mode !== "direct_talent") return null;
  if (!brief.requested_talent_id) {
    return <section className="mb-7 border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-800">Direct inquiry kehilangan referensi talent. Jangan lanjutkan transaksi sebelum data diperbaiki.</section>;
  }

  const [{ data: talent, error: talentError }, { data: availabilityRequest, error: requestError }] = await Promise.all([
    supabase.from("talents").select("id,name,category,base_city").eq("id", brief.requested_talent_id).single(),
    supabase.from("availability_requests").select("id,status").eq("brief_id", briefId).eq("talent_id", brief.requested_talent_id).maybeSingle(),
  ]);
  if (talentError || !talent) throw new Error(talentError?.message ?? "Requested talent not found");
  if (requestError) throw new Error(requestError.message);

  return (
    <section className="mb-7 border border-black/10 bg-white">
      <div className="border-b border-black/10 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#b34b34]">Direct Talent Inquiry</p>
        <h2 className="mt-2 text-2xl font-semibold">Talent diminta: {talent.name}</h2>
        <p className="mt-1 text-sm text-black/50">{talent.category}{talent.base_city ? ` · ${talent.base_city}` : ""}</p>
      </div>
      <div className="p-5">
        <p className="text-sm leading-6 text-black/60">Buyer meminta talent ini secara langsung. Budget buyer adalah konteks komersial, bukan harga publik talent. Jangan jalankan generic matching sebagai proses utama dan jangan anggap inquiry ini sebagai booking.</p>
        <p className="mt-3 text-sm"><span className="text-black/45">Status live confirmation:</span> <strong>{availabilityLabel(availabilityRequest?.status ?? null)}</strong></p>
        <AdminDirectInquiryActions
          briefId={briefId}
          talentId={talent.id}
          availabilityRequestId={availabilityRequest?.id ?? null}
          availabilityRequestStatus={availabilityRequest?.status ?? null}
        />
      </div>
    </section>
  );
}
