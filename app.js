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
  "DUSHOW TV": "DUSHOW","DUSHOW SAS": "DUSHOW",
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
  "MEDIAWAN","NEWEN","M6","DUSHOW","BLIVE","NOVELTY","SATEL","BBC",
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

function calculateKmAmount() {
  const distance = Number($("kmDistance")?.value || 0);
  const rate = Number($("kmRate")?.value || 0);
  return Math.round(distance * rate * 100) / 100;
}

function updateKmPreview() {
  const preview = $("kmPreview");
  if (!preview) return;
  preview.textContent = "Frais km estimés : " + money(calculateKmAmount());
}

// Distance à vol d'oiseau (km) entre deux points GPS
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// Calcule automatiquement la distance entre lieu de départ et d'arrivée
async function calcKmFromAddresses() {
  const from = ($("kmFrom")?.value || "").trim();
  const to = ($("kmTo")?.value || "").trim();
  if (!from || !to) { toast("Renseigne le lieu de départ et le lieu d'arrivée."); return; }
  const btn = $("kmCalcBtn");
  const oldLabel = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "Calcul en cours…"; }
  try {
    const geocode = async (q) => {
      const r = await fetch("https://api-adresse.data.gouv.fr/search/?limit=1&q=" + encodeURIComponent(q));
      const j = await r.json();
      if (!j.features || !j.features.length) throw new Error("Adresse introuvable : " + q);
      return j.features[0].geometry.coordinates; // [lon, lat]
    };
    const a = await geocode(from);
    const b = await geocode(to);
    let km = null;
    try {
      const rr = await fetch(`https://router.project-osrm.org/route/v1/driving/${a[0]},${a[1]};${b[0]},${b[1]}?overview=false`);
      const rj = await rr.json();
      if (rj.routes && rj.routes[0]) km = rj.routes[0].distance / 1000;
    } catch (_) { /* repli ci-dessous */ }
    if (km == null) km = haversineKm(a[1], a[0], b[1], b[0]) * 1.3; // estimation routière
    if ($("kmRoundTrip")?.checked) km *= 2;
    km = Math.round(km);
    if ($("kmDistance")) $("kmDistance").value = km;
    updateKmPreview();
    toast("Distance estimée : " + km + " km" + ($("kmRoundTrip")?.checked ? " (aller-retour)" : ""), "success");
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
  render();
}

async function logout() {
  await sb.auth.signOut();
  currentUser = null; missions = []; documents = [];
  showAuth();
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
    emission: x.emission || ""
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
  style.textContent = "#toastWrap{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:100001;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;}.toast{pointer-events:auto;min-width:200px;max-width:90vw;padding:13px 18px;border-radius:13px;font-size:13.5px;font-weight:700;color:#fff;box-shadow:0 8px 28px rgba(31,78,95,.22);display:flex;align-items:center;gap:9px;white-space:pre-line;font-family:inherit;animation:tIn .25s ease;}.toast.success{background:#2F6B47;}.toast.error{background:#DC2626;}.toast.warn{background:#1F4E5F;}.toast.out{animation:tOut .3s ease forwards;}@keyframes tIn{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:translateY(0);}}@keyframes tOut{to{opacity:0;transform:translateY(12px);}}#appConfirmOverlay{position:fixed;inset:0;background:rgba(0,0,0,.45);display:none;align-items:center;justify-content:center;z-index:100002;padding:16px;}#appConfirmOverlay.open{display:flex;}.ac-box{background:#fff;border-radius:18px;max-width:380px;width:100%;padding:22px;box-shadow:0 24px 60px rgba(0,0,0,.25);font-family:inherit;}.ac-title{font-size:16px;font-weight:800;color:#1F4E5F;margin-bottom:8px;}.ac-msg{font-size:14px;color:#2D3748;line-height:1.5;margin-bottom:20px;}.ac-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;}.ac-cancel{padding:12px;border:1px solid #E2E8F0;background:#F5F7F6;color:#718096;border-radius:11px;font-weight:700;cursor:pointer;font-family:inherit;}.ac-ok{padding:12px;border:none;background:#1F4E5F;color:#fff;border-radius:11px;font-weight:800;cursor:pointer;font-family:inherit;}";
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

  // Période de plus de 2 jours et création (pas une modification) → fenêtre de sélection des jours travaillés
  const _mdpStart = $("date").value, _mdpEnd = $("endDate").value;
  const _mdpNb = daysInclusive(new Date(_mdpStart + "T00:00:00"), new Date(_mdpEnd + "T00:00:00"));
  if (!editingMissionId && _mdpNb > 2) { openMultiDayPicker(_mdpStart, _mdpEnd); return; }
 const payload = {
    user_id: currentUser.id, production: normalizeProductionName($("production").value),
    emission: $("emission")?.value || "",
    mission_type: $("type").value, mission_date: $("date").value, end_date: $("endDate").value,
    hours: Number($("hours").value), gross_amount: Number($("gross").value),
    km_distance: Number($("kmDistance")?.value || 0), km_rate: Number($("kmRate")?.value || 0), km_amount: calculateKmAmount()
  };
  let result;
  if (editingMissionId) result = await sb.from("missions").update(payload).eq("id", editingMissionId);
  else result = await sb.from("missions").insert(payload);
  const { error } = result;
  if (error) { toast("Erreur sauvegarde : " + error.message); return; }
  await _afterMissionSave(payload.mission_date);
}

