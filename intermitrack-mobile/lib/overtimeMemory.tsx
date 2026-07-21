import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { useSession } from './auth';
import { normalizeProd } from './prodColors';
import { OvertimeRule } from './overtime';

// Mémoire des RÈGLES d'heures supplémentaires par PRODUCTION (base garantie + heures + paliers).
// Retenue à l'enregistrement, pré-remplit la fois d'après. Même mécanique que priceMemory :
// stockée dans profiles.overtime_memory (JSON) ; défensif si la colonne n'existe pas encore
// (avant migration) → cache local sans planter.
type Ctx = {
  getOvertimeRule: (prod: string) => OvertimeRule | null;
  rememberOvertimeRule: (prod: string, rule: OvertimeRule) => void;
};
const OvertimeContext = createContext<Ctx>({} as Ctx);
export function useOvertimeMemory() { return useContext(OvertimeContext); }

const omkey = (uid: string) => `intermitrack_overtime_memory_${uid}`;

export function OvertimeMemoryProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const uid = session?.user?.id || null;
  const [rules, setRules] = useState<Record<string, OvertimeRule>>({});

  useEffect(() => {
    (async () => {
      if (!uid) { setRules({}); return; }
      const flagKey = `intermitrack_otmem_synced_${uid}`;
      let map: Record<string, OvertimeRule> = {};
      try {
        const { data } = await supabase.from('profiles').select('overtime_memory').eq('id', uid).maybeSingle();
        const db = (data && (data as any).overtime_memory) ? (data as any).overtime_memory : {};
        const flag = await AsyncStorage.getItem(flagKey);
        if (Object.keys(db).length) { map = db; }
        else if (!flag) {
          const l = await AsyncStorage.getItem(omkey(uid));
          const local = l ? JSON.parse(l) : {};
          if (Object.keys(local).length) { map = local; try { await supabase.from('profiles').upsert({ id: uid, overtime_memory: local }, { onConflict: 'id' }); } catch (e) {} }
        }
        await AsyncStorage.setItem(omkey(uid), JSON.stringify(map));
        await AsyncStorage.setItem(flagKey, '1');
      } catch (e) {
        try { const l = await AsyncStorage.getItem(omkey(uid)); map = l ? JSON.parse(l) : {}; } catch (_) { map = {}; }
      }
      setRules(map);
    })();
  }, [uid]);

  const getOvertimeRule = useCallback((prod: string) => {
    if (!prod) return null;
    const v = rules[normalizeProd(prod)];
    return v || null;
  }, [rules]);

  const rememberOvertimeRule = useCallback((prod: string, rule: OvertimeRule) => {
    if (!prod || !prod.trim() || !rule || !(rule.base > 0) || !(rule.heures > 0)) return;
    const k = normalizeProd(prod);
    setRules(prev => {
      const next = { ...prev, [k]: rule };
      if (uid) {
        AsyncStorage.setItem(omkey(uid), JSON.stringify(next));
        supabase.from('profiles').upsert({ id: uid, overtime_memory: next }, { onConflict: 'id' }).then(() => {}, () => {});
      }
      return next;
    });
  }, [uid]);

  return <OvertimeContext.Provider value={{ getOvertimeRule, rememberOvertimeRule }}>{children}</OvertimeContext.Provider>;
}
