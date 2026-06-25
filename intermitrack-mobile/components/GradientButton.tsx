import { LinearGradient } from 'expo-linear-gradient';
import { Text, TouchableOpacity } from 'react-native';

// Bouton aux couleurs Intermitrack (dégradé pétrole → sauge).
export function GradientButton({ onPress, label, style, textStyle, disabled }: any) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.85}>
      <LinearGradient
        colors={['#1F4E5F', '#12754A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[{ alignItems: 'center', justifyContent: 'center' }, style, disabled && { opacity: 0.6 }]}>
        <Text style={textStyle}>{label}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}