// Étapes communes après l'enregistrement d'une (ou plusieurs) mission(s)
async function _afterMissionSave(firstDate) {
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
  ov.innerHTML = '<div class="mdp-box"><div class="mdp-title">Quels jours as-tu travaillés ?</div><div class="mdp-sub" id="mdpSub"></div><div class="mdp-tools"><button type="button" class="mdp-tool" id="mdpAll">Tout cocher</button><button type="button" class="mdp-tool" id="mdpNone">Tout décocher</button></div><div class="mdp-fill">Heures par jour : <input type="number" id="mdpDefault" value="8" min="0" step="0.5" class="mdp-fill-input"/><button type="button" class="mdp-tool" id="mdpApply">Appliquer aux jours cochés</button></div><div id="mdpList"></div><div class="mdp-total" id="mdpTotal"></div><div class="mdp-actions"><button type="button" class="mdp-cancel" id="mdpCancel">Annuler</button><button type="button" class="mdp-ok" id="mdpOk">Valider</button></div></div>';
  document.body.appendChild(ov);
  ov.addEventListener("click", function(e){ if(e.target===ov) _mdpClose(); });
  document.getElementById("mdpCancel").addEventListener("click", _mdpClose);
  document.getElementById("mdpAll").addEventListener("click", function(){ _mdpSetAll(true); });
  document.getElementById("mdpNone").addEventListener("click", function(){ _mdpSetAll(false); });
  document.getElementById("mdpApply").addEventListener("click", _mdpApplyDefault);
  document.getElementById("mdpOk").addEventListener("click", _mdpValidate);
}

function openMultiDayPicker(startStr, endStr){
  _mdpEnsureDom();
  const start = new Date(startStr + "T00:00:00"), end = new Date(endStr + "T00:00:00");
  const days = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) days.push(_iso(d));
  _mdpData = {
    days: days.map(function(ds){ return { date: ds, checked: true, hours: 0 }; }),
    totalHours: Number($("hours").value) || 0,
    totalGross: Number($("gross").value) || 0,
    production: normalizeProductionName($("production").value),
    emission: $("emission") ? $("emission").value : "",
    type: $("type").value,
    km_distance: Number($("kmDistance") ? $("kmDistance").value : 0) || 0,
    km_rate: Number($("kmRate") ? $("kmRate").value : 0) || 0,
    km_amount: calculateKmAmount()
  };
  _mdpRedistribute();
  var _firstChecked = _mdpData.days.find(function(d){ return d.checked; });
  document.getElementById("mdpDefault").value = _firstChecked ? _firstChecked.hours : 8;
  document.getElementById("mdpSub").textContent = "Décoche les jours non travaillés : le total d'heures se répartit automatiquement entre les jours cochés. Tu peux aussi ajuster chaque jour à la main.";
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
    cb.addEventListener("change", function(e){ _mdpData.days[+e.target.dataset.mdpCheck].checked = e.target.checked; _mdpRedistribute(); _mdpRender(); });
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

