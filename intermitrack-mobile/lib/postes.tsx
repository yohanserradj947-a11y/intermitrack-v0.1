import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { useSession } from './auth';

type Ctx = { postes: string[]; addPoste: (n: string) => void; removePoste: (n: string) => void };
const PostesContext = createContext<Ctx>({} as Ctx);
export function usePostes() { return useContext(PostesContext); }

const pkey = (uid: string) => `intermitrack_custom_postes_${uid}`;

export function PostesProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const uid = session?.user?.id || null;
  const [postes, setPostes] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      if (!uid) { setPostes([]); return; }
      const flagKey = `intermitrack_postes_synced_${uid}`;
      let arr: string[] = [];
      try {
        const { data } = await supabase.from('profiles').select('custom_postes').eq('id', uid).maybeSingle();
        const db = (data && Array.isArray(data.custom_postes)) ? data.custom_postes : [];
        const flag = await AsyncStorage.getItem(flagKey);
        if (db.length) { arr = db; }
        else if (!flag) { const l = await AsyncStorage.getItem(pkey(uid)); const local = l ? JSON.parse(l) : []; if (local.length) { arr = local; try { await supabase.from('profiles').upsert({ id: uid, custom_postes: local }, { onConflict: 'id' }); } catch (e) {} } }
        await AsyncStorage.setItem(pkey(uid), JSON.stringify(arr));
        await AsyncStorage.setItem(flagKey, '1');
      } catch (e) {
        try { const l = await AsyncStorage.getItem(pkey(uid)); arr = l ? JSON.parse(l) : []; } catch (_) { arr = []; }
      }
      setPostes(arr);
    })();
  }, [uid]);

  const persist = useCallback((next: string[]) => {
    if (uid) {
      AsyncStorage.setItem(pkey(uid), JSON.stringify(next));
      supabase.from('profiles').upsert({ id: uid, custom_postes: next }, { onConflict: 'id' }).then(() => {}, () => {});
    }
  }, [uid]);

  const addPoste = useCallback((n: string) => {
    const v = (n || '').trim();
    if (!v) return;
    setPostes(prev => {
      if (prev.map(x => x.toLowerCase()).includes(v.toLowerCase())) return prev;
      const next = [...prev, v];
      persist(next);
      return next;
    });
  }, [persist]);

  const removePoste = useCallback((n: string) => {
    setPostes(prev => {
      const next = prev.filter(x => x.toLowerCase() !== (n || '').toLowerCase());
      persist(next);
      return next;
    });
  }, [persist]);

  return <PostesContext.Provider value={{ postes, addPoste, removePoste }}>{children}</PostesContext.Provider>;
}
