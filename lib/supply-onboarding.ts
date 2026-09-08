export const SUPPLY_TYPES = ["talent", "professional", "production_partner"] as const;

export type SupplyType = (typeof SUPPLY_TYPES)[number];

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
    "Photographer",
    "Videographer / Editor",
    "Choreographer",
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
