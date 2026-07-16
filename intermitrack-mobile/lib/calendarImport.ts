import * as Calendar from 'expo-calendar';

// Brouillon de mission détecté depuis un événement du calendrier du téléphone.
export type MissionDraft = {
  key: string;
  selected: boolean;
  production: string;
  mission_date: string;   // 'YYYY-MM-DD'
  end_date: string | null;
  hours: number;
  gross_amount: number;
  lieu: string | null;
  title: string;          // titre original (pour l'affichage)
  missing: string[];      // infos essentielles non trouvées : 'prod' | 'heures' | 'prix'
};

// Date locale au format 'YYYY-MM-DD' (comme le reste de l'app, sans fuseau).
function ymdLocal(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// Lit le texte d'un événement pour en tirer : le prix, les heures écrites, et le nom de prod.
// Volontairement tolérant : chacun écrit différemment → on récupère ce qu'on reconnaît.
export function parseEventText(title: string, notes: string) {
  const text = `${title || ''} ${notes || ''}`;

  // Toutes les mentions d'heures : "8h", "10 h", "7,5h", "8h30".
  // Le (?!\d) est capital : sans lui, le groupe des minutes avale le début du
  // prix et "TEST 12H 240" se lisait "12h24" → 12,4 heures.
  const RX = /(\d{1,2})(?:[.,](\d))?\s*h(?:\s*(\d{2})(?!\d))?/gi;
  const hits: number[] = [];
  for (const m of text.matchAll(RX)) {
    if (m[2] != null) hits.push(Number(m[1]) + Number(m[2]) / 10);       // "7,5h"
    else if (m[3] != null) hits.push(Number(m[1]) + Number(m[3]) / 60);  // "8h30"
    else hits.push(Number(m[1]));                                        // "8h"
  }

  // UNE seule mention = un nombre d'heures ("REC 12h") : c'est 80 % des cas.
  // DEUX ou plus = des horaires ("9h-17h") : la durée est leur écart.
  let textHours: number | null = null;
  if (hits.length === 1) {
    textHours = hits[0];
  } else if (hits.length >= 2) {
    let d = hits[hits.length - 1] - hits[0];
    if (d < 0) d += 24; // mission de nuit : "20h-2h" = 6 h
    if (d > 0 && d <= 24) textHours = Math.round(d * 2) / 2;
  }

  // Prix : d'abord un nombre suivi de € / euros ; sinon un nombre plausible (100–9999, pas une année).
  // Le (?:^|[^\dh]) empêche le prix de démarrer juste après un "h" : sans lui,
  // "18h30 520€" se lisait "30 520" (les espaces sont admis pour "1 200 €").
  let gross = 0;
  const euro = text.match(/(?:^|[^\dh])(\d[\d ]{0,6}\d|\d)\s*(?:€|euros?)/i);
  if (euro) {
    const n = Number(euro[1].replace(/\s/g, ''));
    if (n >= 20 && n <= 99999) gross = n;
  } else {
    const nums = (text.match(/\d{2,4}/g) || [])
      .map(Number)
      .filter((n) => n >= 100 && n <= 9999 && !(n >= 1990 && n <= 2099));
    if (nums.length) gross = nums[0];
  }

  // Nom de prod = le titre débarrassé du prix et des heures.
  let prod = (title || '')
    .replace(/(^|[^\dh])(\d[\d ]{0,6}\d|\d)\s*(?:€|euros?)/gi, '$1 ')
    // Même motif que ci-dessus : "8h30" doit partir en entier, pas laisser "30".
    .replace(/\d{1,2}(?:[.,]\d)?\s*h(?:\s*\d{2}(?!\d))?/gi, ' ')
    .replace(/\b\d{3,4}\b/g, ' ')
    .replace(/[·|,;/]+/g, ' ')
    .replace(/\s+-+\s*|^\s*-+|-+\s*$/g, ' ') // tirets orphelins laissés par "9h-17h"
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!prod) prod = (title || '').trim();

  return { gross, textHours, prod };
}

