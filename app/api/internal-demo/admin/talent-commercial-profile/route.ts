import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function previewOnly() {
  return process.env.VERCEL_ENV !== "production";
}

export async function POST(request: Request) {
  if (!previewOnly()) return new NextResponse(null, { status: 404 });
  const supabase = getServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase belum dikonfigurasi" }, { status: 500 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Data tidak valid" }, { status: 400 });

  const action = body.action;
  const talentId = body.talentId;
  if (typeof talentId !== "string" || !talentId) return NextResponse.json({ error: "Talent wajib dipilih" }, { status: 400 });

  const { data: talent, error: talentError } = await supabase.from("talents").select("id").eq("id", talentId).maybeSingle();
  if (talentError) return NextResponse.json({ error: "Gagal memeriksa talent", detail: talentError.message }, { status: 500 });
  if (!talent) return NextResponse.json({ error: "Talent tidak ditemukan" }, { status: 404 });

  if (action === "delete_payment_policy") {
    const policyId = typeof body.policyId === "string" ? body.policyId : "";
    if (!policyId) return NextResponse.json({ error: "Kebijakan pembayaran tidak valid" }, { status: 400 });

    const { error } = await supabase
      .from("talent_payment_policy_templates")
      .delete()
      .eq("id", policyId)
      .eq("talent_id", talentId);

    if (error) return NextResponse.json({ error: "Gagal menghapus kebijakan pembayaran", detail: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "add_payment_policy") {
    const milestoneTypes = ["booking_fee", "deposit", "balance", "full_payment", "other"];
    const calculationTypes = ["percentage", "fixed_amount", "remaining_balance"];
    const dueBases = ["booking_date", "event_date", "event_completion", "invoice_date"];

    const milestoneType = body.milestoneType;
    const calculationType = body.calculationType;
    const dueBasis = body.dueBasis;
    const sequenceNo = Number(body.sequenceNo);
    const dueOffsetDays = Number(body.dueOffsetDays ?? 0);
    if (!milestoneTypes.includes(milestoneType)) return NextResponse.json({ error: "Jenis pembayaran tidak valid" }, { status: 400 });
    if (!calculationTypes.includes(calculationType)) return NextResponse.json({ error: "Perhitungan tidak valid" }, { status: 400 });
    if (!dueBases.includes(dueBasis)) return NextResponse.json({ error: "Acuan jatuh tempo tidak valid" }, { status: 400 });
    if (!Number.isInteger(sequenceNo) || sequenceNo < 1) return NextResponse.json({ error: "Urutan tidak valid" }, { status: 400 });
    if (!Number.isInteger(dueOffsetDays)) return NextResponse.json({ error: "Selisih hari harus bilangan bulat" }, { status: 400 });

    let percentage: number | null = null;
    let amount: number | null = null;
    if (calculationType === "percentage") {
      percentage = Number(body.percentage);
      if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) return NextResponse.json({ error: "Persentase harus 0–100" }, { status: 400 });
    }
    if (calculationType === "fixed_amount") {
      amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount < 0) return NextResponse.json({ error: "Nominal tidak valid" }, { status: 400 });
    }

    const refundable = body.refundable === true ? true : body.refundable === false ? false : null;
    const negotiable = body.negotiable !== false;
    const { data, error } = await supabase.from("talent_payment_policy_templates").insert({
      talent_id: talentId,
      milestone_type: milestoneType,
      sequence_no: sequenceNo,
      calculation_type: calculationType,
      percentage,
      amount,
      due_basis: dueBasis,
      due_offset_days: dueOffsetDays,
      refundable,
      cancellation_note: typeof body.cancellationNote === "string" && body.cancellationNote.trim() ? body.cancellationNote.trim() : null,
      negotiable,
      notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null,
    }).select("*").single();

    if (error) return NextResponse.json({ error: "Gagal menyimpan kebijakan pembayaran", detail: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  }

  if (action === "add_media") {
    const mediaTypes = ["live_performance", "showreel", "event_clip", "other"];
    const providers = ["youtube_unlisted", "internal_storage"];
    const mediaType = body.mediaType;
    const provider = body.provider;
    const mediaUrl = typeof body.mediaUrl === "string" ? body.mediaUrl.trim() : "";
    const sortOrder = Number(body.sortOrder ?? 1);
    if (!mediaTypes.includes(mediaType)) return NextResponse.json({ error: "Jenis media tidak valid" }, { status: 400 });
    if (!providers.includes(provider)) return NextResponse.json({ error: "Sumber media tidak valid" }, { status: 400 });
    if (!/^https?:\/\//i.test(mediaUrl)) return NextResponse.json({ error: "Tautan video tidak valid" }, { status: 400 });
    if (!Number.isInteger(sortOrder) || sortOrder < 1) return NextResponse.json({ error: "Urutan media tidak valid" }, { status: 400 });

    const { data, error } = await supabase.from("talent_media").insert({
      talent_id: talentId,
      media_type: mediaType,
      provider,
      media_url: mediaUrl,
      title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : null,
      description: typeof body.description === "string" && body.description.trim() ? body.description.trim() : null,
      buyer_visible: body.buyerVisible === true,
      sort_order: sortOrder,
    }).select("*").single();

    if (error) return NextResponse.json({ error: "Gagal menyimpan media talent", detail: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  }

  return NextResponse.json({ error: "Aksi tidak dikenal" }, { status: 400 });
}
