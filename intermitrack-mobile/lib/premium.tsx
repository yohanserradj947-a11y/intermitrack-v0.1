import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { configureRevenueCat, identifyRevenueCat, getCustomerInfoSafe, isProActive, onCustomerInfoUpdate } from './revenuecat';

export type Tier = 'pionnier' | 'gratuit' | 'premium';

// Comptes autorisés à tester l'aperçu « version Gratuit » tant que l'offre n'est pas commercialisée.
export const PREVIEW_EMAILS = ['yohanserradj947@gmail.com', 'seba9cash@msn.com'];

type Ctx = {
  tier: Tier;
  effectiveTier: Tier;   // tient compte de l'interrupteur, de l'abonnement RevenueCat et de l'aperçu perso
  previewFree: boolean;
  canPreview: boolean;
  monetisationActive: boolean; // interrupteur serveur : false = tout gratuit pour tout le monde
  isPro: boolean;              // abonnement RevenueCat « Intermitrack Pro » actif
  setPreviewFree: (v: boolean) => void;
  reload: () => void;
};

const PremiumCtx = createContext<Ctx>({
  tier: 'pionnier', effectiveTier: 'pionnier', previewFree: false, canPreview: false,
  monetisationActive: false, isPro: false, setPreviewFree: () => {}, reload: () => {},
});

export function usePremium() { return useContext(PremiumCtx); }

export function isLocked(effectiveTier: Tier) { return effectiveTier === 'gratuit'; }

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const [grantedTier, setGrantedTier] = useState<Tier | null>(null); // grant serveur explicite (pionnier/premium)
  const [monetisationActive, setMonetisationActive] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [previewFree, setPF] = useState(false);
  const [canPreview, setCanPreview] = useState(false);

  async function load() {
    try {
      const pf = await AsyncStorage.getItem('itk_preview_free');
      setPF(pf === '1');

      // Interrupteur « monétisation » — lu en cache d'abord (instantané), puis rafraîchi depuis Supabase.
      const cachedFlag = await AsyncStorage.getItem('itk_monetisation_active');
      if (cachedFlag != null) setMonetisationActive(cachedFlag === '1');

      // Session LOCALE (getSession, pas getUser → instantané et marche hors ligne).
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;

      // Configure RevenueCat + lie le compte (le SDK ne fait rien tant qu'il n'y a pas de produits/paywall).
      configureRevenueCat(user?.id);
      if (user?.id) identifyRevenueCat(user.id);
      const info = await getCustomerInfoSafe();
      setIsPro(isProActive(info));

      if (user) {
        setCanPreview(PREVIEW_EMAILS.includes((user.email || '').toLowerCase()));
        const { data } = await supabase.from('profiles').select('tier').eq('id', user.id).maybeSingle();
        const t = data?.tier;
        setGrantedTier(t === 'pionnier' || t === 'premium' ? t : null);
      } else { setCanPreview(false); }

      // Interrupteur serveur (table app_config). Try/catch : si la table n'existe pas encore, on reste OFF.
      try {
        const { data: cfg } = await supabase.from('app_config').select('value').eq('key', 'monetisation_active').maybeSingle();
        const active = cfg?.value === true || cfg?.value === 'true' || cfg?.value === 1;
        setMonetisationActive(!!active);
        AsyncStorage.setItem('itk_monetisation_active', active ? '1' : '0');
      } catch (e) {}
    } catch (e) {}
  }
  useEffect(() => { load(); }, []);

  // Réagit en direct aux achats/expirations RevenueCat.
  useEffect(() => {
    const off = onCustomerInfoUpdate((info) => setIsPro(isProActive(info)));
    return off;
  }, []);

  function setPreviewFree(v: boolean) { setPF(v); AsyncStorage.setItem('itk_preview_free', v ? '1' : '0'); }

  // Tier réel :
  //  1) grant serveur explicite (pionnier / premium) l'emporte,
  //  2) sinon abonnement RevenueCat actif → premium,
  //  3) sinon si l'interrupteur est OFF → pionnier (TOUT GRATUIT pour tout le monde, état par défaut),
  //  4) sinon → gratuit (offre lancée).
  let baseTier: Tier;
  if (grantedTier) baseTier = grantedTier;
  else if (isPro) baseTier = 'premium';
  else if (!monetisationActive) baseTier = 'pionnier';
  else baseTier = 'gratuit';

  const tier: Tier = baseTier;
  // L'aperçu Gratuit ne s'applique QU'aux comptes autorisés.
  const effectiveTier: Tier = (previewFree && canPreview) ? 'gratuit' : baseTier;

  return (
    <PremiumCtx.Provider value={{ tier, effectiveTier, previewFree, canPreview, monetisationActive, isPro, setPreviewFree, reload: load }}>
      {children}
    </PremiumCtx.Provider>
  );
}
