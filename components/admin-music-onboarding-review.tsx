"use client";

import { useEffect, useState } from "react";

type Song = { title: string; artist: string };
type Submission = {
  category?: string | null;
  act_type?: string | null;
  willing_to_perform_covers?: boolean | null;
  accepts_song_requests?: boolean | null;
  sample_repertoire?: Song[] | null;
  repertoire_genres?: string[] | null;
  repertoire_styles?: string[] | null;
  repertoire_eras?: string[] | null;
  repertoire_ai_status?: string | null;
};

function isSongAct(category?: string | null) {
  const key=(category??"").trim().toLowerCase().replace(/[_-]+/g," ").replace(/\s+/g," ");
  return ["solo","singer","soloist","vocalist","duo","trio","duo/trio","duo trio","band"].includes(key);
}
function actLabel(value?: string | null) {
  if(value==="original_artist")return "Original Artist";
  if(value==="cover_performer"||value==="cover_entertainment")return "Cover Performer";
  if(value==="mixed")return "Both / Mixed";
  return "Belum dipilih";
}
function yn(value?: boolean | null){return value===true?"Ya":value===false?"Tidak":"Belum dijawab"}
function coverCapable(s:Submission){return s.act_type==="cover_performer"||s.act_type==="cover_entertainment"||s.act_type==="mixed"||(s.act_type==="original_artist"&&s.willing_to_perform_covers===true)}

export function AdminMusicOnboardingReview({talentId}:{talentId:string}) {
  const [submission,setSubmission]=useState<Submission|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");

  async function refresh(){
    const res=await fetch(`/api/internal-demo/admin/talent-onboarding-review?talentId=${encodeURIComponent(talentId)}`,{cache:"no-store"});
    const body=await res.json().catch(()=>null);if(!res.ok)throw new Error(body?.error??"Gagal memuat data musisi");setSubmission(body?.submission??null);
  }
  useEffect(()=>{refresh().catch(e=>setError(e instanceof Error?e.message:"Gagal memuat data musisi"))},[]);

  async function reclassify(){
    setBusy(true);setError("");setMessage("");
    try{const res=await fetch("/api/internal-demo/admin/talent-onboarding-review",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({talentId,action:"reclassify_repertoire"})});const body=await res.json().catch(()=>null);if(!res.ok)throw new Error(body?.error??"Analisis AI gagal");setMessage("Repertoire berhasil dianalisis ulang. Periksa hasilnya sebelum menyetujui profil.");await refresh()}catch(e){setError(e instanceof Error?e.message:"Analisis AI gagal")}finally{setBusy(false)}
  }

  if(!submission||!isSongAct(submission.category))return null;
  const songs=Array.isArray(submission.sample_repertoire)?submission.sample_repertoire.filter(song=>song?.title||song?.artist):[];
  const canCover=coverCapable(submission);
  const aiReady=submission.repertoire_ai_status==="suggested"||submission.repertoire_ai_status==="approved";

  return <section className="mb-5 border border-black/10 bg-white p-5 md:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Kurasi Musisi</p><h2 className="mt-2 text-xl font-semibold">Identitas & repertoire</h2></div><span className="border border-black/10 px-3 py-2 text-xs font-semibold">{actLabel(submission.act_type)}</span></div>
    <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
      {submission.act_type==="original_artist"?<div><b>Bersedia membawakan cover</b><p>{yn(submission.willing_to_perform_covers)}</p></div>:null}
      {canCover?<div><b>Menerima request lagu buyer</b><p>{yn(submission.accepts_song_requests)}</p></div>:null}
    </div>
    {canCover?<>
      <div className="mt-5 border-t border-black/10 pt-4"><div className="flex items-center justify-between gap-3"><b className="text-sm">Sample repertoire</b><span className={`text-xs font-semibold ${songs.length>=10&&songs.length<=20?"text-green-700":"text-red-700"}`}>{songs.length}/20 lagu</span></div>
      {songs.length?<ol className="mt-3 grid gap-1 text-sm text-black/65 sm:grid-cols-2">{songs.map((song,index)=><li key={`${song.title}-${song.artist}-${index}`}>{index+1}. {song.title||"—"} — {song.artist||"—"}</li>)}</ol>:<p className="mt-2 text-sm text-red-700">Belum ada repertoire.</p>}</div>
      <div className="mt-5 border border-black/10 bg-[#f8f7f3] p-4 text-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><b>Klasifikasi AI</b><p className="mt-1 text-xs text-black/50">AI hanya mengelompokkan Judul Lagu + Artis. Persetujuan profil oleh admin menjadi review manusia.</p></div><span className={`text-xs font-semibold ${aiReady?"text-green-700":"text-amber-700"}`}>{aiReady?"Siap ditinjau":"Belum siap"}</span></div>
        <p className="mt-3"><b>Genre:</b> {(submission.repertoire_genres??[]).join(", ")||"—"}</p><p className="mt-1"><b>Style:</b> {(submission.repertoire_styles??[]).join(", ")||"—"}</p><p className="mt-1"><b>Era:</b> {(submission.repertoire_eras??[]).join(", ")||"—"}</p>
        <button disabled={busy||songs.length<10||songs.length>20} onClick={reclassify} className="mt-4 border border-black px-3 py-2 text-xs font-semibold disabled:opacity-40">{busy?"Menganalisis…":"Analisis ulang dengan AI"}</button>
      </div>
    </>:<p className="mt-4 text-sm text-black/55">Talent tidak menawarkan repertoire cover; sample repertoire tidak diwajibkan.</p>}
    {message?<p className="mt-3 text-sm font-semibold text-green-700">{message}</p>:null}{error?<p className="mt-3 text-sm font-semibold text-red-700">{error}</p>:null}
  </section>;
}
