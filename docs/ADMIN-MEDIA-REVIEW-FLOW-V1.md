# Admin Media Review Flow V1

Validated principle: approval is a human editorial/operational decision. Admin must inspect the actual uploaded asset before approving it. Source files remain private; the review UI receives short-lived signed preview URLs only.

Flow: talent uploads -> private storage -> admin preview -> approve/reject asset -> profile publish gate requires approved profile photo + approved performance video. Rider is reviewed separately and is never buyer-visible by default. Social links remain internal verification references.

Preview delivery: Supabase Storage signed URLs for private photos/documents; Cloudflare R2 presigned GET for video. Preview URLs are short-lived and generated server-side. No service-role or storage credential is exposed to the browser.
