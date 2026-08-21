export const locales = ["id", "en"] as const;
export type Locale = (typeof locales)[number];

export function isLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}

export const copy = {
  id: {
    nav: { talents: "Talent", process: "Cara kerja", business: "Untuk bisnis", brief: "Kirim brief" },
    hero: { eyebrow: "Curated Talent & Entertainment Agency", title: "Talent yang tepat untuk setiap acara.", body: "Kami menghubungkan brand, perusahaan, dan event organizer dengan talent pilihan dari Indonesia—secara terkurasi, profesional, dan tepat sasaran.", cta: "Temukan talent", secondary: "Ceritakan acara Anda" },
    categories: { eyebrow: "Pilihan yang terkurasi", title: "Setiap panggung membutuhkan energi yang berbeda.", body: "Jelajahi roster pilihan kami berdasarkan format acara dan suasana yang ingin Anda ciptakan." },
    featured: { eyebrow: "Featured roster", title: "Talent pilihan bulan ini", all: "Lihat semua talent" },
    process: { eyebrow: "Cara kerja", title: "Sederhana dari brief hingga panggung.", steps: [["01", "Kirim brief", "Ceritakan kebutuhan, audiens, lokasi, dan anggaran acara Anda."], ["02", "Terima shortlist", "Tim kami menyeleksi talent yang paling relevan untuk tujuan Anda."], ["03", "Konfirmasi & tampil", "Kami membantu koordinasi detail hingga talent siap tampil."]] },
    business: { eyebrow: "Untuk bisnis", title: "Satu brief. Talent yang tepat.", body: "Tidak perlu menghubungi banyak pihak. Dapatkan shortlist yang dikurasi, kejelasan anggaran, dan satu tim yang mengawal seluruh proses.", points: ["Shortlist sesuai kebutuhan", "Koordinasi profesional", "Talent lokal & nasional"] },
    final: { title: "Mari ciptakan acara yang diingat.", body: "Kirim brief Anda. Tim Nusantara Star akan kembali dengan rekomendasi yang tepat.", cta: "Mulai event brief" },
    directory: { eyebrow: "Talent directory", title: "Temukan suara, wajah, dan energi yang tepat.", body: "Roster pilihan untuk acara perusahaan, festival, private event, brand activation, dan panggung lainnya.", count: "talent", filters: "Filter", clear: "Hapus filter", noResults: "Belum ada talent yang cocok dengan filter ini." },
    brief: { eyebrow: "Event brief", title: "Ceritakan acara Anda.", body: "Semakin lengkap detail yang Anda bagikan, semakin tepat rekomendasi talent dari tim kami.", contact: "Informasi kontak", event: "Detail acara", talent: "Kebutuhan talent", submit: "Kirim event brief", note: "Tim kami akan menghubungi Anda maksimal 1 hari kerja.", success: "Brief diterima. Tim kami akan segera menghubungi Anda." },
  },
  en: {
    nav: { talents: "Talent", process: "How it works", business: "For business", brief: "Send a brief" },
    hero: { eyebrow: "Curated Talent & Entertainment Agency", title: "The right talent for every event.", body: "We connect brands, companies, and event organizers with selected Indonesian talent—curated with care and managed professionally.", cta: "Discover talent", secondary: "Tell us about your event" },
    categories: { eyebrow: "A considered selection", title: "Every stage calls for a different energy.", body: "Explore our selected roster by event format and the atmosphere you want to create." },
    featured: { eyebrow: "Featured roster", title: "This month’s selected talent", all: "View all talent" },
    process: { eyebrow: "How it works", title: "Simple, from brief to stage.", steps: [["01", "Send your brief", "Share your event, audience, location, and budget with us."], ["02", "Receive a shortlist", "Our team selects talent best suited to your objectives."], ["03", "Confirm & perform", "We coordinate the details until your talent is ready for the stage."]] },
    business: { eyebrow: "For business", title: "One brief. The right talent.", body: "Skip the endless outreach. Get a curated shortlist, budget clarity, and one team managing the process end to end.", points: ["Relevant shortlists", "Professional coordination", "Local & national talent"] },
    final: { title: "Let’s create an event worth remembering.", body: "Send your brief. The Nusantara Star team will return with a considered recommendation.", cta: "Start your event brief" },
    directory: { eyebrow: "Talent directory", title: "Find the right voice, presence, and energy.", body: "Selected talent for corporate events, festivals, private events, brand activations, and beyond.", count: "talents", filters: "Filters", clear: "Clear filters", noResults: "No talent matches these filters yet." },
    brief: { eyebrow: "Event brief", title: "Tell us about your event.", body: "The more detail you share, the more precise our team’s talent recommendation can be.", contact: "Contact information", event: "Event details", talent: "Talent requirements", submit: "Send event brief", note: "Our team will contact you within one business day.", success: "Brief received. Our team will be in touch shortly." },
  },
} as const;
