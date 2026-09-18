import { notFound } from "next/navigation";

import { loadBuyerPaymentRequest } from "@/lib/buyer-payment-request";
import { isLocale } from "@/lib/i18n";
import { verifyAccessToken } from "@/lib/signed-access";

export const dynamic = "force-dynamic";

function money(value: number, locale: "id" | "en") {
  return new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-US", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function dateLabel(value: string | null | undefined, locale: "id" | "en") {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T00:00:00+07:00` : value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", {
    dateStyle: "long",
    ...(value.length === 10 ? {} : { timeStyle: "short" as const }),
    timeZone: "Asia/Jakarta",
  }).format(date);
}

function milestoneLabel(value: string, isId: boolean) {
  if (value === "booking_fee") return isId ? "Biaya booking" : "Booking fee";
  if (value === "deposit") return isId ? "Uang muka (DP)" : "Deposit";
  if (value === "balance") return isId ? "Pelunasan" : "Balance payment";
  if (value === "full_payment") return isId ? "Pembayaran penuh" : "Full payment";
  return isId ? "Pembayaran" : "Payment";
}

export default async function BuyerPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale, id } = await params;
  const { token = "" } = await searchParams;
  if (!isLocale(locale)) notFound();
  if (process.env.VERCEL_ENV && !verifyAccessToken(token, "buyer_payment", id)) notFound();

  const data = await loadBuyerPaymentRequest(id);
  if (!data) notFound();

  const isId = locale === "id";
  const { payment, snapshot, instructions } = data;
  const isPaid = payment.status === "paid";
  const dueEnd = new Date(`${payment.request_due_date}T23:59:59+07:00`).getTime();
  const overdue = !isPaid && Number.isFinite(dueEnd) && dueEnd < Date.now();
  const destinationIsUrl = /^https?:\/\//i.test(instructions.destination);

  return (
    <main className="min-h-screen bg-[#f5f3ee] px-5 py-10 text-[#171713] md:px-10 md:py-16">
      <div className="mx-auto max-w-[820px]">
        <p className="eyebrow">Nusantara Star · Payment Request</p>
        <div className="mt-4 flex flex-col gap-4 border-b border-black/10 pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-4xl font-semibold tracking-[-0.04em] md:text-6xl">
              {isId ? "Permintaan pembayaran." : "Payment request."}
            </h1>
            <p className="mt-4 text-sm text-black/55">{payment.request_reference}</p>
          </div>
          <span className={`w-fit border px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${isPaid ? "border-emerald-700/25 bg-emerald-50 text-emerald-900" : overdue ? "border-red-700/20 bg-red-50 text-red-800" : "border-black/15 bg-white"}`}>
            {isPaid ? (isId ? "Terverifikasi dibayar" : "Verified paid") : overdue ? (isId ? "Lewat jatuh tempo" : "Past due") : (isId ? "Menunggu pembayaran" : "Awaiting payment")}
          </span>
        </div>

        <section className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [isId ? "Talent" : "Talent", snapshot.event.talent_name ?? "—"],
            [isId ? "Acara" : "Event", snapshot.event.event_type ?? "—"],
            [isId ? "Tanggal acara" : "Event date", dateLabel(snapshot.event.event_date ?? null, locale)],
            [isId ? "Kota" : "City", snapshot.event.city ?? "—"],
          ].map(([label, value]) => (
            <div key={label} className="border border-black/10 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">{label}</p>
              <p className="mt-2 text-sm font-semibold">{value}</p>
            </div>
          ))}
        </section>

        <section className="mt-5 border border-black/10 bg-white p-5 md:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">{milestoneLabel(snapshot.milestone.milestone_type, isId)}</p>
          <p className="mt-2 text-4xl font-semibold">{money(payment.amount, locale)}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="border border-black/10 p-3 text-sm">
              <span className="text-black/45">{isId ? "Diterbitkan" : "Issued"}</span><br />
              <strong>{dateLabel(payment.request_issued_at, locale)}</strong>
            </div>
            <div className="border border-black/10 p-3 text-sm">
              <span className="text-black/45">{isId ? "Jatuh tempo" : "Due date"}</span><br />
              <strong>{dateLabel(payment.request_due_date, locale)}</strong>
            </div>
          </div>
          {snapshot.milestone.cancellation_note ? (
            <p className="mt-4 text-xs leading-5 text-black/50">{snapshot.milestone.cancellation_note}</p>
          ) : null}
        </section>

        <section className="mt-5 border border-black/10 bg-white p-5 md:p-6">
          <h2 className="text-xl font-semibold">{isId ? "Instruksi pembayaran" : "Payment instructions"}</h2>
          <div className="mt-4 space-y-4 text-sm leading-6">
            <p>
              <span className="text-black/45">{isId ? "Metode:" : "Method:"}</span><br />
              {instructions.method === "bank_transfer" ? (isId ? "Transfer bank" : "Bank transfer") : instructions.method === "payment_link" ? "Payment link" : (isId ? "Metode lain" : "Other method")}
            </p>
            <p><span className="text-black/45">{isId ? "Bank / provider:" : "Bank / provider:"}</span><br /><strong>{instructions.provider_name}</strong></p>
            {instructions.account_name ? <p><span className="text-black/45">{isId ? "Nama penerima:" : "Account / recipient name:"}</span><br /><strong>{instructions.account_name}</strong></p> : null}
            <div>
              <p className="text-black/45">{isId ? "Tujuan pembayaran:" : "Payment destination:"}</p>
              {destinationIsUrl ? (
                <a href={instructions.destination} target="_blank" rel="noreferrer" className="mt-1 inline-block font-semibold underline">
                  {isId ? "Buka payment link" : "Open payment link"}
                </a>
              ) : <p className="mt-1 break-all font-semibold">{instructions.destination}</p>}
            </div>
            {instructions.notes ? <p><span className="text-black/45">{isId ? "Catatan:" : "Notes:"}</span><br />{instructions.notes}</p> : null}
          </div>
        </section>

        <section className="mt-5 border border-black/10 bg-white p-5 text-sm leading-6 md:p-6">
          {isPaid ? (
            <>
              <p className="font-semibold">{isId ? "Pembayaran sudah diverifikasi oleh Nusantara Star." : "Payment has been verified by Nusantara Star."}</p>
              <p className="mt-2 text-black/55">{isId ? "Tanggal verifikasi" : "Verified at"}: {dateLabel(payment.paid_at, locale)}</p>
              {payment.provider_reference ? <p className="text-black/55">{isId ? "Referensi transaksi" : "Transaction reference"}: {payment.provider_reference}</p> : null}
            </>
          ) : (
            <>
              <p className="font-semibold">{isId ? "Pembayaran belum dianggap diterima sampai diverifikasi." : "Payment is not considered received until verified."}</p>
              <p className="mt-2 text-black/55">
                {isId
                  ? "Jangan menganggap booking sudah terjamin hanya karena transfer telah dilakukan. Status booking berubah setelah Nusantara Star memverifikasi pembayaran atau jaminan komersial yang disetujui."
                  : "Do not treat the booking as secured merely because a transfer was sent. Booking status changes only after Nusantara Star verifies payment or an approved commercial security."}
              </p>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
