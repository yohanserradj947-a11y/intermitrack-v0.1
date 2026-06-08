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
    await sb.from("analytics_events").insert({ user_id: currentUser.id, event_name: eventName, event_data: eventData });
  } catch (error) { console.warn("Analytics non bloquant :", error.message); }
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
  const hours = Number($("areHours")?.value || 0);
  const brutTotal = Number($("areDailyGross")?.value || 0);
 
  if (!hours || !brutTotal) {
    if ($("previsionSJRText")) $("previsionSJRText").textContent = "SJR : renseigne tes données";
    if ($("previsionTaux")) $("previsionTaux").textContent = "Renseigne tes heures et ton brut total";
    if ($("previsionTauxDetails")) $("previsionTauxDetails").textContent = "Simulation indicative Annexe 8 technicien.";
    if ($("areProjectionText")) $("areProjectionText").textContent = "Renseigne tes données pour voir les projections.";
    return;
  }
 
  // ----- Paramètres officiels (Annexe 8 · technicien) À ACTUALISER CHAQUE ANNÉE -----
  const AJ_MIN = 31.96;        // allocation journalière minimale (montant de référence)
  const NH = 507;             // heures exigées
  const SMIC_H = 12.31;       // SMIC horaire brut
  const PLAFOND = 174.80;     // plafond AJ brute
  const PLANCHER = 38;        // plancher AJ brute (technicien)
  const SMIC_J = SMIC_H * 151.67 / 30; // SMIC journalier (seuil exonération CSG/CRDS)
 
  // AJ brute = A + B + C  (formule officielle, vérifiée sur notification France Travail)
  function ajBrut(h, sr) {
    const A = AJ_MIN * (0.42 * Math.min(sr, 14400) + 0.05 * Math.max(0, sr - 14400)) / 5000;
    const B = AJ_MIN * (0.26 * Math.min(h, 720) + 0.08 * Math.max(0, h - 720)) / NH;
    const C = AJ_MIN * 0.40;
    return Math.max(PLANCHER, Math.min(PLAFOND, A + B + C));
  }
  // AJ nette = brute − retraite 3% − CSG 6,2% − CRDS 0,5% (avec abattement 1,75%
  //           et plancher : pas de CSG/CRDS si l'AJ passe sous le SMIC journalier)
  function ajNet(brut) {
    const retraite = brut * 0.03;
    const base = brut * 0.9825;
    let csg = base * 0.062, crds = base * 0.005;
    if (brut - retraite - csg - crds < SMIC_J) { csg = 0; crds = 0; }
    return brut - retraite - csg - crds;
  }
 
  const brut = ajBrut(hours, brutTotal);
  const net = ajNet(brut);
  const sjr = brutTotal / (hours / 8); // SJR = salaire ÷ (heures ÷ 8)
 
  if ($("previsionSJRText")) $("previsionSJRText").textContent =
    `SJR estimé : ${sjr.toFixed(2).replace(".", ",")} €`;
  if ($("previsionTaux")) $("previsionTaux").textContent = `${net.toFixed(2).replace(".", ",")} €`;
  if ($("prevAjBrut")) $("prevAjBrut").textContent = `${brut.toFixed(2).replace(".", ",")} €`;
  if ($("previsionSJR")) $("previsionSJR").textContent = `${sjr.toFixed(2).replace(".", ",")} €`;
  if ($("prevAreResult")) $("prevAreResult").style.display = "block";
  if ($("previsionTauxDetails")) $("previsionTauxDetails").textContent =
    `AJ brut : ${brut.toFixed(2).replace(".", ",")} € · Plafond : ${PLAFOND.toFixed(2).replace(".", ",")} € · Plancher : ${PLANCHER} €`;
 
  // Projection : toujours AU-DESSUS des heures saisies (1300h -> 1400/1500/1600)
  if ($("areProjectionText")) {
    const targets = [1, 2, 3].map((i) => Math.round((hours + i * 100) / 100) * 100);
    const lines = targets.map((h) => `${h}h → ${ajNet(ajBrut(h, brutTotal)).toFixed(2).replace(".", ",")} €/j net`);
    $("areProjectionText").innerHTML = lines.join("<br>");
  }
}


