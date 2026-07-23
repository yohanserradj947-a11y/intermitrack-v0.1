import { Platform } from 'react-native';
import Purchases, { CustomerInfo, LOG_LEVEL, PurchasesOfferings } from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';

// ─────────────────────────────────────────────────────────────────────────────
//  RevenueCat — abonnements Intermitrack.
//  Entitlement RevenueCat = "Intermitrack Pro". Produits = monthly / yearly.
//
//  Clés : pour l'instant la clé "Test Store" (permet de tester les achats SANS
//  App Store / Play Store). Quand les vraies apps seront ajoutées dans RevenueCat,
//  remplacer par les clés dédiées : appl_… (iOS) et goog_… (Android).
// ─────────────────────────────────────────────────────────────────────────────

export const ENTITLEMENT_PRO = 'Intermitrack Pro';

const RC_KEY_TEST = 'test_KPmEHjdhYbIRFMCoetuHRPufZPk';
const RC_KEY_IOS = RC_KEY_TEST;      // TODO: remplacer par appl_… quand l'app App Store sera créée dans RevenueCat
const RC_KEY_ANDROID = RC_KEY_TEST;  // TODO: remplacer par goog_… quand l'app Play Store sera créée dans RevenueCat

let _configured = false;

// Configure le SDK une seule fois. appUserId = l'id Supabase (lie l'abonnement au compte).
// Tout est try/catch : si le module natif n'est pas là (ex : runtime sans le build), on ne casse rien.
export function configureRevenueCat(appUserId?: string) {
  if (_configured) return;
  try {
    Purchases.setLogLevel(LOG_LEVEL.WARN);
    const apiKey = Platform.OS === 'ios' ? RC_KEY_IOS : RC_KEY_ANDROID;
    Purchases.configure({ apiKey, appUserID: appUserId });
    _configured = true;
  } catch (e) {}
}

// Associe l'utilisateur RevenueCat à l'id Supabase (après connexion / changement de compte).
export async function identifyRevenueCat(appUserId: string) {
  try { if (_configured && appUserId) await Purchases.logIn(appUserId); } catch (e) {}
}

export async function logOutRevenueCat() {
  try { if (_configured) await Purchases.logOut(); } catch (e) {}
}

// L'entitlement "Intermitrack Pro" est-il actif pour ce client ?
export function isProActive(info: CustomerInfo | null | undefined): boolean {
  try { return !!info?.entitlements?.active?.[ENTITLEMENT_PRO]; } catch (e) { return false; }
}

export async function getCustomerInfoSafe(): Promise<CustomerInfo | null> {
  try { if (!_configured) return null; return await Purchases.getCustomerInfo(); } catch (e) { return null; }
}

// Écoute les changements d'abonnement (achat, expiration, restauration…). Retourne la fonction de désabonnement.
export function onCustomerInfoUpdate(cb: (info: CustomerInfo) => void): () => void {
  try {
    if (!_configured) return () => {};
    Purchases.addCustomerInfoUpdateListener(cb);
    return () => { try { Purchases.removeCustomerInfoUpdateListener(cb); } catch (e) {} };
  } catch (e) { return () => {}; }
}

export async function getOfferingsSafe(): Promise<PurchasesOfferings | null> {
  try { if (!_configured) return null; return await Purchases.getOfferings(); } catch (e) { return null; }
}

// Restaure les achats (bouton "Restaurer mes achats" — obligatoire côté Apple). Retourne true si Pro actif.
export async function restorePurchases(): Promise<boolean> {
  try {
    if (!_configured) return false;
    const info = await Purchases.restorePurchases();
    return isProActive(info);
  } catch (e) { return false; }
}

// Affiche le paywall RevenueCat (conçu dans le dashboard). Retourne true si l'utilisateur a acheté/restauré.
export async function presentPaywall(): Promise<boolean> {
  try {
    const result = await RevenueCatUI.presentPaywall();
    return result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED;
  } catch (e) { return false; }
}

// Affiche le paywall UNIQUEMENT si l'utilisateur n'a pas encore l'entitlement (pratique pour gater une action).
export async function presentPaywallIfNeeded(): Promise<boolean> {
  try {
    const result = await RevenueCatUI.presentPaywallIfNeeded({ requiredEntitlementIdentifier: ENTITLEMENT_PRO });
    return result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED;
  } catch (e) { return false; }
}

// Customer Center RevenueCat : gérer/annuler son abonnement, demander un remboursement… (module natif -ui).
export async function presentCustomerCenter(): Promise<void> {
  try { await RevenueCatUI.presentCustomerCenter(); } catch (e) {}
}
