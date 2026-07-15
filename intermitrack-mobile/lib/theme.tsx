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
export type BuiltInId = 'light' | 'dark' | 'noir' | 'rose' | 'rock' | 'hiphop' | 'lyric';
// 'custom' = ancienne clé unique, conservée pour la migration. `custom:<id>` = un thème perso nommé.
export type ThemeId = BuiltInId | 'custom' | `custom:${string}`;
export type Scheme = 'light' | 'dark'; // base pour StatusBar / DateTimePicker
export type Palette = typeof light;

// Réglages d'un thème sur mesure.
export type CustomSettings = { accent: string; accent2: string; base: Scheme };
export const DEFAULT_CUSTOM: CustomSettings = { accent: '#6C5CE7', accent2: '#F79F1F', base: 'light' };

// Un thème perso ENREGISTRÉ : il a un nom, il vit dans une bibliothèque, on le retrouve à côté des
// thèmes de base et on en change librement.
// Avant, il n'existait qu'un seul emplacement anonyme, écrasé dès qu'on en refaisait un et perdu dès
// qu'on choisissait Rock. Retour Yohan : « on le crée, il apparaît directement, mais il n'y a pas de
// validation, on ne peut pas lui donner un nom ni le retrouver ».
export type CustomTheme = { id: string; name: string; settings: CustomSettings };

export function isCustomId(id: string) { return id === 'custom' || id.startsWith('custom:'); }
function customIdOf(id: string) { return id.startsWith('custom:') ? id.slice(7) : ''; }

function buildCustom(s: CustomSettings): Palette {
  const base = s.base === 'dark' ? dark : light;
  return { ...base, petrol: s.accent, sage: s.accent, orange: s.accent2, green: s.accent2 };
}

// Palette d'un thème donné SANS composant React — utilisée par la synchro des widgets
// (lib/widgetSync) pour que les widgets adoptent le thème choisi dans l'app.
// `customs` accepte la bibliothèque (nouveau) OU des réglages seuls (ancien format), pour que les
// appelants n'aient pas tous à changer en même temps.
export function paletteFor(id: ThemeId, customs?: CustomTheme[] | CustomSettings | null): Palette {
  if (!isCustomId(id)) return (PALETTES as any)[id] || light;
  if (Array.isArray(customs)) {
    const t = customs.find((c) => c.id === customIdOf(id)) || customs[0];
    return buildCustom(t ? t.settings : DEFAULT_CUSTOM);
  }
  return buildCustom((customs as CustomSettings) || DEFAULT_CUSTOM);
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
  C: Palette; themeId: ThemeId; scheme: Scheme;
  customs: CustomTheme[];              // la bibliothèque des thèmes perso nommés
  activeCustom?: CustomTheme;          // celui en cours, s'il y en a un
  fontPref: FontPref; fontFamily: string | null; hasThemeFont: boolean;
  setTheme: (id: ThemeId) => void;
  saveCustom: (name: string, settings: CustomSettings, id?: string) => string; // création OU modification
  deleteCustom: (id: string) => void;
  setFontPref: (p: FontPref) => void; toggle: () => void;
};
const ThemeContext = createContext<ThemeCtx>({
  C: light, themeId: 'light', scheme: 'light', customs: [],
  fontPref: 'theme', fontFamily: null, hasThemeFont: false,
  setTheme: () => {}, saveCustom: () => '', deleteCustom: () => {}, setFontPref: () => {}, toggle: () => {},
});

