import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/theme';
import { usePremium, isLocked } from '../lib/premium';

const FEATURES: { icon: keyof typeof Ionicons.glyphMap; t: string }[] = [
  { icon: 'trending-up-outline', t: 'Simulateur ARE, carences & franchises' },
  { icon: 'document-text-outline', t: 'Documents (AEM, fiches de paie…)' },
  { icon: 'calculator-outline', t: "Fiscalité & estimation d'impôt" },
  { icon: 'cash-outline', t: 'Auto-entrepreneur (devis & factures)' },
  { icon: 'call-outline', t: 'Contacts & carnet' },
  { icon: 'color-palette-outline', t: 'Tous les thèmes & widgets' },
];

// Enveloppe un onglet Premium : si le niveau est "gratuit", on montre le contenu
// en APERÇU (voile translucide) + un encart pour passer en Premium. Sinon, passe-plat.
export default function PremiumGate({ children, title }: { children: React.ReactNode; title?: string }) {
  const C: any = useTheme();
  const { effectiveTier } = usePremium();
  const [show, setShow] = useState(false);
  const ink = C.text || C.ink || '#17262E';

  if (!isLocked(effectiveTier)) return <>{children}</>;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }} pointerEvents="none">{children}</View>

      {/* Voile : on devine le contenu derrière (aperçu) */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(238,241,241,0.80)' }]} pointerEvents="none" />

      {/* Encart Premium au centre */}
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', padding: 24 }]} pointerEvents="box-none">
        <View style={{ backgroundColor: C.card, borderRadius: 20, padding: 22, width: '100%', maxWidth: 360, borderWidth: 1, borderColor: C.line, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 6 }}>
          <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(249,115,22,0.14)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <Ionicons name="lock-closed" size={24} color={C.orange} />
          </View>
          <Text style={{ fontSize: 19, fontWeight: '900', color: C.petrol, textAlign: 'center' }}>{title || 'Fonctionnalité Premium'}</Text>
          <Text style={{ fontSize: 13.5, color: C.muted, textAlign: 'center', marginTop: 6, lineHeight: 19 }}>Passe en Premium pour débloquer cet onglet et tout le reste d'Intermitrack.</Text>
          <TouchableOpacity onPress={() => setShow(true)} style={{ backgroundColor: C.orange, borderRadius: 14, paddingVertical: 14, marginTop: 16, width: '100%' }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15, textAlign: 'center' }}>Découvrir Premium</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Fenêtre détaillée */}
      <Modal visible={show} animationType="slide" transparent onRequestClose={() => setShow(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,42,51,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, maxHeight: '88%' }}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: C.line, marginBottom: 14 }} />
              <Text style={{ fontSize: 23, fontWeight: '900', color: C.petrol, textAlign: 'center' }}>Débloque tout Intermitrack</Text>
              <Text style={{ fontSize: 14, color: C.muted, textAlign: 'center', marginTop: 6, lineHeight: 20 }}>La version Gratuit te donne le tableau de bord, les missions et le calendrier. Premium débloque tout le reste.</Text>
              <View style={{ marginTop: 18, gap: 11 }}>
                {FEATURES.map((f, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(31,78,95,0.07)', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={f.icon} size={18} color={C.petrol} />
                    </View>
                    <Text style={{ fontSize: 14.5, color: ink, flex: 1 }}>{f.t}</Text>
                  </View>
                ))}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 6, marginTop: 20 }}>
                <Text style={{ fontSize: 34, fontWeight: '900', color: C.petrol }}>1,99 €</Text>
                <Text style={{ fontSize: 14, color: C.muted, fontWeight: '700' }}>/ mois</Text>
              </View>
              <Text style={{ fontSize: 12, color: '#B45309', textAlign: 'center', fontWeight: '700', backgroundColor: 'rgba(249,115,22,0.1)', borderRadius: 10, padding: 9, marginTop: 10, lineHeight: 17 }}>Offre de lancement — ce prix augmentera bientôt. Abonne-toi tôt, tu gardes 1,99 € à vie.</Text>
              <TouchableOpacity onPress={() => {}} style={{ backgroundColor: C.orange, borderRadius: 14, paddingVertical: 15, marginTop: 16 }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15, textAlign: 'center' }}>Passer en Premium</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 11.5, color: C.muted, textAlign: 'center', marginTop: 10, lineHeight: 16 }}>Le paiement arrive très bientôt. Merci de ta patience </Text>
              <TouchableOpacity onPress={() => setShow(false)} style={{ paddingVertical: 12, marginTop: 4 }}>
                <Text style={{ color: C.muted, fontWeight: '700', fontSize: 13, textAlign: 'center' }}>Plus tard</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
