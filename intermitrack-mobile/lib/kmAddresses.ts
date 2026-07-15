import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { onProfilChanged } from '../components/AccountMenu';

// ── Adresses déjà utilisées ────────────────────────────────────────────────
// Les adresses n'étaient enregistrées NULLE PART : on ne stockait que distance/taux/montant.
// D'où le retour « les adresses n'apparaissent pas quand je modifie une mission » — elles
// n'avaient jamais existé en base. Colonnes km_from / km_to (+ coords) ajoutées le 15/07/2026.
export type Addr = { label: string; coords: number[] | null };

// Construit la liste des adresses déjà saisies, de la PLUS utilisée à la moins utilisée
// (le domicile remonte donc tout seul en tête pour le départ, sans rien demander à l'utilisateur).
// On conserve les coordonnées mémorisées : rechoisir une adresse connue ne relance pas le géocodage.
function build(rows: { label: any; lat: any; lng: any }[]): Addr[] {
  const counts: Record<string, number> = {};
  const coords: Record<string, number[] | null> = {};
  for (const r of rows) {
    const label = String(r.label || '').trim();
    if (!label) continue;
    counts[label] = (counts[label] || 0) + 1;
    // Une même adresse peut avoir été saisie sans coords une fois et avec une autre fois :
    // on garde les premières coordonnées valides trouvées.
    if (coords[label] == null && r.lat != null && r.lng != null) coords[label] = [Number(r.lng), Number(r.lat)];
  }
  return Object.keys(counts)
    .sort((a, b) => counts[b] - counts[a])
    .map(label => ({ label, coords: coords[label] ?? null }));
}

// UNE SEULE réserve d'adresses, partagée par le départ ET l'arrivée.
// Retour Yohan : « il faudrait que j'aie le choix de toutes les adresses que j'ai entrées ».
// Séparer les deux listes n'avait aucun sens pratique : une adresse d'arrivée d'hier est souvent
// le départ de demain, et surtout la liste des départs était vide au démarrage (rien n'a jamais
// été stocké), alors que celle des arrivées héritait des LIEUX de mission — d'où un décalage
// incompréhensible entre les deux champs.
//
// Le tri par fréquence suffit à faire remonter le domicile en tête du départ : il apparaît dans
// toutes les missions, donc il est le plus fréquent. Pas besoin de le déclarer.
export function knownAddresses(missions: any[]): Addr[] {
  return build([
    ...missions.map(m => ({ label: m.km_from, lat: m.km_from_lat, lng: m.km_from_lng })),
    ...missions.map(m => ({ label: m.km_to, lat: m.km_to_lat, lng: m.km_to_lng })),
    // Les LIEUX de mission : ce champ était déjà enregistré depuis toujours, il rend la liste
    // utile dès la 1re ouverture au lieu d'attendre que l'utilisateur ait tout ressaisi.
    ...missions.map(m => ({ label: m.lieu, lat: null, lng: null })),
  ]);
}

// ── Véhicule mémorisé (profil) ─────────────────────────────────────────────
// « Je ne change pas ma voiture, et mon nombre de kilomètres annuel ne change pas d'une
//   mission à l'autre ainsi que ma puissance fiscale. » (retour JB)
// Valeurs identiques à l'appli ET au site : km_cv '3'|'4'|'5'|'6'|'7'|'moto', km_tranche '1'|'2'|'3'.
export function useKmDefaults() {
  const [cv, setCv] = useState('');
  const [tranche, setTranche] = useState('1');

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('profiles').select('km_cv,km_tranche').eq('id', user.id).maybeSingle();
    setCv(data?.km_cv || '');
    setTranche(data?.km_tranche || '1');
  }

  useEffect(() => { load(); }, []);
  // « Mes informations » se modifie dans une modale, sans changement d'écran : sans cet abonnement,
  // le formulaire garderait l'ancien véhicule jusqu'au prochain redémarrage.
  useEffect(() => onProfilChanged(load), []);

  return { cv, tranche };
}