function _mdpSetAll(val){ _mdpData.days.forEach(function(d){ d.checked = val; }); _mdpRedistribute(); _mdpRender(); }

// Applique la valeur "heures par jour" à tous les jours cochés (confort ; reste modifiable jour par jour)
function _mdpApplyDefault(){
  const v = Number(document.getElementById("mdpDefault").value) || 0;
  _mdpData.days.forEach(function(d){ if (d.checked) d.hours = v; });
  _mdpRender();
}

function _mdpClose(){ const ov = document.getElementById("mdpOverlay"); if (ov) ov.classList.remove("open"); }

async function _mdpValidate(){
  const checked = _mdpData.days.filter(function(d){ return d.checked; });
  if (!checked.length) { toast("Coche au moins un jour travaillé."); return; }
  const sumHours = checked.reduce(function(s,d){ return s + (Number(d.hours) || 0); }, 0);
  // Regrouper les jours cochés consécutifs ayant le même nombre d'heures
  const runs = [];
  let cur = null;
  for (const d of _mdpData.days){
    if (!d.checked){ cur = null; continue; }
    if (cur && d.hours === cur.hours && _isNextDay(cur.end, d.date)){ cur.end = d.date; cur.days++; }
    else { cur = { start: d.date, end: d.date, hours: d.hours, days: 1 }; runs.push(cur); }
  }
  const payloads = runs.map(function(r, idx){
    const runHours = r.hours * r.days;
    const gross = sumHours > 0 ? Math.round(_mdpData.totalGross * (runHours / sumHours)) : Math.round(_mdpData.totalGross / runs.length);
    return {
      user_id: currentUser.id, production: _mdpData.production, emission: _mdpData.emission,
      mission_type: _mdpData.type, mission_date: r.start, end_date: r.end,
      hours: runHours, gross_amount: gross,
      km_distance: idx === 0 ? _mdpData.km_distance : 0,
      km_rate: idx === 0 ? _mdpData.km_rate : 0,
      km_amount: idx === 0 ? _mdpData.km_amount : 0
    };
  });
  const grossSum = payloads.reduce(function(s,p){ return s + p.gross_amount; }, 0);
  if (payloads.length) payloads[0].gross_amount += (_mdpData.totalGross - grossSum);
  const ok = document.getElementById("mdpOk"); ok.disabled = true; ok.textContent = "Enregistrement...";
  const res = await sb.from("missions").insert(payloads);
  ok.disabled = false; ok.textContent = "Valider";
  if (res.error){ toast("Erreur sauvegarde : " + res.error.message); return; }
  _mdpClose();
  await _afterMissionSave(payloads[0].mission_date);
}

function editMission(id) {
  const mission = missions.find((m) => String(m.id) === String(id));
  if (!mission) { toast("Mission introuvable."); return; }
  editingMissionId = mission.id;
  $("production").value = mission.production || "";
  if ($("emission")) $("emission").value = mission.emission || "";
  $("type").value = mission.type || "Autre";
  $("date").value = mission.date || "";
  $("endDate").value = mission.endDate || mission.date || "";
  $("hours").value = mission.hours || 0;
  $("gross").value = mission.gross || 0;
  if ($("kmDistance")) $("kmDistance").value = mission.kmDistance || "";
  if ($("kmRate")) $("kmRate").value = mission.kmRate || "";
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
    amount: Number(x.amount || 0), status: x.status || "impayee"
  }));
  fillAeProfileForm();
  renderFactures();
}

function sumFactures(list) {
  const paid = list.filter((f) => f.status === "payee").reduce((a, f) => a + f.amount, 0);
  const pending = list.filter((f) => f.status !== "payee").reduce((a, f) => a + f.amount, 0);
  return { paid, pending, total: paid + pending };
}

