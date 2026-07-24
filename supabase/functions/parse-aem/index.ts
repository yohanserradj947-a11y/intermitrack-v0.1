// Edge Function : lit un AEM (Attestation Employeur Mensuelle, CERFA Unédic annexes 8/10) — PDF ou photo —
// et renvoie les champs structurés pour pré-remplir une mission. Le fichier est analysé PUIS OUBLIÉ :
// on ne le stocke jamais côté serveur (le stockage éventuel dans « Mes documents » se fait côté appli,
// à la demande de l'utilisateur).
//
// Déploiement : supabase functions deploy parse-aem
// Secret requis : supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// La JWT Supabase est vérifiée automatiquement → seule une personne connectée peut appeler la fonction.

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Schéma strict de sortie : le modèle est OBLIGÉ de renvoyer exactement ces champs.
const AEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    production: { type: 'string', description: "Raison sociale de l'employeur (case « Raison Sociale »)" },
    poste: { type: 'string', description: "Emploi occupé (ex : ELECTRICIEN)" },
    dateDebut: { type: 'string', description: "Date d'embauche au format AAAA-MM-JJ" },
    dateFin: { type: 'string', description: "Date de fin de contrat au format AAAA-MM-JJ" },
    heures: { type: 'number', description: "Nombre d'heures effectuées (0 si vide)" },
    jours: { type: 'integer', description: "Nombre de jours travaillés (0 si vide)" },
    cachets: { type: 'number', description: "Nombre de cachets (isolés + groupés), 0 si vide" },
    brut: { type: 'number', description: "Salaires bruts en euros" },
    estArtiste: { type: 'boolean', description: "true si la case Artiste est cochée (annexe 10), false si Technicien/Ouvrier (annexe 8)" },
    confiance: { type: 'string', enum: ['haute', 'moyenne', 'basse'], description: "Confiance dans la lecture" },
  },
  required: ['production', 'poste', 'dateDebut', 'dateFin', 'heures', 'jours', 'cachets', 'brut', 'estArtiste', 'confiance'],
};

const INSTRUCTION = `Tu lis une Attestation Employeur Mensuelle (AEM, CERFA Unédic annexes 8 et 10) du spectacle.
Extrais UNIQUEMENT les champs demandés depuis les cases du document :
- « Raison Sociale » (partie 2 EMPLOYEUR) -> production
- « Emploi occupé » (partie 4) -> poste
- « Date d'embauche » -> dateDebut (convertis en AAAA-MM-JJ)
- « Date de fin de contrat de travail » -> dateFin (convertis en AAAA-MM-JJ)
- « Nombre d'HEURES effectuées » -> heures (0 si la case est vide)
- « Nombre de JOURS travaillés » -> jours
- « Nombre de CACHETS » (isolés + groupés) -> cachets (0 si vide)
- « SALAIRES BRUTS » -> brut (le premier montant, pas le montant soumis à contributions)
- Case cochée Artiste -> estArtiste=true ; case Technicien ou Ouvrier -> estArtiste=false
N'invente aucune valeur : mets 0 si une case chiffrée est vide. Ne renvoie que le JSON.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY manquant (supabase secrets set).");
    const { fileBase64, mimeType } = await req.json();
    if (!fileBase64) throw new Error('Fichier manquant.');

    // Bloc PDF (document) ou image selon le type de fichier fourni par l'appli.
    const isPdf = (mimeType || '').includes('pdf');
    const fileBlock = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } }
      : { type: 'image', source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: fileBase64 } };

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        // claude-opus-4-8 = lecture la plus fiable. Pour réduire le coût par import, tu peux
        // basculer sur 'claude-sonnet-5' ou 'claude-haiku-4-5' (la mise en page XOTIS est simple).
        model: 'claude-opus-4-8',
        max_tokens: 1024,
        output_config: { format: { type: 'json_schema', schema: AEM_SCHEMA } },
        messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: INSTRUCTION }] }],
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      throw new Error('Analyse impossible (' + resp.status + '): ' + t.slice(0, 300));
    }
    const data = await resp.json();
    // Avec output_config.format, le 1er bloc texte est un JSON valide et conforme au schéma.
    const textBlock = (data.content || []).find((b: any) => b.type === 'text');
    const fields = JSON.parse(textBlock?.text || '{}');
    return new Response(JSON.stringify({ ok: true, fields }), { headers: { ...cors, 'content-type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message || e) }), {
      status: 400, headers: { ...cors, 'content-type': 'application/json' },
    });
  }
});
