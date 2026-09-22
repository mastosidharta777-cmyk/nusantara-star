type InviteEmailInput = {
  email: string;
  url: string;
  idempotencyKey: string;
};

export type InviteEmailDelivery = {
  status: "sent" | "not_configured" | "failed";
};

function configuredValue(value: string | undefined) {
  return value?.trim() ?? "";
}

export function supplyInviteEmailConfigured() {
  return Boolean(configuredValue(process.env.RESEND_API_KEY) && configuredValue(process.env.NUSANTARA_STAR_EMAIL_FROM));
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function message({ email, url }: InviteEmailInput) {
  const safeUrl = escapeHtml(url);
  return {
    subject: "Undangan onboarding Nusantara Star",
    text: `Halo ${email},\n\nTerima kasih atas minat bergabung dengan Nusantara Star. Silakan lengkapi profil melalui link aman berikut:\n${url}\n\nLink berlaku 7 hari. Setelah profil masuk, tim akan meninjau sebelum ada publikasi atau penawaran pekerjaan.\n\nNusantara Star`,
    html: `<main style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#171713;line-height:1.6"><h1 style="font-size:24px;margin:0 0 20px">Undangan onboarding</h1><p>Halo,</p><p>Terima kasih atas minat bergabung dengan Nusantara Star. Silakan lengkapi profil melalui link aman berikut.</p><p style="margin:28px 0"><a href="${safeUrl}" style="display:inline-block;background:#171713;color:#ffffff;padding:13px 20px;text-decoration:none;font-weight:700">Lengkapi profil</a></p><p style="font-size:14px;color:#555">Link berlaku 7 hari. Setelah profil masuk, tim akan meninjau sebelum ada publikasi atau penawaran pekerjaan.</p><p>Salam,<br/>Nusantara Star</p></main>`,
  };
}

export async function sendSupplyInviteEmail(input: InviteEmailInput): Promise<InviteEmailDelivery> {
  const apiKey = configuredValue(process.env.RESEND_API_KEY);
  const from = configuredValue(process.env.NUSANTARA_STAR_EMAIL_FROM);
  if (!apiKey || !from) return { status: "not_configured" };

  const content = message(input);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify({ from, to: [input.email], ...content }),
    });
    return response.ok ? { status: "sent" } : { status: "failed" };
  } catch {
    return { status: "failed" };
  }
}
