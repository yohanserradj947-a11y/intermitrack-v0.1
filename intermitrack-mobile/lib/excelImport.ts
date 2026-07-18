import * as DocumentPicker from 'expo-document-picker';
import * as XLSX from 'xlsx';
import { MissionDraft } from './calendarImport';

const MONTHS: Record<string, number> = {
  janvier: 1, fevrier: 2, 'février': 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, aout: 8, 'août': 8, septembre: 9, octobre: 10, novembre: 11,
  decembre: 12, 'décembre': 12,
};

// Parse une date FR en toutes lettres : "vendredi 3 janvier 2025" → "2025-01-03".
function parseFrDate(s: string): string | null {
  const m = s.toLowerCase().match(/(\d{1,2})\s+([a-zûéèàôç]+)\s+(\d{4})/i);
  if (m && MONTHS[m[2]]) {
    return `${m[3]}-${String(MONTHS[m[2]]).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`;
  }
  return null;
}

// Convertit une cellule (Date, numéro de série Excel, ou texte) en 'YYYY-MM-DD'.
export function ymdFromAny(v: any): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  if (typeof v === 'number') {
    // Numéro de série Excel (époque 1899-12-30).
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    return null;
  }
  const s = String(v).trim();
  const fr = parseFrDate(s);
  if (fr) return fr;
  const dm = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (dm) { let y = dm[3]; if (y.length === 2) y = '20' + y; return `${y}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`; }
  return null;
}

