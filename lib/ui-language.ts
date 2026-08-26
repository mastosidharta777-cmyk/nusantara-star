export function availabilityLabel(value?: string | null) {
  if (value === "confirmed") return "Terkonfirmasi";
  if (value === "tentative") return "Sementara";
  if (value === "unavailable") return "Tidak tersedia";
  if (value === "pending") return "Menunggu";
  return value || "Belum ada";
}

export function decisionLabel(value?: string | null) {
  if (value === "approved") return "Disetujui";
  if (value === "rejected") return "Ditolak";
  if (value === "pending") return "Menunggu";
  return value || "Belum ada";
}

export function bookingStatusLabel(value?: string | null) {
  if (value === "pending_security") return "Menunggu jaminan pembayaran";
  if (value === "secured") return "Booking terjamin";
  if (value === "pre_show") return "Persiapan sebelum tampil";
  if (value === "incident") return "Ada insiden";
  if (value === "completed") return "Selesai";
  if (value === "cancelled") return "Dibatalkan";
  return value || "Belum ada";
}

export function freshnessLabelId(value?: string | null) {
  if (value === "fresh") return "Terkini";
  if (value === "needs_confirmation") return "Perlu konfirmasi";
  if (value === "stale") return "Perlu diperbarui";
  return "Belum pernah diperbarui";
}