function calculateCarence() {
  const sjr = Number($("carenceSJM")?.value || 0);
  const conges = Number($("carenceConges")?.value || 0);
  const supra = Number($("carenceSupra")?.value || 0);
  const finContrat = $("carenceFinContrat")?.value;

  if (!sjr) { alert("Renseigne ton SJR (Salaire Journalier de Référence)."); return; }

  const delaiAttente = 7;
  const franchiseCongesRaw = conges > 0 ? Math.round(conges / sjr) : 0;
  const franchiseConges = Math.min(franchiseCongesRaw, 30);
  const franchiseSupraRaw = supra > 0 ? Math.round(supra / sjr) : 0;
  const franchiseSupra = Math.min(franchiseSupraRaw, 75);
  const total = delaiAttente + franchiseConges + franchiseSupra;

  if ($("carenceAttente")) $("carenceAttente").textContent = delaiAttente + "j";
  if ($("carenceCongesResult")) $("carenceCongesResult").textContent = franchiseConges + "j";
  if ($("carenceSupraResult")) $("carenceSupraResult").textContent = franchiseSupra + "j";
  if ($("carenceTotal")) $("carenceTotal").textContent = total + "j";

  if ($("carenceDetail")) $("carenceDetail").textContent =
    `Délai légal : 7j (fixe) | Franchise CP : ${conges}€ ÷ ${sjr.toFixed(2)}€ = ${franchiseCongesRaw}j → plafonnée à ${franchiseConges}j` +
    (supra > 0
      ? ` | Franchise supra : ${supra}€ ÷ ${sjr.toFixed(2)}€ = ${franchiseSupraRaw}j → plafonnée à ${franchiseSupra}j`
      : " | Franchise supra : 0j (non applicable en CDDU)");

  // Date estimation
  if (finContrat && $("carenceDateEstimee")) {
    const dateFin = new Date(finContrat + "T00:00:00");
    const dateInscription = new Date(dateFin);
    dateInscription.setDate(dateInscription.getDate() + 1);
    const datePremier = new Date(dateInscription);
    datePremier.setDate(datePremier.getDate() + total);
    $("carenceDateEstimee").style.display = "block";
    $("carenceDateEstimee").innerHTML =
      `📅 <strong>Date estimée du 1er versement ARE</strong><br>` +
      `Fin contrat : <strong>${formatDate(finContrat)}</strong> → ` +
      `Inscription : <strong>${formatDate(dateInscription.toISOString().slice(0, 10))}</strong> → ` +
      `1er versement estimé : <strong>${formatDate(datePremier.toISOString().slice(0, 10))}</strong><br>` +
      `<small style="color:var(--muted);">Sous réserve du délai de traitement France Travail (variable).</small>`;
  } else if ($("carenceDateEstimee")) {
    $("carenceDateEstimee").style.display = "none";
  }

  if ($("carenceResult")) $("carenceResult").style.display = "block";
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
  if (typeof monterWidgetParser === "function") monterWidgetParser();
  if (typeof monterWidgetParserDocuments === "function") monterWidgetParserDocuments();
}

function getCalendarIcsUrl() {
  if (!currentUser) return null;
  return `https://upeogpgczoghlfwblnkb.supabase.co/functions/v1/calendar-ics?user_id=${currentUser.id}`;
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
  render();
}

async function logout() {
  await sb.auth.signOut();
  currentUser = null; missions = []; documents = [];
  showAuth();
}

async function loadMissions() {
  const { data, error } = await sb.from("missions").select("*").order("mission_date", { ascending: false });
  if (error) { alert("Erreur chargement missions : " + error.message); return; }
  missions = (data || []).map((x) => ({
    id: x.id, production: x.production, type: x.mission_type,
    date: x.mission_date, endDate: x.end_date || x.mission_date,
    hours: Number(x.hours || 0), gross: Number(x.gross_amount || 0),
    kmDistance: Number(x.km_distance || 0), kmRate: Number(x.km_rate || 0), kmAmount: Number(x.km_amount || 0),
    vacations: Number(x.vacations || Math.round((x.hours || 0) / 8))
  }));
  render();
}

async function loadDocuments() {
  if (!currentUser) return;
  const { data, error } = await sb.from("documents").select("*")
    .order("doc_year", { ascending: false }).order("doc_month", { ascending: false }).order("created_at", { ascending: false });
  if (error) { alert("Erreur chargement documents : " + error.message); return; }
  documents = data || [];
  renderDocuments();
}

function safeFileName(name) {
  return String(name || "document").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 90);
}

