import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { classifyRepertoire, repertoireIsComplete, sanitizeRepertoire } from "@/lib/repertoire-classification";
import { persistRiderVersion } from "@/lib/rider-normalization";
import { verifyAccessToken } from "@/lib/signed-access";

export const runtime = "nodejs";

function getServerClient(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL;const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error("Supabase server environment is not configured");return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})}
function text(v:unknown){return typeof v==="string"&&v.trim()?v.trim():null}
function optionalHttpUrl(v:unknown){const value=text(v);if(!value)return null;try{const url=new URL(value);return url.protocol==="http:"||url.protocol==="https:"?url.toString():undefined}catch{return undefined}}
function textArray(v:unknown){if(!Array.isArray(v))return[];return Array.from(new Set(v.filter((x):x is string=>typeof x==="string").map(x=>x.trim()).filter(Boolean))).slice(0,30)}
function auth(body:any){const talentId=typeof body?.talentId==="string"?body.talentId:"";const token=typeof body?.token==="string"?body.token:"";return{talentId,ok:Boolean(talentId&&verifyAccessToken(token,"talent_onboarding",talentId))}}
function bool(v:unknown){return typeof v==="boolean"?v:null}
function actType(v:unknown){return v==="original_artist"||v==="cover_performer"||v==="mixed"?v:null}
function isSongActCategory(category:string|null){const key=(category??"").trim().toLowerCase().replace(/[_-]+/g," ").replace(/\s+/g," ");return["solo","singer","soloist","vocalist","duo","trio","duo/trio","duo trio","band"].includes(key)}
function coverCapable(type:string|null,willing:boolean|null){return type==="cover_performer"||type==="mixed"||(type==="original_artist"&&willing===true)}
function withoutLegacyRequestTag(values:string[]){return values.filter((value)=>value.trim().toLowerCase()!=="request song")}

async function normalizeRider(input:{baseRider:string|null;travelPolicy:string|null;accommodationPolicy:string|null}){
 const apiKey=process.env.GROQ_API_KEY;if(!apiKey||(!input.baseRider&&!input.travelPolicy&&!input.accommodationPolicy))return input;
 const schema={type:"object",additionalProperties:false,properties:{baseRider:{type:["string","null"]},travelPolicy:{type:["string","null"]},accommodationPolicy:{type:["string","null"]}},required:["baseRider","travelPolicy","accommodationPolicy"]};
 try{const r=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({model:process.env.GROQ_MODEL??"openai/gpt-oss-20b",messages:[{role:"system",content:"Normalize entertainment rider text into three concise fields: baseRider, travelPolicy, accommodationPolicy. Preserve every supplied requirement and numeric detail. Never invent, remove, weaken, strengthen, or infer requirements. If a field has no supplied fact, return null. Indonesian professional wording."},{role:"user",content:JSON.stringify(input)}],response_format:{type:"json_schema",json_schema:{name:"normalized_rider",strict:true,schema}},temperature:0}),cache:"no-store"});if(!r.ok)return input;const p=await r.json();const raw=p?.choices?.[0]?.message?.content;if(typeof raw!=="string")return input;const d=JSON.parse(raw);return{baseRider:text(d.baseRider)??input.baseRider,travelPolicy:text(d.travelPolicy)??input.travelPolicy,accommodationPolicy:text(d.accommodationPolicy)??input.accommodationPolicy}}catch{return input}
}

export async function GET(request:Request){
 try{
  const u=new URL(request.url);const talentId=u.searchParams.get("talentId")??"";const token=u.searchParams.get("token")??"";
  if(!talentId||!verifyAccessToken(token,"talent_onboarding",talentId))return NextResponse.json({error:"Tautan pendaftaran tidak valid atau sudah kedaluwarsa"},{status:401});
  const s=getServerClient();
  const[{data:talent,error:te},{data:submission,error:se},{data:assets,error:ae}]=await Promise.all([
   s.from("talents").select("id,name,category,act_type,willing_to_perform_covers,accepts_song_requests,sample_repertoire,repertoire_genres,repertoire_styles,repertoire_eras,repertoire_ai_status,base_city,genres,music_styles,vibe_tags,capability_tags,performance_formats,event_types,bio,show_duration_minutes,manager_name,manager_email,manager_whatsapp,portfolio_url,base_rider,travel_policy,accommodation_policy,onboarding_status").eq("id",talentId).maybeSingle(),
   s.from("talent_profile_submissions").select("*").eq("talent_id",talentId).maybeSingle(),
   s.from("talent_assets").select("id,asset_type,provider,original_filename,mime_type,size_bytes,title,description,upload_status,review_status,buyer_visible,created_at").eq("talent_id",talentId).order("created_at",{ascending:false})
  ]);
  if(te)throw new Error(te.message);if(!talent)return NextResponse.json({error:"Talent tidak ditemukan"},{status:404});if(se)throw new Error(se.message);if(ae)throw new Error(ae.message);
  return NextResponse.json({ok:true,talent,submission,assets:assets??[]});
 }catch(e){return NextResponse.json({error:"Gagal memuat data pendaftaran",detail:e instanceof Error?e.message:String(e)},{status:500})}
}

