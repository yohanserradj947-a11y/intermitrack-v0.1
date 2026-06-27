import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Palette CLAIRE = exactement les couleurs actuelles de l'app (rien ne change en mode clair).
const light = {
  petrol: '#1F4E5F', sage: '#7A9E7E', sageSoft: '#E6F0E8',
  bg: '#F5F7F6', card: '#FFFFFF', text: '#2D3748', muted: '#718096',
  line: '#E2E8F0', soft: '#EEF4F1', orange: '#F97316', orangeSoft: '#FFF1E6',
  green: '#12754A', warnBg: '#FFF7ED', warnBd: '#FDBA74', warnTx: '#9A3412',
  greenBg: '#E3F6E9', orangeBg: '#FDF1DC', danger: '#DC2626', track: '#E2E8F0',
};

// Palette SOMBRE = équivalents lisibles sur fond foncé.
const dark: typeof light = {
  petrol: '#4FB0CC', sage: '#8FC093', sageSoft: '#1E2E22',
  bg: '#0F1518', card: '#1A2329', text: '#E8EDEF', muted: '#9AA8B2',
  line: '#2A363D', soft: '#222D33', orange: '#F9A55C', orangeSoft: '#332518',
  green: '#3FB477', warnBg: '#33291A', warnBd: '#6B5320', warnTx: '#FBD38D',
  greenBg: '#15301F', orangeBg: '#33271A', danger: '#F87171', track: '#2A363D',
};

const PALETTES = { light, dark };
export type Scheme = 'light' | 'dark';
export type Palette = typeof light;

type ThemeCtx = { C: Palette; scheme: Scheme; toggle: () => void };
const ThemeContext = createContext<ThemeCtx>({ C: light, scheme: 'light', toggle: () => {} });

const STORAGE_KEY = 'intermitrack_theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [scheme, setScheme] = useState<Scheme>('light');

  // Au démarrage : on relit le choix mémorisé (clair par défaut).
  useEffect(() => {
    (async () => {
      const v = await AsyncStorage.getItem(STORAGE_KEY);
      if (v === 'dark' || v === 'light') setScheme(v);
    })();
  }, []);

  function toggle() {
    setScheme(prev => {
      const next: Scheme = prev === 'dark' ? 'light' : 'dark';
      AsyncStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }

  return (
    <ThemeContext.Provider value={{ C: PALETTES[scheme], scheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

// Couleurs du thème courant (à utiliser dans chaque écran : const C = useTheme()).
export function useTheme(): Palette {
  return useContext(ThemeContext).C;
}

// Pour l'interrupteur clair/sombre.
export function useThemeControls() {
  const { scheme, toggle } = useContext(ThemeContext);
  return { scheme, toggle };
}
