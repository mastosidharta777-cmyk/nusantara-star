export const locales = ["id", "en"] as const;
export type Locale = (typeof locales)[number];

export function isLocale(value: string): value is Locale { return locales.includes(value as Locale); }

export const copy = {
  id: {
    nav: { talents: "Talent", process: "Cara kerja", business: "Cari talent", brief: "Mulai pencarian" },
    hero: { eyebrow: "Curated Talent & Entertainment Agency", title: "Talent yang tepat untuk setiap acara.", body: "Kami menghubungkan brand, perusahaan, dan event organizer dengan talent pilihan dari Indonesia—secara terkurasi, profesional, dan tepat sasaran.", cta: "Temukan talent", secondary: "Ceritakan acara Anda" },
    categories: { eyebrow: "Pilihan yang terkurasi", title: "Setiap panggung membutuhkan energi yang berbeda.", body: "Jelajahi roster pilihan kami berdasarkan format acara dan suasana yang ingin Anda ciptakan." },
    featured: { eyebrow: "Featured roster", title: "Talent pilihan bulan ini", all: "Lihat semua talent" },
    process: { eyebrow: "Cara kerja", title: "Sederhana dari pencarian hingga panggung.", steps: [["01", "Ceritakan kebutuhan", "Isi tanggal, kota, jenis acara, kategori/style, dan kisaran anggaran."], ["02", "Kami kurasi pilihan", "Nusantara Star meninjau brief, memilih kandidat yang sesuai, lalu mengonfirmasi ketersediaan dan penawaran dengan talent/manager."], ["03", "Pilih & booking", "Setelah kandidat terkonfirmasi, Anda menerima pilihan terkurasi untuk dilanjutkan ke kesepakatan dan booking."]] },
    business: { eyebrow: "Cari talent", title: "Satu kebutuhan. Talent yang tepat.", body: "Kirim kebutuhan acara Anda. Nusantara Star menyeleksi kandidat yang sesuai dan melakukan konfirmasi langsung mengenai availability, fee acara, rider, dan ketentuan sebelum pilihan dikirim kepada Anda.", points: ["Kurasi kandidat", "Konfirmasi manager", "Satu alur sampai booking"] },
    final: { title: "Temukan talent untuk acara Anda.", body: "Kirim kebutuhan acara Anda dan biarkan tim Nusantara Star menyiapkan pilihan talent yang sudah dikurasi dan dikonfirmasi.", cta: "Mulai pencarian" },
    directory: { eyebrow: "Talent directory", title: "Temukan suara, wajah, dan energi yang tepat.", body: "Roster pilihan untuk acara perusahaan, festival, private event, brand activation, dan panggung lainnya.", count: "talent", filters: "Filter", clear: "Hapus filter", noResults: "Belum ada talent yang cocok dengan filter ini." },
    brief: { eyebrow: "Cari talent", title: "Ceritakan kebutuhan acara Anda.", body: "Isi detail utama acara. Nusantara Star akan meninjau brief, memilih kandidat yang sesuai, lalu mengonfirmasi ketersediaan dan penawaran sebelum mengirim pilihan kepada Anda.", contact: "Informasi kontak", event: "Detail acara", talent: "Kebutuhan talent", submit: "Kirim brief", note: "Belum ada talent yang dikonfirmasi atau dibooking pada tahap ini. Pilihan talent akan dikirim setelah proses kurasi dan konfirmasi langsung.", success: "Brief Anda sudah diterima" },
  },
  en: {
    nav: { talents: "Talent", process: "How it works", business: "Find talent", brief: "Start search" },
    hero: { eyebrow: "Curated Talent & Entertainment Agency", title: "The right talent for every event.", body: "We connect brands, companies, and event organizers with selected Indonesian talent—curated with care and managed professionally.", cta: "Discover talent", secondary: "Tell us about your event" },
    categories: { eyebrow: "A considered selection", title: "Every stage calls for a different energy.", body: "Explore our selected roster by event format and the atmosphere you want to create." },
    featured: { eyebrow: "Featured roster", title: "This month’s selected talent", all: "View all talent" },
    process: { eyebrow: "How it works", title: "Simple, from search to stage.", steps: [["01", "Share your needs", "Enter the date, city, event type, category/style, and budget range."], ["02", "We curate the options", "Nusantara Star reviews the brief, selects suitable candidates, then confirms availability and offers with the talent/manager."], ["03", "Choose & book", "Once candidates are confirmed, you receive a curated set of options to move forward to agreement and booking."]] },
    business: { eyebrow: "Find talent", title: "One need. The right talent.", body: "Send us your event requirements. Nusantara Star selects suitable candidates and confirms availability, event-specific fees, rider requirements and terms before sending options to you.", points: ["Curated candidates", "Manager confirmation", "One flow through booking"] },
    final: { title: "Find talent for your event.", body: "Send your event requirements and let Nusantara Star prepare a curated, confirmed set of talent options.", cta: "Start search" },
    directory: { eyebrow: "Talent directory", title: "Find the right voice, presence, and energy.", body: "Selected talent for corporate events, festivals, private events, brand activations, and beyond.", count: "talents", filters: "Filters", clear: "Clear filters", noResults: "No talent matches these filters yet." },
    brief: { eyebrow: "Find talent", title: "Tell us what your event needs.", body: "Share the key event details. Nusantara Star will review the brief, select suitable candidates, then confirm availability and offers before sending options to you.", contact: "Contact information", event: "Event details", talent: "Talent requirements", submit: "Send brief", note: "No talent is confirmed or booked at this stage. Talent options are shared only after curation and direct confirmation.", success: "Your brief has been received" },
  },
} as const;
