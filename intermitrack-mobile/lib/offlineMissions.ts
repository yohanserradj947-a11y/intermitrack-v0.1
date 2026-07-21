import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// Mode hors ligne — V1 (OTA, sans build) : LECTURE seule.
// On met en cache local les missions déjà chargées (connecté). Si un chargement échoue
// (réseau coupé, plateau sans signal), on réaffiche la dernière version connue + un bandeau.
// L'écriture hors ligne (file d'attente) viendra en V1b, séparément, pour ne rien risquer.

const PREFIX = 'intermitrack_missions_cache_';

// IMPORTANT : getSession() lit la session LOCALE (AsyncStorage), SANS réseau — contrairement à getUser()
// qui appelle le serveur et échoue hors ligne (→ clé « anon » → cache introuvable → tout à zéro).
// Mémorisé : on ne rappelle pas getSession à chaque chargement d'onglet (c'était la cause de la lenteur).
let _uid: string | null = null;
async function userId(): Promise<string> {
  if (_uid) return _uid;
  try { const { data } = await supabase.auth.getSession(); const id = data?.session?.user?.id; if (id) { _uid = id; return id; } }
  catch (e) {}
  return 'anon'; // pas encore de session : on ne mémorise pas 'anon' (on réessaiera au prochain appel)
}
async function cacheKey(): Promise<string> { return PREFIX + (await userId()); }

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
async function queueKey(): Promise<string> { return QUEUE_PREFIX + (await userId()); }
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

// Item de file : { op:'insert', token, payload } | { op:'update', id, payload } | { op:'delete', id }
// Toutes les opérations sont idempotentes (rejouables sans dégât) : upsert(client_token), update(id), delete(id).

async function patchCache(fn: (list: any[]) => any[]) {
  const cached = (await getCachedMissions()) || [];
  await cacheMissions(fn([...cached]));
}

// AJOUTER une mission hors ligne : file + cache → apparaît tout de suite. Retourne la mission optimiste.
export async function queueInsert(payload: any): Promise<any> {
  const token = uuid();
  const optimistic = { ...payload, id: 'local_' + token, client_token: token, _pending: true };
  const q = await getQueue();
  q.push({ op: 'insert', token, payload: { ...payload, client_token: token } });
  await setQueue(q);
  setPending(q.length);
  await patchCache((list) => { list.push(optimistic); return list; });
  return optimistic;
}

// MODIFIER une mission hors ligne. Si c'est une mission encore locale (pas synchronisée),
// on édite directement son insert en attente au lieu de créer un update sur un id qui n'existe pas côté serveur.
export async function queueUpdate(id: any, payload: any): Promise<any> {
  const q = await getQueue();
  const local = String(id).startsWith('local_');
  if (local) {
    const token = String(id).slice(6);
    for (const it of q) if (it.op === 'insert' && it.token === token) it.payload = { ...it.payload, ...payload, client_token: token };
  } else {
    q.push({ op: 'update', id, payload });
  }
  await setQueue(q);
  setPending(q.length);
  await patchCache((list) => list.map((m) => (m.id === id ? { ...m, ...payload, _pending: true } : m)));
  return { ...payload, id, _pending: true };
}

// SUPPRIMER une mission hors ligne. Si elle est encore locale, on retire simplement son insert en attente.
export async function queueDelete(id: any): Promise<void> {
  let q = await getQueue();
  const local = String(id).startsWith('local_');
  if (local) {
    const token = String(id).slice(6);
    q = q.filter((it) => !(it.op === 'insert' && it.token === token));
  } else {
    q.push({ op: 'delete', id });
  }
  await setQueue(q);
  setPending(q.length);
  await patchCache((list) => list.filter((m) => m.id !== id));
}

// Vide la file quand le réseau est là. Ordre FIFO conservé ; opérations idempotentes → aucun doublon/dégât
// même si un flush repart. Les items qui échouent restent en file pour le prochain essai.
export async function flushQueue(): Promise<number> {
  const q = await getQueue();
  if (!q.length) return 0;
  const remaining: any[] = [];
  let done = 0;
  for (const it of q) {
    try {
      let error: any = null;
      if (it.op === 'insert') ({ error } = await supabase.from('missions').upsert(it.payload, { onConflict: 'client_token' }));
      else if (it.op === 'update') ({ error } = await supabase.from('missions').update(it.payload).eq('id', it.id));
      else if (it.op === 'delete') ({ error } = await supabase.from('missions').delete().eq('id', it.id));
      if (error) remaining.push(it); else done++;
    } catch (e) { remaining.push(it); }
  }
  await setQueue(remaining);
  setPending(remaining.length);
  return done;
}
// Synchro en ARRIÈRE-PLAN : ne bloque JAMAIS l'affichage (sur réseau faible, un flush bloquant faisait
// « pendre » chaque chargement d'onglet). Un seul flush à la fois.
let _flushing = false;
function flushInBackground() {
  if (_flushing) return;
  _flushing = true;
  flushQueue().catch(() => {}).finally(() => { _flushing = false; });
}

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
  // Réseau FAIBLE (plateau) : la requête peut « pendre » longtemps sans échouer. On la course contre un
  // délai de 6 s → au-delà, on considère qu'on est hors ligne et on bascule sur le cache (au lieu d'attendre).
  const query = supabase.from('missions').select('*').order('mission_date', { ascending });
  const { data, error } = await Promise.race([
    query as any,
    new Promise((resolve) => setTimeout(() => resolve({ data: null, error: { message: 'timeout' } }), 6000)),
  ]) as { data: any[] | null; error: any };
  if (data) {
    setOffline(false);
    let list = data;
    const q = await getQueue();
    if (q.length) {
      // On applique les opérations en attente PAR-DESSUS les données serveur pour que tes ajouts/modifs/
      // suppressions hors ligne restent visibles tant qu'ils ne sont pas synchronisés — SANS bloquer :
      // la vraie synchro réseau se fait en arrière-plan (flushInBackground).
      const delIds = new Set(q.filter((it) => it.op === 'delete').map((it) => it.id));
      const updates = q.filter((it) => it.op === 'update');
      const serverTokens = new Set(data.map((m) => m.client_token).filter(Boolean));
      const inserts = q.filter((it) => it.op === 'insert' && !serverTokens.has(it.token))
        .map((it) => ({ ...it.payload, id: 'local_' + it.token, _pending: true }));
      list = data
        .filter((m) => !delIds.has(m.id))
        .map((m) => { const u = updates.find((it) => it.id === m.id); return u ? { ...m, ...u.payload, _pending: true } : m; })
        .concat(inserts)
        .sort((a, b) => { if (a.mission_date === b.mission_date) return 0; return (a.mission_date < b.mission_date) === ascending ? -1 : 1; });
      flushInBackground();
    }
    setMissions(list);
    cacheMissions(list);
    opts?.onData?.(list);
    return list;
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
