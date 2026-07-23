import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

export type Tier = 'pionnier' | 'gratuit' | 'premium';

// Comptes autorisés à tester l'aperçu « version Gratuit » tant que l'offre n'est pas commercialisée.
// (En minuscules — la comparaison se fait sur l'email en minuscules.)
export const PREVIEW_EMAILS = ['yohanserradj947@gmail.com', 'seba9cash@msn.com'];

type Ctx = {
  tier: Tier;
  effectiveTier: Tier;   // tient compte du mode "aperçu Gratuit" (test perso)
  previewFree: boolean;
  canPreview: boolean;   // droit d'utiliser l'aperçu Gratuit (liste blanche)
  setPreviewFree: (v: boolean) => void;
  reload: () => void;
};

const PremiumCtx = createContext<Ctx>({
  tier: 'pionnier', effectiveTier: 'pionnier', previewFree: false, canPreview: false,
  setPreviewFree: () => {}, reload: () => {},
});

export function usePremium() { return useContext(PremiumCtx); }

// Un onglet Premium est verrouillé uniquement pour le tier 'gratuit'
// (pionnier et premium ont tout).
export function isLocked(effectiveTier: Tier) { return effectiveTier === 'gratuit'; }

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const [tier, setTier] = useState<Tier>('pionnier');
  const [previewFree, setPF] = useState(false);
  const [canPreview, setCanPreview] = useState(false);

  async function load() {
    try {
      const pf = await AsyncStorage.getItem('itk_preview_free');
      setPF(pf === '1');
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCanPreview(PREVIEW_EMAILS.includes((user.email || '').toLowerCase()));
        const { data } = await supabase.from('profiles').select('tier').eq('id', user.id).maybeSingle();
        if (data?.tier === 'pionnier' || data?.tier === 'gratuit' || data?.tier === 'premium') setTier(data.tier);
      } else { setCanPreview(false); }
    } catch (e) {}
  }
  useEffect(() => { load(); }, []);

  function setPreviewFree(v: boolean) { setPF(v); AsyncStorage.setItem('itk_preview_free', v ? '1' : '0'); }

  // L'aperçu Gratuit ne s'applique QUE pour les comptes autorisés : si un autre utilisateur avait activé
  // le bouton (quand il était visible par tous), il reste en accès complet — jamais coincé en Gratuit.
  const effectiveTier: Tier = (previewFree && canPreview) ? 'gratuit' : tier;
  return (
    <PremiumCtx.Provider value={{ tier, effectiveTier, previewFree, canPreview, setPreviewFree, reload: load }}>
      {children}
    </PremiumCtx.Provider>
  );
}