function renderFactures() {
  // Mois sélectionné au format "YYYY-MM" (par défaut le mois courant)
  const monthSel = ($("aeMonth") && $("aeMonth").value) ? $("aeMonth").value : new Date().toISOString().slice(0, 7);
  const year = monthSel.slice(0, 4);
  const ms = sumFactures(factures.filter((f) => (f.date || "").slice(0, 7) === monthSel));
  const ys = sumFactures(factures.filter((f) => (f.date || "").slice(0, 4) === year));
  const taux = getAeTaux() / 100;

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
  if (!factures.length) {
    list.innerHTML = `<p class="hint" style="margin-top:12px;">Aucune facture pour le moment. Crée ta première facture ci-dessus.</p>`;
    return;
  }
  list.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px;margin-top:12px;">` + factures.map((f) => `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:14px;border:1px solid var(--border,#E5E8EB);border-radius:14px;">
      <div style="display:flex;flex-direction:column;gap:4px;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <strong>${escapeHtml(f.client)}</strong>
          <span class="pill" style="background:${f.status === "payee" ? "#E3F6E9" : "#FDF1DC"};color:${f.status === "payee" ? "#1B7F4B" : "#9A6A00"};">${f.status === "payee" ? "Payée" : "À encaisser"}</span>
        </div>
        <span style="color:#6B7280;">${escapeHtml(f.prestation)}</span>
        <small style="color:#9AA5B1;">${f.numero ? "N° " + escapeHtml(f.numero) + " · " : ""}${formatPeriod(f.date, f.endDate)}</small>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;white-space:nowrap;">
        <span style="font-weight:700;font-size:16px;">${money2(f.amount)}</span>
        <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
          <button class="ghost" type="button" data-facture-pdf="${escapeHtml(f.id)}">PDF</button>
          <button class="ghost" type="button" data-facture-edit="${escapeHtml(f.id)}">Modifier</button>
          <button class="delete" type="button" data-facture-delete="${escapeHtml(f.id)}">Supprimer</button>
        </div>
      </div>
    </div>`).join("") + `</div>`;
}

async function saveFacture(e) {
  e.preventDefault();
  if (!currentUser) { toast("Connecte-toi pour enregistrer une facture."); return; }
  const editId = $("aeEditId").value;
  const payload = {
    user_id: currentUser.id,
    client: $("aeClient").value.trim(),
    client_address: $("aeClientAddress").value.trim() || null,
    prestation: $("aePrestation").value.trim(),
    facture_date: $("aeDate").value,
    facture_end_date: $("aeEndDate").value || null,
    amount: Number($("aeAmount").value),
    status: $("aeStatus").value
  };
  if (payload.facture_end_date && payload.facture_end_date < payload.facture_date) {
    toast("La date de fin doit être après la date de début."); return;
  }
  // Numéro de facture chronologique (attribué une seule fois, à la création)
  if (!editId) {
    const yr = (payload.facture_date || "").slice(0, 4);
    const nums = factures
      .filter((f) => (f.numero || "").startsWith(yr + "-"))
      .map((f) => Number((f.numero || "").split("-")[1]) || 0);
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    payload.numero = `${yr}-${String(next).padStart(3, "0")}`;
  }
  const result = editId
    ? await sb.from("factures").update(payload).eq("id", editId)
    : await sb.from("factures").insert(payload);
  if (result.error) { toast("Erreur sauvegarde : " + result.error.message); return; }
  resetFactureForm();
  await loadFactures();
  toast("Facture enregistrée ✓", "success");
}

function resetFactureForm() {
  if ($("factureForm")) $("factureForm").reset();
  if ($("aeEditId")) $("aeEditId").value = "";
  if ($("aeFormTitle")) $("aeFormTitle").textContent = "Créer une facture";
  if ($("aeCancelEdit")) $("aeCancelEdit").style.display = "none";
  const submit = document.querySelector("#factureForm button[type='submit']");
  if (submit) submit.textContent = "Enregistrer la facture";
}

function editFacture(id) {
  const f = factures.find((x) => String(x.id) === String(id));
  if (!f) return;
  $("aeEditId").value = f.id;
  $("aeClient").value = f.client;
  $("aeClientAddress").value = f.clientAddress || "";
  $("aePrestation").value = f.prestation;
  $("aeDate").value = f.date;
  $("aeEndDate").value = f.endDate || "";
  $("aeAmount").value = f.amount;
  $("aeStatus").value = f.status;
  if ($("aeFormTitle")) $("aeFormTitle").textContent = "Modifier la facture";
  if ($("aeCancelEdit")) $("aeCancelEdit").style.display = "";
  const submit = document.querySelector("#factureForm button[type='submit']");
  if (submit) submit.textContent = "Mettre à jour la facture";
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
  if (!f) return;
  const p = aeProfile();
  if (!p.nom || !p.siret) {
    toast("Renseigne d'abord ton nom et ton SIRET dans « Mes informations ».");
    if ($("aeProfileBlock")) $("aeProfileBlock").open = true;
    return;
  }
  const nl2br = (s) => escapeHtml(s || "").replace(/\n/g, "<br>");
  const periode = formatPeriod(f.date, f.endDate);
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>Facture ${escapeHtml(f.numero || "")}</title>
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
    <h1>FACTURE</h1>
    <div class="meta">N° ${escapeHtml(f.numero || "—")}<br>Date : ${formatDate(f.date)}</div>
  </div>
  <div class="seller">
    <div class="name">${escapeHtml(p.nom)}</div>
    ${nl2br(p.adresse)}<br>SIRET : ${escapeHtml(p.siret)}<br>${escapeHtml(p.contact)}
  </div>
</div>
<div class="content">
  <div class="to">
    <div class="lbl">Facturé à</div>
    <div class="name">${escapeHtml(f.client)}</div>
    <div class="addr">${nl2br(f.clientAddress)}</div>
  </div>
  <table>
    <thead><tr><th>Prestation</th><th>Période</th><th class="amount">Montant</th></tr></thead>
    <tbody><tr><td>${escapeHtml(f.prestation)}</td><td>${escapeHtml(periode)}</td><td class="amount">${money2(f.amount)}</td></tr></tbody>
  </table>
  <div class="total-row"><span class="label">Total à régler</span><span class="val">${money2(f.amount)}</span></div>
  <div style="text-align:right;"><span class="status" style="background:${f.status === "payee" ? "#E3F6E9" : "#FDF1DC"};color:${f.status === "payee" ? "#12754A" : "#9A6A00"};">${f.status === "payee" ? "Payée" : "À régler"}</span></div>
  <div class="mentions">${escapeHtml(p.tva)}<br>En cas de retard de paiement : indemnité forfaitaire pour frais de recouvrement de 40 € (art. L441-10 et D441-5 du Code de commerce). Pas d'escompte pour paiement anticipé.</div>
  <div class="footer">Facture générée avec <b>Intermitrack</b> · intermitrack.fr</div>
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
  if ($("fiscaliteGrossPreview")) $("fiscaliteGrossPreview").textContent = "Brut annuel (missions) : " + money(yearGross);
  if ($("fiscaliteTotalRevenusPreview")) $("fiscaliteTotalRevenusPreview").textContent =
    "Total revenus bruts estimés : " + money(yearGross + arePercue + congesSpec + otherIncome);
  if ($("fiscaliteNetPreview")) $("fiscaliteNetPreview").textContent = "Net imposable estimé : " + money(netTotal);
  if ($("fiscaliteKmDeductionPreview")) $("fiscaliteKmDeductionPreview").textContent = "Frais km déduits : " + money(totalKmAmount);
  if ($("fiscaliteAbattementForfait")) $("fiscaliteAbattementForfait").textContent = money(forfait);
  if ($("fiscaliteAbattementForfaitLabel")) $("fiscaliteAbattementForfaitLabel").textContent = profil.label;
  if ($("fiscaliteAbattementReels")) $("fiscaliteAbattementReels").textContent =
    `Frais réels totaux (km + dépenses saisies + autres) : ${money(totalFraisReels)}`;

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

  if ($("fiscaliteOtherIncomePreview")) $("fiscaliteOtherIncomePreview").textContent = "Revenus complémentaires : " + money(otherIncome);
  if ($("fiscaliteTotalIncomePreview")) $("fiscaliteTotalIncomePreview").textContent = "Base imposable estimée : " + money(bestBase);
  if ($("fiscaliteCSGPreview")) $("fiscaliteCSGPreview").textContent = "CSG/CRDS non déductible (2,4%) : " + money(csgNonDed);

  if ($("fiscaliteProjectionPreview")) {
    $("fiscaliteProjectionPreview").textContent = observedMonths > 0
      ? `Projection annuelle : ${money(projectedBase)} sur ${observedMonths} mois renseigné${observedMonths > 1 ? "s" : ""}`
      : "Projection annuelle : ajoute une mission";
  }

  if (taxResult) {
    if ($("fiscaliteTaxPreview")) $("fiscaliteTaxPreview").textContent = "Impôt estimé : " + money(taxResult.estimatedTax);
    if ($("fiscaliteRatePreview")) $("fiscaliteRatePreview").textContent = "Taux moyen estimé : " + taxResult.averageRate.toFixed(1).replace(".", ",") + "%";
    if ($("fiscaliteBracketPreview")) $("fiscaliteBracketPreview").textContent = "Tranche marginale : " + Math.round(taxResult.marginalRate) + "%";
  } else {
    if ($("fiscaliteTaxPreview")) $("fiscaliteTaxPreview").textContent = "Impôt estimé : renseigne tes parts";
    if ($("fiscaliteRatePreview")) $("fiscaliteRatePreview").textContent = "Taux moyen estimé : -";
    if ($("fiscaliteBracketPreview")) $("fiscaliteBracketPreview").textContent = "Tranche marginale : -";
  }

  if ($("fiscaliteKmPreview")) $("fiscaliteKmPreview").textContent = Math.round(yearMissions.reduce((a, x) => a + Number(x.kmDistance || 0), 0)) + " km enregistrés";
  if ($("fiscaliteKmAmountPreview")) $("fiscaliteKmAmountPreview").textContent = money(totalKmAmount) + " estimés";
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
  const pl = $("productionsList"), el = $("emissionsList");
  if (pl) pl.innerHTML = uniq("production").map((v) => `<option value="${esc(v)}"></option>`).join("");
  if (el) el.innerHTML = uniq("emission").map((v) => `<option value="${esc(v)}"></option>`).join("");
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
  const doneFrac = Math.min(doneRaw / total, 1);
  const plannedFrac = Math.min(plannedRaw / total, 1 - doneFrac);
  const donePercent = Math.round(doneFrac * 100);
  const plannedPercent = Math.round(plannedFrac * 100);
  const totalPercent = Math.round((doneFrac + plannedFrac) * 100);
  const CIRC = 377;
  const doneDash = Math.min((donePercent / 100) * CIRC, CIRC);
  const plannedDash = Math.min((plannedPercent / 100) * CIRC, CIRC - doneDash);
  if (!$("chart")) return;
 const isDark = document.body.classList.contains('theme-dark');
  $("chart").innerHTML = `
 <svg viewBox="0 0 340 210" width="100%" role="img" aria-label="Arc progression heures">
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
      ${doneDash > 0 ? `<path d="M 30 165 A 120 120 0 0 1 270 165" fill="none" stroke="url(#g3done)" stroke-width="30" stroke-linecap="butt" stroke-dasharray="${doneDash} ${CIRC}" filter="url(#arcShadow)"/>` : ""}
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
            <strong>${escapeHtml(mission.production)}</strong>
            <span class="pill">${escapeHtml(mission.type)}</span>
          </div>
          <div class="mission-history-info">
            <span>📅 ${formatPeriod(mission.date, mission.endDate)}</span>
            ${mission.emission ? `<span>🎬 ${escapeHtml(mission.emission)}</span>` : ""}
            <span>🕒 ${mission.hours}h</span>
            <span>€ ${money(mission.gross)}</span>
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
let _missionsFrom = "";
let _missionsTo = "";

function _lastDayOfMonth(ym){
  const parts = ym.split("-"); const y = +parts[0], m = +parts[1];
  const d = new Date(y, m, 0).getDate();
  return ym + "-" + String(d).padStart(2, "0");
}

function _missionsInPeriod(){
  if (!_missionsFrom && !_missionsTo) return missions.slice();
  const fromStart = _missionsFrom ? _missionsFrom + "-01" : "0000-01-01";
  const toEnd = _missionsTo ? _lastDayOfMonth(_missionsTo) : "9999-12-31";
  return missions.filter(function(m){
    const s = m.date, e = m.endDate || m.date;
    return s <= toEnd && e >= fromStart;
  });
}

function _missionsPeriodBar(){
  const inp = 'padding:7px 10px;border:1px solid #E2E8F0;border-radius:9px;font-family:inherit;font-size:13px;';
  const btn = 'padding:7px 12px;border:1px solid #E2E8F0;background:#fff;color:#1F4E5F;border-radius:9px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;';
  const lbl = 'font-size:13px;color:#718096;font-weight:600;';
  return '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px;background:#F5F7F6;border:1px solid #E2E8F0;border-radius:12px;padding:10px 14px;">' +
    '<span style="font-size:12px;font-weight:800;color:#1F4E5F;text-transform:uppercase;letter-spacing:.04em;">Période</span>' +
    '<label style="' + lbl + '">Du</label>' +
    '<input type="month" id="missionsFrom" value="' + _missionsFrom + '" style="' + inp + '"/>' +
    '<label style="' + lbl + '">au</label>' +
    '<input type="month" id="missionsTo" value="' + _missionsTo + '" style="' + inp + '"/>' +
    '<button type="button" id="missionsThisYear" style="' + btn + '">Cette année</button>' +
    '<button type="button" id="missionsAllPeriod" style="' + btn + '">Tout</button>' +
    '</div>';
}

function _bindMissionsPeriod(){
  const f = $("missionsFrom"), t = $("missionsTo");
  if (f) f.addEventListener("change", function(){ _missionsFrom = f.value; renderAllMissions(); });
  if (t) t.addEventListener("change", function(){ _missionsTo = t.value; renderAllMissions(); });
  const ty = $("missionsThisYear");
  if (ty) ty.addEventListener("click", function(){ const y = new Date().getFullYear(); _missionsFrom = y + "-01"; _missionsTo = y + "-12"; renderAllMissions(); });
  const ap = $("missionsAllPeriod");
  if (ap) ap.addEventListener("click", function(){ _missionsFrom = ""; _missionsTo = ""; renderAllMissions(); });
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
    const arc = `<circle cx="100" cy="100" r="75" fill="none" stroke="${COLORS[i % COLORS.length]}" stroke-width="28" stroke-dasharray="${dash.toFixed(2)} ${CIRC.toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 100 100)" stroke-linecap="butt"/>`;
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
            <div class="missions-legend-dot" style="background:${COLORS[i % COLORS.length]}"></div>
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
          <div class="mission-history-head"><strong>${escapeHtml(mission.production)}</strong><span class="pill">${escapeHtml(mission.type)}</span></div>
          <div class="mission-history-info">
            <span>📅 ${formatPeriod(mission.date, mission.endDate)}</span>
            ${mission.emission ? `<span>🎬 ${escapeHtml(mission.emission)}</span>` : ""}
            <span>🕒 ${mission.hours}h</span>
            <span>€ ${money(mission.gross)}</span>
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
    <div class="new-cal-daynames"><div>L</div><div>M</div><div>M</div><div>J</div><div>V</div><div>S</div><div>D</div></div>
    <div class="new-cal-grid" id="calendar"></div>
    <div class="new-mission-section">
      <div class="new-mission-header">
        <span class="new-mission-title">Missions du mois</span>
        <span class="new-mission-page" id="calMissionPageInfo"></span>
      </div>
      <div id="calMissionCards"></div>
      <div class="new-mission-pagination">
        <button class="new-pag-btn" id="calMissionPrev" type="button">‹</button>
        <button class="new-pag-btn" id="calMissionNext" type="button">›</button>
      </div>
    </div>
    <div id="calendarDayPanel"></div>
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
    } else { box.innerHTML = `<span class="new-cal-num">${d}</span>`; }
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
    return `
      <div class="new-mission-card ${isFuture ? "planned" : "done"}" data-calendar-date="${escapeHtml(m.date)}" style="cursor:pointer;">
        <div class="new-mission-body"><div class="new-mission-prod">${escapeHtml(m.production)}</div><div class="new-mission-dates">${escapeHtml(formatPeriod(m.date, m.endDate))}</div></div>
        <div class="new-mission-right"><span class="new-mission-hours">${m.hours}h</span><span class="new-mission-type ${isFuture ? "type-planned" : "type-done"}">${escapeHtml(m.type)}</span></div>
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
          return `<div class="calendar-day-mission"><div><strong>${escapeHtml(mission.production)}</strong><span>${escapeHtml(mission.type)} · ${dailyHours}h · ${money(dailyGross)}</span></div><div class="calendar-day-actions"><button class="ghost" type="button" data-edit="${escapeHtml(mission.id)}">Modifier</button><button class="delete" type="button" data-delete="${escapeHtml(mission.id)}">X</button></div></div>`;
        }).join("")}
      </div>
    </div>
  `;
}

