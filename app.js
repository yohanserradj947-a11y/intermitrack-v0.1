const SUPABASE_URL = "https://upeogpgczoghlfwblnkb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwZW9ncGdjem9naGxmd2JsbmtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MjkyMDQsImV4cCI6MjA5NjEwNTIwNH0.6535_0KMaEDLxTMhz_OX-4OqC_tpQsPJR5jkFQL7UqI";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let authMode = "login";
let currentUser = null;
let missions = [];
let documents = [];
let documentFilter = "Tous";
let openDocumentProduction = null;
let editingMissionId = null;
let addMissionReturnView = "calendar";
let current = new Date();
let deferredInstallPrompt = null;
let historyPage = 1;
let areAdmissionDate = "";
let aiYearOffset = 0; // navigation dans l'historique des années d'intermittence (0 = année en cours)
let _fiscalYear = new Date().getFullYear(); // année FISCALE affichée (impôts = année civile), navigable
let _missionMode = 'heures';   // 'heures' (technicien) | 'cachet' (artiste) — pour la saisie de mission
const CACHET_H = 12;           // 1 cachet = 12 h pour le comptage des 507 h (cachet isolé ; ajustable via le champ heures)

// Le mode cachet est désormais STOCKÉ (colonne is_cachet) au lieu d'être re-deviné à chaque fois :
// un artiste qui passe une mission en heures ne doit plus être re-classé en cachet (retour Mélio).
// L'heuristique ne sert QUE de repli pour les missions enregistrées avant la colonne.
function missionIsCachet(m) {
  if (!m) return false;
  if (m.is_cachet === true) return true;
  if (m.is_cachet === false) return false;
  const h = Number(m.hours) || 0, v = Number(m.vacations) || 0;
  return v > 0 && h >= v * CACHET_H - 0.6;
}

// ════════════════════════════════════════════════════════════════════════════
// DÉDUCTIONS PROFESSIONNELLES — revenus 2025, déclaration 2026
// Copie conforme de intermitrack-mobile/lib/calcul.ts : ne pas diverger.
// Vérifié sur sources primaires (recherche du 15/07/2026, 18 sources, vote contradictoire).
//
// Forfait 10 % — CGI art. 83, 3°, al. 2 : « limitée à 14 555 € pour l'imposition des rémunérations
// perçues en 2025 » et « ne peut être inférieur à 509 € ». Le plancher est lui-même borné par la
// rémunération (impots.gouv.fr : « au minimum 509 € — sauf si la rémunération déclarée est
// inférieure ») : un salaire de 400 € ouvre 400 € de déduction, pas 509 €.
// ════════════════════════════════════════════════════════════════════════════
const FORFAIT_10_PLANCHER = 509;
const FORFAIT_10_PLAFOND = 14555;
// Le BOFiP (§ 440/460) plafonne l'ASSIETTE du 14 %, pas la déduction : « la partie de la rémunération
// qui n'excède pas le montant de la rémunération CORRESPONDANT AU plafond […] de 10 % » = 145 550 €.
const ASSIETTE_14_MAX = FORFAIT_10_PLAFOND / 0.10;
function _forfait10(net){
  return Math.min(Math.max(Math.min(net * 0.10, FORFAIT_10_PLAFOND), FORFAIT_10_PLANCHER), Math.max(0, net));
}
// 14 % : musiciens (§ 440), chorégraphiques / lyriques / choristes (§ 460).
//  5 % : tous les artistes, chefs d'orchestre et régisseurs (§ 480) — sur-ensemble strict du 14 %.
// « Indépendantes l'une de l'autre » (§ 490) → cumulables (19 %) pour qui a droit aux deux.
function _fraisReelsSpec(net, a14, a5){
  return (a14 ? Math.min(Math.max(0, net), ASSIETTE_14_MAX) * 0.14 : 0) + (a5 ? Math.max(0, net) * 0.05 : 0);
}
// RÉGIME des artistes (source SNAM-CGT / BOFiP BOI-RSA-BASE-30-50-30-30) : les 14 % (A) et 5 % (B)
// sont des FRAIS RÉELS forfaitaires. Dans le régime frais réels, ils s'ADDITIONNENT aux AUTRES frais
// réels du barème (transport C1/C2, repas C3/C4, local C6, cotisations C8, matériel C7, recherche
// d'emploi D…). Total frais réels artiste = 14 % + 5 % + ces autres frais. Ce total est comparé au
// FORFAIT de 10 % (les deux régimes ne se cumulent jamais) → on garde le plus avantageux.
// a14/a5 = le métier a-t-il droit au forfait 14 % / 5 % ?
const PROFILS_FISCAUX_SITE = {
  technicien: { label: "Technicien — forfait 10 % ou frais réels", netCoeff: 0.775, a14: false, a5: false,
    hint: "Forfait de 10 % du net imposable (min 509 €, max 14 555 € en 2025), OU tes frais réels si plus avantageux.",
    forfait: (net) => Math.max(_forfait10(net), _fraisReelsSpec(net, false, false)) },
  musicien: { label: "Musicien / choriste — 14 % + 5 % + frais réels", netCoeff: 0.775, a14: true, a5: true,
    hint: "En frais réels : 14 % (instruments) + 5 % (représentation…) + tes AUTRES frais (transport, repas, local, cotisations…). Comparé au forfait 10 % : on garde le plus avantageux.",
    forfait: (net) => Math.max(_forfait10(net), _fraisReelsSpec(net, true, true)) },
  lyrique: { label: "Artiste lyrique — 14 % + 5 % + frais réels", netCoeff: 0.79, a14: true, a5: true,
    hint: "En frais réels : 14 % (formation, frais médicaux) + 5 % (représentation…) + tes AUTRES frais (transport, repas, local, cotisations…). Comparé au forfait 10 % (BOFiP § 460 et § 480).",
    forfait: (net) => Math.max(_forfait10(net), _fraisReelsSpec(net, true, true)) },
  danseur: { label: "Danseur (chorégraphique) — 14 % + 5 % + frais réels", netCoeff: 0.79, a14: true, a5: true,
    hint: "En frais réels : 14 % (cours de danse, frais médicaux) + 5 % (représentation…) + tes AUTRES frais (transport, repas, local, cotisations…). Comparé au forfait 10 % (BOFiP § 460 et § 480).",
    forfait: (net) => Math.max(_forfait10(net), _fraisReelsSpec(net, true, true)) },
  // Artiste dramatique : 5 % seulement (§ 480), pas de 14 % (pas d'instrument).
  comedien: { label: "Comédien (dramatique) — 5 % + frais réels ou forfait 10 %", netCoeff: 0.79, a14: false, a5: true,
    hint: "En frais réels : 5 % (vestimentaire, représentation…) + tes AUTRES frais (transport, repas, local, cotisations…). Le forfait 10 % s'applique s'il est plus avantageux (BOFiP § 480).",
    forfait: (net) => Math.max(_forfait10(net), _fraisReelsSpec(net, false, true)) }
};
// 'artiste' était l'ancienne clé, étiquetée « Artiste dramatique / lyrique » — deux métiers que le
// BOFiP traite différemment. On la migre vers 'comedien' : c'est le seul choix qui ne change AUCUN
// chiffre pour ceux qui l'avaient sélectionnée (10 % dans les deux cas).
function migrerProfilFiscalSite(v){
  if (v === 'artiste') return 'comedien';
  return PROFILS_FISCAUX_SITE[v] ? v : 'technicien';
}
const HISTORY_PER_PAGE = 6;
let documentsPage = 1;
const DOCS_PER_PAGE_DESKTOP = 9;
const DOCS_PER_PAGE_MOBILE = 5;

const OBJECTIVE_HOURS = 507;

// Icônes SVG fines (remplacent les emoji dans les cartes de mission)
const ICO = {
  cal:  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;opacity:.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  clock:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;opacity:.5"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>',
  euro: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;opacity:.5"><path d="M17 7a6 6 0 1 0 0 10"/><line x1="4" y1="10.5" x2="13" y2="10.5"/><line x1="4" y1="13.5" x2="13" y2="13.5"/></svg>',
  film: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;opacity:.5"><rect x="2" y="2" width="20" height="20" rx="2.5"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>',
  doc:  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;opacity:.5"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>',
  camera:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;opacity:.5"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>',
  pin:  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;opacity:.5"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="2.5"/></svg>'
};
const MAX_DISPLAY_PERCENT = 300;

const $ = (id) => document.getElementById(id);
const productionAliases = {
  "DMLS TV": "DMLS","DMLS PROD": "DMLS","DMLS PRODUCTION": "DMLS","DMLS PRODUCTIONS": "DMLS",
  "ITV FRANCE": "ITV","ITV STUDIOS": "ITV","ITV PROD": "ITV","ITV PRODUCTION": "ITV","ITV PRODUCTIONS": "ITV",
  "TF1 PROD": "TF1","TF1 PRODUCTION": "TF1","TF1 PRODUCTIONS": "TF1",
  "BANIJAY FRANCE": "BANIJAY","BANIJAY PROD": "BANIJAY",
  "ENDEMOL FRANCE": "ENDEMOL","ENDEMOL SHINE": "ENDEMOL","ENDEMOLSHINE": "ENDEMOL",
  "FREMANTLE FRANCE": "FREMANTLE","FREMANTLEMEDIA": "FREMANTLE",
  "MEDIAWAN PROD": "MEDIAWAN","MEDIAWAN PRODUCTION": "MEDIAWAN",
  "NEWEN STUDIOS": "NEWEN","NEWEN FRANCE": "NEWEN",
  "M6 PROD": "M6","M6 PRODUCTION": "M6",
  "DUSHOW SAS": "DUSHOW",
  "BLIVE PROD": "BLIVE","BLIVE PRODUCTION": "BLIVE",
  "NOVELTY FRANCE": "NOVELTY","NOVELTY MAGNUM": "NOVELTY","NOVELTY EVENT": "NOVELTY",
  "AMP VISUAL TV": "AMP VISUAL","AMP VISUAL PRODUCTION": "AMP VISUAL",
  "SATEL PRODUCTION": "SATEL","SATEL TV": "SATEL",
  "BBC STUDIOS": "BBC","BBC FRANCE": "BBC",
  "CARSON PROD": "CARSON","CARSON PRODUCTION": "CARSON",
  "D M L S TV": "DMLS","D M L S": "DMLS",
  "VDLM": "LES VICTOIRES DE LA MUSIQUE",
  "VICTOIRES DE LA MUSIQUE": "LES VICTOIRES DE LA MUSIQUE",
  "LES VICTOIRES DE LA MUSIQUE": "LES VICTOIRES DE LA MUSIQUE"
};

const productionPrefixes = [
  "AMP VISUAL","DMLS","ITV","TF1","BANIJAY","ENDEMOL","FREMANTLE",
  "MEDIAWAN","NEWEN","M6","BLIVE","NOVELTY","SATEL","BBC",
  "CARSON","VDLM","VICTOIRES DE LA MUSIQUE","LES VICTOIRES DE LA MUSIQUE"
];

function normalizeProductionName(value) {
  if (!value) return "SANS PRODUCTION";
  let name = String(value).trim().toUpperCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").replace(/[._-]+/g," ").replace(/\s+/g," ").trim();
  if (productionAliases[name]) return productionAliases[name];
  const compactName = name.replace(/\s+/g,"");
  if (compactName.startsWith("DMLS")) return "DMLS";
  if (compactName.startsWith("VDLM")) return "LES VICTOIRES DE LA MUSIQUE";
  for (const prefix of productionPrefixes) {
    if (name === prefix || name.startsWith(prefix + " ")) return prefix;
  }
  return name;
}

async function trackEvent(eventName, eventData = {}) {
  try {
    if (!currentUser) return;
    const { error } = await sb.from("analytics_events").insert({ 
      user_id: currentUser.id, 
      event_name: eventName, 
      event_data: eventData 
    });
    if (error) console.warn("Analytics error:", error.message);
  } catch (error) { 
    console.warn("Analytics non bloquant :", error.message); 
  }
}
function setDefaultDates() {
  const today = new Date();
  if ($("date")) $("date").valueAsDate = today;
  if ($("endDate")) $("endDate").valueAsDate = today;
  if ($("documentMonth")) $("documentMonth").value = String(today.getMonth() + 1);
  if ($("documentYear")) $("documentYear").value = String(today.getFullYear());
}

function storageKey(name) {
  return currentUser?.id ? `intermitrack_${name}_${currentUser.id}` : `intermitrack_${name}`;
}

// === Couleur personnalisée par production (mémorisée par utilisateur, en localStorage) ===
// Couleurs VIVES. Passé / à venir = même couleur mais dégradé INVERSÉ pour les différencier.
const PROD_PRESETS = ['#1E6FE0','#15B86B','#FB8C00','#7C3AED','#F0552B']; // 5 de base ; l'utilisateur ajoute les siennes via le picker (+)
const PROD_FALLBACK_COLORS = ["#1F4E5F","#2A6174","#3A7A8F","#7A9E7E","#8AB08E","#9AC09E","#F97316","#FDBA74","#4A8FA5","#5A9FB5"];
let selectedProdColor = 'default'; // 'default' ou un hex '#RRGGBB'
function _hexRgb(h){ h=String(h||'').replace('#',''); if(h.length===3) h=h.split('').map(c=>c+c).join(''); const n=parseInt(h,16)||0; return [(n>>16)&255,(n>>8)&255,n&255]; }
function _rgbHex(r,g,b){ return '#'+[r,g,b].map(x=>Math.max(0,Math.min(255,Math.round(x))).toString(16).padStart(2,'0')).join(''); }
function _lighten(hex, amt){ const [r,g,b]=_hexRgb(hex); return _rgbHex(r+(255-r)*amt, g+(255-g)*amt, b+(255-b)*amt); }
function _luma(hex){ const [r,g,b]=_hexRgb(hex).map(v=>v/255); return 0.2126*r+0.7152*g+0.0722*b; }
function prodTextColor(hex){ return _luma(hex) > 0.62 ? '#1A2330' : '#FFFFFF'; }
function getProductionColors(){ try { return JSON.parse(localStorage.getItem(storageKey("production_colors")) || "{}"); } catch(e){ return {}; } }
function getProductionColorHex(normName){ const v = getProductionColors()[normName]; return (v && /^#/.test(v)) ? v : null; }
function _syncColorsToSupabase(){
  try { if (typeof currentUser !== 'undefined' && currentUser && typeof sb !== 'undefined') sb.from('profiles').upsert({ id: currentUser.id, production_colors: getProductionColors() }, { onConflict:'id' }).then(function(){}, function(){}); } catch(e){}
}
function _syncNotesToSupabase(){
  try { if (typeof currentUser !== 'undefined' && currentUser && typeof sb !== 'undefined') sb.from('profiles').upsert({ id: currentUser.id, notes: (typeof getNotes==='function'?getNotes():[]) }, { onConflict:'id' }).then(function(){}, function(){}); } catch(e){}
}
function setProductionColorHex(normName, hex){
  const colors = getProductionColors();
  if (!hex || hex === 'default') delete colors[normName]; else colors[normName] = hex;
  localStorage.setItem(storageKey("production_colors"), JSON.stringify(colors));
  _syncColorsToSupabase();
}
// Fonds des cases : passé = couleur + HACHURES, à venir = couleur unie.
// Défaut (sans couleur perso) = pétrole/orange, SANS hachures (se distinguent déjà).
function _darken(hex, amt){ const [r,g,b]=_hexRgb(hex); return _rgbHex(r*(1-amt), g*(1-amt), b*(1-amt)); }
function _prodCellBgs(hex){
  if (!hex) return { past:'linear-gradient(135deg,#1F4E5F,#2F8F6B)', fut:'linear-gradient(135deg,#F97316,#FDBA74)', tc:'#fff' };
  // Dégradé premium bien marqué : foncé -> couleur -> clair (toujours visible, quelle que soit la couleur).
  const base = 'linear-gradient(135deg,'+_darken(hex,0.14)+' 0%,'+hex+' 45%,'+_lighten(hex,0.36)+' 100%)';
  return { past:'repeating-linear-gradient(45deg,rgba(255,255,255,.26) 0 5px,rgba(255,255,255,0) 5px 11px),'+base, fut:base, tc:prodTextColor(hex) };
}
function prodGradient(production, isFuture){
  const hex = getProductionColorHex(normalizeProductionName(production));
  if (!hex) return null;
  const b = _prodCellBgs(hex);
  return isFuture ? b.fut : b.past;
}
// Couleur représentative d'une mission pour la case (couleur perso, sinon défaut : orange à venir / pétrole passé).
function _missionRepColor(m){
  const hex = getProductionColorHex(normalizeProductionName(m.production));
  if (hex) return hex;
  const fut = new Date(m.date + "T00:00:00") >= todayDateOnly();
  return fut ? '#F97316' : '#1F4E5F';
}
function prodSolid(production, fallbackIdx){
  return getProductionColorHex(normalizeProductionName(production)) || PROD_FALLBACK_COLORS[fallbackIdx % PROD_FALLBACK_COLORS.length];
}
function _highlightSwatch(){
  document.querySelectorAll('#prodColorRow .prod-color-sw').forEach(s => s.classList.toggle('sel', s.dataset.color === selectedProdColor));
}
// Couleurs perso ajoutées par l'utilisateur (en plus des 5 de base) — mémorisées
function getCustomColors(){ try { return JSON.parse(localStorage.getItem(storageKey("custom_colors")) || "[]"); } catch(e){ return []; } }
function addCustomColor(hex){
  if(!hex) return; hex = hex.toLowerCase();
  if (PROD_PRESETS.map(c=>c.toLowerCase()).includes(hex)) return;
  const arr = getCustomColors();
  if (arr.map(c=>c.toLowerCase()).includes(hex)) return;
  arr.push(hex);
  localStorage.setItem(storageKey("custom_colors"), JSON.stringify(arr));
}
function _renderProdSwatches(){
  const wrap = document.getElementById('prodColorSwatches'); if(!wrap) return;
  let html = '<button type="button" class="prod-color-sw prod-color-def" data-color="default" title="Par défaut (pétrole / orange)" style="background:linear-gradient(135deg,#1F4E5F 0 50%,#F97316 50% 100%)"></button>';
  PROD_PRESETS.concat(getCustomColors()).forEach(function(c){ html += '<button type="button" class="prod-color-sw" data-color="'+c+'" title="'+c+'" style="background:'+c+'"></button>'; });
  html += '<button type="button" class="prod-color-custom prod-color-addbtn" title="Ajouter une couleur perso">+</button>';
  wrap.innerHTML = html;
  _highlightSwatch();
}
function _updateColorPreview(){
  const past = document.getElementById('pcpPast'), fut = document.getElementById('pcpFuture');
  if(!past || !fut) return;
  const b = _prodCellBgs(selectedProdColor === 'default' ? null : selectedProdColor);
  past.style.background = b.past; past.style.color = b.tc;
  fut.style.background  = b.fut;  fut.style.color  = b.tc;
}
function syncProdColorPicker(){
  const row = document.getElementById('prodColorRow'); if(!row) return;
  const prodVal = $("production") ? $("production").value : '';
  const hex = (prodVal && prodVal.trim()) ? getProductionColorHex(normalizeProductionName(prodVal)) : null;
  selectedProdColor = hex || 'default';
  _highlightSwatch();
  const picker = document.getElementById('prodColorPicker'); if (picker && selectedProdColor !== 'default') picker.value = selectedProdColor;
  _updateColorPreview();
  const dot = document.getElementById('prodNameDot');
  if (dot){ if (hex){ dot.style.background = hex; dot.style.display = 'inline-block'; } else { dot.style.display = 'none'; } }
}
function _applyProdColor(value){
  selectedProdColor = value;
  _highlightSwatch();
  _updateColorPreview();
  const prodVal = $("production") ? $("production").value : '';
  if (prodVal && prodVal.trim()){
    setProductionColorHex(normalizeProductionName(prodVal), value === 'default' ? null : value);
    if (typeof renderCalendar === 'function') renderCalendar();
    if (typeof renderAllMissions === 'function') renderAllMissions();
  }
}
document.addEventListener('click', function(e){
  const sw = e.target.closest && e.target.closest('.prod-color-sw');
  if (sw && document.getElementById('prodColorRow')) { _applyProdColor(sw.dataset.color); return; }
  const add = e.target.closest && e.target.closest('.prod-color-addbtn');
  if (add) openCustomColorPicker(selectedProdColor && selectedProdColor!=='default' ? selectedProdColor : '#1E6FE0', function(hex){ addCustomColor(hex); _renderProdSwatches(); _applyProdColor(hex); });
});
document.addEventListener('input', function(e){
  if (e.target && e.target.id === 'production') syncProdColorPicker();
});
document.addEventListener('click', function(e){ var hc = e.target.closest && e.target.closest('.hour-chip'); if (hc && document.getElementById('hours')) { document.getElementById('hours').value = hc.dataset.h; } });
_renderProdSwatches();

// === Fenêtre de couleur MAISON (roue multicolore — même principe que l'app) ===
let _ccOnPick = null;
let _ccHex = '#1E6FE0';
let _ccDrag = false;
const CC_WHEEL = 208, CC_R = 104, CC_SEG = 72;
// HSV → HEX (teinte 0-360, saturation 0-1, valeur 0-1)
function _ccHsvHex(h, s, v){
  h = ((h % 360) + 360) % 360;
  const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60){ r = c; g = x; } else if (h < 120){ r = x; g = c; }
  else if (h < 180){ g = c; b = x; } else if (h < 240){ g = x; b = c; }
  else if (h < 300){ r = x; b = c; } else { r = c; b = x; }
  const to = n => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return '#' + to(r) + to(g) + to(b);
}
// HEX → [teinte, saturation, valeur]
function _ccHexHsv(hex){
  const a = _hexRgb(hex), r = a[0] / 255, g = a[1] / 255, b = a[2] / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d){ if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, mx ? d / mx : 0, mx];
}
// Génère la roue SVG (72 quartiers de teinte + voile blanc radial pour la saturation + point sélecteur)
function _ccWheelSVG(){
  let p = '';
  for (let i = 0; i < CC_SEG; i++){
    const a0 = (i / CC_SEG) * 2 * Math.PI - Math.PI / 2, a1 = ((i + 1) / CC_SEG) * 2 * Math.PI - Math.PI / 2;
    const x0 = (CC_R + CC_R * Math.cos(a0)).toFixed(2), y0 = (CC_R + CC_R * Math.sin(a0)).toFixed(2);
    const x1 = (CC_R + CC_R * Math.cos(a1)).toFixed(2), y1 = (CC_R + CC_R * Math.sin(a1)).toFixed(2);
    const col = _ccHsvHex((i / CC_SEG) * 360, 1, 1);
    p += '<path d="M' + CC_R + ' ' + CC_R + ' L' + x0 + ' ' + y0 + ' A' + CC_R + ' ' + CC_R + ' 0 0 1 ' + x1 + ' ' + y1 + ' Z" fill="' + col + '" stroke="' + col + '" stroke-width="0.6"/>';
  }
  return '<svg id="ccWheel" width="' + CC_WHEEL + '" height="' + CC_WHEEL + '" viewBox="0 0 ' + CC_WHEEL + ' ' + CC_WHEEL + '" style="touch-action:none;cursor:crosshair;display:block;margin:0 auto;border-radius:50%;box-shadow:0 2px 10px rgba(0,0,0,.15);">'
    + p
    + '<defs><radialGradient id="ccSat" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#fff" stop-opacity="1"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>'
    + '<circle cx="' + CC_R + '" cy="' + CC_R + '" r="' + CC_R + '" fill="url(#ccSat)" style="pointer-events:none;"/>'
    + '<circle id="ccDot" cx="' + CC_R + '" cy="' + CC_R + '" r="10" fill="#1E6FE0" stroke="#fff" stroke-width="3" style="pointer-events:none;filter:drop-shadow(0 1px 3px rgba(0,0,0,.45));"/></svg>';
}
// Rafraîchit l'aperçu (cases effectué/à venir), le code HEX et la position du point sur la roue
function _ccUpd(){
  const b = _prodCellBgs(_ccHex);
  const past = document.querySelector('#ccPast'), fut = document.querySelector('#ccFut');
  if (past){ past.style.background = b.past; past.style.color = b.tc; }
  if (fut){ fut.style.background = b.fut; fut.style.color = b.tc; }
  const hx = document.querySelector('#ccHex'); if (hx) hx.textContent = _ccHex.toUpperCase();
  const dot = document.getElementById('ccDot');
  if (dot){
    const hsv = _ccHexHsv(_ccHex);
    const ang = (hsv[0] / 360) * 2 * Math.PI - Math.PI / 2;
    const rr = Math.min(1, hsv[1]) * CC_R;
    dot.setAttribute('cx', (CC_R + rr * Math.cos(ang)).toFixed(1));
    dot.setAttribute('cy', (CC_R + rr * Math.sin(ang)).toFixed(1));
    dot.setAttribute('fill', _ccHex);
  }
}
// Calcule la couleur depuis un point cliqué/touché sur la roue
function _ccPickAt(clientX, clientY){
  const svg = document.getElementById('ccWheel'); if (!svg) return;
  const rect = svg.getBoundingClientRect();
  const x = (clientX - rect.left) / rect.width * CC_WHEEL - CC_R;
  const y = (clientY - rect.top) / rect.height * CC_WHEEL - CC_R;
  let ang = Math.atan2(y, x) + Math.PI / 2; if (ang < 0) ang += 2 * Math.PI;
  const hue = (ang / (2 * Math.PI)) * 360;
  const sat = Math.max(0, Math.min(1, Math.sqrt(x * x + y * y) / CC_R));
  _ccHex = _ccHsvHex(hue, sat, 1);
  _ccUpd();
}
function _ensureCustomColorModal(){
  if (document.getElementById('customColorOverlay')) return;
  const st = document.createElement('style');
  st.textContent = "#customColorOverlay{position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;align-items:center;justify-content:center;z-index:100060;padding:18px;}#customColorOverlay.open{display:flex;}.cc-box{background:var(--card);color:var(--text);border-radius:20px;width:100%;max-width:300px;box-sizing:border-box;padding:22px;box-shadow:0 24px 60px rgba(0,0,0,.3);}.cc-title{font-size:16px;font-weight:900;color:var(--petrol);margin-bottom:12px;text-align:center;}.cc-wheel{margin:2px auto 14px;width:" + CC_WHEEL + "px;max-width:100%;}.cc-preview{display:flex;gap:10px;margin-bottom:8px;}.cc-cellwrap{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;}.cc-cell{width:100%;height:46px;border-radius:12px;border:1px solid var(--line);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:#fff;}.cc-cellwrap small{font-size:10px;font-weight:700;color:var(--muted);}.cc-hex{text-align:center;font-weight:800;font-size:13px;color:var(--muted);margin-bottom:14px;letter-spacing:.05em;}.cc-presets{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:16px;justify-content:center;}.cc-preset{width:28px;height:28px;border-radius:7px;cursor:pointer;box-shadow:0 0 0 1px var(--line);}.cc-actions{display:flex;gap:10px;}.cc-cancel{flex:1;padding:12px;border:1px solid var(--line);background:var(--soft);color:var(--muted);border-radius:12px;font-weight:700;cursor:pointer;}.cc-ok{flex:1;padding:12px;border:none;background:var(--petrol);color:#fff;border-radius:12px;font-weight:800;cursor:pointer;}";
  document.head.appendChild(st);
  const ov = document.createElement('div');
  ov.id = 'customColorOverlay';
  const presets = ['#1E6FE0','#16B1C9','#15B86B','#7BC62D','#F2B705','#FB8C00','#F0552B','#E0306E','#B5179E','#7C3AED','#5C6BC0','#2DBFA8','#D85045','#0E7E8F','#5A6B7A','#0D1B2A'];
  ov.innerHTML = "<div class=\"cc-box\"><div class=\"cc-title\">Choisir une couleur</div><div class=\"cc-wheel\">" + _ccWheelSVG() + "</div><div class=\"cc-preview\"><div class=\"cc-cellwrap\"><span class=\"cc-cell\" id=\"ccPast\">12</span><small>effectué</small></div><div class=\"cc-cellwrap\"><span class=\"cc-cell\" id=\"ccFut\">20</span><small>à venir</small></div></div><div class=\"cc-hex\" id=\"ccHex\">#1E6FE0</div><div class=\"cc-presets\">" + presets.map(function(c){return "<span class=\"cc-preset\" data-c=\""+c+"\" style=\"background:"+c+"\"></span>";}).join("") + "</div><div class=\"cc-actions\"><button class=\"cc-cancel\" id=\"ccCancel\" type=\"button\">Annuler</button><button class=\"cc-ok\" id=\"ccOk\" type=\"button\">Valider</button></div></div>";
  document.body.appendChild(ov);
  // Roue : clic + glisser (souris ET tactile via Pointer Events)
  const wheel = ov.querySelector('#ccWheel');
  wheel.addEventListener('pointerdown', function(e){ _ccDrag = true; _ccPickAt(e.clientX, e.clientY); e.preventDefault(); });
  window.addEventListener('pointermove', function(e){ if (_ccDrag) { _ccPickAt(e.clientX, e.clientY); e.preventDefault(); } });
  window.addEventListener('pointerup', function(){ _ccDrag = false; });
  ov.addEventListener('click', function(e){
    const pre = e.target.closest && e.target.closest('.cc-preset');
    if (pre){ _ccHex = pre.dataset.c; _ccUpd(); return; }
    if (e.target===ov || (e.target.closest && e.target.closest('#ccCancel'))){ ov.classList.remove('open'); _ccOnPick=null; return; }
    if (e.target.closest && e.target.closest('#ccOk')){ const hex=_ccHex.toLowerCase(); ov.classList.remove('open'); if(_ccOnPick){ const cb=_ccOnPick; _ccOnPick=null; cb(hex); } }
  });
}
function openCustomColorPicker(initialHex, onPick){
  _ensureCustomColorModal();
  const ov = document.getElementById('customColorOverlay');
  _ccHex = initialHex || '#1E6FE0';
  _ccUpd();
  _ccOnPick = onPick;
  ov.classList.add('open');
}

// ===== Import Excel/CSV (site) — parité avec l'app mobile =====
const XL_MONTHS = { janvier:1, 'février':2, fevrier:2, mars:3, avril:4, mai:5, juin:6, juillet:7, 'août':8, aout:8, septembre:9, octobre:10, novembre:11, 'décembre':12, decembre:12 };
function _xlEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function _xlFmtD(iso){ const p=String(iso||'').split('-'); return p.length===3 ? p[2]+'/'+p[1] : iso; }
function _xlParseFrDate(s){ const m=String(s).toLowerCase().match(/(\d{1,2})\s+([a-zûéèàôç]+)\s+(\d{4})/i); if(m&&XL_MONTHS[m[2]]) return m[3]+'-'+String(XL_MONTHS[m[2]]).padStart(2,'0')+'-'+String(Number(m[1])).padStart(2,'0'); return null; }
function _xlYmd(v){ if(v==null||v==='')return null; if(v instanceof Date&&!isNaN(v.getTime())) return v.getFullYear()+'-'+String(v.getMonth()+1).padStart(2,'0')+'-'+String(v.getDate()).padStart(2,'0'); if(typeof v==='number'){ const d=new Date(Math.round((v-25569)*86400*1000)); if(!isNaN(d.getTime())) return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0'); return null; } const s=String(v).trim(); const fr=_xlParseFrDate(s); if(fr)return fr; const dm=s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/); if(dm){ let y=dm[3]; if(y.length===2)y='20'+y; return y+'-'+dm[2].padStart(2,'0')+'-'+dm[1].padStart(2,'0'); } return null; }
function _xlNum(v){
  if(v==null||v==='')return 0;
  if(typeof v==='number')return v;
  // virgule OU point comme décimale + séparateurs de milliers, pour ne plus lire « 250,00 » comme 25000 (retour Tuu Coo).
  var s=String(v).replace(/[^\d,.\-]/g,'').replace(/\s/g,'');
  if(s.indexOf(',')>=0 && s.indexOf('.')>=0){ s = s.lastIndexOf(',')>s.lastIndexOf('.') ? s.replace(/\./g,'').replace(',','.') : s.replace(/,/g,''); }
  else if(s.indexOf(',')>=0){ s = /,\d{1,2}$/.test(s) ? s.replace(',','.') : s.replace(/,/g,''); }
  var n=Number(s); return isFinite(n)?n:0;
}
function _xlDetectCols(header){ const H=header.map(function(h){return String(h||'').toLowerCase().trim();}); const find=function(rx){ return H.findIndex(function(h){return rx.test(h);}); }; return { date:find(/date|jour/), prod:find(/prod|production|soci[ée]t[ée]|client|[ée]mission|nom|projet/), hours:find(/heure|hours|dur[ée]e/), price:find(/prix|tarif|montant|brut|cachet|salaire|€|euro/), lieu:find(/lieu|adresse|ville|salle|site/) }; }
function _xlParseSheet(rows){ if(!rows.length)return []; let hi=rows.findIndex(function(r){return (r||[]).some(function(c){return /date/i.test(String(c||''));});}); if(hi<0)hi=0; const cols=_xlDetectCols(rows[hi]||[]); const out=[]; for(let i=hi+1;i<rows.length;i++){ const row=rows[i]||[]; const date=cols.date>=0?_xlYmd(row[cols.date]):null; if(!date)continue; const prod=cols.prod>=0?String(row[cols.prod]||'').trim():''; const hours=cols.hours>=0?_xlNum(row[cols.hours]):0; const price=cols.price>=0?_xlNum(row[cols.price]):0; const lieu=cols.lieu>=0?String(row[cols.lieu]||'').trim():''; const missing=[]; if(!prod)missing.push('prod'); if(!(hours>0))missing.push('heures'); if(!(price>0))missing.push('prix'); out.push({ date:date, prod:prod.toUpperCase(), hours:hours>0?hours:8, price:price, lieu:lieu, missing:missing, selected:true }); } return out; }
// Lit TOUS les onglets du classeur (un fichier peut avoir un onglet vide "Feuil1" + les vraies données sur un 2e onglet).
function _xlParseWorkbook(wb){ let out=[]; (wb.SheetNames||[]).forEach(function(name){ const rows=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:true,defval:''}); out=out.concat(_xlParseSheet(rows)); }); out.sort(function(a,b){return a.date.localeCompare(b.date);}); return out; }

let _xlDrafts = [];
function _xlEnsureModal(){
  if(document.getElementById('xlOverlay'))return;
  const st=document.createElement('style');
  st.textContent="#xlOverlay{position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;align-items:center;justify-content:center;z-index:100060;padding:16px;}#xlOverlay.open{display:flex;}.xl-box{background:var(--card);color:var(--text);border-radius:20px;width:100%;max-width:520px;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,.3);}.xl-head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px 10px;}.xl-title{font-size:17px;font-weight:900;color:var(--petrol);}.xl-close{cursor:pointer;font-size:20px;color:var(--muted);border:none;background:none;}.xl-banner{margin:0 20px 8px;}.xl-banner div{padding:11px 13px;border-radius:12px;background:#FFF7ED;border:1px solid #FDBA74;font-size:12.5px;color:#9A3412;}.xl-list{overflow-y:auto;padding:0 12px;flex:1;}.xl-row{border-bottom:1px solid var(--line);padding:9px 8px;}.xl-row.warn{background:#FFF7ED;}.xl-r1{display:flex;align-items:flex-start;gap:10px;}.xl-chk{width:19px;height:19px;flex:0 0 auto;margin-top:2px;}.xl-prod{font-weight:800;font-size:14px;}.xl-meta{font-size:12px;color:var(--muted);margin-top:1px;}.xl-warnchip{font-size:11px;font-weight:700;color:#9A3412;margin-top:2px;}.xl-edit{display:flex;gap:7px;margin-top:7px;}.xl-edit input{flex:1;min-width:0;border:1px solid var(--line);border-radius:9px;padding:7px 9px;font-size:13px;background:var(--soft);color:var(--text);box-sizing:border-box;}.xl-foot{padding:14px 20px;border-top:1px solid var(--line);}.xl-import{width:100%;padding:13px;border:none;border-radius:12px;background:var(--petrol);color:#fff;font-weight:800;font-size:15px;cursor:pointer;}";
  document.head.appendChild(st);
  const ov=document.createElement('div'); ov.id='xlOverlay';
  ov.innerHTML='<div class="xl-box"><div class="xl-head"><span class="xl-title">Importer un Excel/CSV</span><button class="xl-close" id="xlClose" type="button">✕</button></div><div id="xlBanner" class="xl-banner"></div><div class="xl-list" id="xlList"></div><div class="xl-foot"><button class="xl-import" id="xlImport" type="button">Importer</button></div></div>';
  document.body.appendChild(ov);
  ov.addEventListener('click', function(e){ if(e.target===ov || (e.target.closest&&e.target.closest('#xlClose'))){ ov.classList.remove('open'); } });
  const list=ov.querySelector('#xlList');
  list.addEventListener('change', function(e){ const cb=e.target.closest('.xl-chk'); if(cb){ _xlDrafts[+cb.dataset.i].selected=cb.checked; _xlUpdBtn(); } });
  list.addEventListener('input', function(e){ const inp=e.target.closest('.xl-edit input'); if(!inp)return; const d=_xlDrafts[+inp.dataset.i]; const f=inp.dataset.e; if(f==='prod')d.prod=inp.value.toUpperCase(); if(f==='hours')d.hours=_xlNum(inp.value); if(f==='price')d.price=_xlNum(inp.value); d.missing=[]; if(!d.prod||!d.prod.trim())d.missing.push('prod'); if(!(d.hours>0))d.missing.push('heures'); if(!(d.price>0))d.missing.push('prix'); _xlUpdBtn(); });
  ov.querySelector('#xlImport').addEventListener('click', _xlDoImport);
}
function _xlUpdBtn(){ const sel=_xlDrafts.filter(function(d){return d.selected;}); const n=sel.length; const inc=sel.filter(function(d){return d.missing.length;}).length; const bn=document.getElementById('xlBanner'); if(bn) bn.innerHTML = inc>0 ? '<div>⚠ '+inc+' mission'+(inc>1?'s':'')+' à compléter (prod ou prix manquant). Complète ci-dessous, ou importe et modifie plus tard.</div>' : ''; const b=document.getElementById('xlImport'); if(b){ b.textContent=n?('Importer '+n+' mission'+(n>1?'s':'')):'Sélectionne au moins une mission'; b.disabled=!n; b.style.opacity=n?'1':'.6'; } }
function _xlRender(){
  const list=document.getElementById('xlList');
  list.innerHTML=_xlDrafts.map(function(d,i){
    const warn=d.missing.length>0;
    return '<div class="xl-row'+(warn?' warn':'')+'"><div class="xl-r1"><input type="checkbox" class="xl-chk" data-i="'+i+'" '+(d.selected?'checked':'')+'><div style="flex:1;min-width:0;"><div class="xl-prod">'+_xlEsc(d.prod||'(sans nom)')+'</div><div class="xl-meta">'+_xlFmtD(d.date)+(d.missing.indexOf('heures')<0?(' · '+d.hours+' h'):'')+(d.price?(' · '+d.price+' €'):'')+(d.lieu?(' · '+_xlEsc(d.lieu)):'')+'</div>'+(warn?('<div class="xl-warnchip">⚠ À compléter : '+d.missing.join(' · ')+'</div>'):'')+(d.check?('<div style="font-size:11px;color:var(--muted);margin-top:2px;">'+_xlEsc(d.check)+'</div>'):'')+'</div></div><div class="xl-edit"><input placeholder="Prod" data-e="prod" data-i="'+i+'" value="'+_xlEsc(d.prod||'')+'"><input placeholder="Heures" data-e="hours" data-i="'+i+'" value="'+_xlEsc(d.hours||'')+'"><input placeholder="Prix €" data-e="price" data-i="'+i+'" value="'+_xlEsc(d.price||'')+'"></div></div>';
  }).join('');
  _xlUpdBtn();
}
async function _xlDoImport(){
  const sel=_xlDrafts.filter(function(d){return d.selected;}); if(!sel.length)return;
  if(!currentUser){ toast('Connecte-toi.'); return; }
  const btn=document.getElementById('xlImport'); btn.disabled=true; btn.textContent='Import en cours…';
  const payloads=sel.map(function(d){ return { user_id:currentUser.id, production:normalizeProductionName(d.prod), emission:'', lieu:d.lieu||'', mission_type:((_profil&&_profil.annexe==='artiste')?'':'Tournage'), mission_date:d.date, end_date:d.date, hours:d.hours>0?d.hours:8, gross_amount:d.price||0, vacations:1, km_distance:0, km_rate:0, km_amount:0 }; });
  try{
    for(let i=0;i<payloads.length;i+=100){ const r=await sb.from('missions').insert(payloads.slice(i,i+100)); if(r.error)throw r.error; }
    document.getElementById('xlOverlay').classList.remove('open');
    toast(sel.length+' mission'+(sel.length>1?'s':'')+' importée'+(sel.length>1?'s':'')+' !');
    if(typeof _afterMissionSave==='function') await _afterMissionSave(payloads[0].mission_date);
  }catch(e){ toast('Import échoué : '+(e.message||e)); btn.disabled=false; _xlUpdBtn(); }
}
async function _xlPickFile(){
  if(typeof XLSX==='undefined'){ toast('Librairie Excel non chargée, recharge la page.'); return; }
  if(!currentUser){ toast("Connecte-toi avant d'importer."); return; }
  let inp=document.getElementById('xlFileInput');
  if(!inp){ inp=document.createElement('input'); inp.type='file'; inp.id='xlFileInput'; inp.accept='.xlsx,.xls,.csv'; inp.style.display='none'; document.body.appendChild(inp);
    inp.addEventListener('change', async function(){ const f=inp.files&&inp.files[0]; inp.value=''; if(!f)return;
      try{
        const buf=await f.arrayBuffer(); const wb=XLSX.read(new Uint8Array(buf),{type:'array',raw:true}); /* raw:true : ne pas deviner les nombres (« 250,00 » CSV -> 25000) ; pas de cellDates : dates en numéro de série + UTC (_xlYmd) */
        let drafts=_xlParseWorkbook(wb);
        const rawCount=drafts.length;
        try{ const ex=await sb.from('missions').select('mission_date,production'); const seen=new Set((ex.data||[]).map(function(m){return m.mission_date+'|'+String(m.production||'').toUpperCase();})); drafts=drafts.filter(function(d){return !seen.has(d.date+'|'+d.prod);}); }catch(_){}
        if(!drafts.length){ toast(rawCount>0 ? ('Ces '+rawCount+' mission'+(rawCount>1?'s sont déjà':' est déjà')+' dans ton compte — aucun doublon créé.') : 'Aucune date reconnue dans le fichier (colonnes attendues : Date, Production, Heures, Tarif).'); return; }
        _xlDrafts=drafts; _xlEnsureModal(); _xlRender(); document.getElementById('xlOverlay').classList.add('open');
      }catch(e){ toast('Lecture du fichier impossible : '+(e.message||e)); }
    });
  }
  inp.click();
}
document.addEventListener('click', function(e){ if(e.target.closest && e.target.closest('#importExcelBtn')) _xlPickFile(); });

// ===== Import « Coller mes notes » (site) — port du parseur de l'appli =====
var XL_NOTE_MONTHS = [[/^janv/i,1],[/^f[eé]v/i,2],[/^mars/i,3],[/^avr/i,4],[/^mai$/i,5],[/^juin/i,6],[/^juil/i,7],[/^ao[uû]t/i,8],[/^sept/i,9],[/^oct/i,10],[/^nov/i,11],[/^d[eé]c/i,12]];
function _noteMonthOfLine(line){ var w=line.replace(/[^a-zàâäéèêëîïôöûüç]/gi,''); if(!w)return null; for(var i=0;i<XL_NOTE_MONTHS.length;i++){ if(XL_NOTE_MONTHS[i][0].test(w)) return XL_NOTE_MONTHS[i][1]; } return null; }
function _noteExtract(text){
  var RX=/(\d{1,2})(?:[.,](\d))?\s*h(?:\s*(\d{2})(?!\d))?/gi, m, hits=[];
  while((m=RX.exec(text))){ if(m[2]!=null)hits.push(+m[1]+ +m[2]/10); else if(m[3]!=null)hits.push(+m[1]+ +m[3]/60); else hits.push(+m[1]); }
  var textHours=null;
  if(hits.length===1) textHours=hits[0];
  else if(hits.length>=2){ var dd=hits[hits.length-1]-hits[0]; if(dd<0)dd+=24; if(dd>0&&dd<=24)textHours=Math.round(dd*2)/2; }
  // Partie décimale CAPTURÉE : sans ça "191.48 €" laissait le € collé à ".48" → prix lu "48". On reconstruit 191,48.
  var gross=0, euro=text.match(/(?:^|[^\dh])(\d[\d ]{0,6}\d|\d)(?:[.,](\d{1,2}))?\s*(?:€|euros?)/i);
  if(euro){ var n=Number(euro[1].replace(/\s/g,'')); if(euro[2]!=null)n+=Number(euro[2])/(euro[2].length===1?10:100); if(n>=20&&n<=99999)gross=Math.round(n*100)/100; }
  else { var nums=(text.match(/\d{2,4}/g)||[]).map(Number).filter(function(x){return x>=100&&x<=9999&&!(x>=1990&&x<=2099);}); if(nums.length)gross=nums[0]; }
  var prod=String(text||'').replace(/(^|[^\dh])(\d[\d ]{0,6}\d|\d)(?:[.,]\d{1,2})?\s*(?:€|euros?)/gi,'$1 ').replace(/\d{1,2}(?:[.,]\d)?\s*h(?:\s*\d{2}(?!\d))?/gi,' ').replace(/\b\d{3,4}\b/g,' ').replace(/[·|,;\/]+/g,' ').replace(/\s+-+\s*|^\s*-+|-+\s*$/g,' ').replace(/\s{2,}/g,' ').trim();
  return { gross:gross, textHours:textHours, prod:prod };
}
function _parseNotes(text, year, defH, defP){
  var lines=String(text||'').split(/\r?\n/), curMonth=null, out=[], skipped=[], block=[];
  // Applique heures + prix (depuis la ligne-date OU une ligne de détail) à un bloc de N jours.
  function fill(drafts, textHours, gross){
    var N=drafts.length; if(!N)return;
    var hoursFound=textHours!=null&&textHours>0&&textHours<=24*Math.max(1,N), overtimeMsg='';
    if(hoursFound){
      var total=textHours;
      if(N===1){ drafts.forEach(function(d){ d.hours=total; }); }
      else {
        // JAMAIS total ÷ jours : base = defH/jour ; le surplus = heures sup à ajouter à la main.
        var base=defH, extra=Math.round((total-N*base)*10)/10;
        drafts.forEach(function(d){ d.hours=base; });
        if(extra>0)overtimeMsg=N+' jours × '+base+'h = '+(N*base)+'h ; tu as noté '+total+'h → ajoute les '+extra+'h en plus sur le bon jour.';
        else if(extra<0)overtimeMsg='Tu as noté '+total+'h pour '+N+' jours (base '+(N*base)+'h) — vérifie les heures.';
      }
    }
    var priceFound=gross>0;
    if(priceFound){ var per=Math.round((gross/N)*100)/100, acc=0; drafts.forEach(function(d,i){ d.price=(i===N-1)?Math.round((gross-acc)*100)/100:per; acc+=per; }); }
    else if(defP>0){ drafts.forEach(function(d){ d.price=defP; }); }
    drafts.forEach(function(d){
      d.missing=d.missing.filter(function(m){return m!=='heures'&&m!=='prix';});
      if(!hoursFound)d.missing.push('heures');
      if(!priceFound)d.missing.push('prix');
      var chk=[]; if(!hoursFound)chk.push((defH===12?'1 cachet':defH+' h')+' par défaut'); if(!priceFound&&d.price>0)chk.push(d.price+' € (tarif journalier)');
      d.check = overtimeMsg ? overtimeMsg : (chk.length?(chk.join(' · ')+' — à vérifier'):'');
    });
  }
  for(var li=0;li<lines.length;li++){
    var line=lines[li].trim(); if(!line)continue;
    var digits=(line.match(/\d/g)||[]).length, asMonth=_noteMonthOfLine(line);
    if(asMonth&&digits===0){ curMonth=asMonth; block=[]; continue; }
    var work=line.replace(/^[^\p{L}\p{N}]+/u,'');
    var bullet=work.match(/^\d{1,2}[.)]\s*(?=\d{1,2}[\/\-.]\d{1,2})/); if(bullet)work=work.slice(bullet[0].length);
    var dates=[], rest=work, rangeNote='';
    // Plage « X au Y » : un contrat sur une période. 2 jours (début + fin) = FORCÉMENT ces 2 dates -> 2
    // missions (retour Justine). Au-delà de 2 jours, impossible de deviner -> 1re date + note à compléter.
    var rng=work.match(/^(\d{1,2})(?:[\/\-.](\d{1,2}))?\s*(?:au|à)\s*(\d{1,2})(?:[\/\-.](\d{1,2}))?(?=\s|$)/i);
    if(rng){ var _d1=+rng[1], _m1=rng[2]?+rng[2]:curMonth, _d2=+rng[3], _m2=rng[4]?+rng[4]:(_m1||curMonth);
      if(_m1&&_m2&&_d1>=1&&_d1<=31&&_d2>=1&&_d2<=31){ var _i1=year+'-'+String(_m1).padStart(2,'0')+'-'+String(_d1).padStart(2,'0'), _i2=year+'-'+String(_m2).padStart(2,'0')+'-'+String(_d2).padStart(2,'0'), _span=Math.round((Date.UTC(year,_m2-1,_d2)-Date.UTC(year,_m1-1,_d1))/86400000)+1;
        if(_span===2)dates=[_i1,_i2]; else{ dates=[_i1]; if(_span>2)rangeNote='Contrat du '+_d1+'/'+_m1+' au '+_d2+'/'+_m2+' : ajoute les autres jours travaillés à la main (l\'appli ne peut pas deviner lesquels).'; }
        rest=work.slice(rng[0].length); } }
    // Multi-jours sous un en-tête de mois : « 6/7 », « 16 17 », « 24/25/26 » -> une mission par jour.
    var multi=curMonth?work.match(/^(\d{1,2}(?:\s*[\/\-]\s*\d{1,2}|\s+\d{1,2})+)(?=\s|$)/):null;
    if(!dates.length&&multi){ var nums=multi[1].split(/[\/\-\s]+/).map(Number).filter(function(n){return n>=1&&n<=31;}); if(nums.length>=2){ dates=nums.map(function(d){return year+'-'+String(curMonth).padStart(2,'0')+'-'+String(d).padStart(2,'0');}); rest=work.slice(multi[0].length); } }
    if(!dates.length){ var ex=work.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\b/); if(ex&&+ex[2]>=1&&+ex[2]<=12&&+ex[1]>=1&&+ex[1]<=31){ var y=ex[3]?(ex[3].length===2?2000+ +ex[3]:+ex[3]):year; dates=[y+'-'+String(+ex[2]).padStart(2,'0')+'-'+String(+ex[1]).padStart(2,'0')]; rest=work.slice(ex[0].length); } }
    if(!dates.length&&curMonth){ var dayM=work.match(/^(?:(?:lun|mar|mer|jeu|ven|sam|dim)[a-zàâäéèêëîïôöûüç.]*\s+)?(\d{1,2})\b/i); if(dayM&&+dayM[1]>=1&&+dayM[1]<=31){ dates=[year+'-'+String(curMonth).padStart(2,'0')+'-'+String(+dayM[1]).padStart(2,'0')]; rest=work.slice(dayM[0].length); } }
    if(dates.length){
      var parsed=_noteExtract(rest), prodUp=(parsed.prod||'').replace(/[.\s]+$/,'').toUpperCase();
      var drafts=dates.map(function(dt){ return { date:dt, prod:prodUp, hours:defH, price:0, lieu:'', missing:[], selected:true, check:'' }; });
      if(!prodUp.trim())drafts.forEach(function(d){ d.missing.push('prod'); });
      var hasDetail=(parsed.textHours!=null&&parsed.textHours>0)||parsed.gross>0;
      fill(drafts, parsed.textHours, parsed.gross);
      if(rangeNote)drafts.forEach(function(d){ d.check=rangeNote; }); // plage > 2 jours : jours à compléter
      out.push.apply(out, drafts);
      block=hasDetail?[]:drafts; // pas de détail sur la ligne -> on attend la ligne suivante
      continue;
    }
    // Ligne de DÉTAIL (heures/prix sans date) -> complète le bloc précédent.
    var det=_noteExtract(work), hasDet=(det.textHours!=null&&det.textHours>0)||det.gross>0;
    if(block.length&&hasDet){ fill(block, det.textHours, det.gross); block=[]; continue; }
    skipped.push(line);
  }
  out.sort(function(a,b){return a.date.localeCompare(b.date);});
  return { drafts: out, skipped: skipped };
}
function _openNotesImport(){
  var ov=document.getElementById('notesImportOverlay');
  if(!ov){
    ov=document.createElement('div'); ov.id='notesImportOverlay';
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);display:none;align-items:flex-start;justify-content:center;z-index:100003;padding:6vh 16px 16px;overflow-y:auto;';
    document.body.appendChild(ov);
    ov.addEventListener('click', function(e){ if(e.target===ov||e.target.id==='niClose') ov.style.display='none'; });
  }
  var year=new Date().getFullYear();
  var defH=(_profil&&_profil.annexe==='artiste')?12:8;
  // Prix par défaut : le SALAIRE JOURNALIER du profil s'il est renseigné, sinon le tarif journalier
  // MOYEN des missions déjà saisies. (Jamais taux_journalier = allocation Pôle Emploi.)
  var defP=(_profil&&Number(_profil.salaire_journalier)>0)?Number(_profil.salaire_journalier):0;
  if(!defP){ var _g=(typeof missions!=='undefined'?missions:[]).reduce(function(a,m){return a+Number(m.gross||0);},0);
    var _v=(typeof missions!=='undefined'?missions:[]).reduce(function(a,m){return a+Number(m.vacations||0);},0);
    defP=(_g>0&&_v>0)?Math.round(_g/_v):0; }
  ov.innerHTML='<div class="pf-box" style="max-width:520px;"><div class="pf-title">Coller mes notes</div>'
   +'<p class="itk-hint" style="margin:2px 0 8px;">Un en-tête de mois, puis une ligne par date. Les heures et le prix peuvent être sur la même ligne ou sur celle du dessous.<br>Ex : <b>MARS</b> puis <b>18 vdlm 8h 230</b> — ou <b>19 endemol</b> puis <b>12h 450</b> en dessous.<br>Plusieurs jours d\'un coup : <b>20 24 canal 16h 400</b> crée 2 missions (les 20 et 24). Pour un contrat sur des dates espacées, écris les vrais jours travaillés, pas « du 20 au 24 » : l\'appli ne peut pas deviner lesquels.</p>'
   +'<textarea id="niText" rows="7" placeholder="Colle ici…" style="width:100%;border:1px solid var(--line);border-radius:11px;padding:11px 13px;font-size:14px;font-family:inherit;box-sizing:border-box;background:var(--card);color:var(--text);resize:vertical;"></textarea>'
   +'<p class="itk-hint" style="margin:8px 0 2px;">Ce qui manque sera pré-rempli : les heures ('+(defH===12?'1 cachet de 12 h, car ton profil est artiste':'8 h, car ton profil est technicien')+')'+(defP>0?(', et '+defP+' € pour le prix (ton tarif journalier)'):'')+'. Tu vérifies chaque ligne avant de valider.</p>'
   +'<label class="itk-label" style="margin-top:6px;">Année (tes notes ne l\'indiquent pas)</label>'
   +'<input type="number" id="niYear" value="'+year+'" style="width:120px;border:1px solid var(--line);border-radius:11px;padding:10px 12px;font-size:14px;font-family:inherit;background:var(--card);color:var(--text);">'
   +'<div id="niErr" style="color:var(--danger);font-size:13px;font-weight:600;margin-top:8px;display:none;"></div>'
   +'<div class="pf-actions" style="margin-top:14px;gap:8px;display:flex;"><button type="button" class="pf-create" id="niGo" style="flex:1;">Analyser mes notes</button><button type="button" class="pf-cancel" id="niClose">Fermer</button></div></div>';
  ov.style.display='flex';
  document.getElementById('niGo').onclick=async function(){
    var t=document.getElementById('niText').value, y=parseInt(document.getElementById('niYear').value,10)||year;
    var _r=_parseNotes(t,y,defH,defP), drafts=_r.drafts, skipped=_r.skipped;
    if(!drafts.length){ var e=document.getElementById('niErr'); e.style.display='block';
      if(skipped.length){
        var items=skipped.slice(0,4).map(function(l){return '•&nbsp;'+_xlEsc(l);}).join('<br>');
        e.innerHTML="Je n'ai reconnu aucune mission.<br><br>Ces lignes m'ont bloqué :<br>"+items+(skipped.length>4?('<br>(+'+(skipped.length-4)+' autres)'):'')+"<br><br>Chaque ligne a besoin d'un JOUR et d'un MOIS : soit « 18/03 prod 8h 230 », soit un en-tête « MARS » au-dessus puis « 18 prod 8h 230 ».";
      } else { e.textContent="Je n'ai reconnu aucune mission. Colle des lignes avec un jour et un mois (ex : « MARS » puis « 18 prod 8h 230 »)."; }
      return; }
    try{ const ex=await sb.from('missions').select('mission_date,production'); const seen=new Set((ex.data||[]).map(function(m){return m.mission_date+'|'+String(m.production||'').toUpperCase();})); drafts=drafts.filter(function(d){return !seen.has(d.date+'|'+d.prod);}); }catch(_){}
    if(!drafts.length){ var e2=document.getElementById('niErr'); e2.style.display='block'; e2.textContent='Ces missions sont déjà dans ton compte — aucun doublon créé.'; return; }
    ov.style.display='none';
    _xlDrafts=drafts; _xlEnsureModal(); _xlRender(); document.getElementById('xlOverlay').classList.add('open');
  };
}
document.addEventListener('click', function(e){ if(e.target.closest && e.target.closest('#importNotesBtn')) _openNotesImport(); });
// Popup d'aide : comment préparer son fichier Excel/CSV
function _xlInfoShow(){
  let ov=document.getElementById('xlInfoOverlay');
  if(!ov){
    const st=document.createElement('style');
    st.textContent="#xlInfoOverlay{position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;align-items:center;justify-content:center;z-index:100060;padding:16px;}#xlInfoOverlay.open{display:flex;}.xli-box{background:var(--card);color:var(--text);border-radius:18px;max-width:430px;width:100%;padding:22px;box-shadow:0 24px 60px rgba(0,0,0,.3);box-sizing:border-box;}.xli-box h3{margin:0 0 8px;color:var(--petrol);font-size:17px;}.xli-box p{font-size:13.5px;color:var(--muted);line-height:1.5;margin:0 0 6px;}.xli-box ul{margin:8px 0;padding-left:18px;}.xli-box li{font-size:13.5px;color:var(--text);line-height:1.6;}.xli-ex{background:var(--soft);border-radius:10px;padding:10px 12px;font-family:monospace;font-size:12.5px;color:var(--text);margin:10px 0;line-height:1.5;}.xli-close{margin-top:14px;width:100%;padding:12px;border:none;border-radius:11px;background:var(--petrol);color:#fff;font-weight:800;cursor:pointer;font-family:inherit;}";
    document.head.appendChild(st);
    ov=document.createElement('div'); ov.id='xlInfoOverlay';
    ov.innerHTML='<div class="xli-box"><h3>📄 Format du fichier Excel / CSV</h3><p>Une <b>ligne par mission</b>. Intermitrack reconnaît ces colonnes (peu importe l\'ordre, la casse, et <b>tous les onglets</b> sont lus) :</p><ul><li><b>Date</b> — ex. 05/07/2026</li><li><b>Production</b> — nom de l\'employeur</li><li><b>Heures</b> — ex. 8</li><li><b>Montant / Brut</b> — ex. 230</li></ul><div class="xli-ex">Date&nbsp;|&nbsp;Production&nbsp;|&nbsp;Heures&nbsp;|&nbsp;Montant<br>05/07/2026&nbsp;|&nbsp;ENDEMOL&nbsp;|&nbsp;8&nbsp;|&nbsp;230</div><p>Une colonne manquante&nbsp;? Pas grave, tu pourras compléter après l\'import.</p><button class="xli-close" id="xliClose" type="button">Compris</button></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click',function(e){ if(e.target===ov || (e.target.closest && e.target.closest('#xliClose'))) ov.classList.remove('open'); });
  }
  ov.classList.add('open');
}
document.addEventListener('click', function(e){ if(e.target.closest && e.target.closest('#xlInfoBtn')) _xlInfoShow(); });

// --- Gestionnaire "Personnaliser les couleurs" (liste toutes les prods) + Réinitialiser ---
function _ensureProdColorsModal(){
  if (document.getElementById('prodColorsOverlay')) return;
  const st = document.createElement('style');
  st.textContent = "#prodColorsOverlay{position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;align-items:center;justify-content:center;z-index:100050;padding:18px;}#prodColorsOverlay.open{display:flex;}.pcm-box{background:var(--card);color:var(--text);border-radius:20px;max-width:440px;width:100%;max-height:86vh;overflow-y:auto;padding:22px;box-shadow:0 24px 60px rgba(0,0,0,.3);}.pcm-title{font-size:18px;font-weight:900;color:var(--petrol);}.pcm-sub{font-size:12.5px;color:var(--muted);margin:4px 0 16px;line-height:1.45;}.pcm-list{display:flex;flex-direction:column;gap:8px;}.pcm-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--line);border-radius:12px;}.pcm-prev{display:flex;gap:8px;flex-shrink:0;}.pcm-cellwrap{display:flex;flex-direction:column;align-items:center;gap:2px;}.pcm-cellwrap small{font-size:8px;font-weight:700;color:var(--muted);}.pcm-cell{width:32px;height:32px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#fff;box-shadow:0 0 0 1px var(--line);}.pcm-name{flex:1;min-width:0;font-size:13.5px;font-weight:800;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.pcm-box{box-sizing:border-box;}.pcm-row{flex-wrap:wrap;}.pcm-pick{position:relative;width:32px;height:32px;border-radius:8px;border:1px solid var(--line-2);background:var(--soft);color:var(--text);overflow:hidden;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:14px;}.pcm-pick input{position:absolute;inset:0;opacity:0;cursor:pointer;border:none;padding:0;}.pcm-def{background:var(--soft);border:none;border-radius:8px;padding:6px 10px;font-size:11.5px;font-weight:700;color:var(--petrol);cursor:pointer;}.pcm-empty{font-size:13px;color:var(--muted);padding:14px 4px;}.pcm-close{margin-top:16px;width:100%;padding:12px;border:none;border-radius:12px;background:var(--petrol);color:#fff;font-weight:800;font-size:14px;cursor:pointer;}.pcm-pickbtn{width:auto;height:auto;display:inline-flex;align-items:center;gap:7px;padding:7px 12px;background:var(--soft);border:1px solid var(--line);border-radius:9px;color:var(--petrol);font-size:11.5px;font-weight:800;cursor:pointer;overflow:visible;}.pcm-dot{width:14px;height:14px;border-radius:5px;flex-shrink:0;box-shadow:inset 0 0 0 1px rgba(0,0,0,.15);}";
  document.head.appendChild(st);
  const ov = document.createElement('div');
  ov.id = 'prodColorsOverlay';
  ov.innerHTML = "<div class=\"pcm-box\"><div class=\"pcm-title\">Couleurs des productions</div><div class=\"pcm-sub\">Choisis une couleur par production. Elle s'applique partout : calendrier, missions du mois et graphique « Mes productions ».</div><div class=\"pcm-list\" id=\"pcmList\"></div><button class=\"pcm-close\" id=\"pcmCloseBtn\" type=\"button\">Fermer</button></div>";
  document.body.appendChild(ov);
  ov.addEventListener('click', (e)=>{ if (e.target === ov || (e.target.closest && e.target.closest('#pcmCloseBtn'))) ov.classList.remove('open'); });
  ov.addEventListener('click', (e)=>{
    const pick = e.target.closest && e.target.closest('.pcm-pickbtn');
    if (!pick) return;
    const prod = pick.dataset.prod;
    openCustomColorPicker(pick.dataset.cur || '#1E6FE0', function(hex){
      setProductionColorHex(prod, hex);
      _refreshProdColorsList();
      if (typeof renderCalendar==='function') renderCalendar();
      if (typeof renderAllMissions==='function') renderAllMissions();
    });
  });
  ov.addEventListener('click', (e)=>{
    const def = e.target.closest && e.target.closest('.pcm-def');
    if (!def) return;
    setProductionColorHex(def.dataset.prod, null);
    _refreshProdColorsList();
    if (typeof renderCalendar==='function') renderCalendar();
    if (typeof renderAllMissions==='function') renderAllMissions();
  });
}
function _prodColorsList(){
  // Tri par FRÉQUENCE (plus utilisée d'abord), pas alphabétique : on ne fouille plus dans une longue
  // liste pour retrouver sa prod. Parité avec l'app. Retour Yohan.
  const cnt = {};
  (typeof missions !== 'undefined' ? missions : []).forEach(m=>{ const n = normalizeProductionName(m.production || 'SANS PRODUCTION'); cnt[n]=(cnt[n]||0)+1; });
  return Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a]);
}
function _refreshProdColorsList(){
  const list = document.getElementById('pcmList'); if(!list) return;
  const prods = _prodColorsList();
  if (!prods.length){ list.innerHTML = "<div class=\"pcm-empty\">Aucune production enregistrée pour l'instant.</div>"; return; }
  list.innerHTML = prods.map(p=>{
    const hex = getProductionColorHex(p);
    const val = hex || '#1E6FE0';
    const b = _prodCellBgs(hex); const pastBg=b.past, futBg=b.fut, tc=b.tc;
    const swBg = 'var(--petrol)';
    const swIc = '#fff';
    return "<div class=\"pcm-row\"><span class=\"pcm-name\">"+escapeHtml(p)+"</span>"
      +"<span class=\"pcm-prev\"><span class=\"pcm-cellwrap\"><span class=\"pcm-cell\" data-role=\"past\" style=\"background:"+pastBg+";color:"+tc+"\">12</span><small>effectué</small></span><span class=\"pcm-cellwrap\"><span class=\"pcm-cell\" data-role=\"fut\" style=\"background:"+futBg+";color:"+tc+"\">20</span><small>à venir</small></span></span>"
      +"<button type=\"button\" class=\"pcm-pick pcm-pickbtn\" data-prod=\""+escapeHtml(p)+"\" data-cur=\""+val+"\" title=\"Choisir la couleur\"><span class=\"pcm-dot\" style=\"background:"+futBg+"\"></span>Choisir</button>"
      +"<button class=\"pcm-def\" data-prod=\""+escapeHtml(p)+"\" type=\"button\">défaut</button></div>";
  }).join('');
}
function _applyRowPreview(input){
  const row = input.closest && input.closest('.pcm-row'); if(!row) return;
  const b = _prodCellBgs(input.value);
  const past = row.querySelector('.pcm-cell[data-role=past]');
  const fut = row.querySelector('.pcm-cell[data-role=fut]');
  if(past){ past.style.background = b.past; past.style.color = b.tc; }
  if(fut){ fut.style.background = b.fut; fut.style.color = b.tc; }
}
function openProdColorsManager(){ _ensureProdColorsModal(); _refreshProdColorsList(); document.getElementById('prodColorsOverlay').classList.add('open'); }
async function resetProdColors(){
  const ok = await confirmDialog("Remettre toutes les productions aux couleurs par défaut d'Intermitrack ? Cela ne touche QUE les couleurs d'affichage — aucune mission ni donnée n'est supprimée.");
  if (!ok) return;
  localStorage.removeItem(storageKey("production_colors"));
  _syncColorsToSupabase();
  if (typeof renderCalendar==='function') renderCalendar();
  if (typeof renderAllMissions==='function') renderAllMissions();
  if (document.getElementById('pcmList')) _refreshProdColorsList();
  if (typeof toast==='function') toast('Couleurs réinitialisées ✓');
}
// Réinitialise le calendrier : supprime TOUTES les missions (repartir de zéro). Distinct de "Réinitialiser les couleurs".
async function resetCalendar(){
  if (!currentUser) return;
  const ok = await confirmDialog("⚠️ Réinitialiser TON CALENDRIER ?\n\nCela supprime DÉFINITIVEMENT toutes tes missions (pour repartir de zéro, ex. après un import raté). Tes couleurs, notes et infos ne sont PAS touchées.\n\nAction irréversible.");
  if (!ok) return;
  const { error } = await sb.from("missions").delete().eq("user_id", currentUser.id);
  if (error) { if (typeof toast==='function') toast("Erreur : " + error.message); return; }
  if (typeof loadMissions==='function') await loadMissions();
  if (typeof render==='function') render();
  if (typeof toast==='function') toast("Calendrier réinitialisé — toutes les missions ont été supprimées ✓");
}
// Réinitialise le MOIS affiché : supprime uniquement ses missions (notes/couleurs intactes).
async function resetMonth(){
  if (!currentUser) return;
  const list = monthMissions(current);
  const lbl = current.toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
  if (!list.length) { if (typeof toast==='function') toast("Aucune mission en " + lbl + "."); return; }
  const ok = await confirmDialog(`⚠️ Réinitialiser ${lbl} ?\n\nLes ${list.length} mission(s) de ${lbl} seront DÉFINITIVEMENT supprimées. Tes notes et couleurs ne sont pas touchées.\n\nAction irréversible.`);
  if (!ok) return;
  const { error } = await sb.from("missions").delete().eq("user_id", currentUser.id).in("id", list.map(function(m){return m.id;}));
  if (error) { if (typeof toast==='function') toast("Erreur : " + error.message); return; }
  if (typeof loadMissions==='function') await loadMissions();
  if (typeof render==='function') render();
  if (typeof toast==='function') toast(lbl + " réinitialisé ✓");
}
// Réinitialise l'ANNÉE affichée : pratique après un import parti sur une mauvaise année.
async function resetYear(){
  if (!currentUser) return;
  const y = current.getFullYear();
  const n = missions.filter(function(m){ return new Date(m.date + "T00:00:00").getFullYear() === y; }).length;
  if (!n) { if (typeof toast==='function') toast("Aucune mission en " + y + "."); return; }
  const ok = await confirmDialog(`⚠️ Réinitialiser l'année ${y} ?\n\nLes ${n} mission(s) de ${y} seront DÉFINITIVEMENT supprimées. Tes notes et couleurs ne sont pas touchées.\n\nAction irréversible.`);
  if (!ok) return;
  const { error } = await sb.from("missions").delete().eq("user_id", currentUser.id).gte("mission_date", `${y}-01-01`).lte("mission_date", `${y}-12-31`);
  if (error) { if (typeof toast==='function') toast("Erreur : " + error.message); return; }
  if (typeof loadMissions==='function') await loadMissions();
  if (typeof render==='function') render();
  if (typeof toast==='function') toast("Année " + y + " réinitialisée ✓");
}
document.addEventListener('click', function(e){
  if (e.target.closest && e.target.closest('#prodColorsManageBtn')) openProdColorsManager();
  else if (e.target.closest && e.target.closest('#prodColorsResetBtn')) resetProdColors();
  else if (e.target.closest && e.target.closest('#resetMonthBtn')) resetMonth();
  else if (e.target.closest && e.target.closest('#resetYearBtn')) resetYear();
  else if (e.target.closest && e.target.closest('#resetCalendarBtn')) resetCalendar();
});

function getTaxableIncome() { return Number(localStorage.getItem(storageKey("taxable_income")) || 0); }
function setTaxableIncome(value) { localStorage.setItem(storageKey("taxable_income"), String(Number(value || 0))); }
function getOtherIncome() { return Number(localStorage.getItem(storageKey("other_income")) || 0); }
function setOtherIncome(value) { localStorage.setItem(storageKey("other_income"), String(Number(value || 0))); }
function getTaxParts() { return Number(localStorage.getItem(storageKey("tax_parts")) || 1); }
function setTaxParts(value) { localStorage.setItem(storageKey("tax_parts"), String(Number(value || 1))); }
function getArePercue() { return Number(localStorage.getItem(storageKey("are_percue")) || 0); }
function setArePercue(v) { localStorage.setItem(storageKey("are_percue"), String(Number(v || 0))); }
function getCongesSpectaclesInput() { return localStorage.getItem(storageKey("conges_spec")) || ""; }
function setCongesSpectaclesInput(v) { localStorage.setItem(storageKey("conges_spec"), String(v)); }
function getAutresFraisReels() { return Number(localStorage.getItem(storageKey("autres_frais")) || 0); }
function setAutresFraisReels(v) { localStorage.setItem(storageKey("autres_frais"), String(Number(v || 0))); }
// migrerProfilFiscalSite : l'ancienne clé 'artiste' devient 'comedien' (même résultat qu'avant, donc
// aucun chiffre ne bouge). Un lyrique ou un danseur devra se re-sélectionner — et y gagnera.
function getProfileType() { return migrerProfilFiscalSite(localStorage.getItem(storageKey("profile_type")) || "technicien"); }
function setProfileType(v) { localStorage.setItem(storageKey("profile_type"), v || "technicien"); }

function getTaxRate() { return Number(localStorage.getItem(storageKey("tax_rate")) || 0); }
function setTaxRate(value) { localStorage.setItem(storageKey("tax_rate"), String(Number(value || 0))); }
// Taux pour le calcul du NET À PAYER (modifiables par l'utilisateur, estimations)
function getChargeRate() { const v = localStorage.getItem(storageKey("charge_rate")); return v === null ? 22.5 : Number(v); } // % charges salariales
function setChargeRate(value) { localStorage.setItem(storageKey("charge_rate"), String(Number(value || 0))); }
function getPasRate() { return Number(localStorage.getItem(storageKey("pas_rate")) || 0); } // % prélèvement à la source (perso)
function setPasRate(value) { localStorage.setItem(storageKey("pas_rate"), String(Number(value || 0))); }

function getObservedMissionMonths(list) {
  const months = new Set(list.map((m) => String(m.date || "").slice(0, 7)).filter(Boolean));
  return months.size;
}

function estimateAnnualProjection(value, observedMonths) {
  const months = Math.max(0, Number(observedMonths || 0));
  if (!months) return 0;
  return Math.round((Number(value || 0) / months) * 12);
}

function estimateTaxableIncomeFromGross(grossAmount) {
  return Math.max(0, Math.round(Number(grossAmount || 0) * 0.78));
}

function calculateProgressiveTax(taxableIncome, parts) {
  const safeIncome = Math.max(0, Number(taxableIncome || 0));
  const safeParts = Math.max(0.5, Number(parts || 1));
  const incomePerPart = safeIncome / safeParts;
  const brackets = [
    { limit: 11600, rate: 0 },{ limit: 29579, rate: 0.11 },
    { limit: 84577, rate: 0.30 },{ limit: 181917, rate: 0.41 },{ limit: Infinity, rate: 0.45 }
  ];
  let previous = 0, taxPerPart = 0, marginalRate = 0;
  for (const bracket of brackets) {
    if (incomePerPart > previous) {
      const taxableSlice = Math.min(incomePerPart, bracket.limit) - previous;
      taxPerPart += taxableSlice * bracket.rate;
      if (taxableSlice > 0) marginalRate = bracket.rate;
    }
    if (incomePerPart <= bracket.limit) break;
    previous = bracket.limit;
  }
  const estimatedTax = Math.max(0, Math.round(taxPerPart * safeParts));
  const averageRate = safeIncome ? (estimatedTax / safeIncome) * 100 : 0;
  return { estimatedTax, averageRate, marginalRate: marginalRate * 100, incomePerPart };
}
function calculateEstimatedAreDailyRate() {
  const hours = Number($("itk-c1-nht")?.value || 0);
  const brutTotal = Number($("itk-c1-sr")?.value || 0);
  const csgTaux = $("itk-c1-csg")?.value || "plein";
  const err = $("itk-c1-err");
  const out = $("itk-c1-out");

  if (!hours || !brutTotal) {
    if (err) err.style.display = "block";
    if (out) out.classList.add("itk-hide");
    return;
  }
  if (err) err.style.display = "none";

  const AJ_MIN = 31.96;
  const NH = 507;
  const SMIC_H = 12.31;
  const PLAFOND = 174.80;
  const PLANCHER = 38;
  const SMIC_J = SMIC_H * 151.67 / 30;

  function ajBrut(h, sr) {
    const A = AJ_MIN * (0.42 * Math.min(sr, 14400) + 0.05 * Math.max(0, sr - 14400)) / 5000;
    const B = AJ_MIN * (0.26 * Math.min(h, 720) + 0.08 * Math.max(0, h - 720)) / NH;
    const C = AJ_MIN * 0.40;
    return Math.max(PLANCHER, Math.min(PLAFOND, A + B + C));
  }

  function ajNet(brut) {
    const retraite = brut * 0.03;
    const base = brut * 0.9825;
    let csg = base * (csgTaux === "plein" ? 0.062 : csgTaux === "reduit" ? 0.038 : 0);
    let crds = base * (csgTaux === "exonere" ? 0 : 0.005);
    if (brut - retraite - csg - crds < SMIC_J) { csg = 0; crds = 0; }
    return brut - retraite - csg - crds;
  }

  const brut = ajBrut(hours, brutTotal);
  const net = ajNet(brut);
  const sjr = brutTotal / (hours / 8);

  if ($("itk-c1-net")) $("itk-c1-net").textContent = net.toFixed(2).replace(".", ",") + " €";
  if ($("itk-c1-sjr")) $("itk-c1-sjr").textContent = sjr.toFixed(2).replace(".", ",") + " €";
  if ($("itk-c1-brut")) $("itk-c1-brut").textContent = brut.toFixed(2).replace(".", ",") + " €";
  if ($("itk-c1-detail")) $("itk-c1-detail").textContent =
    `AJ brut : ${brut.toFixed(2)}€ · Plafond : ${PLAFOND}€ · Plancher : ${PLANCHER}€ · SJR : ${sjr.toFixed(2)}€`;
  if ($("itk-c1-proj")) {
    const targets = [1,2,3].map(i => Math.round((hours + i*100)/100)*100);
    $("itk-c1-proj").innerHTML = targets.map(h =>
      `${h}h → ${ajNet(ajBrut(h, brutTotal)).toFixed(2).replace(".",",")} €/j net`
    ).join("<br>");
  }
  if (out) out.classList.remove("itk-hide");
}

function calculateCarence() {
  const nht = Number($("itk-c2-nht")?.value || 0);
  const prc = Number($("itk-c2-prc")?.value || 0);
  const jours = Number($("itk-c2-jours")?.value || 0);
  const mois = $("itk-c2-mois")?.value;
  const err = $("itk-c2-err");
  const out = $("itk-c2-out");

  if (!nht || !prc || !jours) {
    if (err) err.style.display = "block";
    if (out) out.classList.add("itk-hide");
    return;
  }
  if (err) err.style.display = "none";

  const SMIC_H = 12.31;
  const SMIC_MENS = SMIC_H * 151.67;
  const SMIC_JOUR = SMIC_MENS / 30;            // ≈ 62,24 €

  // lecture des deux boutons (annexe + déjà intermittent)
  const annexeBtn = document.querySelector("#itk-c2-annexe .itk-on");
  const diviseur = (annexeBtn && annexeBtn.dataset.a === "artiste") ? 10 : 8;
  const dejaBtn = document.querySelector("#itk-c2-deja .itk-on");
  const dejaInt = (dejaBtn && dejaBtn.dataset.v === "oui");

  // calculs corrigés
  const sjm   = prc / (nht / diviseur);
  const franchiseSal = Math.max(0, Math.round((prc / SMIC_MENS) * (sjm / (3 * SMIC_JOUR)) - 27));
  const franchiseCP  = Math.min(30, Math.floor((jours * 2.5) / 24));
  const delai = dejaInt ? 0 : 7;
  const totalCarence = delai + franchiseSal + franchiseCP;

  const MOIS = ["janvier","février","mars","avril","mai","juin",
                "juillet","août","septembre","octobre","novembre","décembre"];
  const moisLabel = mois
    ? (MOIS[Number(mois.split("-")[1]) - 1] + " " + mois.split("-")[0])
    : "—";

  if ($("itk-c2-smic"))  $("itk-c2-smic").textContent  = SMIC_H.toFixed(2).replace(".", ",") + " €/h";
  if ($("itk-c2-sjm"))   $("itk-c2-sjm").textContent   = sjm.toFixed(2).replace(".", ",") + " €/jour";
  if ($("itk-c2-delai")) $("itk-c2-delai").textContent = delai + " jours";
  if ($("itk-c2-fsal"))  $("itk-c2-fsal").textContent  = franchiseSal === 0 ? "0 jour" : franchiseSal + " jours";
  if ($("itk-c2-fcp"))   $("itk-c2-fcp").textContent   = franchiseCP + " jours (plafond 30j)";
  if ($("itk-c2-rmois")) $("itk-c2-rmois").textContent = moisLabel;
  if ($("itk-c2-rjours"))$("itk-c2-rjours").textContent = `Total carence estimée : ${totalCarence} jours`;

  // tableau mois par mois
  const tbody = $("itk-c2-tbody");
  if (tbody) {
    const debut = mois ? (Number(mois.split("-")[1]) - 1) : 0;
    const repartir = (t, max) => {
      const r = []; if (t <= 0) return r;
      const nb = Math.min(max, t), base = Math.floor(t / nb); let reste = t - base * nb;
      for (let i = 0; i < nb; i++) { r.push(base + (reste > 0 ? 1 : 0)); if (reste > 0) reste--; }
      return r;
    };
    const consoCP = (t) => {
      const f = t <= 24 ? 2 : 3, r = []; let reste = t;
      while (reste > 0) { const m = Math.min(f, reste); r.push(m); reste -= m; }
      return r;
    };
    const fsM = repartir(franchiseSal, 8), cpM = consoCP(franchiseCP);
    const n = Math.max(fsM.length, cpM.length, delai > 0 ? 1 : 0);
    let cumul = 0, html = "";
    for (let i = 0; i < n; i++) {
      const d = i === 0 ? delai : 0, f = fsM[i] || 0, c = cpM[i] || 0, tt = d + f + c;
      cumul += tt;
      html += `<tr><td style="text-transform:capitalize">${MOIS[(debut + i) % 12]}</td><td>${d || "—"}</td><td>${f || "—"}</td><td>${c || "—"}</td><td><strong>${tt}</strong></td><td>${cumul}</td></tr>`;
    }
    tbody.innerHTML = html;
  }

  if (out) out.classList.remove("itk-hide");
}

function monterWidgetParserDocuments() {
  const container = $("document-parser-container-documents");
  if (!container) return;
  container.innerHTML = `
    <div style="border:2px dashed #6c63ff;border-radius:12px;padding:20px;text-align:center;background:rgba(108,99,255,0.05);margin-bottom:20px;">
      <p style="font-weight:600;margin:0 0 8px;">📄 Importer un contrat ou fiche de paie</p>
      <p style="font-size:13px;color:#888;margin:0 0 12px;">PDF, JPG ou PNG — l'IA classe le document automatiquement</p>
      <input type="file" id="doc-input-documents" accept=".pdf,.jpg,.jpeg,.png" style="display:none">
      <button id="doc-btn-documents" type="button" style="padding:8px 20px;background:#1F4E5F;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px;">Choisir un fichier</button>
      <p id="doc-status-documents" style="margin-top:12px;font-size:13px;color:#888;"></p>
    </div>
  `;
  const input = $("doc-input-documents");
  const button = $("doc-btn-documents");
  const status = $("doc-status-documents");
  if (!input || !button || !status) return;
  button.addEventListener("click", () => input.click());
  input.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const ALLOWED_TYPES_IA = ["application/pdf","image/jpeg","image/png","image/webp"];
    if (!ALLOWED_TYPES_IA.includes(file.type)) {
      status.style.color = "#dc3545";
      status.textContent = "❌ Format non autorisé. Seuls les PDF et images sont acceptés.";
      input.value = ""; return;
    }
    status.textContent = "⏳ Analyse en cours…";
    button.disabled = true; button.style.opacity = "0.6";
    try {
      let data = null;
      if (typeof analyserDocument === "function") data = await analyserDocument(file);
      else if (typeof analyserDocumentAvecIa === "function") data = await analyserDocumentAvecIa(file);
      else if (typeof uploadEtAnalyserDocument === "function") data = await uploadEtAnalyserDocument(file);
      else throw new Error("Module IA introuvable.");
      if (!data) throw new Error("Aucune donnée détectée.");
      if (typeof sauvegarderDocumentDansRubrique === "function") await sauvegarderDocumentDansRubrique(file, data);
      else if (typeof classerDocumentDepuisIa === "function") await classerDocumentDepuisIa(file, data);
      else await classerDocumentAnalyseIa(file, data);
      status.style.color = "#28a745";
      status.textContent = "✅ Document analysé et classé automatiquement.";
      openDocumentProduction = data.production || data.employeur || data.societe || data.entreprise || openDocumentProduction;
      await loadDocuments(); renderDocuments();
    } catch (error) {
      console.error(error); status.style.color = "#dc3545";
      status.textContent = "❌ Erreur : " + error.message;
    } finally { button.disabled = false; button.style.opacity = "1"; input.value = ""; }
  });
}

async function classerDocumentAnalyseIa(file, data) {
  if (!currentUser) throw new Error("Connecte-toi avant d'ajouter un document.");
  const production = normalizeProductionName(data.production || data.employeur || data.societe || data.entreprise || "Sans production");
  const rawType = String(data.typeDocument || data.type_document || data.documentType || data.type || "").toLowerCase();
  let documentType = "Autre";
  if (rawType.includes("aem")) documentType = "AEM";
  else if (rawType.includes("paie") || rawType.includes("bulletin")) documentType = "Fiche de paie";
  else if (rawType.includes("congé") || rawType.includes("conge")) documentType = "Congés Spectacles";
  else if (rawType.includes("contrat") || rawType.includes("cddu")) documentType = "Contrat";
  const dateValue = data.dateDebut || data.date_debut || data.date || data.mission_date;
  const baseDate = dateValue ? new Date(dateValue + "T00:00:00") : new Date();
  const month = baseDate.getMonth() + 1;
  const year = baseDate.getFullYear();
  const cleanName = safeFileName(file.name);
  const filePath = `${currentUser.id}/${year}/${String(month).padStart(2, "0")}/${Date.now()}_${cleanName}`;
  const { error: uploadError } = await sb.storage.from("documents").upload(filePath, file, { cacheControl: "3600", upsert: false, contentType: file.type || "application/octet-stream" });
  if (uploadError) throw new Error("Erreur upload document : " + uploadError.message);
  const { error: insertError } = await sb.from("documents").insert({ user_id: currentUser.id, file_name: file.name, file_path: filePath, document_type: documentType, production, doc_month: month, doc_year: year, mime_type: file.type || null });
  if (insertError) { await sb.storage.from("documents").remove([filePath]); throw new Error("Erreur sauvegarde document : " + insertError.message); }
}

// ════════════════════════════════════════════════════════════════════════════
// BARÈME KILOMÉTRIQUE — revenus 2025. Copie conforme de intermitrack-mobile/lib/kmBareme.ts.
// NE PAS DIVERGER de l'appli.
//
// Vérifié sur deux sources primaires concordantes (16/07/2026) :
//   • BOFiP BOI-BAREME-000001 : https://bofip.impots.gouv.fr/bofip/2185-PGP.html
//   • Aide du simulateur DGFiP 2026 : https://simulateur-ir-ifi.impots.gouv.fr/calcul_impot/2026/aides/frais.htm
//
// L'ancien barème d'ici était faux : une seule option « Moto » appliquant le tarif des 1-2 CV à
// TOUTES les motos (3ᵉ coefficient en prime erroné, 0,234 au lieu de 0,248), les tranches VOITURE
// (5 000/20 000) plaquées sur des motos dont les tranches sont 3 000/6 000, et le MONTANT FIXE de la
// tranche intermédiaire purement ignoré — plus de 1 000 € oubliés pour une voiture entre 5 001 et
// 20 000 km, soit le cas le plus courant.
// ════════════════════════════════════════════════════════════════════════════
const KM_CAR = {
  "3": [{ upTo: 5000, coef: 0.529, add: 0 }, { upTo: 20000, coef: 0.316, add: 1065 }, { upTo: Infinity, coef: 0.370, add: 0 }],
  "4": [{ upTo: 5000, coef: 0.606, add: 0 }, { upTo: 20000, coef: 0.340, add: 1330 }, { upTo: Infinity, coef: 0.407, add: 0 }],
  "5": [{ upTo: 5000, coef: 0.636, add: 0 }, { upTo: 20000, coef: 0.357, add: 1395 }, { upTo: Infinity, coef: 0.427, add: 0 }],
  "6": [{ upTo: 5000, coef: 0.665, add: 0 }, { upTo: 20000, coef: 0.374, add: 1457 }, { upTo: Infinity, coef: 0.447, add: 0 }],
  "7": [{ upTo: 5000, coef: 0.697, add: 0 }, { upTo: 20000, coef: 0.394, add: 1515 }, { upTo: Infinity, coef: 0.470, add: 0 }],
};
// Motos de plus de 50 cm³ : tranches 3 000 / 6 000, et NON celles des voitures.
const KM_MOTO = {
  "1": [{ upTo: 3000, coef: 0.395, add: 0 }, { upTo: 6000, coef: 0.099, add: 891 }, { upTo: Infinity, coef: 0.248, add: 0 }],
  "3": [{ upTo: 3000, coef: 0.468, add: 0 }, { upTo: 6000, coef: 0.082, add: 1158 }, { upTo: Infinity, coef: 0.275, add: 0 }],
  "5": [{ upTo: 3000, coef: 0.606, add: 0 }, { upTo: 6000, coef: 0.079, add: 1583 }, { upTo: Infinity, coef: 0.343, add: 0 }],
};
const KM_CYCLO = [{ upTo: 3000, coef: 0.315, add: 0 }, { upTo: 6000, coef: 0.079, add: 711 }, { upTo: Infinity, coef: 0.198, add: 0 }];

const KM_VEHICLES = [
  { key: "car", label: "Voiture", hint: "Puissance fiscale : carte grise, case P.6." },
  { key: "moto", label: "Moto (+ de 50 cm³)", hint: "Puissance fiscale : carte grise, case P.6. Le barème moto a ses propres tranches." },
  { key: "cyclo", label: "Cyclomoteur (- de 50 cm³)", hint: "Moins de 50 cm³ : barème unique, pas de puissance à indiquer." },
];
const KM_CAR_CV = [{ key: "3", label: "3 CV et moins" }, { key: "4", label: "4 CV" }, { key: "5", label: "5 CV" }, { key: "6", label: "6 CV" }, { key: "7", label: "7 CV et plus" }];
const KM_MOTO_CV = [{ key: "1", label: "1 ou 2 CV" }, { key: "3", label: "3, 4 ou 5 CV" }, { key: "5", label: "Plus de 5 CV" }];

function kmPf(v) { const n = Number(String(v ?? "").replace(",", ".").replace(/\s/g, "")); return isFinite(n) ? n : 0; }
function kmTranchesFor(kind, cv) {
  if (kind === "cyclo") return KM_CYCLO;
  if (kind === "moto") return KM_MOTO[cv] || null;
  return KM_CAR[cv] || null;
}
// Frais ANNUELS selon le barème, majoration électrique comprise (+20 % depuis les revenus 2020).
function kmFraisAnnuels(kind, cv, kmAnnuel, electrique) {
  const t = kmTranchesFor(kind, cv);
  const km = Math.max(0, Number(kmAnnuel) || 0);
  if (!t || km <= 0) return 0;
  const tr = t.find(function (x) { return km <= x.upTo; }) || t[t.length - 1];
  const base = km * tr.coef + tr.add;
  return electrique ? base * 1.2 : base;
}
// Taux réel en €/km. Le barème est ANNUEL (montant fixe par tranche) alors qu'on calcule PAR MISSION :
// on ne peut pas ajouter ce montant à chaque mission. On applique donc barème(km annuels)/km annuels,
// ce qui fait retomber le total de l'année exactement sur le barème.
function kmTauxEffectif(kind, cv, kmAnnuel, electrique) {
  const km = Math.max(0, Number(kmAnnuel) || 0);
  if (km <= 0) return 0;
  return kmFraisAnnuels(kind, cv, km, electrique) / km;
}
// Migration des réglages d'avant le 16/07/2026 (km_cv '3'..'7'|'moto' + km_tranche '1'|'2'|'3').
// 'moto' devenait le barème 1-2 CV : on conserve ce comportement pour ne modifier les chiffres de
// personne sans qu'il le sache. La tranche devient un kilométrage au MILIEU de celle-ci — la seule
// valeur qui n'invente pas d'information.
function kmMigrerVehicule(oldCv, oldTranche) {
  const kind = oldCv === "moto" ? "moto" : "car";
  const cv = oldCv === "moto" ? "1" : (KM_CAR[String(oldCv || "")] ? String(oldCv) : "");
  const t = String(oldTranche || "1");
  const kmAnnuel = kind === "moto"
    ? (t === "2" ? 4500 : t === "3" ? 9000 : 1500)
    : (t === "2" ? 12500 : t === "3" ? 25000 : 2500);
  return { kind: kind, cv: cv, kmAnnuel: kmAnnuel };
}
// Libellé court du véhicule retenu, pour qu'on comprenne d'où sort le taux affiché.
function kmVehiculeLabel(kind, cv, kmAnnuel, electrique) {
  var v = (KM_VEHICLES.find(function (x) { return x.key === kind; }) || {}).label || "";
  var c = kind === "cyclo" ? "" : (((kind === "moto" ? KM_MOTO_CV : KM_CAR_CV).find(function (x) { return x.key === cv; }) || {}).label || "");
  return [v, c, kmAnnuel ? kmAnnuel.toLocaleString("fr-FR") + " km/an" : "", electrique ? "électrique" : ""].filter(Boolean).join(" · ");
}
// Véhicule du profil → taux réel. Une seule source pour tout le site.
function kmProfilTaux() {
  var p = (typeof _profil !== "undefined" && _profil) || {};
  var kind, cv, kmAnnuel;
  if (p.km_vehicle) { kind = p.km_vehicle; cv = p.km_cv || ""; kmAnnuel = Number(p.km_annual) || 0; }
  else { var m = kmMigrerVehicule(p.km_cv, p.km_tranche); kind = m.kind; cv = m.cv; kmAnnuel = p.km_cv ? m.kmAnnuel : 0; }
  var elec = !!p.km_electric;
  return { kind: kind, cv: cv, kmAnnuel: kmAnnuel, electrique: elec, taux: kmTauxEffectif(kind, cv, kmAnnuel, elec) };
}

// Nombre de jours travaillés (pour l'option "trajet chaque jour travaillé")
function kmNbDays() {
  const h = Number($("hours")?.value || 0);
  const s = $("date")?.value, e = $("endDate")?.value;
  let di = 1;
  if (s && e) { try { di = daysInclusive(new Date(s + "T00:00:00"), new Date(e + "T00:00:00")); } catch (_) {} }
  return Math.max(1, Math.min(di || 1, Math.round(h / 8) || 1));
}

// Distance de base plafonnée à 40 km (règle domicile-travail), sauf justification
function kmBaseDistance() {
  const d = kmPf($("kmDistance")?.value);
  return $("kmJustify")?.checked ? d : Math.min(d, 40);
}

// Distance effective comptée = base × (aller-retour) × (jours travaillés)
function kmEffectiveDistance() {
  const rt = $("kmRoundTrip")?.checked ? 2 : 1;
  const days = $("kmEveryDay")?.checked ? kmNbDays() : 1;
  return Math.round(kmBaseDistance() * rt * days);
}

// Taux €/km réellement utilisé : barème CV (selon tranche) sinon taux manuel
// Le taux saisi à la main l'emporte ; sinon, le taux réel issu du barème et du véhicule du profil.
function kmRateUsed() {
  const manuel = kmPf($("kmRate")?.value);
  return manuel > 0 ? manuel : kmProfilTaux().taux;
}

function calculateKmAmount() {
  return Math.round(kmEffectiveDistance() * kmRateUsed() * 100) / 100;
}

function updateKmPreview() {
  const preview = $("kmPreview");
  if (!preview) return;
  const base = kmBaseDistance();
  const eff = kmEffectiveDistance();
  const rt = $("kmRoundTrip")?.checked;
  const everyDay = $("kmEveryDay")?.checked;
  const justify = $("kmJustify")?.checked;
  const capped = !justify && kmPf($("kmDistance")?.value) > 40;
  const nbDays = kmNbDays();
  const manuel = kmPf($("kmRate")?.value);
  const veh = kmProfilTaux();

  // Avertissement plafond 40 km
  const warn = $("kmCapWarn");
  if (warn) warn.style.display = capped ? "block" : "none";

  // Le barème dépend du véhicule ET du kilométrage annuel, qui vivent dans « Mes informations » :
  // on ne les redemande plus ici, on rappelle seulement le taux retenu et d'où il vient.
  if (eff > 0 && manuel <= 0 && veh.taux <= 0) {
    preview.innerHTML = "👉 Renseigne ton véhicule et tes kilomètres annuels dans « Mes informations » (ou saisis un taux €/km) pour estimer les frais.";
    return;
  }
  let detail = "";
  if (rt || everyDay || capped) {
    detail = " = " + Math.round(base) + " km" + (capped ? " (plafond 40)" : "") + (rt ? " × 2 (A/R)" : "") + (everyDay ? " × " + nbDays + " j" : "");
  }
  const source = manuel > 0
    ? " · taux saisi à la main"
    : (veh.taux > 0 ? "<br><small style='opacity:.75;'>Barème : <strong>" + veh.taux.toFixed(3).replace(".", ",") + " €/km</strong> · " + escapeHtml(kmVehiculeLabel(veh.kind, veh.cv, veh.kmAnnuel, veh.electrique)) + " — modifiable dans « Mes informations ».</small>" : "");
  preview.innerHTML = "Distance comptée : <strong>" + eff + " km</strong>" + detail +
    "<br>Frais estimés : <strong>" + money(calculateKmAmount()) + "</strong>" + source;
}

// Autocomplétion d'adresse (API Adresse data.gouv.fr) avec suggestions cliquables + département
function attachAddressAutocomplete(input) {
  if (!input || input.dataset.acInit) return;
  input.dataset.acInit = "1";
  input.setAttribute("autocomplete", "off");
  const wrap = input.parentElement;
  if (wrap) wrap.style.position = "relative";
  const box = document.createElement("div");
  box.style.cssText = "position:absolute;left:0;right:0;top:100%;z-index:50;background:#fff;border:1px solid var(--border,#E5E8EB);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.12);margin-top:4px;overflow:hidden;display:none;";
  if (wrap) wrap.appendChild(box);
  const close = () => { box.style.display = "none"; box.innerHTML = ""; };
  let timer = null;

  input.addEventListener("input", () => {
    input.dataset.lon = ""; input.dataset.lat = ""; // texte modifié → ville à reconfirmer
    const q = input.value.trim();
    if (timer) clearTimeout(timer);
    if (q.length < 3) { close(); return; }
    timer = setTimeout(async () => {
      try {
        const r = await fetch("https://api-adresse.data.gouv.fr/search/?limit=6&q=" + encodeURIComponent(q));
        const j = await r.json();
        if (!j.features || !j.features.length) { close(); return; }
        box.innerHTML = "";
        j.features.forEach((f) => {
          const p = f.properties || {};
          const ctx = String(p.context || "");
          const dep = ctx.split(",")[0].trim();                       // n° de département
          const rest = ctx.split(",").slice(1).join(",").trim();      // nom + région
          const sub = (dep ? "Dépt " + dep : "") + (rest ? " · " + rest : "");
          const item = document.createElement("div");
          item.innerHTML = "<div style='font-weight:600;'>📍 " + escapeHtml(p.label || "") + "</div>" +
            (sub ? "<div style='font-size:12px;color:#12754A;font-weight:600;margin-top:2px;'>" + escapeHtml(sub) + "</div>" : "");
          item.style.cssText = "padding:10px 12px;cursor:pointer;font-size:14px;border-bottom:1px solid #F1F5F9;";
          item.addEventListener("mouseenter", () => { item.style.background = "#F1F5F9"; });
          item.addEventListener("mouseleave", () => { item.style.background = "#fff"; });
          item.addEventListener("mousedown", (e) => {
            e.preventDefault();
            input.value = p.label;
            input.dataset.lon = f.geometry.coordinates[0];
            input.dataset.lat = f.geometry.coordinates[1];
            close();
            // Remplir .value ne déclenche AUCUN événement, et on ne peut pas simuler une frappe :
            // le gestionnaire "input" ci-dessus effacerait les coordonnées qu'on vient de recevoir.
            // On émet donc un signal dédié, que le pop-up d'adresses écoute pour se rafraîchir.
            input.dispatchEvent(new CustomEvent("address-picked", { bubbles: true }));
          });
          box.appendChild(item);
        });
        box.style.display = "block";
      } catch (_) { close(); }
    }, 250);
  });
  input.addEventListener("blur", () => setTimeout(close, 150));
}

// Distance à vol d'oiseau (km) entre deux points GPS
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// Calcule automatiquement la distance (aller simple) entre lieu de départ et d'arrivée.
// L'aller-retour et les jours travaillés sont appliqués ensuite comme multiplicateurs.
async function calcKmFromAddresses() {
  const from = ($("kmFrom")?.value || "").trim();
  const to = ($("kmTo")?.value || "").trim();
  if (!from || !to) { toast("Renseigne le lieu de départ et le lieu d'arrivée."); return; }
  const btn = $("kmCalcBtn");
  const oldLabel = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "Calcul en cours…"; }
  try {
    const geocodeText = async (q) => {
      const r = await fetch("https://api-adresse.data.gouv.fr/search/?limit=1&q=" + encodeURIComponent(q));
      const j = await r.json();
      if (!j.features || !j.features.length) throw new Error("Adresse introuvable : " + q);
      return j.features[0].geometry.coordinates; // [lon, lat]
    };
    // Privilégie les coordonnées de la suggestion choisie (sinon géocode le texte)
    const coordsOf = async (input, q) =>
      (input && input.dataset.lon && input.dataset.lat)
        ? [Number(input.dataset.lon), Number(input.dataset.lat)]
        : geocodeText(q);
    const a = await coordsOf($("kmFrom"), from);
    const b = await coordsOf($("kmTo"), to);
    let km = null;
    try {
      const rr = await fetch(`https://router.project-osrm.org/route/v1/driving/${a[0]},${a[1]};${b[0]},${b[1]}?overview=false`);
      const rj = await rr.json();
      if (rj.routes && rj.routes[0]) km = rj.routes[0].distance / 1000;
    } catch (_) { /* repli ci-dessous */ }
    if (km == null) km = haversineKm(a[1], a[0], b[1], b[0]) * 1.3; // estimation routière
    km = Math.round(km);
    if ($("kmDistance")) $("kmDistance").value = km;
    updateKmPreview();
    toast("Distance estimée : " + km + " km (aller simple)", "success");
  } catch (err) {
    toast(err.message || "Impossible de calculer la distance.");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = oldLabel; }
  }
}

function setAuthMode(mode) {
  authMode = mode;
  $("authButton").textContent = mode === "login" ? "Se connecter" : "Créer mon compte";
  $("authMsg").textContent = mode === "login" ? "Mode : connexion" : "Mode : création de compte";
  if ($("forgotPwBtn")) $("forgotPwBtn").style.display = mode === "login" ? "" : "none";
}

// Envoie l'email de réinitialisation du mot de passe (site).
async function handleForgotPassword() {
  const email = ($("authEmail").value || "").trim();
  if (!email) { $("authMsg").textContent = "Entre d'abord ton email ci-dessus, puis reclique sur « Mot de passe oublié ? »."; return; }
  $("authMsg").textContent = "Envoi du lien de réinitialisation…";
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  if (error) { $("authMsg").textContent = "Erreur : " + error.message; return; }
  $("authMsg").textContent = "✅ Si un compte existe pour cet email, un lien vient d'être envoyé. Vérifie ta boîte mail (et tes spams).";
}

// Modale pour choisir un nouveau mot de passe après avoir cliqué le lien reçu par email.
function showResetPasswordModal() {
  let ov = document.getElementById("rpwOverlay");
  if (!ov) {
    const st = document.createElement("style");
    st.textContent = "#rpwOverlay{position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;align-items:center;justify-content:center;z-index:100070;padding:16px}#rpwOverlay.open{display:flex}.rpw-box{background:#fff;border-radius:18px;max-width:400px;width:100%;padding:22px;box-shadow:0 24px 60px rgba(0,0,0,.3);font-family:inherit}.rpw-box h3{margin:0 0 6px;color:#1F4E5F;font-size:18px}.rpw-box p{font-size:13px;color:#718096;margin:0 0 14px;line-height:1.4}.rpw-box input{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #E2E8F0;border-radius:10px;font-size:14px;margin-bottom:12px;font-family:inherit}.rpw-box button{width:100%;padding:12px;border:none;border-radius:11px;background:#1F4E5F;color:#fff;font-weight:800;cursor:pointer;font-family:inherit}.rpw-msg{font-size:13px;margin-top:10px;text-align:center}";
    document.head.appendChild(st);
    ov = document.createElement("div"); ov.id = "rpwOverlay";
    ov.innerHTML = '<div class="rpw-box"><h3>Nouveau mot de passe</h3><p>Choisis ton nouveau mot de passe (8 caractères minimum). Tu seras connecté juste après.</p><input id="rpwInput" type="password" placeholder="Nouveau mot de passe" minlength="8" autocomplete="new-password"><button id="rpwSave" type="button">Enregistrer</button><div class="rpw-msg" id="rpwMsg"></div></div>';
    document.body.appendChild(ov);
    ov.querySelector("#rpwSave").addEventListener("click", async () => {
      const p = ov.querySelector("#rpwInput").value; const msg = ov.querySelector("#rpwMsg");
      if (p.length < 8) { msg.textContent = "Minimum 8 caractères."; msg.style.color = "#DC2626"; return; }
      msg.textContent = "Enregistrement…"; msg.style.color = "#718096";
      const { error } = await sb.auth.updateUser({ password: p });
      if (error) { msg.textContent = "Erreur : " + error.message; msg.style.color = "#DC2626"; return; }
      msg.textContent = "✅ Mot de passe mis à jour ! Connexion…"; msg.style.color = "#15803d";
      setTimeout(() => { ov.classList.remove("open"); }, 1200);
    });
  }
  ov.classList.add("open");
}

function showAuth() {
  $("authBox").classList.remove("hidden");
  $("appBox").classList.add("hidden");
  $("userbar").classList.add("hidden");
  renderChart(0, 0);
}

function showApp() {
  $("authBox").classList.add("hidden");
  $("appBox").classList.remove("hidden");
  $("userbar").classList.remove("hidden");
  $("userEmail").textContent = currentUser?.email || "";
  // Initiales avatar
  const email = currentUser?.email || "";
  const parts = email.split("@")[0].replace(/[0-9]/g, "").match(/[a-zA-Z]+/g) || ["?"];
const initials = parts.length >= 2
  ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  : parts[0].slice(0, 2).toUpperCase();
  if ($("userInitials")) $("userInitials").textContent = initials;

  // Toggle dropdown
 if ($("accountAvatarBtn") && !$("accountAvatarBtn").dataset.init) {
    $("accountAvatarBtn").dataset.init = "1";
    // Le bottom sheet est enferme dans le header (.top est sticky z-index:90) : son fond sombre
    // passerait au-dessus et bloquerait les clics. On le sort dans <body> (contexte racine).
    if ($("accountDropdown") && $("accountDropdown").parentElement !== document.body) {
      document.body.appendChild($("accountDropdown"));
    }
    $("accountAvatarBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      const btn = $("accountAvatarBtn");
      const rect = btn.getBoundingClientRect();
      const dd = $("accountDropdown");
      // Bottom sheet (comme l'app) : le CSS gere le placement, on ne force plus top/right/left inline.
      dd.style.top = ""; dd.style.right = ""; dd.style.left = "";
      dd.classList.toggle("hidden");
    });
    document.addEventListener("click", () => {
      if ($("accountDropdown")) $("accountDropdown").classList.add("hidden");
    });
  }
if (typeof monterWidgetParser === "function") monterWidgetParser();
  if (typeof monterWidgetParserDocuments === "function") monterWidgetParserDocuments();
  
  const savedTheme = localStorage.getItem("intermitrack_theme") || "light";
  applyTheme(savedTheme);
  // Thème + « Donner mon avis » sont maintenant dans le menu des initiales.
  // Le bouton flottant sert au téléchargement de l'app (toujours visible).

  if (typeof initProfilFeature === "function") initProfilFeature();
  if (typeof _renderProdSwatches === "function") _renderProdSwatches();
}


async function init() {
  setDefaultDates();
  const { data: { session } } = await sb.auth.getSession();
  currentUser = session?.user || null;
  if (!currentUser) { showAuth(); return; }
  showApp();
  areAdmissionDate = localStorage.getItem(storageKey("areAdmissionDate")) || "";
  await loadMissions();
  await loadDocuments();
  await loadFactures();
  await loadFrais();
  await loadSocietes();
  render();
}

async function logout() {
  await sb.auth.signOut();
  currentUser = null; missions = []; documents = [];
  showAuth();
}

// Traduit les erreurs d'authentification Supabase en messages clairs
function authErrorMessage(msg) {
  const m = (msg || "").toLowerCase();
  if (m.includes("email not confirmed")) return "Ton adresse n'est pas encore confirmée. Clique sur le lien reçu par email (pense à vérifier tes spams), puis reconnecte-toi.";
  if (m.includes("invalid login credentials")) return "Email ou mot de passe incorrect.";
  if (m.includes("already registered") || m.includes("already been registered")) return "Un compte existe déjà avec cet email. Connecte-toi plutôt.";
  if (m.includes("rate limit") || m.includes("too many") || m.includes("over_email_send_rate")) return "Trop d'emails envoyés en peu de temps. Patiente quelques minutes avant de réessayer.";
  if (m.includes("password")) return "Mot de passe trop court (8 caractères minimum).";
  return "Erreur : " + msg;
}

async function loadMissions() {
  const { data, error } = await sb.from("missions").select("*").order("mission_date", { ascending: false });
  if (error) { toast("Erreur chargement missions : " + error.message); return; }
  missions = (data || []).map((x) => ({
    id: x.id, production: x.production, type: x.mission_type,
    date: x.mission_date, endDate: x.end_date || x.mission_date,
    hours: Number(x.hours || 0), gross: Number(x.gross_amount || 0),
    kmDistance: Number(x.km_distance || 0), kmRate: Number(x.km_rate || 0), kmAmount: Number(x.km_amount || 0),
    vacations: Number(x.vacations || Math.round((x.hours || 0) / 8)),
    emission: x.emission || "", lieu: x.lieu || "",
    regime: x.regime || "intermittence", cachet_days: x.cachet_days || null,
    is_cachet: x.is_cachet, // null pour les missions d'avant la colonne → repli sur l'heuristique
    net_reel: x.net_reel != null ? Number(x.net_reel) : null,
    heures_payees: x.heures_payees != null ? Number(x.heures_payees) : null, // heures payées (fiche de paie) vs heures faites
    // Adresses des frais km : enregistrées depuis le 15/07/2026 seulement. Avant, seuls
    // distance/taux/montant l'étaient — d'où « les adresses n'apparaissent pas à l'édition ».
    kmFrom: x.km_from || "", kmTo: x.km_to || "",
    kmFromLat: x.km_from_lat, kmFromLng: x.km_from_lng,
    kmToLat: x.km_to_lat, kmToLng: x.km_to_lng
  }));
  // Allocation France Travail réellement versée par mois (montants réels). try/catch : si la table
  // n'existe pas encore pour ce compte, l'appli continue sans planter.
  try {
    const { data: av } = await sb.from("are_versements").select("mois,montant");
    areVerse = {};
    (av || []).forEach((r) => { areVerse[r.mois] = Number(r.montant || 0); });
  } catch (_) {}
  render();
  if (typeof _tourMaybeStart === 'function') _tourMaybeStart();
}
// ARE réellement versé, par mois 'AAAA-MM' (rempli par loadMissions, saisi dans « Montants réels du mois »).
var areVerse = {};

// ===== Montants réels du mois (dashboard) — reproduction fidèle de l'app =====
var _reelSaving = false;
function _reelMoisKey(cur) { return cur.getFullYear() + "-" + String(cur.getMonth() + 1).padStart(2, "0"); }
// Regroupe les missions d'intermittence du mois par PRODUCTION (le net se saisit par prod, comme l'app).
function _reelGroups(list) {
  const groups = {};
  (list || []).forEach((m) => {
    if ((m.regime || "intermittence") !== "intermittence") return;
    const key = (String(m.production || "").trim().toUpperCase()) || "—";
    if (!groups[key]) groups[key] = { key, prod: m.production || "Sans nom", brut: 0, missions: [] };
    groups[key].brut += Number(m.gross || 0);
    groups[key].missions.push(m);
  });
  // Contrôle heures faites vs payées : seulement sur les missions À L'HEURE (techniciens).
  return Object.values(groups).map(function(g){
    g.techMissions = g.missions.filter(function(m){ return !missionIsCachet(m); });
    g.heuresFaites = Math.round(g.techMissions.reduce(function(a,m){ return a + (Number(m.hours)||0); },0)*10)/10;
    g.heuresPayeesSaved = Math.round(g.techMissions.reduce(function(a,m){ return a + (m.heures_payees!=null?Number(m.heures_payees):0); },0)*10)/10;
    g.hasHeuresPayees = g.techMissions.some(function(m){ return m.heures_payees!=null; });
    return g;
  });
}
function renderMontantsReels(list, cur) {
  const box = $("reelBox"); if (!box) return;
  const rowsEl = $("reelRows"); if (!rowsEl) return;
  const moisKey = _reelMoisKey(cur);
  box.dataset.mois = moisKey;
  const groups = _reelGroups(list);
  if (!groups.length) {
    rowsEl.innerHTML = '<div class="reel-empty">Aucune mission ce mois-ci.</div>';
  } else {
    rowsEl.innerHTML = groups.map((g) => {
      const saved = g.missions.reduce((a, m) => a + (m.net_reel != null ? Number(m.net_reel) : 0), 0);
      const hasNet = g.missions.some((m) => m.net_reel != null);
      const val = hasNet ? String(Math.round(saved * 100) / 100) : "";
      // Ligne « heures payées » : seulement s'il y a des missions à l'heure (techniciens).
      const showHeures = g.techMissions.length > 0;
      const hVal = g.hasHeuresPayees ? String(g.heuresPayeesSaved) : "";
      const ecart = g.hasHeuresPayees ? Math.round((g.heuresFaites - g.heuresPayeesSaved) * 10) / 10 : null;
      var heuresHtml = "";
      if (showHeures) {
        heuresHtml = '<div class="reel-heures"><span class="reel-heures-lbl">fait <strong>' + g.heuresFaites + ' h</strong> · payé</span>'
          + '<input class="reel-input reel-heures-in" inputmode="decimal" autocomplete="off" placeholder="h payées" value="' + hVal + '"/></div>';
        if (ecart != null && Math.abs(ecart) >= 0.5) {
          heuresHtml += '<div class="reel-ecart">' + (ecart > 0
            ? '⚠️ Il manque ' + ecart + ' h sur ta paie — à vérifier avec la compta'
            : 'On t\'a payé ' + Math.abs(ecart) + ' h de plus que déclaré') + '</div>';
        }
      }
      return '<div class="reel-group" data-prodkey="' + encodeURIComponent(g.key) + '">'
        + '<div class="reel-row">'
        + '<div style="flex:1;min-width:0;"><span class="reel-prod">' + escapeHtml(g.prod) + '</span>'
        + '<span class="reel-brut">brut ' + money(Math.round(g.brut)) + (g.missions.length > 1 ? " · " + g.missions.length + " missions" : "") + '</span></div>'
        + '<input class="reel-input reel-net" inputmode="decimal" autocomplete="off" placeholder="net €" value="' + val + '"/>'
        + '</div>' + heuresHtml
        + '</div>';
    }).join("");
  }
  const areEl = $("reelAreInput");
  if (areEl && document.activeElement !== areEl) areEl.value = (areVerse[moisKey] != null && areVerse[moisKey] !== 0) ? String(areVerse[moisKey]) : "";
  const netReelMonth = (list || []).filter((m) => (m.regime || "intermittence") === "intermittence").reduce((a, m) => a + (m.net_reel != null ? Number(m.net_reel) : 0), 0);
  const areMonth = Number(areVerse[moisKey] || 0);
  const hasReel = (list || []).some((m) => m.net_reel != null) || areMonth > 0;
  const tw = $("reelTotalWrap");
  if (tw) tw.innerHTML = hasReel
    ? '<div class="reel-total"><span class="reel-total-lbl">Total réel du mois</span><span class="reel-total-val">' + money(Math.round(netReelMonth + areMonth)) + '</span></div>'
      + '<div class="reel-sub">net réel ' + money(Math.round(netReelMonth)) + ' + allocation versée ' + money(Math.round(areMonth)) + '</div>'
    : "";
  if (!box.dataset.init) {
    box.dataset.init = "1";
    if ($("reelSaveBtn")) $("reelSaveBtn").addEventListener("click", saveAllReal);
    if ($("reelResetBtn")) $("reelResetBtn").addEventListener("click", resetReal);
  }
}
async function saveAllReal() {
  if (_reelSaving) return;
  const box = $("reelBox"); if (!box) return;
  const moisKey = box.dataset.mois; if (!moisKey) return;
  _reelSaving = true;
  const btn = $("reelSaveBtn"); if (btn) { btn.disabled = true; btn.textContent = "Enregistrement…"; }
  try {
    const { data: { user } } = await sb.auth.getUser();
    const cur = new Date(Number(moisKey.slice(0, 4)), Number(moisKey.slice(5, 7)) - 1, 1);
    const groups = _reelGroups(monthMissions(cur));
    const parseNet = (raw) => String(raw).trim() === "" ? null : (Number(String(raw).replace(",", ".")) || 0);
    const updates = [];
    const hUpdates = [];
    box.querySelectorAll(".reel-group[data-prodkey]").forEach((row) => {
      const key = decodeURIComponent(row.dataset.prodkey);
      const g = groups.find((x) => x.key === key); if (!g) return;
      const input = row.querySelector(".reel-net");
      if (input) {
        const total = parseNet(input.value);
        if (total === null) { g.missions.forEach((m) => updates.push({ id: m.id, net: null })); }
        else {
          const brutSum = g.missions.reduce((a, m) => a + Number(m.gross || 0), 0);
          g.missions.forEach((m) => {
            const share = brutSum > 0 ? Number(m.gross || 0) / brutSum : 1 / g.missions.length;
            updates.push({ id: m.id, net: Math.round(total * share * 100) / 100 });
          });
        }
      }
      // Heures payées (fiche de paie) réparties sur les missions à l'heure, au prorata des heures.
      const hInput = row.querySelector(".reel-heures-in");
      if (hInput && g.techMissions.length) {
        const th = parseNet(hInput.value);
        if (th === null) { g.techMissions.forEach((m) => hUpdates.push({ id: m.id, h: null })); }
        else {
          const hSum = g.techMissions.reduce((a, m) => a + Number(m.hours || 0), 0);
          g.techMissions.forEach((m) => {
            const share = hSum > 0 ? Number(m.hours || 0) / hSum : 1 / g.techMissions.length;
            hUpdates.push({ id: m.id, h: Math.round(th * share * 10) / 10 });
          });
        }
      }
    });
    for (const u of updates) { const { error } = await sb.from("missions").update({ net_reel: u.net }).eq("id", u.id); if (error) throw error; }
    // try/catch : colonne heures_payees pas encore migrée → on n'empêche pas l'enregistrement du net.
    try { for (const u of hUpdates) { const { error } = await sb.from("missions").update({ heures_payees: u.h }).eq("id", u.id); if (error) throw error; } } catch (e) {}
    const areEl = $("reelAreInput");
    const av = (!areEl || areEl.value.trim() === "") ? 0 : (Number(areEl.value.replace(",", ".")) || 0);
    if (user) {
      const r = av === 0
        ? await sb.from("are_versements").delete().eq("user_id", user.id).eq("mois", moisKey)
        : await sb.from("are_versements").upsert({ user_id: user.id, mois: moisKey, montant: av }, { onConflict: "user_id,mois" });
      if (r.error) throw r.error;
    }
    missions = missions.map((m) => { const u = updates.find((x) => x.id === m.id); const hu = hUpdates.find((x) => x.id === m.id); let nm = m; if (u) nm = Object.assign({}, nm, { net_reel: u.net }); if (hu) nm = Object.assign({}, nm, { heures_payees: hu.h }); return nm; });
    if (av === 0) delete areVerse[moisKey]; else areVerse[moisKey] = av;
    toast("Montants réels du mois mis à jour.");
    render();
  } catch (e) {
    toast("L'enregistrement n'a pas pu aboutir. Réessaie dans un instant.");
  } finally {
    _reelSaving = false;
    const b = $("reelSaveBtn"); if (b) { b.disabled = false; b.textContent = "Mettre à jour"; }
  }
}
function resetReal() {
  const box = $("reelBox"); if (!box) return;
  const moisKey = box.dataset.mois; if (!moisKey) return;
  _confirmModal({ title: "Réinitialiser ?", message: "Cela efface les montants réels saisis pour ce mois (nets + allocation). Ton brut et tes missions ne changent pas.", okLabel: "Réinitialiser", danger: true, onOk: function () {
  (async () => {
    try {
      const { data: { user } } = await sb.auth.getUser();
      const cur = new Date(Number(moisKey.slice(0, 4)), Number(moisKey.slice(5, 7)) - 1, 1);
      const list = monthMissions(cur).filter((m) => (m.regime || "intermittence") === "intermittence");
      for (const m of list) { if (m.net_reel != null) { const { error } = await sb.from("missions").update({ net_reel: null }).eq("id", m.id); if (error) throw error; } }
      try { for (const m of list) { if (m.heures_payees != null) { const { error } = await sb.from("missions").update({ heures_payees: null }).eq("id", m.id); if (error) throw error; } } } catch (e) {}
      if (user) await sb.from("are_versements").delete().eq("user_id", user.id).eq("mois", moisKey);
      missions = missions.map((m) => list.find((x) => x.id === m.id) ? Object.assign({}, m, { net_reel: null, heures_payees: null }) : m);
      delete areVerse[moisKey];
      toast("Montants du mois réinitialisés.");
      render();
    } catch (e) { toast("La réinitialisation a échoué. Réessaie."); }
  })();
  } });
}

async function loadDocuments() {
  if (!currentUser) return;
  const { data, error } = await sb.from("documents").select("*")
    .order("doc_year", { ascending: false }).order("doc_month", { ascending: false }).order("created_at", { ascending: false });
  if (error) { toast("Erreur chargement documents : " + error.message); return; }
  documents = data || [];
  renderDocuments();
}

function safeFileName(name) {
  return String(name || "document").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 90);
}

async function uploadDocument(event) {
  event.preventDefault();
  if (!currentUser) { toast("Connecte-toi avant d'ajouter un document."); return; }
  const fileInput = $("documentFile");
  const file = fileInput?.files?.[0];
  if (!file) { toast("Ajoute un fichier PDF ou une image."); return; }
  const type = $("documentType").value;
  const production = $("documentProduction").value.trim();
  const month = Number($("documentMonth").value);
  const year = Number($("documentYear").value);
  if (!production || !month || !year) { toast("Complète le type, la production, le mois et l'année."); return; }
  const ALLOWED_TYPES = ["application/pdf","image/jpeg","image/png","image/webp","image/gif"];
  if (!ALLOWED_TYPES.includes(file.type)) { toast("Format non autorisé. Seuls les PDF et images sont acceptés."); return; }
  const submitBtn = $("documentSubmitBtn");
  if (submitBtn) submitBtn.textContent = "Envoi en cours...";
  const cleanName = safeFileName(file.name);
  const filePath = `${currentUser.id}/${year}/${String(month).padStart(2, "0")}/${Date.now()}_${cleanName}`;
  const { error: uploadError } = await sb.storage.from("documents").upload(filePath, file, { cacheControl: "3600", upsert: false, contentType: file.type || "application/octet-stream" });
  if (uploadError) { if (submitBtn) submitBtn.textContent = "Ajouter le document"; toast("Erreur upload document : " + uploadError.message); return; }
  const { error: insertError } = await sb.from("documents").insert({ user_id: currentUser.id, file_name: file.name, file_path: filePath, document_type: type, production, doc_month: month, doc_year: year, mime_type: file.type || null });
  if (insertError) { await sb.storage.from("documents").remove([filePath]); if (submitBtn) submitBtn.textContent = "Ajouter le document"; toast("Erreur sauvegarde document : " + insertError.message); return; }
  $("documentForm").reset(); setDefaultDates();
  if (submitBtn) submitBtn.textContent = "Ajouter le document";
  await loadDocuments();
}

async function getDocumentSignedUrl(filePath) {
  const { data, error } = await sb.storage.from("documents").createSignedUrl(filePath, 120);
  if (error) { toast("Erreur ouverture document : " + error.message); return null; }
  return data.signedUrl;
}

async function openDocument(filePath) {
  const url = await getDocumentSignedUrl(filePath);
  if (!url) return;
  window.open(url, "_blank");
}

async function downloadDocument(filePath, fileName) {
  const url = await getDocumentSignedUrl(filePath);
  if (!url) return;
  const link = document.createElement("a");
  link.href = url; link.download = fileName || "document";
  document.body.appendChild(link); link.click(); link.remove();
}

async function deleteDocument(id, filePath) {
  if (!(await confirmDialog("Supprimer ce document ?"))) return;
  const { error: storageError } = await sb.storage.from("documents").remove([filePath]);
  if (storageError) { toast("Erreur suppression fichier : " + storageError.message); return; }
  const { error: dbError } = await sb.from("documents").delete().eq("id", id);
  if (dbError) { toast("Erreur suppression document : " + dbError.message); return; }
  await loadDocuments();
}

function monthName(monthNumber) {
  return new Date(2026, Number(monthNumber) - 1, 1).toLocaleDateString("fr-FR", { month: "long" });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

function renderDocuments() {
  const container = $("documentsList");
  if (!container) return;
  if (!documents.length) { container.innerHTML = `<div class="empty">Aucun document enregistré pour le moment.</div>`; return; }
  const sorted = [...documents].sort((a, b) => {
    if (String(a.production).localeCompare(String(b.production), "fr") !== 0) return String(a.production).localeCompare(String(b.production), "fr");
    if (b.doc_year !== a.doc_year) return b.doc_year - a.doc_year;
    if (b.doc_month !== a.doc_month) return b.doc_month - a.doc_month;
    return String(a.document_type).localeCompare(String(b.document_type), "fr");
  });
  const groups = {};
  sorted.forEach((doc) => {
    const production = normalizeProductionName(doc.production || "Sans production");
    if (!groups[production]) groups[production] = [];
    groups[production].push(doc);
  });

  if (!openDocumentProduction) {
    const isMobile = window.innerWidth <= 720;
    const perPage = isMobile ? DOCS_PER_PAGE_MOBILE : DOCS_PER_PAGE_DESKTOP;
    const keys = Object.keys(groups).sort((a, b) => a.localeCompare(b, "fr"));
    const totalPages = Math.max(1, Math.ceil(keys.length / perPage));
    if (documentsPage > totalPages) documentsPage = totalPages;
    if (documentsPage < 1) documentsPage = 1;
    const visibleKeys = keys.slice((documentsPage - 1) * perPage, documentsPage * perPage);
    container.innerHTML = `
      <div class="document-folder-grid document-folder-grid-pro">
        ${visibleKeys.map((production) => {
          const list = groups[production];
          const counts = list.reduce((acc, doc) => { acc[doc.document_type] = (acc[doc.document_type] || 0) + 1; return acc; }, {});
          const latest = [...list].sort((a, b) => { if (b.doc_year !== a.doc_year) return b.doc_year - a.doc_year; return b.doc_month - a.doc_month; })[0];
          const types = Object.keys(counts).sort();
          return `
            <button class="document-folder-card document-folder-card-pro" type="button" data-doc-production-open="${escapeHtml(production)}">
              <div class="document-folder-icon">📄</div>
              <div class="document-folder-main"><strong>${escapeHtml(production)}</strong><span>${list.length} document${list.length > 1 ? "s" : ""}</span></div>
              <div class="document-folder-tags">${types.slice(0, 4).map((type) => `<em>${escapeHtml(type)} · ${counts[type]}</em>`).join("")}</div>
              <small>Dernier ajout : ${latest ? `${escapeHtml(monthName(latest.doc_month))} ${escapeHtml(latest.doc_year)}` : "—"}</small>
            </button>
          `;
        }).join("")}
      </div>
      ${totalPages > 1 ? `
        <div class="history-pagination">
          <button class="ghost" type="button" id="docsPrev" ${documentsPage === 1 ? "disabled" : ""}>‹</button>
          <span>Page ${documentsPage} / ${totalPages}</span>
          <button class="ghost" type="button" id="docsNext" ${documentsPage >= totalPages ? "disabled" : ""}>›</button>
        </div>
      ` : ""}
    `;
    if ($("docsPrev")) $("docsPrev").addEventListener("click", () => { documentsPage--; renderDocuments(); });
    if ($("docsNext")) $("docsNext").addEventListener("click", () => { documentsPage++; renderDocuments(); });
    return;
  }

  const productionDocs = groups[openDocumentProduction] || [];
  const filters = ["Tous","AEM","Fiche de paie","Congés Spectacles","Contrat","Autre"];
  const filteredDocs = documentFilter === "Tous" ? productionDocs : productionDocs.filter((doc) => doc.document_type === documentFilter);
  container.innerHTML = `
    <div class="document-detail-head document-detail-head-pro">
      <button class="ghost" type="button" data-doc-production-back>‹ Retour aux productions</button>
      <div><h2>${escapeHtml(openDocumentProduction)}</h2><p class="sub">${productionDocs.length} document${productionDocs.length > 1 ? "s" : ""} classé${productionDocs.length > 1 ? "s" : ""}</p></div>
    </div>
    <div class="document-filter-bar document-filter-bar-pro">
      ${filters.map((filter) => `<button class="doc-filter ${documentFilter === filter ? "active" : ""}" type="button" data-doc-filter="${escapeHtml(filter)}">${escapeHtml(filter)}</button>`).join("")}
    </div>
    <div class="documents-card-grid">
      ${filteredDocs.length ? filteredDocs.map((doc) => `
        <div class="document-card document-card-pro">
          <div class="document-file-icon">${escapeHtml(String(doc.document_type || "Doc").slice(0, 3).toUpperCase())}</div>
          <div class="document-card-content">
            <div class="document-card-head">
              <div><strong>${escapeHtml(doc.document_type)} · ${escapeHtml(doc.production)}</strong><span>${escapeHtml(monthName(doc.doc_month))} ${escapeHtml(doc.doc_year)}</span></div>
              <span class="pill">${escapeHtml(doc.document_type)}</span>
            </div>
            <p class="document-file-name">${escapeHtml(doc.file_name)}</p>
            <div class="document-actions">
              <button class="ghost" type="button" data-doc-open="${escapeHtml(doc.file_path)}">Ouvrir</button>
              <button class="ghost" type="button" data-doc-download="${escapeHtml(doc.file_path)}" data-doc-name="${escapeHtml(doc.file_name)}">Télécharger</button>
              <button class="delete" type="button" data-doc-delete="${escapeHtml(doc.id)}" data-doc-path="${escapeHtml(doc.file_path)}">Supprimer</button>
            </div>
          </div>
        </div>
      `).join("") : `<div class="empty">Aucun document dans ce filtre.</div>`}
    </div>
  `;
}

// ===== Notifications douces (toasts) + confirmation stylée (remplacent alert/confirm gris) =====
function _ensureToastDom(){
  if (document.getElementById("toastWrap")) return;
  const style = document.createElement("style");
  style.textContent = "#toastWrap{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:100101;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;}.toast{pointer-events:auto;min-width:200px;max-width:90vw;padding:13px 18px;border-radius:13px;font-size:13.5px;font-weight:700;color:#fff;box-shadow:0 8px 28px rgba(31,78,95,.22);display:flex;align-items:center;gap:9px;white-space:pre-line;font-family:inherit;animation:tIn .25s ease;}.toast.success{background:#2F6B47;}.toast.error{background:#DC2626;}.toast.warn{background:#1F4E5F;}.toast.out{animation:tOut .3s ease forwards;}@keyframes tIn{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:translateY(0);}}@keyframes tOut{to{opacity:0;transform:translateY(12px);}}#appConfirmOverlay{position:fixed;inset:0;background:rgba(0,0,0,.45);display:none;align-items:center;justify-content:center;z-index:100100;padding:16px;}#appConfirmOverlay.open{display:flex;}.ac-box{background:#fff;border-radius:18px;max-width:380px;width:100%;padding:22px;box-shadow:0 24px 60px rgba(0,0,0,.25);font-family:inherit;}.ac-title{font-size:16px;font-weight:800;color:#1F4E5F;margin-bottom:8px;}.ac-msg{font-size:14px;color:#2D3748;line-height:1.5;margin-bottom:20px;}.ac-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;}.ac-cancel{padding:12px;border:1px solid #E2E8F0;background:#F5F7F6;color:#718096;border-radius:11px;font-weight:700;cursor:pointer;font-family:inherit;}.ac-ok{padding:12px;border:none;background:#1F4E5F;color:#fff;border-radius:11px;font-weight:800;cursor:pointer;font-family:inherit;}";
  document.head.appendChild(style);
  const wrap = document.createElement("div"); wrap.id = "toastWrap"; document.body.appendChild(wrap);
  const ov = document.createElement("div"); ov.id = "appConfirmOverlay";
  ov.innerHTML = '<div class="ac-box"><div class="ac-title">Confirmation</div><div class="ac-msg" id="appConfirmMsg"></div><div class="ac-actions"><button type="button" class="ac-cancel" id="appConfirmNo">Annuler</button><button type="button" class="ac-ok" id="appConfirmYes">Confirmer</button></div></div>';
  document.body.appendChild(ov);
  ov.addEventListener("click", function(e){ if (e.target === ov) _confirmClose(false); });
  document.getElementById("appConfirmYes").addEventListener("click", function(){ _confirmClose(true); });
  document.getElementById("appConfirmNo").addEventListener("click", function(){ _confirmClose(false); });
}

function toast(msg, type){
  _ensureToastDom();
  let t = type;
  if (!t){ if (/^✅/.test(msg)) t = "success"; else if (/erreur/i.test(msg)) t = "error"; else t = "warn"; }
  const icon = t === "success" ? "✅" : t === "error" ? "⚠️" : "ℹ️";
  const clean = String(msg).replace(/^✅\s*/, "");
  const el = document.createElement("div");
  el.className = "toast " + t;
  const i = document.createElement("span"); i.textContent = icon;
  const s = document.createElement("span"); s.textContent = clean;
  el.appendChild(i); el.appendChild(s);
  document.getElementById("toastWrap").appendChild(el);
  setTimeout(function(){ el.classList.add("out"); setTimeout(function(){ el.remove(); }, 320); }, 3200);
}

let _appConfirmResolve = null;
function confirmDialog(msg){
  _ensureToastDom();
  return new Promise(function(resolve){
    _appConfirmResolve = resolve;
    document.getElementById("appConfirmMsg").textContent = msg;
    document.getElementById("appConfirmOverlay").classList.add("open");
  });
}
function _confirmClose(val){
  const ov = document.getElementById("appConfirmOverlay");
  if (ov) ov.classList.remove("open");
  if (_appConfirmResolve){ _appConfirmResolve(val); _appConfirmResolve = null; }
}

async function addMission(event) {
  event.preventDefault();
  if (!currentUser) { toast("Connecte-toi avant d'ajouter une mission."); return; }
  // Le champ production est masqué (on passe par le pop-up) : le navigateur ne peut plus le valider,
  // c'est donc ici qu'on le contrôle. Sans ça, on enregistrerait une mission sans production.
  if (!String($("production").value || "").trim()) { toast("Indique la production."); return; }
  if ($("endDate").value < $("date").value) { toast("La date de fin ne peut pas être avant la date de début."); return; }

  // Jours travaillés déjà choisis via le pop-up pour cette période → enregistrement réparti
  if (!editingMissionId && _mdpData && _mdpData.start === $("date").value && _mdpData.end === $("endDate").value) {
    await _mdpSaveBreakdown();
    return;
  }
  const cachetMode = (_missionMode === 'cachet');
  // Période de 2 jours ou plus (mode HEURES uniquement) → pop-up des jours travaillés
  if (!cachetMode && !editingMissionId && $("date").value && $("endDate").value &&
      daysInclusive(new Date($("date").value+"T00:00:00"), new Date($("endDate").value+"T00:00:00")) > 1) {
    openMultiDayPicker($("date").value, $("endDate").value);
    return;
  }
  // Mode cachet (artiste) : les cachets se convertissent en heures pour les 507 h (1 cachet = 12 h) + heures en plus éventuelles.
  let _hours, _vac;
  if (cachetMode) {
    const cachets = Number($("cachetInput").value) || 0;
    if (cachets <= 0) { toast("Indique le nombre de cachets."); return; }
    const extra = Number($("hours").value) || 0;
    _hours = Math.round((cachets * CACHET_H + extra) * 10) / 10;
    _vac = cachets;
  } else {
    _hours = Number($("hours").value);
    _vac = Number($("vacations").value) || Math.round((Number($("hours").value)||0)/8);
  }
  const payload = {
    user_id: currentUser.id, production: normalizeProductionName($("production").value),
    emission: $("emission")?.value || "", lieu: $("lieu")?.value || "",
    mission_type: $("type").value, mission_date: $("date").value, end_date: $("endDate").value,
    hours: _hours, gross_amount: Number($("gross").value),
    vacations: _vac, regime: _missionRegime, is_cachet: cachetMode,
    km_distance: kmEffectiveDistance(), km_rate: (kmPf($("kmRate")?.value) || 0), km_amount: calculateKmAmount(),
    // Adresses enfin enregistrées (+ coords) : elles alimentent le pop-up des prochaines missions
    // et réapparaissent à l'édition. Avant, seuls distance/taux/montant étaient sauvegardés.
    km_from: ($("kmFrom").value || "").trim() || null,
    km_to: ($("kmTo").value || "").trim() || null,
    km_from_lat: Number($("kmFrom").dataset.lat) || null, km_from_lng: Number($("kmFrom").dataset.lon) || null,
    km_to_lat: Number($("kmTo").dataset.lat) || null, km_to_lng: Number($("kmTo").dataset.lon) || null
  };
  setProductionColorHex(payload.production, selectedProdColor === 'default' ? null : selectedProdColor);
  let result;
  if (editingMissionId) result = await sb.from("missions").update(payload).eq("id", editingMissionId);
  else result = await sb.from("missions").insert(payload);
  const { error } = result;
  if (error) { toast("Erreur sauvegarde : " + error.message); return; }
  // Mémorise le prix/jour appris pour (prod + poste).
  _rememberPrice(payload.production, payload.mission_type, (Number(payload.gross_amount)||0)/Math.max(1, _vac||1));
  await _afterMissionSave(payload.mission_date);
}

// Étapes communes après l'enregistrement d'une (ou plusieurs) mission(s)
async function _afterMissionSave(firstDate) {
  _mdpData = null;
  var _hl = document.querySelector('label[for="hours"]'); if (_hl) _hl.textContent = "Nombre d'heures cumulées sur la période";
  $("missionForm").reset();
  _syncProdBtn(); // reset() vide le champ masqué : sans ça le bouton afficherait encore l'ancienne production
  editingMissionId = null;
  _setMissionRegime("intermittence"); // sinon le formulaire resterait bloqué en « régime général » pour la mission suivante
  const submitBtn = document.querySelector("#missionForm button[type='submit']");
  if (submitBtn) submitBtn.textContent = "Enregistrer la mission";
  setDefaultDates(); updateKmPreview();
  current = new Date(firstDate + "T00:00:00");
  current.setDate(1);
  await loadMissions();
  activateView("calendar");
}

// ===== Sélecteur des jours travaillés (période de 3 jours ou plus) =====
let _mdpData = null;

function _iso(d){ return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); }
function _frDay(ds){ return new Date(ds + "T00:00:00").toLocaleDateString("fr-FR",{weekday:"long",day:"2-digit",month:"long"}); }
function _isNextDay(aStr,bStr){ const a=new Date(aStr+"T00:00:00"); a.setDate(a.getDate()+1); return _iso(a)===bStr; }

function _mdpEnsureDom(){
  if (document.getElementById("mdpOverlay")) return;
  const style = document.createElement("style");
  style.textContent = "#mdpOverlay{position:fixed;inset:0;background:rgba(0,0,0,.45);display:none;align-items:center;justify-content:center;z-index:100000;padding:16px;}#mdpOverlay.open{display:flex;}.mdp-box{background:#fff;border-radius:20px;max-width:460px;width:100%;max-height:88vh;overflow-y:auto;padding:22px;box-shadow:0 24px 60px rgba(0,0,0,.25);font-family:inherit;}.mdp-title{font-size:18px;font-weight:800;color:#1F4E5F;margin:0 0 4px;}.mdp-sub{font-size:13px;color:#718096;margin:0 0 14px;line-height:1.4;}.mdp-tools{display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;}.mdp-tool{padding:8px 12px;border:1px solid #E2E8F0;background:#fff;color:#1F4E5F;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;}.mdp-tool:hover{background:#EEF4F1;}.mdp-fill{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12.5px;font-weight:700;color:#1F4E5F;background:#F5F7F6;border-radius:11px;padding:9px 12px;margin-bottom:14px;}.mdp-fill-input{width:66px;padding:6px 8px;border:1px solid #E2E8F0;border-radius:9px;font-size:13px;text-align:right;font-family:inherit;}.mdp-day{display:flex;align-items:center;gap:11px;padding:9px 11px;border:1px solid #E2E8F0;border-radius:12px;margin-bottom:7px;}.mdp-day.off{opacity:.5;}.mdp-day input[type=checkbox]{width:19px;height:19px;accent-color:#1F4E5F;cursor:pointer;flex-shrink:0;}.mdp-day-label{flex:1;font-size:13.5px;font-weight:700;color:#2D3748;text-transform:capitalize;}.mdp-hours{width:74px;padding:7px 9px;border:1px solid #E2E8F0;border-radius:9px;font-size:13px;text-align:right;font-family:inherit;}.mdp-hours-u{font-size:11px;color:#718096;}.mdp-total{background:#EEF4F1;border-radius:11px;padding:11px 14px;font-size:13px;font-weight:700;color:#1F4E5F;margin:6px 0 16px;}.mdp-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;}.mdp-cancel{padding:12px;border:1px solid #E2E8F0;background:#F5F7F6;color:#718096;border-radius:11px;font-weight:700;cursor:pointer;font-family:inherit;}.mdp-ok{padding:12px;border:none;background:#1F4E5F;color:#fff;border-radius:11px;font-weight:800;cursor:pointer;font-family:inherit;}";
  document.head.appendChild(style);
  const ov = document.createElement("div");
  ov.id = "mdpOverlay";
  ov.innerHTML = '<div class="mdp-box"><div class="mdp-title">Quels jours as-tu travaillés ?</div><div class="mdp-sub" id="mdpSub"></div><div class="mdp-tools"><button type="button" class="mdp-tool" id="mdpAll">Tout cocher</button><button type="button" class="mdp-tool" id="mdpNone">Tout décocher</button></div><div class="mdp-fill">Tous les jours cochés à : <button type="button" class="mdp-tool" data-mdp-quick="4">4h</button><button type="button" class="mdp-tool" data-mdp-quick="8">8h</button><button type="button" class="mdp-tool" data-mdp-quick="10">10h</button><button type="button" class="mdp-tool" data-mdp-quick="12">12h</button></div><div id="mdpList"></div><div class="mdp-total" id="mdpTotal"></div><div class="mdp-actions"><button type="button" class="mdp-cancel" id="mdpCancel">Annuler</button><button type="button" class="mdp-ok" id="mdpOk">Continuer →</button></div></div>';
  document.body.appendChild(ov);
  ov.addEventListener("click", function(e){ if(e.target===ov){ _mdpData=null; _mdpClose(); } });
  document.getElementById("mdpCancel").addEventListener("click", function(){ _mdpData=null; _mdpClose(); });
  document.getElementById("mdpAll").addEventListener("click", function(){ _mdpSetAll(true); });
  document.getElementById("mdpNone").addEventListener("click", function(){ _mdpSetAll(false); });
  ov.querySelectorAll("[data-mdp-quick]").forEach(function(b){ b.addEventListener("click", function(){ if(!_mdpData) return; var v = Number(b.dataset.mdpQuick); _mdpData.days.forEach(function(d){ if(d.checked) d.hours = v; }); _mdpRender(); }); });
  document.getElementById("mdpOk").addEventListener("click", _mdpContinue);
}

function openMultiDayPicker(startStr, endStr){
  _mdpEnsureDom();
  const start = new Date(startStr + "T00:00:00"), end = new Date(endStr + "T00:00:00");
  const days = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) days.push(_iso(d));
  _mdpData = {
    start: startStr, end: endStr,
    days: days.map(function(ds){ return { date: ds, checked: true, hours: _jourH() }; })
  };
  document.getElementById("mdpSub").textContent = "Coche/décoche les jours travaillés. Chaque jour démarre à " + _jourH() + "h — ajuste si besoin. Le total se reportera dans le formulaire.";
  _mdpRender();
  document.getElementById("mdpOverlay").classList.add("open");
}

function _mdpRender(){
  const list = document.getElementById("mdpList");
  list.innerHTML = _mdpData.days.map(function(day, idx){
    return '<div class="mdp-day ' + (day.checked ? '' : 'off') + '">' +
      '<input type="checkbox" ' + (day.checked ? 'checked' : '') + ' data-mdp-check="' + idx + '"/>' +
      '<div class="mdp-day-label">' + _frDay(day.date) + '</div>' +
      '<input class="mdp-hours" type="number" min="0" step="0.5" value="' + day.hours + '" data-mdp-hours="' + idx + '" ' + (day.checked ? '' : 'disabled') + '/>' +
      '<span class="mdp-hours-u">h</span></div>';
  }).join("");
  list.querySelectorAll("[data-mdp-check]").forEach(function(cb){
    cb.addEventListener("change", function(e){ _mdpData.days[+e.target.dataset.mdpCheck].checked = e.target.checked; _mdpRender(); });
  });
  list.querySelectorAll("[data-mdp-hours]").forEach(function(inp){
    inp.addEventListener("input", function(e){ _mdpData.days[+e.target.dataset.mdpHours].hours = Number(e.target.value) || 0; _mdpUpdateTotal(); });
  });
  _mdpUpdateTotal();
}

function _mdpUpdateTotal(){
  const checked = _mdpData.days.filter(function(d){ return d.checked; });
  const h = checked.reduce(function(s,d){ return s + (Number(d.hours) || 0); }, 0);
  document.getElementById("mdpTotal").textContent = "Total : " + (Math.round(h*10)/10) + " h sur " + checked.length + " jour" + (checked.length>1 ? "s" : "");
}

// Répartit automatiquement le total d'heures saisi à parts égales entre les jours cochés.
function _mdpRedistribute(){
  if (!_mdpData) return;
  const checked = _mdpData.days.filter(function(d){ return d.checked; });
  if (!checked.length) return;
  const per = Math.round((_mdpData.totalHours / checked.length) * 10) / 10;
  _mdpData.days.forEach(function(d){ if (d.checked) d.hours = per; });
}

function _mdpSetAll(val){ _mdpData.days.forEach(function(d){ d.checked = val; }); _mdpRender(); }

// Applique la valeur "heures par jour" à tous les jours cochés (confort ; reste modifiable jour par jour)
function _mdpApplyDefault(){
  const v = Number(document.getElementById("mdpDefault").value) || 0;
  _mdpData.days.forEach(function(d){ if (d.checked) d.hours = v; });
  _mdpRender();
}

function _mdpClose(){ const ov = document.getElementById("mdpOverlay"); if (ov) ov.classList.remove("open"); }

// « Continuer » : reporte le total des jours travaillés dans le formulaire, garde _mdpData
function _mdpContinue(){
  const checked = _mdpData.days.filter(function(d){ return d.checked; });
  if (!checked.length) { toast("Coche au moins un jour travaillé."); return; }
  const sumHours = checked.reduce(function(s,d){ return s + (Number(d.hours) || 0); }, 0);
  $("hours").value = sumHours;
  if ($("vacations")) $("vacations").value = checked.length;
  const lbl = document.querySelector('label[for="hours"]');
  if (lbl) lbl.textContent = "Heures cumulées — " + checked.length + " jour" + (checked.length>1?"s":"") + " travaillé" + (checked.length>1?"s":"");
  _mdpClose();
}

// Enregistrement réparti (appelé à la validation du formulaire) : lit le brut/production du formulaire
async function _mdpSaveBreakdown(){
  const checked = _mdpData.days.filter(function(d){ return d.checked; });
  if (!checked.length) { toast("Coche au moins un jour travaillé."); return; }
  const sumHours = checked.reduce(function(s,d){ return s + (Number(d.hours) || 0); }, 0);
  const totalGross = Number($("gross").value) || 0;
  const production = normalizeProductionName($("production").value);
  const emission = $("emission") ? $("emission").value : "";
  const lieu = $("lieu") ? $("lieu").value : "";
  const type = $("type").value;
  const km_distance = kmEffectiveDistance(), km_rate = (kmPf($("kmRate")?.value) || 0), km_amount = calculateKmAmount();
  const runs = [];
  let cur = null;
  for (const d of _mdpData.days){
    if (!d.checked){ cur = null; continue; }
    // On regroupe les jours CONSÉCUTIFS en UNE seule mission même si un jour a des heures différentes
    // (retour Youn/Timothée : « 1 ligne suffit »). On SOMME les heures au lieu de supposer un nombre
    // d'heures uniforme. Seul un jour décoché coupe la plage et crée une nouvelle ligne.
    if (cur && _isNextDay(cur.end, d.date)){ cur.end = d.date; cur.days++; cur.hours += Number(d.hours) || 0; }
    else { cur = { start: d.date, end: d.date, hours: Number(d.hours) || 0, days: 1 }; runs.push(cur); }
  }
  const payloads = runs.map(function(r, idx){
    const runHours = r.hours; // total d'heures de la plage (somme des jours cochés)
    // Au centime près (retour Benjamin) : l'arrondi à l'euro faussait le brut journalier, donc la déclaration.
    const gross = sumHours > 0 ? Math.round(totalGross * (runHours / sumHours) * 100) / 100 : Math.round(totalGross / runs.length * 100) / 100;
    return {
      user_id: currentUser.id, production: production, emission: emission, lieu: lieu,
      mission_type: type, mission_date: r.start, end_date: r.end,
      hours: runHours, gross_amount: gross, vacations: r.days, is_cachet: (_missionMode === 'cachet'),
      km_distance: idx === 0 ? km_distance : 0, km_rate: idx === 0 ? km_rate : 0, km_amount: idx === 0 ? km_amount : 0
    };
  });
  const grossSum = payloads.reduce(function(s,p){ return s + p.gross_amount; }, 0);
  if (payloads.length) payloads[0].gross_amount = Math.round((payloads[0].gross_amount + (totalGross - grossSum)) * 100) / 100;
  const res = await sb.from("missions").insert(payloads);
  if (res.error){ toast("Erreur sauvegarde : " + res.error.message); return; }
  // Prix/jour appris pour (prod + poste) = total réparti sur le nombre de jours cochés.
  _rememberPrice(production, type, totalGross / Math.max(1, checked.length));
  await _afterMissionSave(payloads[0].mission_date);
}

// Ouvre le pop-up des jours travaillés dès qu'une période de 3 jours ou plus est saisie (création)
function _maybeOpenMdp(){
  if (editingMissionId) return;
  const s = $("date").value, e = $("endDate").value;
  if (!s || !e || e < s) return;
  const nb = daysInclusive(new Date(s+"T00:00:00"), new Date(e+"T00:00:00"));
  if (nb > 1) openMultiDayPicker(s, e);
}

// Branche l'ouverture du pop-up dès le choix des dates (change + blur), au chargement
(function(){
  function _wireMdpDates(){ ["date","endDate"].forEach(function(idd){ var el=document.getElementById(idd); if(el && !el.dataset.mdptrig){ el.dataset.mdptrig="1"; el.addEventListener("change", _maybeOpenMdp); el.addEventListener("blur", _maybeOpenMdp); } }); }
  if (document.readyState !== "loading") _wireMdpDates(); else document.addEventListener("DOMContentLoaded", _wireMdpDates);
})();

function editMission(id) {
  const mission = missions.find((m) => String(m.id) === String(id));
  if (!mission) { toast("Mission introuvable."); return; }
  if (typeof switchAddTab === 'function') switchAddTab('mission');
  editingMissionId = mission.id;
  _setMissionRegime(mission.regime || "intermittence");
  _setProdValue(mission.production || "");
  if ($("emission")) $("emission").value = mission.emission || "";
  if ($("lieu")) $("lieu").value = mission.lieu || "";
  if (typeof _syncFieldBtn === 'function'){ _syncFieldBtn('emission','emBtnLabel'); _syncFieldBtn('lieu','lieuBtnLabel'); }
  _setTypeValue(mission.type || ""); _typePristine = false; // édition : le type chargé n'est pas une suggestion
  $("date").value = mission.date || "";
  $("endDate").value = mission.endDate || mission.date || "";
  $("hours").value = mission.hours || 0;
  if ($("vacations")) $("vacations").value = mission.vacations || "";
  $("gross").value = mission.gross || 0; _grossTouched = true; // édition : le brut stocké est le total final
  // Mode Heures/Cachet à l'édition : on relit le mode RÉELLEMENT enregistré (is_cachet) au lieu de le
  // re-deviner depuis l'annexe — sinon une mission passée en heures repassait en cachet à la réouverture
  // (retour Mélio). Repli sur l'ancienne logique uniquement pour les missions d'avant la colonne.
  const _ax=(typeof _profil!=='undefined' && _profil && _profil.annexe)||'technicien';
  const _mode = mission.is_cachet === true ? 'cachet'
    : mission.is_cachet === false ? 'heures'
    : (_ax==='artiste' ? 'cachet'
    : (_ax==='les_deux' && Number(mission.vacations)>0 && Math.abs(Number(mission.hours||0)-Number(mission.vacations)*CACHET_H)<0.6 ? 'cachet' : 'heures'));
  if (typeof setMissionModeForOpen==='function') setMissionModeForOpen(_mode);
  if (_mode==='cachet'){
    if ($("cachetInput")) $("cachetInput").value = mission.vacations || "";
    if ($("hours")) $("hours").value = Math.max(0, Math.round((Number(mission.hours||0)-Number(mission.vacations||0)*CACHET_H)*10)/10) || "";
  }
  if ($("kmDistance")) $("kmDistance").value = mission.kmDistance || "";
  // Sans km réel, on n'affiche pas un taux stocké (d'anciennes missions gardaient 0,495 = barème) → champ vide.
  if ($("kmRate")) $("kmRate").value = (Number(mission.kmDistance) > 0 ? (mission.kmRate || "") : "");
  // Les adresses sont enfin relues : elles n'étaient enregistrées nulle part avant le 15/07/2026,
  // d'où « les adresses n'apparaissent pas quand je modifie une mission ».
  _setAddrValue('from', mission.kmFrom || "", mission.kmFromLng, mission.kmFromLat);
  _setAddrValue('to', mission.kmTo || "", mission.kmToLng, mission.kmToLat);
  // La distance stockée est déjà la distance finale comptée : on évite de la re-plafonner / re-multiplier
  // Le CV n'est pas stocké par mission (seul le taux l'est, et il vaut 0 pour une mission saisie au
  // barème) : rouvrir une telle mission affichait une estimation à 0. On reprend le véhicule du profil.
  _applyKmProfil();
  if ($("kmRoundTrip")) $("kmRoundTrip").checked = false;
  if ($("kmEveryDay")) $("kmEveryDay").checked = false;
  if ($("kmJustify")) $("kmJustify").checked = Number(mission.kmDistance || 0) > 0;
  updateKmPreview();
  const submitBtn = document.querySelector("#missionForm button[type='submit']");
  if (submitBtn) submitBtn.textContent = "Mettre à jour la mission";
  activateView("add-mission");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteMission(id) {
  if (!(await confirmDialog("Supprimer cette mission ?"))) return;
  const { error } = await sb.from("missions").delete().eq("id", id);
  if (error) { toast("Erreur suppression : " + error.message); return; }
  await loadMissions();
}

// Points de position des onglets : un par onglet, l'actif en pilule pétrole (comme l'appli).
function _renderTabDots(){
  var box=document.getElementById('tabDots'); if(!box)return;
  var tabs=document.querySelectorAll('.tabs .tab');
  var html=''; tabs.forEach(function(t){ html+='<span class="tab-dot'+(t.classList.contains('active')?' on':'')+'"></span>'; });
  box.innerHTML=html;
}
function activateView(viewName) {
  document.querySelectorAll(".tab").forEach((tab) => { tab.classList.toggle("active", tab.dataset.view === viewName); });
  document.querySelectorAll(".view").forEach((view) => { view.classList.toggle("active", view.id === "view-" + viewName); });
  _renderTabDots();
  trackEvent("view_" + viewName);
  if (viewName === "previsions") {
    if (!_srLoaded) { _srLoaded = true; _loadSalaireRef().then(_prefillC1Ref); } else { _prefillC1Ref(); }
  }
}

// ===== TUTORIEL GUIDÉ (tour) — montré à tous à la 1re connexion, skippable, revoyable =====
var TOUR_KEY = 'intermitrack_tour_v1_done';
var _tourIdx = 0, _tourChecked = false;
var _tourSteps = [
  { view: 'dashboard', target: null, title: 'Bienvenue 👋', text: "Voici ton tableau de bord. Je te montre l'essentiel en quelques secondes — tu peux passer à tout moment." },
  { view: 'dashboard', target: '#accountAvatarBtn', title: 'Ton compte', text: "En haut à droite : « Mes informations » (statut, salaire…), le thème et la déconnexion. Renseigne tes infos, ça pré-remplit tes missions." },
  { view: 'dashboard', target: '#chart', title: 'Ta progression', text: "Le graphique montre tes heures effectuées et prévues vers les 507 h. Le détail est juste en dessous." },
  { view: 'dashboard', target: '#reelBox', title: 'Tes montants réels', text: "Une fois payé, saisis ton net réel + l'allocation reçue : tu obtiens le total EXACT du mois, pas seulement l'estimation." },
  { view: 'calendar', target: '.new-cal-tools', title: 'Le calendrier', text: "Importe tes dates (Excel/CSV, notes) ou clique un jour pour ajouter une mission. Ça dépend de ton statut — d'où l'importance de tes infos." },
  { view: 'calendar', target: '.cal-sec-title', title: 'Tes évènements du mois', text: "Sous le calendrier, retrouve toutes tes missions et notes du mois, triées par date." },
  { view: 'missions', target: '#missionsGraphContainer', title: 'Tes productions', text: "Le camembert répartit ton brut par production. Clique une prod pour changer sa couleur, la renommer, la fusionner ou régler ses heures sup." },
  { view: 'dashboard', target: null, title: 'À toi de jouer 🎬', text: "Explore les autres onglets (Actu, Simulation, Fiscalité…) quand tu veux. Tu pourras revoir ce tuto depuis ton menu compte." },
];
function _tourEnsureDom() {
  if (document.getElementById('tourHole')) return;
  var st = document.createElement('style');
  st.textContent = ".tour-hole{position:fixed;border-radius:12px;box-shadow:0 0 0 9999px rgba(10,20,30,.68);z-index:100070;pointer-events:none;transition:all .25s ease;}.tour-bubble{position:fixed;z-index:100071;width:300px;max-width:calc(100vw - 24px);background:var(--card);color:var(--text);border-radius:16px;padding:16px 18px;box-shadow:0 20px 60px rgba(0,0,0,.4);}.tour-bubble h4{margin:0 0 6px;font-size:15px;font-weight:900;color:var(--petrol);}.tour-bubble p{margin:0;font-size:13px;line-height:1.5;color:var(--muted);}.tour-actions{display:flex;align-items:center;justify-content:space-between;margin-top:14px;gap:10px;}.tour-skip{background:none;border:none;color:var(--muted);font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit;text-decoration:underline;}.tour-right{display:flex;align-items:center;gap:12px;}.tour-count{font-size:11px;color:var(--muted);font-weight:700;}.tour-next{background:var(--petrol);color:#fff;border:none;border-radius:10px;padding:9px 16px;font-weight:800;font-size:13px;cursor:pointer;font-family:inherit;}";
  document.head.appendChild(st);
  var hole = document.createElement('div'); hole.id = 'tourHole'; hole.className = 'tour-hole'; hole.style.display = 'none'; document.body.appendChild(hole);
  var bub = document.createElement('div'); bub.id = 'tourBubble'; bub.className = 'tour-bubble'; bub.style.display = 'none'; document.body.appendChild(bub);
  bub.addEventListener('click', function (e) {
    if (e.target.closest('[data-tour-skip]')) { _tourEnd(); return; }
    if (e.target.closest('[data-tour-next]')) { _tourNext(); return; }
  });
}
function _tourStart() {
  _tourEnsureDom(); _tourIdx = 0; _tourShow();
}
function _tourShow() {
  var step = _tourSteps[_tourIdx];
  if (step.view && typeof activateView === 'function') activateView(step.view);
  var bub = document.getElementById('tourBubble');
  var isLast = _tourIdx === _tourSteps.length - 1;
  bub.innerHTML = '<h4>' + escapeHtml(step.title) + '</h4><p>' + escapeHtml(step.text) + '</p>'
    + '<div class="tour-actions"><button type="button" class="tour-skip" data-tour-skip>Passer le tuto</button>'
    + '<div class="tour-right"><span class="tour-count">' + (_tourIdx + 1) + ' / ' + _tourSteps.length + '</span>'
    + '<button type="button" class="tour-next" data-tour-next>' + (isLast ? 'Terminer' : 'Suivant') + '</button></div></div>';
  bub.style.display = 'block';
  var el = step.target ? document.querySelector(step.target) : null;
  var hole = document.getElementById('tourHole');
  if (!el) {
    hole.style.display = 'none';
    bub.style.left = '50%'; bub.style.top = '50%'; bub.style.transform = 'translate(-50%,-50%)';
    return;
  }
  bub.style.transform = 'none';
  try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { }
  setTimeout(function () {
    var r = el.getBoundingClientRect(), pad = 8;
    hole.style.display = 'block';
    hole.style.left = (r.left - pad) + 'px'; hole.style.top = (r.top - pad) + 'px';
    hole.style.width = (r.width + pad * 2) + 'px'; hole.style.height = (r.height + pad * 2) + 'px';
    var bw = bub.offsetWidth || 300;
    var left = Math.min(Math.max(12, r.left), window.innerWidth - bw - 12);
    bub.style.left = left + 'px';
    bub.style.top = (r.bottom + 12) + 'px';
    var br = bub.getBoundingClientRect();
    if (br.bottom > window.innerHeight - 8) { bub.style.top = Math.max(8, r.top - bub.offsetHeight - 12) + 'px'; }
  }, 260);
}
function _tourNext() { _tourIdx++; if (_tourIdx >= _tourSteps.length) { _tourEnd(); } else _tourShow(); }
function _tourEnd() {
  var hole = document.getElementById('tourHole'), bub = document.getElementById('tourBubble');
  if (hole) hole.style.display = 'none';
  if (bub) bub.style.display = 'none';
  try { localStorage.setItem(TOUR_KEY, '1'); } catch (e) { }
}
// Auto-démarrage à la 1re connexion (une fois par navigateur, tant que non fait/skippé).
function _tourMaybeStart() {
  if (_tourChecked) return; _tourChecked = true;
  try { if (localStorage.getItem(TOUR_KEY)) return; } catch (e) { return; }
  var appBox = document.getElementById('appBox');
  if (!appBox || appBox.classList.contains('hidden')) return;
  setTimeout(_tourStart, 700);
}

// ===== Salaire de référence (Prévisions C1) : « les deux » =====
// Pré-rempli depuis les missions (12 mois glissants), OU valeur mémorisée dans le profil qui prime.
var _srSaved = null, _srLoaded = false;
async function _loadSalaireRef() {
  if (!currentUser) return;
  // Lecture SÉPARÉE et défensive : la colonne peut ne pas exister avant la migration.
  try { const r = await sb.from('profiles').select('salaire_reference').eq('id', currentUser.id).maybeSingle();
    if (r.data && r.data.salaire_reference != null && Number(r.data.salaire_reference) > 0) _srSaved = Number(r.data.salaire_reference); } catch (e) {}
}
function _c1RefAuto() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const win12 = new Date(today); win12.setFullYear(today.getFullYear() - 1);
  const ref = (missions || []).filter(function (m) { const d = new Date((m.date || '') + 'T00:00:00'); return d >= win12 && d <= today; });
  return { sr: Math.round(ref.reduce(function (a, m) { return a + Number(m.gross || 0); }, 0)),
           nht: Math.round(ref.reduce(function (a, m) { return a + Number(m.hours || 0); }, 0) * 10) / 10 };
}
function _prefillC1Ref() {
  const srIn = $("itk-c1-sr"), nhtIn = $("itk-c1-nht"), bar = $("itk-c1-refbar");
  if (!srIn) return;
  const auto = _c1RefAuto();
  const sr = _srSaved != null ? _srSaved : auto.sr;
  if (!srIn.value && sr > 0) srIn.value = sr;
  if (nhtIn && !nhtIn.value && auto.nht > 0) nhtIn.value = auto.nht;
  if (!bar) return;
  const txt = _srSaved != null ? 'Valeur mémorisée dans ton profil' : (auto.sr > 0 ? 'Pré-rempli depuis tes missions (12 mois) : ' + auto.sr + ' €' : '');
  const cur = Number(srIn.value || 0);
  const canSave = cur > 0 && cur !== _srSaved;
  const canReset = _srSaved != null && auto.sr > 0 && Math.abs(auto.sr - _srSaved) > 1;
  bar.innerHTML = '<span>' + txt + '</span>' +
    (canSave ? '<a href="#" id="itk-c1-refsave" style="font-weight:800;color:var(--petrol);white-space:nowrap;">Mémoriser</a>' : '') +
    (canReset ? '<a href="#" id="itk-c1-refreset" style="font-weight:700;color:var(--petrol);white-space:nowrap;">Recalculer (' + auto.sr + ' €)</a>' : '');
  bar.style.display = (txt || canSave || canReset) ? 'flex' : 'none';
  const sv = $("itk-c1-refsave");
  if (sv) sv.onclick = async function (e) { e.preventDefault(); const v = Number(srIn.value || 0); if (!(v > 0) || !currentUser) return; try { await sb.from('profiles').upsert({ id: currentUser.id, salaire_reference: v }, { onConflict: 'id' }); _srSaved = v; _prefillC1Ref(); } catch (err) {} };
  const rs = $("itk-c1-refreset");
  if (rs) rs.onclick = function (e) { e.preventDefault(); srIn.value = auto.sr; _prefillC1Ref(); };
}

// ===== Auto-entrepreneur : factures =====
// Valeurs indicatives micro-entreprise (à vérifier chaque année sur autoentrepreneur.urssaf.fr)
let factures = [];
let fraisList = [];                  // frais réels (dépenses) pour le calcul fiscal
let societes = [];                   // carnet de sociétés (clients, productions, employeurs)
let factureLignes = [];              // lignes de la facture en cours de création/édition
let facturesPage = 1;                // page courante de l'historique des factures
let facturesFilter = "all";          // filtre historique : all | payee | impayee
const FACTURES_PAR_PAGE = 15;        // 3 colonnes × 5 lignes
const PRESTA_OPTIONS = [
  "Régie générale", "Sonorisation / mix", "Éclairage / lumière", "Vidéo / captation",
  "Montage / post-production", "Montage-démontage plateau", "Création / conception",
  "Photographie", "Formation", "Communication", "Location de matériel", "Frais de déplacement"
];
const AE_PLAFOND_CA = 77700;        // plafond annuel prestations de services
const AE_TAUX_COTISATION = 0.246;   // taux par défaut (estimation, modifiable par l'utilisateur)

// Taux de cotisation URSSAF en % (réglable, propre à chaque utilisateur)
function getAeTaux() {
  const v = localStorage.getItem(storageKey("ae_taux"));
  return (v === null || v === "") ? AE_TAUX_COTISATION * 100 : Number(v);
}

function money2(n) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
}

async function loadFactures() {
  if (!currentUser) return;
  const { data, error } = await sb.from("factures").select("*").order("facture_date", { ascending: false });
  if (error) { toast("Erreur chargement factures : " + error.message); return; }
  factures = (data || []).map((x) => ({
    id: x.id, client: x.client, prestation: x.prestation,
    clientAddress: x.client_address || "", numero: x.numero || "",
    date: x.facture_date, endDate: x.facture_end_date || "",
    lignes: Array.isArray(x.lignes) ? x.lignes : null,
    amount: Number(x.amount || 0), status: x.status || "impayee",
    type: x.type === "devis" ? "devis" : "facture", bon_commande: x.bon_commande || ""
  }));
  fillAeProfileForm();
  renderFactures();
}

function sumFactures(list) {
  const paid = list.filter((f) => f.status === "payee").reduce((a, f) => a + f.amount, 0);
  const pending = list.filter((f) => f.status !== "payee").reduce((a, f) => a + f.amount, 0);
  return { paid, pending, total: paid + pending };
}

const AE_TVA_SEUIL = 39100; // seuil de franchise TVA (prestations de services) — indicatif, paramétrable
function _aeDashCSS(){
  if(document.getElementById('aeDashStyle'))return;
  const st=document.createElement('style'); st.id='aeDashStyle';
  st.textContent=".ae-dashboard{display:flex;flex-direction:column;gap:11px;margin:14px 0 20px;}.ae-dash-card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:15px;}.ae-dash-lbl{font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);}.ae-dash-big{font-size:30px;font-weight:800;margin-top:3px;line-height:1.05;color:var(--petrol);}.ae-dash-bar{height:8px;border-radius:6px;background:var(--line);margin-top:12px;overflow:hidden;}.ae-dash-bar>i{display:block;height:100%;border-radius:6px;background:#12754A;}.ae-dash-foot{display:flex;justify-content:space-between;font-size:11px;margin-top:6px;color:var(--muted);}.ae-dash-row{display:flex;gap:11px;}.ae-dash-row>.ae-dash-card{flex:1;min-width:0;}.ae-dash-num{font-size:19px;font-weight:800;margin-top:4px;color:var(--text);}.ae-dash-num.orange{color:#F97316;}.ae-dash-hint{font-size:10.5px;color:var(--muted);margin-top:2px;display:block;}.ae-dash-split{display:flex;gap:10px;margin-top:8px;}.ae-dash-split>div{flex:1;border-radius:12px;padding:10px;text-align:center;}.ae-split-g{background:#E3F6E9;}.ae-split-o{background:#FDF1DC;}.ae-dash-split .n{font-size:16px;font-weight:800;}.ae-split-g .n{color:#12754A;}.ae-split-o .n{color:#B5760A;}.ae-dash-split .t{font-size:10.5px;color:var(--muted);margin-top:1px;}.ae-dash-gauge{height:9px;border-radius:6px;background:var(--line);margin-top:9px;overflow:hidden;}.ae-dash-gauge>i{display:block;height:100%;border-radius:6px;background:#F97316;}.ae-modal{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:100060;display:none;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto;}.ae-modal.open{display:flex;}.ae-modal-box{background:var(--card);color:var(--text);border-radius:20px;width:100%;max-width:560px;padding:22px 22px 26px;box-shadow:0 24px 60px rgba(0,0,0,.3);position:relative;margin:auto;}.ae-modal-close{position:absolute;top:12px;right:14px;border:none;background:none;font-size:22px;line-height:1;color:var(--muted);cursor:pointer;}";
  document.head.appendChild(st);
}
function renderFactures() {
  // Mois sélectionné au format "YYYY-MM" (par défaut le mois courant)
  const monthSel = ($("aeMonth") && $("aeMonth").value) ? $("aeMonth").value : new Date().toISOString().slice(0, 7);
  const year = monthSel.slice(0, 4);
  const ms = sumFactures(factures.filter((f) => (f.date || "").slice(0, 7) === monthSel && f.type !== "devis"));
  const ys = sumFactures(factures.filter((f) => (f.date || "").slice(0, 4) === year && f.type !== "devis"));
  const taux = getAeTaux() / 100;

  // Tableau de bord (comme l'app) : CA/plafond, URSSAF, net, encaissé/en attente, jauge TVA
  _aeDashCSS();
  const _aed = $("aeDashboard");
  if (_aed) {
    const pct = Math.min(100, Math.round((ys.total / AE_PLAFOND_CA) * 100));
    const tvaPct = Math.min(100, Math.round((ys.total / AE_TVA_SEUIL) * 100));
    _aed.innerHTML =
      '<div class="ae-dash-card"><span class="ae-dash-lbl">Chiffre d\'affaires ' + year + '</span><div class="ae-dash-big">' + money(ys.total) + '</div><div class="ae-dash-bar"><i style="width:' + pct + '%"></i></div><div class="ae-dash-foot"><span>' + pct + ' % du plafond</span><span>Plafond ' + money(AE_PLAFOND_CA) + '</span></div></div>' +
      '<div class="ae-dash-row"><div class="ae-dash-card"><span class="ae-dash-lbl">À provisionner URSSAF</span><div class="ae-dash-num orange">≈ ' + money(ys.paid * taux) + '</div><span class="ae-dash-hint">' + getAeTaux() + ' % du CA encaissé</span></div><div class="ae-dash-card"><span class="ae-dash-lbl">Net estimé</span><div class="ae-dash-num">≈ ' + money(ys.paid * (1 - taux)) + '</div><span class="ae-dash-hint">après cotisations</span></div></div>' +
      '<div class="ae-dash-card"><span class="ae-dash-lbl">Factures ' + year + '</span><div class="ae-dash-split"><div class="ae-split-g"><div class="n">' + money(ys.paid) + '</div><div class="t">Encaissé</div></div><div class="ae-split-o"><div class="n">' + money(ys.pending) + '</div><div class="t">En attente</div></div></div></div>' +
      '<div class="ae-dash-card"><span class="ae-dash-lbl">Franchise de TVA</span><div class="ae-dash-gauge"><i style="width:' + tvaPct + '%"></i></div><div class="ae-dash-foot"><span>' + money(ys.total) + '</span><span>Seuil ' + money(AE_TVA_SEUIL) + '</span></div><div class="ae-dash-hint">' + (ys.total < AE_TVA_SEUIL ? ('Il te reste ' + money(AE_TVA_SEUIL - ys.total) + ' avant la TVA.') : 'Seuil dépassé — TVA applicable.') + '</div></div>';
  }

  // Reflète le taux enregistré dans le champ (sauf si l'utilisateur est en train de le saisir)
  if ($("aeTaux") && document.activeElement !== $("aeTaux")) $("aeTaux").value = getAeTaux();

  // Récap du mois
  if ($("aeMonthPaid")) $("aeMonthPaid").textContent = money2(ms.paid);
  if ($("aeMonthPending")) $("aeMonthPending").textContent = money2(ms.pending);
  if ($("aeMonthCotis")) $("aeMonthCotis").textContent = money2(ms.paid * taux);

  // Récap de l'année
  if ($("aeYearLbl")) $("aeYearLbl").textContent = year;
  if ($("aeCaPaid")) $("aeCaPaid").textContent = money2(ys.paid);
  if ($("aeCaPending")) $("aeCaPending").textContent = money2(ys.pending);
  if ($("aeCotis")) $("aeCotis").textContent = money2(ys.paid * taux);
  if ($("aePlafondBox")) {
    const pct = Math.min(100, Math.round((ys.total / AE_PLAFOND_CA) * 100));
    $("aePlafondBox").innerHTML = `<strong>Plafond micro : ${money(AE_PLAFOND_CA)}</strong>CA ${year} : ${money2(ys.total)} (${pct} %)`;
  }
  const list = $("facturesList");
  if (!list) return;

  // Barre de filtres (Tout / Payées / À encaisser) avec compteurs
  const nbPaid = factures.filter((f) => f.status === "payee").length;
  const nbDue = factures.length - nbPaid;
  const fBtn = (key, label, n) =>
    `<button class="ghost" type="button" data-ffilter="${key}" style="padding:7px 12px;${facturesFilter === key ? "background:var(--petrol);color:#fff;border-color:var(--petrol);" : ""}">${label} (${n})</button>`;
  const filters = `<div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 4px;">${fBtn("all", "Tout", factures.length)}${fBtn("payee", "Payées", nbPaid)}${fBtn("impayee", "À encaisser", nbDue)}</div>`;

  if (!factures.length) {
    list.innerHTML = filters + `<p class="hint" style="margin-top:12px;">Aucune facture pour le moment. Crée ta première facture ci-dessus.</p>`;
    return;
  }

  const filtered = factures.filter((f) => facturesFilter === "all" ? true : (facturesFilter === "payee" ? f.status === "payee" : f.status !== "payee"));
  if (!filtered.length) {
    list.innerHTML = filters + `<p class="hint" style="margin-top:12px;">Aucune facture dans ce filtre.</p>`;
    return;
  }

  const pages = Math.max(1, Math.ceil(filtered.length / FACTURES_PAR_PAGE));
  if (facturesPage > pages) facturesPage = pages;
  if (facturesPage < 1) facturesPage = 1;
  const start = (facturesPage - 1) * FACTURES_PAR_PAGE;
  const pageItems = filtered.slice(start, start + FACTURES_PAR_PAGE);

  const grid = `<div class="factures-grid">` + pageItems.map((f) => `
    <div style="display:flex;flex-direction:column;gap:8px;padding:14px;border:1px solid var(--border,#E5E8EB);border-radius:16px;background:#fff;box-shadow:0 1px 6px rgba(13,27,42,.05);">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <strong style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(f.client)}</strong>
        <span class="pill" style="flex:0 0 auto;background:${f.status === "payee" ? "#E3F6E9" : "#FDF1DC"};color:${f.status === "payee" ? "#1B7F4B" : "#9A6A00"};">${f.status === "payee" ? "Payée" : "À encaisser"}</span>
      </div>
      <span style="color:#6B7280;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(f.prestation)}</span>
      <small style="color:#9AA5B1;">${f.numero ? "N° " + escapeHtml(f.numero) + " · " : ""}${formatPeriod(f.date, f.endDate)}</small>
      <span style="font-weight:800;font-size:18px;color:var(--petrol);">${money2(f.amount)}</span>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:2px;">
        <button class="ghost" type="button" data-facture-pdf="${escapeHtml(f.id)}" style="padding:7px 10px;">PDF</button>
        <button class="ghost" type="button" data-facture-edit="${escapeHtml(f.id)}" style="padding:7px 10px;">Modifier</button>
        <button class="delete" type="button" data-facture-delete="${escapeHtml(f.id)}" style="padding:7px 10px;">Supprimer</button>
      </div>
    </div>`).join("") + `</div>`;

  const pagination = pages > 1 ? `
    <div style="display:flex;justify-content:center;align-items:center;gap:12px;margin-top:16px;">
      <button class="ghost" type="button" data-fpage="prev" ${facturesPage === 1 ? "disabled" : ""} style="padding:8px 12px;">‹ Précédent</button>
      <span style="font-size:13px;color:#64748B;font-weight:600;">Page ${facturesPage} / ${pages}</span>
      <button class="ghost" type="button" data-fpage="next" ${facturesPage === pages ? "disabled" : ""} style="padding:8px 12px;">Suivant ›</button>
    </div>` : "";

  list.innerHTML = filters + grid + pagination;
}

// ----- Constructeur de lignes de facture -----
function renderPrestaChips() {
  const c = $("prestaChips");
  if (!c) return;
  c.innerHTML = PRESTA_OPTIONS.map((p) =>
    `<button type="button" class="ghost presta-chip" data-presta="${escapeHtml(p)}" style="font-size:13px;padding:6px 10px;">+ ${escapeHtml(p)}</button>`
  ).join("");
}

// ----- Pop-up "Ajouter une prestation" (cases à cocher + prestations personnalisées mémorisées) -----
function getCustomPostes(){ try { return JSON.parse(localStorage.getItem(storageKey("custom_postes")) || "[]"); } catch(e){ return []; } }
function _syncPostesToSupabase(){ try { if (typeof currentUser !== 'undefined' && currentUser && typeof sb !== 'undefined') sb.from('profiles').upsert({ id: currentUser.id, custom_postes: getCustomPostes() }, { onConflict:'id' }).then(function(){}, function(){}); } catch(e){} }
function addCustomPoste(name){ name=(name||'').trim(); if(!name) return; var presets=[].concat(typeof POSTES_TECH!=='undefined'?POSTES_TECH:[], typeof POSTES_ARTISTE!=='undefined'?POSTES_ARTISTE:[], typeof POSTES_MUSIQUE!=='undefined'?POSTES_MUSIQUE:[]); var lc=name.toLowerCase(); var a=getCustomPostes(); if(a.map(function(x){return x.toLowerCase();}).indexOf(lc)<0 && presets.map(function(x){return x.toLowerCase();}).indexOf(lc)<0){ a.push(name); localStorage.setItem(storageKey("custom_postes"), JSON.stringify(a)); _syncPostesToSupabase(); } }
function removeCustomPoste(name){ var a=getCustomPostes().filter(function(x){return x.toLowerCase()!==(name||'').toLowerCase();}); localStorage.setItem(storageKey("custom_postes"), JSON.stringify(a)); _syncPostesToSupabase(); }
function getCustomPresta(){ try { return JSON.parse(localStorage.getItem(storageKey("ae_custom_presta")) || "[]"); } catch(e){ return []; } }
function _syncPrestaToSupabase(){ try { if (typeof currentUser !== 'undefined' && currentUser && typeof sb !== 'undefined') sb.from('profiles').upsert({ id: currentUser.id, ae_custom_presta: getCustomPresta() }, { onConflict:'id' }).then(function(){}, function(){}); } catch(e){} }
function addCustomPresta(name){ name=(name||'').trim(); if(!name) return; var a=getCustomPresta(); if(a.map(function(x){return x.toLowerCase();}).indexOf(name.toLowerCase())<0 && PRESTA_OPTIONS.map(function(x){return x.toLowerCase();}).indexOf(name.toLowerCase())<0){ a.push(name); localStorage.setItem(storageKey("ae_custom_presta"), JSON.stringify(a)); _syncPrestaToSupabase(); } }
function removeCustomPresta(name){ var a=getCustomPresta().filter(function(x){return x.toLowerCase()!==(name||'').toLowerCase();}); localStorage.setItem(storageKey("ae_custom_presta"), JSON.stringify(a)); _syncPrestaToSupabase(); }
function _ensurePrestaModal(){
  if(document.getElementById('prestaModalOverlay')) return;
  var st=document.createElement('style');
  st.textContent="#prestaModalOverlay{position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;align-items:flex-end;justify-content:center;z-index:100043;}#prestaModalOverlay.open{display:flex;}.pm-box{background:var(--card);color:var(--text);border-radius:22px 22px 0 0;width:100%;max-width:540px;max-height:88vh;display:flex;flex-direction:column;box-sizing:border-box;box-shadow:0 -10px 40px rgba(0,0,0,.3);}@media(min-width:600px){#prestaModalOverlay{align-items:center;padding:18px;}.pm-box{border-radius:20px;max-width:440px;max-height:86vh;}}.pm-head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px 6px;}.pm-title{font-size:17px;font-weight:900;color:var(--petrol);}.pm-x{background:none;border:none;font-size:22px;line-height:1;color:var(--muted);cursor:pointer;}.pm-sub{font-size:12px;color:var(--muted);padding:0 20px 8px;}.pm-list{overflow-y:auto;padding:4px 20px;flex:1;}.pm-item{display:flex;align-items:center;gap:11px;padding:11px 12px;border:1px solid var(--line);border-radius:12px;margin-bottom:8px;cursor:pointer;}.pm-item.on{border-color:var(--petrol);background:rgba(13,79,108,.07);}.pm-check{width:20px;height:20px;border-radius:6px;border:2px solid var(--line);flex-shrink:0;display:flex;align-items:center;justify-content:center;box-sizing:border-box;}.pm-item.on .pm-check{background:var(--petrol);border-color:var(--petrol);}.pm-name{flex:1;font-size:13.5px;font-weight:700;}.pm-del{background:none;border:none;color:var(--muted);cursor:pointer;padding:4px;flex-shrink:0;display:flex;}.pm-custom{display:flex;gap:8px;padding:8px 20px 4px;}.pm-custom input{flex:1;min-width:0;padding:10px 12px;border:1px solid var(--line);border-radius:11px;background:var(--card);color:var(--text);font-size:14px;font-family:inherit;box-sizing:border-box;}.pm-custom button{flex-shrink:0;padding:10px 14px;border:1px solid var(--line);background:var(--soft);color:var(--petrol);border-radius:11px;font-weight:800;font-size:13px;cursor:pointer;}.pm-foot{padding:10px 20px 22px;}.pm-add{width:100%;padding:14px;border:none;border-radius:14px;background:var(--petrol);color:#fff;font-weight:800;font-size:15px;cursor:pointer;}";
  document.head.appendChild(st);
  var ov=document.createElement('div'); ov.id='prestaModalOverlay';
  ov.innerHTML="<div class=\"pm-box\"><div class=\"pm-head\"><span class=\"pm-title\">Ajouter des prestations</span><button class=\"pm-x\" id=\"pmX\" type=\"button\">×</button></div><div class=\"pm-sub\">Coche celles à ajouter à la facture.</div><div class=\"pm-list\" id=\"pmList\"></div><div class=\"pm-custom\"><input id=\"pmCustomInput\" type=\"text\" placeholder=\"Prestation personnalisée…\" autocomplete=\"off\"><button id=\"pmCustomAdd\" type=\"button\">Ajouter</button></div><div class=\"pm-foot\"><button class=\"pm-add\" id=\"pmConfirm\" type=\"button\">Ajouter la sélection</button></div></div>";
  document.body.appendChild(ov);
  ov.addEventListener('click', function(e){
    if(e.target===ov || (e.target.closest && e.target.closest('#pmX'))){ ov.classList.remove('open'); return; }
    var del=e.target.closest && e.target.closest('.pm-del');
    if(del){ e.stopPropagation(); removeCustomPresta(del.dataset.presta); _refreshPrestaModalList(); return; }
    var it=e.target.closest && e.target.closest('.pm-item');
    if(it){ it.classList.toggle('on'); return; }
    if(e.target.closest && e.target.closest('#pmCustomAdd')){ var inp=document.getElementById('pmCustomInput'); var v=(inp.value||'').trim(); if(v){ addCustomPresta(v); inp.value=''; _refreshPrestaModalList(); } return; }
    if(e.target.closest && e.target.closest('#pmConfirm')){
      var sel=ov.querySelectorAll('.pm-item.on');
      if(!sel.length){ if(typeof toast==='function') toast('Coche au moins une prestation.'); return; }
      sel.forEach(function(el){ addLigne(el.dataset.presta); });
      ov.classList.remove('open');
      return;
    }
  });
  var inp=document.getElementById('pmCustomInput');
  if(inp) inp.addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); var v=(inp.value||'').trim(); if(v){ addCustomPresta(v); inp.value=''; _refreshPrestaModalList(); } } });
}
function _refreshPrestaModalList(){
  var list=document.getElementById('pmList'); if(!list) return;
  var checkSvg='<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-11"/></svg>';
  var delSvg='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6"/></svg>';
  var html='';
  PRESTA_OPTIONS.forEach(function(p){ html+='<div class="pm-item" data-presta="'+escapeHtml(p)+'"><span class="pm-check">'+checkSvg+'</span><span class="pm-name">'+escapeHtml(p)+'</span></div>'; });
  getCustomPresta().forEach(function(p){ html+='<div class="pm-item" data-presta="'+escapeHtml(p)+'"><span class="pm-check">'+checkSvg+'</span><span class="pm-name">'+escapeHtml(p)+'</span><button class="pm-del" type="button" data-presta="'+escapeHtml(p)+'" title="Retirer de mes prestations">'+delSvg+'</button></div>'; });
  list.innerHTML=html;
}
function openPrestaModal(){ _ensurePrestaModal(); _refreshPrestaModalList(); document.getElementById('prestaModalOverlay').classList.add('open'); }

function addLigne(designation) {
  factureLignes.push({ designation: designation || "", quantite: 1, unite: "jour", prixUnitaire: 0 });
  renderLignes();
}

function ligneTotal(l) { return (Number(l.quantite) || 0) * (Number(l.prixUnitaire) || 0); }
function facturesTotal() { return factureLignes.reduce((a, l) => a + ligneTotal(l), 0); }

function updateFactureTotal() {
  const t = facturesTotal();
  if ($("factureTotalDisplay")) $("factureTotalDisplay").textContent = money2(t);
  if ($("aeAmount")) $("aeAmount").value = t;
}

function renderLignes() {
  const box = $("factureLignesList");
  if (!box) return;
  box.innerHTML = "";
  if (!factureLignes.length) {
    box.innerHTML = `<p class="hint" style="margin:6px 0;">Ajoute au moins une prestation ci-dessus (ou « Autre »).</p>`;
    updateFactureTotal();
    return;
  }
  factureLignes.forEach((l) => {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:8px;padding:8px;border:1px solid var(--border,#E5E8EB);border-radius:10px;";
    row.innerHTML =
      `<input class="lg-desc" value="${escapeHtml(l.designation)}" placeholder="Désignation" style="flex:1 1 100%;" />` +
      `<input class="lg-qte" type="number" min="0" step="0.5" value="${l.quantite}" title="Quantité" style="flex:0 0 64px;" />` +
      `<select class="lg-unite" style="flex:0 0 92px;">${["jour", "heure", "forfait", "unité"].map((u) => `<option ${u === l.unite ? "selected" : ""}>${u}</option>`).join("")}</select>` +
      `<input class="lg-pu" type="number" min="0" step="0.01" value="${l.prixUnitaire || ""}" placeholder="PU HT €" title="Prix unitaire HT" style="flex:1 1 110px;" />` +
      `<button type="button" class="delete lg-del" title="Retirer" style="flex:0 0 auto;">✕</button>`;
    row.querySelector(".lg-desc").addEventListener("input", (e) => { l.designation = e.target.value; });
    row.querySelector(".lg-qte").addEventListener("input", (e) => { l.quantite = e.target.value; updateFactureTotal(); });
    row.querySelector(".lg-unite").addEventListener("change", (e) => { l.unite = e.target.value; });
    row.querySelector(".lg-pu").addEventListener("input", (e) => { l.prixUnitaire = e.target.value; updateFactureTotal(); });
    row.querySelector(".lg-del").addEventListener("click", () => { factureLignes.splice(factureLignes.indexOf(l), 1); renderLignes(); });
    box.appendChild(row);
  });
  updateFactureTotal();
}

let _aeDocType = "facture"; // 'facture' | 'devis'
function _aeSyncDocUI(){
  const isDevis = _aeDocType === "devis";
  const editing = $("aeEditId") && $("aeEditId").value;
  const t = $("aeFormTitle"); if (t) t.textContent = editing ? (isDevis ? "Modifier le devis" : "Modifier la facture") : (isDevis ? "Nouveau devis" : "Nouvelle facture");
  const sub = document.querySelector("#factureForm button[type='submit']"); if (sub) sub.textContent = editing ? (isDevis ? "Mettre à jour le devis" : "Mettre à jour la facture") : (isDevis ? "Enregistrer le devis" : "Enregistrer la facture");
  const bc = $("aeBonCmdWrap"); if (bc) bc.style.display = isDevis ? "none" : "";
}
function _aeCloseModals(){ document.querySelectorAll(".ae-modal.open").forEach(function(m){ m.classList.remove("open"); }); }
function openFactureForm(type){
  _aeDocType = type || "facture";
  resetFactureForm();
  _aeDashCSS();
  _aeCloseModals();
  const m = $("aeFactureModal"); if (m) m.classList.add("open");
}
document.addEventListener("click", function(e){
  if (!e.target.closest) return;
  if (e.target.closest("#aeNewDevisBtn")) openFactureForm("devis");
  else if (e.target.closest("#aeNewFactureBtn")) openFactureForm("facture");
  else if (e.target.closest("#aeClientsBtn")) { _aeDashCSS(); _aeCloseModals(); const m = $("aeClientsModal"); if (m) m.classList.add("open"); }
  else if (e.target.closest("#aeInfosBtn")) { _aeDashCSS(); _aeCloseModals(); const m = $("aeProfileModal"); if (m) m.classList.add("open"); }
  else if (e.target.closest("#aepreviewBtn")) previewFacture();
  else if (e.target.closest("[data-aeclose]") || (e.target.classList && e.target.classList.contains("ae-modal"))) _aeCloseModals();
});

async function saveFacture(e) {
  e.preventDefault();
  if (!currentUser) { toast("Connecte-toi pour enregistrer une facture."); return; }
  const editId = $("aeEditId").value;
  const lignes = factureLignes
    .filter((l) => (l.designation || "").trim())
    .map((l) => ({ designation: l.designation.trim(), quantite: Number(l.quantite) || 0, unite: l.unite || "forfait", prixUnitaire: Number(l.prixUnitaire) || 0 }));
  if (!lignes.length) { toast("Ajoute au moins une prestation à la facture."); return; }
  const total = lignes.reduce((a, l) => a + l.quantite * l.prixUnitaire, 0);
  const payload = {
    user_id: currentUser.id,
    client: $("aeClient").value.trim(),
    client_address: $("aeClientAddress").value.trim() || null,
    prestation: lignes.map((l) => l.designation).join(", "),
    lignes: lignes,
    facture_date: $("aeDate").value,
    facture_end_date: $("aeEndDate").value || null,
    amount: total,
    status: $("aeStatus").value,
    type: _aeDocType,
    bon_commande: ($("aeBonCmd") && $("aeBonCmd").value.trim()) || null
  };
  if (payload.facture_end_date && payload.facture_end_date < payload.facture_date) {
    toast("La date de fin doit être après la date de début."); return;
  }
  // Numéro de facture chronologique (attribué une seule fois, à la création)
  if (!editId) {
    const yr = (payload.facture_date || "").slice(0, 4);
    if (_aeDocType === "devis") {
      const dn = factures.filter((f) => (f.numero || "").startsWith("D-" + yr + "-")).map((f) => Number((f.numero || "").split("-")[2]) || 0);
      payload.numero = `D-${yr}-${String((dn.length ? Math.max(...dn) : 0) + 1).padStart(3, "0")}`;
    } else {
      const nums = factures.filter((f) => (f.numero || "").startsWith(yr + "-") && f.type !== "devis").map((f) => Number((f.numero || "").split("-")[1]) || 0);
      payload.numero = `${yr}-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, "0")}`;
    }
  }
  const result = editId
    ? await sb.from("factures").update(payload).eq("id", editId)
    : await sb.from("factures").insert(payload);
  if (result.error) { toast("Erreur sauvegarde : " + result.error.message); return; }
  const savedType = _aeDocType;
  resetFactureForm();
  _aeCloseModals();
  await loadFactures();
  toast(savedType === "devis" ? "Devis enregistré ✓" : "Facture enregistrée ✓", "success");
}

function resetFactureForm() {
  if ($("factureForm")) $("factureForm").reset();
  if ($("aeEditId")) $("aeEditId").value = "";
  if ($("aeBonCmd")) $("aeBonCmd").value = "";
  factureLignes = [];
  renderLignes();
  if ($("aeCancelEdit")) $("aeCancelEdit").style.display = "none";
  _aeSyncDocUI();
}

function editFacture(id) {
  const f = factures.find((x) => String(x.id) === String(id));
  if (!f) return;
  $("aeEditId").value = f.id;
  $("aeClient").value = f.client;
  $("aeClientAddress").value = f.clientAddress || "";
  factureLignes = (Array.isArray(f.lignes) && f.lignes.length)
    ? f.lignes.map((l) => ({ designation: l.designation || "", quantite: l.quantite ?? 1, unite: l.unite || "forfait", prixUnitaire: l.prixUnitaire ?? 0 }))
    : [{ designation: f.prestation || "", quantite: 1, unite: "forfait", prixUnitaire: f.amount || 0 }];
  renderLignes();
  $("aeDate").value = f.date;
  $("aeEndDate").value = f.endDate || "";
  $("aeStatus").value = f.status;
  _aeDocType = f.type === "devis" ? "devis" : "facture";
  if ($("aeBonCmd")) $("aeBonCmd").value = f.bon_commande || "";
  if ($("aeCancelEdit")) $("aeCancelEdit").style.display = "";
  _aeSyncDocUI();
  activateView("autoentrepreneur");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteFacture(id) {
  if (!(await confirmDialog("Supprimer cette facture ?"))) return;
  const { error } = await sb.from("factures").delete().eq("id", id);
  if (error) { toast("Erreur suppression : " + error.message); return; }
  await loadFactures();
}

// ----- Profil auto-entrepreneur (infos sur les factures) -----
function aeProfile() {
  return {
    nom: localStorage.getItem(storageKey("ae_prof_nom")) || "",
    siret: localStorage.getItem(storageKey("ae_prof_siret")) || "",
    adresse: localStorage.getItem(storageKey("ae_prof_adresse")) || "",
    contact: localStorage.getItem(storageKey("ae_prof_contact")) || "",
    tva: localStorage.getItem(storageKey("ae_prof_tva")) || "TVA non applicable, art. 293 B du CGI"
  };
}

function fillAeProfileForm() {
  const p = aeProfile();
  if ($("aeProfNom") && document.activeElement !== $("aeProfNom")) $("aeProfNom").value = p.nom;
  if ($("aeProfSiret") && document.activeElement !== $("aeProfSiret")) $("aeProfSiret").value = p.siret;
  if ($("aeProfAdresse") && document.activeElement !== $("aeProfAdresse")) $("aeProfAdresse").value = p.adresse;
  if ($("aeProfContact") && document.activeElement !== $("aeProfContact")) $("aeProfContact").value = p.contact;
  if ($("aeProfTva") && document.activeElement !== $("aeProfTva")) $("aeProfTva").value = p.tva;
}

function saveAeProfile() {
  localStorage.setItem(storageKey("ae_prof_nom"), $("aeProfNom").value.trim());
  localStorage.setItem(storageKey("ae_prof_siret"), $("aeProfSiret").value.trim());
  localStorage.setItem(storageKey("ae_prof_adresse"), $("aeProfAdresse").value.trim());
  localStorage.setItem(storageKey("ae_prof_contact"), $("aeProfContact").value.trim());
  localStorage.setItem(storageKey("ae_prof_tva"), $("aeProfTva").value.trim());
  toast("Informations enregistrées ✓", "success");
}

// ----- Génération de la facture PDF (via impression navigateur) -----
function printFacture(id) {
  const f = factures.find((x) => String(x.id) === String(id));
  if (f) _renderFacturePrint(f);
}
function previewFacture() {
  const lignes = factureLignes.filter((l) => (l.designation || "").trim()).map((l) => ({ designation: l.designation.trim(), quantite: Number(l.quantite) || 0, unite: l.unite || "forfait", prixUnitaire: Number(l.prixUnitaire) || 0 }));
  if (!lignes.length) { toast("Ajoute au moins une prestation."); return; }
  const total = lignes.reduce((a, l) => a + l.quantite * l.prixUnitaire, 0);
  _renderFacturePrint({ client: $("aeClient").value.trim(), clientAddress: $("aeClientAddress").value.trim(), prestation: lignes.map((l) => l.designation).join(", "), lignes: lignes, date: $("aeDate").value, endDate: $("aeEndDate").value || "", amount: total, status: $("aeStatus").value, type: _aeDocType, bon_commande: ($("aeBonCmd") && $("aeBonCmd").value.trim()) || "", numero: "aperçu" });
}
function _renderFacturePrint(f) {
  const p = aeProfile();
  if (!p.nom || !p.siret) {
    toast("Renseigne d'abord ton nom et ton SIRET dans « Mes informations ».");
    { const _pm = $("aeProfileModal"); if (_pm) { _aeDashCSS(); _pm.classList.add("open"); } }
    return;
  }
  const nl2br = (s) => escapeHtml(s || "").replace(/\n/g, "<br>");
  const periode = formatPeriod(f.date, f.endDate);
  const lignesPdf = (Array.isArray(f.lignes) && f.lignes.length)
    ? f.lignes.map((l) => ({ designation: l.designation || "", qte: l.quantite, unite: l.unite || "", pu: Number(l.prixUnitaire) || 0, total: (Number(l.quantite) || 0) * (Number(l.prixUnitaire) || 0) }))
    : [{ designation: f.prestation || "", qte: "", unite: "", pu: f.amount, total: f.amount }];
  const lignesRows = lignesPdf.map((l) =>
    `<tr><td>${escapeHtml(l.designation)}</td><td>${escapeHtml(l.qte === "" || l.qte == null ? "" : (l.qte + " " + l.unite).trim())}</td><td class="amount">${l.pu === "" || l.pu == null ? "" : money2(l.pu)}</td><td class="amount">${money2(l.total)}</td></tr>`
  ).join("");
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>${f.type === "devis" ? "Devis" : "Facture"} ${escapeHtml(f.numero || "")}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Segoe UI',Arial,Helvetica,sans-serif;color:#0D1B2A;font-size:13px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.topbar{background:linear-gradient(135deg,#0D4F6C,#12754A);color:#fff;padding:34px 40px;display:flex;justify-content:space-between;align-items:flex-start;}
.topbar h1{font-size:30px;letter-spacing:.08em;font-weight:800;}
.topbar .meta{margin-top:10px;font-size:12px;opacity:.92;line-height:1.6;}
.seller{text-align:right;line-height:1.6;font-size:12px;}
.seller .name{font-size:15px;font-weight:800;margin-bottom:2px;}
.content{padding:32px 40px;}
.to .lbl{color:#64748B;font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;}
.to .name{font-size:15px;font-weight:700;color:#0D4F6C;}
.to .addr{color:#475569;line-height:1.5;margin-top:2px;}
table{width:100%;border-collapse:collapse;margin:26px 0;}
thead th{background:#0D4F6C;color:#fff;text-align:left;padding:11px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;}
thead th.amount{text-align:right;}
tbody td{padding:13px 12px;border-bottom:1px solid #E5E8EB;}
tbody td.amount{text-align:right;font-weight:600;}
.total-row{display:flex;justify-content:flex-end;align-items:baseline;gap:18px;margin-top:8px;}
.total-row .label{color:#64748B;font-weight:600;}
.total-row .val{font-size:23px;font-weight:800;color:#0D4F6C;}
.status{display:inline-block;margin-top:14px;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;}
.mentions{margin-top:38px;font-size:11px;color:#64748B;line-height:1.6;border-top:1px solid #E5E8EB;padding-top:16px;}
.footer{margin-top:26px;text-align:center;font-size:11px;color:#94A3B8;border-top:1px solid #E5E8EB;padding:16px 0 4px;}
.footer b{color:#0D4F6C;}
@media print{@page{margin:0;}}
</style></head><body>
<div class="topbar">
  <div>
    <h1>${f.type === "devis" ? "DEVIS" : "FACTURE"}</h1>
    <div class="meta">N° ${escapeHtml(f.numero || "—")}<br>Date : ${formatDate(f.date)}${f.bon_commande ? `<br>Bon de commande : ${escapeHtml(f.bon_commande)}` : ""}</div>
  </div>
  <div class="seller">
    <div class="name">${escapeHtml(p.nom)}</div>
    <div style="font-size:11px;opacity:.9;">Entrepreneur individuel (EI)</div>
    ${nl2br(p.adresse)}<br>SIRET : ${escapeHtml(p.siret)}<br>${escapeHtml(p.contact)}
  </div>
</div>
<div class="content">
  <div class="to">
    <div class="lbl">Facturé à</div>
    <div class="name">${escapeHtml(f.client)}</div>
    <div class="addr">${nl2br(f.clientAddress)}</div>
  </div>
  <div style="color:#64748B;font-size:12px;margin-bottom:8px;">Période : ${escapeHtml(periode)}</div>
  <table>
    <thead><tr><th>Désignation</th><th>Qté</th><th class="amount">PU HT</th><th class="amount">Total</th></tr></thead>
    <tbody>${lignesRows}</tbody>
  </table>
  <div class="total-row"><span class="label">Total à régler</span><span class="val">${money2(f.amount)}</span></div>
  <div style="text-align:right;"><span class="status" style="background:${f.status === "payee" ? "#E3F6E9" : "#FDF1DC"};color:${f.status === "payee" ? "#12754A" : "#9A6A00"};">${f.status === "payee" ? "Payée" : "À régler"}</span></div>
  <div class="mentions">${escapeHtml(p.tva)}<br>${f.type === "devis" ? "Devis valable 30 jours. Bon pour accord (date + signature) :" : "En cas de retard de paiement : indemnité forfaitaire pour frais de recouvrement de 40 € (art. L441-10 et D441-5 du Code de commerce). Pas d'escompte pour paiement anticipé."}<br><span style="font-size:10px;color:#94A3B8;">Document généré à titre d'aide à la gestion via Intermitrack. L'émetteur reste seul responsable de l'exactitude et de la conformité légale de ce document.</span></div>
  <div class="footer">${f.type === "devis" ? "Devis généré" : "Facture générée"} avec <b>Intermitrack</b> · intermitrack.fr</div>
</div>
<script>window.onload=function(){window.print();}<\/script>
</body></html>`;
  const w = window.open("", "_blank");
  if (!w) { toast("Autorise les pop-ups pour générer le PDF."); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

// ===== Frais réels (dépenses déductibles) =====
async function loadFrais() {
  if (!currentUser) return;
  const { data, error } = await sb.from("frais").select("*").order("frais_date", { ascending: false });
  if (error) { toast("Erreur chargement frais : " + error.message); return; }
  fraisList = (data || []).map((x) => ({
    id: x.id, date: x.frais_date, categorie: x.categorie || "Autres",
    description: x.description || "", montant: Number(x.montant || 0)
  }));
  renderFraisList();
}

function fraisTotalForYear(year) {
  return (fraisList || [])
    .filter((x) => (x.date || "").slice(0, 4) === String(year))
    .reduce((a, x) => a + x.montant, 0);
}

function renderFraisList() {
  const year = _fiscalYear; // aligné sur l'année fiscale choisie
  if ($("fraisYearLbl")) $("fraisYearLbl").textContent = year;
  if ($("fraisTotalPreview")) $("fraisTotalPreview").textContent = money2(fraisTotalForYear(year));
  const list = $("fraisList");
  if (!list) return;
  if (!fraisList.length) {
    list.innerHTML = `<p class="hint" style="margin-top:12px;">Aucune dépense saisie. Ajoute tes achats, repas, matériel… ci-dessus.</p>`;
    return;
  }
  list.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px;margin-top:12px;">` + fraisList.map((x) => `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:14px;border:1px solid var(--border,#E5E8EB);border-radius:14px;">
      <div style="display:flex;flex-direction:column;gap:4px;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <strong>${escapeHtml(x.categorie)}</strong>
          ${x.description ? `<span style="color:#6B7280;">${escapeHtml(x.description)}</span>` : ""}
        </div>
        <small style="color:#9AA5B1;">${formatDate(x.date)}</small>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;white-space:nowrap;">
        <span style="font-weight:700;font-size:16px;">${money2(x.montant)}</span>
        <button class="delete" type="button" data-frais-delete="${escapeHtml(x.id)}">Supprimer</button>
      </div>
    </div>`).join("") + `</div>`;
}

async function saveFrais(e) {
  e.preventDefault();
  if (!currentUser) { toast("Connecte-toi pour ajouter une dépense."); return; }
  const payload = {
    user_id: currentUser.id,
    frais_date: $("fraisDate").value,
    categorie: $("fraisCategorie").value,
    description: $("fraisDescription").value.trim() || null,
    montant: Number($("fraisMontant").value)
  };
  const { error } = await sb.from("frais").insert(payload);
  if (error) { toast("Erreur sauvegarde : " + error.message); return; }
  $("fraisForm").reset();
  $("fraisDate").value = new Date().toISOString().slice(0, 10);
  await loadFrais();
  render(); // recalcule la fiscalité avec le nouveau total de frais
  toast("Dépense ajoutée ✓", "success");
}

async function deleteFrais(id) {
  if (!(await confirmDialog("Supprimer cette dépense ?"))) return;
  const { error } = await sb.from("frais").delete().eq("id", id);
  if (error) { toast("Erreur suppression : " + error.message); return; }
  await loadFrais();
  render();
}

// ===== Carnet de sociétés (clients, productions, employeurs) =====
async function loadSocietes() {
  if (!currentUser) return;
  const { data, error } = await sb.from("societes").select("*").order("nom", { ascending: true });
  if (error) { toast("Erreur chargement sociétés : " + error.message); return; }
  societes = (data || []).map((x) => ({
    id: x.id, nom: x.nom, type: x.type || "Client",
    adresse: x.adresse || "", telephone: x.telephone || "",
    email: x.email || "", siret: x.siret || "",
    delai: x.delai_paiement == null ? "" : Number(x.delai_paiement)
  }));
  populateSocieteSelect();
  renderSocietesList();
}

function populateSocieteSelect() {
  const sel = $("aeSocieteSelect");
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = `<option value="">— Saisie manuelle / nouvelle —</option>` +
    societes.map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.nom)}${s.type ? " · " + escapeHtml(s.type) : ""}</option>`).join("");
  sel.value = current;
}

function renderSocietesList() {
  const list = $("societesList");
  if (!list) return;
  if (!societes.length) {
    list.innerHTML = `<div style="text-align:center;padding:24px 12px;color:var(--muted);">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="opacity:.6;"><path d="M6 4h11a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6z"/><path d="M6 4H4m2 4H4m2 4H4m2 4H4"/><circle cx="11.5" cy="10.5" r="1.9"/><path d="M8.6 15.5a2.9 2.9 0 0 1 5.8 0"/></svg>
      <p class="hint" style="margin-top:6px;">Ton carnet est vide. Clique sur « Ajouter une société » pour créer ton premier contact.</p>
    </div>`;
    return;
  }
  list.innerHTML =
    `<div style="font-size:13px;color:#9AA5B1;font-weight:600;margin-bottom:10px;">${societes.length} société${societes.length > 1 ? "s" : ""}</div>` +
    `<div style="display:flex;flex-direction:column;gap:10px;">` + societes.map((s) => {
      const initials = ((s.nom || "?").replace(/[^A-Za-zÀ-ÿ0-9]/g, " ").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()) || "?";
      return `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:14px;border:1px solid var(--line);border-radius:16px;background:var(--card);box-shadow:0 1px 6px rgba(13,27,42,.05);">
        <div style="display:flex;gap:12px;min-width:0;">
          <div style="width:46px;height:46px;border-radius:14px;flex:0 0 auto;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:15px;background:linear-gradient(150deg,var(--petrol),var(--sage));">${escapeHtml(initials)}</div>
          <div style="display:flex;flex-direction:column;gap:3px;min-width:0;overflow-wrap:anywhere;word-break:break-word;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><strong style="color:var(--text);">${escapeHtml(s.nom)}</strong><span class="pill" style="background:var(--soft,#EEF3F2);">${escapeHtml(s.type)}</span></div>
            ${s.adresse ? `<span style="color:var(--muted);font-size:13px;">${escapeHtml(s.adresse)}</span>` : ""}
            ${s.telephone ? `<small style="color:var(--muted);display:flex;align-items:center;gap:5px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>${escapeHtml(s.telephone)}</small>` : ""}
            ${s.email ? `<small style="color:var(--muted);display:flex;align-items:center;gap:5px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>${escapeHtml(s.email)}</small>` : ""}
            ${s.delai !== "" ? `<small style="color:var(--muted);display:flex;align-items:center;gap:5px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>Délai de paiement moyen : ${s.delai} jours</small>` : ""}
          </div>
        </div>
        <div style="display:flex;gap:6px;flex:0 0 auto;">
          <button class="ghost" type="button" data-societe-edit="${escapeHtml(s.id)}" title="Modifier" style="padding:8px 10px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
          <button class="delete" type="button" data-societe-delete="${escapeHtml(s.id)}" title="Supprimer" style="padding:8px 10px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6"/><path d="M10 11v6M14 11v6"/></svg></button>
        </div>
      </div>`;
    }).join("") + `</div>`;
}

async function saveSociete(e) {
  e.preventDefault();
  if (!currentUser) { toast("Connecte-toi pour enregistrer une société."); return; }
  const editId = $("societeEditId").value;
  const payload = {
    user_id: currentUser.id,
    nom: $("societeNom").value.trim(),
    type: $("societeType").value,
    adresse: $("societeAdresse").value.trim() || null,
    telephone: $("societeTel").value.trim() || null,
    email: $("societeEmail").value.trim() || null,
    siret: $("societeSiret").value.trim() || null,
    delai_paiement: $("societeDelai").value ? Number($("societeDelai").value) : null
  };
  const result = editId
    ? await sb.from("societes").update(payload).eq("id", editId)
    : await sb.from("societes").insert(payload);
  if (result.error) { toast("Erreur sauvegarde : " + result.error.message); return; }
  resetSocieteForm();
  await loadSocietes();
  toast("Société enregistrée ✓", "success");
}

function resetSocieteForm() {
  if ($("societeForm")) $("societeForm").reset();
  if ($("societeEditId")) $("societeEditId").value = "";
  if ($("societeCancelEdit")) $("societeCancelEdit").style.display = "none";
  if ($("societeAddBlock")) $("societeAddBlock").open = false;
  const submit = document.querySelector("#societeForm button[type='submit']");
  if (submit) submit.textContent = "Enregistrer la société";
}

function editSociete(id) {
  const s = societes.find((x) => String(x.id) === String(id));
  if (!s) return;
  $("societeEditId").value = s.id;
  $("societeNom").value = s.nom;
  $("societeType").value = s.type;
  $("societeAdresse").value = s.adresse;
  $("societeTel").value = s.telephone;
  $("societeEmail").value = s.email;
  $("societeSiret").value = s.siret;
  $("societeDelai").value = s.delai;
  if ($("societeCancelEdit")) $("societeCancelEdit").style.display = "";
  const submit = document.querySelector("#societeForm button[type='submit']");
  if (submit) submit.textContent = "Mettre à jour la société";
  { const _cm = $("aeClientsModal"); if (_cm) { _aeDashCSS(); _cm.classList.add("open"); } }
  if ($("societeAddBlock")) $("societeAddBlock").open = true;
  $("societeNom").scrollIntoView({ behavior: "smooth", block: "center" });
}

async function deleteSociete(id) {
  if (!(await confirmDialog("Supprimer cette société du carnet ?"))) return;
  const { error } = await sb.from("societes").delete().eq("id", id);
  if (error) { toast("Erreur suppression : " + error.message); return; }
  await loadSocietes();
}

// Sélection d'une société dans le formulaire de facture → remplit client + adresse
function onSocieteSelectChange() {
  const id = $("aeSocieteSelect")?.value;
  if (!id) return;
  const s = societes.find((x) => String(x.id) === String(id));
  if (!s) return;
  if ($("aeClient")) $("aeClient").value = s.nom;
  if ($("aeClientAddress")) $("aeClientAddress").value = s.adresse || "";
}

function money(n) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n || 0);
}

function formatDate(s) {
  return new Date(s + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatPeriod(a, b) {
  return !b || a === b ? formatDate(a) : formatDate(a) + " -> " + formatDate(b);
}

function todayDateOnly() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysInclusive(a, b) { return Math.max(1, Math.round((b - a) / 86400000) + 1); }

function missionDayCount(mission) {
  const start = new Date(mission.date + "T00:00:00");
  const end = new Date((mission.endDate || mission.date) + "T00:00:00");
  return daysInclusive(start, end);
}

function isDateInPeriod(dateStr, mission) {
  return dateStr >= mission.date && dateStr <= (mission.endDate || mission.date);
}

function overlapsMonth(mission, ref) {
  const year = ref.getFullYear(), month = ref.getMonth();
  const start = new Date(mission.date + "T00:00:00");
  const end = new Date((mission.endDate || mission.date) + "T00:00:00");
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59);
  return start <= monthEnd && end >= monthStart;
}

function monthMissions(ref) { return missions.filter((m) => overlapsMonth(m, ref)); }

function splitMissionByTime(mission) {
  const start = new Date(mission.date + "T00:00:00");
  const end = new Date((mission.endDate || mission.date) + "T00:00:00");
  const today = todayDateOnly();
  const totalHours = Number(mission.hours || 0);
  if (end < today) return { done: totalHours, planned: 0 };
  if (start > today) return { done: 0, planned: totalHours };
  const totalDays = daysInclusive(start, end);
  const doneDays = daysInclusive(start, today);
  const done = Math.min(totalHours, Math.round(totalHours * (doneDays / totalDays) * 10) / 10);
  return { done, planned: Math.max(0, Math.round((totalHours - done) * 10) / 10) };
}

function sumDone(list) { return list.reduce((total, m) => total + splitMissionByTime(m).done, 0); }
function sumPlanned(list) { return list.reduce((total, m) => total + splitMissionByTime(m).planned, 0); }
function sumMissionDays(list) { return list.reduce((total, m) => total + missionDayCount(m), 0); }
// Jours d'une mission qui tombent DANS le mois de référence (1 vacation = 1 jour de mission, borné au mois).
function missionDaysInMonth(m, ref) {
  const y = ref.getFullYear(), mo = ref.getMonth();
  const ms = new Date(y, mo, 1), me = new Date(y, mo + 1, 0);
  const s = new Date(m.date + "T00:00:00"), e = new Date((m.endDate || m.date) + "T00:00:00");
  const a = s > ms ? s : ms, b = e < me ? e : me;
  return b < a ? 0 : daysInclusive(a, b);
}
function sumMonthVac(list, ref) {
  // Régime général exclu (pas une vacation d'intermittence). Cachet : cachets réellement travailles dans le mois.
  // Sinon : vacations SAISIES proratisees au mois (pas les jours de periode) — parite avec l'app.
  const mS = new Date(ref.getFullYear(), ref.getMonth(), 1).getTime();
  const mE = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getTime();
  return Math.round(list.reduce((total, m) => {
    if ((m.regime || "intermittence") === "general") return total;
    const cd = m.cachet_days;
    if (cd && typeof cd === "object" && !Array.isArray(cd)) { let c = 0; for (const k in cd) { const t = new Date(k + "T00:00:00").getTime(); if (t >= mS && t <= mE) c += Number(cd[k]) || 0; } return total + c; }
    const inM = missionDaysInMonth(m, ref);
    if (m.type === "Saisie rapide") return total + (inM > 0 ? (Number(m.vacations) || 1) : 0);
    const v = Number(m.vacations);
    return total + (v > 0 ? v * (inM / Math.max(1, missionDayCount(m))) : inM);
  }, 0));
}
// Sépare, pour le mois, les jours « technicien » (heures) des « cachets » (artiste), demi-cachets inclus.
// Sert au Dashboard : afficher les cachets dès qu'il y en a (artiste seul → Cachets ; les deux → Vacations + Cachets).
function sumMonthSplit(list, ref) {
  const mS = new Date(ref.getFullYear(), ref.getMonth(), 1).getTime();
  const mE = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getTime();
  let techVac = 0, cachets = 0;
  list.forEach((m) => {
    if ((m.regime || "intermittence") === "general") return;
    const cd = m.cachet_days;
    if (cd && typeof cd === "object" && !Array.isArray(cd)) {
      let c = 0; for (const k in cd) { const t = new Date(k + "T00:00:00").getTime(); if (t >= mS && t <= mE) c += Number(cd[k]) || 0; }
      cachets += c; return;
    }
    const inM = missionDaysInMonth(m, ref);
    const val = m.type === "Saisie rapide" ? (inM > 0 ? (Number(m.vacations) || 1) : 0)
      : (Number(m.vacations) > 0 ? Number(m.vacations) * (inM / Math.max(1, missionDayCount(m))) : inM);
    if (missionIsCachet(m)) cachets += val; else techVac += val;
  });
  return { techVac: Math.round(techVac * 10) / 10, cachets: Math.round(cachets * 10) / 10 };
}

function getProductionInitials(name) {
  return String(name || "---").replace(/[^a-zA-ZÀ-ÿ0-9\s]/g," ").trim().split(/\s+/).join("").slice(0, 3).toUpperCase() || "---";
}


function renderFiscalite(yearGross, yearMissions) {
  const profileType = getProfileType();
  const arePercue = getArePercue();
  const congesInput = getCongesSpectaclesInput();
  const congesSpec = congesInput !== "" ? Number(congesInput) : Math.round(yearGross * 0.10);
  const otherIncome = getOtherIncome();
  const taxParts = getTaxParts();
  const totalKmAmount = yearMissions.reduce((a, x) => a + Number(x.kmAmount || 0), 0);
  const autresFrais = getAutresFraisReels();

  // Restaurer valeurs dans les champs
  if ($("profileType") && !$("profileType").dataset.init) {
    $("profileType").value = profileType;
    $("profileType").dataset.init = "1";
  }
  if ($("arePercue") && !$("arePercue").dataset.init) {
    if (arePercue) $("arePercue").value = arePercue;
    $("arePercue").dataset.init = "1";
  }
  if ($("congesSpectaclesInput") && !$("congesSpectaclesInput").dataset.init) {
    if (congesInput !== "") $("congesSpectaclesInput").value = congesInput;
    $("congesSpectaclesInput").dataset.init = "1";
  }
  if ($("otherIncomeInput") && !$("otherIncomeInput").dataset.init) {
    const s = otherIncome; if (s) $("otherIncomeInput").value = s;
    $("otherIncomeInput").dataset.init = "1";
  }
  if ($("taxPartsInput") && !$("taxPartsInput").dataset.init) {
    const s = taxParts; if (s) $("taxPartsInput").value = s;
    $("taxPartsInput").dataset.init = "1";
  }
  if ($("autresFraisReels") && !$("autresFraisReels").dataset.init) {
    if (autresFrais) $("autresFraisReels").value = autresFrais;
    $("autresFraisReels").dataset.init = "1";
  }

  // Profils fiscaux — IDENTIQUES à lib/calcul.ts de l'appli. Ne pas diverger.
  // Règles vérifiées sur sources primaires (CGI art. 83, 3° + BOI-RSA-BASE-30-50-30-30), revenus 2025.
  const profil = PROFILS_FISCAUX_SITE[migrerProfilFiscalSite(profileType)];

  if ($("profileHint")) $("profileHint").textContent = profil.hint;
  if ($("profileAbattementInfo")) {
    $("profileAbattementInfo").className = "fi-info-box";
    $("profileAbattementInfo").innerHTML =
      `<strong>ℹ️ ${profil.label}</strong>${profil.hint}`
      + `<div style="margin-top:9px;padding-top:9px;border-top:1px solid var(--line);font-size:11.5px;line-height:1.55;">`
      + `<strong>Deux régimes, jamais cumulés :</strong> le <strong>forfait de 10 %</strong> OU les <strong>frais réels</strong>. Pour un artiste, les frais réels = <strong>14 % + 5 %</strong> (forfaits spécifiques) <strong>+ tes autres frais</strong> (transport, repas, local pro, cotisations…). L'appli additionne tout ça et retient le régime le plus avantageux. Saisis tes dépenses ci-dessous (hors instruments/vestimentaire, déjà couverts par le 14 %/5 %).`
      + `<br><a href="https://www.impots.gouv.fr/particulier/questions/comment-puis-je-deduire-mes-frais-professionnels" target="_blank" rel="noopener" style="color:var(--petrol);font-weight:800;text-decoration:underline;">Barème & règles officielles — impots.gouv.fr ↗</a>`
      + `</div>`;
  }

  // Calcul net imposable
  const netSalaires = Math.round(yearGross * profil.netCoeff);
  const netAre = arePercue; // ARE = net imposable direct
  const netConges = Math.round(congesSpec * 0.88); // ~12% cotisations sur congés
  const netTotal = netSalaires + netAre + netConges + otherIncome;
  const fraisSaisis = fraisTotalForYear(_fiscalYear);
  const totalFraisReels = totalKmAmount + autresFrais + fraisSaisis;

  // FORFAIT 10 %  vs  FRAIS RÉELS. Pour un artiste, les frais réels = 14 %+5 % (forfaits spécifiques A+B,
  // source SNAM-CGT / BOFiP) + les AUTRES frais réels saisis (transport, repas, local, cotisations… = C+D).
  // Les deux régimes ne se cumulent jamais → on garde le plus avantageux.
  const forfait10 = Math.round(_forfait10(netSalaires));
  const specForfait = Math.round(_fraisReelsSpec(netSalaires, profil.a14, profil.a5)); // 14 % + 5 %
  const fraisReels = specForfait + totalFraisReels; // total frais réels (specs artiste INCLUS)
  const forfait = forfait10; // le seul « forfait » au sens fiscal, c'est le 10 %
  const baseAvecForfait = Math.max(0, netTotal - forfait10);
  const baseAvecReels = Math.max(0, netTotal - fraisReels);
  const bestBase = Math.min(baseAvecForfait, baseAvecReels);
  const useForfait = forfait10 >= fraisReels;

  // CSG/CRDS non déductible (2.4% du brut salaires + 2.4% ARE)
  const csgNonDed = Math.round((yearGross + arePercue) * 0.024);

  // Projections
  const observedMonths = getObservedMissionMonths(yearMissions);
  const projectedGross = estimateAnnualProjection(yearGross, observedMonths);
  const projectedBase = observedMonths > 0
    ? (() => {
        const projNet = Math.round(projectedGross * profil.netCoeff);
        const projDed = useForfait ? _forfait10(projNet) : (_fraisReelsSpec(projNet, profil.a14, profil.a5) + totalFraisReels);
        return Math.max(0, projNet + netAre + netConges + otherIncome - projDed);
      })()
    : bestBase;

  // Impôt
  const taxResult = (bestBase > 0 && taxParts > 0)
    ? calculateProgressiveTax(bestBase, taxParts)
    : null;

  // Update DOM
  if ($("fiscaliteGrossPreview")) $("fiscaliteGrossPreview").textContent = money(yearGross);
  if ($("fiscaliteTotalRevenusPreview")) $("fiscaliteTotalRevenusPreview").textContent =
    money(yearGross + arePercue + congesSpec + otherIncome);
  if ($("fiscaliteNetPreview")) $("fiscaliteNetPreview").textContent = money(netTotal);
  if ($("fiscaliteKmDeductionPreview")) $("fiscaliteKmDeductionPreview").textContent = money(totalKmAmount);
  if ($("fiscaliteAbattementForfait")) $("fiscaliteAbattementForfait").textContent = money(forfait);
  if ($("fiscaliteAbattementForfaitLabel")) $("fiscaliteAbattementForfaitLabel").textContent = profil.label;
  if ($("fiscaliteAbattementReels")) $("fiscaliteAbattementReels").textContent = money(fraisReels);

  if ($("fiscaliteComparaisonBox")) {
    $("fiscaliteComparaisonBox").style.display = "grid";
    $("fiscaliteComparaisonBox").className = "fi-comparaison";
    $("fiscaliteComparaisonBox").innerHTML = `
      <div class="fi-comp-card ${useForfait ? 'winner' : ''}">
        <div class="fi-comp-title">Forfait 10 %</div>
        <span class="fi-comp-badge ${useForfait ? 'rec' : 'alt'}">${useForfait ? '✓ Recommandé' : 'Standard'}</span>
        <span class="fi-comp-amount">${money(forfait10)}</span>
        <div class="fi-comp-detail">10 % du net imposable</div>
      </div>
      <div class="fi-comp-card ${!useForfait && fraisReels > 0 ? 'winner' : ''}">
        <div class="fi-comp-title">Frais réels</div>
        <span class="fi-comp-badge ${!useForfait && fraisReels > 0 ? 'rec' : 'alt'}">${!useForfait && fraisReels > 0 ? '✓ Recommandé' : 'Alternative'}</span>
        <span class="fi-comp-amount">${money(fraisReels)}</span>
        <div class="fi-comp-detail">${specForfait > 0 ? '14 % + 5 % + ' : ''}km + dépenses saisies</div>
      </div>`;
  }

  if ($("fiscaliteOtherIncomePreview")) $("fiscaliteOtherIncomePreview").textContent = money(otherIncome);
  if ($("fiscaliteTotalIncomePreview")) $("fiscaliteTotalIncomePreview").textContent = money(bestBase);
  if ($("fiscaliteCSGPreview")) $("fiscaliteCSGPreview").textContent = money(csgNonDed);

  if ($("fiscaliteProjectionPreview")) {
    $("fiscaliteProjectionPreview").textContent = observedMonths > 0
      ? `${money(projectedBase)} · ${observedMonths} mois`
      : "—";
  }

  if (taxResult) {
    if ($("fiscaliteTaxPreview")) $("fiscaliteTaxPreview").textContent = money(taxResult.estimatedTax);
    if ($("fiscaliteRatePreview")) $("fiscaliteRatePreview").textContent = taxResult.averageRate.toFixed(1).replace(".", ",") + "%";
    if ($("fiscaliteBracketPreview")) $("fiscaliteBracketPreview").textContent = Math.round(taxResult.marginalRate) + "%";
  } else {
    if ($("fiscaliteTaxPreview")) $("fiscaliteTaxPreview").textContent = "Renseigne tes parts";
    if ($("fiscaliteRatePreview")) $("fiscaliteRatePreview").textContent = "—";
    if ($("fiscaliteBracketPreview")) $("fiscaliteBracketPreview").textContent = "—";
  }

  if ($("fiscaliteKmPreview")) $("fiscaliteKmPreview").textContent = Math.round(yearMissions.reduce((a, x) => a + Number(x.kmDistance || 0), 0)) + " km";
  if ($("fiscaliteKmAmountPreview")) $("fiscaliteKmAmountPreview").textContent = money(totalKmAmount);
  if ($("fiscaliteDeclarationPreview")) $("fiscaliteDeclarationPreview").textContent =
    `Net imposable ~${money(netTotal)} · ${useForfait ? "Forfait 10 %" : "Frais réels"} ${money(useForfait ? forfait10 : fraisReels)}`;
  // Auto-remplir SJR carence depuis vacations
  const totalVac = sumMissionDays(yearMissions); // 1 vacation = 1 jour de mission
  const sjrAuto = totalVac > 0 ? yearGross / totalVac : 0;
  if ($("carenceSJM") && !$("carenceSJM").dataset.userEdited && sjrAuto > 0) {
    $("carenceSJM").value = sjrAuto.toFixed(2);
    if ($("carenceSJMHint")) $("carenceSJMHint").textContent =
      "Auto-calculé : " + money(yearGross) + " ÷ " + totalVac + " vacations = " + sjrAuto.toFixed(2).replace(".",",") + " €/vacation";
  }
  if ($("carenceSJM") && !$("carenceSJM").dataset.listenerSet) {
    $("carenceSJM").dataset.listenerSet = "1";
    $("carenceSJM").addEventListener("input", () => { $("carenceSJM").dataset.userEdited = "1"; });
  }
  if ($("previsionConges")) {
    const ecNet = Math.round(yearGross * 0.10 * 0.78);
    $("previsionConges").textContent = yearGross > 0 ? "Environ " + money(ecNet) + " net" : "Estimation indicative";
  }
  if ($("previsionDroits") && typeof remaining !== "undefined") $("previsionDroits").textContent = remaining + "h restantes";

  if ($("fiscalConseilBox") && yearGross > 0) {
    const conseils = [];
    if (!arePercue) conseils.push("💡 Pensez à renseigner votre ARE perçue — elle est imposable.");
    if (!congesInput) conseils.push("💡 Vérifiez vos Congés Spectacles sur audiens.org — ils sont imposables.");
    if (!useForfait && fraisReels > 0) conseils.push("✅ Tes frais réels (14 %+5 % + dépenses) dépassent le forfait 10 %. Déclare-les !");
    if (taxResult && taxResult.marginalRate >= 30) conseils.push("⚠️ Tranche à 30%+ : un conseiller fiscal peut vous aider à optimiser.");
    if (conseils.length) {
      $("fiscalConseilBox").className = "fi-conseil-box";
      $("fiscalConseilBox").innerHTML = conseils.map(c => `<div style="margin-bottom:5px;">${c}</div>`).join("");
    }
  }
}

// Estimation indicative de l'allocation France Travail pour le mois affiché
function renderPoleEmploi(list, salaireNet) {
  const box = $("poleEmploiBox");
  if (!box) return;
  salaireNet = Number(salaireNet) || 0;
  const aj = (typeof _profil !== "undefined" && _profil && Number(_profil.taux_journalier)) || 0;
  if (!aj) {
    box.innerHTML = '<div class="pe-empty">' + ICO.euro + ' <b>Estimation France Travail</b> — renseigne ton <b>taux journalier (AJ)</b> dans <a href="#" id="peProfilLink">Mes informations</a> pour activer ce calcul.</div>';
    const lk = $("peProfilLink"); if (lk) lk.onclick = function(e){ e.preventDefault(); if (typeof openProfilModal === "function") openProfilModal(); };
    return;
  }
  const _frac = function(x){ return missionDaysInMonth(x, current) / missionDayCount(x); }; // prorata : part du mois pour missions à cheval
  const heures = list.reduce(function(a,x){ return a + (Number(x.hours)||0) * _frac(x); }, 0);
  const brutMois = list.reduce(function(a,x){ return a + (Number(x.gross)||0) * _frac(x); }, 0);
  const artiste = (_profil && _profil.annexe === "artiste");
  const coef = artiste ? 1.3 : 1.4, divJ = artiste ? 10 : 8;
  const daysInMonth = new Date(current.getFullYear(), current.getMonth()+1, 0).getDate();
  function clampDays(v){ return Math.max(0, Math.min(daysInMonth, v)); }
  // Jours non indemnisables (formule officielle France Travail) : heures × coef ÷ diviseur.
  // Fourchette ±1 jour (arrondi) pour rester une estimation honnête — MÊME formule que l'appli.
  const jniRaw = heures * coef / divJ;
  const daysHaut = clampDays(daysInMonth - Math.floor(jniRaw)); // moins de JNI → borne haute
  const daysBas  = clampDays(daysInMonth - Math.ceil(jniRaw));  // plus de JNI → borne basse
  // Plafond de cumul : salaire brut du mois + allocation ≤ 118 % du PMSS.
  const PMSS = 4005, PLAFOND_CUMUL = 1.18, plafondCumul = PMSS * PLAFOND_CUMUL;
  const daysPlafond = Math.max(0, Math.ceil((plafondCumul - brutMois) / aj));
  const dHaut = Math.min(daysHaut, daysPlafond), dBas = Math.min(daysBas, daysPlafond);
  const plafondActif = daysPlafond < daysHaut; // le plafond rabote l'allocation ce mois-ci
  const tax = (_profil && Number(_profil.taux_impot)) || 0;
  const fNet = 1 - tax/100, showNet = tax > 0;
  const bas = Math.round(aj * dBas * fNet), haut = Math.round(aj * dHaut * fNet);
  const heuresR = Math.round(heures*10)/10;
  box.innerHTML =
    '<div class="pe-card">' +
      '<div class="pe-head"><span class="pe-label">' + ICO.euro + ' Estimation France Travail (ce mois)</span><span class="pe-val">' + (bas === haut ? ('≈ ' + money(haut)) : ('≈ ' + bas.toLocaleString('fr-FR') + ' – ' + money(haut))) + '</span></div>' +
      '<div class="pe-detail">' + (showNet ? 'fourchette nette (après ' + tax + ' % d\'impôt)' : 'fourchette brute') + ' · basée sur ' + heuresR + ' h ce mois' + (artiste ? ' (artiste, annexe 10)' : ' (technicien, annexe 8)') + '</div>' +
      '<div class="pe-total"><div class="pe-total-row"><span class="pe-total-label">Revenu total estimé ce mois</span><span class="pe-total-val">' + (bas === haut ? ('≈ ' + money(salaireNet + haut)) : ('≈ ' + (salaireNet + bas).toLocaleString('fr-FR') + ' – ' + money(salaireNet + haut))) + '</span></div><div class="pe-total-sub">salaire net ' + money(salaireNet) + ' + allocation France Travail</div></div>' +
      (plafondActif ? '<div class="pe-detail" style="color:#c26a00">Plafond de cumul atteint : salaire + allocation limités à 118 % du PMSS (' + money(Math.round(plafondCumul)) + ') → allocation réduite ce mois-ci.</div>' : '') +
      '<div class="pe-note">Fourchette <b>indicative</b> — nous <b>affinons en continu notre formule</b> pour nous rapprocher au plus près du montant réel (le calcul France Travail est complexe : heures majorées, SJR, carences, plafonds). Ne tient pas compte des <b>carences / franchises</b>. Fiable seulement avec tes <b>vraies heures</b>. Montant exact → ton espace <a href="https://www.francetravail.fr/spectacle/" target="_blank" rel="noopener">France Travail</a>.' + (showNet ? '' : ' <a href="#" id="peTaxLink">Ajouter mon taux d\'impôt</a> pour le net.') + '</div>' +
    '</div>';
  if (!showNet) { const tk = $("peTaxLink"); if (tk) tk.onclick = function(e){ e.preventDefault(); if (typeof openProfilModal === "function") openProfilModal(); }; }
}

function render() {
  const now = new Date();
  const year = now.getFullYear();
  if ($("areAdmissionDate")) $("areAdmissionDate").value = areAdmissionDate || "";
  if ($("areAdmissionInfo") && areAdmissionDate) $("areAdmissionInfo").textContent = "Calcul des heures effectué depuis le " + new Date(areAdmissionDate).toLocaleDateString("fr-FR");
  // Fenêtre « année d'intermittence » : 12 mois depuis l'anniversaire de la date ARE, navigable via aiYearOffset.
  let winStart, winEnd;
  if (areAdmissionDate) {
    const a = new Date(areAdmissionDate + "T00:00:00");
    const today0 = new Date(); today0.setHours(0, 0, 0, 0);
    let k = today0.getFullYear() - a.getFullYear();
    const anniv = new Date(a); anniv.setFullYear(a.getFullYear() + k);
    // >= : le jour anniversaire appartient à l'année qui SE TERMINE ce jour-là (compté jusqu'à la date
    // anniversaire INCLUSE, cf. France Travail — retour Perrine), pas à la nouvelle année.
    if (anniv >= today0) k -= 1;
    k += aiYearOffset;                    // navigation historique (offset ≤ 0)
    winStart = new Date(a); winStart.setFullYear(a.getFullYear() + k);
    winEnd = new Date(a);   winEnd.setFullYear(a.getFullYear() + k + 1);
  } else {
    winStart = new Date(year, 0, 1);
    winEnd = new Date(year + 1, 0, 1);
  }
  const _winS = winStart.getTime(), _winE = winEnd.getTime();
  // Année d'intermittence = borne de fin INCLUSE (le jour anniversaire compte), borne de début exclue.
  // Année civile = [1er janv, 1er janv[.
  const _inWinT = (t) => areAdmissionDate ? (t > _winS && t <= _winE) : (t >= _winS && t < _winE);
  const inWin = (ds) => _inWinT(new Date(ds + "T00:00:00").getTime());
  // Split effectué/prévu EN NE COMPTANT QUE les jours de la mission DANS l'année d'intermittence courante.
  // Corrige les contrats MULTI-JOURS à cheval sur la date anniversaire (les jours après l'anniversaire
  // étaient perdus — retour user). frac = part de la mission dans la fenêtre.
  const _winSplit = (m) => {
    const s = new Date(m.date + "T00:00:00").getTime();
    const e = new Date((m.endDate || m.date) + "T00:00:00").getTime();
    const tot = Number(m.hours || 0);
    const totalDays = Math.max(1, Math.round((e - s) / 86400000) + 1);
    const perDay = tot / totalDays, tT = todayDateOnly().getTime();
    let done = 0, planned = 0, inDays = 0;
    for (let i = 0; i < totalDays; i++) { const d = s + i * 86400000; if (!_inWinT(d)) continue; inDays++; if (d <= tT) done += perDay; else planned += perDay; }
    return { done: Math.round(done * 10) / 10, planned: Math.round(planned * 10) / 10, frac: inDays / totalDays };
  };
  const areStartDate = winStart; // borne basse de la période (formation)
  const yearMissions = missions.filter((m) => _winSplit(m).frac > 0);
  // Navigation « année d'intermittence » (flèches + libellé de période)
  const _aiNav = $("aiNav");
  if (_aiNav) {
    if (areAdmissionDate) {
      _aiNav.style.display = "flex";
      if ($("areAdmissionInfo")) $("areAdmissionInfo").style.display = "none";
      const _fmt = (d) => { const p = (n) => String(n).padStart(2, "0"); return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear(); };
      if ($("aiPeriod")) $("aiPeriod").textContent = _fmt(winStart) + " → " + _fmt(winEnd);
      if ($("aiPeriodSub")) $("aiPeriodSub").textContent = aiYearOffset === 0 ? "Année d'intermittence en cours" : (aiYearOffset === -1 ? "Année précédente" : "Il y a " + (-aiYearOffset) + " ans");
      if ($("aiNext")) $("aiNext").style.opacity = aiYearOffset >= 0 ? "0.25" : "1";
    } else {
      _aiNav.style.display = "none";
      if ($("areAdmissionInfo")) $("areAdmissionInfo").style.display = "";
    }
  }
  const selectedMonthMissions = monthMissions(current);
  // Régime de la mission (colonne Supabase, défaut 'intermittence' → les missions déjà saisies ne bougent pas).
  const _regOf = (m) => m.regime || "intermittence";
  // Seules les missions d'intermittence (annexes 8/10) alimentent les heures effectuées / prévues.
  const _interMissions = yearMissions.filter((m) => _regOf(m) === "intermittence");
  const yearHours = Math.round(_interMissions.reduce((a, m) => a + _winSplit(m).done, 0) * 10) / 10;
  // Répartition ARTISTE (cachet) vs TECHNICIEN (heures) — déduite du mode de saisie de chaque mission
  // (cachet : heures ≈ vacations × 12 ; heures : sinon). Retour user : savoir vers quel statut on penche.
  (function () {
    const box = $("regimeSplitBox"); if (!box) return;
    let techH = 0, artH = 0, artCachets = 0;
    _interMissions.forEach((m) => {
      const f = _winSplit(m).frac; const h = (Number(m.hours) || 0) * f, v = (Number(m.vacations) || 0) * f; // au prorata des jours dans l'année
      if (missionIsCachet(m)) { artH += h; artCachets += v; } else { techH += h; }
    });
    // On n'affiche le split QUE si l'utilisateur fait LES DEUX (sinon inutile pour un pur technicien/artiste). Retour Yohan.
    if (!(techH > 0 && artH > 0)) { box.style.display = "none"; return; }
    box.style.display = "block";
    if ($("splitTech")) $("splitTech").textContent = (Math.round(techH * 10) / 10) + " h";
    if ($("splitArt")) $("splitArt").textContent = (Math.round(artCachets * 10) / 10) + " cachet" + (artCachets > 1 ? "s" : "") + " (" + (Math.round(artH * 10) / 10) + " h)";
    if ($("splitHint")) $("splitHint").textContent =
      (artH > 0 && techH > 0) ? (artH >= techH ? "Tu fais surtout de l'artiste — tu penches vers l'annexe 10." : "Tu fais surtout du technicien — tu penches vers l'annexe 8.")
      : (artH > 0 ? "100 % artiste (annexe 10)." : "100 % technicien (annexe 8).");
  })();
  const plannedHours = Math.round(_interMissions.reduce((a, m) => a + _winSplit(m).planned, 0) * 10) / 10;
  // Heures de formation dans la période de droits (plafonnées à 338 h pour les 507 h).
  const formationRaw = Math.round((typeof getNotes === "function" ? getNotes() : []).filter((n) => n.kind === "formation" && inWin(n.date)).reduce((a, n) => a + (Number(n.hours) || 0), 0) * 10) / 10;
  const formationHours = Math.min(formationRaw, FORM_CAP);
  // Enseignement dispensé : compte dans les 507 h, plafonné à ENS_CAP *et* dans les 338 h GLOBALES
  // qu'il partage avec la formation suivie (règle France Travail). Le régime général « pur » n'y entre pas.
  const enseignementRaw = Math.round(yearMissions.filter((m) => _regOf(m) === "enseignement").reduce((a, m) => a + (Number(m.hours) || 0) * _winSplit(m).frac, 0) * 10) / 10;
  const enseignementHours = Math.round(Math.min(enseignementRaw, ENS_CAP, Math.max(0, FORM_CAP - formationHours)) * 10) / 10;
  // Prorata : une mission à cheval sur 2 mois ne compte que sa part de jours DANS le mois affiché (heures ET brut suivent les vacations).
  const monthFrac = (m) => missionDaysInMonth(m, current) / missionDayCount(m);
  const monthHours = Math.round(selectedMonthMissions.reduce((total, m) => total + Number(m.hours || 0) * monthFrac(m), 0) * 10) / 10;
  const yearGross = yearMissions.reduce((a, x) => a + Number(x.gross || 0), 0);
  // FISCALITÉ = année CIVILE (impôts), TOUJOURS — jamais la fenêtre « année d'intermittence ».
  // Sinon, dès qu'une date ARE est posée, le récap fiscal (dont les km) glissait sur les 12 mois
  // depuis l'anniversaire des droits au lieu de l'année civile (bug confirmé, retour JB 16/07).
  // Sans date ARE, yearMissions vaut déjà l'année civile → aucun changement pour ces utilisateurs.
  const _fyS = new Date(_fiscalYear, 0, 1).getTime(), _fyE = new Date(_fiscalYear + 1, 0, 1).getTime();
  const fiscalMissions = missions.filter((m) => { const t = new Date((m.date) + "T00:00:00").getTime(); return t >= _fyS && t < _fyE; });
  const fiscalGross = fiscalMissions.reduce((a, x) => a + Number(x.gross || 0), 0);
  // Sélecteur d'année fiscale : libellé + flèche « suivant » plafonnée à l'année en cours.
  const _nowFY = new Date().getFullYear();
  if ($("fyVal")) $("fyVal").textContent = _fiscalYear;
  if ($("fyCap")) $("fyCap").textContent = _fiscalYear === _nowFY ? "Année en cours" : "Revenus " + _fiscalYear;
  if ($("fyNext")) $("fyNext").style.opacity = _fiscalYear >= _nowFY ? ".3" : "1";
  if ($("fyEmpty")) { if (!fiscalMissions.length) { $("fyEmpty").style.display = "block"; $("fyEmpty").textContent = "Aucune mission saisie en " + _fiscalYear + "."; } else $("fyEmpty").style.display = "none"; }
  const monthGross = Math.round(selectedMonthMissions.reduce((a, x) => a + Number(x.gross || 0) * monthFrac(x), 0));
  const percent = Math.round((yearHours / OBJECTIVE_HOURS) * 100);
  const remaining = Math.max(0, Math.round((OBJECTIVE_HOURS - yearHours - plannedHours - formationHours - enseignementHours) * 10) / 10);

  if ($("yearHours")) $("yearHours").textContent = yearHours;
  if ($("monthHours")) $("monthHours").textContent = monthHours + "h";
  // Net à payer estimé = brut − charges salariales − impôt (taux d'impôt du PROFIL, comme l'appli — synchro app↔site).
  const _tauxImpotDash = (typeof _profil !== "undefined" && _profil && Number(_profil.taux_impot)) || 0;
  const monthNet = Math.round(monthGross * (1 - getChargeRate() / 100) * (1 - _tauxImpotDash / 100));
  if ($("monthNet")) $("monthNet").textContent = money(monthNet);
  if ($("monthGross")) $("monthGross").textContent = "Brut " + money(monthGross);
  renderPoleEmploi(selectedMonthMissions, monthNet);
  renderMontantsReels(selectedMonthMissions, current);
  if ($("recapMonthPicker")) $("recapMonthPicker").value = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
  const monthRate = monthHours > 0 ? Math.round(monthGross / monthHours) : 0;
  const monthRateNet = monthHours > 0 ? Math.round(monthNet / monthHours) : 0;
  if ($("monthRateNet")) $("monthRateNet").textContent = money(monthRateNet) + "/h";
  if ($("monthRate")) $("monthRate").textContent = "Brut " + money(monthRate) + "/h";
  checkAndShowNotification(remaining, yearHours);
  if ($("remainingHours")) $("remainingHours").textContent = remaining;
  if ($("plannedHours")) $("plannedHours").textContent = plannedHours;
  if ($("missionCount")) {
  const sp = sumMonthSplit(selectedMonthMissions, current); // { techVac, cachets } du mois (demi-cachets inclus)
  const _artProfile = (typeof _profil !== "undefined" && _profil && _profil.annexe === "artiste");
  const lesDeux = sp.cachets > 0 && sp.techVac > 0;
  // Case principale = Cachets si l'utilisateur ne fait QUE du cachet (ou profil artiste sans mission ce mois), sinon Vacations.
  const showCachetMain = (sp.cachets > 0 && sp.techVac === 0) || (sp.cachets === 0 && sp.techVac === 0 && _artProfile);
  $("missionCount").textContent = showCachetMain ? sp.cachets : sp.techVac;
  if ($("vacLabelDash")) $("vacLabelDash").textContent = showCachetMain ? "Cachets" : "Vacations";
  // Case Cachets EN PLUS : uniquement quand il fait les deux (technicien + cachets), pour qu'il voie ses cachets à part.
  if ($("cachetStatDash")) $("cachetStatDash").style.display = lesDeux ? "" : "none";
  if (lesDeux && $("cachetCountDash")) $("cachetCountDash").textContent = sp.cachets;
}
  if ($("progressText")) $("progressText").textContent = percent + "% de ton objectif intermittent" + (plannedHours > 0 ? (" · " + Math.round(((yearHours + plannedHours + formationHours + enseignementHours) / OBJECTIVE_HOURS) * 100) + "% en comptant tes dates à venir") : "");
  // Barre "année d'intermittence" : % de l'année écoulée + avance/retard (parité app).
  if ($("aiPaceBox")) {
    if (areAdmissionDate) {
      const _now = Date.now();
      const elapsed = aiYearOffset < 0 ? 1 : Math.max(0, Math.min(1, (_now - _winS) / (_winE - _winS)));
      // On compte AUSSI les dates à venir (prévu), pour être cohérent avec le grand % de la jauge :
      // sinon un user à 93 % (avec ses dates bookées) voyait « en retard » sur ses seules heures validées.
      const prog = Math.max(0, Math.min(1, (yearHours + plannedHours + formationHours + enseignementHours) / OBJECTIVE_HOURS));
      const diff = prog - elapsed;
      // Vert = en avance · rouge = en retard · orange = dans les temps (mêmes seuils/couleurs que l'app).
      const lbl = Math.abs(diff) <= 0.03 ? "Dans les temps" : (diff > 0 ? "En avance" : "En retard");
      const col = Math.abs(diff) <= 0.03 ? "#E8650A" : (diff > 0 ? "#2F7A4F" : "#E53E3E");
      // Repères des mois aux VRAIES limites de mois (1er du mois) dans la fenêtre, comme l'app.
      const _MON = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
      const _span = Math.max(1, _winE - _winS);
      const _marks = [{ frac: 0, label: _MON[winStart.getMonth()] }];
      let _md = new Date(winStart.getFullYear(), winStart.getMonth() + 1, 1);
      while (_md.getTime() < _winE) { _marks.push({ frac: (_md.getTime() - _winS) / _span, label: _MON[_md.getMonth()] }); _md = new Date(_md.getFullYear(), _md.getMonth() + 1, 1); }
      let _mh = "", _lastLF = -1;
      for (const _mk of _marks) { if (_mk.frac - _lastLF >= 0.05) { _mh += '<span style="position:absolute;left:' + Math.min(94, _mk.frac * 100) + '%;font-size:8.5px;font-weight:700;color:var(--muted);">' + _mk.label + "</span>"; _lastLF = _mk.frac; } }
      if ($("aiPaceMonths")) $("aiPaceMonths").innerHTML = _mh;
      // Traits verticaux à chaque mois (l'effet « hachuré » de l'app).
      let _th = "";
      for (let _t = 1; _t < _marks.length; _t++) { _th += '<span style="position:absolute;top:0;bottom:0;width:1px;background:rgba(45,55,72,0.18);left:' + (_marks[_t].frac * 100) + '%;"></span>'; }
      if ($("aiPaceTicks")) $("aiPaceTicks").innerHTML = _th;
      if ($("aiPaceFill")) { $("aiPaceFill").style.width = Math.round(elapsed * 100) + "%"; $("aiPaceFill").style.background = col; }
      // PROJECTION « à ce rythme, 507 h vers [mois] » (remplace le « % de l'année écoulée »).
      // Extrapolation linéaire : heures comptées jusqu'ici ÷ jours écoulés = rythme → date des 507 h.
      const _MONF = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
      let _projTxt;
      if (aiYearOffset === 0 && _now >= _winS && _now < _winE) {
        const _realized = yearHours + formationHours + enseignementHours; // heures VALIDÉES → servent au rythme
        const _known = _realized + plannedHours;                          // + dates déjà posées → comptées aussi
        const _elapsedDays = Math.max(1, (_now - _winS) / 86400000);
        if (_realized >= OBJECTIVE_HOURS) {
          _projTxt = "🎉 Tes 507 h sont atteintes";
        } else if (_known >= OBJECTIVE_HOURS) {
          _projTxt = "Avec tes dates déjà posées, tu atteins tes 507 h ✓";
        } else {
          const _ratePerDay = _realized / _elapsedDays;
          if (_ratePerDay <= 0) {
            _projTxt = "Ajoute des missions pour estimer ta date des 507 h";
          } else {
            const _projMs = _now + ((OBJECTIVE_HOURS - _known) / _ratePerDay) * 86400000;
            _projTxt = _projMs > _winE
              ? "À ce rythme, 507 h non atteintes cette année"
              : "À ce rythme : 507 h vers " + _MONF[new Date(_projMs).getMonth()] + " " + new Date(_projMs).getFullYear();
          }
        }
      } else {
        _projTxt = Math.round(elapsed * 100) + "% de l'année écoulée";
      }
      if ($("aiPaceStatus")) $("aiPaceStatus").innerHTML = _projTxt + " · <span style=\"color:" + col + "\">" + lbl + "</span>";
      $("aiPaceBox").style.display = "block";
    } else { $("aiPaceBox").style.display = "none"; }
  }
  renderFiscalite(fiscalGross, fiscalMissions);

  renderChart(yearHours, plannedHours, formationHours, enseignementHours);
  ;
  renderAllMissions();
  renderCalendar();
  renderActualisation();renderHistory()
  renderDocuments();
  populateDatalists();
}

// Remplit les listes d'autocomplétion (production / émission) à partir des missions déjà saisies.
function populateDatalists() {
  const esc = (s) => String(s).replace(/"/g, "&quot;");
  const uniq = (key) => [...new Set(missions.map((m) => (m[key] || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "fr"));
  const pl = $("productionsList"), el = $("emissionsList"), ll = $("lieuxList");
  if (pl) pl.innerHTML = uniq("production").map((v) => `<option value="${esc(v)}"></option>`).join("");
  if (el) el.innerHTML = uniq("emission").map((v) => `<option value="${esc(v)}"></option>`).join("");
  if (ll) ll.innerHTML = uniq("lieu").map((v) => `<option value="${esc(v)}"></option>`).join("");
}
function showAppNotification(type, icon, title, text, progressPct, progressColor) {
  const existing = document.getElementById("appNotif");
  if (existing) existing.remove();

  const notif = document.createElement("div");
  notif.id = "appNotif";
  notif.className = `app-notif ${type}`;
  notif.innerHTML = `
    <span class="app-notif-icon">${icon}</span>
    <div class="app-notif-body">
      <div class="app-notif-title">${title}</div>
      <div class="app-notif-text">${text}</div>
      ${progressPct !== null ? `
        <div class="app-notif-progress">
          <div class="app-notif-fill" style="width:${progressPct}%;background:${progressColor}"></div>
        </div>` : ""}
    </div>
    <span class="app-notif-close">✕</span>
  `;
  notif.addEventListener("click", () => notif.remove());
  document.body.appendChild(notif);
  setTimeout(() => { if (document.getElementById("appNotif")) notif.remove(); }, 8000);
}

function checkAndShowNotification(remaining, yearHours) {
  // Cohérence : les notifs d'éligibilité se basent sur les heures RÉELLEMENT effectuées (yearHours),
  // pas sur le prévisionnel. Sinon on affichait « 440h effectuées, plus que 0h » (le prévisionnel
  // prévu+formation atteignait 507, mais pas le réalisé). Retour Xabi. On recalcule le restant ici.
  remaining = Math.max(0, Math.round((507 - yearHours) * 10) / 10);
  const totalVac = Math.round(yearHours / 8);
  const remainingVac = Math.round(remaining / 8);
  const pct = Math.round((yearHours / 507) * 100);

  // ── 507h atteintes ────────────────────────────────────────────
  if (yearHours >= 507) {
    const key = 'notif_eligible';
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, '1');
      showAppNotification("success", "🎉",
        "Félicitations ! Vous êtes éligible",
        `Vous avez validé vos 507h soit ${totalVac} vacations. Pensez à contacter France Travail.`,
        100, "#22C55E");
    }
    return;
  }

  // ── Notifications existantes (remaining <= 100) ───────────────
  if (remaining <= 30) {
    const key = `notif_sprint_${Math.floor(remaining)}`;
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, '1');
      showAppNotification("urgent", "⚠️",
        `Sprint final — encore ${remaining}h !`,
        `${yearHours}h effectuées. Il ne te manque plus que ${remaining}h pour être éligible.`,
        pct, "#EF4444");
    }
    return;
  }
  if (remaining <= 100) {
    const key = `notif_warning_${Math.floor(remaining)}`;
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, '1');
      showAppNotification("warning", "🔥",
        `Plus que ${remaining}h pour valider tes droits !`,
        `Tu es à ${yearHours}h sur 507h. Continue comme ça, tu y es presque.`,
        pct, "#F97316");
    }
    return;
  }

  // ── Avant 400h : encouragements ──────────────────────────────
  const milestones = [
    { h: 50,  icon: '🎬', title: '50h effectuées !',
      msg: `${totalVac} vacations au compteur — tu démarres bien !` },
    { h: 150, icon: '💪', title: '150h effectuées !',
      msg: `${totalVac} vacations faites. Beau rythme, continue !` },
    { h: 250, icon: '🔥', title: '250h effectuées !',
      msg: `${totalVac} vacations au compteur — tu avances sérieusement !` },
    { h: 350, icon: '⭐', title: '350h effectuées !',
      msg: `${totalVac} vacations. La ligne d'arrivée approche !` },
  ];
  for (const m of milestones) {
    if (yearHours >= m.h && yearHours < 400) {
      const key = `notif_milestone_${m.h}`;
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, '1');
        showAppNotification('info', m.icon, m.title, m.msg, pct, '#1A7FA8');
        return;
      }
    }
  }

  // ── Sprint 400h → 507h ────────────────────────────────────────
  const sprint = [
    { h: 400, icon: '⚡', title: 'Sprint final lancé !',
      msg: () => `${remaining}h restantes soit ${remainingVac} vacations. Tu y es presque !`,
      color: '#F59E0B' },
    { h: 450, icon: '🔥', title: 'Dernière ligne droite !',
      msg: () => `Il te reste ${remaining}h soit ${remainingVac} vacations. Accroche-toi !`,
      color: '#F97316' },
    { h: 480, icon: '🚨', title: 'Presque là !',
      msg: () => `Plus que ${remaining}h soit ${remainingVac} vacation${remainingVac > 1 ? 's' : ''}. Ne lâche pas !`,
      color: '#EF4444' },
  ];
  for (const m of sprint) {
    const key = `notif_sprint_${m.h}`;
    if (yearHours >= m.h && !localStorage.getItem(key)) {
      localStorage.setItem(key, '1');
      showAppNotification('warning', m.icon, m.title, m.msg(), pct, m.color);
      return;
    }
  }

  // ── Rappels actualisation (inchangés) ────────────────────────
  const today = new Date();
  const day = today.getDate();
  const monthKey = `${today.getFullYear()}_${today.getMonth()}`;
  const actuKey = `notif_actua_${monthKey}_${day}`;
  if (!localStorage.getItem(actuKey)) {
    localStorage.setItem(actuKey, '1');
    if (day === 15) {
      showAppNotification('urgent', '🚨', 'Dernier jour pour actualiser !',
        "C'est le 15 — dernière chance pour déclarer sur France Travail avant minuit.", null, null);
    } else if (day === 14) {
      showAppNotification('urgent', '⏰', "Plus qu'1 jour pour actualiser !",
        "Demain c'est le 15, dernier délai. Votre récap est prêt dans l'onglet Actualisation.", null, null);
    } else if (day === 12) {
      showAppNotification('warning', '📅', 'Actualisation — 3 jours restants',
        "Deadline le 15. Votre récap du mois est prêt dans l'onglet Actualisation.", null, null);
    } else if (day === 28) {
      showAppNotification('info', '📣', "C'est l'heure de l'actualisation !",
        "L'actualisation est ouverte depuis aujourd'hui jusqu'au 15. Votre récap est prêt.", null, null);
    }
  }
}
  // Rappel actualisation France Travail (28 du mois → 15 du mois suivant)
  const today = new Date();
  const dayOfMonth = today.getDate();
  const monthDays = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const openDay = monthDays === 28 ? 26 : 28;
  const actuKey = `notif_actua_${today.getFullYear()}_${today.getMonth()}_${dayOfMonth}`;

  if (!localStorage.getItem(actuKey)) {
    localStorage.setItem(actuKey, "1");
    if (dayOfMonth === 15) {
      showAppNotification("urgent", "🚨",
        "Dernier jour pour actualiser !",
        "C'est le 15 — dernière chance pour déclarer sur France Travail avant minuit.",
        null, null);
    } else if (dayOfMonth === 14) {
      showAppNotification("urgent", "⏰",
        "Plus qu'1 jour pour actualiser !",
        "Demain c'est le 15, dernier délai. Votre récap est prêt dans l'onglet Actualisation.",
        null, null);
    } else if (dayOfMonth === 12) {
      showAppNotification("warning", "📅",
        "Actualisation — 3 jours restants",
        "Deadline le 15. Votre récap du mois est prêt dans l'onglet Actualisation.",
        null, null);
    } else if (dayOfMonth === openDay) {
      showAppNotification("info", "📅",
        "C'est l'heure de l'actualisation !",
        "L'actualisation est ouverte depuis aujourd'hui jusqu'au 15. Votre récap est prêt.",
        null, null);
    }
  }

function renderChart(doneHours, plannedHours = 0, formationHours = 0, enseignementHours = 0) {
  const total = OBJECTIVE_HOURS;
  const doneRaw = Math.max(0, Number(doneHours) || 0);
  const plannedRaw = Math.max(0, Number(plannedHours) || 0);
  const formRaw = Math.max(0, Number(formationHours) || 0);
  const formCapped = Math.min(formRaw, FORM_CAP);
  const ensRaw = Math.max(0, Number(enseignementHours) || 0);
  // Même calcul que la jauge de l'appli : on borne, et on arrondit la SOMME (pas chaque part).
  // Pourcentages AFFICHÉS : non plafonnés (peuvent dépasser 100%, comme l'appli).
  const donePercent = Math.round((doneRaw / total) * 100);
  const plannedPercent = Math.round((plannedRaw / total) * 100);
  const totalPercent = Math.round(((doneRaw + formCapped + ensRaw + plannedRaw) / total) * 100);
  // Remplissage de l'arc : effectué → formation → enseignement → prévu, borné au demi-cercle.
  const doneFrac = Math.min(doneRaw / total, 1);
  const formFrac = Math.min(formCapped / total, 1 - doneFrac);
  const ensFrac = Math.min(ensRaw / total, 1 - doneFrac - formFrac);
  const plannedFrac = Math.min(plannedRaw / total, 1 - doneFrac - formFrac - ensFrac);
  const CIRC = 377;
  const doneDash = Math.min(doneFrac * CIRC, CIRC);
  const formDash = Math.min(formFrac * CIRC, CIRC - doneDash);
  const ensDash = Math.min(ensFrac * CIRC, CIRC - doneDash - formDash);
  const plannedDash = Math.min(plannedFrac * CIRC, CIRC - doneDash - formDash - ensDash);
  if (!$("chart")) return;
 // Le graphique suit le THÈME : on lit les couleurs réelles de la palette (var --petrol/--orange/…).
  // Repli si pas de DOM (garde-fou _sitecheck tourne en Node, sans getComputedStyle).
  const bodyCS = (typeof getComputedStyle !== 'undefined' && typeof document !== 'undefined' && document.body) ? getComputedStyle(document.body) : null;
  const cvar = (name, fb) => { try { const v = bodyCS ? bodyCS.getPropertyValue(name).trim() : ''; return v || fb; } catch (e) { return fb; } };
  const cPetrol = cvar('--petrol', '#1F4E5F');
  const cOrange = cvar('--orange', '#F97316');
  const cText = cvar('--text', '#2D3748');
  const cMuted = cvar('--muted', '#718096');
  const cSoft = cvar('--soft', '#EEF4F1');
  const isDark = document.body.classList.contains('theme-dark') || document.body.classList.contains('dark-scheme');
  const FORM_HEX = '#7C3AED';
  const ENS_HEX = '#0EA5E9'; // enseignement — même bleu que la jauge de l'appli
  // Légende dynamique (Formation / Enseignement ajoutés seulement si des heures existent)
  const legend = [{ c: cPetrol, t: `Effectué · ${donePercent}%` }];
  if (formRaw > 0) legend.push({ c: FORM_HEX, t: 'Formation' });
  if (ensRaw > 0) legend.push({ c: ENS_HEX, t: 'Enseignement' });
  legend.push({ c: cOrange, t: `Prévu · ${plannedPercent}%` });
  legend.push({ c: isDark ? 'rgba(255,255,255,.10)' : '#D8E4DF', t: 'Restant', muted: true });
  // Légende : 3 à 5 entrées selon les cas. À pas fixe, 5 entrées se chevauchaient et débordaient du cadre.
  // → on estime la largeur de chaque entrée, on remplit des lignes de 340 max, et on centre chaque ligne.
  // Le SVG s'agrandit d'autant : rien ne sort jamais du viewBox (identique sur Chrome, Firefox et Safari).
  const LEG_W = function (t) { return 14 + t.length * 5.4 + 12; }; // pastille + texte (~5,4 px/caractère à 9,5 px gras) + espace
  const rows = [[]];
  legend.forEach(function (it) {
    const w = LEG_W(it.t);
    const cur = rows[rows.length - 1];
    const used = cur.reduce(function (a, x) { return a + LEG_W(x.t); }, 0);
    if (cur.length && used + w > 340) rows.push([it]); else cur.push(it);
  });
  const LEG_Y = 188, ROW_H = 15;
  const legendSvg = rows.map(function (row, ri) {
    const rowW = row.reduce(function (a, x) { return a + LEG_W(x.t); }, 0);
    let x = -20 + (340 - rowW) / 2; // centrage de la ligne dans le viewBox
    const y = LEG_Y + ri * ROW_H;
    return row.map(function (it) {
      const tc = it.muted ? cMuted : cText;
      const s = `<rect x="${x}" y="${y}" width="10" height="10" rx="3" fill="${it.c}"/><text x="${x + 14}" y="${y + 9}" font-size="9.5" font-weight="700" fill="${tc}" font-family="-apple-system, BlinkMacSystemFont, sans-serif">${it.t}</text>`;
      x += LEG_W(it.t);
      return s;
    }).join('');
  }).join('');
  const vbH = 210 + (rows.length - 1) * ROW_H;
  $("chart").innerHTML = `
 <svg viewBox="-20 0 340 ${vbH}" width="100%" style="max-height:${300 + (vbH - 210)}px;display:block;" role="img" aria-label="Arc progression heures">
      <defs>
        <linearGradient id="g3done" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="${cPetrol}"/>
          <stop offset="100%" stop-color="${cPetrol}"/>
        </linearGradient>
        <linearGradient id="g3plan" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="${cOrange}"/>
          <stop offset="100%" stop-color="${cOrange}"/>
        </linearGradient>
        <filter id="arcShadow"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-opacity="0.15"/></filter>
      </defs>
      <path d="M 30 165 A 120 120 0 0 1 270 165" fill="none" stroke="${isDark ? 'rgba(255,255,255,.12)' : cSoft}" stroke-width="30" stroke-linecap="butt"/>
      ${doneDash > 0 ? `<path d="M 30 165 A 120 120 0 0 1 270 165" fill="none" stroke="url(#g3done)" stroke-width="30" stroke-linecap="butt" stroke-dasharray="${doneDash} ${CIRC}"/>` : ""}
      ${formDash > 0 ? `<path d="M 30 165 A 120 120 0 0 1 270 165" fill="none" stroke="${FORM_HEX}" stroke-width="30" stroke-linecap="butt" stroke-dasharray="${formDash} ${CIRC}" stroke-dashoffset="${-doneDash}"/>` : ""}
      ${ensDash > 0 ? `<path d="M 30 165 A 120 120 0 0 1 270 165" fill="none" stroke="${ENS_HEX}" stroke-width="30" stroke-linecap="butt" stroke-dasharray="${ensDash} ${CIRC}" stroke-dashoffset="${-(doneDash + formDash)}"/>` : ""}
      ${plannedDash > 0 ? `<path d="M 30 165 A 120 120 0 0 1 270 165" fill="none" stroke="url(#g3plan)" stroke-width="30" stroke-linecap="butt" stroke-dasharray="${plannedDash} ${CIRC}" stroke-dashoffset="${-(doneDash + formDash + ensDash)}"/>` : ""}
      <text x="150" y="132" text-anchor="middle" font-size="44" font-weight="900" fill="${cPetrol}" font-family="-apple-system, BlinkMacSystemFont, sans-serif">${totalPercent}%</text>
      <text x="150" y="155" text-anchor="middle" font-size="13" fill="${cMuted}" font-family="-apple-system, BlinkMacSystemFont, sans-serif">${Math.round(doneRaw + formCapped + ensRaw + plannedRaw)} h / ${total} h</text>
      ${legendSvg}
    </svg>
    ${formRaw > 0 ? `<div style="display:flex;align-items:flex-start;gap:6px;margin:2px 10px 10px;padding:9px 11px;border-radius:11px;background:${cSoft};font-size:11px;line-height:1.45;color:${cMuted};"><span>🎓</span><span>Formation comptée : <strong style="color:${cText};">${formCapped} h / ${FORM_CAP} h max</strong>${formRaw > FORM_CAP ? ` (${formRaw} h saisies, plafonnées)` : ''}. Uniquement si tu n'es pas indemnisé pendant la formation.</span></div>` : ''}
  `;}
function renderHistory() {
  const missionsEl = $("missions");
  if (!missionsEl) return;
  const today = todayDateOnly();
  const upcoming = missions
    .filter((m) => new Date((m.endDate || m.date) + "T00:00:00") >= today)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const totalPages = Math.max(1, Math.ceil(upcoming.length / HISTORY_PER_PAGE));
  if (historyPage > totalPages) historyPage = totalPages;
  if (historyPage < 1) historyPage = 1;
  const start = (historyPage - 1) * HISTORY_PER_PAGE;
  const visible = upcoming.slice(start, start + HISTORY_PER_PAGE);
  if (!upcoming.length) { missionsEl.innerHTML = `<div class="empty">Aucune mission à venir.</div>`; return; }
  missionsEl.innerHTML = `
    <div class="mission-card-grid">
      ${visible.map((mission) => `
        <div class="mission-history-card">
          <div class="mission-history-head">
            <strong>${ICO.doc}${escapeHtml(mission.production)}</strong>
            ${mission.type ? `<span class="pill">${escapeHtml(mission.type)}</span>` : ''}
          </div>
          <div class="mission-history-info">
            <span>${ICO.cal}${formatPeriod(mission.date, mission.endDate)}</span>
            ${mission.emission ? `<span>${ICO.camera}${escapeHtml(mission.emission)}</span>` : ""}${mission.lieu ? `<span>${ICO.pin}${escapeHtml(mission.lieu)}</span>` : ""}
            <span>${ICO.clock}${mission.hours}h</span>
            <span>${ICO.euro}${(Math.round(Number(mission.gross)||0)).toLocaleString('fr-FR')}</span>
          </div>
          <div class="mission-history-actions">
            <button class="edit-icon-btn" data-edit="${mission.id}" type="button" title="Modifier">✏️</button>
            <button class="delete-icon-btn" data-delete="${mission.id}" type="button" title="Supprimer">✕</button>
          </div>
        </div>`).join("")}
    </div>
    ${totalPages > 1 ? `
      <div class="history-pagination">
        <button class="ghost" type="button" id="historyPagePrev" ${historyPage === 1 ? "disabled" : ""}>‹</button>
        <span>Page ${historyPage} / ${totalPages}</span>
        <button class="ghost" type="button" id="historyPageNext" ${historyPage === totalPages ? "disabled" : ""}>›</button>
      </div>` : ""}
  `;
  if ($("historyPagePrev")) $("historyPagePrev").addEventListener("click", () => { historyPage--; renderHistory(); });
  if ($("historyPageNext")) $("historyPageNext").addEventListener("click", () => { historyPage++; renderHistory(); });
}
let _missionsPeriod = "all";              // 'all' | 'month' | 'year' | 'ai' | 'custom'  (comme l'app mobile)
let _missionsCustomYear = new Date().getFullYear();
let _missionsMonthRef = new Date();       // filtre « Mois »

// Fenêtre d'une année d'intermittence (12 mois depuis l'anniversaire de la date ARE).
// offset 0 = en cours, -1 = précédente, etc. (navigation « année précédente », retour Isabelle).
function _aiWindowCurrent(offset){
  if (!areAdmissionDate) return null;
  const a = new Date(areAdmissionDate + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let k = today.getFullYear() - a.getFullYear();
  const anniv = new Date(a); anniv.setFullYear(a.getFullYear() + k);
  if (anniv >= today) k -= 1; // >= : le jour anniversaire appartient à l'année qui se termine ce jour-là
  k += (offset || 0);
  const start = new Date(a); start.setFullYear(a.getFullYear() + k);
  const end = new Date(a);   end.setFullYear(a.getFullYear() + k + 1);
  return { start: start.getTime(), end: end.getTime(), startDate: start, endDate: end };
}
let _missionsAiOffset = 0; // 0 = année d'intermittence en cours, -1 = précédente…
let _missionsLastBilan = null; // dernier bilan calculé (pour l'export PDF)

// Libellé humain de la période affichée dans l'onglet Missions (titre du PDF).
function _missionsPeriodLabel(){
  if (_missionsPeriod === 'month') { const l = _missionsMonthRef.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); return l.charAt(0).toUpperCase() + l.slice(1); }
  if (_missionsPeriod === 'year') return "Année civile " + new Date().getFullYear();
  if (_missionsPeriod === 'custom') return "Année " + _missionsCustomYear;
  if (_missionsPeriod === 'ai') {
    const w = _aiWindowCurrent(_missionsAiOffset);
    const fmtD = function(d){ const p = function(n){ return String(n).padStart(2, '0'); }; return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear(); };
    return w ? ("Année d'intermittence " + fmtD(w.startDate) + " → " + fmtD(w.endDate)) : "Année d'intermittence";
  }
  return "Toutes périodes";
}

function _lastDayOfMonth(ym){
  const parts = ym.split("-"); const y = +parts[0], m = +parts[1];
  const d = new Date(y, m, 0).getDate();
  return ym + "-" + String(d).padStart(2, "0");
}

function _missionsYears(){
  const set = {};
  missions.forEach(function(m){ const y = new Date((m.date) + "T00:00:00").getFullYear(); if (!isNaN(y)) set[y] = 1; });
  return Object.keys(set).map(Number).sort(function(a,b){ return b - a; });
}
function _missionsInPeriod(){
  if (_missionsPeriod === "all") return missions.slice();
  if (_missionsPeriod === "month") {
    const y = _missionsMonthRef.getFullYear(), m = _missionsMonthRef.getMonth();
    return missions.filter(function(mm){ const d = new Date((mm.date) + "T00:00:00"); return d.getFullYear() === y && d.getMonth() === m; });
  }
  if (_missionsPeriod === "ai") {
    const w = _aiWindowCurrent(_missionsAiOffset);
    if (!w) return missions.slice();
    return missions.filter(function(mm){ const t = new Date((mm.date) + "T00:00:00").getTime(); return t > w.start && t <= w.end; }); // fin incluse (jour anniversaire)
  }
  const target = _missionsPeriod === "year" ? new Date().getFullYear() : _missionsCustomYear;
  return missions.filter(function(m){
    return new Date((m.date) + "T00:00:00").getFullYear() === target;
  });
}

function _missionsPeriodBar(){
  const chip = function(active){ return 'padding:8px 15px;border-radius:99px;font-size:13px;font-weight:700;cursor:pointer;border:none;font-family:inherit;' + (active ? 'background:var(--petrol);color:#fff;' : 'background:var(--soft);color:var(--petrol);'); };
  let html = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">' +
    '<button type="button" class="mperiod-chip" data-mp="all" style="' + chip(_missionsPeriod==='all') + '">Tout</button>' +
    '<button type="button" class="mperiod-chip" data-mp="month" style="' + chip(_missionsPeriod==='month') + '">Mois</button>' +
    '<button type="button" class="mperiod-chip" data-mp="year" style="' + chip(_missionsPeriod==='year') + '">Année civile</button>' +
    '<button type="button" class="mperiod-chip" data-mp="ai" style="' + chip(_missionsPeriod==='ai') + '">Année interm.</button>' +
    '<button type="button" class="mperiod-chip" data-mp="custom" style="' + chip(_missionsPeriod==='custom') + '">Par année</button>' +
    '</div>';
  if (_missionsPeriod === 'custom') {
    const years = _missionsYears();
    const ychip = function(active){ return 'padding:6px 13px;border-radius:99px;font-size:13px;font-weight:700;cursor:pointer;border:1px solid var(--line);font-family:inherit;' + (active ? 'background:var(--petrol);color:#fff;border-color:var(--petrol);' : 'background:var(--card);color:var(--petrol);'); };
    html += '<div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:14px;">' +
      (years.length ? years.map(function(y){ return '<button type="button" class="myear-chip" data-my="' + y + '" style="' + ychip(y===_missionsCustomYear) + '">' + y + '</button>'; }).join('') : '<span style="font-size:13px;color:var(--muted);">Aucune année</span>') +
      '</div>';
  }
  if (_missionsPeriod === 'month') {
    const fmtMonth = function(d){ const l = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); return l.charAt(0).toUpperCase() + l.slice(1); };
    const nav = 'width:34px;height:34px;border-radius:50%;border:none;background:var(--soft);color:var(--petrol);font-size:18px;font-weight:800;cursor:pointer;font-family:inherit;';
    html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">' +
      '<button type="button" class="mmonth-nav" data-mm="-1" style="' + nav + '">‹</button>' +
      '<span style="flex:1;text-align:center;font-weight:800;color:var(--petrol);font-size:14px;">' + fmtMonth(_missionsMonthRef) + '</span>' +
      '<button type="button" class="mmonth-nav" data-mm="1" style="' + nav + '">›</button>' +
      '</div>';
  }
  if (_missionsPeriod === 'ai') {
    const w = _aiWindowCurrent(_missionsAiOffset);
    const fmtD = function(d){ const p = function(n){ return String(n).padStart(2, '0'); }; return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear(); };
    const nav = 'width:34px;height:34px;flex:0 0 auto;border-radius:50%;border:none;background:var(--soft);color:var(--petrol);font-size:18px;font-weight:800;cursor:pointer;font-family:inherit;';
    const subLbl = _missionsAiOffset === 0 ? "année d'intermittence en cours" : (_missionsAiOffset === -1 ? "année précédente" : "il y a " + (-_missionsAiOffset) + " ans");
    html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">' +
      '<button type="button" class="mai-nav" data-mai="-1" style="' + nav + '">‹</button>' +
      '<div style="flex:1;text-align:center;padding:8px 10px;border-radius:11px;background:var(--soft);font-size:12px;font-weight:800;color:var(--petrol);line-height:1.35;">' +
        (w ? (fmtD(w.startDate) + ' → ' + fmtD(w.endDate) + '<br><span style="font-size:10.5px;color:var(--muted);font-weight:600;">' + subLbl + '</span>') : "Renseigne ta date ARE dans le Tableau de bord pour activer ce filtre.") +
      '</div>' +
      '<button type="button" class="mai-nav" data-mai="1" style="' + nav + (_missionsAiOffset >= 0 ? 'opacity:.3;pointer-events:none;' : '') + '">›</button>' +
      '</div>';
  }
  return html;
}

function _bindMissionsPeriod(){
  const container = $("missionsGraphContainer");
  if (!container) return;
  container.querySelectorAll(".mperiod-chip").forEach(function(b){
    b.addEventListener("click", function(){
      _missionsPeriod = b.dataset.mp;
      if (_missionsPeriod === 'ai') _missionsAiOffset = 0; // on repart sur l'année en cours
      if (_missionsPeriod === 'custom') { const ys = _missionsYears(); if (ys.indexOf(_missionsCustomYear) < 0 && ys.length) _missionsCustomYear = ys[0]; }
      renderAllMissions();
    });
  });
  container.querySelectorAll(".myear-chip").forEach(function(b){
    b.addEventListener("click", function(){ _missionsCustomYear = Number(b.dataset.my); renderAllMissions(); });
  });
  container.querySelectorAll(".mmonth-nav").forEach(function(b){
    b.addEventListener("click", function(){ const n = new Date(_missionsMonthRef); n.setDate(1); n.setMonth(n.getMonth() + Number(b.dataset.mm)); _missionsMonthRef = n; renderAllMissions(); });
  });
  container.querySelectorAll(".mai-nav").forEach(function(b){
    b.addEventListener("click", function(){ _missionsAiOffset = Math.min(0, _missionsAiOffset + Number(b.dataset.mai)); renderAllMissions(); });
  });
}

// Donut Artiste (orange) vs Technicien (pétrole) — 2 arcs.
function _atDonutSVG(art, tech) {
  const tot = art + tech || 1, C = 2 * Math.PI * 30, artDash = art / tot * C;
  return '<svg viewBox="0 0 80 80" width="84" height="84">'
    + '<circle cx="40" cy="40" r="30" fill="none" stroke="var(--line)" stroke-width="12"/>'
    + '<circle cx="40" cy="40" r="30" fill="none" stroke="#F97316" stroke-width="12" stroke-linecap="butt" stroke-dasharray="' + artDash.toFixed(2) + ' ' + C.toFixed(2) + '" transform="rotate(-90 40 40)"/>'
    + '<circle cx="40" cy="40" r="30" fill="none" stroke="#1F4E5F" stroke-width="12" stroke-linecap="butt" stroke-dasharray="' + (C - artDash).toFixed(2) + ' ' + C.toFixed(2) + '" stroke-dashoffset="' + (-artDash).toFixed(2) + '" transform="rotate(-90 40 40)"/>'
    + '</svg>';
}
function renderAllMissions() {
  const container = $("missionsGraphContainer");
  if (!container) return;

  // Bouton "Ajouter une mission" retiré de la rubrique Missions pour coller à l'appli :
  // l'ajout se fait depuis le calendrier. (vide = n'affiche rien)
  const addBtnHtml = "";
  const bindAddBtn = () => {
    const btn = $("missionsAddBtn");
    if (!btn) return;
    btn.addEventListener("click", () => {
      addMissionReturnView = "missions";
      activateView("add-mission");
      resetMissionFormForDate(new Date().toISOString().slice(0, 10));
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  if (!missions.length) {
    container.innerHTML = `<div class="empty">Aucune mission enregistrée pour le moment. Ajoute une mission depuis le calendrier.</div>`;
    bindAddBtn();
    return;
  }

  const viewMissions = _missionsInPeriod();

  if (!viewMissions.length) {
    container.innerHTML = addBtnHtml + _missionsPeriodBar() + `<div class="empty">Aucune mission sur cette période.</div>`;
    bindAddBtn();
    _bindMissionsPeriod();
    return;
  }

  const groups = {};
  viewMissions.forEach((mission) => {
    const key = normalizeProductionName(mission.production || "Sans production");
    if (!groups[key]) groups[key] = [];
    groups[key].push(mission);
  });
  // Prorata en mode « Mois » : une mission à cheval ne compte que sa part du mois (cohérent avec le dashboard). Saisie rapide = vacations stockées.
  const _isMonthView = _missionsPeriod === "month";
  const _mvSite = function (x) {
    const fast = x.type === "Saisie rapide";
    if (_isMonthView) { const inM = missionDaysInMonth(x, _missionsMonthRef); const frac = inM / missionDayCount(x); return { gross: Number(x.gross || 0) * frac, hours: Number(x.hours || 0) * frac, vac: fast ? (Number(x.vacations) || 1) : inM }; }
    return { gross: Number(x.gross || 0), hours: Number(x.hours || 0), vac: fast ? (Number(x.vacations) || 1) : missionDayCount(x) };
  };
  const sorted = Object.keys(groups).map((name) => ({
    name, list: groups[name],
    gross: Math.round(groups[name].reduce((a, x) => a + _mvSite(x).gross, 0)),
    hours: Math.round(groups[name].reduce((a, x) => a + _mvSite(x).hours, 0) * 10) / 10,
    vacations: groups[name].reduce((a, x) => a + _mvSite(x).vac, 0), // 1 vacation = 1 jour (prorata du mois en mode Mois)
    // Cachets = somme des vacations des missions en mode cachet (heures ≈ vacations × 12) — pour « cachets par employeur ».
    cachets: groups[name].reduce((a, x) => a + (missionIsCachet(x) ? (Number(x.vacations) || 0) : 0), 0),
    count: groups[name].length
  })).sort((a, b) => b.gross - a.gross);
  const totalGross = sorted.reduce((a, x) => a + x.gross, 0);
  const totalHours = Math.round(sorted.reduce((a, x) => a + x.hours, 0) * 10) / 10;
  const totalVacations = sorted.reduce((a, x) => a + x.vacations, 0);
  // Split Artiste (cachet) vs Technicien (heures) sur la période — donut placé AU-DESSUS des productions.
  let _atArtH = 0, _atTechH = 0, _atArtCachets = 0;
  viewMissions.forEach(function (m) {
    if ((m.regime || "intermittence") !== "intermittence") return;
    const h = Number(m.hours) || 0, v = Number(m.vacations) || 0;
    if (missionIsCachet(m)) { _atArtH += h; _atArtCachets += v; } else { _atTechH += h; }
  });
  _atArtH = Math.round(_atArtH * 10) / 10; _atTechH = Math.round(_atTechH * 10) / 10; _atArtCachets = Math.round(_atArtCachets * 10) / 10;
  const _atTot = _atArtH + _atTechH;
  // Donut affiché UNIQUEMENT si l'utilisateur a les DEUX types (sinon inutile pour un pur technicien/artiste).
  const _atCard = (_atArtH > 0 && _atTechH > 0) ? `
    <div style="margin-bottom:14px;padding:14px;border-radius:16px;background:var(--soft);border:1px solid var(--line);">
      <div style="font-size:13px;font-weight:800;color:var(--petrol);margin-bottom:10px;">Artiste vs Technicien</div>
      <div style="display:flex;align-items:center;gap:16px;">
        <div style="flex:0 0 auto;">${_atDonutSVG(_atArtH, _atTechH)}</div>
        <div style="flex:1;display:flex;flex-direction:column;gap:6px;">
          <div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:800;color:var(--text);"><span style="width:11px;height:11px;border-radius:3px;background:#F97316;"></span>🎭 Artiste<span style="margin-left:auto;">${Math.round(_atArtH / _atTot * 100)}%</span></div>
          <div style="font-size:11.5px;color:var(--muted);margin:-3px 0 4px 19px;">${_atArtH} h · ${_atArtCachets} cachet${_atArtCachets > 1 ? "s" : ""}</div>
          <div style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:800;color:var(--text);"><span style="width:11px;height:11px;border-radius:3px;background:#1F4E5F;"></span>🔧 Technicien<span style="margin-left:auto;">${Math.round(_atTechH / _atTot * 100)}%</span></div>
          <div style="font-size:11.5px;color:var(--muted);margin:-3px 0 0 19px;">${_atTechH} h</div>
        </div>
      </div>
    </div>` : "";
  const COLORS = ["#1F4E5F","#2A6174","#3A7A8F","#7A9E7E","#8AB08E","#9AC09E","#F97316","#FDBA74","#4A8FA5","#5A9FB5"];
  const CIRC = 2 * Math.PI * 75;
  let offset = 0;
  const arcs = sorted.map((p, i) => {
    const pct = totalGross > 0 ? p.gross / totalGross : 0;
    const dash = pct * CIRC;
    const arc = `<circle cx="100" cy="100" r="75" fill="none" stroke="${prodSolid(p.name, i)}" stroke-width="28" stroke-dasharray="${dash.toFixed(2)} ${CIRC.toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 100 100)" stroke-linecap="butt"/>`;
    offset += dash;
    return arc;
  });
  container.innerHTML = `
    ${addBtnHtml}
    ${_missionsPeriodBar()}
    <div class="missions-stats-row">
     <div class="mstat-box"><strong>${totalVacations}</strong><span>Vacations</span></div>
      <div class="mstat-box"><strong>${totalHours}h</strong><span>Heures totales</span></div>
      <div class="mstat-box highlight"><strong>${money(totalGross)}</strong><span>Brut total</span></div>
      <div class="mstat-box"><strong>${sorted.length}</strong><span>Productions</span></div>
    </div>
    <button type="button" id="missionsBilanPdfBtn" class="cal-export-btn" style="width:100%;justify-content:center;margin-bottom:14px;"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>Exporter ce bilan en PDF</button>
    ${_atCard}
    <div class="missions-graph-layout">
      <div class="missions-arc-wrap">
        <svg viewBox="0 0 200 200" width="100%">
          <circle cx="100" cy="100" r="75" fill="none" stroke="#F0F4F3" stroke-width="28"/>
          ${arcs.join("")}
        </svg>
        <div class="missions-arc-center"><strong>${money(totalGross)}</strong><span>brut total</span></div>
      </div>
      <div class="missions-legend">
        ${sorted.map((p, i) => `
          <div class="missions-legend-row" data-production-open="${escapeHtml(p.name)}">
            <div class="missions-legend-dot" style="background:${prodSolid(p.name, i)}"></div>
            <div class="missions-legend-body">
              <div class="missions-legend-name">${escapeHtml(p.name)}</div>
              <div class="missions-legend-detail">${p.count} mission${p.count > 1 ? "s" : ""} · ${p.hours}h${p.cachets > 0 ? ` · ${Math.round(p.cachets * 10) / 10} cachet${p.cachets > 1 ? "s" : ""}` : ""}</div>
            </div>
            <div class="missions-legend-pct">${totalGross > 0 ? Math.round((p.gross / totalGross) * 100) : 0}%</div>
            <div class="missions-legend-amount">${money(p.gross)}</div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
  // On garde le bilan courant sous la main pour l'export PDF.
  _missionsLastBilan = {
    label: _missionsPeriodLabel(),
    sorted: sorted.map(function (p) { return { name: p.name, count: p.count, hours: p.hours, cachets: Math.round(p.cachets * 10) / 10, gross: p.gross }; }),
    totalGross: totalGross, totalHours: totalHours, totalVacations: totalVacations,
    artH: _atArtH, techH: _atTechH, artCachets: _atArtCachets
  };
  bindAddBtn();
  _bindMissionsPeriod();
  const _pdfBtn = $("missionsBilanPdfBtn");
  if (_pdfBtn) _pdfBtn.addEventListener("click", generateMissionsBilanPDF);
}

// Export PDF du bilan Missions (période affichée) : totaux + split artiste/tech + tableau par production.
function generateMissionsBilanPDF() {
  const b = _missionsLastBilan;
  if (!b) return;
  const tot = b.artH + b.techH;
  const splitHtml = tot > 0 ? `<div class="split"><div class="split-row"><span class="dot" style="background:#F97316"></span>Artiste <b>${Math.round(b.artH / tot * 100)}%</b> · ${b.artH} h · ${b.artCachets} cachet${b.artCachets > 1 ? "s" : ""}</div><div class="split-row"><span class="dot" style="background:#1F4E5F"></span>Technicien <b>${Math.round(b.techH / tot * 100)}%</b> · ${b.techH} h</div></div>` : "";
  const rows = b.sorted.map(function (p) {
    return `<tr><td>${escapeHtml(p.name)}</td><td>${p.count}</td><td>${p.hours} h</td><td>${p.cachets > 0 ? Math.round(p.cachets * 10) / 10 : "—"}</td><td>${money2(p.gross)}</td></tr>`;
  }).join("");
  const win = window.open("", "_blank");
  if (!win) { alert("Autorise les pop-ups pour générer le PDF."); return; }
  win.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"/><title>Bilan ${escapeHtml(b.label)}</title><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#2D3748;background:#fff;padding:34px}.header{border-bottom:3px solid #1F4E5F;padding-bottom:16px;margin-bottom:22px}h1{margin:0;color:#1F4E5F;font-size:26px;letter-spacing:-.03em}.subtitle{color:#718096;margin:6px 0 0;font-size:14px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:22px 0 20px}.summary-box{border:1px solid #E2E8F0;border-radius:14px;padding:14px;background:#F8FAF9}.summary-box strong{display:block;color:#1F4E5F;font-size:22px;line-height:1.1}.summary-box span{display:block;margin-top:4px;color:#718096;font-size:11px;text-transform:uppercase;font-weight:700}.split{display:flex;flex-wrap:wrap;gap:10px 22px;margin:0 0 22px;padding:14px;border:1px solid #E2E8F0;border-radius:14px;background:#F8FAF9;font-size:14px}.split-row{display:flex;align-items:center;gap:8px}.dot{width:12px;height:12px;border-radius:4px;display:inline-block}table{width:100%;border-collapse:collapse;margin-top:6px}th{text-align:left;color:#718096;font-size:12px;text-transform:uppercase;letter-spacing:.03em;padding:10px 8px;border-bottom:2px solid #E2E8F0}td{padding:11px 8px;border-bottom:1px solid #E2E8F0;font-size:14px}tr:nth-child(even) td{background:#FBFCFC}tfoot td{font-weight:800;color:#1F4E5F;border-top:2px solid #1F4E5F;background:#fff!important}.footer{margin-top:26px;padding-top:12px;border-top:1px solid #E2E8F0;font-size:12px;color:#718096;line-height:1.45}@media print{body{padding:20px}.summary-box,.split,tr:nth-child(even) td{print-color-adjust:exact;-webkit-print-color-adjust:exact}}</style></head><body><div class="header"><h1>Bilan des missions</h1><p class="subtitle">${escapeHtml(b.label)} · Généré avec Intermitrack</p></div><div class="summary"><div class="summary-box"><strong>${b.totalVacations}</strong><span>Vacations</span></div><div class="summary-box"><strong>${b.totalHours} h</strong><span>Heures</span></div><div class="summary-box"><strong>${escapeHtml(money2(b.totalGross))}</strong><span>Brut total</span></div><div class="summary-box"><strong>${b.sorted.length}</strong><span>Productions</span></div></div>${splitHtml}${b.sorted.length ? `<table><thead><tr><th>Production</th><th>Missions</th><th>Heures</th><th>Cachets</th><th>Brut</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td>Total</td><td>${b.sorted.reduce(function(a,p){return a+p.count;},0)}</td><td>${b.totalHours} h</td><td>${Math.round(b.artCachets * 10) / 10}</td><td>${money2(b.totalGross)}</td></tr></tfoot></table>` : `<div class="empty">Aucune mission sur cette période.</div>`}<p class="footer">Bilan personnel destiné à faciliter le suivi de ton activité (heures, cachets, brut par employeur). À vérifier avant toute démarche officielle auprès de France Travail.</p></body></html>`);
  win.document.close(); win.focus(); win.print();
}

function openProductionMissions(productionName) {
  const allMissionsEl = $("allMissions");
  if (!allMissionsEl) return;
  if ($("missionsGraphContainer")) $("missionsGraphContainer").style.display = "none";
const list = missions.filter((m) => normalizeProductionName(m.production || "Sans production") === productionName).sort((a, b) => new Date(b.date) - new Date(a.date));  allMissionsEl.innerHTML = `
    <div class="production-detail-head" style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
      <button class="ghost" type="button" data-production-back>‹ Retour</button>
      <div><h2 style="margin:0;color:var(--petrol);">${escapeHtml(productionName)}</h2><p class="sub" style="margin:2px 0 0;">${list.length} mission${list.length > 1 ? "s" : ""} enregistrée${list.length > 1 ? "s" : ""}</p></div>
    </div>
    <!-- Options de la production (comme l'app : couleur / renommer / fusionner / supprimer) -->
    <div class="prod-opts">
      <button class="prod-opt-btn" type="button" data-prod-color="${escapeHtml(productionName)}"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.563-2.512 5.563-5.564C22 6.05 17.5 2 12 2z"/></svg>Couleur</button>
      <button class="prod-opt-btn" type="button" data-prod-tarif="${escapeHtml(productionName)}"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>Tarif/jour</button>
      <button class="prod-opt-btn" type="button" data-prod-overtime="${escapeHtml(productionName)}"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>Heures sup</button>
      <button class="prod-opt-btn" type="button" data-prod-rename="${escapeHtml(productionName)}"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>Renommer</button>
      <button class="prod-opt-btn" type="button" data-prod-merge="${escapeHtml(productionName)}"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m0 8v3a2 2 0 0 0 2 2h3m8-18h3a2 2 0 0 1 2 2v3m0 8v3a2 2 0 0 1-2 2h-3"/><path d="M9 12h6"/></svg>Fusionner</button>
      <button class="prod-opt-btn danger" type="button" data-prod-delete="${escapeHtml(productionName)}"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg>Supprimer</button>
    </div>
    <div id="prodMergeBox" class="prod-merge-box" style="display:none;"></div>
    <div id="prodOvertimeBox" class="ot-box" style="display:none;"></div>
    <div class="mission-card-grid">
      ${list.map((mission) => `
       <div class="mission-history-card">
          <div class="mission-history-head"><strong>${ICO.doc}${escapeHtml(mission.production)}</strong>${mission.type ? `<span class="pill">${escapeHtml(mission.type)}</span>` : ''}</div>
          <div class="mission-history-info">
            <span>${ICO.cal}${formatPeriod(mission.date, mission.endDate)}</span>
            ${mission.emission ? `<span>${ICO.camera}${escapeHtml(mission.emission)}</span>` : ""}${mission.lieu ? `<span>${ICO.pin}${escapeHtml(mission.lieu)}</span>` : ""}
            <span>${ICO.clock}${mission.hours}h</span>
            <span>${ICO.euro}${(Math.round(Number(mission.gross)||0)).toLocaleString('fr-FR')}</span>
          </div>
          <div class="mission-history-actions">
            <button class="edit-icon-btn" data-edit="${mission.id}" type="button" title="Modifier">✏️</button>
            <button class="delete-icon-btn" data-delete="${mission.id}" type="button" title="Supprimer">✕</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}
// ===== Options d'une production (onglet Missions) — parité app : couleur / renommer / fusionner / supprimer =====
function _prodMissions(normName) { return missions.filter((m) => normalizeProductionName(m.production || "Sans production") === normName); }
function _otherProductions(normName) {
  const set = {};
  missions.forEach((m) => { const n = normalizeProductionName(m.production || "Sans production"); if (n !== normName) set[n] = true; });
  return Object.keys(set).sort();
}
function _prodColor(normName) {
  openCustomColorPicker(getProductionColorHex(normName) || '#1E6FE0', function (hex) {
    setProductionColorHex(normName, hex);
    if (typeof renderCalendar === 'function') renderCalendar();
    openProductionMissions(normName);
    toast("Couleur mise à jour.");
  });
}
// Vrai pop-up de saisie stylé (remplace prompt() natif). opts: {title, message, value, placeholder, type, okLabel, onOk}
var _imOnOk = null;
function _ensureInputModal() {
  if (document.getElementById('inputModalOverlay')) return;
  const st = document.createElement('style');
  st.textContent = "#inputModalOverlay{position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;align-items:center;justify-content:center;z-index:100061;padding:18px;}#inputModalOverlay.open{display:flex;}.im-box{background:var(--card);color:var(--text);border-radius:20px;width:100%;max-width:360px;box-sizing:border-box;padding:22px;box-shadow:0 24px 60px rgba(0,0,0,.3);}.im-title{font-size:16px;font-weight:900;color:var(--petrol);margin-bottom:6px;}.im-msg{font-size:12.5px;color:var(--muted);line-height:1.5;margin-bottom:12px;}.im-input{width:100%;box-sizing:border-box;padding:12px 14px;border:1px solid var(--line-2);border-radius:11px;background:var(--card);color:var(--text);font-size:15px;font-family:inherit;outline:none;}.im-input:focus{border-color:var(--petrol);}.im-actions{display:flex;gap:10px;margin-top:16px;}.im-cancel{flex:1;padding:12px;border:1px solid var(--line);background:var(--soft);color:var(--muted);border-radius:12px;font-weight:700;cursor:pointer;font-family:inherit;}.im-ok{flex:1;padding:12px;border:none;background:var(--petrol);color:#fff;border-radius:12px;font-weight:800;cursor:pointer;font-family:inherit;}";
  document.head.appendChild(st);
  const ov = document.createElement('div');
  ov.id = 'inputModalOverlay';
  ov.innerHTML = '<div class="im-box"><div class="im-title" id="imTitle"></div><div class="im-msg" id="imMsg"></div><input class="im-input" id="imInput" autocomplete="off"><div class="im-actions"><button type="button" class="im-cancel" id="imCancel">Annuler</button><button type="button" class="im-ok" id="imOk">Valider</button></div></div>';
  document.body.appendChild(ov);
  ov.addEventListener('click', function (e) {
    if (e.target === ov || e.target.id === 'imCancel') { ov.classList.remove('open'); _imOnOk = null; }
    else if (e.target.id === 'imOk') { const v = document.getElementById('imInput').value; ov.classList.remove('open'); const cb = _imOnOk; _imOnOk = null; if (cb) cb(v); }
  });
  document.getElementById('imInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('imOk').click(); } });
}
function _inputModal(opts) {
  _ensureInputModal();
  const ov = document.getElementById('inputModalOverlay');
  document.getElementById('imTitle').textContent = opts.title || '';
  const msg = document.getElementById('imMsg');
  msg.textContent = opts.message || ''; msg.style.display = opts.message ? '' : 'none';
  const inp = document.getElementById('imInput');
  inp.type = opts.type || 'text'; inp.value = opts.value != null ? opts.value : ''; inp.placeholder = opts.placeholder || '';
  if (opts.type === 'number') inp.setAttribute('inputmode', 'decimal'); else inp.removeAttribute('inputmode');
  document.getElementById('imOk').textContent = opts.okLabel || 'Valider';
  _imOnOk = opts.onOk || null;
  ov.classList.add('open');
  setTimeout(function () { inp.focus(); inp.select(); }, 50);
}
// Vrai pop-up de CONFIRMATION stylé (remplace confirm() natif). opts: {title, message, okLabel, danger, onOk}
var _cmOnOk = null;
function _ensureConfirmModal() {
  if (document.getElementById('confirmModalOverlay')) return;
  const st = document.createElement('style');
  st.textContent = "#confirmModalOverlay{position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;align-items:center;justify-content:center;z-index:100062;padding:18px;}#confirmModalOverlay.open{display:flex;}.cm-box{background:var(--card);color:var(--text);border-radius:20px;width:100%;max-width:380px;box-sizing:border-box;padding:22px;box-shadow:0 24px 60px rgba(0,0,0,.3);}.cm-title{font-size:16px;font-weight:900;color:var(--petrol);margin-bottom:8px;}.cm-msg{font-size:13px;color:var(--muted);line-height:1.55;}.cm-actions{display:flex;gap:10px;margin-top:18px;}.cm-cancel{flex:1;padding:12px;border:1px solid var(--line);background:var(--soft);color:var(--muted);border-radius:12px;font-weight:700;cursor:pointer;font-family:inherit;}.cm-ok{flex:1;padding:12px;border:none;background:var(--petrol);color:#fff;border-radius:12px;font-weight:800;cursor:pointer;font-family:inherit;}.cm-ok.danger{background:var(--danger);}";
  document.head.appendChild(st);
  const ov = document.createElement('div');
  ov.id = 'confirmModalOverlay';
  ov.innerHTML = '<div class="cm-box"><div class="cm-title" id="cmTitle"></div><div class="cm-msg" id="cmMsg"></div><div class="cm-actions"><button type="button" class="cm-cancel" id="cmCancel">Annuler</button><button type="button" class="cm-ok" id="cmOk">Confirmer</button></div></div>';
  document.body.appendChild(ov);
  ov.addEventListener('click', function (e) {
    if (e.target === ov || e.target.id === 'cmCancel') { ov.classList.remove('open'); _cmOnOk = null; }
    else if (e.target.id === 'cmOk') { ov.classList.remove('open'); const cb = _cmOnOk; _cmOnOk = null; if (cb) cb(); }
  });
}
function _confirmModal(opts) {
  _ensureConfirmModal();
  const ov = document.getElementById('confirmModalOverlay');
  document.getElementById('cmTitle').textContent = opts.title || 'Confirmer';
  document.getElementById('cmMsg').textContent = opts.message || '';
  const ok = document.getElementById('cmOk');
  ok.textContent = opts.okLabel || 'Confirmer';
  ok.classList.toggle('danger', !!opts.danger);
  _cmOnOk = opts.onOk || null;
  ov.classList.add('open');
}
// Aide contextuelle « ? » à côté des libellés de champs (retour Lila) : explique chaque champ
// (ex « nom de l'émission » = le nom du show/tournée/événement, incompréhensible pour un pur « tourne »).
// Style des « ? » injecté DÈS LE CHARGEMENT (sinon, avant le 1er clic, ils s'affichent en bouton
// navigateur par défaut : gros et blancs — retour Yohan). L'overlay, lui, reste créé à la volée.
(function () {
  const st = document.createElement('style');
  st.textContent = '.field-help{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;margin-left:6px;border:none;border-radius:50%;background:var(--soft);color:var(--petrol);font-size:11px;font-weight:800;cursor:pointer;font-family:inherit;vertical-align:middle;line-height:1;padding:0;}';
  (document.head || document.documentElement).appendChild(st);
})();
function _fieldHelp(title, text) {
  let ov = document.getElementById('fieldHelpOverlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'fieldHelpOverlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:none;align-items:center;justify-content:center;z-index:100010;padding:16px;';
    ov.innerHTML = '<div style="background:var(--card);border:1px solid var(--line);border-radius:18px;max-width:420px;width:100%;padding:22px;box-shadow:0 24px 60px rgba(0,0,0,.35);"><div id="fhTitle" style="font-size:17px;font-weight:800;color:var(--petrol);margin-bottom:8px;"></div><div id="fhMsg" style="font-size:13.5px;color:var(--text);line-height:1.55;"></div><button type="button" id="fhOk" style="margin-top:18px;width:100%;padding:12px;border:none;background:var(--petrol);color:#fff;border-radius:12px;font-weight:800;cursor:pointer;font-family:inherit;">Compris</button></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) { if (e.target === ov || e.target.id === 'fhOk') ov.style.display = 'none'; });
  }
  document.getElementById('fhTitle').textContent = title || '';
  document.getElementById('fhMsg').textContent = text || '';
  ov.style.display = 'flex';
}
// Délégation globale : un clic sur un « ? » (.field-help) ouvre l'aide (data-t = titre, data-h = texte).
document.addEventListener('click', function (e) {
  const b = e.target.closest && e.target.closest('.field-help');
  if (b) { e.preventDefault(); e.stopPropagation(); _fieldHelp(b.getAttribute('data-t') || '', b.getAttribute('data-h') || ''); }
});
// Onglet « À savoir » : filtre statut (Les deux / Technicien / Artiste) → masque les questions non concernées.
document.addEventListener('click', function (e) {
  const c = e.target.closest && e.target.closest('.asavoir-chip');
  if (!c) return;
  const f = c.getAttribute('data-f') || 'tous';
  const box = c.closest('#view-asavoir'); if (!box) return;
  box.querySelectorAll('.asavoir-chip').forEach(function (x) { x.classList.toggle('on', x === c); });
  box.querySelectorAll('details[data-s]').forEach(function (d) {
    const s = d.getAttribute('data-s');
    const show = (f === 'tous') || (s === 'tous') || (s === f);
    d.classList.toggle('asv-hide', !show);
  });
});

function _prodTarif(normName) {
  const cur = _getProdRate(normName);
  _inputModal({
    title: "Tarif par jour", message: "Pré-rempli sur tes prochaines dates de « " + normName + " ». Laisse vide pour retirer.",
    value: cur != null ? String(cur) : "", placeholder: "Ex : 230", type: "number", okLabel: "Enregistrer",
    onOk: function (nv) {
      const val = String(nv || "").trim() === "" ? 0 : (Number(String(nv).replace(",", ".")) || 0);
      _setProdRate(normName, val);
      toast(val > 0 ? "Tarif enregistré." : "Tarif retiré.");
      openProductionMissions(normName);
    }
  });
}
function _prodOvertime(normName) {
  const box = $("prodOvertimeBox"); if (!box) return;
  if (box.style.display !== "none" && box.dataset.for === normName) { box.style.display = "none"; _ot = null; return; }
  if ($("prodMergeBox")) $("prodMergeBox").style.display = "none";
  box.dataset.for = normName;
  box.style.display = "";
  const annexe = (typeof _profil !== 'undefined' && _profil && _profil.annexe) || '';
  _otInit(normName, annexe, 'config', 'prodOvertimeBox', null);
  _otRerender();
}
function _prodRename(normName) {
  _inputModal({
    title: "Renommer la production", message: "Met à jour toutes les missions de cette production (passées et à venir).",
    value: normName, placeholder: "Nom de la production", okLabel: "Renommer",
    onOk: function (nv) {
      const newName = normalizeProductionName(String(nv || "").trim());
      if (!newName) { toast("Nom vide."); return; }
      if (newName === normName) return;
      (async function () {
        const list = _prodMissions(normName);
        try {
          for (const m of list) { const { error } = await sb.from('missions').update({ production: newName }).eq('id', m.id); if (error) throw error; }
          const col = getProductionColorHex(normName); if (col) setProductionColorHex(newName, col);
          toast("Production renommée.");
          await loadMissions();
          openProductionMissions(newName);
        } catch (e) { toast("Le renommage a échoué. Réessaie."); }
      })();
    }
  });
}
function _prodMergeShow(normName) {
  const box = $("prodMergeBox"); if (!box) return;
  if (box.style.display !== "none" && box.dataset.for === normName) { box.style.display = "none"; return; }
  const others = _otherProductions(normName);
  box.dataset.for = normName;
  box.style.display = "";
  box.innerHTML = others.length
    ? '<div class="prod-merge-title">Fusionner « ' + escapeHtml(normName) + ' » dans :</div>' + others.map((o) => '<button type="button" class="prod-merge-target" data-prod-merge-into="' + escapeHtml(o) + '" data-prod-merge-from="' + escapeHtml(normName) + '">' + escapeHtml(o) + '</button>').join("")
    : '<div class="prod-merge-title">Aucune autre production à fusionner.</div>';
}
function _prodMergeInto(fromName, targetName) {
  const list = _prodMissions(fromName);
  _confirmModal({ title: "Fusionner les productions", message: "Rattacher les " + list.length + " mission(s) de « " + fromName + " » à « " + targetName + " » ? Elles porteront toutes ce nom.", okLabel: "Fusionner", onOk: function () {
    (async function () {
      try {
        for (const m of list) { const { error } = await sb.from('missions').update({ production: targetName }).eq('id', m.id); if (error) throw error; }
        toast("Productions fusionnées.");
        await loadMissions();
        openProductionMissions(targetName);
      } catch (e) { toast("La fusion a échoué. Réessaie."); }
    })();
  } });
}
function _prodDelete(normName) {
  const list = _prodMissions(normName);
  _confirmModal({ title: "Supprimer la production", message: "Supprimer « " + normName + " » et ses " + list.length + " mission(s) ? Cette action est définitive.", okLabel: "Supprimer", danger: true, onOk: function () {
    (async function () {
      try {
        for (const m of list) { const { error } = await sb.from('missions').delete().eq('id', m.id); if (error) throw error; }
        toast("Production supprimée.");
        if ($("allMissions")) $("allMissions").innerHTML = "";
        if ($("missionsGraphContainer")) $("missionsGraphContainer").style.display = "";
        await loadMissions();
      } catch (e) { toast("La suppression a échoué. Réessaie."); }
    })();
  } });
}
function moveMonth(amount) {
  current.setMonth(current.getMonth() + amount);
  current.setDate(1);
  render();
}
// Navigation dans l'historique des années d'intermittence (on ne va pas au-delà de l'année en cours).
function shiftAiYear(delta) {
  aiYearOffset = Math.min(0, aiYearOffset + delta);
  render();
}

let calMissionPage = 0;
const CAL_MISSIONS_PER_PAGE = 6;

function renderCalendar() {
  const calView = document.getElementById("view-calendar");
  if (!calView) return;
  const card = calView.querySelector(".card");
  if (!card) return;
  card.innerHTML = `
    <div class="new-cal-header">
      <h2 id="monthTitle"></h2>
      <div class="new-cal-nav">
        <button class="ghost new-cal-btn" type="button" id="calendarPrevBtn">‹</button>
        <input type="month" id="calendarMonthPicker" class="history-month-picker"/>
        <button class="ghost new-cal-btn" type="button" id="calendarNextBtn">›</button>
      </div>
    </div>
    <div class="new-cal-tools">
      <button class="cal-tool-btn" type="button" id="prodColorsManageBtn"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.37 2.63 14 7l-1.59-1.59a2 2 0 0 0-2.82 0L8 7l9 9 1.59-1.59a2 2 0 0 0 0-2.82L17 10l4.37-4.37a2.12 2.12 0 1 0-3-3Z"/><path d="M9 8c-2 3-4 3.5-7 4l8 10c2-1 6-5 6-7"/><path d="M14.5 17.5 4.5 15"/></svg>Personnaliser les couleurs</button>
      <button class="cal-tool-btn" type="button" id="prodColorsResetBtn"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>Réinitialiser les couleurs</button>
      <button class="cal-tool-btn" type="button" id="importExcelBtn"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h8"/></svg>Importer un Excel/CSV</button>
      <button class="cal-tool-btn" type="button" id="xlInfoBtn" title="Comment préparer mon fichier Excel ?" style="flex:0 0 auto;padding:9px 12px;">ⓘ Format Excel</button>
      <button class="cal-tool-btn" type="button" id="importNotesBtn"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>Coller mes notes</button>
    </div>
    <div class="new-cal-daynames"><div>L</div><div>M</div><div>M</div><div>J</div><div>V</div><div>S</div><div>D</div></div>
    <div class="new-cal-grid" id="calendar"></div>
    <div id="calendarDayPanel"></div>
    <!-- Sous le calendrier : Exporter en PDF, puis Réinitialiser (comme l'app) -->
    <div class="cal-below">
      <button type="button" id="calExportPdfBtn" class="cal-export-btn"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>Exporter le mois en PDF</button>
      <div class="cal-reset-row">
        <button type="button" id="resetMonthBtn" class="cal-reset-link">Réinitialiser le mois</button>
        <button type="button" id="resetYearBtn" class="cal-reset-link">Réinitialiser l'année</button>
        <button type="button" id="resetCalendarBtn" class="cal-reset-link">Réinitialiser le calendrier</button>
      </div>
    </div>
    <!-- Mes évènements du mois = missions + notes fusionnés, triés par date (comme l'app) -->
    <div class="new-mission-section">
      <div class="cal-sec-title">Mes évènements du mois</div>
      <div id="calEventCards"></div>
    </div>
  `;
  $("calendarPrevBtn").addEventListener("click", () => moveMonth(-1));
  $("calendarNextBtn").addEventListener("click", () => moveMonth(1));
  if ($("calExportPdfBtn")) $("calExportPdfBtn").addEventListener("click", generateActualisationPDF);
  $("calendarMonthPicker").addEventListener("change", () => {
    const value = $("calendarMonthPicker").value;
    if (!value) return;
    const [year, month] = value.split("-").map(Number);
    current = new Date(year, month - 1, 1);
    render();
  });
  const year = current.getFullYear(), month = current.getMonth();
  $("monthTitle").textContent = current.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  $("calendarMonthPicker").value = `${year}-${String(month + 1).padStart(2, "0")}`;
  const calendar = $("calendar");
  const first = new Date(year, month, 1);
  const start = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const totalSlots = Math.ceil((start + days) / 7) * 7;
  const now = new Date();
  const todayStr = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
  for (let i = 0; i < start; i++) { const empty = document.createElement("div"); empty.className = "new-cal-day new-cal-empty"; calendar.appendChild(empty); }
  for (let d = 1; d <= days; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const box = document.createElement("div");
    box.className = "new-cal-day"; box.dataset.calendarDate = dateStr;
    if (dateStr === todayStr) box.classList.add("today");
   const missionsOfDay = missions.filter((m) => isDateInPeriod(dateStr, m));
    if (missionsOfDay.length) {
      box.dataset.hasMission = "1";
      // Statut PAR CASE (pas par mission) : sinon une mission multi-jours à cheval sur aujourd'hui
      // donnait début>=today faux ET fin<today faux → aucune classe → case blanche (retour Yohan).
      // Aujourd'hui INCLUS dans « à venir » tant que le jour n'est pas fini.
      const isPast = dateStr < todayStr;
      const isFuture = dateStr >= todayStr;
      if (isPast) box.classList.add("has-done");
      if (isFuture) box.classList.add("has-planned");
      let dayHours = 0, dayGross = 0;
      missionsOfDay.forEach((m) => {
        const nbDays = missionDayCount(m);
        dayHours += Number(m.hours || 0) / nbDays;
        dayGross += Number(m.gross || 0) / nbDays;
      });
      dayHours = Math.round(dayHours * 10) / 10;
      dayGross = Math.round(dayGross);
      const _rep = missionsOfDay.map(_missionRepColor);
      // 2 missions le même jour → case TOUJOURS coupée en diagonale (moitié/moitié), avec un fin trait de séparation visible même si les 2 couleurs sont identiques.
      if (missionsOfDay.length === 2) {
        const cA = _rep[0], cB = _rep[1];
        // Chaque moitié garde son VRAI dégradé (comme une case pleine), au lieu d'une couleur plate :
        // couleur perso -> foncé/clair ; sinon dégradé par défaut passé (pétrole/vert) ou futur (orange).
        const _halfGrad = (m) => { const hex = getProductionColorHex(normalizeProductionName(m.production)); if (hex) return [_darken(hex,0.14), _lighten(hex,0.36)]; const fut = dateStr >= todayStr; return fut ? ['#F97316','#FDBA74'] : ['#1F4E5F','#2F8F6B']; };
        const pA = _halfGrad(missionsOfDay[0]), pB = _halfGrad(missionsOfDay[1]);
        box.style.setProperty('background', 'linear-gradient(135deg,' + pA[0] + ' 0%,' + pA[1] + ' 49%,rgba(255,255,255,.6) 49% 51%,' + pB[0] + ' 51%,' + pB[1] + ' 100%)', 'important');
        box.classList.add('cal-split');
        const iA = getProductionInitials(missionsOfDay[0].production);
        const iB = getProductionInitials(missionsOfDay[1].production);
        box.innerHTML = '<span class="new-cal-num">' + d + '</span>'
          + '<span class="cal-split-a">' + escapeHtml(iA) + '</span>'
          + '<span class="cal-split-b">' + escapeHtml(iB) + '</span>';
        box.querySelector('.new-cal-num').style.setProperty('color', prodTextColor(cA), 'important');
        box.querySelector('.cal-split-a').style.setProperty('color', prodTextColor(cA), 'important');
        box.querySelector('.cal-split-b').style.setProperty('color', prodTextColor(cB), 'important');
      } else {
        const _phex = getProductionColorHex(normalizeProductionName(missionsOfDay[0].production));
        const _pg = prodGradient(missionsOfDay[0].production, isFuture);
        if (_pg) box.style.setProperty('background', _pg, 'important');
        const label = missionsOfDay.length > 1 ? missionsOfDay.length + " miss." : getProductionInitials(missionsOfDay[0].production);
        box.innerHTML = `<span class="new-cal-num">${d}</span><div class="new-cal-tag ${isFuture ? "tag-planned" : "tag-done"}"><span class="new-cal-tag-prod">${escapeHtml(label)}</span><span class="new-cal-tag-meta">${dayHours}h · ${money(dayGross)}</span></div>`;
        if (_phex) { const _tc = prodTextColor(_phex); box.querySelectorAll('.new-cal-num,.new-cal-tag-prod,.new-cal-tag-meta').forEach(el => el.style.setProperty('color', _tc, 'important')); }
      }
    } else { box.innerHTML = `<span class="new-cal-num">${d}</span>`; }
    var _notes = (typeof notesForDate === 'function') ? notesForDate(dateStr) : [];
    if (_notes.length) {
      var _n0 = _notes[0];
      if (!missionsOfDay.length) {
        var _nbg = _prodCellBgs(_n0.color || '#1E6FE0');
        box.style.setProperty('background', _nbg.past, 'important');
        box.classList.add('has-note');
        box.innerHTML = '<span class="new-cal-num">' + d + '</span><div class="cal-note-mid"><span class="cal-note-abbr">' + escapeHtml(noteAbbr(_n0.title)) + '</span><svg class="cal-note-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h9l5 5v13H5z"/><path d="M14 3v5h5"/><path d="M8 13.5h7M8 17h5"/></svg></div>';
        box.querySelectorAll('.new-cal-num,.cal-note-mid').forEach(function(el){ el.style.setProperty('color', _nbg.tc, 'important'); });
      } else {
        var _mark = document.createElement('span'); _mark.className = 'cal-note-mark'; _mark.style.background = _n0.color || '#1E6FE0'; box.appendChild(_mark);
      }
    }
    calendar.appendChild(box);
  }
  const usedSlots = start + days;
  for (let i = usedSlots; i < totalSlots; i++) { const empty = document.createElement("div"); empty.className = "new-cal-day new-cal-empty"; calendar.appendChild(empty); }
  renderCalEvents();
}

// Carte d'une MISSION (ou d'un GROUPE de missions d'une même prod) dans « Mes évènements du mois ».
function _calMissionCardHtml(m) {
  const isFuture = new Date(m.date + "T00:00:00") >= todayDateOnly();
  const _ch = getProductionColorHex(normalizeProductionName(m.production));
  const _ids = m._ids || [m.id];
  const _multi = _ids.length > 1;
  const _delAttr = _multi ? `data-quick-del-group="${escapeHtml(_ids.join(','))}"` : `data-quick-del="${escapeHtml(m.id)}"`;
  const _count = _multi ? `  ·  ${_ids.length} missions` : '';
  const _brut = Number(m.gross) > 0 ? `<span class="new-mission-brut">${money(Math.round(Number(m.gross)))} € brut</span>` : '';
  return `
      <div class="new-mission-card ${isFuture ? "planned" : "done"}" data-calendar-date="${escapeHtml(m.date)}" style="cursor:pointer;${_ch ? `border-left-color:${_ch} !important;` : ''}">
        <div class="new-mission-body"><div class="new-mission-prod">${ICO.doc}${escapeHtml((m.production||'').toUpperCase())}</div>${(m.emission||'').trim() ? `<div class="new-mission-emission">${ICO.camera}${escapeHtml(m.emission.trim())}</div>` : ''}${(m.lieu||'').trim() ? `<div class="new-mission-lieu">${ICO.pin}${escapeHtml(m.lieu.trim())}</div>` : ''}<div class="new-mission-dates">${ICO.cal}${escapeHtml(formatPeriod(m.date, m.endDate))}${_count}</div></div>
        <div class="new-mission-right"><span class="new-mission-hours">${ICO.clock}${m.hours}h</span>${m.type ? `<span class="new-mission-type ${isFuture ? "type-planned" : "type-done"}">${escapeHtml(m.type)}</span>` : ''}${_brut}</div>
        <button type="button" ${_delAttr} title="Supprimer" aria-label="Supprimer" style="flex:0 0 auto;align-self:center;width:32px;height:32px;border:none;border-radius:9px;background:rgba(220,38,38,.1);color:#DC2626;font-size:15px;font-weight:800;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;">✕</button>
      </div>
    `;
}
// Carte d'une NOTE dans « Mes évènements du mois ».
function _calNoteCardHtml(n) {
  return '<div class="new-mission-card" data-note-detail="' + escapeHtml(n.id) + '" style="cursor:pointer;border-left-color:' + (n.color || '#1E6FE0') + ' !important;"><div class="new-mission-body"><div class="new-mission-prod">' + escapeHtml((n.title || 'NOTE').toUpperCase()) + '</div>' + ((n.text || '').trim() ? '<div class="new-mission-emission" style="font-style:normal;">' + escapeHtml(n.text.trim()) + '</div>' : '') + '<div class="new-mission-dates">' + escapeHtml(formatPeriod(n.date, n.endDate)) + '</div></div></div>';
}
// « Mes évènements du mois » = missions + notes fusionnés, triés par date (mission avant note à date égale).
function renderCalEvents() {
  const wrap = $("calEventCards"); if (!wrap) return;
  const y = current.getFullYear(), m = current.getMonth();
  const items = [];
  // Regroupe par PRODUCTION dans le mois : une seule ligne par prod (période + total heures + brut cumulé)
  // au lieu d'une ligne par jour/segment (retour Yohan : 130 h même prod = une ligne).
  const _gm = new Map();
  monthMissions(current).forEach((mi) => {
    const key = (mi.production || '—').trim().toUpperCase();
    let g = _gm.get(key);
    if (!g) { g = { id: 'grp_' + key, production: mi.production, type: mi.type, emission: mi.emission, lieu: mi.lieu, date: mi.date, endDate: mi.endDate || mi.date, hours: 0, gross: 0, _ids: [] }; _gm.set(key, g); }
    g._ids.push(mi.id);
    g.hours += Number(mi.hours || 0);
    g.gross += Number(mi.gross || 0);
    if (mi.date < g.date) g.date = mi.date;
    const e = mi.endDate || mi.date; if (e > g.endDate) g.endDate = e;
  });
  Array.from(_gm.values()).forEach((g) => { g.hours = Math.round(g.hours * 10) / 10; g.gross = Math.round(g.gross); items.push({ kind: "mission", date: g.date, end: g.endDate, html: _calMissionCardHtml(g) }); });
  getNotes().filter((n) => { const d = new Date(n.date + "T00:00:00"); return d.getFullYear() === y && d.getMonth() === m; })
    .forEach((n) => items.push({ kind: "note", date: n.date, end: n.endDate || n.date, html: _calNoteCardHtml(n) }));
  // Même ordre que l'app : à venir d'abord (date croissante), puis passés (date décroissante), selon la date de FIN.
  const _tD = todayDateOnly();
  items.sort((a, b) => {
    const fa = new Date(a.end + "T00:00:00") >= _tD, fb = new Date(b.end + "T00:00:00") >= _tD;
    if (fa !== fb) return fa ? -1 : 1;
    const da = new Date(a.date + "T00:00:00").getTime(), db = new Date(b.date + "T00:00:00").getTime();
    if (da !== db) return fa ? da - db : db - da;
    return a.kind === b.kind ? 0 : (a.kind === "mission" ? -1 : 1);
  });
  wrap.innerHTML = items.length ? items.map((it) => it.html).join("") : '<div class="empty">Aucun évènement ce mois.</div>';
}

function renderCalendarDayPanel(dateStr) {
  const panel = $("calendarDayPanel");
  if (!panel) return;
  const dayMissions = missions.filter((m) => isDateInPeriod(dateStr, m)).sort((a, b) => new Date(a.date) - new Date(b.date));
  const dateLabel = formatDate(dateStr);
  if (!dayMissions.length) { panel.innerHTML = ""; return; }
  panel.innerHTML = `
    <div class="calendar-day-panel">
      <div class="calendar-day-panel-head">
        <div><strong>Missions du ${escapeHtml(dateLabel)}</strong><span>${dayMissions.length} mission${dayMissions.length > 1 ? "s" : ""} prévue${dayMissions.length > 1 ? "s" : ""} ce jour-là.</span></div>
        <button class="ghost" type="button" data-calendar-add-date="${escapeHtml(dateStr)}">Ajouter une autre mission</button>
      </div>
      <div class="calendar-day-missions">
        ${dayMissions.map((mission) => {
          const totalDays = missionDayCount(mission);
          const dailyHours = Math.round((Number(mission.hours || 0) / totalDays) * 10) / 10;
          const dailyGross = Math.round(Number(mission.gross || 0) / totalDays);
          return `<div class="calendar-day-mission"><div><strong>${ICO.doc}${escapeHtml(mission.production)}</strong><span>${mission.type ? escapeHtml(mission.type)+' · ' : ''}${dailyHours}h · ${money(dailyGross)}</span></div><div class="calendar-day-actions"><button class="ghost" type="button" data-edit="${escapeHtml(mission.id)}">Modifier</button><button class="delete" type="button" data-delete="${escapeHtml(mission.id)}">X</button></div></div>`;
        }).join("")}
      </div>
    </div>
  `;
}

function resetMissionFormForDate(dateStr, regime) {
  editingMissionId = null;
  _setMissionRegime(regime || "intermittence");
  if (typeof switchAddTab === 'function') switchAddTab('mission');
  if ($("missionForm")) $("missionForm").reset();
  if ($("production")) _setProdValue("");
  if ($("emission")) $("emission").value = ""; if ($("lieu")) $("lieu").value = "";
  if (typeof _syncFieldBtn === 'function'){ _syncFieldBtn('emission','emBtnLabel'); _syncFieldBtn('lieu','lieuBtnLabel'); }
  _setAddrValue('from', ''); _setAddrValue('to', '');
  _applyKmProfil(); // véhicule pré-rempli depuis « Mes informations » (retour JB)
  if ($("type")) { _setTypeValue((getCustomPostes()[0]) || _quickTypeChips()[0]); _typePristine = true; } // pré-rempli = suggestion, remplacée au 1er tap
  if ($("date")) $("date").value = dateStr;
  if ($("endDate")) $("endDate").value = dateStr;
  if ($("hours")) $("hours").value = "";
  if ($("cachetInput")) $("cachetInput").value = "";
  _grossTouched = false; // nouvelle mission : le brut se pré-remplit (tarif × vacations)
  if ($("gross")) $("gross").value = (typeof _profil!=='undefined' && _profil && Number(_profil.salaire_journalier)>0) ? _profil.salaire_journalier : "";
  if (typeof setMissionModeForOpen === 'function') setMissionModeForOpen();  // Heures/Cachet selon l'annexe
  const submitBtn = document.querySelector("#missionForm button[type='submit']");
  if (submitBtn) submitBtn.textContent = "Enregistrer la mission";
}

function openCalendarDay(dateStr) { openDayModal(dateStr); }

// ===================== NOTES PERSO =====================
let selectedNoteColor = '#1E6FE0';
let noteCategory = 'PERSO';
let editingNoteId = null;
let _dayModalDate = null;
function getNotes(){ try { return JSON.parse(localStorage.getItem(storageKey("notes")) || "[]"); } catch(e){ return []; } }
function _saveNotesArr(arr){ localStorage.setItem(storageKey("notes"), JSON.stringify(arr)); _syncNotesToSupabase(); }
function isDateInNote(dateStr, n){ return dateStr >= n.date && dateStr <= (n.endDate || n.date); }
function notesForDate(dateStr){ return getNotes().filter(function(n){ return isDateInNote(dateStr, n); }); }
function noteAbbr(title){ var t=(title||'NOTE').toUpperCase().replace(/[^A-ZÀ-Ÿ0-9]/g,''); return t.slice(0,3) || 'NOTE'; }
function renderCalNotes(){
  const wrap = $("calNoteCards"); if(!wrap) return;
  const y = current.getFullYear(), m = current.getMonth();
  const monthNotes = getNotes().filter(function(n){ const d=new Date(n.date+"T00:00:00"); return d.getFullYear()===y && d.getMonth()===m; }).sort(function(a,b){ return new Date(a.date)-new Date(b.date); });
  if(!monthNotes.length){ wrap.innerHTML = '<div class="empty">Aucune note ce mois.</div>'; return; }
  wrap.innerHTML = monthNotes.map(function(n){
    return '<div class="new-mission-card" data-note-detail="'+escapeHtml(n.id)+'" style="cursor:pointer;border-left-color:'+(n.color||'#1E6FE0')+' !important;"><div class="new-mission-body"><div class="new-mission-prod">'+escapeHtml((n.title||'NOTE').toUpperCase())+'</div>'+((n.text||'').trim()?'<div class="new-mission-emission" style="font-style:normal;">'+escapeHtml(n.text.trim())+'</div>':'')+'<div class="new-mission-dates">'+escapeHtml(formatPeriod(n.date, n.endDate))+'</div></div></div>';
  }).join("");
}
document.addEventListener('click', function(e){
  const t=e.target.closest && e.target.closest('.cal-sec-tab');
  if(!t) return;
  document.querySelectorAll('.cal-sec-tab').forEach(function(x){ x.classList.toggle('on', x===t); });
  const sec=t.dataset.calsec;
  if($("calMissionsPane")) $("calMissionsPane").style.display = sec==='missions'?'':'none';
  if($("calNotesPane")) $("calNotesPane").style.display = sec==='notes'?'':'none';
  if(sec==='notes') renderCalNotes();
});

// --- Vue détail d'une note (lecture seule) : Retour en haut, Modifier/Supprimer en bas ---
let _noteDetailId = null;
function _ensureNoteDetailModal(){
  if(document.getElementById('noteDetailOverlay')) return;
  const st=document.createElement('style');
  st.textContent="#noteDetailOverlay{position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;align-items:flex-end;justify-content:center;z-index:100045;}#noteDetailOverlay.open{display:flex;}.nd-box{background:var(--card);color:var(--text);border-radius:22px 22px 0 0;width:100%;max-width:540px;max-height:90vh;overflow-y:auto;box-sizing:border-box;padding:18px 22px 28px;box-shadow:0 -10px 40px rgba(0,0,0,.3);}@media(min-width:600px){#noteDetailOverlay{align-items:center;padding:18px;}.nd-box{border-radius:20px;max-width:420px;max-height:88vh;}}.nd-back{background:none;border:none;color:var(--muted);font-size:14px;font-weight:700;cursor:pointer;padding:4px 0;margin-bottom:14px;}.nd-head{display:flex;align-items:center;gap:10px;margin-bottom:6px;}.nd-dot{width:16px;height:16px;border-radius:5px;flex-shrink:0;}.nd-title{font-size:20px;font-weight:900;color:var(--petrol);}.nd-dates{font-size:12.5px;color:var(--muted);font-weight:600;margin-bottom:16px;}.nd-text{font-size:15px;line-height:1.6;color:var(--text);white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;max-width:100%;box-sizing:border-box;background:var(--soft);border-radius:14px;padding:14px 16px;min-height:60px;margin-bottom:18px;}.nd-actions{display:flex;gap:10px;}.nd-edit{flex:1;padding:13px;border:1px solid var(--line);background:var(--card);color:var(--petrol);border-radius:13px;font-weight:800;font-size:14px;cursor:pointer;}.nd-del{flex:1;padding:13px;border:none;background:rgba(220,38,38,.12);color:#DC2626;border-radius:13px;font-weight:800;font-size:14px;cursor:pointer;}";
  document.head.appendChild(st);
  const ov=document.createElement('div');
  ov.id='noteDetailOverlay';
  ov.innerHTML="<div class=\"nd-box\"><button class=\"nd-back\" id=\"ndBack\" type=\"button\">‹ Retour</button><div class=\"nd-head\"><span class=\"nd-dot\" id=\"ndDot\"></span><span class=\"nd-title\" id=\"ndTitle\"></span></div><div class=\"nd-dates\" id=\"ndDates\"></div><div class=\"nd-text\" id=\"ndText\"></div><div class=\"nd-actions\"><button class=\"nd-edit\" id=\"ndEdit\" type=\"button\">Modifier</button><button class=\"nd-del\" id=\"ndDel\" type=\"button\">Supprimer</button></div></div>";
  document.body.appendChild(ov);
  ov.addEventListener('click', async function(e){
    if(e.target===ov || (e.target.closest && e.target.closest('#ndBack'))){ ov.classList.remove('open'); return; }
    if(e.target.closest && e.target.closest('#ndEdit')){ ov.classList.remove('open'); editNote(_noteDetailId); return; }
    if(e.target.closest && e.target.closest('#ndDel')){ const ok=await confirmDialog("Supprimer cette note ? Cette action est définitive."); if(ok){ deleteNote(_noteDetailId); ov.classList.remove('open'); } return; }
  });
}
function openNoteDetail(id){
  const n=getNotes().find(function(x){return x.id===id;}); if(!n) return;
  _ensureNoteDetailModal();
  _noteDetailId=id;
  const ov=document.getElementById('noteDetailOverlay');
  ov.querySelector('#ndDot').style.background=n.color||'#1E6FE0';
  ov.querySelector('#ndTitle').textContent=n.title||'Note';
  ov.querySelector('#ndDates').textContent=formatPeriod(n.date, n.endDate);
  ov.querySelector('#ndText').textContent=n.text||'';
  ov.classList.add('open');
}
document.addEventListener('click', function(e){
  const nd=e.target.closest && e.target.closest('[data-note-detail]');
  if(!nd) return;
  const dm=document.getElementById('dayModalOverlay'); if(dm) dm.classList.remove('open');
  openNoteDetail(nd.dataset.noteDetail);
});

// ── Saisie mission : bascule Heures (technicien) / Cachet (artiste) ──
function applyMissionMode(mode){
  _missionMode = (mode==='cachet') ? 'cachet' : 'heures';
  const cachet = _missionMode==='cachet';
  const show=(id,on)=>{ const el=$(id); if(el) el.style.display = on ? (id==='cachetInput'||id==='hours'||id==='vacations'?'block':'block') : 'none'; };
  show('cachetLabel',cachet); show('cachetInput',cachet); show('cachetHint',cachet);
  const hl=$("hoursLabel"); if(hl) hl.textContent = cachet ? "Heures payées en heures (répétitions, ateliers… facultatif)" : "Nombre d'heures cumulées sur la période";
  const hi=$("hours"); if(hi) hi.required = !cachet;
  // Cachet (artiste) : les « heures payées à l'heure » sont facultatives → repliées par défaut (déroulées si déjà remplies).
  const hb=$("hoursBlock"), ht=$("hoursToggle"), hasH = hi && hi.value && Number(hi.value)>0;
  if(cachet){
    if(ht) ht.style.display='block';
    if(hb) hb.style.display = hasH ? 'block' : 'none';
    if(ht) ht.textContent = (hb && hb.style.display!=='none') ? "− Masquer les heures payées à l'heure" : "＋ Heures payées à l'heure (répétitions, ateliers…) — facultatif";
  } else {
    if(ht) ht.style.display='none';
    if(hb) hb.style.display='block';
  }
  // Boutons rapides d'heures (4/8/12) : masqués en cachet ET pour les artistes (retour Yohan).
  const hq=$("hourQuick"); if(hq) hq.style.display = (cachet || (typeof _profil!=='undefined' && _profil && _profil.annexe==='artiste')) ? 'none' : 'flex';
  show('vacationsLabel',!cachet); show('vacations',!cachet); show('vacationsHint',!cachet);
  document.querySelectorAll('#missionModeRow .mm-opt').forEach(function(b){
    const on=b.dataset.mm===_missionMode;
    b.style.background=on?'var(--petrol)':'var(--card)'; b.style.color=on?'#fff':'var(--petrol)'; b.style.borderColor=on?'var(--petrol)':'var(--line)';
  });
}
// Déplier/replier les « heures payées à l'heure » (mode cachet, facultatif).
document.addEventListener('click', function(e){
  if(e.target && e.target.id==='hoursToggle'){
    var hb=document.getElementById("hoursBlock"), ht=document.getElementById("hoursToggle"); if(!hb||!ht) return;
    var open = hb.style.display!=='none';
    hb.style.display = open ? 'none' : 'block';
    ht.textContent = open ? "＋ Heures payées à l'heure (répétitions, ateliers…) — facultatif" : "− Masquer les heures payées à l'heure";
    if(!open){ var hi=document.getElementById("hours"); if(hi) hi.focus(); }
  }
});
// Choisit le mode selon l'annexe du profil (toggle visible seulement pour « les deux »)
function setMissionModeForOpen(forceMode){
  const ax=(typeof _profil!=='undefined' && _profil && _profil.annexe) || 'technicien';
  const row=$("missionModeRow");
  // Régime général / enseignement : toujours en heures, jamais de cachets, sélecteur masqué (retour Alizée).
  if(typeof _missionRegime!=='undefined' && _missionRegime!=='intermittence'){ if(row) row.style.display='none'; applyMissionMode('heures'); return; }
  if(ax==='les_deux'){ if(row) row.style.display='flex'; applyMissionMode(forceMode||_missionMode||'heures'); }
  // Artiste : cachet PAR DÉFAUT mais plus enfermé — le sélecteur reste visible pour basculer en
  // heures si un contrat est payé à l'heure (retours Pauline/Alizée : ne plus bloquer les artistes).
  else if(ax==='artiste'){ if(row) row.style.display='flex'; applyMissionMode(forceMode||'cachet'); }
  else { if(row) row.style.display='none'; applyMissionMode('heures'); }
}
document.addEventListener('click', function(e){ const b=e.target.closest && e.target.closest('#missionModeRow .mm-opt'); if(b) applyMissionMode(b.dataset.mm); });

function switchAddTab(tab){
  document.querySelectorAll('.add-tab').forEach(function(b){ b.classList.toggle('on', b.dataset.addtab===tab); });
  const mf=$("missionForm"), nf=$("noteForm");
  if(mf) mf.style.display = tab==='note' ? 'none' : '';
  if(nf) nf.style.display = tab==='note' ? '' : 'none';
  const t=$("addMissionTitle"); if(t) t.textContent = tab==='note' ? 'Ajouter une note' : _missionTitleTxt();
  if(tab==='note' && typeof _renderNoteColors==='function') _renderNoteColors();
}
var NOTE_PRESETS = ['#1E6FE0','#F0552B','#15B86B','#F59E0B','#7C3AED'];
function _renderNoteColors(){
  var wrap=document.getElementById('noteColorRow'); if(!wrap) return;
  var sel=(selectedNoteColor||'#1E6FE0').toLowerCase();
  var presetLc=NOTE_PRESETS.map(function(c){return c.toLowerCase();});
  var customs=(typeof getCustomColors==='function'?getCustomColors():[]).filter(function(c){return presetLc.indexOf(c.toLowerCase())<0;});
  var html='';
  NOTE_PRESETS.concat(customs).forEach(function(c){ html+='<button type="button" class="note-color'+(c.toLowerCase()===sel?' sel':'')+'" data-nc="'+c+'" style="background:'+c+'"></button>'; });
  html+='<button type="button" class="note-color-add" title="Ajouter une couleur perso">+</button>';
  wrap.innerHTML=html;
}
// ===== Régime de la mission : intermittence (défaut) | general (hors 507 h) | enseignement (compte, plafonné) =====
// Le formulaire mission est réutilisé tel quel ; seul cet encadré s'ajoute et le titre change.
var _missionRegime = "intermittence";
function _setMissionRegime(r) {
  _missionRegime = (r === "general" || r === "enseignement") ? r : "intermittence";
  // Régime général et enseignement = toujours en HEURES (jamais de cachets, ce n'est pas du spectacle).
  // Sinon un artiste, forcé en mode cachet par son annexe, ne pouvait pas enregistrer ses heures (retour Alizée).
  if (_missionRegime !== "intermittence") {
    var _row = $("missionModeRow"); if (_row) _row.style.display = "none";
    applyMissionMode("heures");
  } else if (typeof setMissionModeForOpen === "function") {
    setMissionModeForOpen(); // retour en intermittence : mode selon l'annexe
  }
  _renderRegimeBox();
}
function _missionTitleTxt() {
  if (_missionRegime === "enseignement") return "Ajouter de l'enseignement";
  if (_missionRegime === "general") return "Ajouter un travail au régime général";
  return "Ajouter une mission";
}
function _renderRegimeBox() {
  // Le titre suit le régime, y compris si on fait un aller-retour par l'onglet « Note perso ».
  var _t = document.getElementById("addMissionTitle");
  var _nf = document.getElementById("noteForm");
  if (_t && !(_nf && _nf.style.display !== "none")) _t.textContent = _missionTitleTxt();
  var box = document.getElementById("regimeBox");
  if (!box) return;
  if (_missionRegime === "intermittence") { box.innerHTML = ""; box.style.display = "none"; return; }
  box.style.display = "block";
  var isEns = _missionRegime === "enseignement";
  var opt = function (val, on, title, ex, tag, tagCls) {
    return '<button type="button" class="rg-opt' + (on ? ' on' : '') + '" data-regime="' + val + '">' +
      '<span class="rg-head"><span class="rg-radio' + (on ? ' on' : '') + '"></span><b>' + title + '</b></span>' +
      '<span class="rg-ex">' + ex + '</span>' +
      '<span class="rg-tag ' + tagCls + '">' + tag + '</span></button>';
  };
  box.innerHTML =
    '<div class="rg-box">' +
      '<div class="rg-title">De quoi s\'agit-il ?</div>' +
      '<div class="rg-lead">Les deux ne comptent pas pareil dans tes 507 h. Choisis ton cas :</div>' +
      opt("general", !isEns, "Un travail hors spectacle",
          "Pub en tant que mannequin, restauration, bureau, vente… Tout emploi salarié qui ne relève pas des annexes 8 ou 10.",
          "Ne compte PAS dans les 507 h", "warn") +
      opt("enseignement", isEns, "De l'enseignement",
          "Tu donnes des cours (chant, technique, danse…) dans un établissement <b>agréé</b>, sur une matière <b>en lien avec ton métier</b>, avec un vrai contrat de travail. Les 3 conditions sont obligatoires.",
          "COMPTE dans les 507 h", "ok") +
      '<div class="rg-info">' + (isEns
        ? "Plafond : 70 h — ou 120 h si tu as 50 ans ou plus à la fin du contrat. Le site retient jusqu'à 120 h pour ne léser personne : ne saisis que les heures qui te concernent vraiment. Ce plafond est partagé avec tes heures de formation (338 h au total)."
        : "Ces heures entrent quand même dans l'estimation France Travail du mois : toute heure travaillée, quel que soit le régime, réduit tes jours indemnisables. C'est pour ça qu'il vaut le coup de les saisir.") + '</div>' +
    '</div>';
}
document.addEventListener("click", function (e) {
  var b = e.target.closest && e.target.closest("#regimeBox [data-regime]");
  if (b) { e.preventDefault(); _setMissionRegime(b.dataset.regime); }
});

// Une formation = une note avec des heures (kind:'formation'). Le formulaire de note
// s'adapte : label « Organisme », champ heures + encart conditions. Aucune modif base (JSON profiles.notes).
var _noteFormMode = 'note';
// Arrêts (maternité, paternité, adoption, accident du travail, maladie) = une note kind:'arret'
// avec un arretType. Même JSON profiles.notes que l'appli → aucune table, aucune migration.
// ⚠️ Aucun arrêt n'ajoute d'heures aux 507 h pour l'instant (formules en cours de vérification
// sur source primaire) : on les NOTE seulement. Identique à l'appli (arretHoursPerDay = 0).
var ARRET_META_SITE = {
  maternite:        { label: 'Congé maternité',     color: '#DB2777' },
  paternite:        { label: 'Congé paternité',     color: '#2563EB' },
  adoption:         { label: 'Congé adoption',      color: '#0D9488' },
  accident_travail: { label: 'Accident du travail', color: '#DC2626' },
  maladie:          { label: 'Arrêt maladie',       color: '#D97706' }
};
var ARRET_ORDER_SITE = ['maternite','paternite','adoption','accident_travail','maladie'];
var _noteArretType = 'maternite';
function isArretNote(n){ return n && n.kind === 'arret'; }
function _renderArretRow(){
  document.querySelectorAll('#noteArretRow .note-arret').forEach(function(b){
    var on = b.dataset.arret === _noteArretType;
    b.classList.toggle('sel', on);
    b.style.background = on ? (ARRET_META_SITE[b.dataset.arret] || {}).color : '';
    b.style.color = on ? '#fff' : '';
    b.style.borderColor = on ? (ARRET_META_SITE[b.dataset.arret] || {}).color : '';
  });
}
function _pickArretType(t){
  if(!ARRET_META_SITE[t]) return;
  _noteArretType = t;
  selectedNoteColor = ARRET_META_SITE[t].color;
  if(typeof _renderNoteColors === 'function') _renderNoteColors();
  _renderArretRow();
  var ti = $("noteTitle"); if(ti) ti.value = ARRET_META_SITE[t].label;
}
document.addEventListener('click', function(e){
  var b = e.target.closest && e.target.closest('#noteArretRow .note-arret');
  if(b) _pickArretType(b.dataset.arret);
});
var FORM_CAP = 338; // heures de formation prises en compte pour les 507 h (plafond 2/3)
// Enseignement dispensé (contrat régime général avec un établissement AGRÉÉ, en lien avec le métier) :
// compte dans les 507 h, plafonné à 70 h — ou 120 h à partir de 50 ans à la fin du contrat.
// On retient le MAXIMUM légal pour ne léser personne ; le formulaire explique la règle.
// ⚠️ Le plafond de 338 h est GLOBAL : formation suivie + enseignement dispensé réunis (guide France Travail).
var ENS_CAP = 120;
function _applyNoteFormMode(mode){
  _noteFormMode = (mode === 'formation') ? 'formation' : (mode === 'arret') ? 'arret' : 'note';
  var isForm = _noteFormMode === 'formation';
  var isArr = _noteFormMode === 'arret';
  var t = $("addMissionTitle"); if(t) t.textContent = isForm ? 'Ajouter une formation' : isArr ? 'Déclarer un arrêt' : 'Ajouter une note';
  var tl = document.querySelector('label[for="noteTitle"]'); if(tl) tl.textContent = isForm ? 'Organisme de formation' : isArr ? 'Intitulé' : 'Titre de la note';
  var ti = $("noteTitle"); if(ti) ti.placeholder = isForm ? 'Ex : AFDAS, CFPTS, INA…' : isArr ? 'Ex : Congé maternité' : 'Ex : RDV médecin, Congés posés…';
  var xl = $("noteTextLabel"); if(xl) xl.textContent = isForm ? 'Intitulé (facultatif)' : isArr ? 'Précision (facultatif)' : 'Note (courte)';
  var tx = $("noteText"); if(tx) tx.placeholder = isForm ? 'Ex : Habilitation électrique…' : isArr ? 'Ex : suivi CPAM, dossier Audiens…' : 'Ex : RDV dentiste 14h…';
  var cat = $("noteCatRow"); if(cat) cat.style.display = (isForm || isArr) ? 'none' : '';
  var arw = $("noteArretRow"); if(arw) arw.style.display = isArr ? '' : 'none';
  var hw = $("noteHoursWrap"); if(hw) hw.style.display = isForm ? '' : 'none';
  var cond = $("noteFormCond"); if(cond) cond.style.display = isForm ? '' : 'none';
  var ai = $("noteArretInfo"); if(ai) ai.style.display = isArr ? '' : 'none';
  if(isArr) _renderArretRow();
  var sb = document.querySelector("#noteForm button[type='submit']");
  if(sb) sb.textContent = editingNoteId
    ? (isForm ? 'Modifier la formation' : isArr ? "Modifier l'arrêt" : 'Modifier la note')
    : (isForm ? 'Enregistrer la formation' : isArr ? "Enregistrer l'arrêt" : 'Enregistrer la note');
}
function resetNoteFormForDate(dateStr, mode){
  editingNoteId = null;
  if($("noteForm")) $("noteForm").reset();
  if($("noteTitle")) $("noteTitle").value = "";
  if($("noteText")) $("noteText").value = "";
  if($("noteHours")) $("noteHours").value = "";
  if($("noteDate")) $("noteDate").value = dateStr;
  if($("noteEndDate")) $("noteEndDate").value = dateStr;
  selectedNoteColor = '#1E6FE0';
  if(typeof _renderNoteColors==='function') _renderNoteColors();
  if($("noteCount")) $("noteCount").textContent = "0 / 200";
  _applyNoteFormMode(mode || 'note');
  // Arrêt : type par défaut → pré-remplit l'intitulé et la couleur associée.
  if(_noteFormMode === 'arret') _pickArretType('maternite');
}
function saveNote(event){
  if(event) event.preventDefault();
  const isForm = _noteFormMode === 'formation';
  const rawTitle=($("noteTitle").value||'').trim();
  const text=($("noteText").value||'').trim();
  const d=$("noteDate").value, e=$("noteEndDate").value||d;
  if(!d){ toast("Choisis une date."); return; }
  if(e<d){ toast("La date de fin ne peut pas être avant le début."); return; }
  const arr=getNotes();
  if(_noteFormMode === 'arret'){
    const at = ARRET_META_SITE[_noteArretType] ? _noteArretType : 'maternite';
    const rec = {date:d,endDate:e,title:rawTitle||ARRET_META_SITE[at].label,text:text,color:selectedNoteColor,kind:'arret',arretType:at};
    if(editingNoteId){ const i=arr.findIndex(function(n){return n.id===editingNoteId;}); if(i>=0) arr[i]=Object.assign({}, arr[i], rec); }
    else { arr.push(Object.assign({ id:'n'+Date.now().toString(36)+Math.random().toString(36).slice(2,6) }, rec)); }
    _saveNotesArr(arr);
    editingNoteId=null;
    toast("Arrêt enregistré ✓");
    if(typeof renderCalendar==='function') renderCalendar();
    if(typeof renderChart==='function') renderChart();
    activateView("calendar");
    return;
  }
  if(isForm){
    if(!rawTitle){ toast("Indique l'organisme de formation."); return; }
    let h = Number(($("noteHours").value||'').replace(',','.'));
    if(!h || h<=0){ toast("Indique le nombre d'heures de formation."); return; }
    h = Math.round(h*10)/10;
    const rec = {date:d,endDate:e,title:rawTitle,text:text,color:selectedNoteColor,kind:'formation',hours:h};
    if(editingNoteId){ const i=arr.findIndex(function(n){return n.id===editingNoteId;}); if(i>=0) arr[i]=Object.assign({}, arr[i], rec); }
    else { arr.push(Object.assign({ id:'n'+Date.now().toString(36)+Math.random().toString(36).slice(2,6) }, rec)); }
    _saveNotesArr(arr);
    editingNoteId=null;
    toast("Formation enregistrée ✓");
    if(typeof renderCalendar==='function') renderCalendar();
    if(typeof renderChart==='function') renderChart(); // maj de la jauge 507 h
    activateView("calendar");
    return;
  }
  const title = rawTitle || 'Note';
  if(!text){ toast("Écris ta note (courte)."); return; }
  if(editingNoteId){ const i=arr.findIndex(function(n){return n.id===editingNoteId;}); if(i>=0) arr[i]=Object.assign({}, arr[i], {date:d,endDate:e,title:title,text:text,color:selectedNoteColor,kind:'note'}); }
  else { arr.push({ id:'n'+Date.now().toString(36)+Math.random().toString(36).slice(2,6), date:d, endDate:e, title:title, text:text, color:selectedNoteColor, kind:'note' }); }
  _saveNotesArr(arr);
  editingNoteId=null;
  toast("Note enregistrée ✓");
  if(typeof renderCalendar==='function') renderCalendar();
  activateView("calendar");
}
function editNote(id){
  const n=getNotes().find(function(x){return x.id===id;}); if(!n) return;
  addMissionReturnView='calendar';
  activateView('add-mission'); switchAddTab('note');
  editingNoteId=id;
  if($("noteTitle")) $("noteTitle").value=n.title||'';
  if($("noteText")) $("noteText").value=n.text||'';
  if($("noteHours")) $("noteHours").value=(n.hours!=null?n.hours:'');
  if($("noteDate")) $("noteDate").value=n.date;
  if($("noteEndDate")) $("noteEndDate").value=n.endDate||n.date;
  selectedNoteColor=n.color||'#1E6FE0';
  if(typeof _renderNoteColors==='function') _renderNoteColors();
  if($("noteCount")) $("noteCount").textContent = (n.text||'').length + " / 200";
  // Arrêt : on restaure le type RÉELLEMENT enregistré avant d'appliquer le mode (qui redessine la
  // rangée de types). On n'appelle pas _pickArretType ici : il réécrirait le titre saisi par l'user.
  if(n.kind === 'arret' && ARRET_META_SITE[n.arretType]) _noteArretType = n.arretType;
  _applyNoteFormMode(n.kind==='formation' ? 'formation' : n.kind==='arret' ? 'arret' : 'note');
  window.scrollTo({top:0,behavior:'smooth'});
}
function deleteNote(id){
  _saveNotesArr(getNotes().filter(function(n){return n.id!==id;}));
  if(typeof renderCalendar==='function') renderCalendar();
  _refreshDayModal();
  toast("Note supprimée");
}
function _ensureDayModal(){
  if(document.getElementById('dayModalOverlay')) return;
  const st=document.createElement('style');
  st.textContent="#dayModalOverlay{position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;align-items:flex-end;justify-content:center;z-index:100040;}#dayModalOverlay.open{display:flex;}.dm-box{background:var(--card);color:var(--text);border-radius:22px 22px 0 0;width:100%;max-width:560px;max-height:90vh;overflow-y:auto;box-sizing:border-box;padding:22px 22px 30px;box-shadow:0 -10px 40px rgba(0,0,0,.3);}@media(min-width:600px){#dayModalOverlay{align-items:center;padding:18px;}.dm-box{border-radius:20px;max-width:440px;max-height:88vh;}}.dm-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;}.dm-date{font-size:17px;font-weight:900;color:var(--petrol);text-transform:capitalize;}.dm-x{background:none;border:none;font-size:20px;color:var(--muted);cursor:pointer;}.dm-acts{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:8px;}.dm-act{flex:1 1 46%;display:flex;flex-direction:column;align-items:center;gap:6px;padding:15px 8px;border-radius:14px;border:1.5px solid var(--line);background:var(--card);cursor:pointer;font-weight:800;font-size:13px;color:var(--text);}.dm-act .ic{font-size:24px;}.dm-act.mission{border-color:rgba(31,78,95,.35);}.dm-act.note{border-color:rgba(245,158,11,.45);}.dm-act.fast{border-color:rgba(18,117,74,.5);color:#12754A;}.dm-act.regime{border-color:rgba(14,165,233,.5);color:#0EA5E9;}.dm-act.arret{border-color:rgba(219,39,119,.45);color:#DB2777;}.dm-sec-t{font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin:16px 0 8px;}.dm-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--line);border-left-width:4px;border-radius:10px;margin-bottom:8px;}.dm-item .nm{flex:1;min-width:0;}.dm-item .nm strong{font-size:13px;color:var(--petrol);display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.dm-item .nm span{font-size:11.5px;color:var(--muted);display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;}.dm-item .acts{display:flex;gap:6px;flex-shrink:0;}.dm-item button{border:none;background:var(--soft);color:var(--petrol);border-radius:8px;padding:6px 10px;font-size:11.5px;font-weight:700;cursor:pointer;}.dm-item button.del{background:rgba(220,38,38,.12);color:#DC2626;}";
  document.head.appendChild(st);
  const ov=document.createElement('div');
  ov.id='dayModalOverlay';
  ov.innerHTML="<div class=\"dm-box\" id=\"dmBox\"></div>";
  document.body.appendChild(ov);
  ov.addEventListener('click', function(e){
    if(e.target===ov || (e.target.closest && e.target.closest('#dmClose'))){ ov.classList.remove('open'); return; }
    if(e.target.closest && e.target.closest('#dmAddMission')){ ov.classList.remove('open'); addMissionReturnView='calendar'; activateView('add-mission'); switchAddTab('mission'); resetMissionFormForDate(_dayModalDate); window.scrollTo({top:0,behavior:'smooth'}); return; }
    if(e.target.closest && e.target.closest('#dmAddNote')){ ov.classList.remove('open'); addMissionReturnView='calendar'; activateView('add-mission'); switchAddTab('note'); resetNoteFormForDate(_dayModalDate,'note'); window.scrollTo({top:0,behavior:'smooth'}); return; }
    if(e.target.closest && e.target.closest('#dmAddFormation')){ ov.classList.remove('open'); addMissionReturnView='calendar'; activateView('add-mission'); switchAddTab('note'); resetNoteFormForDate(_dayModalDate,'formation'); window.scrollTo({top:0,behavior:'smooth'}); return; }
    if(e.target.closest && e.target.closest('#dmAddArret')){ ov.classList.remove('open'); addMissionReturnView='calendar'; activateView('add-mission'); switchAddTab('note'); resetNoteFormForDate(_dayModalDate,'arret'); window.scrollTo({top:0,behavior:'smooth'}); return; }
    if(e.target.closest && e.target.closest('#dmAddRegime')){ ov.classList.remove('open'); addMissionReturnView='calendar'; activateView('add-mission'); switchAddTab('mission'); resetMissionFormForDate(_dayModalDate,'general'); window.scrollTo({top:0,behavior:'smooth'}); return; }
    if(e.target.closest && e.target.closest('#dmAddQuick')){ ov.classList.remove('open'); openQuickEntry(_dayModalDate); return; }
    const me=e.target.closest && e.target.closest('[data-dm-edit]'); if(me){ ov.classList.remove('open'); switchAddTab('mission'); editMission(me.dataset.dmEdit); return; }
    const md=e.target.closest && e.target.closest('[data-dm-del]'); if(md){ ov.classList.remove('open'); deleteMission(md.dataset.dmDel); return; }
    const ne=e.target.closest && e.target.closest('[data-dm-nedit]'); if(ne){ ov.classList.remove('open'); editNote(ne.dataset.dmNedit); return; }
    const nd=e.target.closest && e.target.closest('[data-dm-ndel]'); if(nd){ deleteNote(nd.dataset.dmNdel); return; }
  });
}
function _refreshDayModal(){
  const box=document.getElementById('dmBox'); if(!box || !_dayModalDate) return;
  const dateStr=_dayModalDate;
  const ms=missions.filter(function(m){return isDateInPeriod(dateStr,m);}).sort(function(a,b){return new Date(a.date)-new Date(b.date);});
  const ns=notesForDate(dateStr);
  let html="<div class=\"dm-head\"><span class=\"dm-date\">"+escapeHtml(formatDate(dateStr))+"</span><button class=\"dm-x\" id=\"dmClose\" type=\"button\">✕</button></div>";
  html+="<div class=\"dm-acts\"><button class=\"dm-act mission\" id=\"dmAddMission\" type=\"button\"><span class=\"ic\"><svg viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"2\" y=\"7\" width=\"20\" height=\"14\" rx=\"2\"/><path d=\"M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"/></svg></span>Ajouter une mission</button><button class=\"dm-act note\" id=\"dmAddNote\" type=\"button\"><span class=\"ic\"><svg viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5 3h9l5 5v13H5z\"/><path d=\"M14 3v5h5\"/><path d=\"M8 13.5h7M8 17h5\"/></svg></span>Note perso</button><button class=\"dm-act formation\" id=\"dmAddFormation\" type=\"button\"><span class=\"ic\"><svg viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M22 10L12 5 2 10l10 5 10-5z\"/><path d=\"M6 12v5c0 1 2.5 3 6 3s6-2 6-3v-5\"/></svg></span>Formation</button><button class=\"dm-act arret\" id=\"dmAddArret\" type=\"button\"><span class=\"ic\"><svg viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 3a3 3 0 0 1 3 3v1h3a2 2 0 0 1 2 2v3h-1.5a2.5 2.5 0 0 0 0 5H20v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3h1.5a2.5 2.5 0 0 0 0-5H4V9a2 2 0 0 1 2-2h3V6a3 3 0 0 1 3-3z\"/></svg></span>Arrêt</button><button class=\"dm-act regime\" id=\"dmAddRegime\" type=\"button\"><span class=\"ic\"><svg viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"3\" y=\"4\" width=\"18\" height=\"12\" rx=\"1\"/><path d=\"M7 20h10M12 16v4\"/></svg></span>Régime général</button><button class=\"dm-act fast\" id=\"dmAddQuick\" type=\"button\"><span class=\"ic\"><svg viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M13 2L3 14h7l-1 8 10-12h-7z\"/></svg></span>Saisie rapide</button></div>";
  if(ms.length){ html+="<div class=\"dm-sec-t\">Missions du jour</div>"; ms.forEach(function(m){ var col=getProductionColorHex(normalizeProductionName(m.production))||'#1F4E5F'; var nb=missionDayCount(m); html+="<div class=\"dm-item\" style=\"border-left-color:"+col+"\"><div class=\"nm\"><strong>"+escapeHtml((m.production||'').toUpperCase())+"</strong><span>"+escapeHtml(m.type)+" · "+(Math.round((Number(m.hours||0)/nb)*10)/10)+"h · "+money(Math.round(Number(m.gross||0)/nb))+"</span></div><div class=\"acts\"><button data-dm-edit=\""+escapeHtml(m.id)+"\" type=\"button\">Modifier</button><button class=\"del\" data-dm-del=\""+escapeHtml(m.id)+"\" type=\"button\">✕</button></div></div>"; }); }
  if(ns.length){ html+="<div class=\"dm-sec-t\">Notes</div>"; ns.forEach(function(n){ html+="<div class=\"dm-item\" data-note-detail=\""+escapeHtml(n.id)+"\" style=\"cursor:pointer;border-left-color:"+(n.color||'#1E6FE0')+"\"><div class=\"nm\"><strong>"+escapeHtml(n.title||'Note')+"</strong><span>"+escapeHtml((n.text||'').slice(0,90))+"</span></div><div class=\"acts\"><span style=\"color:var(--muted);font-size:18px;\">›</span></div></div>"; }); }
  box.innerHTML=html;
}
function openDayModal(dateStr){
  _ensureDayModal();
  _dayModalDate=dateStr;
  _refreshDayModal();
  document.getElementById('dayModalOverlay').classList.add('open');
}

// ===== Saisie rapide du mois (site) : total heures + brut d'un mois d'un coup =====
// Crée UNE mission-résumé (mission_type 'Saisie rapide') → compte dans les 507 h et l'estimation FT comme une mission.
let _quickMonthRef = new Date();
let _quickColor = PROD_PRESETS[0];
let _qkHours = "", _qkGross = "", _qkJours = "";
// Payé à l'heure (répétitions, services, technique) ou en cachets : STOCKÉ dans is_cachet.
// Avant, un mois de répétitions payées à l'heure ressortait en cachet fantôme (le champ vide forçait 1).
let _qkMode = "heures";
function _quickProdName(){ const l = _quickMonthRef.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }); return normalizeProductionName("RÉCAP " + (l.charAt(0).toUpperCase() + l.slice(1))); }
function _qkCapture(){ const h = document.getElementById("qkHours"); if (h) _qkHours = h.value; const g = document.getElementById("qkGross"); if (g) _qkGross = g.value; const j = document.getElementById("qkJours"); if (j) _qkJours = j.value; }
function _ensureQuickModal(){
  if (document.getElementById("quickOverlay")) return;
  const st = document.createElement("style");
  st.textContent = "#quickOverlay{position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;align-items:flex-end;justify-content:center;z-index:100050;}#quickOverlay.open{display:flex;}.qk-box{background:var(--card);color:var(--text);border-radius:22px 22px 0 0;width:100%;max-width:560px;max-height:92vh;overflow-y:auto;box-sizing:border-box;padding:22px 22px 30px;}@media(min-width:600px){#quickOverlay{align-items:center;padding:18px;}.qk-box{border-radius:20px;max-width:440px;}}.qk-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;}.qk-title{font-size:18px;font-weight:900;color:var(--petrol);}.qk-x{background:var(--soft);border:none;width:32px;height:32px;border-radius:50%;font-size:16px;color:var(--muted);cursor:pointer;}.qk-intro{font-size:12.5px;color:var(--muted);margin-bottom:10px;line-height:1.4;}.qk-lbl{font-size:12.5px;font-weight:700;color:var(--petrol);margin:12px 0 5px;display:block;}.qk-month{display:flex;align-items:center;gap:10px;}.qk-mbtn{width:36px;height:36px;border-radius:50%;border:none;background:var(--soft);color:var(--petrol);font-size:18px;font-weight:800;cursor:pointer;}.qk-mlbl{flex:1;text-align:center;font-weight:800;color:var(--petrol);font-size:14px;background:var(--soft);border-radius:10px;padding:9px;}.qk-row{display:flex;gap:10px;}.qk-row>div{flex:1;}.qk-in{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid var(--line);border-radius:11px;background:var(--card);color:var(--text);font-size:14px;font-family:inherit;}.qk-colors{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}.qk-sw{width:30px;height:30px;border-radius:9px;border:2px solid transparent;cursor:pointer;}.qk-sw.sel{border-color:var(--text);}.qk-mode{display:flex;gap:10px;}.qk-mopt{flex:1;text-align:left;border:1.5px solid var(--line);background:var(--card);color:var(--text);border-radius:12px;padding:10px 12px;cursor:pointer;font-family:inherit;display:flex;flex-direction:column;gap:2px;}.qk-mopt.sel-h{border-color:var(--petrol);background:var(--petrol);}.qk-mopt.sel-c{border-color:#F97316;background:#F97316;}.qk-mopt.sel-h .qk-mt,.qk-mopt.sel-c .qk-mt{color:#fff;}.qk-mopt.sel-h .qk-ms,.qk-mopt.sel-c .qk-ms{color:rgba(255,255,255,.88);}.qk-mt{font-size:14px;font-weight:800;}.qk-ms{font-size:11px;color:var(--muted);line-height:1.35;}.qk-hint{font-size:11px;color:var(--muted);line-height:1.45;margin-top:6px;}.qk-warn{margin-top:13px;background:#FFF7ED;border:1px solid #FCE4C7;border-radius:11px;padding:11px 13px;font-size:11.5px;color:#9A5B12;line-height:1.5;}.qk-save{margin-top:16px;width:100%;padding:13px;border:none;border-radius:12px;background:var(--petrol);color:#fff;font-weight:800;font-size:14.5px;cursor:pointer;font-family:inherit;}.qk-cancel{width:100%;padding:12px;margin-top:8px;border:none;background:transparent;color:var(--muted);font-weight:700;cursor:pointer;font-family:inherit;}";
  document.head.appendChild(st);
  const ov = document.createElement("div");
  ov.id = "quickOverlay";
  ov.innerHTML = "<div class=\"qk-box\" id=\"qkBox\"></div>";
  document.body.appendChild(ov);
  ov.addEventListener("click", function(e){
    if (e.target === ov || (e.target.closest && (e.target.closest("#qkClose") || e.target.closest("#qkCancel")))) { ov.classList.remove("open"); return; }
    const nav = e.target.closest && e.target.closest("[data-qk-nav]");
    if (nav) { _qkCapture(); const n = new Date(_quickMonthRef); n.setDate(1); n.setMonth(n.getMonth() + Number(nav.dataset.qkNav)); _quickMonthRef = n; _renderQuickModal(); return; }
    const sw = e.target.closest && e.target.closest("[data-qk-color]");
    if (sw) { _qkCapture(); _quickColor = sw.dataset.qkColor; _renderQuickModal(); return; }
    const md = e.target.closest && e.target.closest("[data-qk-mode]");
    if (md) { _qkCapture(); _qkMode = md.dataset.qkMode; _renderQuickModal(); return; }
    if (e.target.closest && e.target.closest("#qkSave")) { _saveQuick(); return; }
  });
}
function _renderQuickModal(){
  const box = document.getElementById("qkBox"); if (!box) return;
  const y = _quickMonthRef.getFullYear(), mo = _quickMonthRef.getMonth();
  const monthL = (function(){ const l = _quickMonthRef.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }); return l.charAt(0).toUpperCase() + l.slice(1); })();
  const hasDetailed = missions.some(function(m){ const d = new Date(m.date + "T00:00:00"); return d.getFullYear() === y && d.getMonth() === mo && m.type !== "Saisie rapide"; });
  const existing = missions.find(function(m){ const d = new Date(m.date + "T00:00:00"); return d.getFullYear() === y && d.getMonth() === mo && m.type === "Saisie rapide"; });
  const sel = (_quickColor || "").toLowerCase();
  const presetLc = PROD_PRESETS.map(function(p){ return p.toLowerCase(); });
  const swatches = PROD_PRESETS.concat(getCustomColors().filter(function(c){ return presetLc.indexOf(c.toLowerCase()) < 0; })).map(function(c){ return '<button type="button" class="qk-sw' + (c.toLowerCase() === sel ? " sel" : "") + '" data-qk-color="' + c + '" style="background:' + c + '"></button>'; }).join("");
  box.innerHTML =
    '<div class="qk-head"><span class="qk-title">Saisie rapide du mois</span><button class="qk-x" id="qkClose" type="button">✕</button></div>' +
    '<div class="qk-intro">Le total du mois d\'un coup, sans détailler chaque mission. Compté dans tes 507 h et l\'estimation France Travail.</div>' +
    '<label class="qk-lbl">Mois concerné</label>' +
    '<div class="qk-month"><button class="qk-mbtn" data-qk-nav="-1" type="button">‹</button><span class="qk-mlbl">' + escapeHtml(monthL) + '</span><button class="qk-mbtn" data-qk-nav="1" type="button">›</button></div>' +
    '<label class="qk-lbl">Comment tu as été payé ce mois-ci</label>' +
    '<div class="qk-mode">' +
      '<button type="button" class="qk-mopt' + (_qkMode === "heures" ? " sel-h" : "") + '" data-qk-mode="heures"><span class="qk-mt">À l\'heure</span><span class="qk-ms">Répétitions, services, technique…</span></button>' +
      '<button type="button" class="qk-mopt' + (_qkMode === "cachet" ? " sel-c" : "") + '" data-qk-mode="cachet"><span class="qk-mt">En cachets</span><span class="qk-ms">Représentations, tournages…</span></button>' +
    '</div>' +
    '<div class="qk-row"><div><label class="qk-lbl">Total heures</label><input class="qk-in" id="qkHours" type="number" inputmode="decimal" min="0" step="0.5" placeholder="Ex : 120" value="' + escapeHtml(_qkHours) + '"></div><div><label class="qk-lbl">Brut total (€)</label><input class="qk-in" id="qkGross" type="number" inputmode="decimal" min="0" placeholder="Ex : 3200" value="' + escapeHtml(_qkGross) + '"></div></div>' +
    '<label class="qk-lbl">' + (_qkMode === "cachet" ? "Nombre de cachets" : "Jours travaillés (facultatif)") + '</label><input class="qk-in" id="qkJours" type="number" inputmode="numeric" min="0" placeholder="' + (_qkMode === "cachet" ? "Ex : 10" : "Ex : 15") + '" value="' + escapeHtml(_qkJours) + '">' +
    (_qkMode === "heures" ? '<div class="qk-hint">Laisse vide si tu ne sais pas : aucun cachet ne sera compté.</div>' : "") +
    '<label class="qk-lbl">Couleur</label><div class="qk-colors">' + swatches + '</div>' +
    (hasDetailed ? '<div class="qk-warn">⚠️ Ce mois contient déjà des missions détaillées. Pour ne pas compter les heures en double, utilise soit le détail, soit la saisie rapide — pas les deux.</div>' : "") +
    '<button class="qk-save" id="qkSave" type="button">' + (existing ? "Mettre à jour le mois" : "Enregistrer le mois") + '</button>' +
    '<button class="qk-cancel" id="qkCancel" type="button">Annuler</button>';
}
function openQuickEntryCurrent(){ openQuickEntry(current.getFullYear() + "-" + String(current.getMonth() + 1).padStart(2, "0") + "-01"); }
function openQuickEntry(dateStr){
  _ensureQuickModal();
  const d = dateStr ? new Date(dateStr + "T00:00:00") : new Date(); d.setDate(1);
  _quickMonthRef = d; _quickColor = PROD_PRESETS[0]; _qkHours = ""; _qkGross = ""; _qkJours = ""; _qkMode = "heures";
  _renderQuickModal();
  document.getElementById("quickOverlay").classList.add("open");
}
async function _saveQuick(){
  _qkCapture();
  const h = Number((_qkHours || "").replace(",", "."));
  if (!h || h <= 0) { toast("Indique le total d'heures du mois."); return; }
  const g = Number((_qkGross || "").replace(",", ".")) || 0;
  const j = Number((_qkJours || "").replace(",", ".")) || 0;
  // En cachets, le nombre de cachets fait le comptage → indispensable. À l'heure, c'est un simple
  // nombre de jours, jamais un cachet (sinon un mois de répétitions ressortait en cachet fantôme).
  if (_qkMode === "cachet" && j <= 0) { toast("Indique le nombre de cachets. Si tu as été payé à l'heure, choisis « À l'heure »."); return; }
  const y = _quickMonthRef.getFullYear(), mo = _quickMonthRef.getMonth();
  const first = y + "-" + String(mo + 1).padStart(2, "0") + "-01";
  const prod = _quickProdName();
  const existing = missions.find(function(m){ const d = new Date(m.date + "T00:00:00"); return d.getFullYear() === y && d.getMonth() === mo && m.type === "Saisie rapide"; });
  const payload = { user_id: currentUser.id, production: prod, emission: "", lieu: "", mission_type: "Saisie rapide", mission_date: first, end_date: first, hours: Math.round(h * 10) / 10, gross_amount: Math.round(g), vacations: j > 0 ? Math.round(j) : 1, is_cachet: (_qkMode === "cachet"), km_distance: 0, km_rate: 0, km_amount: 0 };
  setProductionColorHex(prod, _quickColor);
  const result = existing ? await sb.from("missions").update(payload).eq("id", existing.id) : await sb.from("missions").insert(payload);
  if (result.error) { toast("Erreur : " + result.error.message); return; }
  document.getElementById("quickOverlay").classList.remove("open");
  toast("Mois enregistré ✓");
  await loadMissions();
}

// Récap au format actualisation France Travail : une ligne par mission
// (Production · Période · Heures · Jours/Cachets · Brut), + total. À recopier ligne par ligne.
function buildActualisationText() {
  const list = monthMissions(current).sort((a, b) => new Date(a.date) - new Date(b.date)); // tout le mois (aligné dashboard)
  const title = current.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const artiste = (typeof _profil !== "undefined" && _profil && _profil.annexe === "artiste");
  const unit = artiste ? "cachet" : "jour";
  const lines = ["Actualisation — " + title, ""];
  list.forEach((m) => {
    const j = missionDayCount(m);
    lines.push("• " + m.production + " · " + formatPeriod(m.date, m.endDate) + " · " + m.hours + "h · " + j + " " + unit + (j > 1 ? "s" : "") + " · " + money2(m.gross));
  });
  lines.push("");
  const totalDays = sumMissionDays(list);
  const totalHours = Math.round(sumDone(list) * 10) / 10;
  const totalGross = list.reduce((a, x) => a + Number(x.gross || 0), 0);
  lines.push("Total : " + totalDays + " " + unit + (totalDays > 1 ? "s" : "") + " · " + totalHours + "h · " + money2(totalGross) + " brut");
  return lines.join("\n");
}

function renderActualisation() {
  if (!$("actualisationMonthPicker")) return;
  const list = monthMissions(current).sort((a, b) => new Date(a.date) - new Date(b.date)); // tout le mois (aligné sur le dashboard) — une date non faite = à supprimer
  const totalHours = Math.round(list.reduce((a, x) => a + Number(x.hours || 0) * (missionDaysInMonth(x, current) / missionDayCount(x)), 0) * 10) / 10;
  const totalGross = Math.round(list.reduce((a, x) => a + Number(x.gross || 0) * (missionDaysInMonth(x, current) / missionDayCount(x)), 0));
  const totalVac = sumMonthVac(list, current); // 1 vacation = 1 jour de mission (borné au mois) — heures/brut au prorata idem

  $("actualisationMonthPicker").value = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
  if ($("actualisationMonthTitle")) $("actualisationMonthTitle").textContent = current.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  if ($("actualisationCount")) $("actualisationCount").textContent = list.length;
  if ($("actualisationHours")) $("actualisationHours").textContent = totalHours + "h";
  if ($("actualisationGross")) $("actualisationGross").textContent = money2(totalGross);
  if ($("actualisationVac")) $("actualisationVac").textContent = totalVac;
  if ($("vacLabelActu")){ const _art=(typeof _profil!=="undefined" && _profil && _profil.annexe==="artiste"); $("vacLabelActu").textContent = _art ? "Cachets" : "Vacations"; }

  const stats = $("actualisationStats");
  const tableWrap = $("actualisationTableWrap");
  const actions = $("actualisationActions");
  const container = $("actualisationList");
  if (!container) return;

  if (!list.length) {
    if (stats) stats.style.display = "none";
    if (tableWrap) tableWrap.style.display = "block";
    if (actions) actions.style.display = "none";
    container.innerHTML = `<div class="empty">Aucune mission effectuée sur ce mois.</div>`;
    return;
  }

  if (stats) stats.style.display = "";
  if (tableWrap) tableWrap.style.display = "block";
  if (actions) actions.style.display = "";

  const rows = list.map((mission) => `
    <div class="mission-history-card">
      <div class="mission-history-head"><strong>${ICO.doc}${escapeHtml(mission.production)}</strong><span class="pill">${escapeHtml(mission.type)}</span></div>
      <div class="mission-history-info">
        <span>${ICO.cal}${escapeHtml(formatPeriod(mission.date, mission.endDate))}</span>
        ${mission.emission ? `<span>${ICO.camera}${escapeHtml(mission.emission)}</span>` : ""}
        ${mission.lieu ? `<span>${ICO.pin}${escapeHtml(mission.lieu)}</span>` : ""}
        <span>${ICO.clock}${mission.hours}h</span>
        <span>${ICO.euro}${(Math.round(Number(mission.gross)||0)).toLocaleString('fr-FR')}</span>
      </div>
    </div>
  `).join("");
  container.innerHTML = `<div class="mission-card-grid">${rows}</div>`;
}

async function copyActualisation() {
  const text = buildActualisationText();
  await navigator.clipboard.writeText(text);
  toast("Récapitulatif copié.");
}

function generateActualisationPDF() {
  const list = monthMissions(current).filter((m) => new Date(m.date + "T00:00:00") <= todayDateOnly()).sort((a, b) => new Date(a.date) - new Date(b.date));
  const title = current.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const totalHours = Math.round(sumDone(list) * 10) / 10;
  const totalGross = list.reduce((a, x) => a + Number(x.gross || 0), 0);
  const totalDays = sumMissionDays(list);
  const rows = list.map((mission) => `<tr><td>${escapeHtml(formatPeriod(mission.date, mission.endDate))}</td><td><strong>${ICO.doc}${escapeHtml(mission.production)}</strong></td><td>${escapeHtml(mission.type)}</td><td>${escapeHtml(mission.hours)}h</td><td>${escapeHtml(money2(mission.gross))}</td></tr>`).join("");
  const win = window.open("", "_blank");
  if (!win) { toast("Impossible d'ouvrir la fenêtre PDF. Autorise les pop-ups pour ce site."); return; }
  win.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"/><title>Actualisation ${escapeHtml(title)}</title><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#2D3748;background:#fff;padding:34px}.header{border-bottom:3px solid #1F4E5F;padding-bottom:16px;margin-bottom:22px}h1{margin:0;color:#1F4E5F;font-size:28px;letter-spacing:-.03em}.subtitle{color:#718096;margin:6px 0 0;font-size:14px}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:22px 0 24px}.summary-box{border:1px solid #E2E8F0;border-radius:14px;padding:14px;background:#F8FAF9}.summary-box strong{display:block;color:#1F4E5F;font-size:24px;line-height:1.1}.summary-box span{display:block;margin-top:4px;color:#718096;font-size:12px;text-transform:uppercase;font-weight:700}table{width:100%;border-collapse:collapse;margin-top:10px}th{text-align:left;color:#718096;font-size:12px;text-transform:uppercase;letter-spacing:.03em;padding:10px 8px;border-bottom:2px solid #E2E8F0}td{padding:12px 8px;border-bottom:1px solid #E2E8F0;font-size:14px;vertical-align:top}tr:nth-child(even) td{background:#FBFCFC}.footer{margin-top:26px;padding-top:12px;border-top:1px solid #E2E8F0;font-size:12px;color:#718096;line-height:1.45}@media print{body{padding:20px}.summary-box,tr:nth-child(even) td{print-color-adjust:exact;-webkit-print-color-adjust:exact}}</style></head><body><div class="header"><h1>Récapitulatif actualisation</h1><p class="subtitle">${escapeHtml(title)} · Généré avec Intermitrack</p></div><div class="summary"><div class="summary-box"><strong>${escapeHtml(totalDays)}</strong><span>Journées</span></div><div class="summary-box"><strong>${escapeHtml(totalHours)}h</strong><span>Heures</span></div><div class="summary-box"><strong>${escapeHtml(money2(totalGross))}</strong><span>Brut total</span></div></div>${list.length ? `<table><thead><tr><th>Période</th><th>Production</th><th>Mission</th><th>Heures</th><th>Brut</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="empty">Aucune mission effectuée sur ce mois.</div>`}<p class="footer">Ce document est un récapitulatif personnel destiné à faciliter l'actualisation mensuelle. Les informations doivent être vérifiées par l'utilisateur avant déclaration officielle.</p></body></html>`);
  win.document.close(); win.focus(); win.print();
}


function applyTheme(theme) {
  // Thèmes premium mis de côté pour l'instant (trop de couleurs codées en dur qui ne suivaient pas).
  // On ne garde que Clair / Sombre, qui fonctionnent parfaitement. Tout thème premium retombe sur Clair.
  if (theme !== "light" && theme !== "dark") { theme = "light"; try { localStorage.setItem("intermitrack_theme", "light"); } catch (e) {} }
  document.body.classList.remove("theme-dark", "theme-noir", "theme-rose", "theme-rock", "theme-hiphop", "theme-lyric", "dark-scheme");
  if (theme === "dark") document.body.classList.add("theme-dark");
  document.querySelectorAll(".theme-swatch").forEach(function (b) {
    b.classList.toggle("active", b.dataset.theme === theme);
  });
  if (typeof render === "function") render();
}

function setupEvents() {
  $("loginModeBtn").addEventListener("click", () => setAuthMode("login"));
  $("signupModeBtn").addEventListener("click", () => setAuthMode("signup"));
  if ($("forgotPwBtn")) $("forgotPwBtn").addEventListener("click", handleForgotPassword);
  $("logoutBtn").addEventListener("click", logout);
 
  if ($("togglePassword")) {
    $("togglePassword").addEventListener("click", () => {
      const input = $("authPassword");
      if (!input) return;
      input.type = input.type === "password" ? "text" : "password";
      $("togglePassword").textContent = input.type === "password" ? "👁" : "🙈";
    });
  }
 
  $("authForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    $("authMsg").textContent = "Chargement...";
    const email = $("authEmail").value.trim();
    const password = $("authPassword").value;
    if (authMode === "signup" && password.length < 8) { $("authMsg").textContent = "Le mot de passe doit contenir au moins 8 caractères."; return; }
    let result;
    // Inscription DEPUIS LE SITE : le mail de confirmation renvoie sur le SITE (pas l'app).
    if (authMode === "signup") result = await sb.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + "/" } });
    else result = await sb.auth.signInWithPassword({ email, password });
    if (result.error) { $("authMsg").textContent = authErrorMessage(result.error.message); return; }
    if (authMode === "signup" && !result.data?.session) {
      // Confirmation par email requise : aucune session active tant que l'email n'est pas validé
      $("authMsg").textContent = "✅ Compte créé ! Clique sur le lien de confirmation reçu par email (vérifie tes spams), puis reviens te connecter.";
      return;
    }
    await init();
  });
 
  $("missionForm").addEventListener("submit", addMission);
  if ($("noteForm")) $("noteForm").addEventListener("submit", saveNote);
  document.querySelectorAll('.add-tab').forEach(function(b){ b.addEventListener('click', function(){ switchAddTab(b.dataset.addtab); }); });
  document.addEventListener('click', function(e){
    const nc=e.target.closest && e.target.closest('.note-color');
    if(nc && document.getElementById('noteColorRow')){ selectedNoteColor=nc.dataset.nc; document.querySelectorAll('#noteColorRow .note-color').forEach(function(x){ x.classList.toggle('sel', x===nc); }); return; }
    const nadd=e.target.closest && e.target.closest('.note-color-add');
    if(nadd && document.getElementById('noteColorRow')){ openCustomColorPicker(selectedNoteColor||'#1E6FE0', function(hex){ if(typeof addCustomColor==='function') addCustomColor(hex); selectedNoteColor=hex; if(typeof _renderNoteColors==='function') _renderNoteColors(); }); return; }
    const cc=e.target.closest && e.target.closest('.note-cat');
    if(cc && cc.dataset.title){ if($("noteTitle")) $("noteTitle").value=cc.dataset.title; }
  });
  document.addEventListener('input', function(e){ if(e.target && e.target.id==='noteText'){ const c=$("noteCount"); if(c) c.textContent=(e.target.value||'').length+" / 200"; } });
  if ($("addMissionBackBtn")) $("addMissionBackBtn").addEventListener("click", () => activateView(addMissionReturnView));
  if ($("kmDistance")) $("kmDistance").addEventListener("input", updateKmPreview);
  if ($("kmRate")) $("kmRate").addEventListener("input", updateKmPreview);
  if ($("saveAreAdmissionDateBtn")) {
    $("saveAreAdmissionDateBtn").addEventListener("click", async () => {
      const value = $("areAdmissionDate").value;
      localStorage.setItem(storageKey("areAdmissionDate"), value);
      areAdmissionDate = value;
      aiYearOffset = 0; // on repart sur l'année d'intermittence en cours
      render();
      toast("Date d'admission ARE enregistrée.");
      // Synchro multi-appareils : on enregistre aussi dans Supabase.
      if (currentUser) { try { await sb.from('profiles').upsert({ id: currentUser.id, are_date: value || null }, { onConflict:'id' }); } catch(e){} }
    });
  }
 
  if ($("documentForm")) $("documentForm").addEventListener("submit", uploadDocument);
  if ($("refreshDocumentsBtn")) $("refreshDocumentsBtn").addEventListener("click", loadDocuments);
  if ($("itk-c1-go")) $("itk-c1-go").addEventListener("click", calculateEstimatedAreDailyRate);
 if ($("itk-c2-go")) $("itk-c2-go").addEventListener("click", calculateCarence);

  // boutons annexe (Artiste/Technicien) + déjà intermittent (Oui/Non)
  ["itk-c2-annexe", "itk-c2-deja"].forEach(function (id) {
    var box = $(id); if (!box) return;
    box.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      [].forEach.call(box.children, function (x) { x.classList.toggle("itk-on", x === b); });
    });
  });

  // dépliage du tableau mois par mois
  if ($("itk-c2-toggle")) $("itk-c2-toggle").addEventListener("click", function () {
    this.classList.toggle("itk-open");
    if ($("itk-c2-tablebox")) $("itk-c2-tablebox").classList.toggle("itk-hide");
  });

  if ($("itk-c3-go")) $("itk-c3-go").addEventListener("click", () => {
    const brut = Number($("itk-c3-brut")?.value || 0);
    if (!brut) return;
    const net = Math.round(brut * 0.10 * 0.88);
    if ($("itk-c3-val")) $("itk-c3-val").textContent = money(net);
    if ($("itk-c3-out")) $("itk-c3-out").classList.remove("itk-hide");
  });
  $("date").addEventListener("change", () => { if (!$("endDate").value || $("endDate").value < $("date").value) $("endDate").value = $("date").value; });
 
  document.querySelectorAll(".tab").forEach((tab) => { tab.addEventListener("click", () => activateView(tab.dataset.view)); });

  if ($("factureForm")) $("factureForm").addEventListener("submit", saveFacture);
  if ($("aeCancelEdit")) $("aeCancelEdit").addEventListener("click", resetFactureForm);
  renderLignes();
  if ($("openPrestaModal")) $("openPrestaModal").addEventListener("click", openPrestaModal);
  if ($("aeDate") && !$("aeDate").value) $("aeDate").value = new Date().toISOString().slice(0, 10);
  if ($("aeMonth")) {
    if (!$("aeMonth").value) $("aeMonth").value = new Date().toISOString().slice(0, 7);
    $("aeMonth").addEventListener("change", renderFactures);
  }
  if ($("aeTaux")) $("aeTaux").addEventListener("input", () => {
    localStorage.setItem(storageKey("ae_taux"), $("aeTaux").value);
    renderFactures();
  });
  if ($("aeProfSave")) $("aeProfSave").addEventListener("click", saveAeProfile);

  // Carnet de sociétés
  if ($("societeForm")) $("societeForm").addEventListener("submit", saveSociete);
  if ($("societeCancelEdit")) $("societeCancelEdit").addEventListener("click", resetSocieteForm);
  if ($("societesList")) $("societesList").addEventListener("click", (e) => {
    const ed = e.target.closest("[data-societe-edit]");
    const del = e.target.closest("[data-societe-delete]");
    if (ed) editSociete(ed.getAttribute("data-societe-edit"));
    else if (del) deleteSociete(del.getAttribute("data-societe-delete"));
  });
  if ($("aeSocieteSelect")) $("aeSocieteSelect").addEventListener("change", onSocieteSelectChange);
  if ($("aeSocieteQuickAdd")) $("aeSocieteQuickAdd").addEventListener("click", (e) => {
    e.preventDefault();
    { const _cm = $("aeClientsModal"); if (_cm) { _aeDashCSS(); _cm.classList.add("open"); } }
    if ($("societeNom")) $("societeNom").scrollIntoView({ behavior: "smooth", block: "center" });
  });

  // Fiscalité : calcul automatique à chaque saisie
  const wireFiscal = (id, setter, evt) => {
    if ($(id)) $(id).addEventListener(evt || "input", () => { setter($(id).value); render(); });
  };
  wireFiscal("arePercue", setArePercue);
  wireFiscal("congesSpectaclesInput", setCongesSpectaclesInput);
  wireFiscal("otherIncomeInput", setOtherIncome);
  wireFiscal("taxPartsInput", setTaxParts);
  wireFiscal("autresFraisReels", setAutresFraisReels);
  wireFiscal("profileType", setProfileType, "change");
  if ($("saveTaxSettingsBtn")) $("saveTaxSettingsBtn").addEventListener("click", () => { render(); toast("Calcul mis à jour ✓", "success"); });

  if ($("kmCalcBtn")) $("kmCalcBtn").addEventListener("click", calcKmFromAddresses);
  // kmFrom / kmTo sont désormais masqués : la saisie passe par le pop-up, qui branche lui-même
  // l'autocomplétion sur son champ de recherche. Rien à attacher ici.
  attachAddressAutocomplete($("aeProfAdresse"));
  attachAddressAutocomplete($("aeClientAddress"));
  attachAddressAutocomplete($("societeAdresse"));
  // Choisir une puissance fiscale prime le taux manuel
  // Les sélecteurs de puissance et de tranche n'existent plus dans le formulaire : le taux vient de
  // « Mes informations » via kmProfilTaux().
  if ($("kmRoundTrip")) $("kmRoundTrip").addEventListener("change", updateKmPreview);
  if ($("kmEveryDay")) $("kmEveryDay").addEventListener("change", updateKmPreview);
  if ($("kmJustify")) $("kmJustify").addEventListener("change", updateKmPreview);
  // Recalcul des "jours travaillés" quand on change la période / les heures
  ["hours", "date", "endDate"].forEach((id) => { if ($(id)) $(id).addEventListener("input", updateKmPreview); });

  // Frais réels
  if ($("fraisForm")) $("fraisForm").addEventListener("submit", saveFrais);
  if ($("fraisDate") && !$("fraisDate").value) $("fraisDate").value = new Date().toISOString().slice(0, 10);
  if ($("fraisList")) $("fraisList").addEventListener("click", (e) => {
    const del = e.target.closest("[data-frais-delete]");
    if (del) deleteFrais(del.getAttribute("data-frais-delete"));
  });
  if ($("facturesList")) $("facturesList").addEventListener("click", (e) => {
    const ff = e.target.closest("[data-ffilter]");
    if (ff) { facturesFilter = ff.getAttribute("data-ffilter"); facturesPage = 1; renderFactures(); return; }
    const pg = e.target.closest("[data-fpage]");
    if (pg) { facturesPage += pg.getAttribute("data-fpage") === "next" ? 1 : -1; renderFactures(); return; }
    const pdf = e.target.closest("[data-facture-pdf]");
    const ed = e.target.closest("[data-facture-edit]");
    const del = e.target.closest("[data-facture-delete]");
    if (pdf) printFacture(pdf.getAttribute("data-facture-pdf"));
    else if (ed) editFacture(ed.getAttribute("data-facture-edit"));
    else if (del) deleteFacture(del.getAttribute("data-facture-delete"));
  });

  _renderTabDots(); // points de position des onglets (au 1er affichage)
 
  // Navigation de l'année fiscale (impôts)
  if ($("fyPrev")) $("fyPrev").addEventListener("click", () => { _fiscalYear--; render(); renderFraisList(); });
  if ($("fyNext")) $("fyNext").addEventListener("click", () => { _fiscalYear = Math.min(new Date().getFullYear(), _fiscalYear + 1); render(); renderFraisList(); });
  if ($("recapPrevBtn")) $("recapPrevBtn").addEventListener("click", () => moveMonth(-1));
  if ($("recapNextBtn")) $("recapNextBtn").addEventListener("click", () => moveMonth(1));
  if ($("recapMonthPicker")) {
    $("recapMonthPicker").addEventListener("change", () => {
      const value = $("recapMonthPicker").value;
      if (!value) return;
      const [year, month] = value.split("-").map(Number);
      current = new Date(year, month - 1, 1); render();
    });
  }
 
  $("calendarPrevBtn") && $("calendarPrevBtn").addEventListener("click", () => moveMonth(-1));
  $("calendarNextBtn") && $("calendarNextBtn").addEventListener("click", () => moveMonth(1));
 
  if ($("actualisationPrevBtn")) $("actualisationPrevBtn").addEventListener("click", () => moveMonth(-1));
  if ($("actualisationNextBtn")) $("actualisationNextBtn").addEventListener("click", () => moveMonth(1));
  if ($("actualisationMonthPicker")) {
    $("actualisationMonthPicker").addEventListener("change", () => {
      const value = $("actualisationMonthPicker").value;
      if (!value) return;
      const [year, month] = value.split("-");
      current = new Date(Number(year), Number(month) - 1, 1); render();
    });
  }
 
  if ($("copyActualisationBtn")) $("copyActualisationBtn").addEventListener("click", copyActualisation);
  if ($("pdfActualisationBtn")) $("pdfActualisationBtn").addEventListener("click", generateActualisationPDF);
  if ($("franceTravailBtn")) $("franceTravailBtn").addEventListener("click", () => {
    if ($("ftRecapText")) $("ftRecapText").value = buildActualisationText();
    if ($("modalFranceTravail")) $("modalFranceTravail").classList.remove("hidden");
  });
  if ($("ftRecapCopy")) $("ftRecapCopy").addEventListener("click", async () => {
    const t = $("ftRecapText") ? $("ftRecapText").value : "";
    try { await navigator.clipboard.writeText(t); toast("Récap copié ✅ Colle-le dans ton actualisation."); }
    catch (e) { if ($("ftRecapText")) { $("ftRecapText").select(); document.execCommand("copy"); toast("Récap copié ✅"); } }
  });
  if ($("modalFtClose")) $("modalFtClose").addEventListener("click", () => { if ($("modalFranceTravail")) $("modalFranceTravail").classList.add("hidden"); });
 
  document.addEventListener("click", async (event) => {
    const docProductionOpen = event.target.closest("[data-doc-production-open]");
    if (docProductionOpen) { openDocumentProduction = docProductionOpen.dataset.docProductionOpen; documentFilter = "Tous"; renderDocuments(); return; }
    const docProductionBack = event.target.closest("[data-doc-production-back]");
    if (docProductionBack) { openDocumentProduction = null; documentFilter = "Tous"; renderDocuments(); return; }
    const docFilterButton = event.target.closest("[data-doc-filter]");
    if (docFilterButton) { documentFilter = docFilterButton.dataset.docFilter; renderDocuments(); return; }
    const quickDelG = event.target.closest("[data-quick-del-group]");
    if (quickDelG) { event.stopPropagation(); const ids = quickDelG.dataset.quickDelGroup.split(','); const ok = await confirmDialog("Supprimer les " + ids.length + " missions de cette production ce mois ? (action irréversible)"); if (ok) { for (const id of ids) { await deleteMission(id); } } return; }
    const quickDel = event.target.closest("[data-quick-del]");
    if (quickDel) { event.stopPropagation(); const ok = await confirmDialog("Supprimer cette mission ? (action irréversible)"); if (ok) await deleteMission(quickDel.dataset.quickDel); return; }
    const calendarDay = event.target.closest("[data-calendar-date]");
    if (calendarDay) { openCalendarDay(calendarDay.dataset.calendarDate); return; }
    const calendarAddButton = event.target.closest("[data-calendar-add-date]");
    if (calendarAddButton) { addMissionReturnView = "calendar"; activateView("add-mission"); resetMissionFormForDate(calendarAddButton.dataset.calendarAddDate); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    const productionOpenButton = event.target.closest("[data-production-open]");
    if (productionOpenButton) { openProductionMissions(productionOpenButton.dataset.productionOpen); return; }
    const prodColorBtn = event.target.closest("[data-prod-color]");
    if (prodColorBtn) { _prodColor(prodColorBtn.dataset.prodColor); return; }
    const prodTarifBtn = event.target.closest("[data-prod-tarif]");
    if (prodTarifBtn) { _prodTarif(prodTarifBtn.dataset.prodTarif); return; }
    const prodOvertimeBtn = event.target.closest("[data-prod-overtime]");
    if (prodOvertimeBtn) { _prodOvertime(prodOvertimeBtn.dataset.prodOvertime); return; }
    const prodRenameBtn = event.target.closest("[data-prod-rename]");
    if (prodRenameBtn) { _prodRename(prodRenameBtn.dataset.prodRename); return; }
    const prodMergeIntoBtn = event.target.closest("[data-prod-merge-into]");
    if (prodMergeIntoBtn) { _prodMergeInto(prodMergeIntoBtn.dataset.prodMergeFrom, prodMergeIntoBtn.dataset.prodMergeInto); return; }
    const prodMergeBtn = event.target.closest("[data-prod-merge]");
    if (prodMergeBtn) { _prodMergeShow(prodMergeBtn.dataset.prodMerge); return; }
    const prodDeleteBtn = event.target.closest("[data-prod-delete]");
    if (prodDeleteBtn) { _prodDelete(prodDeleteBtn.dataset.prodDelete); return; }
    const productionBackButton = event.target.closest("[data-production-back]");
    if (productionBackButton) { if ($("allMissions")) $("allMissions").innerHTML = ""; if ($("missionsGraphContainer")) $("missionsGraphContainer").style.display = ""; renderAllMissions(); return; }
    const openButton = event.target.closest("[data-doc-open]");
    if (openButton) { await openDocument(openButton.dataset.docOpen); return; }
    const downloadButton = event.target.closest("[data-doc-download]");
    if (downloadButton) { await downloadDocument(downloadButton.dataset.docDownload, downloadButton.dataset.docName); return; }
    const docDeleteButton = event.target.closest("[data-doc-delete]");
    if (docDeleteButton) { await deleteDocument(docDeleteButton.dataset.docDelete, docDeleteButton.dataset.docPath); return; }
    const editButton = event.target.closest("[data-edit]");
    if (editButton) { editMission(editButton.dataset.edit); return; }
    const deleteButton = event.target.closest("[data-delete]");
    if (!deleteButton) return;
    await deleteMission(deleteButton.dataset.delete);
  });
 
  window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); deferredInstallPrompt = event; });
 
if ($("installBtn")) $("installBtn").addEventListener("click", async () => {
    if (!deferredInstallPrompt) { toast("Sur iPhone..."); return; }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
  });

  document.addEventListener("click", (e) => {
    const themeBtn = e.target.closest(".theme-swatch, .theme-btn");
    if (themeBtn) {
      const theme = themeBtn.dataset.theme;
      applyTheme(theme);
      localStorage.setItem("intermitrack_theme", theme);
    }
  });
}

 
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("service-worker.js"); });
}
 
// Pop-up "Quoi de neuf" : affiché UNE SEULE FOIS par navigateur (localStorage).
// Ne réapparaît pas après déconnexion/reconnexion (le flag n'est jamais effacé).
function maybeShowWhatsNew() {
  try {
    if (localStorage.getItem('it_whatsnew_v4')) return;
    const ov = $('whatsNewOverlay');
    if (!ov) return;
    localStorage.setItem('it_whatsnew_v4', '1'); // posé dès l'affichage → jamais de réapparition
    ov.classList.remove('hidden');
    const close = () => { ov.classList.add('hidden'); };
    const btn = $('whatsNewBtn'); if (btn) btn.onclick = close;
    ov.onclick = (e) => { if (e.target === ov) close(); };
  } catch (e) {}
}

sb.auth.onAuthStateChange((_event, session) => {
  if (_event === "PASSWORD_RECOVERY") { showResetPasswordModal(); return; } // lien "mot de passe oublié" cliqué
  currentUser = session?.user || null;
  if (currentUser) { showApp(); loadMissions(); loadDocuments(); }
  else showAuth();
});
 
 
setupEvents();
init();


// ===== Profil "Mes informations" =====
var _profil = null;
var _profilPostes = [];
var POSTES_TECH = ['Montage','Tournage','Démontage','Régie','Son','Lumière','Image / Vidéo','Machiniste','Électricien','Poursuiteur','Plateau','Décor','HMC'];
var POSTES_ARTISTE = ['Comédien','Chanteur','Musicien','Danseur','Choriste'];
var POSTES_MUSIQUE = ['Concert','Répétition','Session studio','Atelier / Pédagogique','Tournée','Captation'];

async function loadProfil(){
  if(!currentUser) return;
  try{
    const { data } = await sb.from('profiles').select('annexe,postes,droits_ouverts,taux_journalier,taux_impot,are_date,production_colors,notes,ae_custom_presta,custom_postes,km_cv,km_tranche,km_vehicle,km_annual,km_electric,salaire_journalier,clause_rattrapage').eq('id', currentUser.id).maybeSingle();
    _profil = data || null;
    // Prix appris (prod+poste) : select SÉPARÉ et défensif — la colonne price_memory peut ne pas
    // encore exister (avant migration), il ne doit donc pas casser le chargement du profil.
    try { const _pm = await sb.from('profiles').select('price_memory').eq('id', currentUser.id).maybeSingle(); if (_profil && _pm.data) _profil.price_memory = _pm.data.price_memory || {}; } catch(e){}
    // Barèmes d'heures sup par prod (overtime_memory) : même précaution défensive.
    try { const _om = await sb.from('profiles').select('overtime_memory').eq('id', currentUser.id).maybeSingle(); if (_profil && _om.data) _profil.overtime_memory = _om.data.overtime_memory || {}; } catch(e){}
    // Date ARE : la base de données fait foi (synchro multi-appareils).
    // Sinon, on migre la valeur locale (ancienne) vers la base.
    if (data && data.are_date) {
      areAdmissionDate = data.are_date;
      localStorage.setItem(storageKey("areAdmissionDate"), data.are_date);
      if ($("areAdmissionDate")) $("areAdmissionDate").value = data.are_date;
      if (typeof render === "function") render();
    } else if (areAdmissionDate) {
      try { await sb.from('profiles').upsert({ id: currentUser.id, are_date: areAdmissionDate }, { onConflict:'id' }); } catch(e){}
    }
    // Couleurs : la base fait foi (drapeau "déjà synchronisé" → la réinit tient entre appareils).
    {
      const _flagKey = storageKey("colors_synced");
      const _dbCols = (data && data.production_colors) ? data.production_colors : {};
      const _flag = localStorage.getItem(_flagKey);
      let _finalCols;
      if (Object.keys(_dbCols).length) { _finalCols = _dbCols; }
      else if (!_flag) { const _localCols = getProductionColors(); if (_localCols && Object.keys(_localCols).length) { _finalCols = _localCols; try { await sb.from('profiles').upsert({ id: currentUser.id, production_colors: _localCols }, { onConflict:'id' }); } catch(e){} } else { _finalCols = {}; } }
      else { _finalCols = {}; }
      localStorage.setItem(storageKey("production_colors"), JSON.stringify(_finalCols));
      localStorage.setItem(_flagKey, '1');
    }
    // Notes perso : la base fait foi (drapeau anti-réécriture → suppression/réinit tient entre appareils).
    {
      const _nf = storageKey("notes_synced");
      const _db = (data && Array.isArray(data.notes)) ? data.notes : [];
      const _flag = localStorage.getItem(_nf);
      let _fin;
      if (_db.length) { _fin = _db; }
      else if (!_flag) { const _l = (typeof getNotes==='function') ? getNotes() : []; if (_l && _l.length) { _fin = _l; try { await sb.from('profiles').upsert({ id: currentUser.id, notes: _l }, { onConflict:'id' }); } catch(e){} } else { _fin = []; } }
      else { _fin = []; }
      localStorage.setItem(storageKey("notes"), JSON.stringify(_fin));
      localStorage.setItem(_nf, '1');
    }
    // Prestations perso (auto-entrepreneur) : idem.
    {
      const _pf = storageKey("ae_presta_synced");
      const _db = (data && Array.isArray(data.ae_custom_presta)) ? data.ae_custom_presta : [];
      const _flag = localStorage.getItem(_pf);
      let _fin;
      if (_db.length) { _fin = _db; }
      else if (!_flag) { const _l = (typeof getCustomPresta==='function') ? getCustomPresta() : []; if (_l && _l.length) { _fin = _l; try { await sb.from('profiles').upsert({ id: currentUser.id, ae_custom_presta: _l }, { onConflict:'id' }); } catch(e){} } else { _fin = []; } }
      else { _fin = []; }
      localStorage.setItem(storageKey("ae_custom_presta"), JSON.stringify(_fin));
      localStorage.setItem(_pf, '1');
    }
    // Postes perso (type de mission) : idem.
    {
      const _qf = storageKey("postes_synced");
      const _db = (data && Array.isArray(data.custom_postes)) ? data.custom_postes : [];
      const _flag = localStorage.getItem(_qf);
      let _fin;
      if (_db.length) { _fin = _db; }
      else if (!_flag) { const _l = (typeof getCustomPostes==='function') ? getCustomPostes() : []; if (_l && _l.length) { _fin = _l; try { await sb.from('profiles').upsert({ id: currentUser.id, custom_postes: _l }, { onConflict:'id' }); } catch(e){} } else { _fin = []; } }
      else { _fin = []; }
      localStorage.setItem(storageKey("custom_postes"), JSON.stringify(_fin));
      localStorage.setItem(_qf, '1');
    }
    if (typeof renderCalendar === 'function') renderCalendar();
    if (typeof renderAllMissions === 'function') renderAllMissions();
    if (typeof _syncPrevAnnexe === 'function') _syncPrevAnnexe();
  }catch(e){ _profil = null; }
}

// Prévisions : présélectionne l'annexe (Artiste/Technicien) selon le profil de l'user.
// Les 2 cartes utilisent data-a ; la carte carence (itk-c2) s'en sert pour son CALCUL.
function _syncPrevAnnexe(){
  var a = (typeof _profil !== 'undefined' && _profil && _profil.annexe) || '';
  // "les deux" → technicien par défaut (le calcul carence porte sur une seule annexe, ajustable à la main).
  var want = (a === 'artiste') ? 'artiste' : 'technicien';
  ['itk-c1-annexe','itk-c2-annexe'].forEach(function(id){
    var box = document.getElementById(id); if(!box) return;
    [].forEach.call(box.querySelectorAll('button'), function(b){
      b.classList.toggle('itk-on', b.getAttribute('data-a') === want);
    });
  });
}

function _profilEnsureDom(){
  if(document.getElementById('profilOverlay')) return;
  const st = document.createElement('style');
  st.textContent = "#profilOverlay,#profilIntroOverlay{position:fixed;inset:0;background:rgba(0,0,0,.45);display:none;align-items:center;justify-content:center;z-index:100002;padding:16px;}#profilOverlay.open,#profilIntroOverlay.open{display:flex;}.pf-box{background:var(--card);border:1px solid var(--line);border-radius:20px;max-width:480px;width:100%;max-height:90vh;overflow-y:auto;padding:24px;box-shadow:0 24px 60px rgba(0,0,0,.35);font-family:inherit;}.pf-title{font-size:19px;font-weight:800;color:var(--petrol);margin:0 0 4px;}.pf-sub{font-size:13px;color:var(--muted);margin:0 0 18px;line-height:1.5;}.pf-label{font-size:13px;font-weight:700;color:var(--text);margin:16px 0 8px;}.pf-seg{display:flex;gap:8px;flex-wrap:wrap;}.pf-opt{padding:9px 14px;border:1px solid var(--line);background:var(--card);color:var(--petrol);border-radius:11px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;}.pf-opt.on{background:var(--petrol);color:#fff;border-color:var(--petrol);}.pf-input{width:100%;padding:11px 13px;border:1px solid var(--line);border-radius:11px;font-size:14px;font-family:inherit;box-sizing:border-box;background:var(--card);color:var(--text);}.pf-input::placeholder{color:var(--muted);}.pf-actions{display:flex;gap:10px;margin-top:22px;}.pf-cancel{flex:1;padding:13px;border:1px solid var(--line);background:var(--soft);color:var(--muted);border-radius:12px;font-weight:700;cursor:pointer;font-family:inherit;}.pf-ok{flex:1;padding:13px;border:none;background:var(--petrol);color:#fff;border-radius:12px;font-weight:800;cursor:pointer;font-family:inherit;}.pf-hint{font-size:11px;color:var(--muted);margin-top:6px;}";
  document.head.appendChild(st);

  const ov = document.createElement('div');
  ov.id = 'profilOverlay';
  ov.innerHTML = '<div class="pf-box">'
    + '<div class="pf-title">📝 Mes informations</div>'
    + '<div class="pf-sub">Optionnel — ça pré-remplit tes missions et permet de calculer ton revenu mensuel. Modifiable à tout moment ici.</div>'
    + '<div class="pf-label">Tu es plutôt…</div>'
    + '<div class="pf-seg" id="pfAnnexe"><button type="button" class="pf-opt" data-annexe="technicien">Technicien (annexe 8)</button><button type="button" class="pf-opt" data-annexe="artiste">Artiste (annexe 10)</button><button type="button" class="pf-opt" data-annexe="les_deux">Les deux</button></div>'
    + '<div class="pf-label">As-tu déjà ouvert tes droits ?</div>'
    + '<div class="pf-seg" id="pfDroits"><button type="button" class="pf-opt" data-droits="oui">Oui</button><button type="button" class="pf-opt" data-droits="non">Pas encore</button></div>'
    + '<div id="pfAjWrap" style="display:none;"><div class="pf-label">Ton taux journalier (AJ)</div><input type="number" id="pfAj" class="pf-input" placeholder="Ex : 67.60" min="0" step="0.01"/><div class="pf-hint">L\'allocation journalière nette de ta notification France Travail.</div></div>'
    + '<div class="pf-label">Es-tu en clause de rattrapage ?</div>'
    + '<div class="pf-seg" id="pfClause"><button type="button" class="pf-opt" data-clause="oui">Oui</button><button type="button" class="pf-opt" data-clause="non">Non</button></div>'
    + '<div class="pf-hint" id="pfClauseHint" style="display:none;">Un bandeau apparaîtra sur ton tableau de bord, avec le compte à rebours (6 mois après ta date anniversaire) pour atteindre 507 h.</div>'
    + '<div class="pf-label">Ton salaire journalier brut <span style="font-weight:400;opacity:.65;">— pré-remplit le prix de tes missions</span></div>'
    + '<input type="number" id="pfSalaireJour" class="pf-input" placeholder="Ex : 230" min="0" step="1"/>'
    + '<div class="pf-label">Ton taux d\'imposition (%)</div>'
    + '<input type="number" id="pfImpot" class="pf-input" placeholder="Ex : 8.6" min="0" max="100" step="0.1"/>'
    + '<div class="pf-hint">En %, celui de ta notification / tes paies. Pour estimer ton net après impôt. Optionnel.</div>'
    + '<div class="pf-label">Tes postes <span style="font-weight:400;color:#9AA5B1;">— le 1er = défaut sur tes missions</span></div>'
    + '<div class="pf-seg" id="pfPostes"></div>'
    + '<div style="display:flex;gap:8px;margin-top:8px;"><input type="text" id="pfNewPoste" class="pf-input" placeholder="Ex : Clown, Cascadeur…" style="flex:1;"/><button type="button" class="pf-ok" id="pfAddPoste" style="flex:0 0 auto;padding:11px 16px;">Ajouter</button></div>'
    // Véhicule mémorisé → pré-remplit les frais km de chaque mission (retour JB). Clés identiques au barème appli+site.
    + '<div class="pf-label">Ton véhicule <span style="font-weight:400;opacity:.65;">— pré-remplit tes frais kilométriques</span></div>'
    + '<div class="pf-seg" id="pfKmKind">'
      + KM_VEHICLES.map(function(v){ return '<button type="button" class="pf-opt" data-kmkind="'+v.key+'">'+escapeHtml(v.label)+'</button>'; }).join('')
    + '</div>'
    + '<div class="pf-hint" id="pfKmHint"></div>'
    + '<div class="pf-seg" id="pfKmCv"></div>'
    + '<div class="pf-label">Kilomètres parcourus par an <span style="font-weight:400;opacity:.65;">— tous trajets confondus</span></div>'
    + '<input type="number" id="pfKmAnnual" class="pf-input" placeholder="Ex : 12000" min="0" step="100"/>'
    + '<div class="pf-seg" id="pfKmElec" style="margin-top:8px;"><button type="button" class="pf-opt" data-kmelec="1">100 % électrique <span style="opacity:.7;">(barème +20 %)</span></button></div>'
    + '<div class="pf-hint" id="pfKmApercu" style="display:none;"></div>'
    + '<div class="pf-actions"><button type="button" class="pf-cancel" id="pfCancel">Fermer</button><button type="button" class="pf-ok" id="pfSave">Enregistrer</button></div>'
    + '</div>';
  document.body.appendChild(ov);
  ov.addEventListener('click', function(e){ if(e.target===ov) ov.classList.remove('open'); });

  const intro = document.createElement('div');
  intro.id = 'profilIntroOverlay';
  intro.innerHTML = '<div class="pf-box" style="max-width:420px;">'
    + '<div class="pf-title" style="text-align:center;">Règle ton profil</div>'
    + '<div class="pf-sub" style="text-align:center;">Deux infos pour que tout se pré-remplisse : tes heures, tes prix et tes calculs France Travail.</div>'
    + '<div class="pf-label">Ton statut</div>'
    + '<div class="pf-seg" id="pfIntroStatut"><button type="button" data-istatut="technicien" class="pf-opt">Technicien</button><button type="button" data-istatut="artiste" class="pf-opt">Artiste</button><button type="button" data-istatut="les_deux" class="pf-opt">Les deux</button></div>'
    + '<div class="pf-hint">Technicien : journée = 8 h · Artiste : cachet = 12 h. C\'est ce choix qui fait qu\'un import d\'artiste met 12 h quand les heures manquent.</div>'
    + '<div class="pf-label">Salaire journalier brut <span style="font-weight:600;color:#9AA5B1;">(facultatif)</span></div>'
    + '<input id="pfIntroSalaire" class="pf-input" type="number" inputmode="decimal" placeholder="ex : 230" />'
    + '<div class="pf-hint">Pré-remplit le prix de tes missions et de tes imports. Modifiable à tout moment.</div>'
    + '<div class="pf-actions"><button type="button" class="pf-cancel" id="pfIntroLater">Plus tard</button><button type="button" class="pf-ok" id="pfIntroSave">Enregistrer</button></div>'
    + '<div class="pf-hint" style="text-align:center;margin-top:10px;">Réglable à tout moment depuis ton espace, en haut à droite.</div>'
    + '</div>';
  document.body.appendChild(intro);

  ov.querySelector('#pfAnnexe').addEventListener('click', function(e){ var b=e.target.closest('[data-annexe]'); if(!b)return; ov.querySelectorAll('#pfAnnexe .pf-opt').forEach(function(x){x.classList.remove('on');}); b.classList.add('on'); _profilRenderPostes(b.dataset.annexe); });
  // Véhicule mémorisé. Le type pilote la liste des puissances : un cyclomoteur n'en a pas, et les
  // catégories moto ne sont pas celles des voitures.
  ov.querySelector('#pfKmKind').addEventListener('click', function(e){
    var b=e.target.closest('[data-kmkind]'); if(!b)return;
    ov.querySelectorAll('#pfKmKind .pf-opt').forEach(function(x){x.classList.remove('on');}); b.classList.add('on');
    _pfRenderKmCv(b.dataset.kmkind, ''); _pfKmApercu();
  });
  ov.querySelector('#pfKmCv').addEventListener('click', function(e){
    var b=e.target.closest('[data-kmcv]'); if(!b)return;
    var was=b.classList.contains('on');
    ov.querySelectorAll('#pfKmCv .pf-opt').forEach(function(x){x.classList.remove('on');});
    if(!was) b.classList.add('on'); // 2e clic = désélection : on peut ne pas vouloir de barème
    _pfKmApercu();
  });
  ov.querySelector('#pfKmElec').addEventListener('click', function(e){
    var b=e.target.closest('[data-kmelec]'); if(!b)return; b.classList.toggle('on'); _pfKmApercu();
  });
  ov.querySelector('#pfKmAnnual').addEventListener('input', _pfKmApercu);
  ov.querySelector('#pfDroits').addEventListener('click', function(e){ var b=e.target.closest('[data-droits]'); if(!b)return; ov.querySelectorAll('#pfDroits .pf-opt').forEach(function(x){x.classList.remove('on');}); b.classList.add('on'); document.getElementById('pfAjWrap').style.display = b.dataset.droits==='oui'?'block':'none'; });
  ov.querySelector('#pfClause').addEventListener('click', function(e){ var b=e.target.closest('[data-clause]'); if(!b)return; ov.querySelectorAll('#pfClause .pf-opt').forEach(function(x){x.classList.remove('on');}); b.classList.add('on'); var h=document.getElementById('pfClauseHint'); if(h) h.style.display = b.dataset.clause==='oui'?'block':'none'; });
  document.getElementById('pfCancel').addEventListener('click', function(){ ov.classList.remove('open'); });
  document.getElementById('pfSave').addEventListener('click', _profilSave);
  ov.querySelector('#pfPostes').addEventListener('click', function(e){ var d=e.target.closest && e.target.closest('[data-delposte]'); if(d){ e.stopPropagation(); removeCustomPoste(d.dataset.delposte); _profilRenderPostes(); } });
  document.getElementById('pfAddPoste').addEventListener('click', _profilAddPoste);
  document.getElementById('pfNewPoste').addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); _profilAddPoste(); } });
  intro.querySelector('#pfIntroStatut').addEventListener('click', function(e){ var b=e.target.closest('[data-istatut]'); if(!b)return; intro.querySelectorAll('#pfIntroStatut .pf-opt').forEach(function(x){x.classList.remove('on');}); b.classList.add('on'); });
  document.getElementById('pfIntroLater').addEventListener('click', function(){ try{ localStorage.setItem('intermitrack_profilsetup_day', _todayStr()); }catch(e){} intro.classList.remove('open'); });
  document.getElementById('pfIntroSave').addEventListener('click', async function(){
    var b = intro.querySelector('#pfIntroStatut .pf-opt.on'); if(!b) return; // il faut choisir un statut
    var statut = b.dataset.istatut;
    var sal = Number((document.getElementById('pfIntroSalaire')||{}).value) || null;
    if(currentUser){ var upd={ id: currentUser.id, annexe: statut }; if(sal>0) upd.salaire_journalier=sal; try{ await sb.from('profiles').upsert(upd, { onConflict:'id' }); }catch(e){} }
    if(!_profil) _profil={}; _profil.annexe=statut; if(sal>0) _profil.salaire_journalier=sal;
    try{ localStorage.setItem('intermitrack_profilsetup_day', _todayStr()); }catch(e){}
    if (typeof _syncPrevAnnexe === 'function') _syncPrevAnnexe();
    intro.classList.remove('open');
    if(typeof render==='function') render();
    if(typeof toast==='function') toast('Profil enregistré ✅');
  });
}

function _profilRenderPostes(){
  var wrap = document.getElementById('pfPostes'); if(!wrap) return;
  var customs = getCustomPostes();
  wrap.innerHTML = customs.length
    ? customs.map(function(p){ return '<span class="pf-opt on" style="display:inline-flex;align-items:center;gap:6px;">'+escapeHtml(p)+'<span data-delposte="'+escapeHtml(p)+'" style="cursor:pointer;display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;border-radius:50%;background:rgba(255,255,255,.28);font-size:13px;line-height:1;">×</span></span>'; }).join('')
    : '<span style="font-size:12px;color:#9AA5B1;">Aucun poste pour l\'instant — ajoute le tien ci-dessous.</span>';
}
function _profilAddPoste(){ var inp=document.getElementById('pfNewPoste'); var v=(inp&&inp.value||'').trim(); if(v){ addCustomPoste(v); if(inp) inp.value=''; _profilRenderPostes(); } }

function openProfilModal(){
  _profilEnsureDom();
  var ov = document.getElementById('profilOverlay');
  var annexe = (_profil && _profil.annexe) || '';
  _profilPostes = getCustomPostes();
  ov.querySelectorAll('#pfAnnexe .pf-opt').forEach(function(x){ x.classList.toggle('on', x.dataset.annexe===annexe); });
  _profilRenderPostes();
  ov.querySelectorAll('#pfDroits .pf-opt').forEach(function(x){ x.classList.remove('on'); });
  var dr = _profil ? _profil.droits_ouverts : null;
  if(dr===true){ ov.querySelector('[data-droits="oui"]').classList.add('on'); document.getElementById('pfAjWrap').style.display='block'; }
  else if(dr===false){ ov.querySelector('[data-droits="non"]').classList.add('on'); document.getElementById('pfAjWrap').style.display='none'; }
  ov.querySelectorAll('#pfClause .pf-opt').forEach(function(x){ x.classList.remove('on'); });
  var _cl = _profil ? _profil.clause_rattrapage : null;
  if(_cl===true){ ov.querySelector('[data-clause="oui"]').classList.add('on'); if(document.getElementById('pfClauseHint')) document.getElementById('pfClauseHint').style.display='block'; }
  else { ov.querySelector('[data-clause="non"]').classList.add('on'); if(document.getElementById('pfClauseHint')) document.getElementById('pfClauseHint').style.display='none'; }
  document.getElementById('pfAj').value = (_profil && _profil.taux_journalier!=null) ? _profil.taux_journalier : '';
  if(document.getElementById('pfSalaireJour')) document.getElementById('pfSalaireJour').value = (_profil && _profil.salaire_journalier!=null) ? _profil.salaire_journalier : '';
  document.getElementById('pfImpot').value = (_profil && _profil.taux_impot!=null) ? _profil.taux_impot : '';
  // Véhicule mémorisé (retour JB). Nouveau format si présent, sinon migration de l'ancien.
  var _v = kmProfilTaux();
  ov.querySelectorAll('#pfKmKind .pf-opt').forEach(function(x){ x.classList.toggle('on', x.dataset.kmkind===_v.kind); });
  _pfRenderKmCv(_v.kind, _v.cv);
  document.getElementById('pfKmAnnual').value = _v.kmAnnuel || '';
  ov.querySelectorAll('#pfKmElec .pf-opt').forEach(function(x){ x.classList.toggle('on', _v.electrique); });
  _pfKmApercu();
  ov.classList.add('open');
}

async function _profilSave(){
  if(!currentUser) return;
  var ov = document.getElementById('profilOverlay');
  var aBtn = ov.querySelector('#pfAnnexe .pf-opt.on');
  var dBtn = ov.querySelector('#pfDroits .pf-opt.on');
  var droits = dBtn ? (dBtn.dataset.droits==='oui') : null;
  var clBtn = ov.querySelector('#pfClause .pf-opt.on');
  var kindBtn = ov.querySelector('#pfKmKind .pf-opt.on');
  var cvBtn = ov.querySelector('#pfKmCv .pf-opt.on');
  var p = {
    annexe: aBtn ? aBtn.dataset.annexe : null,
    postes: getCustomPostes(),
    droits_ouverts: droits,
    taux_journalier: droits===true ? (Number(document.getElementById('pfAj').value)||null) : null,
    taux_impot: Number(document.getElementById('pfImpot').value)||null,
    clause_rattrapage: clBtn ? (clBtn.dataset.clause==='oui') : false,
    km_vehicle: kindBtn ? kindBtn.dataset.kmkind : null,
    km_cv: cvBtn ? cvBtn.dataset.kmcv : null,
    km_annual: Number(document.getElementById('pfKmAnnual').value) || null,
    km_electric: !!ov.querySelector('#pfKmElec .pf-opt.on'),
    salaire_journalier: Number((document.getElementById('pfSalaireJour')||{}).value) || null
  };
  var res = await sb.from('profiles').upsert(Object.assign({ id: currentUser.id }, p), { onConflict:'id' });
  if(res.error){ if(typeof toast==='function') toast('Erreur : '+res.error.message); return; }
  _profil = p;
  if (typeof _syncPrevAnnexe === 'function') _syncPrevAnnexe(); // Prévisions suivent l'annexe choisie tout de suite
  ov.classList.remove('open');
  if(typeof toast==='function') toast('Infos enregistrées ✅');
  if(typeof render==='function') render(); // re-render le dashboard → l'estimation France Travail s'adapte tout de suite (annexe artiste/technicien)
}

function _todayStr(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
// Réglage du profil : s'affiche tant que l'annexe (statut) n'est pas choisie, 1×/jour au maximum.
// Détection « pas réglé » = annexe vide en base. Dès que le statut est enregistré : ne réapparaît plus jamais.
function _profilShowIntroIfNeeded(){
  if(_profil && _profil.annexe) return;                                                                 // déjà réglé -> jamais
  try{ if(localStorage.getItem('intermitrack_profilsetup_day') === _todayStr()) return; }catch(e){}     // déjà montré aujourd'hui
  _profilEnsureDom();
  setTimeout(function(){
    var i=document.getElementById('profilIntroOverlay'); if(!i) return;
    i.querySelectorAll('#pfIntroStatut .pf-opt').forEach(function(x){x.classList.remove('on');});
    var s=document.getElementById('pfIntroSalaire'); if(s) s.value=(_profil && _profil.salaire_journalier!=null)? _profil.salaire_journalier : '';
    i.classList.add('open');
  }, 900);
}

// Taux horaire / jour selon l'annexe du profil (8h technicien, 12h artiste)
function _jourH(){ return (_profil && _profil.annexe === 'artiste') ? 12 : 8; }
function initProfilFeature(){
  _profilEnsureDom();
  loadProfil().then(function(){ _profilShowIntroIfNeeded(); });
  var btn = document.getElementById('profileBtn');
  if(btn && !btn.dataset.init){
    btn.dataset.init='1';
    btn.addEventListener('click', function(){ var dd=document.getElementById('accountDropdown'); if(dd) dd.classList.add('hidden'); openProfilModal(); });
  }
  ['date','endDate'].forEach(function(idd){ var el=document.getElementById(idd); if(el && !el.dataset.mdptrig){ el.dataset.mdptrig='1'; el.addEventListener('change', _maybeOpenMdp); } });
}
// ===== Sélecteur de type de mission (pop-up à boutons, comme les jours) =====
// ===== Pop-up de choix d'adresse (frais kilométriques) =====
// Les adresses déjà saisies sont proposées, de la plus utilisée à la moins utilisée : le domicile
// remonte donc tout seul en tête pour le départ, sans rien demander à l'utilisateur.
// Retours JB et second utilisateur : « la tâche est surtout redondante pour le lieu de départ,
// qui est généralement le domicile de l'intermittent ».
// Identique à AddressPickerModal (appli) : ne pas diverger.
// UNE SEULE réserve d'adresses, partagée par le départ ET l'arrivée.
// Retour Yohan : « il faudrait que j'aie le choix de toutes les adresses que j'ai entrées ».
// Séparer les deux listes n'avait aucun sens pratique : une adresse d'arrivée d'hier est souvent le
// départ de demain, et surtout la liste des départs était vide au démarrage (aucune adresse n'avait
// jamais été stockée) alors que celle des arrivées héritait des LIEUX de mission — d'où un décalage
// incompréhensible entre les deux champs.
// Le tri par fréquence suffit à faire remonter le domicile en tête au départ : il apparaît dans
// toutes les missions, donc il est le plus fréquent. Rien à déclarer.
function _knownAddrs(){
  var counts = {}, coords = {};
  var add = function(label, lng, lat){
    label = String(label || '').trim();
    if(!label) return;
    counts[label] = (counts[label] || 0) + 1;
    if(coords[label] == null && lng != null && lat != null) coords[label] = [Number(lng), Number(lat)];
  };
  var list = (typeof missions !== 'undefined' ? missions : []);
  list.forEach(function(m){ add(m.kmFrom, m.kmFromLng, m.kmFromLat); });
  list.forEach(function(m){ add(m.kmTo, m.kmToLng, m.kmToLat); });
  // On ne propose QUE des adresses réellement géolocalisées : une entrée sans coordonnées est
  // inutilisable pour le calcul de distance (il faudrait la re-géocoder, et ça échoue sur un nom
  // inventé). C'est pourquoi les « lieux » de mission (« Studio 130 »…) ne sont PAS ajoutés ici :
  // ce sont des noms libres, pas des adresses — ils polluaient la liste. Retour Yohan.
  return Object.keys(counts).sort(function(a,b){ return counts[b] - counts[a]; })
    .map(function(label){ return { label: label, coords: coords[label] || null }; })
    .filter(function(a){ return a.coords != null; });
}
// Le formulaire ne porte plus ni puissance ni tranche : le taux vient de kmProfilTaux(). On se
// contente donc de rafraîchir l'aperçu, qui affiche le taux retenu et son origine.
function _applyKmProfil(){ if (typeof updateKmPreview === 'function') updateKmPreview(); }

// Puissances proposées selon le type de véhicule (le cyclomoteur n'en a pas).
function _pfRenderKmCv(kind, current){
  var box = document.getElementById('pfKmCv'); if(!box) return;
  var hint = document.getElementById('pfKmHint');
  var meta = KM_VEHICLES.find(function(v){ return v.key === kind; });
  if(hint) hint.textContent = (meta && meta.hint) || '';
  if(kind === 'cyclo'){ box.innerHTML = ''; box.style.display = 'none'; return; }
  box.style.display = 'flex';
  var list = kind === 'moto' ? KM_MOTO_CV : KM_CAR_CV;
  box.innerHTML = list.map(function(o){
    return '<button type="button" class="pf-opt' + (o.key === current ? ' on' : '') + '" data-kmcv="' + o.key + '">' + escapeHtml(o.label) + '</button>';
  }).join('');
}
// Aperçu chiffré : rend le barème concret, et laisse voir tout de suite si un réglage est faux.
function _pfKmApercu(){
  var out = document.getElementById('pfKmApercu'); if(!out) return;
  var ov = document.getElementById('profilOverlay'); if(!ov) return;
  var kindBtn = ov.querySelector('#pfKmKind .pf-opt.on');
  var kind = kindBtn ? kindBtn.dataset.kmkind : 'car';
  var cvBtn = ov.querySelector('#pfKmCv .pf-opt.on');
  var cv = cvBtn ? cvBtn.dataset.kmcv : '';
  var km = Number((document.getElementById('pfKmAnnual') || {}).value) || 0;
  var elec = !!ov.querySelector('#pfKmElec .pf-opt.on');
  if((!cv && kind !== 'cyclo') || km <= 0){ out.style.display = 'none'; return; }
  var frais = kmFraisAnnuels(kind, cv, km, elec);
  if(frais <= 0){ out.style.display = 'none'; return; }
  out.style.display = 'block';
  out.innerHTML = 'Barème : <strong>' + Math.round(frais).toLocaleString('fr-FR') + ' €</strong> pour ' + km.toLocaleString('fr-FR')
    + ' km, soit <strong>' + (frais / km).toFixed(3).replace('.', ',') + ' €/km</strong> appliqués à tes missions.';
}
function _syncAddrBtn(which){
  var i = document.getElementById(which === 'from' ? 'kmFrom' : 'kmTo');
  var l = document.getElementById(which === 'from' ? 'kmFromBtnLabel' : 'kmToBtnLabel');
  if(i && l){ l.textContent = i.value || 'Choisir ou saisir…'; l.style.opacity = i.value ? '1' : '.45'; }
}
function _setAddrValue(which, label, lng, lat){
  var i = document.getElementById(which === 'from' ? 'kmFrom' : 'kmTo'); if(!i) return;
  i.value = label || '';
  i.dataset.lon = (lng != null ? lng : '');
  i.dataset.lat = (lat != null ? lat : '');
  _syncAddrBtn(which);
  if(typeof updateKmPreview === 'function') updateKmPreview();
}
var _addrPickerWhich = 'from';
function _renderAddrPicker(ov){
  var si = document.getElementById('addrSearchInput');
  var q = (si && si.value) || '';
  var query = q.trim().toLowerCase();
  var all = _knownAddrs();
  var list = query ? all.filter(function(a){ return a.label.toLowerCase().indexOf(query) >= 0; }) : all;
  var cur = (document.getElementById(_addrPickerWhich === 'from' ? 'kmFrom' : 'kmTo') || {}).value || '';
  var html = '<div class="pf-box"><div class="pf-title">' + (_addrPickerWhich === 'from' ? 'Lieu de départ' : "Lieu d'arrivée") + '</div>';
  // Le champ de recherche sert AUSSI à saisir une nouvelle adresse : attachAddressAutocomplete()
  // y branche les suggestions de l'API Adresse et dépose les coordonnées dans dataset.lon/lat.
  html += '<div class="pf-addrow" style="position:relative;"><input type="text" id="addrSearchInput" placeholder="Saisir une nouvelle adresse…" autocomplete="off" value="' + escapeHtml(q) + '"></div>';
  // Le bouton est TOUJOURS présent, simplement masqué tant que le champ est vide : on ne re-rend pas
  // le pop-up à chaque frappe (ça détruirait la liste de suggestions de l'API Adresse), donc s'il
  // n'était pas créé ici il n'existerait jamais — et taper une adresse ne produisait aucun effet.
  html += '<button type="button" class="pf-create" id="addrUseBtn" style="' + (q.trim() ? '' : 'display:none;') + '">Ajouter « <span id="addrUseTxt">' + escapeHtml(q.trim()) + '</span> »</button>';
  // Sans coordonnées, l'adresse ne sera ni mémorisée (la liste ne garde que les vraies adresses) ni
  // utilisable pour la distance. Le dire évite qu'on se demande pourquoi elle ne revient jamais.
  html += '<div id="addrNoGeo" style="display:none;font-size:12px;color:var(--orange,#F97316);font-weight:600;line-height:1.4;margin-top:7px;">Choisis plutôt une suggestion ci-dessus : sans elle, la distance ne pourra pas être calculée et l\'adresse ne sera pas mémorisée pour tes prochaines missions.</div>';
  if(list.length){
    html += '<div class="pf-label">' + (query ? 'Correspondances' : 'Tes adresses · de la plus utilisée à la moins utilisée') + '</div>';
    html += '<div class="pf-prodlist">' + list.map(function(a){
      return '<button type="button" class="pf-opt' + (a.label === cur ? ' on' : '') + '" data-addr="' + escapeHtml(a.label) + '"'
        + (a.coords ? ' data-lng="' + a.coords[0] + '" data-lat="' + a.coords[1] + '"' : '') + '>' + escapeHtml(a.label) + '</button>';
    }).join('') + '</div>';
  } else if(!q.trim()){
    html += '<div class="pf-label" style="text-align:center;line-height:1.5;">Aucune adresse enregistrée pour l\'instant. Tape la tienne ci-dessus et choisis-la dans les suggestions : elle te sera proposée automatiquement les prochaines fois.</div>';
  }
  html += '<div class="pf-actions"><button type="button" class="pf-cancel" id="addrPickClose">Fermer</button></div></div>';
  ov.innerHTML = html;
  var ni = document.getElementById('addrSearchInput');
  if(ni && typeof attachAddressAutocomplete === 'function') attachAddressAutocomplete(ni);
}
// Filtre la liste connue et met à jour le bouton « Ajouter » en direct. C'est le seul retour visuel
// qui confirme à l'utilisateur que sa saisie est prise en compte : sans lui, taper une adresse ne
// produisait rien à l'écran.
function _refreshAddrPickerUI(ov, value){
  var raw = String(value || '').trim();
  var q = raw.toLowerCase();
  [].forEach.call(ov.querySelectorAll('[data-addr]'), function(el){
    el.style.display = (!q || el.dataset.addr.toLowerCase().indexOf(q) >= 0) ? '' : 'none';
  });
  var ub = document.getElementById('addrUseBtn');
  var ut = document.getElementById('addrUseTxt');
  if(ut) ut.textContent = raw;
  if(ub) ub.style.display = raw ? '' : 'none';
  // Avertissement tant qu'aucune suggestion de la carte n'a été choisie (pas de coordonnées).
  var si = document.getElementById('addrSearchInput');
  var geo = si && si.dataset.lon && si.dataset.lat;
  var ng = document.getElementById('addrNoGeo');
  if(ng) ng.style.display = (raw && !geo) ? 'block' : 'none';
}
function _openAddrPicker(which){
  _addrPickerWhich = which;
  _profilEnsureDom(); // garantit les styles .pf-*
  var ov = document.getElementById('addrPickerOverlay');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'addrPickerOverlay';
    // Ancré en haut : sur mobile le clavier ne redimensionne pas une page en position:fixed,
    // une fenêtre centrée aurait son bas (la liste) recouvert dès qu'on tape.
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:none;align-items:flex-start;justify-content:center;z-index:100003;padding:6vh 16px 16px;overflow-y:auto;';
    document.body.appendChild(ov);
    ov.addEventListener('click', function(e){
      if(e.target===ov || e.target.id==='addrPickClose'){ ov.style.display='none'; return; }
      if(e.target.id==='addrUseBtn'){
        var si=document.getElementById('addrSearchInput');
        var v=(si.value||'').trim();
        if(v){
          _setAddrValue(_addrPickerWhich, v, si.dataset.lon||null, si.dataset.lat||null);
          ov.style.display='none';
          // Confirmation explicite : sans elle, on ne savait pas si la saisie avait été prise en compte.
          if(typeof toast==='function') toast((_addrPickerWhich==='from'?'Départ':'Arrivée')+' : '+v, 'success');
        }
        return;
      }
      var b = e.target.closest && e.target.closest('[data-addr]');
      if(b){
        _setAddrValue(_addrPickerWhich, b.dataset.addr, b.dataset.lng||null, b.dataset.lat||null);
        ov.style.display='none';
        if(typeof toast==='function') toast((_addrPickerWhich==='from'?'Départ':'Arrivée')+' : '+b.dataset.addr, 'success');
      }
    });
    // Rafraîchit le bouton « Ajouter » + le filtre, que l'adresse vienne de la frappe ou d'un clic
    // sur une suggestion de l'API Adresse (qui, lui, n'émet pas d'événement "input").
    ov.addEventListener('address-picked', function(e){
      if(e.target.id==='addrSearchInput') _refreshAddrPickerUI(ov, e.target.value||'');
    });
    ov.addEventListener('input', function(e){
      // On ne re-rend PAS à chaque frappe ici : attachAddressAutocomplete affiche sa propre liste
      // de suggestions sous le champ, et un re-rendu la détruirait. On filtre juste la liste connue.
      if(e.target.id==='addrSearchInput') _refreshAddrPickerUI(ov, e.target.value||'');
    });
  }
  _renderAddrPicker(ov);
  ov.style.display='flex';
  var si=document.getElementById('addrSearchInput'); if(si) si.focus();
}
(function(){
  function wireAddr(){
    [['from','kmFromBtn'],['to','kmToBtn']].forEach(function(p){
      var b=document.getElementById(p[1]);
      if(b && !b.dataset.init){ b.dataset.init='1'; b.addEventListener('click', function(){ _openAddrPicker(p[0]); }); _syncAddrBtn(p[0]); }
    });
  }
  if (document.readyState !== "loading") wireAddr(); else document.addEventListener("DOMContentLoaded", wireAddr);
})();

// ===== Pop-up de choix de la production / employeur =====
// Un appui sur le bouton ouvre la liste de TOUTES les productions déjà saisies, de la plus utilisée à
// la moins utilisée : on choisit directement, ou on en crée une nouvelle. Avant, il fallait taper une
// lettre pour voir quoi que ce soit. Retour Damien. Même comportement que ProductionPickerModal (appli).
function _knownProds(){
  var counts = {};
  (typeof missions !== 'undefined' ? missions : []).forEach(function(m){
    var p = String(m.production || '').toUpperCase().trim();
    if (p) counts[p] = (counts[p] || 0) + 1;
  });
  return Object.keys(counts).sort(function(a,b){ return counts[b] - counts[a]; });
}
function _syncProdBtn(){
  var l = document.getElementById('prodBtnLabel');
  var i = document.getElementById('production');
  if (l && i) { l.textContent = i.value || 'Choisir ou créer…'; l.style.opacity = i.value ? '1' : '.45'; }
}
function _setProdValue(v){
  var i = document.getElementById('production'); if(!i) return;
  i.value = v || '';
  if (typeof syncProdColorPicker === 'function') syncProdColorPicker();
  _syncProdBtn();
  if (typeof _prefillLearnedPrice === 'function') _prefillLearnedPrice();
  if (typeof _missionOvertimeVisibility === 'function') _missionOvertimeVisibility();
}
function _renderProdPicker(ov){
  var q = (document.getElementById('prodSearchInput') || {}).value || '';
  var query = q.trim().toUpperCase();
  var all = _knownProds();
  var list = query ? all.filter(function(p){ return p.indexOf(query) >= 0; }) : all;
  var canCreate = !!query && all.indexOf(query) < 0;
  var cur = (document.getElementById('production') || {}).value || '';
  var html = '<div class="pf-box"><div class="pf-title">Production / employeur</div>';
  html += '<div class="pf-addrow"><input type="text" id="prodSearchInput" placeholder="Chercher ou créer…" autocomplete="off" value="'+escapeHtml(q)+'"></div>';
  if (canCreate) html += '<button type="button" class="pf-create" id="prodCreateBtn">+ Créer « '+escapeHtml(query)+' »</button>';
  if (list.length) {
    html += '<div class="pf-label">' + (query ? 'Correspondances' : 'Tes productions · de la plus utilisée à la moins utilisée') + '</div>';
    html += '<div class="pf-prodlist">' + list.map(function(p){
      return '<button type="button" class="pf-opt'+(p===cur?' on':'')+'" data-prod="'+escapeHtml(p)+'">'+escapeHtml(p)+'</button>';
    }).join('') + '</div>';
  } else if (!canCreate) {
    html += '<div class="pf-label" style="text-align:center;">Aucune production enregistrée. Tape un nom pour la créer.</div>';
  }
  html += '<div class="pf-actions"><button type="button" class="pf-cancel" id="prodPickClose">Fermer</button></div></div>';
  ov.innerHTML = html;
}
function _openProdPicker(){
  _profilEnsureDom(); // garantit les styles .pf-*
  var ov = document.getElementById('prodPickerOverlay');
  if(!ov){
    var st = document.createElement('style');
    st.textContent = ".pf-prodlist{display:flex;flex-direction:column;gap:6px;max-height:38vh;overflow-y:auto;}.pf-prodlist .pf-opt{text-align:left;}.pf-create{width:100%;margin-top:8px;padding:11px;border:none;border-radius:10px;background:var(--petrol);color:#fff;font-weight:800;font-size:14px;cursor:pointer;font-family:inherit;}";
    document.head.appendChild(st);
    ov = document.createElement('div');
    ov.id = 'prodPickerOverlay';
    // Ancré EN HAUT et non centré : sur mobile, le clavier ne redimensionne pas la page (position:fixed),
    // une fenêtre centrée verrait donc son bas — dont la liste — recouvert dès qu'on tape un nom.
    // En haut, le champ de saisie et les premières productions restent toujours visibles.
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:none;align-items:flex-start;justify-content:center;z-index:100003;padding:6vh 16px 16px;overflow-y:auto;';
    document.body.appendChild(ov);
    ov.addEventListener('click', function(e){
      if(e.target===ov || e.target.id==='prodPickClose'){ ov.style.display='none'; return; }
      if(e.target.id==='prodCreateBtn'){
        var v=(document.getElementById('prodSearchInput').value||'').trim().toUpperCase();
        if(v){ _setProdValue(v); ov.style.display='none'; }
        return;
      }
      var b = e.target.closest && e.target.closest('[data-prod]');
      if(b){ _setProdValue(b.dataset.prod); ov.style.display='none'; }
    });
    // Filtrage au fil de la frappe. On re-rend, mais on RESTAURE la position réelle du curseur
    // (avant : forcé en fin de champ → éditer au milieu d'un mot renvoyait la lettre à la fin — bug Camille).
    ov.addEventListener('input', function(e){
      if(e.target.id==='prodSearchInput'){
        var pos=e.target.selectionStart;
        _renderProdPicker(ov);
        var i=document.getElementById('prodSearchInput');
        if(i){ i.focus(); try{ i.setSelectionRange(pos, pos); }catch(_){} }
      }
    });
    ov.addEventListener('keydown', function(e){
      if(e.key==='Enter' && e.target.id==='prodSearchInput'){
        e.preventDefault();
        var v=(e.target.value||'').trim().toUpperCase();
        if(v){ _setProdValue(v); ov.style.display='none'; }
      }
    });
  }
  _renderProdPicker(ov);
  ov.style.display='flex';
  var si=document.getElementById('prodSearchInput'); if(si) si.focus();
}
// ===== Pop-up générique émission / lieu : même expérience que la production (retour JB) =====
// Émission et lieu avaient un simple <datalist> vide (aucune suggestion). Ici, le même pop-up que
// la production : liste des valeurs déjà saisies (plus utilisées d'abord) + création à la volée.
function _knownField(field){
  var c = {};
  (typeof missions !== 'undefined' ? missions : []).forEach(function(m){
    var v = String(m[field] || '').trim();
    if (v){ var k = v.toLowerCase(); if(!c[k]) c[k] = { n:0, label:v }; c[k].n++; }
  });
  return Object.keys(c).map(function(k){ return c[k]; }).sort(function(a,b){ return b.n - a.n; }).map(function(x){ return x.label; });
}
function _syncFieldBtn(inputId, labelId){
  var l = document.getElementById(labelId), i = document.getElementById(inputId);
  if (l && i){ l.textContent = i.value || 'Choisir ou créer…'; l.style.opacity = i.value ? '1' : '.45'; }
}
function _setFieldValue(inputId, labelId, v, upper){
  var i = document.getElementById(inputId); if(!i) return;
  i.value = upper ? String(v || '').toUpperCase() : (v || '');
  _syncFieldBtn(inputId, labelId);
}
function _renderFieldPicker(ov){
  var cfg = ov._cfg;
  var q = (document.getElementById('fieldSearchInput') || {}).value || '';
  var query = q.trim();
  var all = _knownField(cfg.field);
  var list = query ? all.filter(function(p){ return p.toUpperCase().indexOf(query.toUpperCase()) >= 0; }) : all;
  var canCreate = !!query && !all.some(function(p){ return p.toUpperCase() === query.toUpperCase(); });
  var cur = (document.getElementById(cfg.inputId) || {}).value || '';
  var html = '<div class="pf-box"><div class="pf-title">' + escapeHtml(cfg.label) + '</div>';
  html += '<div class="pf-addrow"><input type="text" id="fieldSearchInput" placeholder="Chercher ou créer…" autocomplete="off" value="' + escapeHtml(q) + '"></div>';
  if (canCreate) html += '<button type="button" class="pf-create" id="fieldCreateBtn">+ Ajouter « ' + escapeHtml(query) + ' »</button>';
  if (list.length){
    html += '<div class="pf-label">' + (query ? 'Correspondances' : 'Tes ' + cfg.plural + ' · de la plus utilisée à la moins utilisée') + '</div>';
    html += '<div class="pf-prodlist">' + list.map(function(p){
      return '<button type="button" class="pf-opt' + (p === cur ? ' on' : '') + '" data-field="' + escapeHtml(p) + '">' + escapeHtml(p) + '</button>';
    }).join('') + '</div>';
  } else if (!canCreate){
    html += '<div class="pf-label" style="text-align:center;">Rien d\'enregistré. Tape un nom pour l\'ajouter.</div>';
  }
  html += '<div class="pf-actions"><button type="button" class="pf-cancel" id="fieldPickClose">Fermer</button></div></div>';
  ov.innerHTML = html;
}
function _openFieldPicker(cfg){
  _profilEnsureDom(); // styles .pf-*
  var ov = document.getElementById('fieldPickerOverlay');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'fieldPickerOverlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:none;align-items:flex-start;justify-content:center;z-index:100003;padding:6vh 16px 16px;overflow-y:auto;';
    document.body.appendChild(ov);
    ov.addEventListener('click', function(e){
      var c = ov._cfg || {};
      if(e.target === ov || e.target.id === 'fieldPickClose'){ ov.style.display='none'; return; }
      if(e.target.id === 'fieldCreateBtn'){
        var v = (document.getElementById('fieldSearchInput').value || '').trim();
        if(v){ _setFieldValue(c.inputId, c.labelId, v, c.upper); ov.style.display='none'; }
        return;
      }
      var b = e.target.closest && e.target.closest('[data-field]');
      if(b){ _setFieldValue(c.inputId, c.labelId, b.dataset.field, c.upper); ov.style.display='none'; }
    });
    ov.addEventListener('input', function(e){
      if(e.target.id === 'fieldSearchInput'){
        var pos = e.target.selectionStart;
        _renderFieldPicker(ov);
        var i = document.getElementById('fieldSearchInput');
        if(i){ i.focus(); try{ i.setSelectionRange(pos, pos); }catch(_){} }
      }
    });
  }
  ov._cfg = cfg;
  _renderFieldPicker(ov);
  ov.style.display = 'flex';
  setTimeout(function(){ var s = document.getElementById('fieldSearchInput'); if(s) s.focus(); }, 50);
}
(function(){
  function wirePickers(){
    var pb=document.getElementById('prodBtn');
    if(pb && !pb.dataset.init){ pb.dataset.init='1'; pb.addEventListener('click', _openProdPicker); _syncProdBtn(); }
    var eb=document.getElementById('emBtn');
    if(eb && !eb.dataset.init){ eb.dataset.init='1'; eb.addEventListener('click', function(){ _openFieldPicker({field:'emission', inputId:'emission', labelId:'emBtnLabel', label:'Émission', plural:'émissions', upper:false}); }); _syncFieldBtn('emission','emBtnLabel'); }
    var lb=document.getElementById('lieuBtn');
    if(lb && !lb.dataset.init){ lb.dataset.init='1'; lb.addEventListener('click', function(){ _openFieldPicker({field:'lieu', inputId:'lieu', labelId:'lieuBtnLabel', label:'Lieu', plural:'lieux', upper:false}); }); _syncFieldBtn('lieu','lieuBtnLabel'); }
  }
  if (document.readyState !== "loading") wirePickers(); else document.addEventListener("DOMContentLoaded", wirePickers);
})();

// ===== Plusieurs types sur une même mission (« Rec + MIX ») =====
// Un même contrat, un même jour, peut porter 2 activités (retour Damien, ingé son doublage).
// Les types sont joints par « + » dans missions.mission_type : aucune modif de base, le type n'est
// jamais utilisé pour regrouper ou calculer, il est seulement affiché.
// Identique à lib/missionType.ts de l'appli : ne pas diverger.
var TYPE_SEP = ' + ';
function _typeParts(v){ return String(v||'').split(TYPE_SEP).map(function(s){return s.trim();}).filter(Boolean); }
function _typeAdd(v,t){ var p=_typeParts(v); if(!t || p.indexOf(t)>=0) return v; p.push(t); return p.join(TYPE_SEP); }
function _typeRemove(v,t){ return _typeParts(v).filter(function(x){return x!==t;}).join(TYPE_SEP); }

function _syncTypeBtn(){
  var l=document.getElementById('typeBtnLabel'); var t=document.getElementById('type');
  if(l && t) l.textContent = t.value || 'Choisir…';
  var v = t ? (t.value||'') : '';
  // Multi-sélection directe dans le pop-up : plus de lien « + Ajouter un type ».
  var link = document.getElementById('typeAddLink');
  if(link) link.style.display = 'none';
  // Avertissement (pas un blocage) quand plusieurs types sont cochés.
  var row = document.getElementById('typeChipsRow');
  if(row){
    var parts = _typeParts(v);
    if(parts.length>1){
      row.style.display='block';
      row.innerHTML = '<span style="display:inline-block;font-size:12.5px;font-weight:700;color:#9A3412;background:#FFF7ED;border:1px solid #FDBA74;border-radius:8px;padding:6px 10px;margin-top:6px;">⚠ '+parts.length+' types sélectionnés — c\'est bien volontaire ?</span>';
    } else { row.style.display='none'; row.innerHTML=''; }
  }
}
document.addEventListener('click', function(e){
  var d = e.target.closest && e.target.closest('[data-deltype]');
  if(d){ e.preventDefault(); var t=document.getElementById('type'); _setTypeValue(_typeRemove(t?t.value:'', d.dataset.deltype)); }
});
// Le <select id="type"> a une liste d'<option> FIXE. Une valeur hors liste (ex. un poste
// perso "Chorégraphe") est REFUSÉE par le navigateur et remise à vide → "ça ne se sélectionne pas".
// On crée donc l'<option> manquante avant d'affecter la valeur.
// ===== Prix appris par (production + poste) — mêmes règles que l'appli =====
function _priceKey(prod, poste){ return String(prod||'').toUpperCase().trim()+'|'+String(poste||'').toUpperCase().trim(); }
// Prix/jour appris pour ce couple : mémoire du profil, sinon repli sur les missions déjà saisies.
function _learnedPrice(prod, poste){
  prod=String(prod||'').trim(); poste=String(poste||'').trim(); if(!prod||!poste) return null;
  var mem=(typeof _profil!=='undefined'&&_profil&&_profil.price_memory)?_profil.price_memory:{};
  var v=mem[_priceKey(prod,poste)];
  if(typeof v==='number'&&v>0) return v;
  var pr=mem[_priceKey(prod,'__ALL__')]; // tarif défini au niveau de la PRODUCTION (comme l'app, PROD_RATE)
  if(typeof pr==='number'&&pr>0) return pr;
  var prodU=prod.toUpperCase(), list=(typeof missions!=='undefined'?missions:[]).filter(function(m){return Number(m.gross)>0;});
  var perDay=function(m){return Math.round((Number(m.gross)/Math.max(1,Number(m.vacations)||1))*100)/100;};
  var cand=list.filter(function(m){return String(m.production||'').toUpperCase()===prodU && String(m.type||'')===poste;});
  if(!cand.length) cand=list.filter(function(m){return String(m.production||'').toUpperCase()===prodU;});
  if(cand.length){ cand.sort(function(a,b){return a.date<b.date?1:-1;}); return perDay(cand[0]); }
  return null;
}
// Vrai dès que l'utilisateur saisit le prix à la main → on arrête le pré-remplissage automatique.
var _grossTouched = false;
// Pré-remplit le BRUT = tarif PAR VACATION × nombre de vacations (ou cachets). Fini la calculette :
// 230 €/vac × 5 vacations = 1 150 € (retour Yohan). Tarif = prix appris (prod+poste) > salaire journalier.
// On n'écrase jamais un prix saisi à la main, ni en édition.
function _prefillLearnedPrice(){
  var pe=document.getElementById('production'), te=document.getElementById('type'), ge=document.getElementById('gross');
  if(!pe||!te||!ge) return;
  if(typeof editingMissionId!=='undefined' && editingMissionId) return; // en édition : le prix stocké est le total
  if(_grossTouched) return;
  var rate=_learnedPrice(pe.value, te.value);
  if(rate==null){ var sj=(typeof _profil!=='undefined' && _profil && Number(_profil.salaire_journalier)) || 0; rate = sj>0 ? sj : null; }
  if(rate==null) return;
  var cachet=(typeof _missionMode!=='undefined' && _missionMode==='cachet');
  var cntEl=document.getElementById(cachet ? 'cachetInput' : 'vacations');
  var cnt=cntEl ? (Number(cntEl.value)||0) : 0;
  var mult = cnt>0 ? cnt : 1;
  ge.value = Math.round(rate*mult*100)/100;
}
// Recalcule le brut quand le nombre de vacations / cachets change (si prix pas saisi à la main).
document.addEventListener('input', function(e){
  if(!e.target) return;
  if(e.target.id==='gross'){ _grossTouched = true; return; }
  if(e.target.id==='vacations' || e.target.id==='cachetInput'){ if(typeof _prefillLearnedPrice==='function') _prefillLearnedPrice(); }
});
// Tarif par jour AU NIVEAU DE LA PRODUCTION (clé PROD|__ALL__, comme l'app getProdRate/setProdRate).
function _getProdRate(prod){
  var mem=(typeof _profil!=='undefined'&&_profil&&_profil.price_memory)?_profil.price_memory:{};
  var v=mem[_priceKey(prod,'__ALL__')];
  return (typeof v==='number'&&v>0)?v:null;
}
function _setProdRate(prod, rate){
  prod=String(prod||'').trim(); if(!prod||typeof _profil==='undefined'||!_profil) return;
  if(!_profil.price_memory) _profil.price_memory={};
  var k=_priceKey(prod,'__ALL__');
  if(!(rate>0)) delete _profil.price_memory[k]; else _profil.price_memory[k]=Math.round(rate*100)/100;
  if(currentUser){ try{ sb.from('profiles').upsert({id:currentUser.id, price_memory:_profil.price_memory},{onConflict:'id'}).then(function(){},function(){}); }catch(e){} }
}
// Retient silencieusement le prix/jour pour ce couple (prod+poste).
function _rememberPrice(prod, poste, perDay){
  prod=String(prod||'').trim(); poste=String(poste||'').trim();
  if(!prod||!poste||!(perDay>0)||typeof _profil==='undefined'||!_profil) return;
  var k=_priceKey(prod,poste), val=Math.round(perDay*100)/100;
  if(!_profil.price_memory) _profil.price_memory={};
  if(_profil.price_memory[k]===val) return;
  _profil.price_memory[k]=val;
  if(currentUser){ try{ sb.from('profiles').upsert({id:currentUser.id, price_memory:_profil.price_memory},{onConflict:'id'}).then(function(){},function(){}); }catch(e){} }
}
// ===== HEURES SUPPLÉMENTAIRES (site) — moteur porté de intermitrack-mobile/lib/overtime.ts =====
function _otTaux(rule){ return rule.heures>0 ? rule.base/rule.heures : 0; }
function _otBreakdown(hSup, rule){
  var taux=_otTaux(rule), lines=[], remaining=Math.max(0,hSup||0);
  for(var i=0;i<rule.paliers.length;i++){ var p=rule.paliers[i]; if(remaining<=1e-9)break; var h=Math.min(remaining,Math.max(0,p.h)); if(h<=0)continue; lines.push({h:h,pct:p.pct,taux:taux,montant:h*taux*(1+p.pct/100)}); remaining-=h; }
  if(remaining>1e-9){ lines.push({h:remaining,pct:rule.restPct,taux:taux,montant:remaining*taux*(1+rule.restPct/100)}); }
  return lines;
}
function _otCompute(hSup, rule){ return Math.round(_otBreakdown(hSup,rule).reduce(function(a,l){return a+l.montant;},0)*100)/100; }
function _otDefaultBase(annexe){ return annexe==='artiste'?0:8; }
function _otMoney(n){ return (Math.round(n*100)/100).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €'; }
function _otNum(s){ return Number(String(s==null?'':s).replace(',','.'))||0; }
// Stockage overtime_memory (clé = nom de prod normalisé), comme l'app.
function _getOvertimeRule(prod){ var mem=(typeof _profil!=='undefined'&&_profil&&_profil.overtime_memory)?_profil.overtime_memory:{}; var v=mem[normalizeProductionName(prod)]; return v||null; }
function _setOvertimeRule(prod, rule){
  if(!prod||!rule||!(rule.base>0)||!(rule.heures>0)||typeof _profil==='undefined'||!_profil) return;
  if(!_profil.overtime_memory) _profil.overtime_memory={};
  _profil.overtime_memory[normalizeProductionName(prod)]=rule;
  if(currentUser){ try{ sb.from('profiles').upsert({id:currentUser.id, overtime_memory:_profil.overtime_memory},{onConflict:'id'}).then(function(){},function(){}); }catch(e){} }
}
// État de l'éditeur (partagé config/mission).
var _ot = null;
function _otRule(){ return { base:_otNum(_ot.base), heures:_otNum(_ot.heures), paliers:_ot.paliers.map(function(p){return {h:_otNum(p.h),pct:_otNum(p.pct)};}).filter(function(p){return p.h>0;}), restPct:_otNum(_ot.restPct) }; }
function _otInit(prod, annexe, variant, containerId, onAdd){
  var r=_getOvertimeRule(prod);
  _ot={ prod:prod, variant:variant, container:containerId, onAdd:onAdd||null, added:false, hours:'',
    base: r?String(r.base):'', heures: r?String(r.heures):String(_otDefaultBase(annexe)||8),
    paliers: (r&&r.paliers&&r.paliers.length)?r.paliers.map(function(p){return {h:String(p.h),pct:String(p.pct)};}):[{h:'3',pct:'25'}],
    restPct: r?String(r.restPct):'50' };
}
function _otOutHTML(){
  var rule=_otRule(), taux=_otTaux(rule), isConfig=_ot.variant==='config', h='';
  if(taux>0) h+='<div class="ot-taux">Taux horaire de base = '+_otMoney(taux)+'/h</div>';
  if(isConfig){
    if(rule.base>0&&rule.heures>0) h+='<div class="ot-result"><div class="ot-resline">Aperçu : 3 h sup = '+_otMoney(_otCompute(3,rule))+'</div><div class="ot-resline">5 h sup = '+_otMoney(_otCompute(5,rule))+'</div></div>';
    var canSave=rule.base>0&&rule.heures>0;
    h+='<button type="button" class="ot-mainbtn" data-ot-save '+((canSave&&!_ot.added)?'':'disabled')+'>'+(_ot.added?'✓ Barème enregistré':'Enregistrer le barème pour cette prod')+'</button>';
    h+='<p class="ot-warn">Ce barème se pré-remplira sur tes prochaines missions de cette prod. Vérifie toujours avec ta fiche de paie — en test.</p>';
  } else {
    var nb=_otNum(_ot.hours), montant=_otCompute(nb,rule), lines=_otBreakdown(nb,rule), canAdd=nb>0&&rule.base>0&&rule.heures>0&&montant>0;
    if(canAdd) h+='<div class="ot-result">'+lines.map(function(l){return '<div class="ot-resline">'+(Math.round(l.h*100)/100)+' h à +'+l.pct+' % = '+_otMoney(l.montant)+'</div>';}).join('')+'<div class="ot-restotal">Total heures sup = '+_otMoney(montant)+'</div></div>';
    h+='<button type="button" class="ot-mainbtn" data-ot-add '+((canAdd&&!_ot.added)?'':'disabled')+'>'+(_ot.added?'✓ Ajouté au brut':(canAdd?'Ajouter '+_otMoney(montant)+' au brut':'Renseigne base + heures sup'))+'</button>';
    h+='<p class="ot-warn">Le montant s\'ajoute au brut de la mission. Vérifie toujours avec ta fiche de paie — en test.</p>';
  }
  return h;
}
function _otEditorHTML(){
  var isConfig=_ot.variant==='config', h='';
  h+='<p class="ot-hint">Les heures sup se calculent sur la base garantie (souvent inférieure au brut affiché), avec des paliers propres à la prod.</p>';
  h+='<div class="ot-row2"><div style="flex:1;"><label class="ot-lbl">Base garantie (€)</label><input class="ot-in" data-ot="base" inputmode="decimal" autocomplete="off" value="'+escapeHtml(_ot.base)+'" placeholder="Ex : 205"></div><div style="width:118px;"><label class="ot-lbl">Heures de base</label><input class="ot-in" data-ot="heures" inputmode="decimal" autocomplete="off" value="'+escapeHtml(_ot.heures)+'" placeholder="8"></div></div>';
  h+='<div class="ot-info"><b>C\'est quoi la « base garantie » ?</b> C\'est le salaire minimum sur lequel se calculent tes heures sup — souvent le minimum de ta convention, plus bas que ta pige négociée. Tu la trouves sur ta fiche de paie (ligne « salaire de base ») ou ton contrat. Taux horaire = base ÷ heures.</div>';
  h+='<div class="ot-palhead"><label class="ot-lbl">Paliers de majoration</label><button type="button" class="ot-preset" data-ot-preset>Standard 25 / 50</button></div>';
  _ot.paliers.forEach(function(p,i){ h+='<div class="ot-palrow"><input class="ot-in ot-palh" data-ot-pal="'+i+'" data-ot-palf="h" inputmode="decimal" autocomplete="off" value="'+escapeHtml(p.h)+'" placeholder="h"><span class="ot-mid">h à +</span><input class="ot-in ot-palpct" data-ot-pal="'+i+'" data-ot-palf="pct" inputmode="decimal" autocomplete="off" value="'+escapeHtml(p.pct)+'" placeholder="%"><span class="ot-mid">%</span><button type="button" class="ot-paldel" data-ot-paldel="'+i+'" title="Retirer">✕</button></div>'; });
  h+='<button type="button" class="ot-addpal" data-ot-addpal>+ Ajouter un palier</button>';
  h+='<div class="ot-palrow"><span class="ot-mid" style="flex:1;">Au-delà : +</span><input class="ot-in ot-palpct" data-ot="restPct" inputmode="decimal" autocomplete="off" value="'+escapeHtml(_ot.restPct)+'" placeholder="%"><span class="ot-mid">%</span></div>';
  if(!isConfig){ h+='<label class="ot-lbl">Nombre d\'heures supplémentaires</label><input class="ot-in" data-ot="hours" inputmode="decimal" autocomplete="off" value="'+escapeHtml(_ot.hours)+'" placeholder="Ex : 5">'; }
  h+='<div id="otOut">'+_otOutHTML()+'</div>';
  return h;
}
function _otRerender(){ var c=_ot&&document.getElementById(_ot.container); if(c) c.innerHTML=_otEditorHTML(); }
function _otRefreshOut(){ var o=document.getElementById('otOut'); if(o) o.innerHTML=_otOutHTML(); }
// Saisie : on met à jour l'état SANS re-render (préserve le focus), on rafraîchit juste la sortie.
document.addEventListener('input', function(e){
  if(!_ot) return; var t=e.target; if(!t||!t.matches) return;
  if(t.matches('[data-ot]')){ _ot[t.getAttribute('data-ot')]=t.value; _ot.added=false; _otRefreshOut(); }
  else if(t.matches('[data-ot-pal]')){ var i=Number(t.getAttribute('data-ot-pal')); if(_ot.paliers[i]){ _ot.paliers[i][t.getAttribute('data-ot-palf')]=t.value; _ot.added=false; _otRefreshOut(); } }
});
document.addEventListener('click', function(e){
  if(!_ot) return; var t=e.target;
  if(t.closest('[data-ot-preset]')){ _ot.paliers=[{h:'3',pct:'25'}]; _ot.restPct='50'; _ot.added=false; _otRerender(); return; }
  if(t.closest('[data-ot-addpal]')){ _ot.paliers.push({h:'',pct:''}); _otRerender(); return; }
  var pd=t.closest('[data-ot-paldel]'); if(pd){ _ot.paliers.splice(Number(pd.getAttribute('data-ot-paldel')),1); _ot.added=false; _otRerender(); return; }
  if(t.closest('[data-ot-save]')){ var r=_otRule(); if(r.base>0&&r.heures>0){ _setOvertimeRule(_ot.prod,r); _ot.added=true; _otRefreshOut(); if(typeof toast==='function') toast('Barème enregistré.'); } return; }
  if(t.closest('[data-ot-add]')){ var r2=_otRule(); var m=_otCompute(_otNum(_ot.hours),r2); if(m>0){ if(_ot.onAdd) _ot.onAdd(m,r2); _setOvertimeRule(_ot.prod,r2); _ot.added=true; _otRefreshOut(); if(typeof toast==='function') toast('Heures sup ajoutées au brut.'); } return; }
});

// --- Section heures sup DANS le formulaire de mission (variant 'mission', ajoute au brut) ---
function _missionOvertimeVisibility(){
  var wrap=document.getElementById('missionOvertimeWrap'); if(!wrap) return;
  var prod=((document.getElementById('production')||{}).value||'').trim();
  wrap.style.display = prod ? '' : 'none';
  // On replie systématiquement : l'utilisateur ré-ouvre pour la prod courante → barème frais.
  var sec=document.getElementById('missionOvertimeSection'); if(sec) sec.style.display='none';
  var ch=document.getElementById('missionOvertimeChev'); if(ch) ch.textContent='▼';
  if(_ot&&_ot.container==='missionOvertimeSection') _ot=null;
}
function _missionOvertimeToggle(){
  var sec=document.getElementById('missionOvertimeSection'), ch=document.getElementById('missionOvertimeChev'); if(!sec) return;
  if(sec.style.display==='none'){
    var prod=((document.getElementById('production')||{}).value||'').trim();
    if(!prod){ if(typeof toast==='function') toast("Choisis d'abord une production."); return; }
    var annexe=(typeof _profil!=='undefined'&&_profil&&_profil.annexe)||'';
    _otInit(prod, annexe, 'mission', 'missionOvertimeSection', function(montant){ var g=document.getElementById('gross'); if(g){ g.value=Math.round(((Number(g.value)||0)+montant)*100)/100; } });
    _otRerender(); sec.style.display=''; if(ch) ch.textContent='▲';
  } else { sec.style.display='none'; if(ch) ch.textContent='▼'; if(_ot&&_ot.container==='missionOvertimeSection') _ot=null; }
}
document.addEventListener('click', function(e){ if(e.target.closest && e.target.closest('#missionOvertimeHead')) _missionOvertimeToggle(); });

// Le poste PRÉ-REMPLI (depuis « Mes infos ») est une simple suggestion : tant qu'on n'a pas touché
// aux postes, le 1er tap REMPLACE (pas de cumul forcé). Ensuite les taps cumulent/décochent normalement.
var _typePristine = false;
function _setTypeValue(v){
  var t = document.getElementById('type'); if(!t) return;
  v = v || '';
  if(v && !Array.prototype.some.call(t.options, function(o){ return o.value === v; })){
    t.add(new Option(v, v));
  }
  t.value = v;
  if(typeof _syncTypeBtn === 'function') _syncTypeBtn();
  if(typeof _prefillLearnedPrice === 'function') _prefillLearnedPrice();
}
// Chips de base selon l'annexe (parité appli quickTypeChips) : « Montage/Démontage » n'a pas de sens en annexe 10.
function _quickTypeChips(){
  var ax = (typeof _profil!=='undefined' && _profil && _profil.annexe) || '';
  if(ax==='artiste') return ['Comédien','Chanteur','Musicien','Danseur','Choriste'];
  if(ax==='les_deux') return ['Montage','Tournage','Démontage','Comédien','Chanteur','Musicien','Danseur','Choriste'];
  return ['Montage','Tournage','Démontage'];
}
function _renderTypePicker(ov){
  var base = _quickTypeChips();
  var customs = getCustomPostes();
  var html = '<div class="pf-box"><div class="pf-title">Type de mission</div>';
  html += '<div class="pf-label">Touche pour cocher, retouche pour décocher — tu peux en cumuler plusieurs.</div>';
  html += '<div class="pf-seg">' + base.map(function(p){ return '<button type="button" class="pf-opt" data-type="'+escapeHtml(p)+'">'+escapeHtml(p)+'</button>'; }).join('') + '</div>';
  if(customs.length){ html += '<div class="pf-label">Mes postes</div><div class="pf-seg">' + customs.map(function(p){ return '<button type="button" class="pf-opt pf-opt-custom" data-type="'+escapeHtml(p)+'">'+escapeHtml(p)+'<span class="pf-opt-del" data-delposte="'+escapeHtml(p)+'">×</span></button>'; }).join('') + '</div>'; }
  html += '<div class="pf-label">Ajouter un poste</div><div class="pf-addrow"><input type="text" id="newPosteInput" placeholder="Ex : Clown, Cascadeur…" autocomplete="off"><button type="button" id="addPosteBtn">Ajouter</button></div>';
  html += '<div class="pf-actions"><button type="button" class="pf-ok" id="typePickClose" style="width:100%;">Valider</button></div></div>';
  ov.innerHTML = html;
  // Un type combiné (« Rec + MIX ») doit allumer SES DEUX pastilles, pas zéro : on compare par partie.
  var cur = document.getElementById('type') ? document.getElementById('type').value : '';
  var curParts = _typeParts(cur);
  ov.querySelectorAll('.pf-opt').forEach(function(x){ x.classList.toggle('on', curParts.indexOf(x.dataset.type)>=0); });
}
function _typePickerAddFromInput(ov){
  var inp = document.getElementById('newPosteInput'); var v = (inp && inp.value || '').trim();
  if(!v) return;
  addCustomPoste(v);
  var t = document.getElementById('type');
  if(_typePristine){ _setTypeValue(v); _typePristine = false; } // 1er choix : remplace la suggestion
  else _setTypeValue(_typeAdd(t?t.value:'', v)); // ajoute ET coche, sans fermer (multi-sélection)
  if(inp) inp.value='';
  _renderTypePicker(ov);
}
function _openTypePicker(){
  _profilEnsureDom(); // garantit les styles .pf-*
  var ov = document.getElementById('typePickerOverlay');
  if(!ov){
    var st = document.createElement('style');
    st.textContent = ".pf-addrow{display:flex;gap:8px;margin-top:6px;}.pf-addrow input{flex:1;min-width:0;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--text);font-size:14px;font-family:inherit;box-sizing:border-box;}.pf-addrow button{padding:10px 14px;border:none;border-radius:10px;background:var(--petrol);color:#fff;font-weight:800;cursor:pointer;font-family:inherit;}.pf-opt-custom{display:inline-flex;align-items:center;gap:6px;}.pf-opt-del{display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;border-radius:50%;background:rgba(0,0,0,.14);font-size:13px;line-height:1;}";
    document.head.appendChild(st);
    ov = document.createElement('div');
    ov.id = 'typePickerOverlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:none;align-items:center;justify-content:center;z-index:100003;padding:16px;';
    document.body.appendChild(ov);
    ov.addEventListener('click', function(e){
      if(e.target===ov || e.target.id==='typePickClose'){ ov.style.display='none'; return; }
      var del = e.target.closest && e.target.closest('[data-delposte]');
      if(del){ e.stopPropagation(); removeCustomPoste(del.dataset.delposte); _renderTypePicker(ov); return; }
      if(e.target.id==='addPosteBtn'){ _typePickerAddFromInput(ov); return; }
      var b = e.target.closest('[data-type]');
      if(b){
        // Toggle : coche si absent, décoche si présent. On ne ferme pas → multi-sélection.
        var t = document.getElementById('type'); var cur = t?t.value:'';
        if(_typePristine){
          // 1er tap sur la suggestion pré-remplie : on REMPLACE par le poste choisi (pas de cumul forcé).
          _setTypeValue(b.dataset.type);
        } else {
          _setTypeValue(_typeParts(cur).indexOf(b.dataset.type)>=0 ? _typeRemove(cur, b.dataset.type) : _typeAdd(cur, b.dataset.type));
        }
        _typePristine = false;
        _renderTypePicker(ov);
      }
    });
    ov.addEventListener('keydown', function(e){ if(e.key==='Enter' && e.target.id==='newPosteInput'){ e.preventDefault(); _typePickerAddFromInput(ov); } });
  }
  _renderTypePicker(ov);
  ov.style.display='flex';
}
(function(){
  function wire(){
    var tb=document.getElementById('typeBtn');
    if(tb && !tb.dataset.init){ tb.dataset.init='1'; tb.addEventListener('click', function(){ _openTypePicker(); }); _syncTypeBtn(); }
  }
  if (document.readyState !== "loading") wire(); else document.addEventListener("DOMContentLoaded", wire);
})();

// ====================================================================
// INTERMITRACK — JS des cartes Prévisions (à AJOUTER à ton app.js)
// À coller TOUT EN BAS de app.js (après setupEvents(); init();).
// Garde-fou inclus : si les cartes ne sont pas là, ne fait rien.
// ====================================================================
(function(){
  "use strict";
  // Garde-fou : si les calculateurs ne sont pas sur cette page, on ne fait rien.
  if(!document.getElementById("itk-c1-go")) return;

  /* ===== PARAMÈTRES OFFICIELS À ACTUALISER CHAQUE ANNÉE ===== */
  var CONFIG = {
    AJ_MIN:31.96, NH:507, SMIC_HORAIRE:12.31, DIV_A:5000, PLAFOND_AJ:174.80,
    ARTISTE:   {aSeuil:13700,aHaut:0.36,aBas:0.05,bSeuil:690,bHaut:0.26,bBas:0.08,c:0.70,plancher:44,jourH:12},
    TECHNICIEN:{aSeuil:14400,aHaut:0.42,aBas:0.05,bSeuil:720,bHaut:0.26,bBas:0.08,c:0.40,plancher:38,jourH:8},
    TAUX_RETRAITE:0.03, ABATTEMENT:0.9825, CSG:{plein:0.062,reduit:0.038,exonere:0}, CRDS:0.005,
    smicJournalier:function(){ return CONFIG.SMIC_HORAIRE*151.67/30; },
    FRANCHISE_CP_MAX:30,
    CONGES_TAUX:0.10,      // indemnité BRUTE = 10 % du salaire brut (exact)
    CONGES_CHARGES:0.22    // charges salariales déduites pour le NET (~22 %, estimation ajustable)
  };
  function eur(n){ return n.toLocaleString("fr-FR",{minimumFractionDigits:2,maximumFractionDigits:2})+" €"; }
  function $(id){ return document.getElementById(id); }
  function num(v){ if(v==null) return NaN; return parseFloat(String(v).replace(/\s/g,"").replace(",",".")); }

  /* ===== CARTE 1 ===== */
  function ajBrute(an,nht,sr){
    var k=(an==="artiste")?CONFIG.ARTISTE:CONFIG.TECHNICIEN, m=CONFIG.AJ_MIN;
    var A=m*(k.aHaut*Math.min(sr,k.aSeuil)+k.aBas*Math.max(0,sr-k.aSeuil))/CONFIG.DIV_A;
    var B=m*(k.bHaut*Math.min(nht,k.bSeuil)+k.bBas*Math.max(0,nht-k.bSeuil))/CONFIG.NH;
    return Math.max(k.plancher,Math.min(CONFIG.PLAFOND_AJ,A+B+m*k.c));
  }
  function ajNet(brute,csgKey){
    var retraite=brute*CONFIG.TAUX_RETRAITE, base=brute*CONFIG.ABATTEMENT;
    var csg=base*CONFIG.CSG[csgKey], crds=(csgKey==="exonere"?0:base*CONFIG.CRDS), exempt=false;
    if(brute-retraite-csg-crds < CONFIG.smicJournalier()){ csg=0; crds=0; exempt=true; }
    return {net:brute-retraite-csg-crds, retraite:retraite, csg:csg, crds:crds, exempt:exempt};
  }
  var annexe1="technicien";
  $("itk-c1-annexe").addEventListener("click",function(e){
    var b=e.target.closest("button"); if(!b) return;
    annexe1=b.dataset.a;
    [].forEach.call(this.children,function(x){x.classList.toggle("itk-on",x===b);});
  });
  $("itk-c1-go").addEventListener("click",function(){
    // On relit l'annexe RÉELLEMENT affichée (bouton .itk-on) au moment du calcul : _syncPrevAnnexe
    // change l'apparence sans toucher la variable annexe1 -> sinon un artiste voyait « annexe 10 »
    // mais obtenait le calcul annexe 8 tant qu'il n'avait pas recliqué (retour Isabelle).
    var _selA=document.querySelector("#itk-c1-annexe .itk-on");
    if(_selA && _selA.dataset.a) annexe1=_selA.dataset.a;
    var nht=num($("itk-c1-nht").value), sr=num($("itk-c1-sr").value), csgKey=$("itk-c1-csg").value;
    if(!(nht>0)||!(sr>0)){ $("itk-c1-err").style.display="block"; return; }
    $("itk-c1-err").style.display="none";
    var k=(annexe1==="artiste")?CONFIG.ARTISTE:CONFIG.TECHNICIEN;
    var brute=ajBrute(annexe1,nht,sr), d=ajNet(brute,csgKey);
    $("itk-c1-net").textContent=eur(d.net);
    $("itk-c1-sjr").textContent=eur(sr/(nht/k.jourH));
    $("itk-c1-brut").textContent=eur(brute);
    $("itk-c1-detail").innerHTML="AJ brut "+eur(brute)+" · Retraite "+eur(d.retraite)+
      " · CSG "+(d.csg?eur(d.csg):"–")+" · CRDS "+(d.crds?eur(d.crds):"–")+
      (d.exempt?"<br><em>CSG/CRDS exonérées : allocation sous le SMIC journalier — le taux CSG choisi n'a alors aucun effet.</em>":"");
    var proj="";
    [1,2,3].forEach(function(i){
      var h=Math.round((nht+i*100)/100)*100;
      proj += h+" h → "+eur(ajNet(ajBrute(annexe1,h,sr),csgKey).net)+" / j net"+(i<3?"<br>":"");
    });
    $("itk-c1-proj").innerHTML=proj;
    $("itk-c1-out").classList.remove("itk-hide");
  });

  /* ===== CARTE 2 ===== */


  /* ===== CARTE 3 ===== */
  $("itk-c3-go").addEventListener("click",function(){
    var b=num($("itk-c3-brut").value); if(!(b>0)) return;
    var brut=b*CONFIG.CONGES_TAUX, net=brut*(1-CONFIG.CONGES_CHARGES);
    $("itk-c3-val").textContent="Environ "+eur(net)+" net";
    $("itk-c3-detail").innerHTML="Indemnité brute ≈ "+eur(brut)+" (10 % du salaire) · charges salariales ~"+Math.round(CONFIG.CONGES_CHARGES*100)+" % (estimation).";
    $("itk-c3-out").classList.remove("itk-hide");
  });

  /* ===== CARTE 4 — NET À PAYER D'UNE MISSION ===== */
  if($("itk-c4-go")){
    var CHARGE_DEFAUT={technicien:22.5,musicien:22.5,artiste:21}; // % charges salariales par statut (cf. coeffs fiscalité)
    // Pré-remplissage depuis les valeurs sauvegardées (ou défauts)
    if($("itk-c4-charge")) $("itk-c4-charge").value=String(getChargeRate()).replace(".",",");
    if($("itk-c4-pas")){ var p=getPasRate(); $("itk-c4-pas").value=p?String(p).replace(".",","):""; }
    // Le statut pré-remplit le taux de charges (l'utilisateur peut ensuite l'ajuster)
    if($("itk-c4-statut")) $("itk-c4-statut").addEventListener("click",function(e){
      var b=e.target.closest("button"); if(!b) return;
      [].forEach.call(this.children,function(x){x.classList.toggle("itk-on",x===b);});
      if($("itk-c4-charge")) $("itk-c4-charge").value=String(CHARGE_DEFAUT[b.dataset.s]||22.5).replace(".",",");
    });
    $("itk-c4-go").addEventListener("click",function(){
      var brut=num($("itk-c4-brut").value),
          charge=num($("itk-c4-charge").value),
          pas=num($("itk-c4-pas").value);
      if(!(brut>0)) return;
      if(!(charge>=0)) charge=0;
      if(!(pas>=0)) pas=0;
      // Sauvegarde pour réutilisation (carte + tableau de bord)
      setChargeRate(charge); setPasRate(pas);
      var netImp=brut*(1-charge/100), net=netImp*(1-pas/100);
      $("itk-c4-net").textContent=eur(net);
      $("itk-c4-brutval").textContent=eur(brut);
      $("itk-c4-netimp").textContent=eur(netImp);
      $("itk-c4-detail").innerHTML=
        "Brut "+eur(brut)+" − charges "+charge.toString().replace(".",",")+" % ("+eur(brut-netImp)+")"+
        " = net avant impôt "+eur(netImp)+
        "<br>− prélèvement à la source "+pas.toString().replace(".",",")+" % ("+eur(netImp-net)+")"+
        " = <b>net à payer "+eur(net)+"</b>"+
        "<br><em>Estimation indicative — vérifie avec ta fiche de paie.</em>";
      $("itk-c4-out").classList.remove("itk-hide");
    });
  }
})();
