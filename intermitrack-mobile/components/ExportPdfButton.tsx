import { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '../lib/theme';
import { showAlert } from '../lib/dialog';
import { exportMissionsPdf } from '../lib/exportMissions';

const iso = (d: Date) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const fr = (d: Date) => d.toLocaleDateString('fr-FR');

// Bouton d'export PDF réutilisable (calendrier + missions). `discreet` = petit lien souligné.
export default function ExportPdfButton({ missions, discreet }: { missions: any[]; discreet?: boolean }) {
  const C: any = useTheme();
  const [show, setShow] = useState(false);
  const [period, setPeriod] = useState<'all' | 'year' | 'custom'>('all');
  const [year, setYear] = useState(new Date().getFullYear());
  const [from, setFrom] = useState<Date>(() => { const d = new Date(); d.setMonth(d.getMonth() - 2); return d; });
  const [to, setTo] = useState<Date>(new Date());
  const [pick, setPick] = useState<null | 'from' | 'to'>(null);

  function filtered() {
    const ms = missions || [];
    if (period === 'year') return ms.filter((m: any) => String(m.mission_date).slice(0, 4) === String(year));
    if (period === 'custom') {
      const a = iso(from), b = iso(to); const lo = a < b ? a : b, hi = a < b ? b : a;
      return ms.filter((m: any) => { const d = String(m.mission_date).slice(0, 10); return d >= lo && d <= hi; });
    }
    return ms;
  }
  async function go(layout: 'liste' | 'calendrier') {
    setShow(false);
    const r: any = await exportMissionsPdf(filtered(), layout);
    if (r?.empty) showAlert('Rien à exporter', 'Aucune mission sur la période choisie.');
    else if (r?.error) showAlert('Erreur', 'Impossible de générer le PDF.');
  }
  const chip = (v: 'all' | 'year' | 'custom', label: string) => (
    <TouchableOpacity onPress={() => setPeriod(v)} style={{ flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: period === v ? C.petrol : C.line, backgroundColor: period === v ? C.soft : 'transparent', alignItems: 'center' }}>
      <Text style={{ fontWeight: '800', fontSize: 12.5, color: period === v ? C.petrol : C.muted }}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <>
      {discreet ? (
        <TouchableOpacity onPress={() => setShow(true)} hitSlop={8} style={{ paddingVertical: 5, paddingHorizontal: 6 }}>
          <Text style={{ fontSize: 11.5, color: C.petrol, textDecorationLine: 'underline', fontWeight: '700' }}>Exporter</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={() => setShow(true)} activeOpacity={0.85} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 12, marginHorizontal: 14, marginVertical: 8, borderRadius: 12, borderWidth: 1.5, borderColor: C.petrol, backgroundColor: C.soft }}>
          <Ionicons name="download-outline" size={17} color={C.petrol} />
          <Text style={{ color: C.petrol, fontWeight: '800', fontSize: 12.5 }}>Exporter</Text>
        </TouchableOpacity>
      )}
      <Modal visible={show} transparent animationType="fade" onRequestClose={() => setShow(false)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setShow(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.5)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={{ backgroundColor: C.card, borderRadius: 20, padding: 20, width: '100%', maxWidth: 380 }}>
            <Text style={{ fontSize: 18, fontWeight: '900', color: C.petrol, marginBottom: 4 }}>Exporter en PDF</Text>
            <Text style={{ fontSize: 13, color: C.muted, marginBottom: 14 }}>Choisis la période, puis la mise en page.</Text>

            <Text style={{ fontSize: 11, fontWeight: '800', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Période</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              {chip('all', 'Tout')}{chip('year', 'Année')}{chip('custom', 'Personnalisé')}
            </View>
            {period === 'year' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, marginBottom: 12 }}>
                <TouchableOpacity onPress={() => setYear((y) => y - 1)} hitSlop={10}><Ionicons name="chevron-back" size={22} color={C.petrol} /></TouchableOpacity>
                <Text style={{ fontSize: 18, fontWeight: '900', color: C.petrol }}>{year}</Text>
                <TouchableOpacity onPress={() => setYear((y) => y + 1)} hitSlop={10}><Ionicons name="chevron-forward" size={22} color={C.petrol} /></TouchableOpacity>
              </View>
            )}
            {period === 'custom' && (
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                <TouchableOpacity onPress={() => setPick('from')} style={{ flex: 1, borderWidth: 1.5, borderColor: C.line, borderRadius: 11, padding: 11 }}>
                  <Text style={{ fontSize: 10.5, color: C.muted, fontWeight: '700' }}>Du</Text><Text style={{ fontSize: 13.5, color: C.text, fontWeight: '700' }}>{fr(from)}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setPick('to')} style={{ flex: 1, borderWidth: 1.5, borderColor: C.line, borderRadius: 11, padding: 11 }}>
                  <Text style={{ fontSize: 10.5, color: C.muted, fontWeight: '700' }}>Au</Text><Text style={{ fontSize: 13.5, color: C.text, fontWeight: '700' }}>{fr(to)}</Text>
                </TouchableOpacity>
              </View>
            )}
            {pick && (
              <DateTimePicker value={pick === 'from' ? from : to} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={(_e, d) => { setPick(null); if (d) { pick === 'from' ? setFrom(d) : setTo(d); } }} />
            )}

            <Text style={{ fontSize: 11, fontWeight: '800', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>Mise en page</Text>
            <TouchableOpacity onPress={() => go('liste')} activeOpacity={0.85} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: C.line, borderRadius: 14, padding: 14, marginBottom: 10 }}>
              <Ionicons name="list-outline" size={22} color={C.petrol} />
              <View style={{ flex: 1 }}><Text style={{ fontWeight: '800', color: C.text, fontSize: 14.5 }}>Liste par mois</Text><Text style={{ fontSize: 12, color: C.muted }}>Tableau : date, production, heures, brut + totaux</Text></View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => go('calendrier')} activeOpacity={0.85} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: C.line, borderRadius: 14, padding: 14 }}>
              <Ionicons name="calendar-outline" size={22} color={C.petrol} />
              <View style={{ flex: 1 }}><Text style={{ fontWeight: '800', color: C.text, fontSize: 14.5 }}>Calendrier</Text><Text style={{ fontSize: 12, color: C.muted }}>Grille mensuelle, missions colorées par jour</Text></View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShow(false)} style={{ paddingVertical: 12, marginTop: 8 }}><Text style={{ textAlign: 'center', color: C.muted, fontWeight: '700' }}>Annuler</Text></TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}
