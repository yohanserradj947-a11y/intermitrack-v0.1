import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const GROUP = 'group.fr.intermitrack.app';
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Dégradés auto (identiques au calendrier de l'app : passé pétrole→vert, futur orange).
const GRAD_PAST = ['#1F4E5F', '#2F8F6B'];
const GRAD_FUTURE = ['#F97316', '#FDBA74'];

// --- Helpers couleur (repris tels quels de lib/prodColors) ---
function shade(hex: string, amt: number): string {
  const h = (hex || '').replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(f, 16) || 0;
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) { r = r + (255 - r) * amt; g = g + (255 - g) * amt; b = b + (255 - b) * amt; }
  else { const k = 1 + amt; r *= k; g *= k; b *= k; }
  const to = (x: number) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0');
  return '#' + to(r) + to(g) + to(b);
}
function prodGradient(hex: string): string[] { return [shade(hex, -0.14), hex, shade(hex, 0.36)]; }
function textOn(hex: string): string {
  const h = (hex || '').replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(f, 16) || 0;
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luma > 0.62 ? '#1A2330' : '#FFFFFF';
}
// Notes (repris de lib/notes)
function noteAbbr(title: string) { return (title || 'NOTE').trim().slice(0, 3).toUpperCase(); }
function isDateInNote(dateStr: string, n: any) { const end = n.endDate || n.date; return dateStr >= n.date && dateStr <= end; }
function daysInclusive(a: string, b: string) {
  const A = new Date(a + 'T00:00:00'), B = new Date((b || a) + 'T00:00:00');
  return Math.max(1, Math.round((B.getTime() - A.getTime()) / 86400000) + 1);
}

// Calcule et écrit les données des widgets iOS dans l'App Group partagé, puis recharge les widgets.
// Reproduit fidèlement le calendrier de l'app : couleurs par prod, dégradés auto, missions
// multi-jours, notes (jour note-seule hachuré + pastille sur mission+note). Ne fait rien hors iOS.
export async function syncWidgets(missions: any[], getColor: (name: string) => string | null, notes: any[] = []) {
  if (Platform.OS !== 'ios') return;
  let ExtensionStorage: any;
  try { ExtensionStorage = require('@bacons/apple-targets').ExtensionStorage; } catch (e) { return; }
  if (!ExtensionStorage) return;

  try {
    const storage = new ExtensionStorage(GROUP);
    const now = new Date();
    const todayISO = ymd(now);
    const areDate = await AsyncStorage.getItem('intermitrack_are_date'); // 'YYYY-MM-DD' ou null

    // --- Heures / 507h : DEPUIS la date ARE (période de droits France Travail), comme l'app ---
    let done = 0, planned = 0;
    missions.forEach((m) => {
      const ms = m.mission_date || '';
      if (!ms) return;
      if (areDate && ms < areDate) return; // avant la date ARE → hors période
      const end = m.end_date || m.mission_date || '';
      if (end < todayISO) done += Number(m.hours || 0);         // passée
      else if (ms > todayISO) planned += Number(m.hours || 0);  // à venir
      else done += Number(m.hours || 0);                        // en cours → comptée en fait
    });
    storage.set('widget_hours', JSON.stringify({ done: Math.round(done), planned: Math.round(planned), target: 507 }));

    // --- Prochaine mission ---
    const upcomingList = missions
      .filter((m) => (m.mission_date || '') >= todayISO)
      .sort((a, b) => (a.mission_date || '').localeCompare(b.mission_date || ''));
    const nm = upcomingList[0];
    if (nm) {
      const d = new Date(nm.mission_date + 'T00:00:00');
      const diff = Math.round((d.getTime() - new Date(todayISO + 'T00:00:00').getTime()) / 86400000);
      const when = diff <= 0 ? "Aujourd'hui" : diff === 1 ? 'Demain' : d.toLocaleDateString('fr-FR', { weekday: 'short' });
      const dateStr = d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' });
      storage.set('widget_next', JSON.stringify({
        when, date: dateStr, prod: (nm.production || '').toUpperCase(),
        lieu: nm.lieu || '', hours: Number(nm.hours || 0), price: Number(nm.gross_amount || 0),
      }));
    } else {
      storage.remove('widget_next');
    }

    // --- Calendrier du mois courant (reproduction fidèle de l'app) ---
    const y = now.getFullYear(), mo = now.getMonth();
    const daysInMonth = new Date(y, mo + 1, 0).getDate();
    let fw = new Date(y, mo, 1).getDay(); // 0=dim..6=sam
    fw = fw === 0 ? 7 : fw;               // 1=lun..7=dim

    const days: any[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dISO = ymd(new Date(y, mo, day));
      // Missions couvrant ce jour (plage début→fin), dans l'ordre du calendrier (trié par date).
      const covering = missions.filter((m) => {
        const s = m.mission_date || ''; if (!s) return false;
        const e = m.end_date || m.mission_date || s;
        return dISO >= s && dISO <= e;
      });
      const dayNotes = (notes || []).filter((n) => isDateInNote(dISO, n));
      const past = dISO < todayISO;

      if (covering.length > 0) {
        const first = covering[0];
        const prod = (first.production || '').toUpperCase();
        const custom = getColor(prod); // hex ou null
        const g = custom ? prodGradient(custom) : (past ? GRAD_PAST : GRAD_FUTURE);
        const per = daysInclusive(first.mission_date, first.end_date || first.mission_date);
        const hours = Math.round((Number(first.hours || 0) / per) * 10) / 10;
        days.push({
          d: day, ab: prod.slice(0, 3), g, txt: custom ? textOn(custom) : '#fff',
          hours, more: covering.length - 1,
          hach: !!(past && custom), // missions passées perso hachurées (comme l'app)
          note: dayNotes.length > 0 ? (dayNotes[0].color || '#1E6FE0') : '', // pastille si note en +
        });
      } else if (dayNotes.length > 0) {
        const n0 = dayNotes[0];
        const col = n0.color || '#1E6FE0';
        days.push({
          d: day, ab: noteAbbr(n0.title), g: prodGradient(col), txt: textOn(col),
          hours: 0, more: 0, hach: true, note: '', // note seule : toujours hachurée
        });
      }
      // sinon : jour vide (pas d'entrée)
    }

    // Prochaines missions (liste du grand widget calendrier)
    const up = upcomingList.slice(0, 3).map((m) => {
      const d = new Date(m.mission_date + 'T00:00:00');
      const prod = (m.production || '').toUpperCase();
      return {
        date: d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit' }),
        prod, color: getColor(prod) || '#1F4E5F',
        hours: Number(m.hours || 0), price: Number(m.gross_amount || 0),
      };
    });

    const title = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    storage.set('widget_calendar', JSON.stringify({
      title: title.charAt(0).toUpperCase() + title.slice(1),
      firstWeekday: fw, daysInMonth, today: now.getDate(), days, upcoming: up,
    }));

    ExtensionStorage.reloadWidget();
  } catch (e) { /* non bloquant */ }
}
