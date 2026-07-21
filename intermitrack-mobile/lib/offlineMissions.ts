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
    setMissions(data);
    cacheMissions(data);
    setOffline(false);
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
