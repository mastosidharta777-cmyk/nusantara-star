import "server-only";
import { createHash } from "node:crypto";

export type RiderQuestion = { key: string; question: string; required: boolean };
export type NormalizedRider = {
  party_size: number | null; performers_count: number | null; crew_count: number | null; departure_city: string | null;
  technical_requirements: string[]; stage_backline: string[]; hospitality: string[]; transport_requirements: string[];
  baggage_requirements: string[]; accommodation_required: boolean | null; accommodation_requirements: string[];
  meals_per_diem: string[]; special_requirements: string[]; notes: string[];
};

type RiderCategoryGroup = "music" | "host" | "speaker" | "specialty" | "unknown";

function categoryGroup(category?: string | null): RiderCategoryGroup {
  const key = (category ?? "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (["mc", "host", "mc/host", "mc host", "master of ceremony"].includes(key)) return "host";
  if (["speaker", "pembicara", "keynote speaker"].includes(key)) return "speaker";
  if (["specialty performer", "special performer", "performer", "specialty"].includes(key)) return "specialty";
  if (["solo", "singer", "soloist", "vocalist", "duo", "trio", "duo/trio", "duo trio", "band", "dj", "traditional", "ethnic", "traditional/ethnic", "traditional ethnic"].includes(key)) return "music";
  return "unknown";
}

export function riderHash(source:string){return createHash("sha256").update(source).digest("hex")}
const cleanArray=(v:unknown)=>Array.isArray(v)?v.filter((x):x is string=>typeof x==="string").map(x=>x.trim()).filter(Boolean).slice(0,40):[];
const toInt=(v:unknown)=>{if(v==null)return null;const n=Number(v);return Number.isInteger(n)&&n>=0&&n<=200?n:null};
function normalizeShape(v:any):NormalizedRider{return{party_size:toInt(v?.party_size),performers_count:toInt(v?.performers_count),crew_count:toInt(v?.crew_count),departure_city:typeof v?.departure_city==="string"&&v.departure_city.trim()?v.departure_city.trim():null,technical_requirements:cleanArray(v?.technical_requirements),stage_backline:cleanArray(v?.stage_backline),hospitality:cleanArray(v?.hospitality),transport_requirements:cleanArray(v?.transport_requirements),baggage_requirements:cleanArray(v?.baggage_requirements),accommodation_required:typeof v?.accommodation_required==="boolean"?v.accommodation_required:null,accommodation_requirements:cleanArray(v?.accommodation_requirements),meals_per_diem:cleanArray(v?.meals_per_diem),special_requirements:cleanArray(v?.special_requirements),notes:cleanArray(v?.notes)}}

export function buildMissingQuestions(r:NormalizedRider,baseCity?:string|null,category?:string|null):RiderQuestion[]{
  const q:RiderQuestion[]=[];
  const group=categoryGroup(category);
  if(r.party_size==null&&r.performers_count==null&&r.crew_count==null){
    const question=group==="host"||group==="speaker"
      ?"Berapa orang yang biasanya berangkat untuk pekerjaan ini, termasuk talent dan pendamping/kru jika ada?"
      :group==="unknown"
        ?"Berapa orang yang biasanya terlibat atau berangkat untuk pekerjaan ini, termasuk talent dan kru/pendamping jika ada?"
        :"Berapa total personel yang biasanya berangkat untuk show (talent + kru)?";
    q.push({key:"party_size",question,required:true});
  }
  if(!r.departure_city)q.push({key:"departure_city",question:baseCity?`Apakah kota keberangkatan default rombongan adalah ${baseCity}? Jika berbeda, tulis kotanya.`:"Dari kota mana rombongan biasanya berangkat untuk show?",required:true});
  if(!r.technical_requirements.length&&!r.stage_backline.length){
    const question=group==="host"
      ?"Apakah ada kebutuhan audio/panggung yang wajib untuk MC/host, misalnya jenis mic, monitor/cue, lectern, teleprompter, atau perangkat lain? Jika tidak ada, jawab: Tidak ada."
      :group==="speaker"
        ?"Apakah ada kebutuhan audio/presentasi yang wajib, misalnya jenis mic, monitor, lectern, layar, clicker, atau perangkat lain? Jika tidak ada, jawab: Tidak ada."
        :group==="specialty"
          ?"Apakah ada kebutuhan teknis, panggung, alat, ruang, atau keselamatan yang wajib untuk penampilan ini? Jika tidak ada, jawab: Tidak ada."
          :group==="unknown"
            ?"Apakah ada kebutuhan teknis atau operasional yang wajib untuk pekerjaan/penampilan ini? Jika tidak ada, jawab: Tidak ada."
            :"Apakah ada kebutuhan teknis/backline yang wajib? Jika tidak ada, jawab: Tidak ada.";
    q.push({key:"technical_basics",question,required:true});
  }
  if(r.accommodation_required==null)q.push({key:"accommodation_required",question:"Untuk show di luar kota, apakah rombongan membutuhkan hotel/akomodasi? Jawab Ya atau Tidak, lalu beri detail jika ada.",required:true});
  if(group==="music"||group==="specialty"){
    if(!r.transport_requirements.length&&!r.baggage_requirements.length)q.push({key:"transport_baggage",question:group==="specialty"?"Apakah ada kebutuhan transport atau bagasi/peralatan khusus? Jika tidak ada, jawab: Tidak ada.":"Apakah ada kebutuhan transport atau bagasi alat khusus? Jika tidak ada, jawab: Tidak ada.",required:true});
  }
  return q;
}

const riderSchema={type:"object",additionalProperties:false,properties:{party_size:{type:["integer","null"]},performers_count:{type:["integer","null"]},crew_count:{type:["integer","null"]},departure_city:{type:["string","null"]},technical_requirements:{type:"array",items:{type:"string"}},stage_backline:{type:"array",items:{type:"string"}},hospitality:{type:"array",items:{type:"string"}},transport_requirements:{type:"array",items:{type:"string"}},baggage_requirements:{type:"array",items:{type:"string"}},accommodation_required:{type:["boolean","null"]},accommodation_requirements:{type:"array",items:{type:"string"}},meals_per_diem:{type:"array",items:{type:"string"}},special_requirements:{type:"array",items:{type:"string"}},notes:{type:"array",items:{type:"string"}}},required:["party_size","performers_count","crew_count","departure_city","technical_requirements","stage_backline","hospitality","transport_requirements","baggage_requirements","accommodation_required","accommodation_requirements","meals_per_diem","special_requirements","notes"]};
const RIDER_SYSTEM_PROMPT="Normalize this part of a live-entertainment master rider into structured operational facts. The talent category is context only: requirements for a band, singer, DJ, MC/host, speaker, specialty performer, or another talent type can legitimately differ. Use ONLY facts explicitly contained in this rider part or confirmed talent answers. Never invent, assume, soften, strengthen, or delete requirements. Do not force music/backline requirements onto MC/host, speaker, or an unknown/custom category. Preserve quantities, hotel standards, equipment models, crew counts, transport/baggage conditions, hospitality and special requirements exactly when stated. Unknown values must remain null or empty arrays. Return concise Indonesian operational wording while preserving product/model names and standard technical terms. Return only a JSON object matching the requested fields.";
const RETRYABLE_AI_STATUSES=new Set([429,498,500,502,503]);

function strictRiderSchemaSupported(model:string){return model==="openai/gpt-oss-20b"||model==="openai/gpt-oss-120b"||model==="qwen/qwen3.8-27b"}
function riderRetryDelay(response:Response,attempt:number){const raw=response.headers.get("retry-after");if(raw){const seconds=Number(raw);if(Number.isFinite(seconds))return Math.min(Math.max(seconds*1000,250),2500);const date=Date.parse(raw);if(Number.isFinite(date))return Math.min(Math.max(date-Date.now(),250),2500)}return 500*(2**attempt)+Math.floor(Math.random()*250)}
async function riderPause(ms:number){await new Promise(resolve=>setTimeout(resolve,ms))}

function splitRiderSource(source:string,maxChars=10000){
 const chunks:string[]=[];let current="";
 for(const raw of source.split(/\r?\n/)){
  const line=raw.trim();if(!line)continue;
  const pieces:string[]=[];for(let start=0;start<line.length;start+=maxChars)pieces.push(line.slice(start,start+maxChars));
  for(const piece of pieces){if(current&&current.length+piece.length+1>maxChars){chunks.push(current);current=piece}else current=current?`${current}\n${piece}`:piece}
 }
 if(current)chunks.push(current);
 return chunks;
}

async function normalizeRiderChunk(apiKey:string,model:string,context:Record<string,unknown>){
 let lastStatus=0;
 for(let attempt=0;attempt<2;attempt+=1){
  const response=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model,temperature:0,messages:[{role:"system",content:RIDER_SYSTEM_PROMPT},{role:"user",content:JSON.stringify(context)}],response_format:strictRiderSchemaSupported(model)?{type:"json_schema",json_schema:{name:"nusantara_star_master_rider",strict:true,schema:riderSchema}}:{type:"json_object"}}),cache:"no-store"});
  if(response.ok){const payload=await response.json();const raw=payload?.choices?.[0]?.message?.content;if(typeof raw!=="string"||!raw)throw new Error(`Model ${model} tidak mengembalikan hasil normalisasi`);return normalizeShape(JSON.parse(raw))}
  lastStatus=response.status;const providerBody=(await response.text().catch(()=>"")).slice(0,300);console.warn(JSON.stringify({level:"warning",message:"Groq rider request failed",model,status:response.status,attempt:attempt+1,retryAfter:response.headers.get("retry-after"),providerBody}));
  if(!RETRYABLE_AI_STATUSES.has(response.status)||attempt===1)break;await riderPause(riderRetryDelay(response,attempt));
 }
 throw new Error(`AI normalisasi gagal (${lastStatus||"unknown"})`);
}

