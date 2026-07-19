// Edge Function : envoie l'email de bienvenue "Pionnier" quand un nouvel
// utilisateur VIENT de confirmer son adresse (email_confirmed_at passe de null -> date).
//
// Déclenchée par un Database Webhook sur la table auth.users (événement UPDATE).
// Envoi via Resend (https://resend.com).
//
// Déploiement :
//   supabase functions deploy welcome-email --no-verify-jwt
//   supabase secrets set RESEND_API_KEY=xxx WEBHOOK_SECRET=xxx
//
// Puis créer le webhook (voir les instructions fournies).

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") ?? "";

// ⚠️ Doit être un domaine VÉRIFIÉ dans Resend (ex : intermitrack.fr).
// On envoie depuis contact@intermitrack.fr (déjà vérifié / utilisé pour les mails d'auth),
// et les réponses des utilisateurs partent vers la boîte Gmail lue au quotidien.
const FROM = "Intermitrack <contact@intermitrack.fr>";
const REPLY_TO = "intermitrack@gmail.com";
const APP_CHOOSER = "https://intermitrack.fr/app.html"; // page de choix App Store / Google Play
const WHATSAPP = "06 15 48 78 79";
const SITE = "https://intermitrack.fr";

function welcomeHtml() {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#f5f7f6;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#2d3748;">
  <div style="max-width:560px;margin:0 auto;padding:28px 20px;">
    <div style="background:#1F4E5F;color:#fff;border-radius:16px 16px 0 0;padding:22px 24px;">
      <div style="font-size:22px;font-weight:800;">Bienvenue sur Intermitrack 🎬</div>
      <div style="font-size:14px;opacity:.9;margin-top:4px;">Fait par un intermittent, pour les intermittents</div>
    </div>
    <div style="background:#fff;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 16px 16px;padding:24px;">
      <p style="font-size:15.5px;line-height:1.6;">Salut,</p>
      <p style="font-size:15.5px;line-height:1.6;">Bienvenue — et surtout, <strong>merci</strong> d'être là si tôt. 🙏</p>

      <div style="background:#FFF9E9;border:1px solid #EBD9A0;border-radius:12px;padding:14px 16px;margin:16px 0;">
        <div style="font-weight:800;color:#B8860B;font-size:15px;">🎁 Tu es PIONNIER</div>
        <div style="font-size:14.5px;line-height:1.55;margin-top:4px;">Tu fais partie des tout premiers. Tant que tu utilises un minimum l'appli, tu gardes l'<strong>accès complet, gratuit, à VIE</strong> — même quand une version premium arrivera, toi tu gardes tout, pour toujours. Et le <strong>cœur de l'appli restera gratuit pour tout le monde</strong> : je suis intermittent aussi, je connais la précarité du métier, et c'est pas là-dessus que je veux faire du profit.</div>
      </div>

      <p style="font-size:14.5px;line-height:1.6;margin-top:18px;">Ce que tu as entre les mains : l'<strong>import de tes missions en 1 clic</strong> (calendrier du téléphone ou Excel), le suivi visuel de tes <strong>507 h</strong>, les calculs France Travail, ton actualisation prête à recopier, la fiscalité, tes documents… et des <strong>widgets à poser sur ton écran d'accueil</strong> (calendrier, heures, prochaine mission), sans même ouvrir l'appli.</p>

      <p style="font-size:14.5px;line-height:1.6;">Tu es sûrement déjà sur l'app ou sur le site — et l'autre marche avec le <strong>même compte</strong> (téléphone, tablette, ordi, comme tu veux). Si tu ne l'as pas encore installée, l'app est sur l'<a href="${APP_CHOOSER}" style="color:#1F4E5F;">App Store et Google Play</a>.</p>

      <p style="font-size:14.5px;line-height:1.6;margin-top:18px;">Presque tout ce que contient l'appli vient de retours d'utilisateurs. Alors une idée, une correction, un bug, une question ? <strong>Réponds à ce mail</strong> ou écris-moi sur <strong>WhatsApp au ${WHATSAPP}</strong>. Je lis tout et je réponds vite.</p>

      <p style="font-size:14.5px;line-height:1.6;">Et si tu as une minute : <strong>note l'appli sur les stores</strong>. Ça aide énormément — chaque note est entièrement appréciée, et un petit commentaire en plus, c'est le bonus qui fait la différence.</p>

      <p style="font-size:14.5px;line-height:1.6;margin-top:16px;">Bienvenue chez toi,<br>Yohan<br><span style="color:#718096;">Intermitrack 🎬</span></p>
    </div>
  </div>
  </body></html>`;
}

serve(async (req) => {
  // Sécurité : le webhook DOIT envoyer le bon secret dans l'en-tête.
  // Fail-closed : si le secret n'est pas configuré côté fonction, ou s'il ne
  // correspond pas, on refuse. Jamais d'ouverture silencieuse.
  if (!WEBHOOK_SECRET || req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: any;
  try { payload = await req.json(); } catch { return new Response("Bad payload", { status: 400 }); }

  const record = payload?.record ?? {};
  const old = payload?.old_record ?? {};

  // On agit UNIQUEMENT à la confirmation : email_confirmed_at passe de vide -> date.
  const justConfirmed = record.email_confirmed_at && !old.email_confirmed_at;
  if (!justConfirmed || !record.email) {
    return new Response(JSON.stringify({ skipped: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to: record.email,
      reply_to: REPLY_TO,
      subject: "Bienvenue — tu es Pionnier Intermitrack 🎬",
      html: welcomeHtml(),
    }),
  });

  const data = await res.json().catch(() => ({}));
  return new Response(JSON.stringify({ sent: res.ok, data }), {
    status: res.ok ? 200 : 500,
    headers: { "Content-Type": "application/json" },
  });
});
