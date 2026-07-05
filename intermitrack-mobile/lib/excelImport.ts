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
function ymdFromAny(v: any): string | null {
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

// Extrait un nombre d'une cellule ("230,00 €", "8h", 230…).
function num(v: any): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/[^\d,.-]/g, '').replace(/\s/g, '').replace(',', '.'));
  return isFinite(n) ? n : 0;
}

// Repère l'index des colonnes à partir des titres (tolérant aux variantes).
function detectCols(header: any[]) {
  const H = header.map((h) => String(h || '').toLowerCase().trim());
  const find = (rx: RegExp) => H.findIndex((h) => rx.test(h));
  return {
    date: find(/date|jour/),
    prod: find(/prod|production|soci[ée]t[ée]|client|[ée]mission|nom|projet/),
    hours: find(/heure|hours|dur[ée]e|\bh\b/),
    price: find(/prix|tarif|montant|brut|cachet|salaire|€|euro/),
    lieu: find(/lieu|adresse|ville|salle|site/),
  };
}

// Ouvre le sélecteur de fichier, lit l'Excel/CSV et le transforme en missions.
export async function pickAndParseExcel(): Promise<{ status: string; drafts: MissionDraft[] }> {
  const res = await DocumentPicker.getDocumentAsync({
    type: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv', 'text/comma-separated-values', 'application/csv', '*/*',
    ],
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets || !res.assets.length) return { status: 'canceled', drafts: [] };

  const buf = await (await fetch(res.assets[0].uri)).arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true });

  const drafts: MissionDraft[] = [];
  // Lit TOUS les onglets : un fichier peut avoir un onglet vide "Feuil1" + les vraies données sur un 2e onglet.
  wb.SheetNames.forEach((name, si) => {
    const ws = wb.Sheets[name];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    if (!rows.length) return;

    // Ligne d'en-tête = la première contenant "date" (sinon la 1re ligne).
    let headerIdx = rows.findIndex((r) => (r || []).some((c) => /date/i.test(String(c || ''))));
    if (headerIdx < 0) headerIdx = 0;
    const cols = detectCols(rows[headerIdx] || []);

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const dateISO = cols.date >= 0 ? ymdFromAny(row[cols.date]) : null;
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
        key: `xls-${si}-${i}-${dateISO}-${prod}`,
        selected: true,
        production: prod.toUpperCase(),
        mission_date: dateISO,
        end_date: null,
        hours: hours > 0 ? hours : 8,
        gross_amount: price,
        lieu: lieu || null,
        title: prod,
        missing,
      });
    }
  });

  if (!drafts.length) return { status: 'empty', drafts: [] };
  drafts.sort((a, b) => a.mission_date.localeCompare(b.mission_date));
  return { status: 'ok', drafts };
}
