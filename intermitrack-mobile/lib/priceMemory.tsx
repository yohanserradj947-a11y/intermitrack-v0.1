import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { useSession } from './auth';
import { normalizeProd } from './prodColors';

// Mémoire de prix par (production + poste). Retenue SILENCIEUSEMENT à chaque enregistrement de
// mission, pré-remplit le prix la fois d'après. Ex : "ENDEMOL|POURSUITE" -> 230 ; "BLIVE|POURSUITE" -> 240.
// Le prix stocké est le prix PAR JOUR (ou par cachet). Priorité : prix appris > salaire journalier > vide.
function normPoste(p: string) { return (p || '').toUpperCase().trim(); }
export function priceKey(prod: string, poste: string) { return `${normalizeProd(prod)}|${normPoste(poste)}`; }
// Tarif AU NIVEAU PRODUCTION (tous postes confondus) : stocké sous un poste-marqueur. Sert de REPLI
// quand aucun tarif (prod + poste) précis n'existe. Réglable à la main dans « Modifier la production ».
const PROD_RATE = '__ALL__';

type Ctx = {
  getLearnedPrice: (prod: string, poste: string) => number | null;
  rememberPrice: (prod: string, poste: string, pricePerDay: number) => void;
  getProdRate: (prod: string) => number | null;
  setProdRate: (prod: string, rate: number) => void;
};
const PriceContext = createContext<Ctx>({} as Ctx);
export function usePriceMemory() { return useContext(PriceContext); }

const pmkey = (uid: string) => `intermitrack_price_memory_${uid}`;

export function PriceMemoryProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const uid = session?.user?.id || null;
  const [prices, setPrices] = useState<Record<string, number>>({});

  // Au login : la base fait foi, sinon on migre le local. Défensif : la colonne price_memory peut
  // ne pas encore exister (avant migration) → on retombe alors sur le cache local sans planter.
  useEffect(() => {
    (async () => {
      if (!uid) { setPrices({}); return; }
      const flagKey = `intermitrack_pricemem_synced_${uid}`;
      let map: Record<string, number> = {};
      try {
        const { data } = await supabase.from('profiles').select('price_memory').eq('id', uid).maybeSingle();
        const db = (data && (data as any).price_memory) ? (data as any).price_memory : {};
        const flag = await AsyncStorage.getItem(flagKey);
        if (Object.keys(db).length) { map = db; }
        else if (!flag) {
          const l = await AsyncStorage.getItem(pmkey(uid));
          const local = l ? JSON.parse(l) : {};
          if (Object.keys(local).length) { map = local; try { await supabase.from('profiles').upsert({ id: uid, price_memory: local }, { onConflict: 'id' }); } catch (e) {} }
        }
        await AsyncStorage.setItem(pmkey(uid), JSON.stringify(map));
        await AsyncStorage.setItem(flagKey, '1');
      } catch (e) {
        try { const l = await AsyncStorage.getItem(pmkey(uid)); map = l ? JSON.parse(l) : {}; } catch (_) { map = {}; }
      }
      setPrices(map);
    })();
  }, [uid]);

  const getLearnedPrice = useCallback((prod: string, poste: string) => {
    if (!prod) return null;
    if (poste) { const v = prices[priceKey(prod, poste)]; if (typeof v === 'number' && v > 0) return v; }
    const pr = prices[priceKey(prod, PROD_RATE)]; // repli : tarif défini au niveau de la production
    return (typeof pr === 'number' && pr > 0) ? pr : null;
  }, [prices]);

  const getProdRate = useCallback((prod: string) => {
    const v = prices[priceKey(prod, PROD_RATE)];
    return (typeof v === 'number' && v > 0) ? v : null;
  }, [prices]);

  const setProdRate = useCallback((prod: string, rate: number) => {
    if (!prod || !prod.trim()) return;
    const k = priceKey(prod, PROD_RATE);
    setPrices(prev => {
      const next = { ...prev };
      if (!(rate > 0)) delete next[k]; else next[k] = Math.round(rate * 100) / 100;
      if (uid) {
        AsyncStorage.setItem(pmkey(uid), JSON.stringify(next));
        supabase.from('profiles').upsert({ id: uid, price_memory: next }, { onConflict: 'id' }).then(() => {}, () => {});
      }
      return next;
    });
  }, [uid]);

  const rememberPrice = useCallback((prod: string, poste: string, pricePerDay: number) => {
    if (!prod || !prod.trim() || !poste || !poste.trim() || !(pricePerDay > 0)) return;
    const k = priceKey(prod, poste);
    const val = Math.round(pricePerDay * 100) / 100;
    setPrices(prev => {
      if (prev[k] === val) return prev; // rien de neuf → pas d'écriture
      const next = { ...prev, [k]: val };
      if (uid) {
        AsyncStorage.setItem(pmkey(uid), JSON.stringify(next));
        supabase.from('profiles').upsert({ id: uid, price_memory: next }, { onConflict: 'id' }).then(() => {}, () => {});
      }
      return next;
    });
  }, [uid]);

  return <PriceContext.Provider value={{ getLearnedPrice, rememberPrice, getProdRate, setProdRate }}>{children}</PriceContext.Provider>;
}
