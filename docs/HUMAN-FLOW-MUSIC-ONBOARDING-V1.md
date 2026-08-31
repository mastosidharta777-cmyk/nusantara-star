# Nusantara Star — Human Flow + Music Onboarding V1

Status: **LOCKED PRODUCT DECISION**

## Human manager response
- Before a manager answers, the system owns the state: **Menunggu konfirmasi**.
- Human manager choices are only **Tersedia** or **Tidak tersedia**.
- If the manager is not sure, they do not answer yet.
- `Tersedia` requires an event-specific fee and future quote validity. This is an offer confirmation, not a final booking.
- Legacy `tentative` may remain backend-compatible temporarily but is not a human-facing choice.

## Song-act onboarding
Applies to Solo, Duo/Trio, and Band. DJ and Traditional/Ethnic keep their own music taxonomy and are not forced into Original/Cover classification.

Song-act identity:
- Original Artist
- Cover Performer
- Both / Mixed

If Original Artist, ask: **Bersedia membawakan lagu cover? Ya/Tidak**.

If the act is cover-capable:
- ask **Menerima request lagu dari buyer? Ya/Tidak**;
- require 10–20 sample repertoire songs;
- each song contains only **Judul Lagu + Artis**;
- manual row entry and CSV/TXT import are supported;
- AI derives aggregate genre, style, and era from the supplied title+artist pairs;
- AI output is a suggestion and becomes approved taxonomy only when admin approves onboarding.

`Request Song` is a structured boolean, not a free capability tag.

## Matching
- Explicit cover requests require a cover-capable act.
- Explicit original-artist requests require Original Artist or Both/Mixed.
- Explicit song-request requirements require `accepts_song_requests = true`.
- Admin-approved AI repertoire genre/style/era is merged into the approved talent taxonomy used for matching and buyer discovery.
- Budget still uses internal fee guidance only for eligibility/ranking; event-specific commercial offer remains manager-confirmed.

## Deferred
Not part of this batch:
- referral UI / partner dashboard;
- replacement automation after cancellation;
- production vendor network (sound, lighting, stage, etc.);
- complex buyer dashboard;
- complex talent dashboard.
