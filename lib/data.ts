export type Talent = { id: number; name: string; category: string; categoryId: string; genre: string; city: string; budget: string; image: string; featured?: boolean };

export const talents: Talent[] = [
  { id: 1, name: "Nara & The Coast", category: "Band", categoryId: "band", genre: "Indie pop", city: "Jakarta", budget: "50–100 jt", image: "https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?auto=format&fit=crop&w=1200&q=85", featured: true },
  { id: 2, name: "Alya Prameswari", category: "Penyanyi", categoryId: "singer", genre: "Pop soul", city: "Bandung", budget: "25–50 jt", image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1200&q=85", featured: true },
  { id: 3, name: "Raka Mahendra", category: "MC", categoryId: "mc", genre: "Corporate", city: "Jakarta", budget: "10–25 jt", image: "https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?auto=format&fit=crop&w=1200&q=85", featured: true },
  { id: 4, name: "Svara Nusantara", category: "Traditional", categoryId: "traditional", genre: "Ethnic contemporary", city: "Yogyakarta", budget: "25–50 jt", image: "https://images.unsplash.com/photo-1519683109079-d5f539e1542f?auto=format&fit=crop&w=1200&q=85" },
  { id: 5, name: "Dimas Aruna", category: "DJ", categoryId: "dj", genre: "House", city: "Bali", budget: "25–50 jt", image: "https://images.unsplash.com/photo-1571266028243-d220c9c3b2d2?auto=format&fit=crop&w=1200&q=85" },
  { id: 6, name: "Maya Santoso", category: "Speaker", categoryId: "speaker", genre: "Leadership", city: "Surabaya", budget: "10–25 jt", image: "https://images.unsplash.com/photo-1560523159-4a9692d222ef?auto=format&fit=crop&w=1200&q=85" },
  { id: 7, name: "The Blue Hours", category: "Band", categoryId: "band", genre: "Jazz", city: "Bandung", budget: "50–100 jt", image: "https://images.unsplash.com/photo-1511192336575-5a79af67a629?auto=format&fit=crop&w=1200&q=85" },
  { id: 8, name: "Keisha Lazuardi", category: "Penyanyi", categoryId: "singer", genre: "R&B", city: "Jakarta", budget: "100 jt+", image: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1200&q=85" },
];

export const categories = [
  { id: "singer", labelId: "Penyanyi", labelEn: "Singers", count: 24 },
  { id: "band", labelId: "Band", labelEn: "Bands", count: 18 },
  { id: "mc", labelId: "MC & Host", labelEn: "MCs & Hosts", count: 15 },
  { id: "dj", labelId: "DJ", labelEn: "DJs", count: 12 },
  { id: "traditional", labelId: "Seni Tradisional", labelEn: "Traditional Arts", count: 16 },
  { id: "speaker", labelId: "Speaker", labelEn: "Speakers", count: 9 },
];
