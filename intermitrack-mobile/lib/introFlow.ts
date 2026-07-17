// Ordonne les pop-ups d'accueil : le RÉGLAGE DU PROFIL passe AVANT le tuto missions,
// parce qu'il pré-remplit la 1re mission (statut -> heures/cachet, salaire -> prix).
// Le tuto s'abonne à onProfileGateResolved() et n'apparaît qu'une fois le profil résolu :
//   - profil déjà réglé (annexe présente) -> résolu tout de suite,
//   - pop-up profil fermé (Enregistrer ou « Plus tard ») -> résolu à la fermeture,
//   - déjà montré aujourd'hui -> résolu tout de suite (on ne reharcèle pas dans la journée).
let resolved = false;
let listeners: (() => void)[] = [];

export function resolveProfileGate() {
  if (resolved) return;
  resolved = true;
  const ls = listeners;
  listeners = [];
  ls.forEach((l) => { try { l(); } catch (e) {} });
}

// Exécute fn dès que le « portillon » profil est franchi (immédiatement s'il l'est déjà).
export function onProfileGateResolved(fn: () => void) {
  if (resolved) { fn(); return; }
  listeners.push(fn);
}
