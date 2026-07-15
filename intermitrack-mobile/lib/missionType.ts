// Une mission peut porter PLUSIEURS types le même jour pour le même employeur.
// Exemple (retour Damien, ingé son doublage) : « Rec + MIX » sur la même journée, même contrat —
// plutôt que de créer deux missions séparées.
//
// Stockage : missions.mission_type reste une simple colonne texte, les types sont joints par « + ».
// Aucun changement de base. Le type n'est jamais utilisé pour regrouper ou calculer : il est
// seulement affiché (pastilles du calendrier, missions, actualisation). Seule exception, la valeur
// sentinelle 'Saisie rapide', qui reste un type unique et n'est jamais combinée.
export const TYPE_SEP = ' + ';

export function typeParts(v: string): string[] {
  return (v || '').split(TYPE_SEP).map(s => s.trim()).filter(Boolean);
}

export function addType(v: string, t: string): string {
  const parts = typeParts(v);
  if (!t || parts.includes(t)) return v; // pas de doublon
  return [...parts, t].join(TYPE_SEP);
}

export function removeType(v: string, t: string): string {
  return typeParts(v).filter(x => x !== t).join(TYPE_SEP);
}
