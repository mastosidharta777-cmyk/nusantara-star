import { availabilityConfidence } from "./availability";
import type { EngineTalent, MatchBreakdown, MatchTier, StructuredBrief, TalentMatch } from "./types";

const n=(v:string)=>v.trim().toLowerCase();
const arr=(v:string[]|undefined)=>v??[];
function canonicalCategory(v:string|null|undefined){if(!v)return null;const x=n(v);if(/(singer|penyanyi|vocalist|vokalis|solo)/.test(x))return"singer";if(/(band|group)/.test(x))return"band";if(/(mc|host|master of ceremony)/.test(x))return"mc";if(/\bdj\b|disc jockey/.test(x))return"dj";if(/(traditional|tradisional|cultural|budaya|ethnic)/.test(x))return"traditional";if(/(acoustic|duo|trio)/.test(x))return"acoustic";if(/(speaker|pembicara)/.test(x))return"speaker";if(/(special performer|specialty performer)/.test(x))return"special performer";return x}
function requestedGender(b:StructuredBrief):"female"|"male"|null{const t=n([b.talentCategory??"",b.sourceText??"",...b.specialRequirements].join(" "));if(/(female|woman|women|perempuan|wanita)/.test(t))return"female";if(/(male|man|men|laki-laki|pria)/.test(t))return"male";return null}
function tokens(v:string[]){return new Set(v.flatMap(x=>n(x).split(/[^a-z0-9&]+/i)).map(x=>x.trim()).filter(x=>x.length>1))}
function coverage(a:string[],b:string[]){if(!b.length)return null;const aa=tokens(a),bb=[...tokens(b)];if(!bb.length)return null;return bb.filter(x=>aa.has(x)).length/bb.length}
function intersects(a:string[],b:string[]){const aa=tokens(a);return[...tokens(b)].some(x=>aa.has(x))}
function genreOnly(values:string[]){return values.filter(value=>!/(^|\b)(acoustic|akustik|full band|semi acoustic|playback|upbeat|singalong|party|high energy|danceable|elegant|warm|chill|romantic)(\b|$)/i.test(value))}
function isCoverCapable(t:EngineTalent){return t.actType==="cover_performer"||t.actType==="mixed"||(t.actType==="original_artist"&&t.willingToPerformCovers===true)}
function isOriginalCapable(t:EngineTalent){return t.actType==="original_artist"||t.actType==="mixed"}

// LOCKED Budget Matching Rule V1: buyer maximum is the affordability ceiling; <=10% above is stretch only; farther above is blocked. Buyer minimum is context, not a minimum acceptable talent fee.
function budget(t:EngineTalent,b:StructuredBrief){if(b.budgetMin==null&&b.budgetMax==null)return 70;if(b.budgetMax==null)return 100;return t.budgetMin<=b.budgetMax?100:t.budgetMin<=b.budgetMax*1.1?65:20}
function categoryGenre(t:EngineTalent,b:StructuredBrief){const r=canonicalCategory(b.talentCategory),a=canonicalCategory(t.category);if(r&&r!==a)return 0;const c=coverage([...t.genres,...arr(t.musicStyles)],genreOnly(b.genreStyle));if(!r&&c==null)return 70;if(c==null)return 90;if(c>=.75)return 100;if(c>=.4)return 80;return 60}
function eventFit(t:EngineTalent,b:StructuredBrief){const c=n([b.eventType??"",b.venue??"",b.sourceText??""].join(" "));if(!c.trim()||!t.eventTypes.length)return 70;return t.eventTypes.some(type=>{const x=n(type);return c.includes(x)||x.includes(c)||(x==="hotel"&&/(hotel|lounge|resort)/.test(c))||(x==="corporate"&&/(corporate|perusahaan|gala dinner)/.test(c))||(x==="private event"&&/(private|party|acara privat)/.test(c))||(x==="brand activation"&&/(brand activation|aktivasi)/.test(c))})?100:70}
function location(t:EngineTalent,b:StructuredBrief){if(!b.city)return 70;const x=n(b.city);if(n(t.baseCity)===x)return 100;if(t.serviceCities.map(n).includes(x))return 90;return 70}
function audienceVibe(t:EngineTalent,b:StructuredBrief){const r=[...b.eventVibe,...b.genreStyle,...b.specialRequirements];if(!r.length)return 70;const tags=[...t.audienceTags,...arr(t.vibeTags),...arr(t.capabilityTags),...arr(t.musicStyles),...t.performanceFormats];return intersects(tags,r)?100:60}
function taxonomy(t:EngineTalent,b:StructuredBrief){
 const text=n([b.sourceText??"",b.talentCategory??"",...b.genreStyle,...b.eventVibe,...b.specialRequirements].join(" "));
 let signals=0,hits=0;
 const checks:Array<[boolean,boolean]>=[
  [/cover|top ?40|lagu familiar|hits|singalong/.test(text),isCoverCapable(t)],
  [/original artist|artis original|lagu original/.test(text),isOriginalCapable(t)],
  [/request song|request lagu|request lagu khusus/.test(text),t.acceptsSongRequests===true],
  [/full band/.test(text),intersects(t.performanceFormats,["full band"])],
  [/acoustic|akustik/.test(text),intersects(t.performanceFormats,["acoustic","semi acoustic"])],
  [/rock/.test(text),intersects([...arr(t.musicStyles),...t.genres],["rock"])],
  [/top ?40/.test(text),intersects(arr(t.musicStyles),["top 40"])],
  [/party|pecah|high energy|danceable/.test(text),intersects([...arr(t.vibeTags),...arr(t.capabilityTags)],["party","high energy","danceable"])],
  [/singalong/.test(text),intersects(arr(t.capabilityTags),["singalong"])],
 ];
 for(const[r,m]of checks)if(r){signals++;if(m)hits++}
 return signals?Math.round(45+(hits/signals)*55):70;
}
function tier(score:number,b:MatchBreakdown):MatchTier{const tx=b.taxonomyFit??70;if(score>=88&&b.budget>=90&&b.categoryGenre>=80&&b.availability>=60&&tx>=70)return"strong_match";if(score>=74&&b.budget>=65&&b.categoryGenre>=80&&b.availability>=30&&tx>=55)return"acceptable_alternative";return"do_not_offer"}
function explicitEligibilityBlocks(t:EngineTalent,b:StructuredBrief){
 const text=n([b.sourceText??"",...b.specialRequirements].join(" ")),blocks:string[]=[];
 if(/\b(band cover|cover band|talent cover|cover performer|entertainment band)\b/.test(text)&&!isCoverCapable(t))blocks.push("Permintaan klien secara jelas membutuhkan talent yang dapat membawakan lagu cover");
 if(/\b(original artist|artis original)\b/.test(text)&&!isOriginalCapable(t))blocks.push("Permintaan klien secara jelas membutuhkan artis dengan lagu original");
 if(/\b(request song|request lagu|request lagu khusus)\b/.test(text)&&t.acceptsSongRequests!==true)blocks.push("Permintaan klien membutuhkan talent yang menerima permintaan lagu");
 if(/\bfull band\b/.test(text)&&!intersects(t.performanceFormats,["full band"]))blocks.push("Klien meminta format full band, tetapi format tersebut tidak tersedia");
 if(/\b(bisa|format|set|tampil|performance)?\s*(acoustic|akustik)\b/.test(text)&&!intersects(t.performanceFormats,["acoustic","semi acoustic"]))blocks.push("Klien meminta format akustik, tetapi format tersebut tidak tersedia");
 return blocks;
}

