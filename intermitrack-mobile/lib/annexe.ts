import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { onProfilChanged } from '../components/AccountMenu';

// Annexe déclarée dans « Mes informations » : pilote le mode de saisie d'une mission.
//   technicien (annexe 8) -> saisie en HEURES
//   artiste    (annexe 10) -> saisie en CACHETS
//   les_deux              -> l'utilisateur choisit pour chaque mission
// Le site fait exactement pareil (app.js : setMissionModeForOpen / applyMissionMode) : ne pas diverger.
export type Annexe = 'technicien' | 'artiste' | 'les_deux';

// 1 cachet = 12 h pour le comptage des 507 h. Identique au CACHET_H du site (app.js).
export const CACHET_H = 12;

export function useAnnexe(): Annexe {
  const [annexe, setAnnexe] = useState<Annexe>('technicien');

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('profiles').select('annexe').eq('id', user.id).maybeSingle();
    const a = data?.annexe;
    setAnnexe(a === 'artiste' || a === 'les_deux' ? a : 'technicien');
  }

  useEffect(() => { load(); }, []);
  // « Mes informations » se modifie dans une modale, sans changement d'écran : sans cet abonnement,
  // le formulaire garderait l'ancienne annexe jusqu'au prochain redémarrage.
  useEffect(() => onProfilChanged(load), []);

  return annexe;
}

// Mode de saisie à l'ouverture d'un formulaire vierge.
export function modeForNew(annexe: Annexe): 'heures' | 'cachet' {
  return annexe === 'artiste' ? 'cachet' : 'heures';
}

// Une mission est-elle un CACHET (artiste) ? Le mode stocké (is_cachet) fait foi ; à défaut (anciennes
// missions), on retombe sur l'heuristique heures ≥ vacations×12. Source de vérité unique — retour Mélio.
export function missionIsCachet(m: any): boolean {
  if (m && (m.is_cachet === true || m.is_cachet === false)) return m.is_cachet;
  const h = Number(m?.hours) || 0, v = Number(m?.vacations) || 0;
  return v > 0 && h >= v * CACHET_H - 0.6;
}

// Mode de saisie à l'édition d'une mission existante.
// En « les_deux » on ne sait pas comment elle a été saisie : on la relit comme un cachet si les heures
// correspondent à un multiple exact de 12 h (tolérance 0,6 h). Même heuristique que le site.
export function modeForEdit(annexe: Annexe, hours: number, vacations: number): 'heures' | 'cachet' {
  if (annexe === 'technicien') return 'heures';
  // Artiste & les_deux : cachet SI les heures atteignent au moins vacations x 12 h (les cachets, éventuellement
  // + des heures de répète/atelier en plus). Une mission saisie EN HEURES a toujours hours < vacations x 12
  // (vacations ≈ h/8, et 8 < 12). Corrige : une mission artiste en heures (ex 32 h / 4) était relue en cachet
  // -> 4 cachets = 48 h fantômes. Gère aussi les cachets AVEC heures en plus (que l'ancien exact-match cassait).
  if (vacations > 0 && hours >= vacations * CACHET_H - 0.6) return 'cachet';
  return 'heures';
}

// Heures totales + nb de vacations à enregistrer, selon le mode.
// En cachet : cachets x 12 + les heures payées en heures (répétitions, ateliers…) saisies en plus.
export function computeHoursVac(mode: 'heures' | 'cachet', cachets: number, hours: number, vacations: number) {
  if (mode === 'cachet') {
    return {
      hours: Math.round((cachets * CACHET_H + hours) * 10) / 10,
      vacations: cachets,
    };
  }
  return {
    hours: hours,
    vacations: vacations || Math.round(hours / 8),
  };
}

// Heures « en plus » à réafficher en édition (on retire la part des cachets).
export function extraHoursOf(hours: number, vacations: number) {
  return Math.max(0, Math.round((hours - vacations * CACHET_H) * 10) / 10);
}
