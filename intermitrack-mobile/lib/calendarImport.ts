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

  // Heures écrites dans le texte : "8h", "10 h", "7,5h", "8h30"
  let textHours: number | null = null;
  const h = text.match(/(\d{1,2})(?:[.,](\d))?\s*h(?:\s*(\d{2}))?/i);
  if (h) {
    if (h[2] != null) textHours = Number(h[1]) + Number(h[2]) / 10;       // "7,5h"
    else if (h[3] != null) textHours = Number(h[1]) + Number(h[3]) / 60;  // "8h30"
    else textHours = Number(h[1]);                                        // "8h"
  }

  // Prix : d'abord un nombre suivi de € / euros ; sinon un nombre plausible (100–9999, pas une année).
  let gross = 0;
  const euro = text.match(/(\d[\d ]{0,6}\d|\d)\s*(?:€|euros?)/i);
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
    .replace(/(\d[\d ]{0,6}\d|\d)\s*(?:€|euros?)/gi, ' ')
    .replace(/\b\d{1,2}(?:[.,]\d)?\s*h\b/gi, ' ')
    .replace(/\b\d{3,4}\b/g, ' ')
    .replace(/[·|,;/]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!prod) prod = (title || '').trim();

  return { gross, textHours, prod };
}

// Transforme un événement du calendrier en brouillon de mission.
export function eventToDraft(ev: any): MissionDraft {
  const start = new Date(ev.startDate);
  const endRaw = new Date(ev.endDate || ev.startDate);
  const allDay = !!ev.allDay;
  const { gross, textHours, prod } = parseEventText(ev.title || '', ev.notes || '');

  // Heures : vraie durée si l'événement est horodaté, sinon les heures écrites.
  // hoursFound = on a une vraie info (on n'invente pas). Sinon 8 h par défaut mais signalé "à compléter".
  let hours = 8;
  let hoursFound = false;
  if (!allDay) {
    const diff = (endRaw.getTime() - start.getTime()) / 3600000;
    if (diff > 0 && diff <= 24) { hours = Math.round(diff * 2) / 2; hoursFound = true; }
    else if (textHours != null) { hours = textHours; hoursFound = true; }
  } else if (textHours != null) { hours = textHours; hoursFound = true; }

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

// Demande l'accès, lit tous les calendriers, récupère les événements sur la période et les analyse.
export async function scanCalendar(
  monthsBack = 12,
  monthsForward = 12
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
    .map(eventToDraft)
    .sort((a, b) => a.mission_date.localeCompare(b.mission_date));

  return { status: 'granted', drafts };
}
