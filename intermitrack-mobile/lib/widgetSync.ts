import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const GROUP = 'group.fr.intermitrack.app';
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Calcule et écrit les données des widgets iOS dans l'App Group partagé, puis recharge les widgets.
// Ne fait rien hors iOS (ou si le module natif n'est pas présent, ex. Expo Go).
export async function syncWidgets(missions: any[], getColor: (name: string) => string | null) {
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
    const upcoming = missions
      .filter((m) => (m.mission_date || '') >= todayISO)
      .sort((a, b) => (a.mission_date || '').localeCompare(b.mission_date || ''));
    const nm = upcoming[0];
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

    // --- Calendrier du mois courant ---
    const y = now.getFullYear(), mo = now.getMonth();
    const daysInMonth = new Date(y, mo + 1, 0).getDate();
    let fw = new Date(y, mo, 1).getDay(); // 0=dim..6=sam
    fw = fw === 0 ? 7 : fw;               // 1=lun..7=dim
    const firstOfDay: Record<number, any> = {};
    missions.forEach((m) => {
      const d = new Date((m.mission_date || '') + 'T00:00:00');
      if (!isNaN(d.getTime()) && d.getFullYear() === y && d.getMonth() === mo) {
        const day = d.getDate();
        if (!firstOfDay[day]) firstOfDay[day] = m;
      }
    });
    const days = Object.keys(firstOfDay).map((k) => {
      const day = Number(k), m = firstOfDay[day];
      const prod = (m.production || '').toUpperCase();
      return { d: day, ab: prod.slice(0, 3), color: getColor(prod) || '#1F4E5F', past: ymd(new Date(y, mo, day)) < todayISO };
    });
    // Prochaines missions (pour le grand widget calendrier)
    const up = missions
      .filter((m) => (m.mission_date || '') >= todayISO)
      .sort((a, b) => (a.mission_date || '').localeCompare(b.mission_date || ''))
      .slice(0, 3)
      .map((m) => {
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