export async function PUT(request:Request){
 try{
  const body=await request.json().catch(()=>null);const{talentId,ok}=auth(body);if(!ok)return NextResponse.json({error:"Tautan pendaftaran tidak valid atau sudah kedaluwarsa"},{status:401});
  const name=text(body?.name),category=text(body?.category);if(!name||!category)return NextResponse.json({error:"Nama dan kategori wajib diisi"},{status:400});
  const portfolioUrl=optionalHttpUrl(body?.portfolioUrl);if(portfolioUrl===undefined)return NextResponse.json({error:"Link media/portofolio utama tidak valid"},{status:400});
  const showDuration=body?.showDurationMinutes==null||body?.showDurationMinutes===""?null:Number(body.showDurationMinutes);if(showDuration!=null&&(!Number.isInteger(showDuration)||showDuration<=0||showDuration>600))return NextResponse.json({error:"Durasi tampil tidak valid"},{status:400});

  const songAct=isSongActCategory(category);
  const requestedActType=songAct?actType(body?.actType):null;
  let willing=songAct?bool(body?.willingToPerformCovers):null;
  if(requestedActType==="cover_performer"||requestedActType==="mixed")willing=true;
  const canCover=songAct&&coverCapable(requestedActType,willing);
  const acceptsRequests=canCover?bool(body?.acceptsSongRequests):null;
  const repertoire=canCover?sanitizeRepertoire(body?.sampleRepertoire):[];

  let repertoireGenres:string[]=[];let repertoireStyles:string[]=[];let repertoireEras:string[]=[];let repertoireAiStatus=canCover?"pending":"not_applicable";
  if(canCover&&repertoireIsComplete(repertoire)){
   const classification=await classifyRepertoire(repertoire);
   if(classification){repertoireGenres=classification.genres;repertoireStyles=classification.styles;repertoireEras=classification.eras;repertoireAiStatus="suggested"}
  }

  const rawRider={baseRider:text(body?.baseRider),travelPolicy:null,accommodationPolicy:null};const normalized=await normalizeRider(rawRider);
  const suppliedGenres=textArray(body?.genres);const suppliedStyles=textArray(body?.musicStyles);
  const payload={
   talent_id:talentId,name,category,act_type:requestedActType,willing_to_perform_covers:willing,accepts_song_requests:acceptsRequests,
   sample_repertoire:repertoire,repertoire_genres:repertoireGenres,repertoire_styles:repertoireStyles,repertoire_eras:repertoireEras,repertoire_ai_status:repertoireAiStatus,repertoire_ai_updated_at:repertoireAiStatus==="suggested"?new Date().toISOString():null,
   base_city:text(body?.baseCity),genres:requestedActType==="cover_performer"?[]:suppliedGenres,music_styles:requestedActType==="cover_performer"?[]:(suppliedStyles.length?suppliedStyles:suppliedGenres),
   vibe_tags:textArray(body?.vibeTags),capability_tags:withoutLegacyRequestTag(textArray(body?.capabilityTags)),service_cities:[],performance_formats:textArray(body?.performanceFormats),event_types:textArray(body?.eventTypes),bio:text(body?.bio),show_duration_minutes:showDuration,
   manager_name:text(body?.managerName),manager_email:text(body?.managerEmail),manager_whatsapp:text(body?.managerWhatsapp),portfolio_url:portfolioUrl,
   base_rider:normalized.baseRider,travel_policy:normalized.travelPolicy,accommodation_policy:normalized.accommodationPolicy,status:"draft",rejection_note:null,updated_at:new Date().toISOString()
  };
  const s=getServerClient();const{data,error}=await s.from("talent_profile_submissions").upsert(payload,{onConflict:"talent_id"}).select("*").single();if(error)throw new Error(error.message);
  await s.from("talents").update({onboarding_status:"in_progress",updated_at:new Date().toISOString()}).eq("id",talentId).neq("onboarding_status","approved");
  const sourceText=rawRider.baseRider?`BASE RIDER\n${rawRider.baseRider}`:"";
  if(sourceText){try{await persistRiderVersion(s,{talentId,sourceType:"form_text",sourceText,talentName:name,baseCity:payload.base_city,category})}catch(e){console.error("Master rider version save failed",e)}}
  return NextResponse.json({ok:true,submission:data});
 }catch(e){return NextResponse.json({error:"Gagal menyimpan profil",detail:e instanceof Error?e.message:String(e)},{status:500})}
}

