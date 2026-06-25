import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

const SEEN_KEY = 'swipeHintSeen_v1';

// Indication "glissez pour changer d'onglet", affichée une seule fois.
export function SwipeHint() {
  const [visible, setVisible] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(0)).current;
  const dismissed = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    AsyncStorage.getItem(SEEN_KEY).then((v) => {
      if (v) return;
      setVisible(true);
      Animated.timing(opacity, { toValue: 1, duration: 350, useNativeDriver: true }).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(slide, { toValue: 1, duration: 750, useNativeDriver: true }),
          Animated.timing(slide, { toValue: 0, duration: 750, useNativeDriver: true }),
        ])
      ).start();
      timer = setTimeout(dismiss, 5000);
    });
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = () => {
    if (dismissed.current) return;
    dismissed.current = true;
    AsyncStorage.setItem(SEEN_KEY, '1');
    Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => setVisible(false));
  };

  if (!visible) return null;
  const translateX = slide.interpolate({ inputRange: [0, 1], outputRange: [-14, 14] });

  return (
    <Animated.View style={[styles.overlay, { opacity }]}>
      <Pressable style={styles.fill} onPress={dismiss}>
        <View style={styles.card}>
          <Animated.View style={[styles.row, { transform: [{ translateX }] }]}>
            <Ionicons name="chevron-back" size={26} color="#fff" />
            <Ionicons name="hand-left-outline" size={40} color="#fff" style={{ marginHorizontal: 10 }} />
            <Ionicons name="chevron-forward" size={26} color="#fff" />
          </Animated.View>
          <Text style={styles.title}>Glissez vers la gauche ou la droite</Text>
          <Text style={styles.subtitle}>pour changer d&apos;onglet</Text>
          <Text style={styles.tap}>Touchez pour fermer</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999, backgroundColor: 'rgba(13,27,42,0.78)' },
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { alignItems: 'center', gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  title: { color: '#fff', fontSize: 17, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: '#fff', fontSize: 17, fontWeight: '800', textAlign: 'center' },
  tap: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600', marginTop: 16 },
});
