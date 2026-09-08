export const SUPPLY_TYPES = ["talent", "professional", "production_partner"] as const;

export type SupplyType = (typeof SUPPLY_TYPES)[number];
export type NonTalentSupplyType = Exclude<SupplyType, "talent">;

export const SUPPLY_TYPE_LABELS: Record<SupplyType, string> = {
  talent: "Talent",
  professional: "Professional",
  production_partner: "Production Partner",
};

export const SUPPLY_CATEGORIES: Record<SupplyType, readonly string[]> = {
  talent: [
    "Solo",
    "Duo/Trio",
    "Band",
    "DJ",
    "MC/Host",
    "Speaker",
    "Traditional/Ethnic",
    "Specialty Performer",
  ],
  professional: [
    "Music Director",
    "Music Producer / Arranger",
    "Session Musician",
    "FOH / Monitor Engineer",
    "Stage Manager",
    "Production Manager",
    "Show Director",
    "Photographer",
    "Videographer / Editor",
    "Choreographer",
    "Lighting Designer",
  ],
  production_partner: [
    "Sound System",
    "Lighting",
    "Stage / Rigging",
    "LED / Multimedia",
    "Backline",
    "Event Production",
    "Technical Crew",
    "Equipment Rental",
    "Power / Genset",
    "Transport / Logistics",
    "Event Equipment",
  ],
};

export type SupplyDetailField = {
  key: string;
  label: string;
  placeholder?: string;
  kind?: "text" | "textarea";
  required?: boolean;
};

const PROFESSIONAL_FIELDS: Record<string, readonly SupplyDetailField[]> = {
  "Music Director": [
    { key: "musicalScope", label: "Lingkup musikal utama", placeholder: "Contoh: pop orchestra, band, acoustic set", required: true },
    { key: "ensembleScale", label: "Skala ensemble yang biasa ditangani", placeholder: "Contoh: 4–20 musisi" },
    { key: "rehearsalCapability", label: "Kapabilitas rehearsal / preparation", placeholder: "Contoh: chart, cue, rehearsal planning" },
  ],
  "Music Producer / Arranger": [
    { key: "productionStyles", label: "Gaya produksi / aransemen utama", required: true },
    { key: "dawTools", label: "DAW / tools utama", placeholder: "Contoh: Pro Tools, Logic, Ableton" },
    { key: "remoteCapability", label: "Kapabilitas kerja remote", placeholder: "Contoh: stem exchange, remote review" },
  ],
  "Session Musician": [
    { key: "instruments", label: "Instrumen utama", required: true },
    { key: "readingSkills", label: "Kemampuan membaca chart / notasi", placeholder: "Contoh: chord chart, number system, notation" },
    { key: "remoteRecording", label: "Kapabilitas remote recording", placeholder: "Studio sendiri / remote stem / tidak tersedia" },
  ],
  "FOH / Monitor Engineer": [
    { key: "consoleExperience", label: "Console yang dikuasai", required: true },
    { key: "systemExperience", label: "Sistem audio yang biasa ditangani", placeholder: "Contoh: line array, IEM, festival patch" },
    { key: "showScale", label: "Skala show yang biasa ditangani", placeholder: "Contoh: club, ballroom, festival" },
  ],
  "Stage Manager": [
    { key: "productionScale", label: "Skala produksi yang biasa ditangani", required: true },
    { key: "cueingSystems", label: "Sistem cue / rundown yang biasa digunakan" },
    { key: "crewCoordination", label: "Lingkup koordinasi kru", placeholder: "Contoh: stage crew, artist liaison, changeover" },
  ],
  "Production Manager": [
    { key: "projectScale", label: "Skala proyek yang biasa ditangani", required: true },
    { key: "productionScope", label: "Lingkup produksi", placeholder: "Contoh: technical, vendor, schedule, venue" },
    { key: "teamCapacity", label: "Ukuran tim yang biasa dikoordinasikan" },
  ],
  "Show Director": [
    { key: "showFormats", label: "Format show utama", required: true },
    { key: "creativeScope", label: "Lingkup creative/show direction", placeholder: "Contoh: cue, staging, visual, performance flow" },
    { key: "teamCoordination", label: "Tim yang biasa dikoordinasikan" },
  ],
  Photographer: [
    { key: "photographySpecialties", label: "Spesialisasi fotografi", placeholder: "Contoh: concert, corporate, backstage", required: true },
    { key: "equipmentSummary", label: "Ringkasan equipment utama", kind: "textarea" },
    { key: "deliveryCapability", label: "Output / delivery", placeholder: "Contoh: same-day selects, edited gallery" },
  ],
  "Videographer / Editor": [
    { key: "productionSpecialties", label: "Spesialisasi video", placeholder: "Contoh: multicam, aftermovie, vertical content", required: true },
    { key: "cameraEditingTools", label: "Camera / editing tools utama", kind: "textarea" },
    { key: "deliverables", label: "Output / deliverables yang biasa dikerjakan" },
  ],
  Choreographer: [
    { key: "danceStyles", label: "Gaya tari / movement utama", required: true },
    { key: "castScale", label: "Skala cast yang biasa ditangani" },
    { key: "rehearsalCapability", label: "Kapabilitas rehearsal / staging" },
  ],
  "Lighting Designer": [
    { key: "lightingSystems", label: "Sistem / tipe lighting yang dikuasai", required: true },
    { key: "consoleSoftware", label: "Console / software utama" },
    { key: "showScale", label: "Skala show yang biasa ditangani" },
  ],
};