// Transforme un événement du calendrier en brouillon de mission.
// defaultHours : la valeur de repli quand l'événement ne dit rien. 8 h pour un
// technicien, 12 h (un cachet) pour un artiste — l'appelant tranche via
// modeForNew(), on ne redécide pas ici.
export function eventToDraft(ev: any, defaultHours = 8): MissionDraft {
  const start = new Date(ev.startDate);
  const endRaw = new Date(ev.endDate || ev.startDate);
  const allDay = !!ev.allDay;
  const { gross, textHours, prod } = parseEventText(ev.title || '', ev.notes || '');

  // Ce qui est ÉCRIT prime sur la durée du créneau : quelqu'un qui note "REC 12h"
  // sur un créneau d'une heure travaille 12 h — le créneau n'est qu'un repère.
  // À défaut d'heures écrites, on retombe sur la vraie durée du créneau.
  // hoursFound = on a une vraie info (on n'invente pas). Sinon la valeur de repli, signalée.
  let hours = defaultHours;
  let hoursFound = false;
  if (textHours != null && textHours > 0 && textHours <= 24) {
    hours = textHours; hoursFound = true;
  } else if (!allDay) {
    const diff = (endRaw.getTime() - start.getTime()) / 3600000;
    // Strictement moins de 24 h : un créneau de minuit à minuit est une journée
    // entière déguisée (agendas synchronisés, créneau posé à la main) et n'a pas
    // toujours le drapeau allDay. Personne ne travaille 24 h : on préfère 8 h
    // signalé « à compléter » plutôt que 24 h validé en silence.
    if (diff > 0 && diff < 24) { hours = Math.round(diff * 2) / 2; hoursFound = true; }
  }

  // Dates : les "journée entière" ont une fin exclusive (minuit du lendemain) → on retire 1 ms.
  const startDay = ymdLocal(start);
  const endInclusive = allDay ? new Date(endRaw.getTime() - 1) : endRaw;
  const endDay = ymdLocal(endInclusive);
  const end_date = endDay > startDay ? endDay : null;

  // On signale ce qui n'a PAS été trouvé dans l'événement : prod, heures, prix.
  const missing: string[] = [];
  if (!prod || !prod.trim()) missing.push('prod');
  if (!hoursFound) missing.push('heures');
  if (!(gross > 0)) missing.push('prix');

  return {
    key: String(ev.id || `${startDay}-${prod}`),
    selected: true,
    production: prod.toUpperCase(),
    mission_date: startDay,
    end_date,
    hours,
    gross_amount: gross,
    lieu: (ev.location || '').trim() || null,
    title: (ev.title || '').trim(),
    missing,
  };
}

