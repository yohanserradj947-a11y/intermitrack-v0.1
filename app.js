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
function _xlNum(v){ if(v==null||v==='')return 0; if(typeof v==='number')return v; const n=Number(String(v).replace(/[^\d,.-]/g,'').replace(/\s/g,'').replace(',','.')); return isFinite(n)?n:0; }
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
    return '<div class="xl-row'+(warn?' warn':'')+'"><div class="xl-r1"><input type="checkbox" class="xl-chk" data-i="'+i+'" '+(d.selected?'checked':'')+'><div style="flex:1;min-width:0;"><div class="xl-prod">'+_xlEsc(d.prod||'(sans nom)')+'</div><div class="xl-meta">'+_xlFmtD(d.date)+(d.missing.indexOf('heures')<0?(' · '+d.hours+' h'):'')+(d.price?(' · '+d.price+' €'):'')+(d.lieu?(' · '+_xlEsc(d.lieu)):'')+'</div>'+(warn?('<div class="xl-warnchip">⚠ À compléter : '+d.missing.join(' · ')+'</div>'):'')+'</div></div><div class="xl-edit"><input placeholder="Prod" data-e="prod" data-i="'+i+'" value="'+_xlEsc(d.prod||'')+'"><input placeholder="Heures" data-e="hours" data-i="'+i+'" value="'+_xlEsc(d.hours||'')+'"><input placeholder="Prix €" data-e="price" data-i="'+i+'" value="'+_xlEsc(d.price||'')+'"></div></div>';
  }).join('');
  _xlUpdBtn();
}
async function _xlDoImport(){
  const sel=_xlDrafts.filter(function(d){return d.selected;}); if(!sel.length)return;
  if(!currentUser){ toast('Connecte-toi.'); return; }
  const btn=document.getElementById('xlImport'); btn.disabled=true; btn.textContent='Import en cours…';
  const payloads=sel.map(function(d){ return { user_id:currentUser.id, production:normalizeProductionName(d.prod), emission:'', lieu:d.lieu||'', mission_type:'Tournage', mission_date:d.date, end_date:d.date, hours:d.hours>0?d.hours:8, gross_amount:d.price||0, vacations:Math.max(1,Math.round((d.hours||8)/8)), km_distance:0, km_rate:0, km_amount:0 }; });
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
        const buf=await f.arrayBuffer(); const wb=XLSX.read(new Uint8Array(buf),{type:'array',cellDates:true});
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
  const set = {};
  (typeof missions !== 'undefined' ? missions : []).forEach(m=>{ const n = normalizeProductionName(m.production || 'SANS PRODUCTION'); set[n]=true; });
  return Object.keys(set).sort();
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
document.addEventListener('click', function(e){
  if (e.target.closest && e.target.closest('#prodColorsManageBtn')) openProdColorsManager();
  else if (e.target.closest && e.target.closest('#prodColorsResetBtn')) resetProdColors();
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
function getProfileType() { return localStorage.getItem(storageKey("profile_type")) || "technicien"; }
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

// ===== Barème kilométrique officiel (coefficient €/km par tranche de km annuels) =====
const KM_BAREME = {
  "3":    { c1: 0.529, c2: 0.316, c3: 0.370 }, // 3 CV ou moins
  "4":    { c1: 0.606, c2: 0.340, c3: 0.407 },
  "5":    { c1: 0.636, c2: 0.357, c3: 0.427 },
  "6":    { c1: 0.665, c2: 0.374, c3: 0.447 },
  "7":    { c1: 0.697, c2: 0.394, c3: 0.470 }, // 7 CV et plus
  "moto": { c1: 0.395, c2: 0.099, c3: 0.234 },
};
function kmPf(v) { const n = Number(String(v ?? "").replace(",", ".").replace(/\s/g, "")); return isFinite(n) ? n : 0; }
function kmCoef(cvKey, tranche) { const b = KM_BAREME[cvKey]; if (!b) return 0; return tranche === "2" ? b.c2 : tranche === "3" ? b.c3 : b.c1; }
function kmTrancheLabel(t) { return t === "2" ? "5 001–20 000 km/an" : t === "3" ? "> 20 000 km/an" : "≤ 5 000 km/an"; }

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
function kmRateUsed() {
  const cv = $("kmCv")?.value || "";
  const tranche = $("kmTranche")?.value || "1";
  return cv ? kmCoef(cv, tranche) : kmPf($("kmRate")?.value);
}

function calculateKmAmount() {
  return Math.round(kmEffectiveDistance() * kmRateUsed() * 100) / 100;
}

function updateKmPreview() {
  const preview = $("kmPreview");
  if (!preview) return;
  const base = kmBaseDistance();
  const eff = kmEffectiveDistance();
  const cv = $("kmCv")?.value || "";
  const tranche = $("kmTranche")?.value || "1";
  const rt = $("kmRoundTrip")?.checked;
  const everyDay = $("kmEveryDay")?.checked;
  const justify = $("kmJustify")?.checked;
  const capped = !justify && kmPf($("kmDistance")?.value) > 40;
  const nbDays = kmNbDays();

  // Avertissement plafond 40 km
  const warn = $("kmCapWarn");
  if (warn) warn.style.display = capped ? "block" : "none";

  // Le taux manuel et le barème CV s'excluent : choisir un CV désactive le taux saisi
  if ($("kmRate")) $("kmRate").style.opacity = cv ? "0.5" : "1";

  if (eff > 0 && !cv && kmPf($("kmRate")?.value) <= 0) {
    preview.innerHTML = "👉 Choisis ta puissance fiscale (ou un taux €/km) pour estimer les frais.";
    return;
  }
  let detail = "";
  if (rt || everyDay || capped) {
    detail = " = " + Math.round(base) + " km" + (capped ? " (plafond 40)" : "") + (rt ? " × 2 (A/R)" : "") + (everyDay ? " × " + nbDays + " j" : "");
  }
  preview.innerHTML = "Distance comptée : <strong>" + eff + " km</strong>" + detail +
    "<br>Frais estimés : <strong>" + money(calculateKmAmount()) + "</strong>" + (cv ? " · " + kmTrancheLabel(tranche) : "");
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
    $("accountAvatarBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      const btn = $("accountAvatarBtn");
      const rect = btn.getBoundingClientRect();
      const dd = $("accountDropdown");
      dd.style.top = (rect.bottom + 8) + "px";
      dd.style.right = (window.innerWidth - rect.right) + "px";
      dd.style.left = "auto";
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

  const floatBtn = $("themeToggleFloat");
  if (floatBtn) {
    floatBtn.classList.remove("hidden");
    floatBtn.textContent = savedTheme === "dark" ? "☀️" : "🌙";
    floatBtn.onclick = () => {
      const current = localStorage.getItem("intermitrack_theme") || "light";
      const next = current === "dark" ? "light" : "dark";
      applyTheme(next);
      localStorage.setItem("intermitrack_theme", next);
      floatBtn.textContent = next === "dark" ? "☀️" : "🌙";
    };
  }

  if ($("feedbackBtn")) $("feedbackBtn").classList.remove("hidden");
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
  if (m.includes("password")) return "Mot de passe trop court (6 caractères minimum).";
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
    emission: x.emission || "", lieu: x.lieu || ""
  }));
  render();
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
  if ($("endDate").value < $("date").value) { toast("La date de fin ne peut pas être avant la date de début."); return; }

  // Jours travaillés déjà choisis via le pop-up pour cette période → enregistrement réparti
  if (!editingMissionId && _mdpData && _mdpData.start === $("date").value && _mdpData.end === $("endDate").value) {
    await _mdpSaveBreakdown();
    return;
  }
  // Période de 2 jours ou plus non encore traitée → ouvrir le pop-up des jours travaillés
  if (!editingMissionId && $("date").value && $("endDate").value &&
      daysInclusive(new Date($("date").value+"T00:00:00"), new Date($("endDate").value+"T00:00:00")) > 1) {
    openMultiDayPicker($("date").value, $("endDate").value);
    return;
  }
  const payload = {
    user_id: currentUser.id, production: normalizeProductionName($("production").value),
    emission: $("emission")?.value || "", lieu: $("lieu")?.value || "",
    mission_type: $("type").value, mission_date: $("date").value, end_date: $("endDate").value,
    hours: Number($("hours").value), gross_amount: Number($("gross").value),
    vacations: Number($("vacations").value) || Math.round((Number($("hours").value)||0)/8),
    km_distance: kmEffectiveDistance(), km_rate: kmRateUsed(), km_amount: calculateKmAmount()
  };
  setProductionColorHex(payload.production, selectedProdColor === 'default' ? null : selectedProdColor);
  let result;
  if (editingMissionId) result = await sb.from("missions").update(payload).eq("id", editingMissionId);
  else result = await sb.from("missions").insert(payload);
  const { error } = result;
  if (error) { toast("Erreur sauvegarde : " + error.message); return; }
  await _afterMissionSave(payload.mission_date);
}

// Étapes communes après l'enregistrement d'une (ou plusieurs) mission(s)
async function _afterMissionSave(firstDate) {
  _mdpData = null;
  var _hl = document.querySelector('label[for="hours"]'); if (_hl) _hl.textContent = "Nombre d'heures cumulées sur la période";
  $("missionForm").reset();
  editingMissionId = null;
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
  const km_distance = kmEffectiveDistance(), km_rate = kmRateUsed(), km_amount = calculateKmAmount();
  const runs = [];
  let cur = null;
  for (const d of _mdpData.days){
    if (!d.checked){ cur = null; continue; }
    if (cur && d.hours === cur.hours && _isNextDay(cur.end, d.date)){ cur.end = d.date; cur.days++; }
    else { cur = { start: d.date, end: d.date, hours: d.hours, days: 1 }; runs.push(cur); }
  }
  const payloads = runs.map(function(r, idx){
    const runHours = r.hours * r.days;
    const gross = sumHours > 0 ? Math.round(totalGross * (runHours / sumHours)) : Math.round(totalGross / runs.length);
    return {
      user_id: currentUser.id, production: production, emission: emission, lieu: lieu,
      mission_type: type, mission_date: r.start, end_date: r.end,
      hours: runHours, gross_amount: gross, vacations: r.days,
      km_distance: idx === 0 ? km_distance : 0, km_rate: idx === 0 ? km_rate : 0, km_amount: idx === 0 ? km_amount : 0
    };
  });
  const grossSum = payloads.reduce(function(s,p){ return s + p.gross_amount; }, 0);
  if (payloads.length) payloads[0].gross_amount += (totalGross - grossSum);
  const res = await sb.from("missions").insert(payloads);
  if (res.error){ toast("Erreur sauvegarde : " + res.error.message); return; }
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
  $("production").value = mission.production || ""; if (typeof syncProdColorPicker === 'function') syncProdColorPicker();
  if ($("emission")) $("emission").value = mission.emission || "";
  if ($("lieu")) $("lieu").value = mission.lieu || "";
  $("type").value = mission.type || "Autre";
  if (typeof _syncTypeBtn === "function") _syncTypeBtn();
  $("date").value = mission.date || "";
  $("endDate").value = mission.endDate || mission.date || "";
  $("hours").value = mission.hours || 0;
  $("gross").value = mission.gross || 0;
  if ($("kmDistance")) $("kmDistance").value = mission.kmDistance || "";
  if ($("kmRate")) $("kmRate").value = mission.kmRate || "";
  // La distance stockée est déjà la distance finale comptée : on évite de la re-plafonner / re-multiplier
  if ($("kmCv")) $("kmCv").value = "";
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

function activateView(viewName) {
  document.querySelectorAll(".tab").forEach((tab) => { tab.classList.toggle("active", tab.dataset.view === viewName); });
  document.querySelectorAll(".view").forEach((view) => { view.classList.toggle("active", view.id === "view-" + viewName); });
  trackEvent("view_" + viewName);
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
  const year = new Date().getFullYear();
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

  // Profil info + abattement spécifique
  const profileInfos = {
    technicien: {
      hint: "Abattement forfaitaire standard : 10% du net imposable (plafonné à 14 555 €).",
      forfait: (net) => Math.min(net * 0.10, 14555),
      label: "Forfait 10% standard",
      netCoeff: 0.775 // 22.5% cotisations salariales
    },
    musicien: {
      hint: "Artiste musicien : forfait 14% (instruments, plafonné 14 555 €) + 5% (représentation) — cumulables.",
      forfait: (net) => Math.min(net * 0.14, 14555) + (net * 0.05),
      label: "Forfait 14% + 5% musicien",
      netCoeff: 0.775
    },
    artiste: {
      hint: "Artiste dramatique/lyrique/chorégraphique : abattement 18% sur cotisations (déjà inclus dans le net imposable de votre fiche de paie). Abattement déclaration : 10% standard.",
      forfait: (net) => Math.min(net * 0.10, 14555),
      label: "Forfait 10% (abattement 18% déjà dans fiche de paie)",
      netCoeff: 0.79 // abattement 18% sur cotisations déjà appliqué
    }
  };
  const profil = profileInfos[profileType] || profileInfos.technicien;

  if ($("profileHint")) $("profileHint").textContent = profil.hint;
  if ($("profileAbattementInfo")) {
    $("profileAbattementInfo").className = "fi-info-box";
    $("profileAbattementInfo").innerHTML =
      `<strong>ℹ️ ${profil.label}</strong>${profil.hint}`;
  }

  // Calcul net imposable
  const netSalaires = Math.round(yearGross * profil.netCoeff);
  const netAre = arePercue; // ARE = net imposable direct
  const netConges = Math.round(congesSpec * 0.88); // ~12% cotisations sur congés
  const netTotal = netSalaires + netAre + netConges + otherIncome;
  const fraisSaisis = fraisTotalForYear(new Date().getFullYear());
  const totalFraisReels = totalKmAmount + autresFrais + fraisSaisis;

  // Abattement forfaitaire vs frais réels
  const forfait = Math.round(profil.forfait(netSalaires));
  const baseAvecForfait = Math.max(0, netTotal - forfait);
  const baseAvecReels = Math.max(0, netTotal - totalFraisReels);
  const bestBase = Math.min(baseAvecForfait, baseAvecReels);
  const useForfait = forfait >= totalFraisReels;

  // CSG/CRDS non déductible (2.4% du brut salaires + 2.4% ARE)
  const csgNonDed = Math.round((yearGross + arePercue) * 0.024);

  // Projections
  const observedMonths = getObservedMissionMonths(yearMissions);
  const projectedGross = estimateAnnualProjection(yearGross, observedMonths);
  const projectedBase = observedMonths > 0
    ? Math.max(0, Math.round(projectedGross * profil.netCoeff) + netAre + netConges + otherIncome - (useForfait ? profil.forfait(Math.round(projectedGross * profil.netCoeff)) : totalFraisReels))
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
  if ($("fiscaliteAbattementReels")) $("fiscaliteAbattementReels").textContent = money(totalFraisReels);

  if ($("fiscaliteComparaisonBox")) {
    $("fiscaliteComparaisonBox").style.display = "grid";
    $("fiscaliteComparaisonBox").className = "fi-comparaison";
    $("fiscaliteComparaisonBox").innerHTML = `
      <div class="fi-comp-card ${useForfait ? 'winner' : ''}">
        <div class="fi-comp-title">Forfait</div>
        <span class="fi-comp-badge ${useForfait ? 'rec' : 'alt'}">${useForfait ? '✓ Recommandé' : 'Standard'}</span>
        <span class="fi-comp-amount">${money(forfait)}</span>
        <div class="fi-comp-detail">${profil.label}</div>
      </div>
      <div class="fi-comp-card ${!useForfait && totalFraisReels > 0 ? 'winner' : ''}">
        <div class="fi-comp-title">Frais réels</div>
        <span class="fi-comp-badge ${!useForfait && totalFraisReels > 0 ? 'rec' : 'alt'}">${!useForfait && totalFraisReels > 0 ? '✓ Recommandé' : 'Alternative'}</span>
        <span class="fi-comp-amount">${money(totalFraisReels)}</span>
        <div class="fi-comp-detail">Km + dépenses saisies + autres</div>
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
    `Net imposable ~${money(netTotal)} · Frais ${useForfait ? "forfait" : "réels"} ${money(useForfait ? forfait : totalFraisReels)}`;
  // Auto-remplir SJR carence depuis vacations
  const totalVac = yearMissions.reduce((a, x) => a + Number(x.vacations || 0), 0);
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
    if (!useForfait && totalFraisReels > 0) conseils.push("✅ Vos frais réels dépassent le forfait. Déclarez-les !");
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
  const heures = list.reduce(function(a,x){ return a + (Number(x.hours)||0); }, 0);
  const artiste = (_profil && _profil.annexe === "artiste");
  const coef = artiste ? 1.3 : 1.4, divJ = artiste ? 10 : 8;
  const daysInMonth = new Date(current.getFullYear(), current.getMonth()+1, 0).getDate();
  const jniBase = heures * coef / divJ;                       // jours non indemnisables (base formule FT)
  function clampDays(v){ return Math.max(0, Math.min(daysInMonth, v)); }
  const indemHaut = clampDays(daysInMonth - jniBase * 1.05);  // optimiste (formule officielle)
  const indemBas  = clampDays(daysInMonth - jniBase * 1.20);  // prudent (heures majorées FT ~+15-20%)
  const tax = (_profil && Number(_profil.taux_impot)) || 0;
  const fNet = 1 - tax/100, showNet = tax > 0;
  const bas = Math.round(aj * indemBas * fNet), haut = Math.round(aj * indemHaut * fNet);
  const heuresR = Math.round(heures*10)/10;
  box.innerHTML =
    '<div class="pe-card">' +
      '<div class="pe-head"><span class="pe-label">' + ICO.euro + ' Estimation France Travail (ce mois)</span><span class="pe-val">≈ ' + bas.toLocaleString('fr-FR') + ' – ' + money(haut) + '</span></div>' +
      '<div class="pe-detail">' + (showNet ? 'fourchette nette (après ' + tax + ' % d\'impôt)' : 'fourchette brute') + ' · basée sur ' + heuresR + ' h ce mois' + (artiste ? ' (artiste, annexe 10)' : ' (technicien, annexe 8)') + '</div>' +
      '<div class="pe-total"><div class="pe-total-row"><span class="pe-total-label">Revenu total estimé ce mois</span><span class="pe-total-val">≈ ' + (salaireNet + bas).toLocaleString('fr-FR') + ' – ' + money(salaireNet + haut) + '</span></div><div class="pe-total-sub">salaire net ' + money(salaireNet) + ' + allocation France Travail</div></div>' +
      '<div class="pe-note">Fourchette <b>indicative</b> — nous <b>affinons en continu notre formule</b> pour nous rapprocher au plus près du montant réel (le calcul France Travail est complexe : heures majorées, SJR, carences, plafonds). Ne tient pas compte des <b>carences / franchises</b>. Fiable seulement avec tes <b>vraies heures</b>. Montant exact → ton espace <a href="https://www.francetravail.fr/spectacle/" target="_blank" rel="noopener">France Travail</a>.' + (showNet ? '' : ' <a href="#" id="peTaxLink">Ajouter mon taux d\'impôt</a> pour le net.') + '</div>' +
    '</div>';
  if (!showNet) { const tk = $("peTaxLink"); if (tk) tk.onclick = function(e){ e.preventDefault(); if (typeof openProfilModal === "function") openProfilModal(); }; }
}

function render() {
  const now = new Date();
  const year = now.getFullYear();
  if ($("areAdmissionDate")) $("areAdmissionDate").value = areAdmissionDate || "";
  if ($("areAdmissionInfo") && areAdmissionDate) $("areAdmissionInfo").textContent = "Calcul des heures effectué depuis le " + new Date(areAdmissionDate).toLocaleDateString("fr-FR");
  const areStartDate = areAdmissionDate ? new Date(areAdmissionDate + "T00:00:00") : new Date(year, 0, 1);
  const yearMissions = missions.filter((m) => new Date(m.date + "T00:00:00") >= areStartDate);
  const selectedMonthMissions = monthMissions(current);
  const yearHours = Math.round(sumDone(yearMissions) * 10) / 10;
  const plannedHours = Math.round(sumPlanned(yearMissions) * 10) / 10;
  const monthHours = Math.round(selectedMonthMissions.reduce((total, m) => total + Number(m.hours || 0), 0) * 10) / 10;
  const yearGross = yearMissions.reduce((a, x) => a + Number(x.gross || 0), 0);
  const monthGross = selectedMonthMissions.reduce((a, x) => a + Number(x.gross || 0), 0);
  const percent = Math.round((yearHours / OBJECTIVE_HOURS) * 100);
  const remaining = Math.max(0, Math.round((OBJECTIVE_HOURS - yearHours - plannedHours) * 10) / 10);

  if ($("yearHours")) $("yearHours").textContent = yearHours;
  if ($("monthHours")) $("monthHours").textContent = monthHours + "h";
  // Net à payer estimé = brut − charges salariales − prélèvement à la source (taux réglés dans Prévisions)
  const monthNet = Math.round(monthGross * (1 - getChargeRate() / 100) * (1 - getPasRate() / 100));
  if ($("monthNet")) $("monthNet").textContent = money(monthNet);
  if ($("monthGross")) $("monthGross").textContent = "Brut " + money(monthGross);
  renderPoleEmploi(selectedMonthMissions, monthNet);
  if ($("recapMonthPicker")) $("recapMonthPicker").value = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
  const monthRate = monthHours > 0 ? Math.round(monthGross / monthHours) : 0;
  const monthRateNet = monthHours > 0 ? Math.round(monthNet / monthHours) : 0;
  if ($("monthRateNet")) $("monthRateNet").textContent = money(monthRateNet) + "/h";
  if ($("monthRate")) $("monthRate").textContent = "Brut " + money(monthRate) + "/h";
  checkAndShowNotification(remaining, yearHours);
  if ($("remainingHours")) $("remainingHours").textContent = remaining;
  if ($("plannedHours")) $("plannedHours").textContent = plannedHours;
  if ($("missionCount")) {
  const totalVac = selectedMonthMissions.reduce((a, x) => a + Number(x.vacations || 0), 0);
  $("missionCount").textContent = totalVac;
}
  if ($("progressText")) $("progressText").textContent = percent + "% de ton objectif intermittent";
  renderFiscalite(yearGross, yearMissions);

  renderChart(yearHours, plannedHours);
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

function renderChart(doneHours, plannedHours = 0) {
  const total = OBJECTIVE_HOURS;
  const doneRaw = Math.max(0, Number(doneHours) || 0);
  const plannedRaw = Math.max(0, Number(plannedHours) || 0);
  // Même calcul que la jauge de l'appli : on borne, et on arrondit la SOMME (pas chaque part).
  // Pourcentages AFFICHÉS : non plafonnés (peuvent dépasser 100%, comme l'appli).
  const donePercent = Math.round((doneRaw / total) * 100);
  const plannedPercent = Math.round((plannedRaw / total) * 100);
  const totalPercent = Math.round(((doneRaw + plannedRaw) / total) * 100);
  // Remplissage de l'arc : borné au demi-cercle (impossible de dessiner au-delà de 100%).
  const doneFrac = Math.min(doneRaw / total, 1);
  const plannedFrac = Math.min(plannedRaw / total, 1 - doneFrac);
  const CIRC = 377;
  const doneDash = Math.min(doneFrac * CIRC, CIRC);
  const plannedDash = Math.min(plannedFrac * CIRC, CIRC - doneDash);
  if (!$("chart")) return;
 const isDark = document.body.classList.contains('theme-dark');
  $("chart").innerHTML = `
 <svg viewBox="-20 0 340 210" width="100%" role="img" aria-label="Arc progression heures">
      <defs>
        <linearGradient id="g3done" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="${isDark ? '#1F6E8F' : '#1F4E5F'}"/>
          <stop offset="100%" stop-color="${isDark ? '#7ACCE0' : '#1F4E5F'}"/>
        </linearGradient>
        <linearGradient id="g3plan" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#FDBA74"/>
          <stop offset="100%" stop-color="#F97316"/>
        </linearGradient>
        <filter id="arcShadow"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-opacity="0.15"/></filter>
      </defs>
      <path d="M 30 165 A 120 120 0 0 1 270 165" fill="none" stroke="${isDark ? 'rgba(255,255,255,.12)' : '#EEF4F1'}" stroke-width="30" stroke-linecap="butt"/>
      ${doneDash > 0 ? `<path d="M 30 165 A 120 120 0 0 1 270 165" fill="none" stroke="url(#g3done)" stroke-width="30" stroke-linecap="butt" stroke-dasharray="${doneDash} ${CIRC}"/>` : ""}
      ${plannedDash > 0 ? `<path d="M 30 165 A 120 120 0 0 1 270 165" fill="none" stroke="url(#g3plan)" stroke-width="30" stroke-linecap="butt" stroke-dasharray="${plannedDash} ${CIRC}" stroke-dashoffset="${-doneDash}"/>` : ""}
      <text x="150" y="132" text-anchor="middle" font-size="44" font-weight="900" fill="${isDark ? '#7ACCE0' : '#1F4E5F'}" font-family="-apple-system, BlinkMacSystemFont, sans-serif">${totalPercent}%</text>
      <text x="150" y="155" text-anchor="middle" font-size="13" fill="${isDark ? 'rgba(255,255,255,.4)' : '#718096'}" font-family="-apple-system, BlinkMacSystemFont, sans-serif">potentiel total</text>
      <rect x="10" y="188" width="11" height="11" rx="3" fill="${isDark ? '#7ACCE0' : '#1F4E5F'}"/>
      <text x="26" y="198" font-size="10" font-weight="700" fill="${isDark ? '#E0F4FF' : '#2D3748'}" font-family="-apple-system, BlinkMacSystemFont, sans-serif">Effectué · ${donePercent}%</text>
      <rect x="130" y="188" width="11" height="11" rx="3" fill="#F97316"/>
      <text x="146" y="198" font-size="10" font-weight="700" fill="${isDark ? '#E0F4FF' : '#2D3748'}" font-family="-apple-system, BlinkMacSystemFont, sans-serif">Prévu · ${plannedPercent}%</text>
      <rect x="245" y="188" width="11" height="11" rx="3" fill="${isDark ? 'rgba(255,255,255,.08)' : '#D8E4DF'}"/>
      <text x="261" y="198" font-size="10" font-weight="700" fill="${isDark ? 'rgba(255,255,255,.4)' : '#718096'}" font-family="-apple-system, BlinkMacSystemFont, sans-serif">Restant</text>
    </svg>

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
            <span class="pill">${escapeHtml(mission.type)}</span>
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
let _missionsPeriod = "all";              // 'all' | 'year' | 'custom'  (comme l'app mobile)
let _missionsCustomYear = new Date().getFullYear();

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
  const target = _missionsPeriod === "year" ? new Date().getFullYear() : _missionsCustomYear;
  return missions.filter(function(m){
    return new Date((m.date) + "T00:00:00").getFullYear() === target;
  });
}

function _missionsPeriodBar(){
  const chip = function(active){ return 'padding:8px 15px;border-radius:99px;font-size:13px;font-weight:700;cursor:pointer;border:none;font-family:inherit;' + (active ? 'background:var(--petrol);color:#fff;' : 'background:var(--soft);color:var(--petrol);'); };
  let html = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">' +
    '<button type="button" class="mperiod-chip" data-mp="all" style="' + chip(_missionsPeriod==='all') + '">Tout</button>' +
    '<button type="button" class="mperiod-chip" data-mp="year" style="' + chip(_missionsPeriod==='year') + '">Cette année</button>' +
    '<button type="button" class="mperiod-chip" data-mp="custom" style="' + chip(_missionsPeriod==='custom') + '">Par année</button>' +
    '</div>';
  if (_missionsPeriod === 'custom') {
    const years = _missionsYears();
    const ychip = function(active){ return 'padding:6px 13px;border-radius:99px;font-size:13px;font-weight:700;cursor:pointer;border:1px solid var(--line);font-family:inherit;' + (active ? 'background:var(--petrol);color:#fff;border-color:var(--petrol);' : 'background:var(--card);color:var(--petrol);'); };
    html += '<div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:14px;">' +
      (years.length ? years.map(function(y){ return '<button type="button" class="myear-chip" data-my="' + y + '" style="' + ychip(y===_missionsCustomYear) + '">' + y + '</button>'; }).join('') : '<span style="font-size:13px;color:var(--muted);">Aucune année</span>') +
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
      if (_missionsPeriod === 'custom') { const ys = _missionsYears(); if (ys.indexOf(_missionsCustomYear) < 0 && ys.length) _missionsCustomYear = ys[0]; }
      renderAllMissions();
    });
  });
  container.querySelectorAll(".myear-chip").forEach(function(b){
    b.addEventListener("click", function(){ _missionsCustomYear = Number(b.dataset.my); renderAllMissions(); });
  });
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
  const sorted = Object.keys(groups).map((name) => ({
    name, list: groups[name],
    gross: groups[name].reduce((a, x) => a + Number(x.gross || 0), 0),
    hours: Math.round(groups[name].reduce((a, x) => a + Number(x.hours || 0), 0) * 10) / 10,
    vacations: groups[name].reduce((a, x) => a + Number(x.vacations || Math.round(Number(x.hours || 0) / 8)), 0),
    count: groups[name].length
  })).sort((a, b) => b.gross - a.gross);
  const totalGross = sorted.reduce((a, x) => a + x.gross, 0);
  const totalHours = Math.round(sorted.reduce((a, x) => a + x.hours, 0) * 10) / 10;
  const totalVacations = sorted.reduce((a, x) => a + x.vacations, 0);
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
     <div class="mstat-box"><strong>${Math.round(totalHours / 8)}</strong><span>Vacations</span></div>
      <div class="mstat-box"><strong>${totalHours}h</strong><span>Heures totales</span></div>
      <div class="mstat-box highlight"><strong>${money(totalGross)}</strong><span>Brut total</span></div>
      <div class="mstat-box"><strong>${sorted.length}</strong><span>Productions</span></div>
    </div>
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
              <div class="missions-legend-detail">${p.count} mission${p.count > 1 ? "s" : ""} · ${p.hours}h</div>
            </div>
            <div class="missions-legend-pct">${totalGross > 0 ? Math.round((p.gross / totalGross) * 100) : 0}%</div>
            <div class="missions-legend-amount">${money(p.gross)}</div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
  bindAddBtn();
  _bindMissionsPeriod();
}

