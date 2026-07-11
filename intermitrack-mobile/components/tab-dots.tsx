import { View } from 'react-native';
import { useTheme } from '@/lib/theme';

// Rangée de points de position, collée juste au-dessus de la barre d'onglets.
// Remplace les anciennes flèches flottantes : montre où on est + qu'il y a
// d'autres onglets à gauche/droite, sans jamais recouvrir les onglets.
export function TabDots({ index, count }: { index: number; count: number }) {
  const C = useTheme();
  return (
    <View pointerEvents="none" style={{ alignItems: 'center', paddingTop: 6, paddingBottom: 4, backgroundColor: C.card }}>
      <View style={{ flexDirection: 'row', gap: 5 }}>
        {Array.from({ length: count }).map((_, i) => (
          <View
            key={i}
            style={{
              width: i === index ? 16 : 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: i === index ? C.petrol : C.line,
            }}
          />
        ))}
      </View>
    </View>
  );
}