async function uploadDocument(event) {
  event.preventDefault();
  if (!currentUser) { alert("Connecte-toi avant d'ajouter un document."); return; }
  const fileInput = $("documentFile");
  const file = fileInput?.files?.[0];
  if (!file) { alert("Ajoute un fichier PDF ou une image."); return; }
  const type = $("documentType").value;
  const production = $("documentProduction").value.trim();
  const month = Number($("documentMonth").value);
  const year = Number($("documentYear").value);
  if (!production || !month || !year) { alert("Complète le type, la production, le mois et l'année."); return; }
  const ALLOWED_TYPES = ["application/pdf","image/jpeg","image/png","image/webp","image/gif"];
  if (!ALLOWED_TYPES.includes(file.type)) { alert("Format non autorisé. Seuls les PDF et images sont acceptés."); return; }
  const submitBtn = $("documentSubmitBtn");
  if (submitBtn) submitBtn.textContent = "Envoi en cours...";
  const cleanName = safeFileName(file.name);
  const filePath = `${currentUser.id}/${year}/${String(month).padStart(2, "0")}/${Date.now()}_${cleanName}`;
  const { error: uploadError } = await sb.storage.from("documents").upload(filePath, file, { cacheControl: "3600", upsert: false, contentType: file.type || "application/octet-stream" });
  if (uploadError) { if (submitBtn) submitBtn.textContent = "Ajouter le document"; alert("Erreur upload document : " + uploadError.message); return; }
  const { error: insertError } = await sb.from("documents").insert({ user_id: currentUser.id, file_name: file.name, file_path: filePath, document_type: type, production, doc_month: month, doc_year: year, mime_type: file.type || null });
  if (insertError) { await sb.storage.from("documents").remove([filePath]); if (submitBtn) submitBtn.textContent = "Ajouter le document"; alert("Erreur sauvegarde document : " + insertError.message); return; }
  $("documentForm").reset(); setDefaultDates();
  if (submitBtn) submitBtn.textContent = "Ajouter le document";
  await loadDocuments();
}