function openProductionMissions(productionName) {
  const allMissionsEl = $("allMissions");
  if (!allMissionsEl) return;
  if ($("missionsGraphContainer")) $("missionsGraphContainer").style.display = "none";
const list = missions.filter((m) => normalizeProductionName(m.production || "Sans production") === productionName).sort((a, b) => new Date(b.date) - new Date(a.date));  allMissionsEl.innerHTML = `
    <div class="production-detail-head" style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
      <button class="ghost" type="button" data-production-back>‹ Retour</button>
      <div><h2 style="margin:0;color:#1F4E5F;">${escapeHtml(productionName)}</h2><p class="sub" style="margin:2px 0 0;">${list.length} mission${list.length > 1 ? "s" : ""} enregistrée${list.length > 1 ? "s" : ""}</p></div>
    </div>
    <div class="mission-card-grid">
      ${list.map((mission) => `
       <div class="mission-history-card">
          <div class="mission-history-head"><strong>${ICO.doc}${escapeHtml(mission.production)}</strong><span class="pill">${escapeHtml(mission.type)}</span></div>
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
function moveMonth(amount) {
  current.setMonth(current.getMonth() + amount);
  current.setDate(1);
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
    </div>
    <div class="new-cal-daynames"><div>L</div><div>M</div><div>M</div><div>J</div><div>V</div><div>S</div><div>D</div></div>
    <div class="new-cal-grid" id="calendar"></div>
    <div id="calendarDayPanel"></div>
    <div class="new-mission-section">
      <div class="cal-sec-tabs">
        <button type="button" class="cal-sec-tab on" data-calsec="missions">Mes missions du mois</button>
        <button type="button" class="cal-sec-tab" data-calsec="notes">Notes perso</button>
      </div>
      <div id="calMissionsPane">
        <div class="new-mission-header">
          <span class="new-mission-page" id="calMissionPageInfo"></span>
        </div>
        <div id="calMissionCards"></div>
        <div class="new-mission-pagination">
          <button class="new-pag-btn" id="calMissionPrev" type="button">‹</button>
          <button class="new-pag-btn" id="calMissionNext" type="button">›</button>
        </div>
      </div>
      <div id="calNotesPane" style="display:none;">
        <div id="calNoteCards"></div>
      </div>
    </div>
  `;
  $("calendarPrevBtn").addEventListener("click", () => moveMonth(-1));
  $("calendarNextBtn").addEventListener("click", () => moveMonth(1));
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
      const isFuture = missionsOfDay.some((m) => new Date(m.date + "T00:00:00") >= todayDateOnly());
      const isPast = missionsOfDay.some((m) => new Date((m.endDate || m.date) + "T00:00:00") < todayDateOnly());
      if (isPast) box.classList.add("has-done");
      if (isFuture) box.classList.add("has-planned");
      const _phex = getProductionColorHex(normalizeProductionName(missionsOfDay[0].production));
      const _pg = prodGradient(missionsOfDay[0].production, isFuture);
      if (_pg) box.style.setProperty('background', _pg, 'important');
      let dayHours = 0, dayGross = 0;
      missionsOfDay.forEach((m) => {
        const nbDays = missionDayCount(m);
        dayHours += Number(m.hours || 0) / nbDays;
        dayGross += Number(m.gross || 0) / nbDays;
      });
      dayHours = Math.round(dayHours * 10) / 10;
      dayGross = Math.round(dayGross);
      const label = missionsOfDay.length > 1 ? missionsOfDay.length + " miss." : getProductionInitials(missionsOfDay[0].production);
      box.innerHTML = `<span class="new-cal-num">${d}</span><div class="new-cal-tag ${isFuture ? "tag-planned" : "tag-done"}"><span class="new-cal-tag-prod">${escapeHtml(label)}</span><span class="new-cal-tag-meta">${dayHours}h · ${money(dayGross)}</span></div>`;
      if (_phex) { const _tc = prodTextColor(_phex); box.querySelectorAll('.new-cal-num,.new-cal-tag-prod,.new-cal-tag-meta').forEach(el => el.style.setProperty('color', _tc, 'important')); }
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
  calMissionPage = 0;
  renderCalMissions();
}

function renderCalMissions() {
  const list = monthMissions(current).sort((a, b) => new Date(a.date) - new Date(b.date));
  const total = Math.max(1, Math.ceil(list.length / CAL_MISSIONS_PER_PAGE));
  if (calMissionPage >= total) calMissionPage = total - 1;
  if (calMissionPage < 0) calMissionPage = 0;
  const pageInfo = $("calMissionPageInfo"), cards = $("calMissionCards"), prevBtn = $("calMissionPrev"), nextBtn = $("calMissionNext");
  if (!cards) return;
  if (pageInfo) pageInfo.textContent = total > 1 ? `${calMissionPage + 1} / ${total}` : "";
  if (prevBtn) { prevBtn.disabled = calMissionPage === 0; prevBtn.onclick = () => { calMissionPage--; renderCalMissions(); }; }
  if (nextBtn) { nextBtn.disabled = calMissionPage >= total - 1; nextBtn.onclick = () => { calMissionPage++; renderCalMissions(); }; }
  const visible = list.slice(calMissionPage * CAL_MISSIONS_PER_PAGE, (calMissionPage + 1) * CAL_MISSIONS_PER_PAGE);
  if (!visible.length) { cards.innerHTML = `<div class="empty">Aucune mission ce mois.</div>`; return; }
cards.innerHTML = visible.map((m) => {
    const isFuture = new Date(m.date + "T00:00:00") >= todayDateOnly();
    const _ch = getProductionColorHex(normalizeProductionName(m.production));
    return `
      <div class="new-mission-card ${isFuture ? "planned" : "done"}" data-calendar-date="${escapeHtml(m.date)}" style="cursor:pointer;${_ch ? `border-left-color:${_ch} !important;` : ''}">
        <div class="new-mission-body"><div class="new-mission-prod">${ICO.doc}${escapeHtml((m.production||'').toUpperCase())}</div>${(m.emission||'').trim() ? `<div class="new-mission-emission">${ICO.camera}${escapeHtml(m.emission.trim())}</div>` : ''}${(m.lieu||'').trim() ? `<div class="new-mission-lieu">${ICO.pin}${escapeHtml(m.lieu.trim())}</div>` : ''}<div class="new-mission-dates">${ICO.cal}${escapeHtml(formatPeriod(m.date, m.endDate))}</div></div>
        <div class="new-mission-right"><span class="new-mission-hours">${ICO.clock}${m.hours}h</span><span class="new-mission-type ${isFuture ? "type-planned" : "type-done"}">${escapeHtml(m.type)}</span></div>
      </div>
    `;
  }).join("");
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
          return `<div class="calendar-day-mission"><div><strong>${ICO.doc}${escapeHtml(mission.production)}</strong><span>${escapeHtml(mission.type)} · ${dailyHours}h · ${money(dailyGross)}</span></div><div class="calendar-day-actions"><button class="ghost" type="button" data-edit="${escapeHtml(mission.id)}">Modifier</button><button class="delete" type="button" data-delete="${escapeHtml(mission.id)}">X</button></div></div>`;
        }).join("")}
      </div>
    </div>
  `;
}

function resetMissionFormForDate(dateStr) {
  editingMissionId = null;
  if (typeof switchAddTab === 'function') switchAddTab('mission');
  if ($("missionForm")) $("missionForm").reset();
  if ($("production")) $("production").value = ""; if (typeof syncProdColorPicker === 'function') syncProdColorPicker();
  if ($("type")) $("type").value = (getCustomPostes()[0]) || "Montage";
  if (typeof _syncTypeBtn === "function") _syncTypeBtn();
  if ($("date")) $("date").value = dateStr;
  if ($("endDate")) $("endDate").value = dateStr;
  if ($("hours")) $("hours").value = "";
  if ($("gross")) $("gross").value = "";
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

function switchAddTab(tab){
  document.querySelectorAll('.add-tab').forEach(function(b){ b.classList.toggle('on', b.dataset.addtab===tab); });
  const mf=$("missionForm"), nf=$("noteForm");
  if(mf) mf.style.display = tab==='note' ? 'none' : '';
  if(nf) nf.style.display = tab==='note' ? '' : 'none';
  const t=$("addMissionTitle"); if(t) t.textContent = tab==='note' ? 'Ajouter une note' : 'Ajouter une mission';
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
function resetNoteFormForDate(dateStr){
  editingNoteId = null;
  if($("noteForm")) $("noteForm").reset();
  if($("noteTitle")) $("noteTitle").value = "";
  if($("noteText")) $("noteText").value = "";
  if($("noteDate")) $("noteDate").value = dateStr;
  if($("noteEndDate")) $("noteEndDate").value = dateStr;
  selectedNoteColor = '#1E6FE0';
  if(typeof _renderNoteColors==='function') _renderNoteColors();
  if($("noteCount")) $("noteCount").textContent = "0 / 200";
  const sb=document.querySelector("#noteForm button[type='submit']"); if(sb) sb.textContent="Enregistrer la note";
}
function saveNote(event){
  if(event) event.preventDefault();
  const title=($("noteTitle").value||'').trim() || 'Note';
  const text=($("noteText").value||'').trim();
  if(!text){ toast("Écris ta note (courte)."); return; }
  const d=$("noteDate").value, e=$("noteEndDate").value||d;
  if(!d){ toast("Choisis une date pour la note."); return; }
  if(e<d){ toast("La date de fin ne peut pas être avant le début."); return; }
  const arr=getNotes();
  if(editingNoteId){ const i=arr.findIndex(function(n){return n.id===editingNoteId;}); if(i>=0) arr[i]=Object.assign({}, arr[i], {date:d,endDate:e,title:title,text:text,color:selectedNoteColor}); }
  else { arr.push({ id:'n'+Date.now().toString(36)+Math.random().toString(36).slice(2,6), date:d, endDate:e, title:title, text:text, color:selectedNoteColor }); }
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
  if($("noteDate")) $("noteDate").value=n.date;
  if($("noteEndDate")) $("noteEndDate").value=n.endDate||n.date;
  selectedNoteColor=n.color||'#1E6FE0';
  if(typeof _renderNoteColors==='function') _renderNoteColors();
  if($("noteCount")) $("noteCount").textContent = (n.text||'').length + " / 200";
  const sb=document.querySelector("#noteForm button[type='submit']"); if(sb) sb.textContent="Modifier la note";
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
  st.textContent="#dayModalOverlay{position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;align-items:flex-end;justify-content:center;z-index:100040;}#dayModalOverlay.open{display:flex;}.dm-box{background:var(--card);color:var(--text);border-radius:22px 22px 0 0;width:100%;max-width:560px;max-height:90vh;overflow-y:auto;box-sizing:border-box;padding:22px 22px 30px;box-shadow:0 -10px 40px rgba(0,0,0,.3);}@media(min-width:600px){#dayModalOverlay{align-items:center;padding:18px;}.dm-box{border-radius:20px;max-width:440px;max-height:88vh;}}.dm-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;}.dm-date{font-size:17px;font-weight:900;color:var(--petrol);text-transform:capitalize;}.dm-x{background:none;border:none;font-size:20px;color:var(--muted);cursor:pointer;}.dm-acts{display:flex;gap:10px;margin-bottom:8px;}.dm-act{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;padding:16px 8px;border-radius:14px;border:1.5px solid var(--line);background:var(--card);cursor:pointer;font-weight:800;font-size:13px;color:var(--text);}.dm-act .ic{font-size:24px;}.dm-act.mission{border-color:rgba(31,78,95,.35);}.dm-act.note{border-color:rgba(245,158,11,.45);}.dm-sec-t{font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin:16px 0 8px;}.dm-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--line);border-left-width:4px;border-radius:10px;margin-bottom:8px;}.dm-item .nm{flex:1;min-width:0;}.dm-item .nm strong{font-size:13px;color:var(--petrol);display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.dm-item .nm span{font-size:11.5px;color:var(--muted);display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;}.dm-item .acts{display:flex;gap:6px;flex-shrink:0;}.dm-item button{border:none;background:var(--soft);color:var(--petrol);border-radius:8px;padding:6px 10px;font-size:11.5px;font-weight:700;cursor:pointer;}.dm-item button.del{background:rgba(220,38,38,.12);color:#DC2626;}";
  document.head.appendChild(st);
  const ov=document.createElement('div');
  ov.id='dayModalOverlay';
  ov.innerHTML="<div class=\"dm-box\" id=\"dmBox\"></div>";
  document.body.appendChild(ov);
  ov.addEventListener('click', function(e){
    if(e.target===ov || (e.target.closest && e.target.closest('#dmClose'))){ ov.classList.remove('open'); return; }
    if(e.target.closest && e.target.closest('#dmAddMission')){ ov.classList.remove('open'); addMissionReturnView='calendar'; activateView('add-mission'); switchAddTab('mission'); resetMissionFormForDate(_dayModalDate); window.scrollTo({top:0,behavior:'smooth'}); return; }
    if(e.target.closest && e.target.closest('#dmAddNote')){ ov.classList.remove('open'); addMissionReturnView='calendar'; activateView('add-mission'); switchAddTab('note'); resetNoteFormForDate(_dayModalDate); window.scrollTo({top:0,behavior:'smooth'}); return; }
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
  html+="<div class=\"dm-acts\"><button class=\"dm-act mission\" id=\"dmAddMission\" type=\"button\"><span class=\"ic\"><svg viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"2\" y=\"7\" width=\"20\" height=\"14\" rx=\"2\"/><path d=\"M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"/></svg></span>Ajouter une mission</button><button class=\"dm-act note\" id=\"dmAddNote\" type=\"button\"><span class=\"ic\"><svg viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5 3h9l5 5v13H5z\"/><path d=\"M14 3v5h5\"/><path d=\"M8 13.5h7M8 17h5\"/></svg></span>Note perso</button></div>";
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

function buildActualisationText() {
  const list = monthMissions(current).filter((m) => new Date(m.date + "T00:00:00") <= todayDateOnly()).sort((a, b) => new Date(a.date) - new Date(b.date));
  const title = current.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const totalHours = Math.round(sumDone(list) * 10) / 10;
  const totalGross = list.reduce((a, x) => a + Number(x.gross || 0), 0);
  const totalDays = sumMissionDays(list);
  const lines = [`Actualisation ${title}`, "", `Total journées : ${totalDays}`, `Total heures : ${totalHours}h`, `Total brut : ${money(totalGross)}`, ""];
  list.forEach((mission, index) => { lines.push(`${index + 1}. ${mission.production}`); lines.push(`Période : ${formatPeriod(mission.date, mission.endDate)}`); lines.push(`Mission : ${mission.type}`); lines.push(`Heures : ${mission.hours}h`); lines.push(`Brut : ${money(mission.gross)}`); lines.push(""); });
  return lines.join("\n");
}

function renderActualisation() {
  if (!$("actualisationMonthPicker")) return;
  const list = monthMissions(current)
    .filter((m) => new Date(m.date + "T00:00:00") <= todayDateOnly())
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const totalHours = Math.round(sumDone(list) * 10) / 10;
  const totalGross = list.reduce((a, x) => a + Number(x.gross || 0), 0);
  const totalVac = list.reduce((a, x) => a + Number(x.vacations || Math.round(Number(x.hours || 0) / 8)), 0);

  $("actualisationMonthPicker").value = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
  if ($("actualisationMonthTitle")) $("actualisationMonthTitle").textContent = current.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  if ($("actualisationCount")) $("actualisationCount").textContent = list.length;
  if ($("actualisationHours")) $("actualisationHours").textContent = totalHours + "h";
  if ($("actualisationGross")) $("actualisationGross").textContent = money(totalGross);
  if ($("actualisationVac")) $("actualisationVac").textContent = totalVac;

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
  const rows = list.map((mission) => `<tr><td>${escapeHtml(formatPeriod(mission.date, mission.endDate))}</td><td><strong>${ICO.doc}${escapeHtml(mission.production)}</strong></td><td>${escapeHtml(mission.type)}</td><td>${escapeHtml(mission.hours)}h</td><td>${escapeHtml(money(mission.gross))}</td></tr>`).join("");
  const win = window.open("", "_blank");
  if (!win) { toast("Impossible d'ouvrir la fenêtre PDF. Autorise les pop-ups pour ce site."); return; }
  win.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"/><title>Actualisation ${escapeHtml(title)}</title><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#2D3748;background:#fff;padding:34px}.header{border-bottom:3px solid #1F4E5F;padding-bottom:16px;margin-bottom:22px}h1{margin:0;color:#1F4E5F;font-size:28px;letter-spacing:-.03em}.subtitle{color:#718096;margin:6px 0 0;font-size:14px}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:22px 0 24px}.summary-box{border:1px solid #E2E8F0;border-radius:14px;padding:14px;background:#F8FAF9}.summary-box strong{display:block;color:#1F4E5F;font-size:24px;line-height:1.1}.summary-box span{display:block;margin-top:4px;color:#718096;font-size:12px;text-transform:uppercase;font-weight:700}table{width:100%;border-collapse:collapse;margin-top:10px}th{text-align:left;color:#718096;font-size:12px;text-transform:uppercase;letter-spacing:.03em;padding:10px 8px;border-bottom:2px solid #E2E8F0}td{padding:12px 8px;border-bottom:1px solid #E2E8F0;font-size:14px;vertical-align:top}tr:nth-child(even) td{background:#FBFCFC}.footer{margin-top:26px;padding-top:12px;border-top:1px solid #E2E8F0;font-size:12px;color:#718096;line-height:1.45}@media print{body{padding:20px}.summary-box,tr:nth-child(even) td{print-color-adjust:exact;-webkit-print-color-adjust:exact}}</style></head><body><div class="header"><h1>Récapitulatif actualisation</h1><p class="subtitle">${escapeHtml(title)} · Généré avec Intermitrack</p></div><div class="summary"><div class="summary-box"><strong>${escapeHtml(totalDays)}</strong><span>Journées</span></div><div class="summary-box"><strong>${escapeHtml(totalHours)}h</strong><span>Heures</span></div><div class="summary-box"><strong>${escapeHtml(money(totalGross))}</strong><span>Brut total</span></div></div>${list.length ? `<table><thead><tr><th>Période</th><th>Production</th><th>Mission</th><th>Heures</th><th>Brut</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="empty">Aucune mission effectuée sur ce mois.</div>`}<p class="footer">Ce document est un récapitulatif personnel destiné à faciliter l'actualisation mensuelle. Les informations doivent être vérifiées par l'utilisateur avant déclaration officielle.</p></body></html>`);
  win.document.close(); win.focus(); win.print();
}


function applyTheme(theme) {
  document.body.classList.remove("theme-dark");
  if (theme === "dark") document.body.classList.add("theme-dark");
  if (typeof render === "function") render();
}

function setupEvents() {
  $("loginModeBtn").addEventListener("click", () => setAuthMode("login"));
  $("signupModeBtn").addEventListener("click", () => setAuthMode("signup"));
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
    if (authMode === "signup" && password.length < 6) { $("authMsg").textContent = "Le mot de passe doit contenir au moins 6 caractères."; return; }
    let result;
    if (authMode === "signup") result = await sb.auth.signUp({ email, password });
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
  if ($("kmRate")) $("kmRate").addEventListener("input", () => { if ($("kmRate").value && $("kmCv")) $("kmCv").value = ""; updateKmPreview(); });
  if ($("saveAreAdmissionDateBtn")) {
    $("saveAreAdmissionDateBtn").addEventListener("click", async () => {
      const value = $("areAdmissionDate").value;
      localStorage.setItem(storageKey("areAdmissionDate"), value);
      areAdmissionDate = value;
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
  attachAddressAutocomplete($("kmFrom"));
  attachAddressAutocomplete($("kmTo"));
  attachAddressAutocomplete($("aeProfAdresse"));
  attachAddressAutocomplete($("aeClientAddress"));
  attachAddressAutocomplete($("societeAdresse"));
  // Choisir une puissance fiscale prime le taux manuel
  if ($("kmCv")) $("kmCv").addEventListener("change", updateKmPreview);
  if ($("kmTranche")) $("kmTranche").addEventListener("change", updateKmPreview);
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

  const tabsWrap = document.querySelector(".tabs-wrap");
  const tabsNav = document.querySelector(".tabs");
  if (tabsWrap && tabsNav) {
    const updateSwipeHints = () => {
      const maxScroll = tabsNav.scrollWidth - tabsNav.clientWidth;
      tabsWrap.classList.toggle("can-left", tabsNav.scrollLeft > 5);
      tabsWrap.classList.toggle("can-right", tabsNav.scrollLeft < maxScroll - 5);
    };
    tabsNav.addEventListener("scroll", updateSwipeHints);
    window.addEventListener("resize", updateSwipeHints);
    updateSwipeHints();
  }
 
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
 
  document.addEventListener("click", async (event) => {
    const docProductionOpen = event.target.closest("[data-doc-production-open]");
    if (docProductionOpen) { openDocumentProduction = docProductionOpen.dataset.docProductionOpen; documentFilter = "Tous"; renderDocuments(); return; }
    const docProductionBack = event.target.closest("[data-doc-production-back]");
    if (docProductionBack) { openDocumentProduction = null; documentFilter = "Tous"; renderDocuments(); return; }
    const docFilterButton = event.target.closest("[data-doc-filter]");
    if (docFilterButton) { documentFilter = docFilterButton.dataset.docFilter; renderDocuments(); return; }
    const calendarDay = event.target.closest("[data-calendar-date]");
    if (calendarDay) { openCalendarDay(calendarDay.dataset.calendarDate); return; }
    const calendarAddButton = event.target.closest("[data-calendar-add-date]");
    if (calendarAddButton) { addMissionReturnView = "calendar"; activateView("add-mission"); resetMissionFormForDate(calendarAddButton.dataset.calendarAddDate); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    const productionOpenButton = event.target.closest("[data-production-open]");
    if (productionOpenButton) { openProductionMissions(productionOpenButton.dataset.productionOpen); return; }
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
    const themeBtn = e.target.closest(".theme-btn");
    if (themeBtn) {
      const theme = themeBtn.dataset.theme;
      applyTheme(theme);
      localStorage.setItem("intermitrack_theme", theme);
      document.querySelectorAll(".theme-btn").forEach(b =>
        b.classList.toggle("active", b.dataset.theme === theme));
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
  currentUser = session?.user || null;
  if (currentUser) { showApp(); loadMissions(); loadDocuments(); maybeShowWhatsNew(); }
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
    const { data } = await sb.from('profiles').select('annexe,postes,droits_ouverts,taux_journalier,taux_impot,are_date,production_colors,notes,ae_custom_presta,custom_postes').eq('id', currentUser.id).maybeSingle();
    _profil = data || null;
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
  }catch(e){ _profil = null; }
}

function _profilEnsureDom(){
  if(document.getElementById('profilOverlay')) return;
  const st = document.createElement('style');
  st.textContent = "#profilOverlay,#profilIntroOverlay{position:fixed;inset:0;background:rgba(0,0,0,.45);display:none;align-items:center;justify-content:center;z-index:100002;padding:16px;}#profilOverlay.open,#profilIntroOverlay.open{display:flex;}.pf-box{background:#fff;border-radius:20px;max-width:480px;width:100%;max-height:90vh;overflow-y:auto;padding:24px;box-shadow:0 24px 60px rgba(0,0,0,.25);font-family:inherit;}.pf-title{font-size:19px;font-weight:800;color:#1F4E5F;margin:0 0 4px;}.pf-sub{font-size:13px;color:#718096;margin:0 0 18px;line-height:1.5;}.pf-label{font-size:13px;font-weight:700;color:#2D3748;margin:16px 0 8px;}.pf-seg{display:flex;gap:8px;flex-wrap:wrap;}.pf-opt{padding:9px 14px;border:1px solid #E2E8F0;background:#fff;color:#1F4E5F;border-radius:11px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;}.pf-opt.on{background:#1F4E5F;color:#fff;border-color:#1F4E5F;}.pf-input{width:100%;padding:11px 13px;border:1px solid #E2E8F0;border-radius:11px;font-size:14px;font-family:inherit;box-sizing:border-box;}.pf-actions{display:flex;gap:10px;margin-top:22px;}.pf-cancel{flex:1;padding:13px;border:1px solid #E2E8F0;background:#F5F7F6;color:#718096;border-radius:12px;font-weight:700;cursor:pointer;font-family:inherit;}.pf-ok{flex:1;padding:13px;border:none;background:#1F4E5F;color:#fff;border-radius:12px;font-weight:800;cursor:pointer;font-family:inherit;}.pf-hint{font-size:11px;color:#9AA5B1;margin-top:6px;}";
  document.head.appendChild(st);

  const ov = document.createElement('div');
  ov.id = 'profilOverlay';
  ov.innerHTML = '<div class="pf-box">'
    + '<div class="pf-title">📝 Mes informations</div>'
    + '<div class="pf-sub">Optionnel — ça pré-remplit tes missions et permet de calculer ton revenu mensuel. Modifiable à tout moment ici.</div>'
    + '<div class="pf-label">Tu es plutôt…</div>'
    + '<div class="pf-seg" id="pfAnnexe"><button type="button" class="pf-opt" data-annexe="technicien">Technicien (annexe 8)</button><button type="button" class="pf-opt" data-annexe="artiste">Artiste (annexe 10)</button><button type="button" class="pf-opt" data-annexe="les_deux">Les deux</button></div>'
    + '<div class="pf-label">Tes postes <span style="font-weight:400;color:#9AA5B1;">— le 1er = défaut sur tes missions</span></div>'
    + '<div class="pf-seg" id="pfPostes"></div>'
    + '<div style="display:flex;gap:8px;margin-top:8px;"><input type="text" id="pfNewPoste" class="pf-input" placeholder="Ex : Clown, Cascadeur…" style="flex:1;"/><button type="button" class="pf-ok" id="pfAddPoste" style="flex:0 0 auto;padding:11px 16px;">Ajouter</button></div>'
    + '<div class="pf-label">As-tu déjà ouvert tes droits ?</div>'
    + '<div class="pf-seg" id="pfDroits"><button type="button" class="pf-opt" data-droits="oui">Oui</button><button type="button" class="pf-opt" data-droits="non">Pas encore</button></div>'
    + '<div id="pfAjWrap" style="display:none;"><div class="pf-label">Ton taux journalier (AJ)</div><input type="number" id="pfAj" class="pf-input" placeholder="Ex : 67.60" min="0" step="0.01"/><div class="pf-hint">L\'allocation journalière nette de ta notification France Travail. Sert au calcul du revenu mensuel.</div><div class="pf-label">Ton taux d\'imposition (prélèvement à la source)</div><input type="number" id="pfImpot" class="pf-input" placeholder="Ex : 8.6" min="0" max="100" step="0.1"/><div class="pf-hint">En %, celui de ta notification / tes paies. Pour estimer ton allocation nette d\'impôt. Optionnel.</div></div>'
    + '<div class="pf-actions"><button type="button" class="pf-cancel" id="pfCancel">Fermer</button><button type="button" class="pf-ok" id="pfSave">Enregistrer</button></div>'
    + '</div>';
  document.body.appendChild(ov);
  ov.addEventListener('click', function(e){ if(e.target===ov) ov.classList.remove('open'); });

  const intro = document.createElement('div');
  intro.id = 'profilIntroOverlay';
  intro.innerHTML = '<div class="pf-box" style="max-width:420px;">'
    + '<div style="font-size:40px;text-align:center;margin-bottom:8px;">👋</div>'
    + '<div class="pf-title" style="text-align:center;">Une nouveauté pour toi</div>'
    + '<div class="pf-sub" style="text-align:center;">Tu peux maintenant remplir <b>« Mes informations »</b> (annexe, poste, taux journalier).<br/><br/>C\'est <b>optionnel</b> — ça sert à <b>pré-remplir tes missions</b> et à <b>calculer ton revenu mensuel</b>.<br/><br/>Tu le retrouveras quand tu veux dans ton <b>menu en haut à droite → Mes informations</b>.</div>'
    + '<div class="pf-actions"><button type="button" class="pf-cancel" id="pfIntroLater">Plus tard</button><button type="button" class="pf-ok" id="pfIntroFill">Remplir maintenant</button></div>'
    + '</div>';
  document.body.appendChild(intro);

  ov.querySelector('#pfAnnexe').addEventListener('click', function(e){ var b=e.target.closest('[data-annexe]'); if(!b)return; ov.querySelectorAll('#pfAnnexe .pf-opt').forEach(function(x){x.classList.remove('on');}); b.classList.add('on'); _profilRenderPostes(b.dataset.annexe); });
  ov.querySelector('#pfDroits').addEventListener('click', function(e){ var b=e.target.closest('[data-droits]'); if(!b)return; ov.querySelectorAll('#pfDroits .pf-opt').forEach(function(x){x.classList.remove('on');}); b.classList.add('on'); document.getElementById('pfAjWrap').style.display = b.dataset.droits==='oui'?'block':'none'; });
  document.getElementById('pfCancel').addEventListener('click', function(){ ov.classList.remove('open'); });
  document.getElementById('pfSave').addEventListener('click', _profilSave);
  ov.querySelector('#pfPostes').addEventListener('click', function(e){ var d=e.target.closest && e.target.closest('[data-delposte]'); if(d){ e.stopPropagation(); removeCustomPoste(d.dataset.delposte); _profilRenderPostes(); } });
  document.getElementById('pfAddPoste').addEventListener('click', _profilAddPoste);
  document.getElementById('pfNewPoste').addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); _profilAddPoste(); } });
  document.getElementById('pfIntroLater').addEventListener('click', function(){ localStorage.setItem('intermitrack_profil_intro_v1','1'); intro.classList.remove('open'); });
  document.getElementById('pfIntroFill').addEventListener('click', function(){ localStorage.setItem('intermitrack_profil_intro_v1','1'); intro.classList.remove('open'); openProfilModal(); });
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
  document.getElementById('pfAj').value = (_profil && _profil.taux_journalier!=null) ? _profil.taux_journalier : '';
  document.getElementById('pfImpot').value = (_profil && _profil.taux_impot!=null) ? _profil.taux_impot : '';
  ov.classList.add('open');
}

async function _profilSave(){
  if(!currentUser) return;
  var ov = document.getElementById('profilOverlay');
  var aBtn = ov.querySelector('#pfAnnexe .pf-opt.on');
  var dBtn = ov.querySelector('#pfDroits .pf-opt.on');
  var droits = dBtn ? (dBtn.dataset.droits==='oui') : null;
  var p = {
    annexe: aBtn ? aBtn.dataset.annexe : null,
    postes: getCustomPostes(),
    droits_ouverts: droits,
    taux_journalier: droits===true ? (Number(document.getElementById('pfAj').value)||null) : null,
    taux_impot: droits===true ? (Number(document.getElementById('pfImpot').value)||null) : null
  };
  var res = await sb.from('profiles').upsert(Object.assign({ id: currentUser.id }, p), { onConflict:'id' });
  if(res.error){ if(typeof toast==='function') toast('Erreur : '+res.error.message); return; }
  _profil = p;
  ov.classList.remove('open');
  if(typeof toast==='function') toast('Infos enregistrées ✅');
}

function _profilShowIntroIfNeeded(){
  if(localStorage.getItem('intermitrack_profil_intro_v1')) return;
  _profilEnsureDom();
  setTimeout(function(){ var i=document.getElementById('profilIntroOverlay'); if(i) i.classList.add('open'); }, 900);
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
function _syncTypeBtn(){ var l=document.getElementById('typeBtnLabel'); var t=document.getElementById('type'); if(l && t) l.textContent = t.value || 'Choisir…'; }
function _renderTypePicker(ov){
  var base = ['Montage','Tournage','Démontage'];
  var customs = getCustomPostes();
  var html = '<div class="pf-box"><div class="pf-title">Type de mission</div>';
  html += '<div class="pf-seg">' + base.map(function(p){ return '<button type="button" class="pf-opt" data-type="'+escapeHtml(p)+'">'+escapeHtml(p)+'</button>'; }).join('') + '</div>';
  if(customs.length){ html += '<div class="pf-label">Mes postes</div><div class="pf-seg">' + customs.map(function(p){ return '<button type="button" class="pf-opt pf-opt-custom" data-type="'+escapeHtml(p)+'">'+escapeHtml(p)+'<span class="pf-opt-del" data-delposte="'+escapeHtml(p)+'">×</span></button>'; }).join('') + '</div>'; }
  html += '<div class="pf-label">Ajouter un poste</div><div class="pf-addrow"><input type="text" id="newPosteInput" placeholder="Ex : Clown, Cascadeur…" autocomplete="off"><button type="button" id="addPosteBtn">Ajouter</button></div>';
  html += '<div class="pf-actions"><button type="button" class="pf-cancel" id="typePickClose">Fermer</button></div></div>';
  ov.innerHTML = html;
  var cur = document.getElementById('type') ? document.getElementById('type').value : '';
  ov.querySelectorAll('.pf-opt').forEach(function(x){ x.classList.toggle('on', x.dataset.type===cur); });
}
function _typePickerAddFromInput(ov){
  var inp = document.getElementById('newPosteInput'); var v = (inp && inp.value || '').trim();
  if(!v) return;
  addCustomPoste(v);
  var t = document.getElementById('type'); if(t) t.value = v; _syncTypeBtn();
  ov.style.display='none';
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
      if(b){ var t=document.getElementById('type'); if(t) t.value = b.dataset.type; _syncTypeBtn(); ov.style.display='none'; }
    });
    ov.addEventListener('keydown', function(e){ if(e.key==='Enter' && e.target.id==='newPosteInput'){ e.preventDefault(); _typePickerAddFromInput(ov); } });
  }
  _renderTypePicker(ov);
  ov.style.display='flex';
}
(function(){
  function wire(){ var tb=document.getElementById('typeBtn'); if(tb && !tb.dataset.init){ tb.dataset.init='1'; tb.addEventListener('click', _openTypePicker); _syncTypeBtn(); } }
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