const STORAGE_KEY = 'intermitrack_theme';
const CUSTOM_KEY = 'intermitrack_theme_custom';   // ancien : UN seul thème sur mesure, anonyme
const CUSTOM_LIST_KEY = 'intermitrack_themes_custom'; // nouveau : la bibliothèque nommée
const FONT_KEY = 'intermitrack_theme_font';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>('light');
  const [customs, setCustoms] = useState<CustomTheme[]>([]);
  const [fontPref, setFontPrefState] = useState<FontPref>('theme');

  // Au démarrage : on relit le thème + la bibliothèque perso + la préférence de police.
  useEffect(() => {
    (async () => {
      try {
        const v = await AsyncStorage.getItem(STORAGE_KEY);
        const raw = await AsyncStorage.getItem(CUSTOM_LIST_KEY);
        let list: CustomTheme[] = [];
        try { const p = JSON.parse(raw || '[]'); if (Array.isArray(p)) list = p.filter((x) => x && x.id && x.settings); } catch (e) {}

        // MIGRATION : l'ancien thème unique et anonyme devient une entrée nommée de la bibliothèque,
        // au lieu d'être perdu. On ne le fait qu'une fois — la bibliothèque, une fois créée, fait foi.
        if (!list.length) {
          const cv = await AsyncStorage.getItem(CUSTOM_KEY);
          if (cv) {
            const p = JSON.parse(cv);
            if (p && p.accent) {
              list = [{ id: 'legacy', name: 'Mon thème', settings: { ...DEFAULT_CUSTOM, ...p } }];
              await AsyncStorage.setItem(CUSTOM_LIST_KEY, JSON.stringify(list));
            }
          }
        }
        setCustoms(list);

        // 'custom' (ancienne clé) pointe vers le thème migré s'il existe.
        if (v && (PALETTES as any)[v]) setThemeId(v as ThemeId);
        else if (v === 'custom') setThemeId(list.length ? (`custom:${list[0].id}` as ThemeId) : 'light');
        else if (v && v.startsWith('custom:') && list.some((c) => `custom:${c.id}` === v)) setThemeId(v as ThemeId);

        const fv = await AsyncStorage.getItem(FONT_KEY);
        if (fv === 'default' || fv === 'theme') setFontPrefState(fv);
      } catch (e) {}
    })();
  }, []);

  function persistCustoms(list: CustomTheme[]) {
    setCustoms(list);
    AsyncStorage.setItem(CUSTOM_LIST_KEY, JSON.stringify(list));
  }

  // Enregistre un thème nommé (création ou modification) et l'applique. C'est LA validation qui
  // manquait : tant qu'on n'appelle pas ceci, rien n'est acquis.
  function saveCustom(name: string, settings: CustomSettings, id?: string): string {
    const tid = id || String(Date.now());
    const clean = (name || '').trim() || `Mon thème ${customs.length + 1}`;
    const list = id && customs.some((c) => c.id === id)
      ? customs.map((c) => (c.id === id ? { ...c, name: clean, settings } : c))
      : [...customs, { id: tid, name: clean, settings }];
    persistCustoms(list);
    const next = `custom:${tid}` as ThemeId;
    setThemeId(next);
    AsyncStorage.setItem(STORAGE_KEY, next);
    pushThemeToWidgets(next, list);
    return tid;
  }

  function deleteCustom(id: string) {
    const list = customs.filter((c) => c.id !== id);
    persistCustoms(list);
    // Si on supprime le thème actif, on ne laisse pas l'appli sur une référence morte.
    if (themeId === `custom:${id}`) {
      setThemeId('light');
      AsyncStorage.setItem(STORAGE_KEY, 'light');
      pushThemeToWidgets('light', list);
    }
  }

  function setFontPref(p: FontPref) {
    setFontPrefState(p);
    AsyncStorage.setItem(FONT_KEY, p);
  }

  // Les widgets ne lisaient le thème qu'au chargement des missions (onglet Calendrier) : changer de
  // thème ne les prévenait jamais, ils gardaient l'ancienne couleur. Retour Yohan : « le widget reste
  // tout le temps sombre quel que soit le thème ». On les prévient donc à chaque changement.
  // require() différé et non import en tête : widgetSync importe déjà ce fichier (paletteFor) — un
  // import statique créerait un cycle, avec paletteFor potentiellement undefined à l'initialisation.
  function pushThemeToWidgets(id: ThemeId, list: CustomTheme[]) {
    try { require('./widgetSync').syncWidgetTheme(id, list); } catch (e) { /* non bloquant */ }
  }

  function setTheme(id: ThemeId) {
    setThemeId(id);
    AsyncStorage.setItem(STORAGE_KEY, id);
    pushThemeToWidgets(id, customs);
  }

  // Conservé pour la bascule rapide clair <-> sombre.
  function toggle() {
    setThemeId(prev => {
      const next: ThemeId = prev === 'light' ? 'dark' : 'light';
      AsyncStorage.setItem(STORAGE_KEY, next);
      pushThemeToWidgets(next, customs); // même trou que setTheme : sans ça, les widgets ne suivent pas
      return next;
    });
  }

  // Le thème actif, qu'il soit de base ou perso. paletteFor résout `custom:<id>` via la bibliothèque.
  const activeCustom = isCustomId(themeId) ? (customs.find((c) => `custom:${c.id}` === themeId) || customs[0]) : undefined;
  const C: Palette = paletteFor(themeId, customs);
  const isLight = themeId === 'light' || themeId === 'rose' || (!!activeCustom && activeCustom.settings.base === 'light');
  const scheme: Scheme = isLight ? 'light' : 'dark';
  const themeFont = (THEME_FONTS as any)[themeId];
  const hasThemeFont = !!themeFont;
  const fontFamily = fontPref === 'theme' ? (themeFont ?? null) : null;

  return (
    <ThemeContext.Provider value={{ C, themeId, scheme, customs, activeCustom, fontPref, fontFamily, hasThemeFont, setTheme, saveCustom, deleteCustom, setFontPref, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

// Couleurs du thème courant (à utiliser dans chaque écran : const C = useTheme()).
export function useTheme(): Palette {
  return useContext(ThemeContext).C;
}

// Contrôles du thème : scheme (base light/dark), themeId, bibliothèque perso + setters.
export function useThemeControls() {
  const { scheme, themeId, customs, activeCustom, fontPref, fontFamily, hasThemeFont, setTheme, saveCustom, deleteCustom, setFontPref, toggle } = useContext(ThemeContext);
  return { scheme, themeId, customs, activeCustom, fontPref, fontFamily, hasThemeFont, setTheme, saveCustom, deleteCustom, setFontPref, toggle };
}
