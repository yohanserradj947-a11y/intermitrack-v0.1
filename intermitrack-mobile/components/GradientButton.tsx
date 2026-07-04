import { LinearGradient } from 'expo-linear-gradient';
import { Text, TouchableOpacity } from 'react-native';
import { useTheme } from '../lib/theme';

// Luminance d'une couleur hex (0 = noir, 1 = blanc).
function lum(hex: string) {
  const h = (hex || '').replace('#', '');
  const f = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(f, 16) || 0;
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// Bouton principal aux couleurs du thème (dégradé accent → accent secondaire).
// Le texte passe en foncé quand l'accent est clair (or, jaune…) pour rester lisible.
export function GradientButton({ onPress, label, style, textStyle, disabled }: any) {
  const C = useTheme();
  const inkOverride = lum(C.petrol) > 0.6 ? { color: '#0A0A0A' } : null;
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.85}>
      <LinearGradient
        colors={[C.petrol, C.green]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[{ alignItems: 'center', justifyContent: 'center' }, style, disabled && { opacity: 0.6 }]}>
        <Text style={[textStyle, inkOverride]}>{label}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}
