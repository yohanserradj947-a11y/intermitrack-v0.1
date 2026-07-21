import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTrackView } from '../../lib/analytics';
import { useTheme } from '../../lib/theme';

// « À savoir » : FAQ pédagogique filtrable par statut (technicien / artiste / les deux).
// Disponible aussi en Gratuit (pas de PremiumGate) — comme voulu. Rien n'est figé, on investigue.

type Statut = 'tous' | 'tech' | 'art';
type Item = { q: string; a: string; s: Statut; tag?: 'tech' | 'art'; src?: { label: string; url: string } };
type Section = { icon: keyof typeof Ionicons.glyphMap; title: string; items: Item[] };

const FT = 'https://www.francetravail.fr/spectacle/';

const SECTIONS: Section[] = [
  { icon: 'flag-outline', title: "Démarrer avec l'appli", items: [
    { s: 'tous', q: 'Comment je rentre mes contrats ?', a: "Va dans l'onglet Calendrier. Le plus rapide : l'import (calendrier du téléphone, fichier Excel, ou tes notes) récupère toutes tes dates d'un coup. Sinon, appuie sur n'importe quelle date, même passée, et remplis à la main. Le reste se calcule tout seul." },
    { s: 'tous', q: 'Mon salaire change à chaque contrat ?', a: "C'est prévu. Le salaire journalier de départ n'est qu'une suggestion ; à chaque mission tu écris le vrai brut de ce contrat. L'appli garde tout en mémoire." },
    { s: 'tous', q: 'Les cases du tableau de bord, comment je les remplis ?', a: "Jamais à la main : elles se calculent seules une fois tes missions rentrées. On part toujours du Calendrier." },
  ] },
  { icon: 'pulse-outline', title: 'Le statut : les 507 heures', items: [
    { s: 'tous', q: "C'est quoi les 507 heures ?", a: "Pour ouvrir tes droits, il faut réunir 507 heures (ou heures assimilées) sur les 12 mois précédant ta dernière fin de contrat. C'est la jauge principale de l'appli.", src: { label: 'France Travail spectacle', url: FT } },
    { s: 'tous', q: "Date d'ouverture ARE vs date anniversaire ?", a: "La date d'ouverture ARE est le départ de tes droits ; la date anniversaire tombe 12 mois après (fin du droit en cours). Elle est « glissante » et peut bouger d'une année sur l'autre selon ta dernière fin de contrat." },
    { s: 'tous', q: 'Annexe 8 ou annexe 10, quel est mon régime ?', a: "Annexe 8 = techniciens. Annexe 10 = artistes. Si tu fais les deux, France Travail retient le régime où tu as le plus d'heures. Règle ton profil dans « Mes infos »." },
  ] },
  { icon: 'time-outline', title: 'Cachets & heures', items: [
    { s: 'art', tag: 'art', q: "1 cachet = combien d'heures ?", a: "Pour France Travail, 1 cachet = 12 h dans les 507 h (demi-cachet = 6 h). Attention : côté Sécu / CPAM, le cachet vaut 16 h — ne confonds pas les deux.", src: { label: 'guide France Travail', url: FT } },
    { s: 'art', tag: 'art', q: "Comment je déclare à l'actualisation ?", a: "Ne reporte pas l'équivalence de tes cachets en heures. Déclare en cachets. « Heures travaillées » = seulement les périodes vraiment payées à l'heure (répétitions…)." },
    { s: 'tous', q: 'Vacation, cachet, jour : comment ça se compte ?', a: "Une vacation = une journée de travail (en général 1 jour = 1 vacation). Pour un artiste, on raisonne en cachets." },
  ] },
  { icon: 'calendar-outline', title: 'France Travail au quotidien', items: [
    { s: 'tous', q: "L'actualisation mensuelle, comment ça marche ?", a: "Chaque mois, tu dois actualiser sur francetravail.fr avant la date de clôture : ça te maintient inscrit, déclare tes reprises d'activité et déclenche ton paiement." },
    { s: 'tous', q: 'Je travaille pendant l\'indemnisation, je perds combien de jours ?', a: "Chaque activité décale des jours non indemnisables : annexe 8, jours travaillés × 1,4 ; annexe 10, jours × 1,3. Et le cumul salaire + ARE ne dépasse pas 118 % du plafond Sécu. L'appli le calcule." },
    { s: 'tous', q: "Je n'atteins pas 507 h à ma date anniversaire ?", a: "Tu peux basculer sur la clause de rattrapage : jusqu'à 6 mois au même taux pour compléter tes heures. Deux conditions : au moins 338 h (entre 338 et 506 h) sur les 12 mois avant la date anniversaire, ET 5 ans d'ancienneté dans les 10 ans précédents (soit 2 535 h = 5 × 507 h, soit 5 ouvertures de droits annexes 8/10).", src: { label: 'guide FT p.20-21', url: FT } },
  ] },
  { icon: 'document-outline', title: 'Impôts', items: [
    { s: 'tous', q: 'Forfait 10 % ou frais réels ?', a: "Tu gardes le plus avantageux. En frais réels, les intermittents peuvent cumuler une déduction 14 % + 5 % avec leurs autres frais (transport, repas, cotisations…), le tout comparé au forfait 10 %. L'appli compare pour toi.", src: { label: 'impots.gouv.fr + doc SNAM', url: 'https://www.impots.gouv.fr' } },
  ] },
  { icon: 'heart-outline', title: 'Congés, maternité, maladie, accident', items: [
    { s: 'tous', q: 'Un arrêt (maternité, adoption, AT) compte dans mes 507 h ?', a: "Les textes officiels (Unédic art. 3, guide FT) prévoient 5 h/jour assimilées pour la maternité, l'adoption et l'accident du travail. Dans l'appli, on ne les décompte pas encore : on les affiche pour que tu les notes, le temps de valider toutes les conditions (indemnisation + contrat après l'arrêt). Rien n'est figé, on continue d'investiguer.", src: { label: 'guide FT p.8-9', url: FT } },
    { s: 'tous', q: 'Congé maternité : qui m\'indemnise ?', a: "Côté CPAM pour les indemnités journalières (conditions en heures/cachets ou cotisations). En cas de refus, l'aide d'urgence Audiens existe (environ 15,50 €/jour, 8 semaines). À vérifier sur ameli et Audiens." },
    { s: 'tous', q: 'Les congés spectacles, ça marche comment ?', a: "Gérés par la Caisse des Congés Spectacles (Audiens), sur un exercice d'avril à mars. Tu les demandes en fin d'exercice." },
  ] },
];

