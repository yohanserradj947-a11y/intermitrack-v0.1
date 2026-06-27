import { Ionicons } from '@expo/vector-icons';
import { usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../lib/theme';

// Une flèche "soignée" : double chevron avec une vague d'opacité qui s'écoule
// vers le bord, + léger scale/nudge en easing doux, dans une pastille glassy.
function FlowArrow({ dir, style }: { dir: 'left' | 'right'; style: ViewStyle }) {
  const C = useTheme();
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(t, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.ease), useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [t]);

  const name = dir === 'right' ? 'chevron-forward' : 'chevron-back';
  const peakA = t.interpolate({ inputRange: [0, 0.3, 0.6, 1], outputRange: [0.28, 1, 0.28, 0.28] });
  const peakB = t.interpolate({ inputRange: [0, 0.4, 0.7, 1], outputRange: [0.28, 0.28, 1, 0.28] });
  // L'ordre des chevrons : le premier rendu est côté centre, le second côté bord.
  // La vague doit culminer d'abord au centre puis au bord → flux vers l'extérieur.
  const centerOp = dir === 'right' ? peakA : peakB;
  const edgeOp = dir === 'right' ? peakB : peakA;
  const firstOp = dir === 'right' ? centerOp : edgeOp;
  const secondOp = dir === 'right' ? edgeOp : centerOp;

  const scale = t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.1, 1] });
  const nudge = t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, dir === 'right' ? 3 : -3, 0] });

  return (
    <Animated.View pointerEvents="none" style={[styles.bubble, { backgroundColor: C.card, borderColor: C.line }, style, { transform: [{ scale }, { translateX: nudge }] }]}>
      <Animated.View style={{ opacity: firstOp, marginRight: -9 }}>
        <Ionicons name={name} size={17} color={C.petrol} />
      </Animated.View>
      <Animated.View style={{ opacity: secondOp }}>
        <Ionicons name={name} size={17} color={C.petrol} />
      </Animated.View>
    </Animated.View>
  );
}

export function ScrollArrowHint({ tabs }: { tabs: string[] }) {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();

  // pathname : "/" pour le 1er onglet (index), "/missions", "/calendar"...
  const current = pathname === '/' ? tabs[0] : (pathname.split('/').filter(Boolean).pop() ?? tabs[0]);
  const idx = Math.max(0, tabs.indexOf(current));
  const bottom = (insets.bottom || 6) + 12;

  return (
    <>
      {idx > 0 && <FlowArrow dir="left" style={{ left: 4, bottom }} />}
      {idx < tabs.length - 1 && <FlowArrow dir="right" style={{ right: 4, bottom }} />}
    </>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    zIndex: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 30,
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(31,78,95,0.18)',
    shadowColor: '#0D1B2A',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
});