// ---------------------------------------------------------------------------
// Import « Coller mes notes » : beaucoup de gens notent leurs dates en texte
// libre (Notes du téléphone), sous un en-tête de mois. Ex :
//   MARS
//   18 vdlm 8h 230
//   19 endemol 12h 450
// On lit chaque ligne avec la MÊME logique que l'import calendrier (parseEventText).
// L'année n'est presque jamais écrite → l'appelant la fait confirmer (defaut = année
// en cours) ; une ligne qui précise jj/mm/aaaa garde SON année, elle.
// ---------------------------------------------------------------------------
const MONTH_PREFIX: [RegExp, number][] = [
  [/^janv/i, 1], [/^f[eé]v/i, 2], [/^mars/i, 3], [/^avr/i, 4], [/^mai$/i, 5], [/^juin/i, 6],
  [/^juil/i, 7], [/^ao[uû]t/i, 8], [/^sept/i, 9], [/^oct/i, 10], [/^nov/i, 11], [/^d[eé]c/i, 12],
];
function monthOfLine(line: string): number | null {
  const w = line.replace(/[^a-zàâäéèêëîïôöûüç]/gi, '');
  if (!w) return null;
  for (const [rx, m] of MONTH_PREFIX) { if (rx.test(w)) return m; }
  return null;
}
export function parseNotesText(text: string, year: number, defaultHours = 8, defaultPrice = 0): { drafts: MissionDraft[]; skipped: string[] } {
  const lines = String(text || '').split(/\r?\n/);
  let curMonth: number | null = null;
  const out: MissionDraft[] = [];
  const skipped: string[] = []; // lignes non blanches qu'on n'a pas su lire → montrées dans l'erreur
  let idx = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // En-tête de mois : que des lettres (aucun chiffre) et ça matche un mois.
    const digits = (line.match(/\d/g) || []).length;
    const asMonth = monthOfLine(line);
    if (asMonth && digits === 0) { curMonth = asMonth; continue; }

    // On enlève TOUT caractère de tête qui n'est ni lettre ni chiffre : puces (*, •, -, –,
    // ▪, ‣, →, +, emoji…), espaces insécables, etc. Robuste à n'importe quel format.
    let work = line.replace(/^[^\p{L}\p{N}]+/u, '');
    // Numéro de liste (« 1. », « 2) ») SUIVI d'une date → puce ; le lookahead évite de
    // casser un vrai « 18.03 » (jj.mm).
    const numBullet = work.match(/^\d{1,2}[.)]\s*(?=\d{1,2}[\/\-.]\d{1,2})/);
    if (numBullet) work = work.slice(numBullet[0].length);

    // Date explicite jj/mm(/aaaa) → prioritaire sur l'année confirmée. On prend la 1re
    // occurrence VALIDE (mois 1-12), pas la première venue.
    let dateISO: string | null = null;
    let rest = work;
    const re = /(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?/g;
    let mt: RegExpExecArray | null;
    while ((mt = re.exec(work))) {
      const d = +mt[1], mo = +mt[2];
      if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
        const y = mt[3] ? (mt[3].length === 2 ? 2000 + +mt[3] : +mt[3]) : year;
        dateISO = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        rest = work.slice(0, mt.index) + ' ' + work.slice(mt.index + mt[0].length);
        break;
      }
    }
    // Sinon : ligne « jour + reste » sous un en-tête de mois (avec ou sans jour de semaine devant).
    if (!dateISO && curMonth) {
      const dayM = work.match(/^(?:(?:lun|mar|mer|jeu|ven|sam|dim)[a-zàâäéèêëîïôöûüç.]*\s+)?(\d{1,2})\b/i);
      if (dayM) {
        const d = +dayM[1];
        if (d >= 1 && d <= 31) { dateISO = `${year}-${String(curMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`; rest = work.slice(dayM[0].length); }
      }
    }
    if (!dateISO) { skipped.push(line); continue; } // non reconnue → on la garde pour l'afficher

    const parsed = parseEventText(rest, '');
    const prod = parsed.prod, textHours = parsed.textHours;
    const hoursFound = textHours != null && textHours > 0 && textHours <= 24;
    const hours = hoursFound ? (textHours as number) : defaultHours;
    // Prix : celui écrit ; sinon le salaire journalier du profil s'il est renseigné (à vérifier).
    const priceFound = parsed.gross > 0;
    const gross = priceFound ? parsed.gross : (defaultPrice > 0 ? defaultPrice : 0);
    const missing: string[] = [];
    if (!prod || !prod.trim()) missing.push('prod');
    if (!hoursFound) missing.push('heures');
    if (!priceFound) missing.push('prix');
    out.push({
      key: `note-${idx++}-${dateISO}`,
      selected: true,
      production: (prod || '').replace(/[.\s]+$/, '').toUpperCase(),
      mission_date: dateISO,
      end_date: null,
      hours,
      gross_amount: gross,
      lieu: null,
      title: line,
      missing,
    });
  }
  out.sort((a, b) => a.mission_date.localeCompare(b.mission_date));
  return { drafts: out, skipped };
}

// Demande l'accès, lit tous les calendriers, récupère les événements sur la période et les analyse.
export async function scanCalendar(
  monthsBack = 12,
  monthsForward = 12,
  defaultHours = 8
): Promise<{ status: string; drafts: MissionDraft[] }> {
  const perm = await Calendar.requestCalendarPermissionsAsync();
  if (perm.status !== 'granted') return { status: perm.status, drafts: [] };

  const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  // On écarte les calendriers "système" : jours fériés, anniversaires, abonnements en lecture seule
  // (ce sont eux qui polluent avec les fêtes nationales, etc.). On garde tes calendriers modifiables.
  const EXCLUDE = /f[eé]ri|holiday|anniversaire|birthday|f[eê]te|vacance|scolaire|school|contacts?|sport|m[eé]t[eé]o|weather|lunar|lunaire/i;
  const usable = cals.filter((c: any) => {
    const label = `${c.title || ''} ${(c.name || '')} ${(c.source && c.source.name) || ''}`;
    if (EXCLUDE.test(label)) return false;
    if (c.allowsModifications === false) return false; // fériés/anniversaires = non modifiables
    return true;
  });
  const chosen = usable.length ? usable : cals;
  const ids = chosen.map((c: any) => c.id);
  if (!ids.length) return { status: 'granted', drafts: [] };

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + monthsForward, 28);

  const events = await Calendar.getEventsAsync(ids, start, end);
  const drafts = (events || [])
    .filter((e: any) => e && e.title && e.status !== 'canceled' && !EXCLUDE.test(String(e.title)))
    .map((e: any) => eventToDraft(e, defaultHours))
    .sort((a, b) => a.mission_date.localeCompare(b.mission_date));

  return { status: 'granted', drafts };
}
