import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { onProfilChanged } from '../components/AccountMenu';
import { tauxEffectif, migrerVehicule, type VehicleKind } from './kmBareme';

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
// On ne propose QUE des adresses réellement géolocalisées (retour Yohan : « il faut faire en sorte
// que ça propose dans la liste que des vraies adresses »). Une entrée sans coordonnées est de toute
// façon inutilisable : le calcul de distance ne peut rien en faire, il faudrait la re-géocoder et ça
// échouerait sur un nom inventé.
// C'est pourquoi on n'ajoute PAS les « lieux » de mission (« Studio 130 », « La Plaine »…) : ce sont
// des noms libres saisis par l'utilisateur, pas des adresses. Ils polluaient la liste.
// Conséquence assumée : la liste est vide tant qu'aucune adresse n'a été choisie dans les
// suggestions de la carte. Elle se remplit ensuite toute seule.
export function knownAddresses(missions: any[]): Addr[] {
  return build([
    ...missions.map(m => ({ label: m.km_from, lat: m.km_from_lat, lng: m.km_from_lng })),
    ...missions.map(m => ({ label: m.km_to, lat: m.km_to_lat, lng: m.km_to_lng })),
  ]).filter(a => a.coords != null);
}

// ── Véhicule mémorisé (profil) ─────────────────────────────────────────────
// « Je ne change pas ma voiture, et mon nombre de kilomètres annuel ne change pas d'une
//   mission à l'autre ainsi que ma puissance fiscale. » (retour JB)
//
// Renvoie directement le TAUX RÉEL en €/km, calculé par le barème officiel à partir du véhicule et
// du kilométrage annuel (voir lib/kmBareme). Les écrans n'ont plus à connaître le barème : ils
// multiplient les km de la mission par ce taux.
export type KmDefaults = { kind: VehicleKind; cv: string; kmAnnuel: number; electrique: boolean; taux: number; pret: boolean };

export function useKmDefaults(): KmDefaults {
  const [v, setV] = useState<KmDefaults>({ kind: 'car', cv: '', kmAnnuel: 0, electrique: false, taux: 0, pret: false });

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('profiles')
      .select('km_vehicle,km_cv,km_annual,km_electric,km_tranche').eq('id', user.id).maybeSingle();

    // Nouveau format si présent, sinon migration de l'ancien (km_cv '3'..'7'|'moto' + km_tranche).
    let kind: VehicleKind, cv: string, kmAnnuel: number;
    if (data?.km_vehicle) {
      kind = data.km_vehicle as VehicleKind;
      cv = data.km_cv || '';
      kmAnnuel = Number(data.km_annual) || 0;
    } else {
      const m = migrerVehicule(data?.km_cv, data?.km_tranche);
      kind = m.kind; cv = m.cv;
      kmAnnuel = data?.km_cv ? m.kmAnnuel : 0; // pas de véhicule renseigné → on n'invente pas de km
    }
    const electrique = !!data?.km_electric;
    setV({ kind, cv, kmAnnuel, electrique, taux: tauxEffectif(kind, cv, kmAnnuel, electrique), pret: true });
  }

  useEffect(() => { load(); }, []);
  // « Mes informations » se modifie dans une modale, sans changement d'écran : sans cet abonnement,
  // le formulaire garderait l'ancien véhicule jusqu'au prochain redémarrage.
  useEffect(() => onProfilChanged(load), []);

  return v;
}
