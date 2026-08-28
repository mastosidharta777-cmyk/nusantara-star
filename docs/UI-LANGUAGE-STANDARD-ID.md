# Standar Bahasa UI Nusantara Star

## Prinsip

- Bahasa Indonesia adalah bahasa utama untuk seluruh antarmuka internal, admin, talent, dan manajer.
- Halaman publik `/id` menggunakan Bahasa Indonesia secara konsisten; halaman `/en` menggunakan Bahasa Inggris secara konsisten.
- Nama field database, enum, API, dan kode internal boleh tetap Bahasa Inggris dan tidak boleh diterjemahkan jika dapat mengganggu integrasi.
- Istilah industri yang umum dan lebih natural boleh dipertahankan, terutama: rider, showreel, soundcheck, backline, brief, booking, DJ, MC, fee.
- Istilah umum yang memiliki padanan Indonesia yang jelas harus diterjemahkan pada UI.

## Istilah baku UI Indonesia

buyer = klien
manager = manajer
availability = ketersediaan
commercial offer = penawaran komersial
payment terms = ketentuan pembayaran
financial security = jaminan pembayaran
deal = kesepakatan
deal review = tinjauan kesepakatan
settlement = penyelesaian pembayaran
crew = kru
performer = penampil
baggage = bagasi
technical requirements = kebutuhan teknis
hospitality = konsumsi dan hospitality
review = tinjau / peninjauan
approved = disetujui
rejected = ditolak
pending = menunggu
confirmed = terkonfirmasi
tentative = sementara
unavailable = tidak tersedia
included = termasuk
excluded = tidak termasuk
exception = pengecualian
secure link = tautan aman
draft = draf
upload = unggah
preview = pratinjau

## Validasi sebelum deployment

Periksa setiap halaman dan komponen untuk judul, label form, opsi select, tombol, status, helper text, empty state, pesan sukses, pesan error, tooltip/aria-label, dan teks yang berasal dari enum. Jangan menampilkan enum mentah ke pengguna bila tersedia label manusiawi.