function resetMissionFormForDate(dateStr) {
  editingMissionId = null;
  if ($("missionForm")) $("missionForm").reset();
  if ($("production")) $("production").value = "";
  if ($("type")) $("type").value = "Montage";
  if ($("date")) $("date").value = dateStr;
  if ($("endDate")) $("endDate").value = dateStr;
  if ($("hours")) $("hours").value = "";
  if ($("gross")) $("gross").value = "";
  const submitBtn = document.querySelector("#missionForm button[type='submit']");
  if (submitBtn) submitBtn.textContent = "Enregistrer la mission";
}

function openCalendarDay(dateStr) {
  const missionsOfDay = missions.filter((m) => isDateInPeriod(dateStr, m));
  if (missionsOfDay.length > 0) {
    activateView("calendar");
    renderCalendarDayPanel(dateStr);
    setTimeout(() => { const panel = $("calendarDayPanel"); if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" }); }, 100);
  } else {
    addMissionReturnView = "calendar";
    activateView("add-mission");
    resetMissionFormForDate(dateStr);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
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

  $("actualisationMonthPicker").value = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
  if ($("actualisationMonthTitle")) $("actualisationMonthTitle").textContent = current.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  if ($("actualisationCount")) $("actualisationCount").textContent = list.length;
  if ($("actualisationHours")) $("actualisationHours").textContent = totalHours + "h";
  if ($("actualisationGross")) $("actualisationGross").textContent = money(totalGross);

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
      <div class="mission-history-head"><strong>${escapeHtml(mission.production)}</strong><span class="pill">${escapeHtml(mission.type)}</span></div>
      <div class="mission-history-info">
        <span>📅 ${escapeHtml(formatPeriod(mission.date, mission.endDate))}</span>
        <span>🕒 ${mission.hours}h</span>
        <span>€ ${money(mission.gross)}</span>
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
  const rows = list.map((mission) => `<tr><td>${escapeHtml(formatPeriod(mission.date, mission.endDate))}</td><td><strong>${escapeHtml(mission.production)}</strong></td><td>${escapeHtml(mission.type)}</td><td>${escapeHtml(mission.hours)}h</td><td>${escapeHtml(money(mission.gross))}</td></tr>`).join("");
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
    if (result.error) { $("authMsg").textContent = "Erreur : " + result.error.message; return; }
    if (authMode === "signup") $("authMsg").textContent = "Compte créé. Vérifiez votre boîte mail si une confirmation est demandée.";
    await init();
  });
 
  $("missionForm").addEventListener("submit", addMission);
  if ($("addMissionBackBtn")) $("addMissionBackBtn").addEventListener("click", () => activateView(addMissionReturnView));
  if ($("kmDistance")) $("kmDistance").addEventListener("input", updateKmPreview);
  if ($("kmRate")) $("kmRate").addEventListener("input", updateKmPreview);
  if ($("saveAreAdmissionDateBtn")) {
    $("saveAreAdmissionDateBtn").addEventListener("click", () => {
      const value = $("areAdmissionDate").value;
      localStorage.setItem(storageKey("areAdmissionDate"), value);
      areAdmissionDate = value;
      render();
      toast("Date d'admission ARE enregistrée.");
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

  // Frais réels
  if ($("fraisForm")) $("fraisForm").addEventListener("submit", saveFrais);
  if ($("fraisDate") && !$("fraisDate").value) $("fraisDate").value = new Date().toISOString().slice(0, 10);
  if ($("fraisList")) $("fraisList").addEventListener("click", (e) => {
    const del = e.target.closest("[data-frais-delete]");
    if (del) deleteFrais(del.getAttribute("data-frais-delete"));
  });
  if ($("facturesList")) $("facturesList").addEventListener("click", (e) => {
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
 
sb.auth.onAuthStateChange((_event, session) => {
  currentUser = session?.user || null;
  if (currentUser) { showApp(); loadMissions(); loadDocuments(); }
  else showAuth();
});
 
 
setupEvents();
init();
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
