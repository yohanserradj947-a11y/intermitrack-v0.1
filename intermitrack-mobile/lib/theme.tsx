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

// ===== Thèmes PREMIUM =====

// Noir & Or : fond noir, or bruni, texte crème.
const noir: typeof light = {
  petrol: '#D4AF37', sage: '#C9A24B', sageSoft: '#1C1608',
  bg: '#08080A', card: '#141210', text: '#F4ECD6', muted: '#9C8858',
  line: '#33291A', soft: '#17130B', orange: '#C77B3C', orangeSoft: '#241B0C',
  green: '#C79A2E', warnBg: '#241B0C', warnBd: '#6B5320', warnTx: '#E6B84E',
  greenBg: '#1C1608', orangeBg: '#241B0C', danger: '#E5645B', track: '#2A2214',
};

// Rose Girly : fond rose clair, rose bonbon + lilas.
const rose: typeof light = {
  petrol: '#FF4FA0', sage: '#B98BFF', sageSoft: '#F3E7FF',
  bg: '#FFF5FB', card: '#FFFFFF', text: '#6D224C', muted: '#C56A99',
  line: '#F9D6E8', soft: '#FFE9F4', orange: '#FF9E7D', orangeSoft: '#FFE9F4',
  green: '#2FB98A', warnBg: '#FFF3E0', warnBd: '#FFC98A', warnTx: '#B45309',
  greenBg: '#DFF7EE', orangeBg: '#FFE3F0', danger: '#E5484D', track: '#F9D6E8',
};

// Rock'n'Roll : noir, chrome, rouge sang.
const rock: typeof light = {
  petrol: '#E11D2A', sage: '#D9D9D9', sageSoft: '#1A1A1A',
  bg: '#0B0B0B', card: '#151515', text: '#F4F4F4', muted: '#8C8C8C',
  line: '#2A2A2A', soft: '#1C1C1C', orange: '#CFCFCF', orangeSoft: '#241111',
  green: '#3FB477', warnBg: '#2A1A0A', warnBd: '#6B4B20', warnTx: '#F5B971',
  greenBg: '#12210F', orangeBg: '#241111', danger: '#FF4438', track: '#2A2A2A',
};

// Hip-Hop : noir, or, éclat de bombe verte.
const hiphop: typeof light = {
  petrol: '#FFD12E', sage: '#7CF03A', sageSoft: '#141A08',
  bg: '#0D0D0D', card: '#17130A', text: '#F6E7BF', muted: '#B2965A',
  line: '#2A2314', soft: '#181206', orange: '#7CF03A', orangeSoft: '#241B0C',
  green: '#7CF03A', warnBg: '#241B0C', warnBd: '#6B5320', warnTx: '#FFD86B',
  greenBg: '#132A0A', orangeBg: '#241B0C', danger: '#FF5A4D', track: '#2A2314',
};

// Lyrique : velours grenat, or patiné.
const lyric: typeof light = {
  petrol: '#C9A24B', sage: '#B24A5F', sageSoft: '#2A0E16',
  bg: '#1F070F', card: '#341321', text: '#F3E6C6', muted: '#C1A05A',
  line: '#4A2030', soft: '#2A0E18', orange: '#C86578', orangeSoft: '#2A1810',
  green: '#C79A2E', warnBg: '#2A1810', warnBd: '#6B4B20', warnTx: '#E6C06A',
  greenBg: '#241608', orangeBg: '#2A1810', danger: '#E5645B', track: '#4A2030',
};

const PALETTES = { light, dark, noir, rose, rock, hiphop, lyric };
export type ThemeId = 'light' | 'dark' | 'noir' | 'rose' | 'rock' | 'hiphop' | 'lyric' | 'custom';
export type Scheme = 'light' | 'dark'; // base pour StatusBar / DateTimePicker
export type Palette = typeof light;

// Réglages du thème « sur mesure ».
export type CustomSettings = { accent: string; accent2: string; base: Scheme };
const DEFAULT_CUSTOM: CustomSettings = { accent: '#6C5CE7', accent2: '#F79F1F', base: 'light' };

function buildCustom(s: CustomSettings): Palette {
  const base = s.base === 'dark' ? dark : light;
  return { ...base, petrol: s.accent, sage: s.accent, orange: s.accent2, green: s.accent2 };
}

// Palette d'un thème donné SANS composant React — utilisée par la synchro des widgets
// (lib/widgetSync) pour que les widgets adoptent le thème choisi dans l'app.
export function paletteFor(id: ThemeId, custom?: CustomSettings | null): Palette {
  if (id === 'custom') return buildCustom(custom || DEFAULT_CUSTOM);
  return (PALETTES as any)[id] || light;
}

// Métadonnées pour le sélecteur (aperçu couleurs + libellé).
export const THEME_META: { id: ThemeId; label: string; colors: string[]; premium: boolean }[] = [
  { id: 'light', label: 'Clair', colors: ['#1F4E5F', '#F97316', '#FFFFFF'], premium: false },
  { id: 'dark', label: 'Sombre', colors: ['#4FB0CC', '#F9A55C', '#1A2329'], premium: false },
  { id: 'noir', label: 'Noir & Or', colors: ['#D4AF37', '#8F6F2A', '#0A0A0A'], premium: true },
  { id: 'rose', label: 'Rose Girly', colors: ['#FF4FA0', '#B98BFF', '#FFF5FB'], premium: true },
  { id: 'rock', label: "Rock'n'Roll", colors: ['#E11D2A', '#D9D9D9', '#0B0B0B'], premium: true },
  { id: 'hiphop', label: 'Hip-Hop', colors: ['#FFD12E', '#7CF03A', '#0D0D0D'], premium: true },
  { id: 'lyric', label: 'Lyrique', colors: ['#C9A24B', '#8A2338', '#1F070F'], premium: true },
];

