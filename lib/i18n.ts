export const locales = ["id", "en"] as const;
export type Locale = (typeof locales)[number];

export function isLocale(value: string): value is Locale { return locales.includes(value as Locale); }

export const copy = {
  id: {
    nav: { talents: "Talent", process: "Cara kerja", business: "Cari talent", brief: "Mulai pencarian" },
    hero: { eyebrow: "Curated Talent & Entertainment Agency", title: "Talent yang tepat untuk setiap acara.", body: "Kami menghubungkan brand, perusahaan, dan event organizer dengan talent pilihan dari Indonesia—secara terkurasi, profesional, dan tepat sasaran.", cta: "Temukan talent", secondary: "Ceritakan acara Anda" },
    categories: { eyebrow: "Pilihan yang terkurasi", title: "Setiap panggung membutuhkan energi yang berbeda.", body: "Jelajahi roster pilihan kami berdasarkan format acara dan suasana yang ingin Anda ciptakan." },
    featured: { eyebrow: "Featured roster", title: "Talent pilihan bulan ini", all: "Lihat semua talent" },
    process: { eyebrow: "Cara kerja", title: "Sederhana dari pencarian hingga panggung.", steps: [["01", "Ceritakan kebutuhan", "Isi tanggal, kota, jenis acara, kategori/style, dan kisaran anggaran."], ["02", "Lihat rekomendasi", "Sistem menampilkan kandidat yang paling relevan. Ketersediaan dan penawaran tetap dikonfirmasi."], ["03", "Konfirmasi & booking", "Nusantara Star mengonfirmasi talent/manager, ketentuan acara, penawaran, lalu proses booking."]] },
    business: { eyebrow: "Cari talent", title: "Satu kebutuhan. Talent yang tepat.", body: "Masukkan kebutuhan acara dan lihat kandidat yang relevan secara langsung. Availability, fee acara, rider, dan ketentuan final tetap dikonfirmasi sebelum booking.", points: ["Rekomendasi langsung", "Konfirmasi manager", "Satu alur sampai booking"] },
    final: { title: "Temukan talent untuk acara Anda.", body: "Mulai pencarian dan lihat kandidat yang sesuai dengan kebutuhan acara Anda.", cta: "Mulai pencarian" },
    directory: { eyebrow: "Talent directory", title: "Temukan suara, wajah, dan energi yang tepat.", body: "Roster pilihan untuk acara perusahaan, festival, private event, brand activation, dan panggung lainnya.", count: "talent", filters: "Filter", clear: "Hapus filter", noResults: "Belum ada talent yang cocok dengan filter ini." },
    brief: { eyebrow: "Cari talent", title: "Ceritakan kebutuhan acara Anda.", body: "Isi detail utama acara. Sistem akan langsung menampilkan kandidat yang relevan dari roster nyata yang memenuhi eligibility matching.", contact: "Informasi kontak", event: "Detail acara", talent: "Kebutuhan talent", submit: "Temukan talent", note: "Rekomendasi awal bukan konfirmasi availability atau booking. Nusantara Star akan melakukan live confirmation dengan talent/manager sebelum penawaran final.", success: "Rekomendasi awal untuk acara Anda" },
  },
  en: {
    nav: { talents: "Talent", process: "How it works", business: "Find talent", brief: "Start search" },
    hero: { eyebrow: "Curated Talent & Entertainment Agency", title: "The right talent for every event.", body: "We connect brands, companies, and event organizers with selected Indonesian talent—curated with care and managed professionally.", cta: "Discover talent", secondary: "Tell us about your event" },
    categories: { eyebrow: "A considered selection", title: "Every stage calls for a different energy.", body: "Explore our selected roster by event format and the atmosphere you want to create." },
    featured: { eyebrow: "Featured roster", title: "This month’s selected talent", all: "View all talent" },
    process: { eyebrow: "How it works", title: "Simple, from search to stage.", steps: [["01", "Share your needs", "Enter the date, city, event type, category/style, and budget range."], ["02", "See recommendations", "The system shows relevant candidates. Availability and offers still require confirmation."], ["03", "Confirm & book", "Nusantara Star confirms the talent/manager, event terms and offer before booking."]] },
    business: { eyebrow: "Find talent", title: "One need. The right talent.", body: "Enter your event requirements and see relevant candidates immediately. Availability, event fee, rider and final terms are confirmed before booking.", points: ["Immediate recommendations", "Manager confirmation", "One flow through booking"] },
    final: { title: "Find talent for your event.", body: "Start a search and see candidates relevant to your event needs.", cta: "Start search" },
    directory: { eyebrow: "Talent directory", title: "Find the right voice, presence, and energy.", body: "Selected talent for corporate events, festivals, private events, brand activations, and beyond.", count: "talents", filters: "Filters", clear: "Clear filters", noResults: "No talent matches these filters yet." },
    brief: { eyebrow: "Find talent", title: "Tell us what your event needs.", body: "Share the key event details. The system will immediately show relevant candidates from the real roster that pass matching eligibility.", contact: "Contact information", event: "Event details", talent: "Talent requirements", submit: "Find talent", note: "Initial recommendations are not availability confirmations or bookings. Nusantara Star performs live confirmation with the talent/manager before a final offer.", success: "Initial recommendations for your event" },
  },
} as const;
