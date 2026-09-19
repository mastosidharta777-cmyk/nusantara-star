# Professional & Production Partner Engagement V1

## Tujuan

Mengubah profil Professional dan Production Partner yang sudah diverifikasi menjadi pekerjaan yang dapat dijalankan dan diaudit, tanpa memasukkan mereka ke flow booking Talent.

## Flow

1. Admin membuka profil supply yang sudah `verified` dan onboarding `approved`.
2. Admin membuat Work Order berisi layanan, proyek/tanggal/lokasi, scope, deliverables, fee, dan termin pembayaran.
3. Sistem menyimpan snapshot komersial dan membuat secure link.
4. Professional / Production Partner memilih `confirm` atau `decline`; alasan wajib jika decline.
5. Perubahan status tercatat di `supply_engagements`.

## Batas V1

- Talent tetap memakai `bookings`; tidak digabung ke tabel ini.
- Satu Work Order hanya boleh memakai layanan yang terdaftar pada profil supply.
- AI tidak boleh mengubah scope, deliverables, fee, termin, atau status persetujuan.
- Belum ada auto-send WhatsApp/provider messaging. Admin memicu pengiriman agar tidak terjadi spam atau komitmen eksternal tanpa kontrol.
- Completion, incident/additional cost, invoice, settlement, dan Operations Inbox lintas supply adalah fase berikutnya.

## Database

Jalankan `supabase-supply-engagement-v1.sql` setelah `supabase-supply-services-multivalue-v1.sql`. UI mendeteksi jika tabel belum tersedia dan mengunci pembuatan Work Order supaya tidak ada fallback manual yang tidak tercatat.
