import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/theme';
import { showAlert } from '../lib/dialog';

// Libellé de champ + petit « ? » qui explique le champ (retour Lila : aiguiller les gens,
// ex « nom de l'émission » incompréhensible pour quelqu'un qui fait de la tournée).
// Le texte d'aide est volontairement large (TV, concert, théâtre, événement…).
export default function FieldLabel({ text, help, style }: { text: string; help?: string; style?: any }) {
  const C = useTheme();
  const title = text.replace(/\s*\(.*\)\s*$/, ''); // titre du pop-up sans le « (facultatif) »
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <Text style={style}>{text}</Text>
      {help ? (
        <TouchableOpacity
          onPress={() => showAlert(title, help)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel={`Aide : ${title}`}
        >
          <Ionicons name="help-circle-outline" size={16} color={C.petrol} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
