import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const C = { petrol: '#1F4E5F', line: '#E2E8F0', soft: '#EEF4F1', muted: '#718096', sage: '#12754A' };

// Champ d'adresse avec suggestions en direct (API Adresse, France).
// Affiche le département, et renvoie les coordonnées exactes de la suggestion choisie via onCoords.
export default function AddressInput({ value, onChangeText, onCoords, style, placeholder }: any) {
  const [sugs, setSugs] = useState<any[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function change(t: string) {
    onChangeText(t);
    if (onCoords) onCoords(null); // texte modifié → coordonnées à reconfirmer
    if (timer.current) clearTimeout(timer.current);
    if (t.trim().length < 3) { setSugs([]); return; }
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch('https://api-adresse.data.gouv.fr/search/?limit=6&q=' + encodeURIComponent(t));
        const j = await r.json();
        setSugs(j.features || []);
      } catch {
        setSugs([]);
      }
    }, 250);
  }

  return (
    <View>
      <TextInput style={style} value={value} onChangeText={change} placeholder={placeholder} placeholderTextColor={C.muted} />
      {sugs.length > 0 && (
        <View style={a.box}>
          {sugs.map((f: any, i: number) => {
            const p = f.properties || {};
            const ctx = String(p.context || '');
            const dep = ctx.split(',')[0].trim();             // n° de département
            const rest = ctx.split(',').slice(1).join(',').trim(); // nom du département + région
            return (
              <TouchableOpacity
                key={i}
                style={a.item}
                onPress={() => { onChangeText(p.label); if (onCoords) onCoords(f.geometry?.coordinates || null); setSugs([]); }}>
                <Text style={a.txt}>📍 {p.label}</Text>
                {ctx ? <Text style={a.sub}>{dep ? `Dépt ${dep}` : ''}{rest ? ` · ${rest}` : ''}</Text> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const a = StyleSheet.create({
  box: { backgroundColor: 'white', borderWidth: 1, borderColor: C.line, borderRadius: 14, marginTop: 6, overflow: 'hidden' },
  item: { paddingVertical: 11, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.soft },
  txt: { fontSize: 14, fontWeight: '700', color: C.petrol },
  sub: { fontSize: 12, fontWeight: '600', color: C.sage, marginTop: 2 },
});