export async function POST(request:Request){
 try{
  const body=await request.json().catch(()=>null);const{talentId,ok}=auth(body);if(!ok)return NextResponse.json({error:"Tautan pendaftaran tidak valid atau sudah kedaluwarsa"},{status:401});
  const s=getServerClient();const[{data:submission,error:se},{data:assets,error:ae}]=await Promise.all([
   s.from("talent_profile_submissions").select("id,name,category,act_type,willing_to_perform_covers,accepts_song_requests,sample_repertoire,bio,manager_name,manager_email,manager_whatsapp,status").eq("talent_id",talentId).maybeSingle(),
   s.from("talent_assets").select("asset_type,upload_status").eq("talent_id",talentId).eq("upload_status","uploaded")
  ]);
  if(se)throw new Error(se.message);if(ae)throw new Error(ae.message);if(!submission)return NextResponse.json({error:"Simpan profil terlebih dahulu"},{status:409});if(submission.status==="submitted")return NextResponse.json({ok:true,alreadySubmitted:true});
  const missing:string[]=[];if(!submission.name)missing.push("Nama talent");if(!submission.category)missing.push("Kategori");if(!submission.bio)missing.push("Bio singkat");if(!submission.manager_name)missing.push("Manajer/PIC");if(!submission.manager_email&&!submission.manager_whatsapp)missing.push("Kontak manajer (WhatsApp atau email)");

  if(isSongActCategory(submission.category)){
   const type=actType(submission.act_type);if(!type)missing.push("Jenis musisi");
   const willing=bool(submission.willing_to_perform_covers);if(type==="original_artist"&&willing===null)missing.push("Kesediaan membawakan lagu cover");
   const canCover=coverCapable(type,willing);
   if(canCover){
    if(bool(submission.accepts_song_requests)===null)missing.push("Pilihan menerima permintaan lagu dari klien");
    const repertoire=sanitizeRepertoire(submission.sample_repertoire);if(!repertoireIsComplete(repertoire))missing.push("Contoh daftar lagu 10–20 lagu (Judul Lagu + Artis)");
   }
  }
  if(missing.length)return NextResponse.json({error:`Lengkapi: ${missing.join(", ")}`,missingFields:missing},{status:409});

  const hasPhoto=(assets??[]).some(a=>a.asset_type==="profile_photo");const hasVideo=(assets??[]).some(a=>["live_performance","showreel","event_clip"].includes(a.asset_type));
  if(!hasPhoto&&!hasVideo)return NextResponse.json({error:"Unggah minimal 1 foto profil dan 1 video sebelum dikirim"},{status:409});if(!hasPhoto)return NextResponse.json({error:"Unggah minimal 1 foto profil sebelum dikirim"},{status:409});if(!hasVideo)return NextResponse.json({error:"Unggah minimal 1 video penampilan atau showreel sebelum dikirim"},{status:409});
  const now=new Date().toISOString();const{error:ue}=await s.from("talent_profile_submissions").update({status:"submitted",submitted_at:now,updated_at:now}).eq("talent_id",talentId);if(ue)throw new Error(ue.message);const{error:tue}=await s.from("talents").update({onboarding_status:"submitted",updated_at:now}).eq("id",talentId);if(tue)throw new Error(tue.message);return NextResponse.json({ok:true});
 }catch(e){return NextResponse.json({error:"Gagal mengirim profil untuk ditinjau",detail:e instanceof Error?e.message:String(e)},{status:500})}
}