// Extrait un nombre d'une cellule ("230,00 €", "8h", 230, "25.000,00", "1 250,50"…).
// Gère virgule OU point comme décimale, et les séparateurs de milliers, pour ne plus
// transformer « 250,00 » en 25000 (retour Tuu Coo).
function num(v: any): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  let s = String(v).replace(/[^\d,.\-]/g, '').replace(/\s/g, '');
  if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) {
    // Les deux présents : le DERNIER est le séparateur décimal (« 1.250,50 » ou « 1,250.50 »).
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (s.indexOf(',') >= 0) {
    // Virgule seule : décimale si 1–2 chiffres en fin (« 250,00 »), sinon milliers (« 25,000 »).
    s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  }
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Un import ne devine pas en silence : il montre ce qu'il a compris et laisse
// corriger. Le fichier est donc LU d'abord (readWorkbook), la correspondance
// des colonnes est PROPOSÉE (autoDetect), puis l'utilisateur tranche avant
// qu'on ne construise la moindre mission (buildDrafts).
// ---------------------------------------------------------------------------

export type ColKey = 'date' | 'prod' | 'hours' | 'price' | 'lieu';
export type ColMap = Record<ColKey, number>; // -1 = colonne non associée

export type Column = {
  index: number;
  header: string;   // en-tête si le fichier en a un, sinon ''
  letter: string;   // A, B, C… : indispensable quand il n'y a pas d'en-tête
  sample: string;   // 1re valeur non vide, pour que l'utilisateur reconnaisse SA colonne
};

export type Sheet = {
  name: string;
  headerIdx: number;
  columns: Column[];
  rows: any[][];
};

export type Workbook = { fileName: string; sheets: Sheet[] };

function letterOf(i: number): string {
  let s = '';
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s;
  return s;
}

// Repère l'index des colonnes à partir des titres (tolérant aux variantes).
export function autoDetect(sheet: Sheet): ColMap {
  const H = sheet.columns.map((c) => c.header.toLowerCase().trim());
  const find = (rx: RegExp) => H.findIndex((h) => rx.test(h));
  const map: ColMap = {
    date: find(/date|jour/),
    prod: find(/prod|production|soci[ée]t[ée]|client|[ée]mission|nom|projet/),
    hours: find(/heure|hours|dur[ée]e|\bh\b/),
    price: find(/prix|tarif|montant|brut|cachet|salaire|€|euro/),
    lieu: find(/lieu|adresse|ville|salle|site/),
  };
  // Pas d'en-tête exploitable pour la date ? On la cherche dans les valeurs :
  // la colonne qui contient le plus de dates lisibles gagne.
  if (map.date < 0) {
    let best = -1, bestN = 0;
    for (const c of sheet.columns) {
      let n = 0;
      for (let i = sheet.headerIdx + 1; i < Math.min(sheet.rows.length, sheet.headerIdx + 40); i++) {
        if (ymdFromAny((sheet.rows[i] || [])[c.index])) n++;
      }
      if (n > bestN) { bestN = n; best = c.index; }
    }
    if (bestN >= 2) map.date = best;
  }
  return map;
}

// Combien de lignes deviendraient des missions avec cette correspondance ?
// Sert à afficher un compteur vivant pendant que l'utilisateur corrige.
export function countValid(sheet: Sheet, cols: ColMap): number {
  if (cols.date < 0) return 0;
  let n = 0;
  for (let i = sheet.headerIdx + 1; i < sheet.rows.length; i++) {
    if (ymdFromAny((sheet.rows[i] || [])[cols.date])) n++;
  }
  return n;
}

// Construit les missions à partir d'une correspondance EXPLICITE.
// defaultHours : repli quand la colonne Heures est absente ou vide. 8 h pour un
// technicien, 12 h (un cachet) pour un artiste — l'appelant tranche.
export function buildDrafts(sheet: Sheet, cols: ColMap, sheetIdx = 0, defaultHours = 8): MissionDraft[] {
  const drafts: MissionDraft[] = [];
  if (cols.date < 0) return drafts;

  for (let i = sheet.headerIdx + 1; i < sheet.rows.length; i++) {
    const row = sheet.rows[i] || [];
    const dateISO = ymdFromAny(row[cols.date]);
    if (!dateISO) continue; // lignes de mois (JANVIER…), lignes vides → ignorées

    const prod = cols.prod >= 0 ? String(row[cols.prod] || '').trim() : '';
    const hours = cols.hours >= 0 ? num(row[cols.hours]) : 0;
    const price = cols.price >= 0 ? num(row[cols.price]) : 0;
    const lieu = cols.lieu >= 0 ? String(row[cols.lieu] || '').trim() : '';

    const missing: string[] = [];
    if (!prod) missing.push('prod');
    if (!(hours > 0)) missing.push('heures');
    if (!(price > 0)) missing.push('prix');

    drafts.push({
      key: `xls-${sheetIdx}-${i}-${dateISO}-${prod}`,
      selected: true,
      production: prod.toUpperCase(),
      mission_date: dateISO,
      end_date: null,
      hours: hours > 0 ? hours : defaultHours,
      gross_amount: price,
      lieu: lieu || null,
      title: prod,
      missing,
    });
  }
  drafts.sort((a, b) => a.mission_date.localeCompare(b.mission_date));
  return drafts;
}

// Ouvre le sélecteur de fichier et LIT le classeur, sans rien interpréter.
export async function pickAndReadExcel(): Promise<{ status: 'canceled' | 'unreadable' | 'empty' | 'ok'; wb?: Workbook }> {
  const res = await DocumentPicker.getDocumentAsync({
    type: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv', 'text/comma-separated-values', 'application/csv', '*/*',
    ],
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets || !res.assets.length) return { status: 'canceled' };

  let book: XLSX.WorkBook;
  try {
    const buf = await (await fetch(res.assets[0].uri)).arrayBuffer();
    // PAS de cellDates : on garde les dates en numéro de série Excel et on les
    // convertit en UTC (ymdFromAny). cellDates créait un objet Date dépendant du
    // fuseau du téléphone → décalage d'un jour selon l'appareil (retour Pauline).
    // raw:true → SheetJS ne « devine » pas les nombres à la lecture (sinon « 250,00 » en CSV
    // devient 25000). On garde le texte brut et c'est num() qui interprète, virgule comprise.
    book = XLSX.read(new Uint8Array(buf), { type: 'array', raw: true });
  } catch (e) {
    return { status: 'unreadable' };
  }

  const sheets: Sheet[] = [];
  book.SheetNames.forEach((name) => {
    const ws = book.Sheets[name];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    if (!rows.length) return;

    // Ligne d'en-tête = la première contenant "date" (sinon la 1re ligne).
    let headerIdx = rows.findIndex((r) => (r || []).some((c) => /date/i.test(String(c || ''))));
    if (headerIdx < 0) headerIdx = 0;

    const width = rows.reduce((w, r) => Math.max(w, (r || []).length), 0);
    const columns: Column[] = [];
    for (let ci = 0; ci < width; ci++) {
      let sample = '';
      for (let ri = headerIdx + 1; ri < Math.min(rows.length, headerIdx + 25); ri++) {
        const v = (rows[ri] || [])[ci];
        if (v !== '' && v != null) {
          // Un numéro de série qui tombe sur une date plausible (2015–2035) est
          // affiché formaté, sinon on montre la valeur brute (heures, montant…).
          const asDate = ymdFromAny(v);
          const plausible = typeof v === 'number' && asDate && Number(asDate.slice(0, 4)) >= 2015 && Number(asDate.slice(0, 4)) <= 2035;
          sample = plausible ? (asDate as string) : (v instanceof Date ? (ymdFromAny(v) || '') : String(v).trim());
          break;
        }
      }
      columns.push({
        index: ci,
        header: String((rows[headerIdx] || [])[ci] || '').trim(),
        letter: letterOf(ci),
        sample: sample.slice(0, 24),
      });
    }
    sheets.push({ name, headerIdx, columns, rows });
  });

  if (!sheets.length) return { status: 'empty' };

  // L'onglet le plus prometteur en premier : un fichier a souvent un "Feuil1"
  // vide devant les vraies données.
  sheets.sort((a, b) => countValid(b, autoDetect(b)) - countValid(a, autoDetect(a)));
  return { status: 'ok', wb: { fileName: res.assets[0].name || 'fichier', sheets } };
}