export default function ASavoir() {
  useTrackView('asavoir');
  const C = useTheme();
  const s = useMemo(() => makeS(C), [C]);
  const [statut, setStatut] = useState<Statut>('tous');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const visible = (it: Item) => statut === 'tous' || it.s === 'tous' || it.s === statut;

  const Chip = ({ v, label, art }: { v: Statut; label: string; art?: boolean }) => (
    <TouchableOpacity onPress={() => setStatut(v)}
      style={[s.chip, statut === v && (art ? s.chipArtOn : s.chipOn)]}>
      <Text style={statut === v ? s.chipTxtOn : s.chipTxt}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={s.pageHeader}>
        <Text style={s.pageTitle}>À savoir</Text>
        <Text style={s.pageSub}>Tes droits, tes démarches, ton statut — expliqué simplement</Text>
      </View>

      <View style={s.disc}>
        <Ionicons name="information-circle-outline" size={20} color={C.orange} style={{ marginTop: 1 }} />
        <Text style={s.discTxt}><Text style={{ fontWeight: '800', color: C.text }}>Rien n'est figé.</Text> Ces infos sont indicatives et mises à jour en continu. En cas de doute, ta référence reste France Travail, la CPAM et ton bulletin. Tu constates un écart ? Écris-nous, ça aide à fiabiliser l'appli.</Text>
      </View>

      <View style={s.filter}>
        <Text style={s.filterLab}>JE SUIS</Text>
        <Chip v="tous" label="Les deux" />
        <Chip v="tech" label="Technicien" />
        <Chip v="art" label="Artiste" art />
      </View>

      {SECTIONS.map((sec) => {
        const its = sec.items.filter(visible);
        if (!its.length) return null;
        return (
          <View key={sec.title} style={s.section}>
            <View style={s.secHead}>
              <View style={s.secIc}><Ionicons name={sec.icon} size={17} color={C.petrol} /></View>
              <Text style={s.secTitle}>{sec.title}</Text>
            </View>
            {its.map((it) => {
              const k = it.q;
              const isOpen = !!open[k];
              return (
                <View key={k} style={[s.acc, isOpen && s.accOpen]}>
                  <TouchableOpacity style={s.accHead} onPress={() => toggle(k)} activeOpacity={0.7}>
                    {it.tag ? <View style={[s.miniTag, it.tag === 'art' ? s.miniTagArt : s.miniTagTech]}><Text style={[s.miniTagTxt, it.tag === 'art' && { color: '#fff' }]}>{it.tag === 'art' ? 'Artiste' : 'Tech'}</Text></View> : null}
                    <Text style={s.accQ}>{it.q}</Text>
                    <Ionicons name={isOpen ? 'remove' : 'add'} size={20} color={isOpen ? C.orange : C.muted} />
                  </TouchableOpacity>
                  {isOpen ? (
                    <View style={s.accBody}>
                      <Text style={s.accA}>{it.a}</Text>
                      {it.src ? (
                        <TouchableOpacity style={s.src} onPress={() => Linking.openURL(it.src!.url).catch(() => {})}>
                          <Ionicons name="open-outline" size={13} color={C.petrol} />
                          <Text style={s.srcTxt}>Source : {it.src.label}</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        );
      })}

      <View style={s.more}>
        <Ionicons name="link-outline" size={16} color={C.petrol} />
        <Text style={s.moreTxt}>Besoin des coordonnées (téléphone, adresse, sites) de ces organismes ? Elles sont dans l'onglet « Liens utiles ».</Text>
      </View>
    </ScrollView>
  );
}

const makeS = (C: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  pageHeader: { backgroundColor: C.card, padding: 18, paddingTop: 52, borderBottomWidth: 1, borderBottomColor: C.line },
  pageTitle: { fontSize: 22, fontWeight: '900', color: C.petrol, letterSpacing: -0.5 },
  pageSub: { fontSize: 13, color: C.muted, marginTop: 4 },
  disc: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', margin: 14, marginBottom: 6, padding: 13, borderRadius: 13, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderLeftWidth: 4, borderLeftColor: C.orange },
  discTxt: { flex: 1, fontSize: 12.5, color: C.muted, lineHeight: 18 },
  filter: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8 },
  filterLab: { fontSize: 11, fontWeight: '800', color: C.muted, letterSpacing: 1 },
  chip: { paddingVertical: 8, paddingHorizontal: 15, borderRadius: 99, borderWidth: 1, borderColor: C.line, backgroundColor: C.card },
  chipOn: { backgroundColor: C.petrol, borderColor: C.petrol },
  chipArtOn: { backgroundColor: C.orange, borderColor: C.orange },
  chipTxt: { fontSize: 13.5, fontWeight: '700', color: C.petrol },
  chipTxtOn: { fontSize: 13.5, fontWeight: '700', color: '#fff' },
  section: { paddingHorizontal: 14, marginTop: 16 },
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  secIc: { width: 32, height: 32, borderRadius: 9, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' },
  secTitle: { fontSize: 17, fontWeight: '800', color: C.text, letterSpacing: -0.2, flex: 1 },
  acc: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 12, marginBottom: 8, overflow: 'hidden' },
  accOpen: { borderColor: C.petrol + '66' },
  accHead: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 14 },
  accQ: { flex: 1, fontSize: 14.5, fontWeight: '700', color: C.text },
  accBody: { paddingHorizontal: 14, paddingBottom: 14, marginTop: -2 },
  accA: { fontSize: 13.5, color: C.muted, lineHeight: 20 },
  src: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 10, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: C.line, backgroundColor: C.soft },
  srcTxt: { fontSize: 12, fontWeight: '700', color: C.petrol },
  miniTag: { paddingVertical: 2, paddingHorizontal: 7, borderRadius: 6 },
  miniTagArt: { backgroundColor: C.orange },
  miniTagTech: { backgroundColor: C.soft },
  miniTagTxt: { fontSize: 10, fontWeight: '800', color: C.petrol, textTransform: 'uppercase', letterSpacing: 0.4 },
  more: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', margin: 14, marginTop: 18, padding: 14, borderRadius: 12, backgroundColor: C.soft },
  moreTxt: { flex: 1, fontSize: 13, color: C.text, lineHeight: 19 },
});
