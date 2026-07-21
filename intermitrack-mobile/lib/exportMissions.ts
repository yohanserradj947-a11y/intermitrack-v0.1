import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

// Bilan de la période affichée (onglet Missions) : totaux + split artiste/technicien + tableau par production.
// Identique au PDF du site (generateMissionsBilanPDF).
export async function exportBilanPdf(b: {
  label: string;
  sorted: { name: string; count: number; hours: number; cachets: number; gross: number }[];
  totalGross: number; totalHours: number; totalVacations: number;
  artH: number; techH: number; artCachets: number;
}) {
  const esc = (v: any) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const money2 = (n: any) => (Math.round(Number(n) || 0)).toLocaleString('fr-FR') + ' €';
  const tot = b.artH + b.techH;
  const splitHtml = tot > 0
    ? `<div class="split"><div class="split-row"><span class="dot" style="background:#F97316"></span>Artiste <b>${Math.round(b.artH / tot * 100)}%</b> · ${b.artH} h · ${b.artCachets} cachet${b.artCachets > 1 ? 's' : ''}</div><div class="split-row"><span class="dot" style="background:#1F4E5F"></span>Technicien <b>${Math.round(b.techH / tot * 100)}%</b> · ${b.techH} h</div></div>`
    : '';
  const rows = b.sorted.map((p) => `<tr><td>${esc(p.name)}</td><td>${p.count}</td><td>${p.hours} h</td><td>${p.cachets > 0 ? Math.round(p.cachets * 10) / 10 : '—'}</td><td>${money2(p.gross)}</td></tr>`).join('');
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"/><title>Bilan ${esc(b.label)}</title><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#2D3748;background:#fff;padding:24px}.header{border-bottom:3px solid #1F4E5F;padding-bottom:14px;margin-bottom:18px}h1{margin:0;color:#1F4E5F;font-size:23px;letter-spacing:-.03em}.subtitle{color:#718096;margin:6px 0 0;font-size:13px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin:18px 0 16px}.summary-box{border:1px solid #E2E8F0;border-radius:12px;padding:11px;background:#F8FAF9}.summary-box strong{display:block;color:#1F4E5F;font-size:19px;line-height:1.1}.summary-box span{display:block;margin-top:4px;color:#718096;font-size:10px;text-transform:uppercase;font-weight:700}.split{display:flex;flex-wrap:wrap;gap:8px 20px;margin:0 0 18px;padding:12px;border:1px solid #E2E8F0;border-radius:12px;background:#F8FAF9;font-size:13px}.split-row{display:flex;align-items:center;gap:8px}.dot{width:11px;height:11px;border-radius:4px;display:inline-block}table{width:100%;border-collapse:collapse;margin-top:6px}th{text-align:left;color:#718096;font-size:11px;text-transform:uppercase;letter-spacing:.03em;padding:9px 7px;border-bottom:2px solid #E2E8F0}td{padding:10px 7px;border-bottom:1px solid #E2E8F0;font-size:13px}tr:nth-child(even) td{background:#FBFCFC}tfoot td{font-weight:800;color:#1F4E5F;border-top:2px solid #1F4E5F;background:#fff!important}.footer{margin-top:22px;padding-top:12px;border-top:1px solid #E2E8F0;font-size:11px;color:#718096;line-height:1.45}</style></head><body><div class="header"><h1>Bilan des missions</h1><p class="subtitle">${esc(b.label)} · Généré avec Intermitrack</p></div><div class="summary"><div class="summary-box"><strong>${b.totalVacations}</strong><span>Vacations</span></div><div class="summary-box"><strong>${b.totalHours} h</strong><span>Heures</span></div><div class="summary-box"><strong>${esc(money2(b.totalGross))}</strong><span>Brut total</span></div><div class="summary-box"><strong>${b.sorted.length}</strong><span>Productions</span></div></div>${splitHtml}${b.sorted.length ? `<table><thead><tr><th>Production</th><th>Missions</th><th>Heures</th><th>Cachets</th><th>Brut</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td>Total</td><td>${b.sorted.reduce((a, p) => a + p.count, 0)}</td><td>${b.totalHours} h</td><td>${Math.round(b.artCachets * 10) / 10}</td><td>${money2(b.totalGross)}</td></tr></tfoot></table>` : '<div class="empty">Aucune mission sur cette période.</div>'}<p class="footer">Bilan personnel destiné à faciliter le suivi de ton activité (heures, cachets, brut par employeur). À vérifier avant toute démarche officielle auprès de France Travail.</p></body></html>`;
  try {
    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
    return { ok: true };
  } catch (e) { return { error: true }; }
}

