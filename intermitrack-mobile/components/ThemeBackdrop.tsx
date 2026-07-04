import { useEffect, useMemo, useRef, ReactNode } from 'react';
import { Animated, View, Easing, StyleSheet, Dimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useThemeControls } from '../lib/theme';

const { width: W, height: H } = Dimensions.get('window');

// shapes: nom d'icône MaterialCommunityIcons, ou null = pastille ronde (poudre).
type Spec = {
  shapes: (string | null)[]; colors: string[]; count: number; dir: 'down' | 'up';
  sizeMin: number; sizeMax: number; dur: [number, number]; opacity: number;
};

// Ambiance premium PROPRE à chaque thème (4-5 éléments, vitesse douce).
const EFFECTS: Record<string, Spec> = {
  // Noir & Or : poudre d'or + éclats scintillants
  noir:   { shapes: [null, null, null, 'star-four-points', 'star'], colors: ['#D4AF37', '#E8CC6A', '#F1DDA0'], count: 22, dir: 'down', sizeMin: 3, sizeMax: 9, dur: [10000, 17000], opacity: 0.5 },
  // Rose Girly : cœurs, fleurs, papillons
  rose:   { shapes: ['heart', 'heart-outline', 'flower', 'flower-tulip', 'butterfly'], colors: ['#FF5FA6', '#FF9ECF', '#C79CFF'], count: 15, dir: 'up', sizeMin: 15, sizeMax: 28, dur: [12000, 20000], opacity: 0.5 },
  // Rock'n'Roll : guitare, ampli, médiator, note, tête de mort
  rock:   { shapes: ['guitar-electric', 'amplifier', 'guitar-pick', 'music', 'skull'], colors: ['#E11D2A', '#CFCFCF', '#F4F4F4'], count: 11, dir: 'down', sizeMin: 20, sizeMax: 36, dur: [13000, 21000], opacity: 0.42 },
  // Hip-Hop : bombe de tag, boombox, micro, casque, cassette
  hiphop: { shapes: ['spray', 'boombox', 'microphone-variant', 'headphones', 'cassette'], colors: ['#FFD12E', '#7CF03A', '#F6E7BF'], count: 11, dir: 'up', sizeMin: 20, sizeMax: 36, dur: [13000, 21000], opacity: 0.45 },
  // Lyrique : notes, clé de sol, violon
  lyric:  { shapes: ['music-note-eighth', 'music-note-quarter', 'music-clef-treble', 'music', 'violin'], colors: ['#C9A24B', '#E6C877'], count: 14, dir: 'up', sizeMin: 16, sizeMax: 30, dur: [13000, 22000], opacity: 0.5 },
};

function Particle({ x, dir, dur, delay, opacity, rotate, children }: {
  x: number; dir: 'down' | 'up'; dur: number; delay: number; opacity: number; rotate: string; children: ReactNode;
}) {
  const p = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(p, { toValue: 1, duration: dur, delay, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, []);
  const translateY = p.interpolate({ inputRange: [0, 1], outputRange: dir === 'down' ? [-60, H + 60] : [H + 60, -60] });
  const translateX = p.interpolate({ inputRange: [0, 0.5, 1], outputRange: [x, x + 20, x] });
  const opa = p.interpolate({ inputRange: [0, 0.14, 0.85, 1], outputRange: [0, opacity, opacity, 0] });
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', opacity: opa, transform: [{ translateX }, { translateY }, { rotate }] }}>
      {children}
    </Animated.View>
  );
}

export default function ThemeBackdrop() {
  const { themeId } = useThemeControls();
  const spec = EFFECTS[themeId as keyof typeof EFFECTS];

  const particles = useMemo(() => {
    if (!spec) return [];
    return Array.from({ length: spec.count }, (_, i) => {
      const color = spec.colors[i % spec.colors.length];
      const size = spec.sizeMin + Math.random() * (spec.sizeMax - spec.sizeMin);
      const shape = spec.shapes[Math.floor(Math.random() * spec.shapes.length)];
      const node: ReactNode = shape
        ? <MaterialCommunityIcons name={shape as any} size={size} color={color} />
        : <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
      return {
        key: `${themeId}-${i}`,
        x: Math.random() * W,
        dir: spec.dir,
        dur: spec.dur[0] + Math.random() * (spec.dur[1] - spec.dur[0]),
        delay: Math.random() * spec.dur[1],
        opacity: spec.opacity,
        rotate: `${Math.round((Math.random() - 0.5) * 36)}deg`,
        node,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeId]);

  if (!spec) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {particles.map(pp => <Particle key={pp.key} x={pp.x} dir={pp.dir} dur={pp.dur} delay={pp.delay} opacity={pp.opacity} rotate={pp.rotate}>{pp.node}</Particle>)}
    </View>
  );
}