function mergeRiderParts(parts:NormalizedRider[]):NormalizedRider{
 const conflicts:string[]=[];
 const scalar=<T,>(key:keyof NormalizedRider):T|null=>{const values=[...new Set(parts.map(part=>part[key]).filter(value=>value!==null).map(value=>JSON.stringify(value)))];if(values.length>1){conflicts.push(`Nilai ${String(key)} berbeda antarbagian rider dan perlu dikonfirmasi.`);return null}return values.length?JSON.parse(values[0]) as T:null};
 const array=(key:keyof NormalizedRider)=>[...new Set(parts.flatMap(part=>Array.isArray(part[key])?part[key] as string[]:[]))];
 return{party_size:scalar<number>("party_size"),performers_count:scalar<number>("performers_count"),crew_count:scalar<number>("crew_count"),departure_city:scalar<string>("departure_city"),technical_requirements:array("technical_requirements"),stage_backline:array("stage_backline"),hospitality:array("hospitality"),transport_requirements:array("transport_requirements"),baggage_requirements:array("baggage_requirements"),accommodation_required:scalar<boolean>("accommodation_required"),accommodation_requirements:array("accommodation_requirements"),meals_per_diem:array("meals_per_diem"),special_requirements:array("special_requirements"),notes:[...array("notes"),...conflicts]};
}

