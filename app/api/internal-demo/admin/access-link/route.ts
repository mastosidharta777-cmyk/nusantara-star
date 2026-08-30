import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { signAccessToken, type SignedAccessScope } from "@/lib/signed-access";

export const runtime = "nodejs";

function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase server environment is not configured");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const allowedScopes: SignedAccessScope[] = ["buyer_proposal", "buyer_terms", "talent_offer", "talent_onboarding"];
    const scope = typeof body?.scope === "string" && allowedScopes.includes(body.scope as SignedAccessScope) ? body.scope as SignedAccessScope : null;
    const subjectId = typeof body?.subjectId === "string" ? body.subjectId : "";
    if (!scope || !subjectId) return NextResponse.json({ error: "Invalid secure-link request" }, { status: 400 });

    if (process.env.VERCEL_ENV && request.headers.get("x-ns-admin-verified") !== "1") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServerClient();
    let path = "";
    let expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    if (scope === "buyer_proposal") {
      const { data: proposal, error } = await supabase.from("proposals").select("brief_id,expires_at,status").eq("brief_id", subjectId).in("status", ["sent", "viewed", "selected"]).order("version", { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error(error.message);
      if (!proposal) return NextResponse.json({ error: "Buyer proposal is not available" }, { status: 409 });
      if (!proposal.expires_at) return NextResponse.json({ error: "Proposal validity is missing and must be regenerated" }, { status: 409 });
      const proposalExpiry = new Date(proposal.expires_at);
      if (!Number.isFinite(proposalExpiry.getTime()) || proposalExpiry.getTime() <= Date.now()) return NextResponse.json({ error: "Proposal has expired" }, { status: 409 });
      if (proposalExpiry < expiresAt) expiresAt = proposalExpiry;
      path = `/id/proposal/${encodeURIComponent(subjectId)}`;
    } else if (scope === "buyer_terms") {
      const { data: booking, error: bookingError } = await supabase.from("bookings").select("id,deal_id,status,buyer_terms_accepted_at,buyer_terms_accepted_deal_id,buyer_terms_acceptance_source").eq("id", subjectId).maybeSingle();
      if (bookingError) throw new Error(bookingError.message);
      if (!booking || !booking.deal_id) return NextResponse.json({ error: "Booking is not available for buyer terms" }, { status: 404 });
      const validExistingAcceptance = Boolean(booking.buyer_terms_accepted_at && booking.buyer_terms_accepted_deal_id === booking.deal_id && booking.buyer_terms_acceptance_source === "signed_buyer_link");
      if (validExistingAcceptance) return NextResponse.json({ error: "Buyer terms have already been accepted" }, { status: 409 });
      if (booking.status !== "pending_security") return NextResponse.json({ error: "Booking is no longer awaiting buyer terms" }, { status: 409 });

      const { data: deal, error: dealError } = await supabase.from("deals").select("id,status,talent_offer_id,buyer_payment_schedule,cancellation_terms").eq("id", booking.deal_id).maybeSingle();
      if (dealError) throw new Error(dealError.message);
      if (!deal || deal.status !== "locked") return NextResponse.json({ error: "Deal must be locked before buyer terms are sent" }, { status: 409 });
      if (!Array.isArray(deal.buyer_payment_schedule) || deal.buyer_payment_schedule.length === 0 || !deal.cancellation_terms?.trim()) {
        return NextResponse.json({ error: "Buyer-facing payment and cancellation terms are incomplete" }, { status: 409 });
      }

      const { data: offer, error: offerError } = await supabase.from("talent_offers").select("status,availability_status,quote_valid_until").eq("id", deal.talent_offer_id).maybeSingle();
      if (offerError) throw new Error(offerError.message);
      if (!offer || offer.status !== "confirmed" || offer.availability_status !== "confirmed" || !offer.quote_valid_until) return NextResponse.json({ error: "Talent offer requires reconfirmation" }, { status: 409 });
      const offerExpiry = new Date(offer.quote_valid_until);
      if (!Number.isFinite(offerExpiry.getTime()) || offerExpiry.getTime() <= Date.now()) return NextResponse.json({ error: "Talent offer has expired" }, { status: 409 });
      if (offerExpiry < expiresAt) expiresAt = offerExpiry;
      path = `/id/terms/${encodeURIComponent(subjectId)}`;
    } else if (scope === "talent_offer") {
      const { data: row, error } = await supabase.from("availability_requests").select("id").eq("id", subjectId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) return NextResponse.json({ error: "Availability request not found" }, { status: 404 });
      path = `/talent-confirmation/${encodeURIComponent(subjectId)}`;
    } else {
      const { data: talent, error } = await supabase.from("talents").select("id,status").eq("id", subjectId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!talent || talent.status === "inactive") return NextResponse.json({ error: "Talent is not available for onboarding" }, { status: 404 });
      expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      path = `/talent-onboarding/${encodeURIComponent(subjectId)}`;
    }

    const token = signAccessToken(scope, subjectId, expiresAt);
    const origin = new URL(request.url).origin;
    return NextResponse.json({ ok: true, url: `${origin}${path}?token=${encodeURIComponent(token)}`, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    return NextResponse.json({ error: "Secure link creation failed", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
