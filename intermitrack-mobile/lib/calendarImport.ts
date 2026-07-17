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
  note?: string;          // info « à vérifier » (ex : heures sup à ajouter sur un contrat multi-jours)
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
  // La partie décimale est CAPTURÉE : sans ça, "191.48 €" laissait le € collé à ".48"
  // et le prix se lisait "48". On reconstruit donc 191 + 48/100 = 191,48.
  const euro = text.match(/(?:^|[^\dh])(\d[\d ]{0,6}\d|\d)(?:[.,](\d{1,2}))?\s*(?:€|euros?)/i);
  if (euro) {
    let n = Number(euro[1].replace(/\s/g, ''));
    if (euro[2] != null) n += Number(euro[2]) / (euro[2].length === 1 ? 10 : 100);
    if (n >= 20 && n <= 99999) gross = Math.round(n * 100) / 100;
  } else {
    const nums = (text.match(/\d{2,4}/g) || [])
      .map(Number)
      .filter((n) => n >= 100 && n <= 9999 && !(n >= 1990 && n <= 2099));
    if (nums.length) gross = nums[0];
  }

  // Nom de prod = le titre débarrassé du prix et des heures.
  let prod = (title || '')
    .replace(/(^|[^\dh])(\d[\d ]{0,6}\d|\d)(?:[.,]\d{1,2})?\s*(?:€|euros?)/gi, '$1 ')
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
  const skipped: string[] = [];
  let idx = 0;
  // Bloc « en attente » : les brouillons de la dernière ligne-date, qu'une ligne de détail
  // (heures/prix sur la ligne du dessous) vient compléter. Beaucoup notent sur 2 lignes.
  let block: MissionDraft[] = [];

  // Applique heures + prix à un bloc de N jours (depuis la ligne-date elle-même OU la ligne de détail).
  const fill = (drafts: MissionDraft[], textHours: number | null, gross: number) => {
    const N = drafts.length; if (!N) return;
    const hoursFound = textHours != null && textHours > 0 && textHours <= 24 * Math.max(1, N);
    if (hoursFound) {
      const total = textHours as number;
      if (N === 1) {
        drafts[0].hours = total; drafts[0].note = undefined;
      } else {
        // JAMAIS total ÷ jours : la base est defaultHours/jour ; le surplus = heures sup à ajouter à la main.
        const base = defaultHours;
        const extra = Math.round((total - N * base) * 10) / 10;
        drafts.forEach((d) => {
          d.hours = base;
          if (extra > 0) d.note = `${N} jours × ${base}h = ${N * base}h ; tu as noté ${total}h → ajoute les ${extra}h en plus sur le bon jour.`;
          else if (extra < 0) d.note = `Tu as noté ${total}h pour ${N} jours (base ${N * base}h) — vérifie les heures.`;
          else d.note = undefined;
        });
      }
    }
    drafts.forEach((d) => { d.missing = d.missing.filter((m) => m !== 'heures'); if (!hoursFound) d.missing.push('heures'); });
    const priceFound = gross > 0;
    if (priceFound) {
      // Prix réparti à parts égales sur les jours (ajustable dans l'aperçu) ; reliquat sur le 1er.
      const per = Math.round((gross / N) * 100) / 100;
      let acc = 0;
      drafts.forEach((d, i) => { d.gross_amount = i === N - 1 ? Math.round((gross - acc) * 100) / 100 : per; acc += per; });
    } else if (defaultPrice > 0) {
      drafts.forEach((d) => { d.gross_amount = defaultPrice; });
    }
    drafts.forEach((d) => { d.missing = d.missing.filter((m) => m !== 'prix'); if (!priceFound) d.missing.push('prix'); });
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const digits = (line.match(/\d/g) || []).length;
    const asMonth = monthOfLine(line);
    if (asMonth && digits === 0) { curMonth = asMonth; block = []; continue; }

    let work = line.replace(/^[^\p{L}\p{N}]+/u, '');
    const numBullet = work.match(/^\d{1,2}[.)]\s*(?=\d{1,2}[\/\-.]\d{1,2})/);
    if (numBullet) work = work.slice(numBullet[0].length);

    // --- Dates de la ligne (une ou plusieurs) ---
    let dates: string[] = [];
    let rest = work;
    let rangeNote: string | undefined;

    // Plage « X au Y » : un contrat sur une période. Si c'est 2 jours (début + fin), ce sont
    // FORCÉMENT ces 2 dates → 2 missions (retour Justine). Au-delà de 2 jours, impossible de
    // deviner lesquels : on met la 1re date et on signale de compléter les autres à la main.
    const rng = work.match(/^(\d{1,2})(?:[\/\-.](\d{1,2}))?\s*(?:au|à)\s*(\d{1,2})(?:[\/\-.](\d{1,2}))?(?=\s|$)/i);
    if (rng) {
      const d1 = +rng[1], m1 = rng[2] ? +rng[2] : curMonth;
      const d2 = +rng[3], m2 = rng[4] ? +rng[4] : (m1 || curMonth);
      if (m1 && m2 && d1 >= 1 && d1 <= 31 && d2 >= 1 && d2 <= 31) {
        const iso1 = `${year}-${String(m1).padStart(2, '0')}-${String(d1).padStart(2, '0')}`;
        const iso2 = `${year}-${String(m2).padStart(2, '0')}-${String(d2).padStart(2, '0')}`;
        const span = Math.round((Date.UTC(year, m2 - 1, d2) - Date.UTC(year, m1 - 1, d1)) / 86400000) + 1;
        if (span === 2) dates = [iso1, iso2];
        else { dates = [iso1]; if (span > 2) rangeNote = `Contrat du ${d1}/${m1} au ${d2}/${m2} : ajoute les autres jours travaillés à la main (l'appli ne peut pas deviner lesquels).`; }
        rest = work.slice(rng[0].length);
      }
    }

    // Multi-jours sous un en-tête de mois : suite d'au moins 2 jours en tête, séparés par « / », « - » ou espace.
    // Ex : « 6/7 FRTV », « 16 17 FRTV », « 24/25/26 AMP ». Prioritaire sur jj/mm quand un mois est en en-tête.
    const multi = curMonth ? work.match(/^(\d{1,2}(?:\s*[\/\-]\s*\d{1,2}|\s+\d{1,2})+)(?=\s|$)/) : null;
    if (!dates.length && multi) {
      const nums = multi[1].split(/[\/\-\s]+/).map(Number).filter((n) => n >= 1 && n <= 31);
      if (nums.length >= 2) { dates = nums.map((d) => `${year}-${String(curMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`); rest = work.slice(multi[0].length); }
    }
    // Date explicite jj/mm(/aaaa).
    if (!dates.length) {
      const ex = work.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\b/);
      if (ex && +ex[2] >= 1 && +ex[2] <= 12 && +ex[1] >= 1 && +ex[1] <= 31) {
        const y = ex[3] ? (ex[3].length === 2 ? 2000 + +ex[3] : +ex[3]) : year;
        dates = [`${y}-${String(+ex[2]).padStart(2, '0')}-${String(+ex[1]).padStart(2, '0')}`];
        rest = work.slice(ex[0].length);
      }
    }
    // Jour simple sous un en-tête de mois.
    if (!dates.length && curMonth) {
      const dayM = work.match(/^(?:(?:lun|mar|mer|jeu|ven|sam|dim)[a-zàâäéèêëîïôöûüç.]*\s+)?(\d{1,2})\b/i);
      if (dayM && +dayM[1] >= 1 && +dayM[1] <= 31) { dates = [`${year}-${String(curMonth).padStart(2, '0')}-${String(+dayM[1]).padStart(2, '0')}`]; rest = work.slice(dayM[0].length); }
    }

    if (dates.length) {
      const parsed = parseEventText(rest, '');
      const prodUp = (parsed.prod || '').replace(/[.\s]+$/, '').toUpperCase();
      const drafts: MissionDraft[] = dates.map((dt) => ({
        key: `note-${idx++}-${dt}`, selected: true, production: prodUp,
        mission_date: dt, end_date: null, hours: defaultHours, gross_amount: 0, lieu: null, title: line, missing: [],
      }));
      if (!prodUp.trim()) drafts.forEach((d) => d.missing.push('prod'));
      const hasDetail = (parsed.textHours != null && parsed.textHours > 0) || parsed.gross > 0;
      fill(drafts, parsed.textHours, parsed.gross);
      if (rangeNote) drafts.forEach((d) => { d.note = rangeNote; }); // plage > 2 jours : jours à compléter
      out.push(...drafts);
      block = hasDetail ? [] : drafts; // pas de détail sur la ligne → on attend la ligne suivante
      continue;
    }

    // --- Pas de date : ligne de DÉTAIL (heures/prix) qui complète le bloc précédent ? ---
    const det = parseEventText(work, '');
    const hasDetail = (det.textHours != null && det.textHours > 0) || det.gross > 0;
    if (block.length && hasDetail) { fill(block, det.textHours, det.gross); block = []; continue; }
    skipped.push(line);
  }
  out.sort((a, b) => a.mission_date.localeCompare(b.mission_date));
  return { drafts: out, skipped };
}