export async function validateRiderIdentity(input:{sourceText:string;talentName:string;sourceFilename?:string|null}){
 const hay=`${input.sourceFilename??""}\n${input.sourceText.slice(0,12000)}`.toLowerCase();const talent=input.talentName.trim().toLowerCase();if(talent&&hay.includes(talent))return{outcome:"match" as const,detectedArtist:input.talentName,evidence:"Nama talent ditemukan pada dokumen."};
 const apiKey=process.env.GROQ_API_KEY;if(!apiKey)return{outcome:"uncertain" as const,detectedArtist:null,evidence:"Verifikasi identitas otomatis tidak tersedia."};
 const schema={type:"object",additionalProperties:false,properties:{outcome:{type:"string",enum:["match","mismatch","uncertain"]},detectedArtist:{type:["string","null"]},evidence:{type:"string"}},required:["outcome","detectedArtist","evidence"]};
 try{const response=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:process.env.GROQ_MODEL??"openai/gpt-oss-20b",temperature:0,messages:[{role:"system",content:"Verify whether a live-entertainment rider explicitly belongs to the expected talent. Return mismatch ONLY when the document clearly identifies a different artist/act. Return match when the expected talent is clearly identified. Otherwise return uncertain. Do not infer identity from technical requirements."},{role:"user",content:JSON.stringify({expectedTalent:input.talentName,filename:input.sourceFilename??null,documentExcerpt:input.sourceText.slice(0,12000)})}],response_format:{type:"json_schema",json_schema:{name:"rider_identity",strict:true,schema}}}),cache:"no-store"});if(!response.ok)throw new Error(String(response.status));const p=await response.json();const raw=p?.choices?.[0]?.message?.content;if(typeof raw!=="string")throw new Error("empty");const parsed=JSON.parse(raw);return{outcome:parsed.outcome as "match"|"mismatch"|"uncertain",detectedArtist:typeof parsed.detectedArtist==="string"?parsed.detectedArtist:null,evidence:typeof parsed.evidence==="string"?parsed.evidence:""};}catch{return{outcome:"uncertain" as const,detectedArtist:null,evidence:"Identitas rider belum dapat diverifikasi otomatis."}}
}

