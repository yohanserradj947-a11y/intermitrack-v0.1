import { useMemo, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, FlatList, ActivityIndicator,
  StyleSheet, Platform, Linking, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/theme';
import { supabase } from '../lib/supabase';
import { GradientButton } from './GradientButton';
// Le clavier numérique iOS n'a pas de touche « entrée » : sans la barre « OK »
// de ces composants, on ne peut plus le refermer. Règle valable partout dans l'app.
import NumInput from './NumInput';
import TxtInput from './TxtInput';
import { scanCalendar, parseNotesText, MissionDraft } from '../lib/calendarImport';
import { useAnnexe, modeForNew, CACHET_H } from '../lib/annexe';
import {
  pickAndReadExcel, autoDetect, countValid, buildDrafts,
  Workbook, ColMap, ColKey,
} from '../lib/excelImport';
import { trackEvent } from '../lib/analytics';

type Phase = 'intro' | 'loading' | 'mapping' | 'preview' | 'importing' | 'done' | 'denied' | 'empty';
type Mode = 'calendar' | 'excel' | 'notes';

// Les 4 informations qu'on cherche dans le fichier. La date est la seule
// indispensable : sans elle il n'y a pas de mission.
const FIELDS: { key: ColKey; label: string; required?: boolean }[] = [
  { key: 'date',  label: 'Date',       required: true },
  { key: 'prod',  label: 'Production' },
  { key: 'hours', label: 'Heures' },
  { key: 'price', label: 'Montant brut' },
];

function fmtShort(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}`;
}

export default function CalendarImportModal({
  visible, onClose, onImported, mode = 'calendar', avgDaily = 0,
}: { visible: boolean; onClose: () => void; onImported?: () => void; mode?: Mode; avgDaily?: number }) {
  const C = useTheme();
  // Un artiste ne compte pas en heures mais en cachets : sans info, son repli
  // est UN CACHET (12 h), pas une journée de technicien (8 h). On réutilise
  // modeForNew() plutôt que de réinventer la règle ici.
  const annexe = useAnnexe();
  const cachetMode = modeForNew(annexe) === 'cachet';
  const defH = cachetMode ? CACHET_H : 8;
  const [phase, setPhase] = useState<Phase>('intro');
  const [drafts, setDrafts] = useState<MissionDraft[]>([]);
  const [error, setError] = useState('');
  const [importedCount, setImportedCount] = useState(0);
  const [openKey, setOpenKey] = useState<string | null>(null);
  // Mode « coller mes notes » : le texte collé + l'année à confirmer (jamais écrite dans les notes).
  const [notesText, setNotesText] = useState('');
  const [notesYear, setNotesYear] = useState(new Date().getFullYear());
  // Prix des notes sans montant : pré-rempli avec le TARIF JOURNALIER MOYEN calculé sur les
  // missions déjà saisies (avgDaily), passé par le calendrier. PAS le taux journalier du profil,
  // qui est l'allocation Pôle Emploi (retour Yohan), rien à voir avec un salaire de mission.
  const dailyRate = avgDaily;
  // Étape « correspondance des colonnes » (Excel uniquement).
  const [wb, setWb] = useState<Workbook | null>(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [cols, setCols] = useState<ColMap | null>(null);
  const [pickField, setPickField] = useState<ColKey | null>(null);

  function reset() {
    setPhase('intro'); setDrafts([]); setError(''); setImportedCount(0); setOpenKey(null);
    setWb(null); setSheetIdx(0); setCols(null); setPickField(null);
    setNotesText(''); setNotesYear(new Date().getFullYear());
  }
  function close() { reset(); onClose(); }

  // On évite les doublons : on retire ce qui existe déjà (même date + même prod).
  async function toPreview(found: MissionDraft[], source: string) {
    const existing = new Set<string>();
    try {
      const { data } = await supabase.from('missions').select('mission_date,production');
      (data || []).forEach((m: any) => existing.add(`${m.mission_date}|${(m.production || '').toUpperCase()}`));
    } catch (e) {}
    const fresh = found.filter((d) => !existing.has(`${d.mission_date}|${d.production}`));
    trackEvent('import_parsed', { mode, source, lues: found.length, nouvelles: fresh.length });
    if (!fresh.length) { setPhase('empty'); return; }
    setDrafts(fresh); setPhase('preview');
  }

  async function analyze() {
    setError(''); setPhase('loading');
    trackEvent('import_start', { mode });
    try {
      if (mode === 'excel') {
        // On LIT le fichier, on ne l'interprète pas encore : l'utilisateur
        // valide la correspondance des colonnes avant qu'on crée quoi que ce soit.
        const { status, wb: book } = await pickAndReadExcel();
        if (status === 'canceled') { trackEvent('import_canceled', { mode }); setPhase('intro'); return; }
        if (status !== 'ok' || !book) {
          trackEvent('import_failed', { mode, raison: status });
          setError(status === 'unreadable'
            ? "Ce fichier n'a pas pu être ouvert. Enregistre-le au format .xlsx ou .csv, puis réessaie."
            : 'Ce fichier ne contient aucune donnée.');
          setPhase('intro'); return;
        }
        const first = book.sheets[0];
        const detected = autoDetect(first);
        setWb(book); setSheetIdx(0); setCols(detected);
        trackEvent('import_read', {
          mode, onglets: book.sheets.length, colonnes: first.columns.length,
          detectees: FIELDS.filter((f) => detected[f.key] >= 0).map((f) => f.key),
          lignes_datees: countValid(first, detected),
        });
        setPhase('mapping');
        return;
      }
      if (mode === 'notes') {
        const { drafts: found, skipped } = parseNotesText(notesText, notesYear, defH, dailyRate);
        trackEvent('import_read', { mode, annee: notesYear, lues: found.length, ignorees: skipped.length });
        if (!found.length) {
          trackEvent('import_failed', { mode, raison: 'aucune_ligne' });
          const ex = skipped.slice(0, 4).map((l) => `•  ${l}`).join('\n');
          setError("Je n'ai reconnu aucune mission." + (ex
            ? `\n\nCes lignes m'ont bloqué :\n${ex}${skipped.length > 4 ? `\n(+${skipped.length - 4} autres)` : ''}\n\nChaque ligne a besoin d'un JOUR et d'un MOIS : soit « 18/03 prod 8h 230 », soit un en-tête « MARS » au-dessus puis « 18 prod 8h 230 ».`
            : "\n\nColle des lignes avec un jour et un mois (ex : « MARS » puis « 18 prod 8h 230 »)."));
          setPhase('intro'); return;
        }
        await toPreview(found, 'notes');
        return;
      }
      const { status, drafts: found } = await scanCalendar(12, 12, defH);
      if (status !== 'granted') { trackEvent('import_failed', { mode, raison: 'permission' }); setPhase('denied'); return; }
      await toPreview(found, 'calendrier');
    } catch (e: any) {
      trackEvent('import_failed', { mode, raison: 'exception', message: String(e?.message || e).slice(0, 120) });
      setError(e?.message || 'Lecture impossible.'); setPhase('intro');
    }
  }

  // La correspondance est validée : c'est seulement maintenant qu'on construit.
  async function confirmMapping() {
    if (!wb || !cols) return;
    const sheet = wb.sheets[sheetIdx];
    trackEvent('import_mapping_ok', {
      mode,
      corrigee: JSON.stringify(cols) !== JSON.stringify(autoDetect(sheet)),
      lignes_datees: countValid(sheet, cols),
    });
    setPhase('loading');
    await toPreview(buildDrafts(sheet, cols, sheetIdx, defH), 'excel');
  }

  function setCol(field: ColKey, index: number) {
    setCols((prev) => (prev ? { ...prev, [field]: index } : prev));
    setPickField(null);
  }
  function selectSheet(i: number) {
    if (!wb) return;
    setSheetIdx(i);
    setCols(autoDetect(wb.sheets[i]));
  }

  function toggle(key: string) {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, selected: !d.selected } : d)));
  }
  function toggleAll() {
    const anyOff = drafts.some((d) => !d.selected);
    setDrafts((prev) => prev.map((d) => ({ ...d, selected: anyOff })));
  }
  // Édition sur place d'une info manquante : met à jour la valeur ET retire/ajoute le drapeau "manquant".
  function editField(key: string, field: 'prod' | 'hours' | 'prix', raw: string) {
    setDrafts((prev) => prev.map((d) => {
      if (d.key !== key) return d;
      const nd: any = { ...d, missing: [...(d.missing || [])] };
      const rm = (f: string) => { nd.missing = nd.missing.filter((x: string) => x !== f); };
      const add = (f: string) => { if (!nd.missing.includes(f)) nd.missing.push(f); };
      if (field === 'prod') { nd.production = raw.toUpperCase(); nd.production.trim() ? rm('prod') : add('prod'); }
      if (field === 'hours') { const v = Number(String(raw).replace(',', '.')) || 0; nd.hours = v; v > 0 ? rm('heures') : add('heures'); }
      if (field === 'prix') { const v = Number(String(raw).replace(/\s/g, '').replace(',', '.')) || 0; nd.gross_amount = v; v > 0 ? rm('prix') : add('prix'); }
      return nd;
    }));
  }
  const selected = drafts.filter((d) => d.selected);
  // Les heures ne comptent pas comme « incomplet » : elles valent 8 par défaut.
  const incompleteCount = drafts.filter((d) => d.selected && (d.missing || []).some((m) => m !== 'heures')).length;
  const guessedCount = drafts.filter((d) => d.selected && (d.missing || []).includes('heures')).length;
  // Compteur vivant de l'écran de correspondance : il parcourt le fichier,
  // d'où le useMemo (un gros classeur ne doit pas être relu à chaque frame).
  const sheet = wb ? wb.sheets[sheetIdx] : null;
  const validCount = useMemo(() => (sheet && cols ? countValid(sheet, cols) : 0), [sheet, cols]);

  async function doImport() {
    if (!selected.length) return;
    setPhase('importing');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Session expirée, reconnecte-toi.');
      const payloads = selected.map((d) => ({
        user_id: user.id, production: d.production, emission: null, lieu: d.lieu,
        mission_type: 'Tournage', mission_date: d.mission_date, end_date: d.end_date,
        // Un cachet vaut 12 h : diviser par 8 pour un artiste comptait ses vacations en trop.
        hours: d.hours, vacations: Math.max(1, Math.round(d.hours / (cachetMode ? CACHET_H : 8))),
        gross_amount: d.gross_amount, status: 'effectue',
        km_distance: 0, km_rate: 0, km_amount: 0,
      }));
      for (let i = 0; i < payloads.length; i += 100) {
        const { error: err } = await supabase.from('missions').insert(payloads.slice(i, i + 100));
        if (err) throw err;
      }
      trackEvent('import_done', { mode, count: selected.length, incomplets: incompleteCount });
      setImportedCount(selected.length); setPhase('done');
      onImported && onImported();
    } catch (e: any) {
      trackEvent('import_failed', { mode, raison: 'insert', message: String(e?.message || e).slice(0, 120) });
      setError(e?.message || 'Import échoué, réessaie.'); setPhase('preview');
    }
  }

  const s = styles(C);

  function renderRow({ item }: { item: MissionDraft }) {
    // « Manquant » recouvre deux situations très différentes, et les confondre
    // rend le message incompréhensible : la prod et le prix sont VIDES (à
    // compléter), tandis que les heures sont pré-remplies à 8 (à vérifier).
    // Dire « à compléter » sur un champ qui contient déjà 8 invite à effacer
    // le 8 pour retaper 8.
    const miss = item.missing || [];
    // Un champ « manquant » qui a été PRÉ-REMPLI (heures par défaut, prix depuis le salaire
    // journalier) est « à vérifier » (gris) ; s'il est resté VIDE, il est « à compléter » (orange).
    const hoursGuessed = miss.includes('heures');
    const priceGuessed = miss.includes('prix') && item.gross_amount > 0;
    const toFill = miss.filter((m) => m === 'prod' || (m === 'prix' && !priceGuessed));
    const incomplete = toFill.length > 0;
    const open = openKey === item.key;
    return (
      <View style={[s.rowWrap, incomplete && s.rowWrapWarn]}>
        <View style={s.row}>
          <TouchableOpacity onPress={() => toggle(item.key)} style={[s.check, item.selected && s.checkOn]} activeOpacity={0.7}>
            {item.selected && <Text style={s.checkMark}>✓</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={{ flex: 1, minWidth: 0 }} activeOpacity={0.7} onPress={() => setOpenKey(open ? null : item.key)}>
            <Text style={s.rowProd} numberOfLines={1}>{item.production || item.title || 'Sans nom'}</Text>
            <Text style={s.rowMeta} numberOfLines={1}>
              {fmtShort(item.mission_date)}{item.end_date ? ` → ${fmtShort(item.end_date)}` : ''}
              {`  ·  ${item.hours} h`}{hoursGuessed ? ' (par défaut)' : ''}
              {item.gross_amount ? `  ·  ${item.gross_amount} €` : ''}
              {item.lieu ? `  ·  ${item.lieu}` : ''}
            </Text>
            {incomplete && <Text style={s.warnChip}>⚠ À compléter : {toFill.join(' · ')}</Text>}
            {(hoursGuessed || priceGuessed) && <Text style={s.guessChip}>
              {[
                hoursGuessed ? (cachetMode ? '1 cachet par défaut' : `${defH} h par défaut`) : null,
                priceGuessed ? `${item.gross_amount} € (ton tarif journalier)` : null,
              ].filter(Boolean).join(' · ')} — à vérifier
            </Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setOpenKey(open ? null : item.key)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={s.editLink}>{open ? 'Fermer' : 'Modifier'}</Text>
          </TouchableOpacity>
        </View>
        {open && (
          <View style={s.editor}>
            <View style={s.editField}>
              <Text style={s.editLbl}>Prod</Text>
              <TxtInput style={s.editInput} defaultValue={item.production} onChangeText={(t: string) => editField(item.key, 'prod', t)} autoCapitalize="characters" placeholder="Nom de la prod" placeholderTextColor={C.muted} />
            </View>
            <View style={s.editRow}>
              <View style={[s.editField, { flex: 1 }]}>
                <Text style={s.editLbl}>{hoursGuessed ? `Heures (${defH} par défaut)` : 'Heures'}</Text>
                <NumInput style={s.editInput} defaultValue={item.hours ? String(item.hours) : ''} onChangeText={(t: string) => editField(item.key, 'hours', t)} placeholder="8" placeholderTextColor={C.muted} />
              </View>
              <View style={[s.editField, { flex: 1 }]}>
                <Text style={s.editLbl}>Prix (€)</Text>
                <NumInput style={s.editInput} defaultValue={item.gross_amount ? String(item.gross_amount) : ''} onChangeText={(t: string) => editField(item.key, 'prix', t)} placeholder="350" placeholderTextColor={C.muted} />
              </View>
            </View>
          </View>
        )}
      </View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={s.head}>
            <Text style={s.title}>{mode === 'excel' ? 'Importer depuis un Excel' : mode === 'notes' ? 'Coller mes notes' : 'Importer depuis mon calendrier'}</Text>
            <TouchableOpacity onPress={close} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={s.close}>✕</Text>
            </TouchableOpacity>
          </View>

          {phase === 'intro' && mode === 'notes' && (
            <View style={s.pad}>
              <Text style={s.body}>Colle tes notes telles que tu les écris. Un en-tête de mois, puis une ligne par date :</Text>
              <Text style={[s.bodyMuted, { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }]}>MARS{'\n'}18 vdlm 8h 230{'\n'}19 endemol 12h 450</Text>
              <TxtInput
                style={s.notesInput}
                value={notesText}
                onChangeText={setNotesText}
                multiline
                textAlignVertical="top"
                placeholder={'Colle ici…'}
                placeholderTextColor={C.muted}
              />
              <Text style={s.bodyMuted}>
                Ce qui manque sera pré-rempli : les heures ({cachetMode ? '1 cachet de 12 h, car ton profil est artiste' : '8 h, car ton profil est technicien'}){dailyRate > 0 ? `, et ${dailyRate} € pour le prix (ton tarif journalier)` : ''}. Tu vérifies et corriges chaque ligne avant de valider.
              </Text>
              <Text style={s.body}>De quelle année s'agit-il ?</Text>
              <Text style={s.bodyMuted}>Tes notes n'indiquent pas l'année : confirme-la (une ligne qui précise jj/mm/aaaa garde la sienne).</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6, marginBottom: 4 }}>
                <TouchableOpacity onPress={() => setNotesYear((y) => y - 1)} hitSlop={10} style={s.yearArrow}><Text style={s.yearArrowTxt}>‹</Text></TouchableOpacity>
                <Text style={s.yearVal}>{notesYear}</Text>
                <TouchableOpacity onPress={() => setNotesYear((y) => y + 1)} hitSlop={10} style={s.yearArrow}><Text style={s.yearArrowTxt}>›</Text></TouchableOpacity>
              </View>
              {!!error && <Text style={s.err}>{error}</Text>}
              <GradientButton onPress={analyze} label="Analyser mes notes" style={[s.cta, !notesText.trim() && { opacity: 0.4 }]} textStyle={s.ctaTxt} />
            </View>
          )}

          {phase === 'intro' && mode !== 'notes' && (
            <View style={s.pad}>
              <Text style={s.body}>
                {mode === 'excel'
                  ? 'Choisis ton fichier Excel ou CSV : Intermitrack lit les colonnes (Date, Production, Heures, Tarif…) et crée tes missions.'
                  : 'Intermitrack va lire ton calendrier (iPhone/Samsung) et créer tes missions automatiquement — plus besoin de tout saisir à la main.'}
              </Text>
              <Text style={s.bodyMuted}>
                {mode === 'excel'
                  ? "On récupère la prod, les dates, les heures, le prix et le lieu. Tu pourras tout vérifier avant d'importer."
                  : "On récupère la prod, les dates, les heures, le lieu, et le prix s'il est écrit. Tu pourras tout vérifier avant d'importer."}
              </Text>
              {!!error && <Text style={s.err}>{error}</Text>}
              <GradientButton onPress={analyze} label={mode === 'excel' ? 'Choisir mon fichier' : 'Analyser mon calendrier'} style={s.cta} textStyle={s.ctaTxt} />
            </View>
          )}

          {phase === 'loading' && (
            <View style={s.center}>
              <ActivityIndicator color={C.petrol} size="large" />
              <Text style={s.bodyMuted}>{mode === 'excel' ? 'Lecture de ton fichier…' : mode === 'notes' ? 'Lecture de tes notes…' : 'Lecture de ton calendrier…'}</Text>
            </View>
          )}

          {phase === 'mapping' && sheet && cols && (
            <View style={s.pad}>
              {pickField === null ? (
                <>
                  <Text style={s.body}>J'ai lu « {wb!.fileName} ». Vérifie que j'ai bien compris ton tableau :</Text>

                  {wb!.sheets.length > 1 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                      {wb!.sheets.map((sh, i) => (
                        <TouchableOpacity key={sh.name} onPress={() => selectSheet(i)} activeOpacity={0.7}
                          style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1.5,
                                   borderColor: i === sheetIdx ? C.petrol : C.line,
                                   backgroundColor: i === sheetIdx ? C.soft : 'transparent' }}>
                          <Text style={{ fontSize: 12, fontWeight: '800', color: i === sheetIdx ? C.petrol : C.muted }}>{sh.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {FIELDS.map((f) => {
                    const ci = cols[f.key];
                    const col = ci >= 0 ? sheet.columns[ci] : null;
                    return (
                      <TouchableOpacity key={f.key} onPress={() => setPickField(f.key)} activeOpacity={0.7}
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                                 paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.line }}>
                        <Text style={{ fontSize: 13.5, fontWeight: '800', color: C.text }}>{f.label}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 }}>
                          <Text numberOfLines={1} style={{ fontSize: 12.5, fontWeight: '700',
                                color: col ? C.petrol : (f.required ? C.danger : C.muted) }}>
                            {col ? `${col.letter} · ${col.header || col.sample || '—'}` : (f.required ? 'À indiquer' : 'Aucune')}
                          </Text>
                          <Ionicons name="chevron-forward" size={15} color={C.muted} />
                        </View>
                      </TouchableOpacity>
                    );
                  })}

                  <Text style={{ fontSize: 13, fontWeight: '800', marginTop: 14,
                                 color: validCount > 0 ? C.green : C.danger }}>
                    {validCount > 0
                      ? `${validCount} mission${validCount > 1 ? 's' : ''} trouvée${validCount > 1 ? 's' : ''} dans ce tableau.`
                      : "Je ne trouve aucune date. Touche « Date » et montre-moi la bonne colonne."}
                  </Text>

                  {validCount > 0 && (
                    <Text style={s.bodyMuted}>
                      Une info manque ? Tu pourras la compléter à l'écran suivant, ligne par ligne.
                    </Text>
                  )}

                  <GradientButton onPress={confirmMapping} label="Continuer"
                    style={[s.cta, validCount === 0 && { opacity: 0.4 }]} textStyle={s.ctaTxt} />
                  <TouchableOpacity onPress={analyze} style={s.retry}><Text style={s.retryTxt}>Choisir un autre fichier</Text></TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={s.body}>Quelle colonne contient « {FIELDS.find((f) => f.key === pickField)!.label} » ?</Text>
                  <FlatList
                    data={[{ index: -1, letter: '', header: '', sample: '' }, ...sheet.columns]}
                    keyExtractor={(c) => String(c.index)}
                    style={{ maxHeight: 300 }}
                    renderItem={({ item: c }) => (
                      <TouchableOpacity onPress={() => setCol(pickField, c.index)} activeOpacity={0.7}
                        style={{ paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.line }}>
                        {c.index < 0 ? (
                          <Text style={{ fontSize: 13, fontWeight: '800', color: C.muted }}>Cette info n'est pas dans mon fichier</Text>
                        ) : (
                          <>
                            <Text style={{ fontSize: 13, fontWeight: '800', color: C.text }}>
                              Colonne {c.letter}{c.header ? ` · ${c.header}` : ''}
                            </Text>
                            <Text style={{ fontSize: 11.5, color: C.muted, marginTop: 1 }}>
                              {c.sample ? `ex : ${c.sample}` : '(colonne vide)'}
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  />
                  <TouchableOpacity onPress={() => setPickField(null)} style={s.retry}><Text style={s.retryTxt}>Annuler</Text></TouchableOpacity>
                </>
              )}
            </View>
          )}

          {phase === 'denied' && (
            <View style={s.pad}>
              <Text style={s.body}>Intermitrack n'a pas accès à ton calendrier.</Text>
              <Text style={s.bodyMuted}>
                Autorise l'accès dans les réglages de ton téléphone, puis réessaie.
              </Text>
              <GradientButton onPress={() => Linking.openSettings()} label="Ouvrir les réglages" style={s.cta} textStyle={s.ctaTxt} />
              <TouchableOpacity onPress={analyze} style={s.retry}><Text style={s.retryTxt}>Réessayer</Text></TouchableOpacity>
            </View>
          )}

          {phase === 'empty' && (
            <View style={s.pad}>
              <Text style={s.body}>Aucune nouvelle mission à importer.</Text>
              <Text style={s.bodyMuted}>
                {mode === 'excel'
                  ? 'Toutes les missions du fichier sont déjà dans ton compte — aucun doublon n’a été créé.'
                  : "Ton calendrier n'a pas d'événement récent, ou tout est déjà dans Intermitrack."}
              </Text>
              <GradientButton onPress={close} label="Fermer" style={s.cta} textStyle={s.ctaTxt} />
            </View>
          )}

          {phase === 'preview' && (
            <>
              <View style={s.previewHead}>
                <Text style={s.count}>{selected.length} / {drafts.length} sélectionnée{drafts.length > 1 ? 's' : ''}</Text>
                <TouchableOpacity onPress={toggleAll}><Text style={s.selectAll}>{drafts.some((d) => !d.selected) ? 'Tout cocher' : 'Tout décocher'}</Text></TouchableOpacity>
              </View>
              {incompleteCount > 0 && (
                <View style={s.banner}>
                  <Text style={s.bannerTitle}>⚠ {incompleteCount} mission{incompleteCount > 1 ? 's' : ''} à compléter</Text>
                  <Text style={s.bannerTxt}>Il manque la prod ou le prix. Touche « Modifier » pour les renseigner — ou importe maintenant et complète plus tard.</Text>
                </View>
              )}
              {guessedCount > 0 && incompleteCount === 0 && (
                <View style={s.bannerSoft}>
                  <Text style={s.bannerSoftTxt}>
                    {guessedCount} mission{guessedCount > 1 ? 's sont' : ' est'} à {cachetMode ? '1 cachet' : '8 h'} par défaut : je n'ai pas trouvé la durée.
                    {mode === 'calendar' ? ' Note « 12h » ou « 9h-17h » dans le titre de ton événement et je la reprendrai.' : ''}
                  </Text>
                </View>
              )}
              <FlatList
                data={drafts}
                keyExtractor={(d) => d.key}
                renderItem={renderRow}
                style={s.list}
                contentContainerStyle={{ paddingBottom: 8 }}
              />
              {!!error && <Text style={s.err}>{error}</Text>}
              <GradientButton
                onPress={doImport}
                disabled={!selected.length}
                label={selected.length ? `Importer ${selected.length} mission${selected.length > 1 ? 's' : ''}` : 'Sélectionne au moins une mission'}
                style={s.cta} textStyle={s.ctaTxt}
              />
            </>
          )}

          {phase === 'importing' && (
            <View style={s.center}>
              <ActivityIndicator color={C.petrol} size="large" />
              <Text style={s.bodyMuted}>Import en cours…</Text>
            </View>
          )}

          {phase === 'done' && (
            <View style={s.pad}>
              <Text style={s.doneTitle}>✓ {importedCount} mission{importedCount > 1 ? 's' : ''} importée{importedCount > 1 ? 's' : ''} !</Text>
              <Text style={s.bodyMuted}>Tu peux les retrouver et les compléter dans ton calendrier et « Mes missions ».</Text>
              <GradientButton onPress={close} label="Terminé" style={s.cta} textStyle={s.ctaTxt} />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = (C: any) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  card: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%', paddingBottom: Platform.OS === 'ios' ? 28 : 16 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, paddingBottom: 12 },
  title: { fontSize: 17, fontWeight: '800', color: C.petrol, flex: 1 },
  close: { fontSize: 20, color: C.muted, fontWeight: '700', paddingHorizontal: 4 },
  pad: { paddingHorizontal: 18, paddingBottom: 8, gap: 10 },
  body: { fontSize: 14.5, color: C.text, lineHeight: 21 },
  bodyMuted: { fontSize: 13, color: C.muted, lineHeight: 19 },
  err: { fontSize: 13, color: C.danger, fontWeight: '600' },
  notesInput: { borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 12, fontSize: 14, color: C.text, backgroundColor: C.bg, minHeight: 130, maxHeight: 220, marginTop: 4 },
  yearArrow: { width: 40, height: 40, borderRadius: 12, borderWidth: 1.5, borderColor: C.petrol, alignItems: 'center', justifyContent: 'center' },
  yearArrowTxt: { fontSize: 22, fontWeight: '900', color: C.petrol, lineHeight: 24 },
  yearVal: { fontSize: 20, fontWeight: '900', color: C.text, minWidth: 70, textAlign: 'center' },
  center: { paddingVertical: 46, alignItems: 'center', gap: 14 },
  cta: { marginTop: 14, height: 50, borderRadius: 14 },
  ctaTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  retry: { alignItems: 'center', paddingVertical: 12 },
  retryTxt: { color: C.petrol, fontWeight: '700', fontSize: 14 },
  previewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 8 },
  count: { fontSize: 13, fontWeight: '700', color: C.text },
  selectAll: { fontSize: 13, fontWeight: '700', color: C.petrol },
  list: { paddingHorizontal: 12, maxHeight: 420 },
  rowWrap: { borderBottomWidth: 1, borderBottomColor: C.line },
  rowWrapWarn: { backgroundColor: C.warnBg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 6 },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.muted, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: C.petrol, borderColor: C.petrol },
  checkMark: { color: '#fff', fontSize: 13, fontWeight: '900', lineHeight: 16 },
  rowProd: { fontSize: 14.5, fontWeight: '700', color: C.text },
  rowMeta: { fontSize: 12, color: C.muted, marginTop: 2 },
  warnChip: { fontSize: 11, fontWeight: '700', color: C.warnTx, marginTop: 3 },
  // Volontairement discret : une valeur devinée n'est pas une erreur, elle n'a
  // pas à crier aussi fort qu'un champ vide.
  guessChip: { fontSize: 11, fontWeight: '600', color: C.muted, marginTop: 3 },
  editLink: { fontSize: 12, fontWeight: '700', color: C.petrol },
  editor: { paddingHorizontal: 6, paddingBottom: 12, gap: 8 },
  editRow: { flexDirection: 'row', gap: 10 },
  editField: {},
  editLbl: { fontSize: 11, fontWeight: '700', color: C.muted, marginBottom: 3 },
  editInput: { borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 11, fontSize: 14, color: C.text, backgroundColor: C.card },
  banner: { marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: 12, backgroundColor: C.warnBg, borderWidth: 1, borderColor: C.warnBd },
  bannerSoft: { marginHorizontal: 16, marginBottom: 8, padding: 10, borderRadius: 12, backgroundColor: C.soft, borderWidth: 1, borderColor: C.line },
  bannerSoftTxt: { fontSize: 12, color: C.muted, lineHeight: 17 },
  bannerTitle: { fontSize: 13, fontWeight: '800', color: C.warnTx },
  bannerTxt: { fontSize: 12, color: C.warnTx, marginTop: 3, lineHeight: 17 },
  doneTitle: { fontSize: 18, fontWeight: '800', color: C.green },
});