// Police caractéristique de chaque thème (polices système iOS, pas de fichier à charger).
export const THEME_FONTS: Partial<Record<ThemeId, string>> = {
  noir: 'Didot',
  rose: 'Snell Roundhand',
  rock: 'Copperplate',
  hiphop: 'Futura',
  lyric: 'Baskerville',
};
export type FontPref = 'default' | 'theme';

type ThemeCtx = {
  C: Palette; themeId: ThemeId; scheme: Scheme; custom: CustomSettings;
  fontPref: FontPref; fontFamily: string | null; hasThemeFont: boolean;
  setTheme: (id: ThemeId) => void; setCustom: (s: CustomSettings) => void; setFontPref: (p: FontPref) => void; toggle: () => void;
};
const ThemeContext = createContext<ThemeCtx>({
  C: light, themeId: 'light', scheme: 'light', custom: DEFAULT_CUSTOM,
  fontPref: 'theme', fontFamily: null, hasThemeFont: false,
  setTheme: () => {}, setCustom: () => {}, setFontPref: () => {}, toggle: () => {},
});

const STORAGE_KEY = 'intermitrack_theme';
const CUSTOM_KEY = 'intermitrack_theme_custom';
const FONT_KEY = 'intermitrack_theme_font';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>('light');
  const [custom, setCustomState] = useState<CustomSettings>(DEFAULT_CUSTOM);
  const [fontPref, setFontPrefState] = useState<FontPref>('theme');

  // Au démarrage : on relit le thème + les réglages perso + la préférence de police.
  useEffect(() => {
    (async () => {
      try {
        const v = await AsyncStorage.getItem(STORAGE_KEY);
        if (v && (PALETTES as any)[v]) setThemeId(v as ThemeId);
        else if (v === 'custom') setThemeId('custom');
        const cv = await AsyncStorage.getItem(CUSTOM_KEY);
        if (cv) { const p = JSON.parse(cv); if (p && p.accent) setCustomState({ ...DEFAULT_CUSTOM, ...p }); }
        const fv = await AsyncStorage.getItem(FONT_KEY);
        if (fv === 'default' || fv === 'theme') setFontPrefState(fv);
      } catch (e) {}
    })();
  }, []);

  function setFontPref(p: FontPref) {
    setFontPrefState(p);
    AsyncStorage.setItem(FONT_KEY, p);
  }

  // Les widgets ne lisaient le thème qu'au chargement des missions (onglet Calendrier) : changer de
  // thème ne les prévenait jamais, ils gardaient l'ancienne couleur. Retour Yohan : « le widget reste
  // tout le temps sombre quel que soit le thème ». On les prévient donc à chaque changement.
  // require() différé et non import en tête : widgetSync importe déjà ce fichier (paletteFor) — un
  // import statique créerait un cycle, avec paletteFor potentiellement undefined à l'initialisation.
  function pushThemeToWidgets(id: ThemeId, s: CustomSettings | null) {
    try { require('./widgetSync').syncWidgetTheme(id, s); } catch (e) { /* non bloquant */ }
  }

  function setTheme(id: ThemeId) {
    setThemeId(id);
    AsyncStorage.setItem(STORAGE_KEY, id);
    pushThemeToWidgets(id, custom);
  }

  function setCustom(s: CustomSettings) {
    setCustomState(s);
    setThemeId('custom');
    AsyncStorage.setItem(CUSTOM_KEY, JSON.stringify(s));
    AsyncStorage.setItem(STORAGE_KEY, 'custom');
    pushThemeToWidgets('custom', s);
  }

  // Conservé pour la bascule rapide clair <-> sombre.
  function toggle() {
    setThemeId(prev => {
      const next: ThemeId = prev === 'light' ? 'dark' : 'light';
      AsyncStorage.setItem(STORAGE_KEY, next);
      pushThemeToWidgets(next, custom); // même trou que setTheme : sans ça, les widgets ne suivent pas
      return next;
    });
  }

  const C: Palette = themeId === 'custom' ? buildCustom(custom) : PALETTES[themeId as keyof typeof PALETTES];
  const isLight = themeId === 'light' || themeId === 'rose' || (themeId === 'custom' && custom.base === 'light');
  const scheme: Scheme = isLight ? 'light' : 'dark';
  const themeFont = THEME_FONTS[themeId];
  const hasThemeFont = !!themeFont;
  const fontFamily = fontPref === 'theme' ? (themeFont ?? null) : null;

  return (
    <ThemeContext.Provider value={{ C, themeId, scheme, custom, fontPref, fontFamily, hasThemeFont, setTheme, setCustom, setFontPref, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

// Couleurs du thème courant (à utiliser dans chaque écran : const C = useTheme()).
export function useTheme(): Palette {
  return useContext(ThemeContext).C;
}

// Contrôles du thème : scheme (base light/dark), themeId, custom + setters.
export function useThemeControls() {
  const { scheme, themeId, custom, fontPref, fontFamily, hasThemeFont, setTheme, setCustom, setFontPref, toggle } = useContext(ThemeContext);
  return { scheme, themeId, custom, fontPref, fontFamily, hasThemeFont, setTheme, setCustom, setFontPref, toggle };
}