export async function normalizeRiderSource(input:{sourceText:string;talentName?:string|null;baseCity?:string|null;category?:string|null;answers?:Record<string,string>|null}){
 const sourceText=input.sourceText.replace(/\u0000/g," ").trim();if(!sourceText)throw new Error("Dokumen rider tidak memiliki teks yang dapat diproses");const apiKey=process.env.GROQ_API_KEY;if(!apiKey)throw new Error("AI normalisasi rider belum tersedia");
 const chunks=splitRiderSource(sourceText);if(chunks.length>8)throw new Error("Dokumen rider terlalu panjang untuk normalisasi otomatis");
 const models=[...new Set([process.env.GROQ_MODEL??"openai/gpt-oss-20b",process.env.GROQ_RIDER_FALLBACK_MODEL??process.env.GROQ_BIO_FALLBACK_MODEL??"llama-3.1-8b-instant"])];const parts:NormalizedRider[]=[];
 for(let index=0;index<chunks.length;index+=1){let normalized:NormalizedRider|null=null;const failures:string[]=[];for(const model of models){try{normalized=await normalizeRiderChunk(apiKey,model,{talentName:input.talentName??null,talentCategory:input.category??null,baseCity:input.baseCity??null,riderPart:index+1,totalParts:chunks.length,riderSource:chunks[index],confirmedAnswers:input.answers??{}});break}catch(error){failures.push(error instanceof Error?error.message:String(error))}}if(!normalized){console.error(JSON.stringify({level:"error",message:"All rider normalization models failed",part:index+1,totalParts:chunks.length,failures}));throw new Error("Layanan AI normalisasi rider sedang dibatasi")}parts.push(normalized)}
 const normalized=mergeRiderParts(parts);return{normalized,questions:buildMissingQuestions(normalized,input.baseCity,input.category),source:"ai" as const};
}

export async function extractRiderText(buffer:Buffer,mimeType:string){if(mimeType==="text/plain")return buffer.toString("utf8");if(mimeType==="application/pdf"){const mod:any=await import("pdf-parse");const parse=mod.default??mod;const result=await parse(buffer);return typeof result?.text==="string"?result.text:""}if(mimeType==="application/vnd.openxmlformats-officedocument.wordprocessingml.document"){const mammoth:any=await import("mammoth");const result=await mammoth.extractRawText({buffer});return typeof result?.value==="string"?result.value:""}throw new Error("Unsupported rider document type")}

function riderContextHash(sourceText:string,category?:string|null,baseCity?:string|null){return riderHash(JSON.stringify({sourceText,category:(category??"").trim().toLowerCase(),baseCity:(baseCity??"").trim().toLowerCase()}))}

export async function persistRiderVersion(s:any,input:{talentId:string;sourceType:"form_text"|"uploaded_document"|"merged";sourceText:string;sourceAssetId?:string|null;sourceFilename?:string|null;talentName?:string|null;baseCity?:string|null;category?:string|null}){const sourceText=input.sourceText.trim();if(!sourceText)return null;const sourceHash=riderContextHash(sourceText,input.category,input.baseCity);const{data:existing,error:ee}=await s.from("talent_rider_versions").select("*").eq("talent_id",input.talentId).eq("source_hash",sourceHash).maybeSingle();if(ee)throw new Error(ee.message);if(existing)return existing;const{data:last,error:le}=await s.from("talent_rider_versions").select("version_no").eq("talent_id",input.talentId).order("version_no",{ascending:false}).limit(1).maybeSingle();if(le)throw new Error(le.message);const result=await normalizeRiderSource({sourceText,talentName:input.talentName,baseCity:input.baseCity,category:input.category});const next=(last?.version_no??0)+1;const now=new Date().toISOString();await s.from("talent_rider_versions").update({is_current:false,status:"superseded",updated_at:now}).eq("talent_id",input.talentId).eq("is_current",true);const{data,error}=await s.from("talent_rider_versions").insert({talent_id:input.talentId,version_no:next,source_type:input.sourceType,source_asset_id:input.sourceAssetId??null,source_hash:sourceHash,source_filename:input.sourceFilename??null,source_text:sourceText,extraction_status:"ready",normalized_data:result.normalized,missing_questions:result.questions,answers:{},normalization_source:result.source,status:result.questions.length?"needs_talent_input":"ready_for_admin",is_current:true,created_at:now,updated_at:now}).select("*").single();if(error)throw new Error(error.message);return data}
