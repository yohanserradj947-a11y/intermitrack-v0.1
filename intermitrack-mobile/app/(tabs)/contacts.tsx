import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTrackView } from '../../lib/analytics';

const C = { petrol: '#1F4E5F', sage: '#12754A', bg: '#F5F7F6', card: '#FFFFFF', text: '#2D3748', muted: '#718096', line: '#E2E8F0' };

// type : 'tel' | 'mail' | 'url' | 'text'
type Line = { type: 'tel' | 'mail' | 'url' | 'text'; label: string; value?: string };
type Contact = { ic: keyof typeof Ionicons.glyphMap; name: string; role: string; lines: Line[] };

// Coordonnées vérifiées sur les sites officiels (France Travail, Audiens, Afdas, Thalie Santé, Guso).
const CONTACTS: Contact[] = [
  { ic: 'mail-outline', name: 'Intermitrack', role: 'Support, bug ou suggestion', lines: [
    { type: 'mail', label: 'intermitrack@gmail.com', value: 'intermitrack@gmail.com' },
    { type: 'url', label: 'intermitrack.fr', value: 'https://intermitrack.fr' },
  ] },
  { ic: 'briefcase-outline', name: 'France Travail Spectacle', role: 'Allocations chômage (annexes 8 & 10)', lines: [
    { type: 'tel', label: '3995 (puis « spectacle »)', value: '3995' },
    { type: 'tel', label: 'Étranger : +33 1 77 86 39 95', value: '+33177863995' },
    { type: 'text', label: '📍 Centre de recouvrement Cinéma Spectacle, TSA 70113, 92891 Nanterre Cedex 09' },
    { type: 'url', label: 'francetravail.fr/spectacle', value: 'https://www.francetravail.fr/spectacle/' },
  ] },
  { ic: 'shield-checkmark-outline', name: 'Audiens', role: 'Retraite, prévoyance, santé, action sociale', lines: [
    { type: 'tel', label: '0 173 173 755 (intermittents & pigistes)', value: '0173173755' },
    { type: 'text', label: '📍 74 rue Jean-Bleuzen, 92177 Vanves Cedex' },
    { type: 'url', label: 'audiens.org', value: 'https://www.audiens.org' },
  ] },
  { ic: 'sunny-outline', name: 'Congés Spectacles', role: 'Caisse des congés payés (gérée par Audiens)', lines: [
    { type: 'tel', label: '0 173 173 434 (lun-ven 8h30-18h)', value: '0173173434' },
    { type: 'text', label: '📍 Audiens – Indemnités de congés payés, TSA 90406, 92177 Vanves Cedex' },
    { type: 'url', label: 'conges-spectacles.com', value: 'https://www.conges-spectacles.com' },
  ] },
  { ic: 'school-outline', name: 'Afdas', role: 'Formation professionnelle & conseil carrière', lines: [
    { type: 'tel', label: '01 44 78 55 87 (intermittents)', value: '0144785587' },
    { type: 'text', label: '📍 66 rue Stendhal, 75020 Paris' },
    { type: 'url', label: 'afdas.com', value: 'https://www.afdas.com' },
  ] },
  { ic: 'medkit-outline', name: 'Thalie Santé (ex-CMB)', role: 'Médecine du travail du spectacle', lines: [
    { type: 'tel', label: '01 49 27 60 05', value: '0149276005' },
    { type: 'text', label: '📍 7 rue Bergère, 75009 Paris' },
    { type: 'url', label: 'thalie-sante.org', value: 'https://www.thalie-sante.org' },
  ] },
  { ic: 'document-text-outline', name: 'Guso', role: 'Guichet unique du spectacle occasionnel', lines: [
    { type: 'tel', label: '0 805 41 40 41 (gratuit, lun-ven 9h-17h)', value: '0805414041' },
    { type: 'url', label: 'guso.fr', value: 'https://www.guso.fr' },
  ] },
  { ic: 'globe-outline', name: 'Autres liens utiles', role: 'Démarches en ligne', lines: [
    { type: 'url', label: 'autoentrepreneur.urssaf.fr (micro-entreprise)', value: 'https://www.autoentrepreneur.urssaf.fr' },
    { type: 'url', label: 'impots.gouv.fr (déclaration, impôt)', value: 'https://www.impots.gouv.fr' },
    { type: 'url', label: 'service-public.fr', value: 'https://www.service-public.fr' },
  ] },
];

function open(line: Line) {
  if (!line.value) return;
  const url = line.type === 'tel' ? 'tel:' + line.value : line.type === 'mail' ? 'mailto:' + line.value : line.value;
  Linking.openURL(url).catch(() => {});
}

const ICON: Record<string, string> = { tel: '📞', mail: '✉️', url: '🔗', text: '' };

export default function Contacts() {
  useTrackView('contacts');
  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={s.pageHeader}>
        <Text style={s.pageTitle}>Contacts utiles</Text>
        <Text style={s.pageSub}>Les organismes clés de l&apos;intermittent du spectacle</Text>
      </View>

      <Text style={s.intro}>Coordonnées des principaux organismes. Les numéros et horaires peuvent évoluer — vérifie toujours sur les sites officiels.</Text>

      <View style={{ paddingHorizontal: 14, gap: 12 }}>
        {CONTACTS.map((ct) => (
          <View key={ct.name} style={s.card}>
            <View style={s.head}>
              <LinearGradient colors={[C.petrol, C.sage]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.ic}>
                <Ionicons name={ct.ic} size={22} color="#fff" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{ct.name}</Text>
                <Text style={s.role}>{ct.role}</Text>
              </View>
            </View>
            <View style={s.body}>
              {ct.lines.map((ln, i) => (
                ln.type === 'text'
                  ? <Text key={i} style={s.lineText}>{ln.label}</Text>
                  : <TouchableOpacity key={i} onPress={() => open(ln)} style={s.lineRow}>
                      <Text style={s.lineIc}>{ICON[ln.type]}</Text>
                      <Text style={s.lineLink}>{ln.label}</Text>
                    </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  pageHeader: { backgroundColor: 'white', padding: 18, paddingTop: 52, borderBottomWidth: 1, borderBottomColor: C.line },
  pageTitle: { fontSize: 22, fontWeight: '900', color: C.petrol, letterSpacing: -0.5 },
  pageSub: { fontSize: 13, color: C.muted, marginTop: 4 },
  intro: { fontSize: 12.5, color: C.muted, lineHeight: 18, padding: 14, paddingBottom: 4 },
  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 16, gap: 10, shadowColor: '#0D1B2A', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  ic: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '800', color: C.petrol },
  role: { fontSize: 12, color: C.muted, marginTop: 2 },
  body: { gap: 7 },
  lineText: { fontSize: 13, color: C.text, lineHeight: 19 },
  lineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  lineIc: { fontSize: 13, lineHeight: 19 },
  lineLink: { flex: 1, fontSize: 13, color: C.petrol, fontWeight: '700', lineHeight: 19 },
});
