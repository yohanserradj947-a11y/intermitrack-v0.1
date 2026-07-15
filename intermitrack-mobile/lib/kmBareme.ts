// ════════════════════════════════════════════════════════════════════════════
// BARÈME KILOMÉTRIQUE — revenus 2025 (déclaration 2026)
//
// Vérifié sur DEUX sources primaires concordantes le 16/07/2026 :
//   • BOFiP — BOI-BAREME-000001 : https://bofip.impots.gouv.fr/bofip/2185-PGP.html
//   • Aide du simulateur officiel DGFiP, campagne 2026 :
//     https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2026/aides/frais.htm
// Barème inchangé depuis les revenus 2022.
//
// CE QUI ÉTAIT FAUX AVANT (une seule option « Moto », coefs 0,395 / 0,099 / 0,234) :
//   • Toutes les motos étaient traitées comme des 1-2 CV, la catégorie la PLUS FAIBLE. Une moto de
//     plus de 5 CV (ex. BMW R 1250 RT) était sous-estimée de ~35 % : 0,395 au lieu de 0,606.
//   • Le 3ᵉ coefficient moto était en plus erroné : 0,234 au lieu de 0,248.
//   • Les tranches VOITURE (5 000 / 20 000) étaient appliquées aux motos, dont les tranches réelles
//     sont 3 000 / 6 000.
//   • Les CYCLOMOTEURS (< 50 cm³), qui ont leur propre barème, n'existaient pas.
//   • Le MONTANT FIXE de la tranche intermédiaire était ignoré : pour une voiture 3 CV entre 5 001 et
//     20 000 km, le barème dit (d × 0,316) + 1 065 — on oubliait donc plus de 1 000 €, dans le cas de
//     loin le plus courant.
//   • La majoration de 20 % des véhicules électriques n'existait pas.
// ════════════════════════════════════════════════════════════════════════════

export type VehicleKind = 'car' | 'moto' | 'cyclo';

// Une tranche du barème : applicable jusqu'à `upTo` km/an, frais = km × coef + add.
type Tranche = { upTo: number; coef: number; add: number };

const CAR: Record<string, Tranche[]> = {
  '3': [{ upTo: 5000, coef: 0.529, add: 0 }, { upTo: 20000, coef: 0.316, add: 1065 }, { upTo: Infinity, coef: 0.370, add: 0 }],
  '4': [{ upTo: 5000, coef: 0.606, add: 0 }, { upTo: 20000, coef: 0.340, add: 1330 }, { upTo: Infinity, coef: 0.407, add: 0 }],
  '5': [{ upTo: 5000, coef: 0.636, add: 0 }, { upTo: 20000, coef: 0.357, add: 1395 }, { upTo: Infinity, coef: 0.427, add: 0 }],
  '6': [{ upTo: 5000, coef: 0.665, add: 0 }, { upTo: 20000, coef: 0.374, add: 1457 }, { upTo: Infinity, coef: 0.447, add: 0 }],
  '7': [{ upTo: 5000, coef: 0.697, add: 0 }, { upTo: 20000, coef: 0.394, add: 1515 }, { upTo: Infinity, coef: 0.470, add: 0 }],
};

// Motos de plus de 50 cm³. Tranches 3 000 / 6 000 — et NON celles des voitures.
const MOTO: Record<string, Tranche[]> = {
  '1': [{ upTo: 3000, coef: 0.395, add: 0 }, { upTo: 6000, coef: 0.099, add: 891 }, { upTo: Infinity, coef: 0.248, add: 0 }],
  '3': [{ upTo: 3000, coef: 0.468, add: 0 }, { upTo: 6000, coef: 0.082, add: 1158 }, { upTo: Infinity, coef: 0.275, add: 0 }],
  '5': [{ upTo: 3000, coef: 0.606, add: 0 }, { upTo: 6000, coef: 0.079, add: 1583 }, { upTo: Infinity, coef: 0.343, add: 0 }],
};

// Cyclomoteurs de moins de 50 cm³ : pas de puissance, un seul barème.
const CYCLO: Tranche[] = [
  { upTo: 3000, coef: 0.315, add: 0 }, { upTo: 6000, coef: 0.079, add: 711 }, { upTo: Infinity, coef: 0.198, add: 0 },
];

