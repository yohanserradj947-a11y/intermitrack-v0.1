// Notifications locales (rappels) — spec Yohan :
//  • Rappel MISSION la veille (J-1) vers 17h30, UNE seule notif même si plusieurs missions ce jour-là.
//  • Actualisation France Travail — OUVERTURE : le 28 (« tu peux t'actualiser »).
//  • Actualisation France Travail — QUASI FERMETURE : l'avant-dernier jour du mois (dernier rappel).
//  • Rappel « NOTE l'appli » : UNE seule fois par appareil (jamais répété), quelques jours après
//    l'installation/le 1er lancement.
// Tout est LOCAL (aucun serveur). iOS plafonne à 64 notifs en attente → on borne à 60 par sécurité.
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const MAX_PENDING = 60; // marge sous le plafond iOS (64)

// Rappel « note l'appli » : quelques jours après le 1er lancement, puis PLUS JAMAIS.
const RATE_DELAY_DAYS = 3;
const RATE_AT_KEY = 'itk_rate_notif_at';     // date (ISO) prévue pour le rappel
const RATE_DONE_KEY = 'itk_rate_notif_done'; // '1' une fois le rappel passé

// Affichage même app ouverte (SDK 54 : shouldShowBanner / shouldShowList).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
  }),
});

async function ensurePermission(): Promise<boolean> {
  if (!Device.isDevice) return false; // pas de notifs sur simulateur
  const { status } = await Notifications.getPermissionsAsync();
  let final = status;
  if (status !== 'granted') final = (await Notifications.requestPermissionsAsync()).status;
  if (final !== 'granted') return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Rappels', importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  return true;
}

type Item = { date: Date; title: string; body: string };

function buildItems(missions: { mission_date: string; production?: string }[]): Item[] {
  const now = new Date();
  const items: Item[] = [];

  // 1) Rappels MISSION J-1 à 17h30 — dédupliqués par jour de mission.
  const seenDays = new Set<string>();
  for (const m of missions) {
    if (!m.mission_date || seenDays.has(m.mission_date)) continue;
    const start = new Date(m.mission_date + 'T00:00:00');
    if (isNaN(start.getTime()) || start <= now) continue;
    seenDays.add(m.mission_date);
    const remind = new Date(start); remind.setDate(remind.getDate() - 1); remind.setHours(17, 30, 0, 0);
    if (remind > now) {
      const sameDay = missions.filter((x) => x.mission_date === m.mission_date);
      const body = sameDay.length > 1
        ? `Tu as ${sameDay.length} missions demain. Prépare ta journée 🎬`
        : `Tu as une mission demain${m.production ? ` (${m.production})` : ''}. Prépare ta journée 🎬`;
      items.push({ date: remind, title: 'Mission demain', body });
    }
  }

  // 2) Actualisation France Travail — OUVERTURE (le 28) puis QUASI FERMETURE (avant-dernier jour),
  //    programmées 6 mois à l'avance.
  for (let i = 0; i < 6; i++) {
    const y = now.getFullYear(), mo = now.getMonth() + i;
    const d28 = new Date(y, mo, 28, 11, 0, 0);
    if (d28 > now) items.push({
      date: d28,
      title: "Actualisation ouverte",
      body: "C'est le moment de t'actualiser sur ton espace France Travail 📋",
    });
    const lastDay = new Date(y, mo + 1, 0).getDate();
    const jm1 = new Date(y, mo, lastDay - 1, 11, 0, 0);
    if (jm1 > now && jm1.getDate() !== 28) items.push({
      date: jm1,
      title: "Dernier rappel actualisation",
      body: "Pense à t'actualiser avant la clôture, sinon tu risques de perdre tes droits ⏰",
    });
  }

  return items;
}

// Rappel « note l'appli » : programmé UNE seule fois par appareil, puis marqué comme fait.
async function buildRateItem(now: Date): Promise<Item | null> {
  try {
    const done = await AsyncStorage.getItem(RATE_DONE_KEY);
    if (done) return null; // déjà passé → plus jamais
    let atStr = await AsyncStorage.getItem(RATE_AT_KEY);
    let at: Date;
    if (!atStr) {
      at = new Date(now.getTime() + RATE_DELAY_DAYS * 24 * 3600 * 1000);
      await AsyncStorage.setItem(RATE_AT_KEY, at.toISOString());
    } else {
      at = new Date(atStr);
    }
    if (isNaN(at.getTime())) return null;
    if (at <= now) { await AsyncStorage.setItem(RATE_DONE_KEY, '1'); return null; } // l'heure est passée → fait
    return {
      date: at,
      title: "Un petit coup de pouce ? ⭐",
      body: "Si Intermitrack t'aide au quotidien, prends 10 secondes pour le noter. Ça aide énormément à le faire connaître 🙏",
    };
  } catch (e) { return null; }
}

export async function syncNotifications(missions: { mission_date: string; production?: string }[]) {
  try {
    const ok = await ensurePermission();
    if (!ok) return;
    await Notifications.cancelAllScheduledNotificationsAsync();
    const now = new Date();
    const items = buildItems(missions || []);
    const rate = await buildRateItem(now);
    if (rate) items.push(rate);
    items.sort((a, b) => a.date.getTime() - b.date.getTime());
    for (const it of items.slice(0, MAX_PENDING)) {
      await Notifications.scheduleNotificationAsync({
        content: { title: it.title, body: it.body },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: it.date },
      });
    }
  } catch (e) { /* silencieux : les notifs ne doivent jamais bloquer l'appli */ }
}

// Composant monté une fois (dans le layout des onglets) : récupère les missions à venir et
// (re)programme les rappels au lancement et à chaque retour au premier plan.
export function NotificationsSync() {
  const busy = useRef(false);
  async function run() {
    if (busy.current) return; busy.current = true;
    try {
      const { data: { session } } = await supabase.auth.getSession(); // session locale (pas d'appel réseau)
      const user = session?.user;
      if (!user) return;
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const iso = today.toISOString().slice(0, 10);
      const { data } = await supabase.from('missions').select('mission_date,production').gte('mission_date', iso).order('mission_date', { ascending: true });
      await syncNotifications(data || []);
    } catch (e) { /* non bloquant */ } finally { busy.current = false; }
  }
  useEffect(() => {
    run();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') run(); });
    return () => sub.remove();
  }, []);
  return null;
}