async function getDocumentSignedUrl(filePath) {
  const { data, error } = await sb.storage.from("documents").createSignedUrl(filePath, 120);
  if (error) { alert("Erreur ouverture document : " + error.message); return null; }
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
  if (!confirm("Supprimer ce document ?")) return;
  const { error: storageError } = await sb.storage.from("documents").remove([filePath]);
  if (storageError) { alert("Erreur suppression fichier : " + storageError.message); return; }
  const { error: dbError } = await sb.from("documents").delete().eq("id", id);
  if (dbError) { alert("Erreur suppression document : " + dbError.message); return; }
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

async function addMission(event) {
  event.preventDefault();
  if (!currentUser) { alert("Connecte-toi avant d'ajouter une mission."); return; }
  if ($("endDate").value < $("date").value) { alert("La date de fin ne peut pas être avant la date de début."); return; }
  const payload = {
    user_id: currentUser.id, production: normalizeProductionName($("production").value),
    mission_type: $("type").value, mission_date: $("date").value, end_date: $("endDate").value,
    hours: Number($("hours").value), gross_amount: Number($("gross").value),
    km_distance: Number($("kmDistance")?.value || 0), km_rate: Number($("kmRate")?.value || 0), km_amount: calculateKmAmount()
  };
  let result;
  if (editingMissionId) result = await sb.from("missions").update(payload).eq("id", editingMissionId);
  else result = await sb.from("missions").insert(payload);
  const { error } = result;
  if (error) { alert("Erreur sauvegarde : " + error.message); return; }
  $("missionForm").reset();
  editingMissionId = null;
  const submitBtn = document.querySelector("#missionForm button[type='submit']");
  if (submitBtn) submitBtn.textContent = "Enregistrer la mission";
  setDefaultDates(); updateKmPreview();
  current = new Date(payload.mission_date + "T00:00:00");
  current.setDate(1);
  await loadMissions();
  activateView("calendar");
}

function editMission(id) {
  const mission = missions.find((m) => String(m.id) === String(id));
  if (!mission) { alert("Mission introuvable."); return; }
  editingMissionId = mission.id;
  $("production").value = mission.production || "";
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
  if (!confirm("Supprimer cette mission ?")) return;
  const { error } = await sb.from("missions").delete().eq("id", id);
  if (error) { alert("Erreur suppression : " + error.message); return; }
  await loadMissions();
}

function activateView(viewName) {
  document.querySelectorAll(".tab").forEach((tab) => { tab.classList.toggle("active", tab.dataset.view === viewName); });
  document.querySelectorAll(".view").forEach((view) => { view.classList.toggle("active", view.id === "view-" + viewName); });
  trackEvent("view_" + viewName);
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
  const totalFraisReels = totalKmAmount + autresFrais;

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
    `Frais réels totaux (km + autres) : ${money(totalFraisReels)}`;

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
        <div class="fi-comp-detail">Km + autres frais</div>
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
  const remaining = Math.max(0, Math.round((OBJECTIVE_HOURS - yearHours) * 10) / 10);

  if ($("yearHours")) $("yearHours").textContent = yearHours;
  if ($("monthHours")) $("monthHours").textContent = monthHours + "h";
  if ($("monthGross")) $("monthGross").textContent = money(monthGross);
  if ($("recapMonthPicker")) $("recapMonthPicker").value = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
  if ($("yearGross")) $("yearGross").textContent = money(yearGross);
  if ($("remainingHours")) $("remainingHours").textContent = remaining;
  if ($("missionCount")) {
  const totalVac = selectedMonthMissions.reduce((a, x) => a + Number(x.vacations || 0), 0);
  $("missionCount").textContent = totalVac;
}
  if ($("progressText")) $("progressText").textContent = percent + "% de ton objectif intermittent";
  renderFiscalite(yearGross, yearMissions);

  renderChart(yearHours, plannedHours);
  renderHistory();
  renderAllMissions();
  renderCalendar();
  renderActualisation();
  renderDocuments();
}

function renderChart(doneHours, plannedHours = 0) {
  const total = OBJECTIVE_HOURS;
  const doneRaw = Math.max(0, Number(doneHours) || 0);
  const plannedRaw = Math.max(0, Number(plannedHours) || 0);
  const donePercent = Math.round((doneRaw / total) * 100);
  const plannedPercent = Math.round((plannedRaw / total) * 100);
  const totalPercent = donePercent + plannedPercent;
  const CIRC = 377;
  const doneDash = Math.min((donePercent / 100) * CIRC, CIRC);
  const plannedDash = Math.min((plannedPercent / 100) * CIRC, CIRC - doneDash);
  if (!$("chart")) return;
  $("chart").innerHTML = `
    <svg viewBox="0 0 300 200" width="100%" role="img" aria-label="Arc progression heures">
      <defs>
        <linearGradient id="g3done" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#1F4E5F"/><stop offset="100%" stop-color="#1F4E5F"/></linearGradient>
        <linearGradient id="g3plan" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#F97316"/><stop offset="100%" stop-color="#F97316"/></linearGradient>
        <filter id="arcShadow"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-opacity="0.15"/></filter>
      </defs>
      <path d="M 30 165 A 120 120 0 0 1 270 165" fill="none" stroke="#EEF4F1" stroke-width="30" stroke-linecap="round"/>
      ${doneDash > 0 ? `<path d="M 30 165 A 120 120 0 0 1 270 165" fill="none" stroke="url(#g3done)" stroke-width="30" stroke-linecap="round" stroke-dasharray="${doneDash} ${CIRC}" filter="url(#arcShadow)"/>` : ""}
      ${plannedDash > 0 ? `<path d="M 30 165 A 120 120 0 0 1 270 165" fill="none" stroke="url(#g3plan)" stroke-width="30" stroke-linecap="round" stroke-dasharray="${plannedDash} ${CIRC}" stroke-dashoffset="${-doneDash}"/>` : ""}
      <text x="150" y="132" text-anchor="middle" font-size="44" font-weight="900" fill="#1F4E5F" font-family="-apple-system, BlinkMacSystemFont, sans-serif">${totalPercent}%</text>
      <text x="150" y="155" text-anchor="middle" font-size="13" fill="#718096" font-family="-apple-system, BlinkMacSystemFont, sans-serif">potentiel total</text>
      <rect x="20" y="182" width="12" height="12" rx="3" fill="#1F4E5F"/>
      <text x="37" y="193" font-size="13" font-weight="700" fill="#2D3748" font-family="-apple-system, BlinkMacSystemFont, sans-serif">Effectué · ${donePercent}%</text>
      <rect x="128" y="182" width="12" height="12" rx="3" fill="#F97316"/>
      <text x="145" y="193" font-size="13" font-weight="700" fill="#2D3748" font-family="-apple-system, BlinkMacSystemFont, sans-serif">Prévu · ${plannedPercent}%</text>
      <rect x="228" y="182" width="12" height="12" rx="3" fill="#D8E4DF"/>
      <text x="245" y="193" font-size="13" font-weight="700" fill="#718096" font-family="-apple-system, BlinkMacSystemFont, sans-serif">Restant</text>
    </svg>
  `;
}

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
          <div class="mission-history-head"><strong>${mission.production}</strong><span class="pill">${mission.type}</span></div>
          <div class="mission-history-info">
            <span>📅 ${formatPeriod(mission.date, mission.endDate)}</span>
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
    ${totalPages > 1 ? `
      <div class="history-pagination">
        <button class="ghost" type="button" id="historyPagePrev" ${historyPage === 1 ? "disabled" : ""}>‹</button>
        <span>Page ${historyPage} / ${totalPages}</span>
        <button class="ghost" type="button" id="historyPageNext" ${historyPage === totalPages ? "disabled" : ""}>›</button>
      </div>
    ` : ""}
  `;
  if ($("historyPagePrev")) $("historyPagePrev").addEventListener("click", () => { historyPage--; renderHistory(); });
  if ($("historyPageNext")) $("historyPageNext").addEventListener("click", () => { historyPage++; renderHistory(); });
}
function renderAllMissions() {
  const container = $("missionsGraphContainer");
  if (!container) return;

  const addBtnHtml = `<button class="ghost" type="button" id="missionsAddBtn" style="display:inline-flex;align-items:center;gap:6px;margin-bottom:16px;font-weight:700;">+ Ajouter une mission</button>`;
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
    container.innerHTML = `${addBtnHtml}<div class="empty">Aucune mission enregistrée. Clique sur « Ajouter une mission » pour commencer.</div>`;
    bindAddBtn();
    return;
  }

  const groups = {};
  missions.forEach((mission) => {
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
  alert("Récapitulatif copié.");
}

function generateActualisationPDF() {
  const list = monthMissions(current).filter((m) => new Date(m.date + "T00:00:00") <= todayDateOnly()).sort((a, b) => new Date(a.date) - new Date(b.date));
  const title = current.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const totalHours = Math.round(sumDone(list) * 10) / 10;
  const totalGross = list.reduce((a, x) => a + Number(x.gross || 0), 0);
  const totalDays = sumMissionDays(list);
  const rows = list.map((mission) => `<tr><td>${escapeHtml(formatPeriod(mission.date, mission.endDate))}</td><td><strong>${escapeHtml(mission.production)}</strong></td><td>${escapeHtml(mission.type)}</td><td>${escapeHtml(mission.hours)}h</td><td>${escapeHtml(money(mission.gross))}</td></tr>`).join("");
  const win = window.open("", "_blank");
  if (!win) { alert("Impossible d'ouvrir la fenêtre PDF. Autorise les pop-ups pour ce site."); return; }
  win.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"/><title>Actualisation ${escapeHtml(title)}</title><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#2D3748;background:#fff;padding:34px}.header{border-bottom:3px solid #1F4E5F;padding-bottom:16px;margin-bottom:22px}h1{margin:0;color:#1F4E5F;font-size:28px;letter-spacing:-.03em}.subtitle{color:#718096;margin:6px 0 0;font-size:14px}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:22px 0 24px}.summary-box{border:1px solid #E2E8F0;border-radius:14px;padding:14px;background:#F8FAF9}.summary-box strong{display:block;color:#1F4E5F;font-size:24px;line-height:1.1}.summary-box span{display:block;margin-top:4px;color:#718096;font-size:12px;text-transform:uppercase;font-weight:700}table{width:100%;border-collapse:collapse;margin-top:10px}th{text-align:left;color:#718096;font-size:12px;text-transform:uppercase;letter-spacing:.03em;padding:10px 8px;border-bottom:2px solid #E2E8F0}td{padding:12px 8px;border-bottom:1px solid #E2E8F0;font-size:14px;vertical-align:top}tr:nth-child(even) td{background:#FBFCFC}.footer{margin-top:26px;padding-top:12px;border-top:1px solid #E2E8F0;font-size:12px;color:#718096;line-height:1.45}@media print{body{padding:20px}.summary-box,tr:nth-child(even) td{print-color-adjust:exact;-webkit-print-color-adjust:exact}}</style></head><body><div class="header"><h1>Récapitulatif actualisation</h1><p class="subtitle">${escapeHtml(title)} · Généré avec Intermitrack</p></div><div class="summary"><div class="summary-box"><strong>${escapeHtml(totalDays)}</strong><span>Journées</span></div><div class="summary-box"><strong>${escapeHtml(totalHours)}h</strong><span>Heures</span></div><div class="summary-box"><strong>${escapeHtml(money(totalGross))}</strong><span>Brut total</span></div></div>${list.length ? `<table><thead><tr><th>Période</th><th>Production</th><th>Mission</th><th>Heures</th><th>Brut</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="empty">Aucune mission effectuée sur ce mois.</div>`}<p class="footer">Ce document est un récapitulatif personnel destiné à faciliter l'actualisation mensuelle. Les informations doivent être vérifiées par l'utilisateur avant déclaration officielle.</p></body></html>`);
  win.document.close(); win.focus(); win.print();
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
      alert("Date d'admission ARE enregistrée.");
    });
  }
 
  if ($("documentForm")) $("documentForm").addEventListener("submit", uploadDocument);
  if ($("refreshDocumentsBtn")) $("refreshDocumentsBtn").addEventListener("click", loadDocuments);
  if ($("calculateAreBtn")) $("calculateAreBtn").addEventListener("click", calculateEstimatedAreDailyRate);
  if ($("calculateCarenceBtn")) $("calculateCarenceBtn").addEventListener("click", calculateCarence);
 
  $("date").addEventListener("change", () => { if (!$("endDate").value || $("endDate").value < $("date").value) $("endDate").value = $("date").value; });
 
  document.querySelectorAll(".tab").forEach((tab) => { tab.addEventListener("click", () => activateView(tab.dataset.view)); });

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
 
  if ($("copyIcsBtn")) $("copyIcsBtn").addEventListener("click", () => {
    const url = getCalendarIcsUrl();
    if (!url) return;
    navigator.clipboard.writeText(url);
    $("copyIcsBtn").textContent = "✅ Lien copié !";
    setTimeout(() => { $("copyIcsBtn").textContent = "Copier le lien"; }, 2000);
  });
 
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
    if (!deferredInstallPrompt) { alert("Sur iPhone : ouvrez Safari, bouton Partager, puis Ajouter à l'écran d'accueil. Sur Android : menu du navigateur, puis Installer l'application."); return; }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
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
  function libelleMois(s){ if(!s) return "—"; var M=["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"],p=s.split("-"); return M[(+p[1])-1]+" "+p[0]; }
  function joursMois(s){ if(!s) return null; var p=s.split("-"); return new Date(+p[0],+p[1],0).getDate(); }
  $("itk-c2-go").addEventListener("click",function(){
    var nht=num($("itk-c2-nht").value), prc=num($("itk-c2-prc").value),
        jours=num($("itk-c2-jours").value), mois=$("itk-c2-mois").value;
    if(!(nht>0)||!(prc>0)||!(jours>=0)||isNaN(jours)){ $("itk-c2-err").style.display="block"; return; }
    $("itk-c2-err").style.display="none";
    var smicH=CONFIG.SMIC_HORAIRE, smicMens=smicH*151.67, smicJour=smicMens/30;
    var sjm=prc/(nht/8);
    var fsal=Math.max(0, Math.round((prc/smicMens)*(sjm/(3*smicJour))-27));
    var fcp=Math.min(CONFIG.FRANCHISE_CP_MAX, Math.floor(jours/24*2.5));
    $("itk-c2-rmois").textContent=libelleMois(mois);
    var jm=joursMois(mois); $("itk-c2-rjours").textContent=jm?"("+jm+" jours)":"";
    $("itk-c2-smic").textContent=eur(smicH);
    $("itk-c2-sjm").textContent=eur(sjm);
    $("itk-c2-fsal").textContent=fsal+" j";
    $("itk-c2-fcp").textContent=fcp+" j";
    $("itk-c2-out").classList.remove("itk-hide");
  });

  /* ===== CARTE 3 ===== */
  $("itk-c3-go").addEventListener("click",function(){
    var b=num($("itk-c3-brut").value); if(!(b>0)) return;
    var brut=b*CONFIG.CONGES_TAUX, net=brut*(1-CONFIG.CONGES_CHARGES);
    $("itk-c3-val").textContent="Environ "+eur(net)+" net";
    $("itk-c3-detail").innerHTML="Indemnité brute ≈ "+eur(brut)+" (10 % du salaire) · charges salariales ~"+Math.round(CONFIG.CONGES_CHARGES*100)+" % (estimation).";
    $("itk-c3-out").classList.remove("itk-hide");
  });
})();