export function scoreTalent(t:EngineTalent,b:StructuredBrief,now=new Date()):TalentMatch{
 const av=availabilityConfidence(t,b.eventDate,now),blockedReasons:string[]=explicitEligibilityBlocks(t,b),reasons:string[]=[];
 if(av.hardBlocked)blockedReasons.push(`Tidak tersedia pada ${b.eventDate??"tanggal acara"}`);
 const rc=canonicalCategory(b.talentCategory),tc=canonicalCategory(t.category);if(rc&&rc!==tc)blockedReasons.push(`Kategori tidak sesuai: klien meminta ${b.talentCategory}`);
 const g=requestedGender(b);if(g&&t.gender&&!['unknown','mixed',g].includes(t.gender))blockedReasons.push(`Gender talent tidak sesuai dengan permintaan klien`);
 const breakdown:MatchBreakdown={availability:av.score,budget:budget(t,b),categoryGenre:categoryGenre(t,b),eventFit:eventFit(t,b),location:location(t,b),reliability:t.reliabilityScore,audienceVibe:audienceVibe(t,b),taxonomyFit:taxonomy(t,b)};
 if(breakdown.budget<65)blockedReasons.push("Indikasi fee talent terlalu jauh di atas anggaran klien");
 const raw=Math.round(breakdown.availability*.23+breakdown.budget*.19+breakdown.categoryGenre*.18+breakdown.eventFit*.09+breakdown.location*.09+breakdown.reliability*.08+breakdown.audienceVibe*.06+(breakdown.taxonomyFit??70)*.08);
 const score=blockedReasons.length?0:raw;const mt=blockedReasons.length?"do_not_offer":tier(score,breakdown);
 if(b.budgetMax==null&&b.budgetMin!=null)reasons.push("klien belum menetapkan batas maksimum anggaran");else if(breakdown.budget>=90)reasons.push("anggaran sesuai");else if(breakdown.budget>=65)reasons.push("sedikit di atas anggaran; tampilkan hanya sebagai alternatif");
 if(breakdown.categoryGenre>=90)reasons.push("kategori dan genre sesuai");
 if((breakdown.taxonomyFit??0)>=85)reasons.push("format dan gaya penampilan sesuai kebutuhan");
 if(b.city&&n(t.baseCity)===n(b.city))reasons.push("berbasis di kota acara");else if(b.city)reasons.push("biaya perjalanan dari kota asal perlu dihitung");
 if(breakdown.eventFit>=90)reasons.push("cocok untuk jenis acara");
 if(t.reliabilityScore>=85)reasons.push("rekam jejak operasional baik");
 if(t.bookingLimitations?.trim())reasons.push("batasan booking wajib dibandingkan dengan kebutuhan klien dan dikonfirmasi admin");
 if(av.freshness!=="fresh")reasons.push("ketersediaan perlu dikonfirmasi ulang");
 if(!av.hardBlocked)reasons.push("konfirmasi langsung wajib sebelum pilihan final");
 if(mt==="acceptable_alternative")reasons.push("alternatif layak, tetapi bukan kecocokan utama");
 return{talent:t,score,tier:mt,breakdown,availabilityStatus:av.status,freshness:av.freshness,requiresLiveConfirmation:av.requiresLiveConfirmation,reasons,blockedReasons};
}
export function rankTalents(talents:EngineTalent[],brief:StructuredBrief,limit=5,now=new Date()){return talents.map(t=>scoreTalent(t,brief,now)).filter(m=>!m.blockedReasons.length&&m.tier!=="do_not_offer").sort((a,b)=>a.tier!==b.tier?(a.tier==="strong_match"?-1:1):b.score-a.score).slice(0,limit)}
