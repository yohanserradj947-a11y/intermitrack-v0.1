import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

export type Tier = 'pionnier' | 'gratuit' | 'premium';

type Ctx = {
  tier: Tier;
  effectiveTier: Tier;   // tient compte du mode "aperçu Gratuit" (test perso)
  previewFree: boolean;
  setPreviewFree: (v: boolean) => void;
  reload: () => void;
};

const PremiumCtx = createContext<Ctx>({
  tier: 'pionnier', effectiveTier: 'pionnier', previewFree: false,
  setPreviewFree: () => {}, reload: () => {},
});

export function usePremium() { return useContext(PremiumCtx); }

// Un onglet Premium est verrouillé uniquement pour le tier 'gratuit'
// (pionnier et premium ont tout).
export function isLocked(effectiveTier: Tier) { return effectiveTier === 'gratuit'; }

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const [tier, setTier] = useState<Tier>('pionnier');
  const [previewFree, setPF] = useState(false);

  async function load() {
    try {
      const pf = await AsyncStorage.getItem('itk_preview_free');
      setPF(pf === '1');
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from('profiles').select('tier').eq('id', user.id).maybeSingle();
        if (data?.tier === 'pionnier' || data?.tier === 'gratuit' || data?.tier === 'premium') setTier(data.tier);
      }
    } catch (e) {}
  }
  useEffect(() => { load(); }, []);

  function setPreviewFree(v: boolean) { setPF(v); AsyncStorage.setItem('itk_preview_free', v ? '1' : '0'); }

  const effectiveTier: Tier = previewFree ? 'gratuit' : tier;
  return (
    <PremiumCtx.Provider value={{ tier, effectiveTier, previewFree, setPreviewFree, reload: load }}>
      {children}
    </PremiumCtx.Provider>
  );
}
