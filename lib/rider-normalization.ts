import "server-only";
import { createHash } from "node:crypto";

type Question = { key: string; question: string; required: boolean };

export type NormalizedRider = {
  party_size: number | null;
  performers_count: number | null;
  crew_count: number | null;
  departure_city: string | null;
  technical_requirements: string[];
  stage_backline: string[];
  hospitality: string[];
  transport_requirements: string[];
  baggage_requirements: string[];
  accommodation_required: boolean | null;
  accommodation_requirements: string[];
  meals_per_diem: string[];
  special_requirements: string[];
  notes: string[];
};

export function riderHash(source: string) {
  return createHash("sha256").update(source).digest("hex");
}

function cleanArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, 40);
}
function toNullableInt(value: unknown) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 200 ? n : null;
}
function normalizeShape(value: any): NormalizedRider {
  return {
    party_size: toNullableInt(value?.party_size), performers_count: toNullableInt(value?.performers_count), crew_count: toNullableInt(value?.crew_count),
    departure_city: typeof value?.departure_city === "string" && value.departure_city.trim() ? value.departure_city.trim() : null,
    technical_requirements: cleanArray(value?.technical_requirements), stage_backline: cleanArray(value?.stage_backline), hospitality: cleanArray(value?.hospitality),
    transport_requirements: cleanArray(value?.transport_requirements), baggage_requirements: cleanArray(value?.baggage_requirements),
    accommodation_required: typeof value?.accommodation_required === "boolean" ? value.accommodation_required : null,
    accommodation_requirements: cleanArray(value?.accommodation_requirements), meals_per_diem: cleanArray(value?.meals_per_diem), special_requirements: cleanArray(value?.special_requirements), notes: cleanArray(value?.notes),
  };
}

export function buildMissingQuestions(rider: NormalizedRider, baseCity?: string | null): Question[] {
  const questions: Question[] = [];
  if (rider.party_size == null && rider.performers_count == null && rider.crew_count == null) questions.push({ key: "party_size", question: "Berapa total personel yang biasanya berangkat untuk show (talent + crew)?", required: true });
  if (!rider.departure_city) questions.push({ key: "departure_city", question: baseCity ? `Apakah kota keberangkatan default rombongan adalah ${baseCity}? Jika berbeda, tulis kotanya.` : "Dari kota mana rombongan biasanya berangkat untuk show?", required: true });
  if (!rider.technical_requirements.length && !rider.stage_backline.length) questions.push({ key: "technical_basics", question: "Apakah ada kebutuhan technical/backline yang wajib? Jika tidak ada, jawab: Tidak ada.", required: true });
  if (rider.accommodation_required == null) questions.push({ key: "accommodation_required", question: "Untuk show di luar kota, apakah rombongan membutuhkan hotel/akomodasi? Jawab Ya atau Tidak, lalu beri detail jika ada.", required: true });
  if (!rider.transport_requirements.length && !rider.baggage_requirements.length) questions.push({ key: "transport_baggage", question: "Apakah ada kebutuhan transport atau baggage alat khusus? Jika tidak ada, jawab: Tidak ada.", required: true });
  return questions;
}

const schema = { type: "object", additionalProperties: false, properties: {
  party_size:{type:["integer","null"]}, performers_count:{type:["integer","null"]}, crew_count:{type:["integer","null"]}, departure_city:{type:["string","null"]},
  technical_requirements:{type:"array",items:{type:"string"}}, stage_backline:{type:"array",items:{type:"string"}}, hospitality:{type:"array",items:{type:"string"}}, transport_requirements:{type:"array",items:{type:"string"}}, baggage_requirements:{type:"array",items:{type:"string"}}, accommodation_required:{type:["boolean","null"]}, accommodation_requirements:{type:"array",items:{type:"string"}}, meals_per_diem:{type:"array",items:{type:"string"}}, special_requirements:{type:"array",items:{type:"string"}}, notes:{type:"array",items:{type:"string"}}
}, required:["party_size","performers_count","crew_count","departure_city","technical_requirements","stage_backline","hospitality","transport_requirements","baggage_requirements","accommodation_required","accommodation_requirements","meals_per_diem","special_requirements","notes"] };

