// Moteur de calcul des HEURES SUPPLÉMENTAIRES (techniciens en V1).
// Fonctions PURES (aucune dépendance React Native) → testables au node.
//
// Principe : la majoration s'applique à un TAUX HORAIRE dérivé de la « base garantie »
// (montant garanti ÷ nombre d'heures de la base — 8 h par défaut pour un technicien).
// Chaque heure sup est payée : taux horaire × (1 + majoration).  Ex. +25 % → ×1,25.
// Les paliers s'appliquent dans l'ordre ; ce qui dépasse le dernier palier prend `restPct`.

export type Palier = { h: number; pct: number };
export type OvertimeRule = {
  base: number;      // montant garanti de la journée/base (€)
  heures: number;    // nombre d'heures que couvre cette base (8 h par défaut technicien)
  paliers: Palier[]; // paliers successifs : les `h` premières heures sup à `pct` %
  restPct: number;   // majoration appliquée aux heures au-delà des paliers
};

export type OvertimeLine = { h: number; pct: number; taux: number; montant: number };

// Taux horaire de base = montant garanti ÷ heures de la base. 0 si heures ≤ 0 (garde-fou).
export function tauxHoraire(rule: OvertimeRule): number {
  return rule.heures > 0 ? rule.base / rule.heures : 0;
}

// Détail palier par palier (pour l'affichage ET les tests). Gère les heures décimales (ex. 3,5 h).
export function overtimeBreakdown(hSup: number, rule: OvertimeRule): OvertimeLine[] {
  const taux = tauxHoraire(rule);
  const lines: OvertimeLine[] = [];
  let remaining = Math.max(0, hSup);
  for (const p of rule.paliers) {
    if (remaining <= 1e-9) break;
    const h = Math.min(remaining, Math.max(0, p.h));
    if (h <= 0) continue;
    lines.push({ h, pct: p.pct, taux, montant: h * taux * (1 + p.pct / 100) });
    remaining -= h;
  }
  if (remaining > 1e-9) {
    lines.push({ h: remaining, pct: rule.restPct, taux, montant: remaining * taux * (1 + rule.restPct / 100) });
  }
  return lines;
}

// Montant TOTAL des heures sup, arrondi au centime (c'est ce qui s'ajoute au brut).
export function computeOvertime(hSup: number, rule: OvertimeRule): number {
  const total = overtimeBreakdown(hSup, rule).reduce((a, l) => a + l.montant, 0);
  return Math.round(total * 100) / 100;
}

// Base par défaut selon le statut. V1 : technicien = 8 h. (Artiste = cachet, traité plus tard.)
export function defaultBaseHours(annexe?: string): number {
  return annexe === 'artiste' ? 0 : 8;
}
