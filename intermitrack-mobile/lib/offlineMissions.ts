import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// Mode hors ligne — V1 (OTA, sans build) : LECTURE seule.
// On met en cache local les missions déjà chargées (connecté). Si un chargement échoue
// (réseau coupé, plateau sans signal), on réaffiche la dernière version connue + un bandeau.
// L'écriture hors ligne (file d'attente) viendra en V1b, séparément, pour ne rien risquer.

const PREFIX = 'intermitrack_missions_cache_';

async function cacheKey(): Promise<string> {
  try { const { data } = await supabase.auth.getUser(); return PREFIX + (data?.user?.id || 'anon'); }
  catch { return PREFIX + 'anon'; }
}

// Cache la liste de missions du user courant (appelé après un chargement réussi).
export async function cacheMissions(list: any[]) {
  try { await AsyncStorage.setItem(await cacheKey(), JSON.stringify(list || [])); } catch (e) {}
}

// Récupère la dernière liste connue (null si aucun cache). Utilisé en repli quand le réseau échoue.
export async function getCachedMissions(): Promise<any[] | null> {
  try { const v = await AsyncStorage.getItem(await cacheKey()); return v ? JSON.parse(v) : null; }
  catch (e) { return null; }
}

// ── File d'attente d'ÉCRITURE (V1b) : ajouter une mission hors ligne → elle apparaît tout de suite,
//    puis se synchronise dès le retour du réseau, SANS doublon (upsert idempotent sur client_token). ──

const QUEUE_PREFIX = 'intermitrack_write_queue_';

// UUID v4 (Math.random suffit pour un jeton client ; pas besoin de module natif crypto).
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
async function queueKey(): Promise<string> {
  try { const { data } = await supabase.auth.getUser(); return QUEUE_PREFIX + (data?.user?.id || 'anon'); }
  catch { return QUEUE_PREFIX + 'anon'; }
}
async function getQueue(): Promise<any[]> {
  try { const v = await AsyncStorage.getItem(await queueKey()); return v ? JSON.parse(v) : []; } catch { return []; }
}
async function setQueue(q: any[]) {
  try { await AsyncStorage.setItem(await queueKey(), JSON.stringify(q || [])); } catch (e) {}
}

// Compteur « en attente de synchro » partagé (pour le bandeau).
let _pending = 0;
const _pListeners = new Set<(n: number) => void>();
function setPending(n: number) { _pending = n; _pListeners.forEach((l) => { try { l(n); } catch (e) {} }); }
export function usePending() {
  const [n, setN] = useState(_pending);
  useEffect(() => { _pListeners.add(setN); setN(_pending); getQueue().then((q) => setPending(q.length)); return () => { _pListeners.delete(setN); }; }, []);
  return n;
}

// Ajoute une mission hors ligne : la stocke dans la file (avec un client_token) ET l'ajoute au cache
// local pour qu'elle apparaisse immédiatement. Retourne la mission « optimiste » à afficher.
export async function queueInsert(payload: any): Promise<any> {
  const token = uuid();
  const optimistic = { ...payload, id: 'local_' + token, client_token: token, _pending: true };
  const q = await getQueue();
  q.push({ payload: { ...payload, client_token: token } });
  await setQueue(q);
  setPending(q.length);
  // Ajoute au cache pour qu'un rechargement hors ligne la montre aussi.
  const cached = (await getCachedMissions()) || [];
  cached.push(optimistic);
  await cacheMissions(cached);
  return optimistic;
}

// Vide la file quand le réseau est là : upsert idempotent (onConflict client_token → jamais de doublon,
// même si on rejoue). Les items qui échouent restent en file pour le prochain essai.
export async function flushQueue(): Promise<number> {
  const q = await getQueue();
  if (!q.length) return 0;
  const remaining: any[] = [];
  let done = 0;
  for (const item of q) {
    try {
      const { error } = await supabase.from('missions').upsert(item.payload, { onConflict: 'client_token' });
      if (error) remaining.push(item); else done++;
    } catch (e) { remaining.push(item); }
  }
  await setQueue(remaining);
  setPending(remaining.length);
  return done;
}
async function queueLength(): Promise<number> { return (await getQueue()).length; }

// État hors-ligne partagé (observable minimal, sans dépendance native comme NetInfo qui casserait l'OTA).
let _offline = false;
const _listeners = new Set<(v: boolean) => void>();
export function setOffline(v: boolean) {
  if (_offline === v) return;
  _offline = v;
  _listeners.forEach((l) => { try { l(v); } catch (e) {} });
}
export function isOffline() { return _offline; }
export function useOffline() {
  const [o, setO] = useState(_offline);
  useEffect(() => { _listeners.add(setO); setO(_offline); return () => { _listeners.delete(setO); }; }, []);
  return o;
}

// Helper commun de chargement des missions avec repli cache. Retourne la liste à afficher.
// opts.ascending = ordre par date (défaut croissant ; missions.tsx = décroissant).
// opts.onData = callback optionnel (ex : widgets).
export async function loadMissionsCached(
  setMissions: (list: any[]) => void,
  opts?: { onData?: (list: any[]) => void; ascending?: boolean }
) {
  const ascending = opts?.ascending !== false;
  const { data, error } = await supabase.from('missions').select('*').order('mission_date', { ascending });
  if (data) {
    setOffline(false);
    // Réseau OK : on synchronise d'abord les missions saisies hors ligne, puis on recharge frais
    // (ainsi les missions synchronisées remplacent leurs versions « locales » optimistes).
    if ((await queueLength()) > 0) {
      await flushQueue();
      const re = await supabase.from('missions').select('*').order('mission_date', { ascending });
      const list = re.data || data;
      setMissions(list);
      cacheMissions(list);
      opts?.onData?.(list);
      return list;
    }
    setMissions(data);
    cacheMissions(data);
    opts?.onData?.(data);
    return data;
  }
  // Échec réseau : on retombe sur la dernière version connue, sans écraser par du vide, dans le bon ordre.
  if (error) {
    const cached = await getCachedMissions();
    if (cached && cached.length) {
      const sorted = [...cached].sort((a, b) => {
        if (a.mission_date === b.mission_date) return 0;
        return (a.mission_date < b.mission_date) === ascending ? -1 : 1;
      });
      setMissions(sorted);
      setOffline(true);
      opts?.onData?.(sorted);
      return sorted;
    }
  }
  return null;
}
