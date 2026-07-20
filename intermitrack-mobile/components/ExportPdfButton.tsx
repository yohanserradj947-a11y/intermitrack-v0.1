import { useState } from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/theme';
import { showAlert } from '../lib/dialog';
import { exportMissionsPdf } from '../lib/exportMissions';

// Bouton d'export PDF réutilisable (calendrier + missions). `discreet` = petit lien souligné.
export default function ExportPdfButton({ missions, discreet }: { missions: any[]; discreet?: boolean }) {
  const C: any = useTheme();
  const [show, setShow] = useState(false);
  async function go(layout: 'liste' | 'calendrier') {
    setShow(false);
    const r: any = await exportMissionsPdf(missions, layout);
    if (r?.empty) showAlert('Rien à exporter', 'Aucune mission enregistrée pour le moment.');
    else if (r?.error) showAlert('Erreur', 'Impossible de générer le PDF.');
  }
  return (
    <>
      {discreet ? (
        <TouchableOpacity onPress={() => setShow(true)} hitSlop={8} style={{ paddingVertical: 5, paddingHorizontal: 6 }}>
          <Text style={{ fontSize: 11.5, color: C.muted, textDecorationLine: 'underline' }}>Exporter (PDF)</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={() => setShow(true)} activeOpacity={0.85} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 12, marginHorizontal: 14, marginVertical: 8, borderRadius: 12, borderWidth: 1.5, borderColor: C.petrol, backgroundColor: C.soft }}>
          <Ionicons name="download-outline" size={17} color={C.petrol} />
          <Text style={{ color: C.petrol, fontWeight: '800', fontSize: 12.5 }}>Exporter mon année (PDF)</Text>
        </TouchableOpacity>
      )}
      <Modal visible={show} transparent animationType="fade" onRequestClose={() => setShow(false)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setShow(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.5)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={{ backgroundColor: C.card, borderRadius: 20, padding: 20, width: '100%', maxWidth: 360 }}>
            <Text style={{ fontSize: 18, fontWeight: '900', color: C.petrol, marginBottom: 4 }}>Exporter en PDF</Text>
            <Text style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>Choisis la mise en page de ton récapitulatif.</Text>
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
