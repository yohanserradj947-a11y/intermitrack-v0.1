import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { useSession } from './auth';

// 5 couleurs de base (identiques au site) + palette par défaut (sans couleur perso).
export const PROD_PRESETS = ['#1E6FE0', '#F0552B', '#15B86B', '#F59E0B', '#7C3AED'];
const DEFAULT_PALETTE = ['#1F4E5F', '#2A6174', '#3A7A8F', '#7A9E7E', '#8AB08E', '#9AC09E', '#F97316', '#FDBA74', '#4A8FA5', '#5A9FB5'];

export function normalizeProd(name: string) { return (name || '').toUpperCase().trim(); }

// Couleur de texte lisible (blanc/foncé) selon la luminance.
export function textOn(hex: string): string {
  const h = (hex || '').replace('#', '');
  const f = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(f, 16) || 0;
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luma > 0.62 ? '#1A2330' : '#FFFFFF';
}

// Éclaircit (amt>0) ou assombrit (amt<0) une couleur.
export function shade(hex: string, amt: number): string {
  const h = (hex || '').replace('#', '');
  const f = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(f, 16) || 0;
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) { r = r + (255 - r) * amt; g = g + (255 - g) * amt; b = b + (255 - b) * amt; }
  else { const k = 1 + amt; r *= k; g *= k; b *= k; }
  const to = (x: number) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0');
  return '#' + to(r) + to(g) + to(b);
}
// Dégradé premium d'une case (foncé → couleur → clair), identique au site.
export function prodGradient(hex: string): readonly [string, string, string] {
  return [shade(hex, -0.14), hex, shade(hex, 0.36)];
}

type Ctx = {
  colors: Record<string, string>;
  getColor: (name: string) => string | null;
  colorOrDefault: (name: string, index: number) => string;
  setColor: (name: string, hex: string | null) => void;
  reset: () => void;
  custom: string[];
  addCustom: (hex: string) => void;
};
const ColorsContext = createContext<Ctx>({} as Ctx);
export function useProdColors() { return useContext(ColorsContext); }

const ckey = (uid: string) => `intermitrack_production_colors_${uid}`;
const customKey = (uid: string) => `intermitrack_custom_colors_${uid}`;

export function ProdColorsProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const uid = session?.user?.id || null;
  const [colors, setColors] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState<string[]>([]);

  // Au login : la base Supabase fait foi, sinon on migre le local vers la base.
  useEffect(() => {
    (async () => {
      if (!uid) { setColors({}); setCustom([]); return; }
      const flagKey = `intermitrack_colors_synced_${uid}`;
      let cols: Record<string, string> = {};
      try {
        const { data } = await supabase.from('profiles').select('production_colors').eq('id', uid).maybeSingle();
        const dbCols = (data && data.production_colors) ? data.production_colors : {};
        const flag = await AsyncStorage.getItem(flagKey);
        if (Object.keys(dbCols).length) {
          // La base a des couleurs → elle fait foi.
          cols = dbCols;
        } else if (!flag) {
          // 1re synchro, base vide → on migre le local s'il y en a.
          const l = await AsyncStorage.getItem(ckey(uid));
          const local = l ? JSON.parse(l) : {};
          if (Object.keys(local).length) { cols = local; try { await supabase.from('profiles').upsert({ id: uid, production_colors: local }, { onConflict: 'id' }); } catch (e) {} }
        }
        // flag déjà posé + base vide → on respecte le vide (réinitialisation volontaire).
        await AsyncStorage.setItem(ckey(uid), JSON.stringify(cols));
        await AsyncStorage.setItem(flagKey, '1');
      } catch (e) {
        try { const l = await AsyncStorage.getItem(ckey(uid)); cols = l ? JSON.parse(l) : {}; } catch (_) { cols = {}; }
      }
      setColors(cols);
      try { const l = await AsyncStorage.getItem(customKey(uid)); setCustom(l ? JSON.parse(l) : []); } catch (e) { setCustom([]); }
    })();
  }, [uid]);

  const getColor = useCallback((name: string) => {
    const v = colors[normalizeProd(name)];
    return (v && /^#/.test(v)) ? v : null;
  }, [colors]);

  const colorOrDefault = useCallback((name: string, index: number) =>
    getColor(name) || DEFAULT_PALETTE[index % DEFAULT_PALETTE.length], [getColor]);

  const setColor = useCallback((name: string, hex: string | null) => {
    const nn = normalizeProd(name);
    setColors(prev => {
      const next = { ...prev };
      if (!hex) delete next[nn]; else next[nn] = hex;
      if (uid) {
        AsyncStorage.setItem(ckey(uid), JSON.stringify(next));
        supabase.from('profiles').upsert({ id: uid, production_colors: next }, { onConflict: 'id' }).then(() => {}, () => {});
      }
      return next;
    });
  }, [uid]);

  const reset = useCallback(() => {
    setColors({});
    if (uid) {
      AsyncStorage.setItem(ckey(uid), JSON.stringify({}));
      supabase.from('profiles').upsert({ id: uid, production_colors: {} }, { onConflict: 'id' }).then(() => {}, () => {});
    }
  }, [uid]);

  const addCustom = useCallback((hex: string) => {
    const h = (hex || '').toLowerCase();
    setCustom(prev => {
      if (prev.map(c => c.toLowerCase()).includes(h) || PROD_PRESETS.map(c => c.toLowerCase()).includes(h)) return prev;
      const next = [...prev, h];
      if (uid) AsyncStorage.setItem(customKey(uid), JSON.stringify(next));
      return next;
    });
  }, [uid]);

  return (
    <ColorsContext.Provider value={{ colors, getColor, colorOrDefault, setColor, reset, custom, addCustom }}>
      {children}
    </ColorsContext.Provider>
  );
}
