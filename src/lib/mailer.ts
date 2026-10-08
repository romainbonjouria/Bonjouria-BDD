import "server-only";

/**
 * Envoi de l'email d'invitation via Resend, si RESEND_API_KEY et MAIL_FROM sont configurés
 * (ex. MAIL_FROM="BONJOUR IA <noreply@bonjouria.fr>"). Renvoie false sinon : l'appelant
 * affiche alors le lien d'invitation à transmettre à la main.
 */
export async function sendInvitationEmail(opts: { to: string; link: string; groupName: string; inviter: string }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!key || !from) return false;

  const html = `<div style="font-family:Arial,sans-serif;color:#2D2D2D;max-width:520px">
  <h2 style="color:#E83967">Bienvenue sur l'annuaire BONJOUR IA</h2>
  <p>${esc(opts.inviter)} vous invite à rejoindre l'annuaire pour le groupe <strong>${esc(opts.groupName)}</strong>.</p>
  <p><a href="${opts.link}" style="background:#E83967;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:bold">Créer mon mot de passe</a></p>
  <p style="font-size:12px;color:#B1ADA1">Ce lien est valable 7 jours. Si le bouton ne fonctionne pas : ${opts.link}</p>
</div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: opts.to, subject: "Votre invitation à l'annuaire BONJOUR IA", html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error("Envoi de l'invitation en échec", res.status, await res.text());
    return res.ok;
  } catch (err) {
    console.error("Envoi de l'invitation en échec", err);
    return false;
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