// Génère un PDF du récap des missions, groupé par mois, en 2 mises en page.
// Retourne { empty } si aucune mission, { error } en cas d'échec, { ok } sinon.
export async function exportMissionsPdf(missions: any[], layout: 'liste' | 'calendrier') {
  const esc = (v: any) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const money = (n: any) => (Math.round(Number(n) || 0)).toLocaleString('fr-FR') + ' €';
  const MN = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  const all = (missions || []).filter((m: any) => m.mission_date).slice().sort((a: any, b: any) => (a.mission_date < b.mission_date ? -1 : 1));
  if (!all.length) return { empty: true };

  const groups: Record<string, any[]> = {};
  for (const m of all) { const k = String(m.mission_date).slice(0, 7); (groups[k] = groups[k] || []).push(m); }
  const keys = Object.keys(groups).sort();
  const PAL = ['#1F4E5F', '#F97316', '#7A9E7E', '#C79A3B', '#8B5CF6', '#DC2626', '#0D9488', '#2563EB'];
  const colorFor = (p: string) => { let h = 0; const s = String(p || ''); for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h); return PAL[Math.abs(h) % PAL.length]; };

  let body = ''; let totMiss = 0, totH = 0, totG = 0;
  if (layout === 'liste') {
    for (const k of keys) {
      const ms = groups[k]; let mH = 0, mG = 0, rows = '';
      for (const m of ms) {
        const h = Number(m.hours) || 0, g = Number(m.gross_amount) || 0; mH += h; mG += g;
        const d = String(m.mission_date).split('-').reverse().join('/');
        const end = m.end_date && m.end_date !== m.mission_date ? (' → ' + String(m.end_date).split('-').reverse().join('/')) : '';
        rows += `<tr><td>${d}${end}</td><td>${esc(m.production || '—')}</td><td class="r">${h ? h + ' h' : ''}</td><td class="r">${g ? money(g) : ''}</td></tr>`;
      }
      totMiss += ms.length; totH += mH; totG += mG;
      const [y, mo] = k.split('-');
      body += `<div class="month"><h2>${MN[+mo - 1]} ${y}</h2><table><thead><tr><th>Date</th><th>Production</th><th class="r">Heures</th><th class="r">Brut</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="2">Total : ${ms.length} mission${ms.length > 1 ? 's' : ''}</td><td class="r">${mH} h</td><td class="r">${money(mG)}</td></tr></tfoot></table></div>`;
    }
  } else {
    for (const k of keys) {
      const [y, mo] = k.split('-').map(Number);
      const startWd = (new Date(y, mo - 1, 1).getDay() + 6) % 7;
      const dim = new Date(y, mo, 0).getDate();
      const byDay: Record<number, any[]> = {}; let mH = 0, mG = 0;
      for (const m of groups[k]) { const dd = Number(String(m.mission_date).split('-')[2]); (byDay[dd] = byDay[dd] || []).push(m); mH += Number(m.hours) || 0; mG += Number(m.gross_amount) || 0; }
      totMiss += groups[k].length; totH += mH; totG += mG;
      let cells = ''; for (let i = 0; i < startWd; i++) cells += '<td class="empty"></td>';
      for (let d = 1; d <= dim; d++) {
        const ms = byDay[d] || []; let inner = '';
        for (const m of ms) inner += `<div class="ev" style="background:${colorFor(m.production)}">${esc(String(m.production || '').slice(0, 11))}${m.hours ? ' · ' + Number(m.hours) + 'h' : ''}</div>`;
        cells += `<td><div class="dn">${d}</div>${inner}</td>`; if ((startWd + d) % 7 === 0) cells += '</tr><tr>';
      }
      body += `<div class="month"><h2>${MN[mo - 1]} ${y} <span class="sub">${groups[k].length} mission(s) · ${mH} h · ${money(mG)}</span></h2><table class="cal"><thead><tr><th>Lun</th><th>Mar</th><th>Mer</th><th>Jeu</th><th>Ven</th><th>Sam</th><th>Dim</th></tr></thead><tbody><tr>${cells}</tr></tbody></table></div>`;
    }
  }
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box;margin:0;padding:0;} body{font-family:Arial,Helvetica,sans-serif;color:#17262E;font-size:12px;padding:22px;}
    .hd{background:#1F4E5F;color:#fff;padding:16px 20px;border-radius:12px;margin-bottom:18px;} .hd h1{font-size:20px;} .hd p{font-size:12px;opacity:.9;margin-top:3px;}
    .month{margin-bottom:20px;} .month h2{font-size:14px;color:#1F4E5F;border-bottom:2px solid #E7E3DA;padding-bottom:5px;margin-bottom:8px;} .month h2 .sub{font-size:11px;color:#5E7078;font-weight:normal;}
    table{width:100%;border-collapse:collapse;} th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #eee;font-size:11.5px;} th{background:#F7F5F0;color:#5E7078;text-transform:uppercase;font-size:10px;} td.r,th.r{text-align:right;} tfoot td{font-weight:bold;color:#1F4E5F;border-top:2px solid #E7E3DA;background:#FAFAF8;}
    table.cal td{vertical-align:top;height:62px;width:14.28%;border:1px solid #E7E3DA;} table.cal td.empty{background:#FAFAF8;} .dn{font-weight:bold;color:#1F4E5F;font-size:11px;} .ev{color:#fff;font-size:8px;font-weight:bold;border-radius:4px;padding:2px 4px;margin-top:2px;}
    .foot{margin-top:16px;padding-top:12px;border-top:2px solid #1F4E5F;font-weight:bold;color:#1F4E5F;font-size:13px;} .gen{margin-top:14px;text-align:center;color:#94A3B8;font-size:10px;}
  </style></head><body>
    <div class="hd"><h1>Mon année d'intermittence</h1><p>Récapitulatif de mes missions · Intermitrack</p></div>
    ${body}
    <div class="foot">TOTAL : ${totMiss} mission${totMiss > 1 ? 's' : ''} · ${totH} h · ${money(totG)}</div>
    <div class="gen">Généré avec Intermitrack · intermitrack.fr</div>
  </body></html>`;
  try {
    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
    return { ok: true };
  } catch (e) { return { error: true }; }
}