export async function normalizeRiderSource(input: { sourceText: string; talentName?: string | null; baseCity?: string | null; answers?: Record<string, string> | null }) {
  const sourceText = input.sourceText.trim().slice(0, 50000);
  const fallback = normalizeShape({});
  if (!sourceText) return { normalized: fallback, questions: buildMissingQuestions(fallback, input.baseCity), source: "rules" as const };
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { normalized: fallback, questions: buildMissingQuestions(fallback, input.baseCity), source: "rules" as const };
  const context = { talentName: input.talentName ?? null, baseCity: input.baseCity ?? null, riderSource: sourceText, confirmedAnswers: input.answers ?? {} };
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", { method:"POST", headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"}, body:JSON.stringify({ model:process.env.GROQ_MODEL??"openai/gpt-oss-20b", temperature:0, messages:[{role:"system",content:"Normalize a live-entertainment artist master rider into structured operational facts. Use ONLY facts explicitly contained in the rider source or confirmed artist answers. Never invent, assume, soften, strengthen, or delete requirements. Preserve quantities, hotel standards, equipment models, crew counts, transport/baggage conditions, hospitality and special requirements exactly when stated. Unknown values must remain null or empty arrays. Return concise Indonesian operational wording while preserving product/model names and technical terms."},{role:"user",content:JSON.stringify(context)}], response_format:{type:"json_schema",json_schema:{name:"nusantara_star_master_rider",strict:true,schema}} }), cache:"no-store" });
    if (!response.ok) throw new Error(`Groq request failed: ${response.status}`);
    const payload=await response.json(); const raw=payload?.choices?.[0]?.message?.content; if(typeof raw!=="string"||!raw)throw new Error("No rider normalization returned");
    const normalized=normalizeShape(JSON.parse(raw));
    return { normalized, questions: buildMissingQuestions(normalized,input.baseCity), source:"ai" as const };
  } catch(error){ console.error("Rider normalization failed",error); return {normalized:fallback,questions:buildMissingQuestions(fallback,input.baseCity),source:"rules" as const}; }
}

export async function extractRiderText(buffer: Buffer, mimeType: string) {
  if (mimeType === "text/plain") return buffer.toString("utf8");
  if (mimeType === "application/pdf") { const mod:any=await import("pdf-parse"); const parse=mod.default??mod; const result=await parse(buffer); return typeof result?.text==="string"?result.text:""; }
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") { const mammoth:any=await import("mammoth"); const result=await mammoth.extractRawText({buffer}); return typeof result?.value==="string"?result.value:""; }
  throw new Error("Unsupported rider document type");
}

export async function persistRiderVersion(supabase:any,input:{talentId:string;sourceType:"form_text"|"uploaded_document"|"merged";sourceText:string;sourceAssetId?:string|null;sourceFilename?:string|null;talentName?:string|null;baseCity?:string|null}){
  const sourceText=input.sourceText.trim(); if(!sourceText)return null; const sourceHash=riderHash(sourceText);
  const {data:existing,error:ee}=await supabase.from("talent_rider_versions").select("*").eq("talent_id",input.talentId).eq("source_hash",sourceHash).maybeSingle();
  if(ee&&ee.code!=="42P01")throw new Error(ee.message); if(existing)return existing;
  const {data:last,error:le}=await supabase.from("talent_rider_versions").select("version_no").eq("talent_id",input.talentId).order("version_no",{ascending:false}).limit(1).maybeSingle();
  if(le&&le.code!=="42P01")throw new Error(le.message); if(le?.code==="42P01")return null;
  const result=await normalizeRiderSource({sourceText,talentName:input.talentName,baseCity:input.baseCity}); const next=(last?.version_no??0)+1; const now=new Date().toISOString();
  await supabase.from("talent_rider_versions").update({is_current:false,status:"superseded",updated_at:now}).eq("talent_id",input.talentId).eq("is_current",true);
  const {data,error}=await supabase.from("talent_rider_versions").insert({talent_id:input.talentId,version_no:next,source_type:input.sourceType,source_asset_id:input.sourceAssetId??null,source_hash:sourceHash,source_filename:input.sourceFilename??null,source_text:sourceText,extraction_status:"ready",normalized_data:result.normalized,missing_questions:result.questions,answers:{},normalization_source:result.source,status:result.questions.length?"needs_talent_input":"ready_for_admin",is_current:true,created_at:now,updated_at:now}).select("*").single();
  if(error)throw new Error(error.message); return data;
}