// Calendriers "système" à écarter par leur nom (fériés, anniversaires, abonnements, météo…).
const CAL_EXCLUDE = /f[eé]ri|holiday|anniversaire|birthday|f[eê]te|vacance|scolaire|school|contacts?|sport|m[eé]t[eé]o|weather|lunar|lunaire/i;

// Liste des calendriers du téléphone, pour laisser l'utilisateur choisir lequel scanner.
// On masque les calendriers système (par leur nom). `suggested` = calendrier perso modifiable → pré-coché.
export async function listCalendars(): Promise<{ status: string; calendars: { id: string; title: string; color: string; suggested: boolean }[] }> {
  const perm = await Calendar.requestCalendarPermissionsAsync();
  if (perm.status !== 'granted') return { status: perm.status, calendars: [] };
  const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const calendars = cals
    .filter((c: any) => !CAL_EXCLUDE.test(`${c.title || ''} ${(c.name || '')} ${(c.source && c.source.name) || ''}`))
    .map((c: any) => ({ id: c.id, title: c.title || c.name || 'Calendrier', color: c.color || '#1F4E5F', suggested: c.allowsModifications !== false }));
  return { status: 'granted', calendars };
}

// Demande l'accès, récupère les événements sur la période et les analyse.
// onlyIds : si fourni, on scanne EXACTEMENT ces calendriers (choix de l'utilisateur) ; sinon,
// tous les calendriers perso modifiables (comportement par défaut).
export async function scanCalendar(
  monthsBack = 12,
  monthsForward = 12,
  defaultHours = 8,
  onlyIds?: string[]
): Promise<{ status: string; drafts: MissionDraft[] }> {
  const perm = await Calendar.requestCalendarPermissionsAsync();
  if (perm.status !== 'granted') return { status: perm.status, drafts: [] };

  let ids: string[];
  if (onlyIds && onlyIds.length) {
    ids = onlyIds;
  } else {
    const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const usable = cals.filter((c: any) => {
      const label = `${c.title || ''} ${(c.name || '')} ${(c.source && c.source.name) || ''}`;
      if (CAL_EXCLUDE.test(label)) return false;
      if (c.allowsModifications === false) return false; // fériés/anniversaires = non modifiables
      return true;
    });
    const chosen = usable.length ? usable : cals;
    ids = chosen.map((c: any) => c.id);
  }
  if (!ids.length) return { status: 'granted', drafts: [] };

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + monthsForward, 28);

  const events = await Calendar.getEventsAsync(ids, start, end);
  const startT = start.getTime(), endT = end.getTime();
  const drafts = (events || [])
    .filter((e: any) => e && e.title && e.status !== 'canceled' && !CAL_EXCLUDE.test(String(e.title)))
    // Garde-fou iOS : pour un évènement RÉCURRENT, getEventsAsync peut renvoyer une occurrence datée à
    // la CRÉATION de la série (ex. 2021) au lieu de sa date dans la fenêtre demandée → missions fantômes.
    // On écarte donc tout évènement dont la date sort de la fenêtre réellement interrogée.
    .filter((e: any) => { const t = new Date(e.startDate).getTime(); return isFinite(t) && t >= startT && t <= endT; })
    .map((e: any) => eventToDraft(e, defaultHours))
    .sort((a, b) => a.mission_date.localeCompare(b.mission_date));

  return { status: 'granted', drafts };
}