export const CAR_CV = [
  { key: '3', label: '3 CV et moins' }, { key: '4', label: '4 CV' }, { key: '5', label: '5 CV' },
  { key: '6', label: '6 CV' }, { key: '7', label: '7 CV et plus' },
];
export const MOTO_CV = [
  { key: '1', label: '1 ou 2 CV' }, { key: '3', label: '3, 4 ou 5 CV' }, { key: '5', label: 'Plus de 5 CV' },
];
export const VEHICLES: { key: VehicleKind; label: string; hint: string }[] = [
  { key: 'car', label: 'Voiture', hint: 'Puissance fiscale : carte grise, case P.6.' },
  { key: 'moto', label: 'Moto (+ de 50 cm³)', hint: 'Puissance fiscale : carte grise, case P.6. Le barème moto a ses propres tranches.' },
  { key: 'cyclo', label: 'Cyclomoteur (- de 50 cm³)', hint: 'Moins de 50 cm³ : barème unique, pas de puissance à indiquer.' },
];

function tranchesFor(kind: VehicleKind, cv: string): Tranche[] | null {
  if (kind === 'cyclo') return CYCLO;
  if (kind === 'moto') return MOTO[cv] || null;
  return CAR[cv] || null;
}

// Frais kilométriques ANNUELS selon le barème officiel, majoration électrique comprise.
export function fraisAnnuels(kind: VehicleKind, cv: string, kmAnnuel: number, electrique = false): number {
  const t = tranchesFor(kind, cv);
  const km = Math.max(0, Number(kmAnnuel) || 0);
  if (!t || km <= 0) return 0;
  const tr = t.find((x) => km <= x.upTo) || t[t.length - 1];
  const base = km * tr.coef + tr.add;
  // « Le barème pour les véhicules 100 % électriques correspond au barème ci-dessus majoré de 20 %. »
  return electrique ? base * 1.2 : base;
}

// Taux réel de l'utilisateur, en €/km.
//
// Le barème est ANNUEL (il comporte un montant fixe par tranche), alors que l'appli calcule des frais
// PAR MISSION. On ne peut donc pas ajouter le montant fixe à chaque mission — ce serait 1 065 € × 30
// missions. On calcule à la place le taux effectif de l'utilisateur : barème(km annuels) / km annuels.
//
// Exemple, voiture 3 CV, 10 000 km/an : (10 000 × 0,316 + 1 065) / 10 000 = 0,4225 €/km.
// Appliqué à chaque mission, le total de l'année retombe exactement sur le barème — le montant fixe
// est enfin pris en compte, sans être compté trente fois.
export function tauxEffectif(kind: VehicleKind, cv: string, kmAnnuel: number, electrique = false): number {
  const km = Math.max(0, Number(kmAnnuel) || 0);
  if (km <= 0) return 0;
  return fraisAnnuels(kind, cv, km, electrique) / km;
}

// Migration des réglages enregistrés avant le 16/07/2026.
// Ancien format : km_cv = '3'|'4'|'5'|'6'|'7'|'moto', km_tranche = '1'|'2'|'3' (une TRANCHE, pas des km).
// 'moto' devenait le barème 1-2 CV : on conserve ce comportement pour ne pas modifier les chiffres
// de quelqu'un sans le prévenir — il choisira sa vraie puissance lui-même.
// La tranche est convertie en un kilométrage annuel représentatif, au MILIEU de la tranche : c'est la
// seule valeur qui ne fabrique pas d'information qu'on n'a pas.
export function migrerVehicule(oldCv: string | null | undefined, oldTranche: string | null | undefined) {
  const kind: VehicleKind = oldCv === 'moto' ? 'moto' : 'car';
  const cv = oldCv === 'moto' ? '1' : (CAR[String(oldCv || '')] ? String(oldCv) : '');
  const t = String(oldTranche || '1');
  const kmAnnuel = kind === 'moto'
    ? (t === '2' ? 4500 : t === '3' ? 9000 : 1500)   // tranches moto : ≤3 000 / 3 001–6 000 / >6 000
    : (t === '2' ? 12500 : t === '3' ? 25000 : 2500); // tranches voiture : ≤5 000 / 5 001–20 000 / >20 000
  return { kind, cv, kmAnnuel };
}