const PARTNER_COMMON: readonly SupplyDetailField[] = [
  { key: "legalBusinessName", label: "Nama legal perusahaan / pemilik usaha", required: true },
  { key: "businessType", label: "Bentuk usaha", placeholder: "Contoh: PT, CV, usaha perorangan" },
  { key: "yearsOperating", label: "Lama beroperasi", placeholder: "Contoh: 7 tahun" },
  { key: "ownershipModel", label: "Model kepemilikan aset", placeholder: "Owned / mixed / partner network" },
];

const PARTNER_FIELDS: Record<string, readonly SupplyDetailField[]> = {
  "Sound System": [
    { key: "inventorySummary", label: "Ringkasan inventory audio", kind: "textarea", required: true },
    { key: "capacityScale", label: "Kapasitas / skala layanan", placeholder: "Contoh: ballroom 1.000 pax, outdoor 3.000 pax" },
    { key: "consoleSystems", label: "Console / system utama" },
  ],
  Lighting: [
    { key: "inventorySummary", label: "Ringkasan inventory lighting", kind: "textarea", required: true },
    { key: "consoleSystems", label: "Console / control system utama" },
    { key: "capacityScale", label: "Skala produksi yang biasa ditangani" },
  ],
  "Stage / Rigging": [
    { key: "inventorySummary", label: "Ringkasan stage / rigging inventory", kind: "textarea", required: true },
    { key: "stageRiggingCapacity", label: "Kapasitas stage / rigging" },
    { key: "safetyCertification", label: "Sertifikasi / prosedur keselamatan yang relevan" },
  ],
  "LED / Multimedia": [
    { key: "inventorySummary", label: "Ringkasan inventory LED / multimedia", kind: "textarea", required: true },
    { key: "processorSystems", label: "Processor / playback system utama" },
    { key: "capacityScale", label: "Ukuran / skala sistem yang biasa disediakan" },
  ],
  Backline: [
    { key: "inventorySummary", label: "Ringkasan inventory backline", kind: "textarea", required: true },
    { key: "brandsInstruments", label: "Brand / instrumen utama" },
    { key: "deliverySetup", label: "Kapabilitas delivery / setup" },
  ],
  "Event Production": [
    { key: "productionScope", label: "Lingkup jasa produksi", kind: "textarea", required: true },
    { key: "crewCapacity", label: "Kapasitas kru internal / network" },
    { key: "projectScale", label: "Skala proyek yang biasa ditangani" },
  ],
  "Technical Crew": [
    { key: "crewDisciplines", label: "Jenis kru yang tersedia", placeholder: "Contoh: audio, lighting, stagehand, rigger", required: true },
    { key: "crewCapacity", label: "Jumlah kru yang dapat disediakan" },
    { key: "certifications", label: "Sertifikasi / kompetensi khusus" },
  ],
  "Equipment Rental": [
    { key: "inventorySummary", label: "Ringkasan inventory rental", kind: "textarea", required: true },
    { key: "deliverySetup", label: "Delivery / setup support" },
    { key: "serviceTerms", label: "Model layanan", placeholder: "Dry hire / dengan operator / paket" },
  ],
  "Power / Genset": [
    { key: "inventorySummary", label: "Ringkasan genset / power inventory", kind: "textarea", required: true },
    { key: "powerCapacity", label: "Rentang kapasitas daya" },
    { key: "safetyCertification", label: "Sertifikasi / prosedur keselamatan yang relevan" },
  ],
  "Transport / Logistics": [
    { key: "fleetCapacity", label: "Armada / kapasitas logistik", kind: "textarea", required: true },
    { key: "serviceScope", label: "Lingkup layanan", placeholder: "Artist transport / equipment / trucking" },
    { key: "permitsInsurance", label: "Perizinan / asuransi yang relevan" },
  ],
  "Event Equipment": [
    { key: "inventorySummary", label: "Ringkasan equipment event", kind: "textarea", required: true },
    { key: "capacityScale", label: "Kapasitas / skala inventory" },
    { key: "deliverySetup", label: "Delivery / setup support" },
  ],
};

export function isSupplyType(value: unknown): value is SupplyType {
  return typeof value === "string" && (SUPPLY_TYPES as readonly string[]).includes(value);
}

export function categoryAllowedForSupply(supplyType: SupplyType, category: unknown) {
  return typeof category === "string" && SUPPLY_CATEGORIES[supplyType].includes(category.trim());
}

export function supplyTypeLabel(value: string | null | undefined) {
  return isSupplyType(value) ? SUPPLY_TYPE_LABELS[value] : "Supply";
}

export function supplyDetailFields(supplyType: NonTalentSupplyType, category: string): readonly SupplyDetailField[] {
  if (supplyType === "professional") return PROFESSIONAL_FIELDS[category] ?? [];
  return [...PARTNER_COMMON, ...(PARTNER_FIELDS[category] ?? [])];
}

export function sanitizeSupplyDetails(supplyType: NonTalentSupplyType, category: string, value: unknown) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const result: Record<string, string> = {};
  for (const field of supplyDetailFields(supplyType, category)) {
    const raw = source[field.key];
    if (typeof raw !== "string") continue;
    const clean = raw.trim().slice(0, field.kind === "textarea" ? 4000 : 1000);
    if (clean) result[field.key] = clean;
  }
  return result;
}

export function missingRequiredSupplyDetails(supplyType: NonTalentSupplyType, category: string, value: unknown) {
  const details = sanitizeSupplyDetails(supplyType, category, value);
  return supplyDetailFields(supplyType, category)
    .filter((field) => field.required && !details[field.key])
    .map((field) => field.label);
}
