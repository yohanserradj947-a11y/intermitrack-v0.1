
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
let current = new Date();
let deferredInstallPrompt = null;

const OBJECTIVE_HOURS = 507;
const MAX_DISPLAY_PERCENT = 300;

const $ = (id) => document.getElementById(id);
async function trackEvent(eventName, eventData = {}) {
  try {
    if (!currentUser) return;

    await sb.from("analytics_events").insert({
      user_id: currentUser.id,
      event_name: eventName,
      event_data: eventData
    });
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


function getTaxableIncome() {
  return Number(localStorage.getItem(storageKey("taxable_income")) || 0);
}

function setTaxableIncome(value) {
  localStorage.setItem(storageKey("taxable_income"), String(Number(value || 0)));
}

function getOtherIncome() {
  return Number(localStorage.getItem(storageKey("other_income")) || 0);
}

function setOtherIncome(value) {
  localStorage.setItem(storageKey("other_income"), String(Number(value || 0)));
}

function getTaxParts() {
  return Number(localStorage.getItem(storageKey("tax_parts")) || 1);
}

function setTaxParts(value) {
  localStorage.setItem(storageKey("tax_parts"), String(Number(value || 1)));
}

function getObservedMissionMonths(list) {
  const months = new Set(
    list.map((mission) => String(mission.date || "").slice(0, 7)).filter(Boolean)
  );
  return months.size;
}

function estimateAnnualProjection(value, observedMonths) {
  const months = Math.max(0, Number(observedMonths || 0));
  if (!months) return 0;
  return Math.round((Number(value || 0) / months) * 12);
}

function estimateTaxableIncomeFromGross(grossAmount) {
  // Coefficient volontairement indicatif.
  // Objectif : éviter de demander le net imposable à l'utilisateur tout en restant prudent.
  // À terme, ce coefficient pourra être remplacé par une lecture fiable des fiches de paie.
  return Math.max(0, Math.round(Number(grossAmount || 0) * 0.78));
}

function calculateProgressiveTax(taxableIncome, parts) {
  const safeIncome = Math.max(0, Number(taxableIncome || 0));
  const safeParts = Math.max(0.5, Number(parts || 1));
  const incomePerPart = safeIncome / safeParts;

  const brackets = [
    { limit: 11600, rate: 0 },
    { limit: 29579, rate: 0.11 },
    { limit: 84577, rate: 0.30 },
    { limit: 181917, rate: 0.41 },
    { limit: Infinity, rate: 0.45 }
  ];

  let previous = 0;
  let taxPerPart = 0;
  let marginalRate = 0;

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

  return {
    estimatedTax,
    averageRate,
    marginalRate: marginalRate * 100,
    incomePerPart
  };
}

function getTaxRate() {
  return Number(localStorage.getItem(storageKey("tax_rate")) || 0);
}

function setTaxRate(value) {
  localStorage.setItem(storageKey("tax_rate"), String(Number(value || 0)));
}


function calculateEstimatedAreDailyRate() {
  const hours = Number($("areHours")?.value || 0);
  const dailyGross = Number($("areDailyGross")?.value || 0);

  if (!hours || !dailyGross) {
    if ($("previsionTaux")) {
      $("previsionTaux").textContent = "Renseigne tes heures et ton brut journée";
    }

    if ($("previsionTauxDetails")) {
      $("previsionTauxDetails").textContent = "Simulation indicative Annexe 8 technicien.";
    }

    if ($("areProjectionText")) {
      $("areProjectionText").textContent = "Renseigne tes données pour voir les projections.";
    }

    return;
  }

  const estimatedDays = hours / 8;
  const referenceSalary = estimatedDays * dailyGross;

  const MIN_ARE = 38;
  const MAX_ARE = 174.8;
  const AJ_MIN = 31.96;

  const salaryPart =
    Math.min(referenceSalary, 14400) * 0.42 +
    Math.max(0, referenceSalary - 14400) * 0.05;

  const hoursPart =
    Math.min(hours, 720) * 0.26 +
    Math.max(0, hours - 720) * 0.08;

  const grossAre =
    (AJ_MIN * salaryPart / 5000) +
    (AJ_MIN * hoursPart / 507) +
    (AJ_MIN * 0.40);

  const cappedGrossAre =
    Math.min(MAX_ARE, Math.max(MIN_ARE, grossAre));

  const estimatedNetAre = cappedGrossAre * 0.89;

  if ($("previsionTaux")) {
    $("previsionTaux").textContent =
      "Environ " +
      estimatedNetAre.toFixed(2).replace(".", ",") +
      " € net / jour";
  }

  if ($("previsionTauxDetails")) {
    $("previsionTauxDetails").textContent =
      "Jours estimés : " +
      estimatedDays.toFixed(1).replace(".", ",") +
      " • Salaire de référence : " +
      money(referenceSalary);
  }

  if ($("areProjectionText")) {
    let targets;

    if (hours < 507) targets = [507, 600, 700];
    else if (hours < 700) targets = [700, 800, 900];
    else if (hours < 900) targets = [900, 1000, 1100];
    else if (hours < 1200) targets = [1200, 1300, 1400];
    else {
      const base = Math.ceil(hours / 100) * 100;
      targets = [base, base + 100, base + 200];
    }

    const projectionLines = targets.map((targetHours) => {
      const targetDays = targetHours / 8;
      const targetSalary = targetDays * dailyGross;

      const targetSalaryPart =
        Math.min(targetSalary, 14400) * 0.42 +
        Math.max(0, targetSalary - 14400) * 0.05;

      const targetHoursPart =
        Math.min(targetHours, 720) * 0.26 +
        Math.max(0, targetHours - 720) * 0.08;

      const targetGrossAre =
        (AJ_MIN * targetSalaryPart / 5000) +
        (AJ_MIN * targetHoursPart / 507) +
        (AJ_MIN * 0.40);

      const targetNet =
        Math.min(MAX_ARE, Math.max(MIN_ARE, targetGrossAre)) * 0.89;

      return `${targetHours}h → ${targetNet.toFixed(2).replace(".", ",")} € net/j`;
    });

    $("areProjectionText").innerHTML = projectionLines.join("<br>");
  }
}



function monterWidgetParserDocuments() {
  const container = $("document-parser-container-documents");
  if (!container) return;

  container.innerHTML = `
    <div style="
      border: 2px dashed #6c63ff;
      border-radius: 12px;
      padding: 20px;
      text-align: center;
      background: rgba(108,99,255,0.05);
      margin-bottom: 20px;
    ">
      <p style="font-weight:600; margin:0 0 8px;">📄 Importer un contrat ou fiche de paie</p>
      <p style="font-size:13px; color:#888; margin:0 0 12px;">PDF, JPG ou PNG — l'IA classe le document automatiquement</p>
      <input type="file" id="doc-input-documents" accept=".pdf,.jpg,.jpeg,.png" style="display:none">
      <button id="doc-btn-documents" type="button" style="
        padding: 8px 20px;
        background: #1F4E5F;
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
      ">Choisir un fichier</button>
      <p id="doc-status-documents" style="margin-top:12px; font-size:13px; color:#888;"></p>
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

    status.textContent = "⏳ Analyse en cours…";
    button.disabled = true;
    button.style.opacity = "0.6";

    try {
      let data = null;

      if (typeof analyserDocument === "function") {
        data = await analyserDocument(file);
      } else if (typeof analyserDocumentAvecIa === "function") {
        data = await analyserDocumentAvecIa(file);
      } else if (typeof uploadEtAnalyserDocument === "function") {
        data = await uploadEtAnalyserDocument(file);
      } else {
        throw new Error("Module IA introuvable.");
      }

      if (!data) throw new Error("Aucune donnée détectée.");

      if (typeof sauvegarderDocumentDansRubrique === "function") {
        await sauvegarderDocumentDansRubrique(file, data);
      } else if (typeof classerDocumentDepuisIa === "function") {
        await classerDocumentDepuisIa(file, data);
      } else {
        await classerDocumentAnalyseIa(file, data);
      }

      status.style.color = "#28a745";
      status.textContent = "✅ Document analysé et classé automatiquement.";
      openDocumentProduction = data.production || data.employeur || data.societe || data.entreprise || openDocumentProduction;
      await loadDocuments();
      renderDocuments();
    } catch (error) {
      console.error(error);
      status.style.color = "#dc3545";
      status.textContent = "❌ Erreur : " + error.message;
    } finally {
      button.disabled = false;
      button.style.opacity = "1";
      input.value = "";
    }
  });
}

async function classerDocumentAnalyseIa(file, data) {
  if (!currentUser) {
    throw new Error("Connecte-toi avant d'ajouter un document.");
  }

  const production =
    data.production ||
    data.employeur ||
    data.societe ||
    data.entreprise ||
    "Sans production";

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

  const { error: uploadError } = await sb.storage
    .from("documents")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "application/octet-stream"
    });

  if (uploadError) {
    throw new Error("Erreur upload document : " + uploadError.message);
  }

  const { error: insertError } = await sb.from("documents").insert({
    user_id: currentUser.id,
    file_name: file.name,
    file_path: filePath,
    document_type: documentType,
    production,
    doc_month: month,
    doc_year: year,
    mime_type: file.type || null
  });

  if (insertError) {
    await sb.storage.from("documents").remove([filePath]);
    throw new Error("Erreur sauvegarde document : " + insertError.message);
  }
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

async function init() {
  setDefaultDates();

  const { data: { session } } = await sb.auth.getSession();
  currentUser = session?.user || null;

  if (!currentUser) {
    showAuth();
    return;
  }

  showApp();
  await loadMissions();
  await loadDocuments();
  render();
}

async function logout() {
  await sb.auth.signOut();
  currentUser = null;
  missions = [];
  documents = [];
  showAuth();
}

async function loadMissions() {
  const { data, error } = await sb
    .from("missions")
    .select("*")
    .order("mission_date", { ascending: false });

  if (error) {
    alert("Erreur chargement missions : " + error.message);
    return;
  }

  missions = (data || []).map((x) => ({
    id: x.id,
    production: x.production,
    type: x.mission_type,
    date: x.mission_date,
    endDate: x.end_date || x.mission_date,
    hours: Number(x.hours || 0),
    gross: Number(x.gross_amount || 0),
    kmDistance: Number(x.km_distance || 0),
    kmRate: Number(x.km_rate || 0),
    kmAmount: Number(x.km_amount || 0)
  }));

  render();
}


async function loadDocuments() {
  if (!currentUser) return;

  const { data, error } = await sb
    .from("documents")
    .select("*")
    .order("doc_year", { ascending: false })
    .order("doc_month", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    alert("Erreur chargement documents : " + error.message);
    return;
  }

  documents = data || [];
  renderDocuments();
}

function safeFileName(name) {
  return String(name || "document")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 90);
}

async function uploadDocument(event) {
  event.preventDefault();

  if (!currentUser) {
    alert("Connecte-toi avant d'ajouter un document.");
    return;
  }

  const fileInput = $("documentFile");
  const file = fileInput?.files?.[0];

  if (!file) {
    alert("Ajoute un fichier PDF ou une image.");
    return;
  }

  const type = $("documentType").value;
  const production = $("documentProduction").value.trim();
  const month = Number($("documentMonth").value);
  const year = Number($("documentYear").value);

  if (!production || !month || !year) {
    alert("Complète le type, la production, le mois et l'année.");
    return;
  }

  const submitBtn = $("documentSubmitBtn");
  if (submitBtn) submitBtn.textContent = "Envoi en cours...";

  const cleanName = safeFileName(file.name);
  const filePath = `${currentUser.id}/${year}/${String(month).padStart(2, "0")}/${Date.now()}_${cleanName}`;

  const { error: uploadError } = await sb.storage
    .from("documents")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "application/octet-stream"
    });

  if (uploadError) {
    if (submitBtn) submitBtn.textContent = "Ajouter le document";
    alert("Erreur upload document : " + uploadError.message);
    return;
  }

  const { error: insertError } = await sb.from("documents").insert({
    user_id: currentUser.id,
    file_name: file.name,
    file_path: filePath,
    document_type: type,
    production,
    doc_month: month,
    doc_year: year,
    mime_type: file.type || null
  });

  if (insertError) {
    await sb.storage.from("documents").remove([filePath]);
    if (submitBtn) submitBtn.textContent = "Ajouter le document";
    alert("Erreur sauvegarde document : " + insertError.message);
    return;
  }

  $("documentForm").reset();
  setDefaultDates();
  if (submitBtn) submitBtn.textContent = "Ajouter le document";
  await loadDocuments();
}

async function getDocumentSignedUrl(filePath) {
  const { data, error } = await sb.storage
    .from("documents")
    .createSignedUrl(filePath, 120);

  if (error) {
    alert("Erreur ouverture document : " + error.message);
    return null;
  }

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
  link.href = url;
  link.download = fileName || "document";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function deleteDocument(id, filePath) {
  if (!confirm("Supprimer ce document ?")) return;

  const { error: storageError } = await sb.storage.from("documents").remove([filePath]);
  if (storageError) {
    alert("Erreur suppression fichier : " + storageError.message);
    return;
  }

  const { error: dbError } = await sb.from("documents").delete().eq("id", id);
  if (dbError) {
    alert("Erreur suppression document : " + dbError.message);
    return;
  }

  await loadDocuments();
}

function monthName(monthNumber) {
  const date = new Date(2026, Number(monthNumber) - 1, 1);
  return date.toLocaleDateString("fr-FR", { month: "long" });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function renderDocuments() {
  const container = $("documentsList");
  if (!container) return;

  if (!documents.length) {
    container.innerHTML = `<div class="empty">Aucun document enregistré pour le moment.</div>`;
    return;
  }

  const sorted = [...documents].sort((a, b) => {
    if (String(a.production).localeCompare(String(b.production), "fr") !== 0) {
      return String(a.production).localeCompare(String(b.production), "fr");
    }
    if (b.doc_year !== a.doc_year) return b.doc_year - a.doc_year;
    if (b.doc_month !== a.doc_month) return b.doc_month - a.doc_month;
    return String(a.document_type).localeCompare(String(b.document_type), "fr");
  });

  const groups = {};
  sorted.forEach((doc) => {
    const production = doc.production || "Sans production";
    if (!groups[production]) groups[production] = [];
    groups[production].push(doc);
  });

  if (!openDocumentProduction) {
    container.innerHTML = `
      <div class="document-folder-grid document-folder-grid-pro">
        ${Object.keys(groups).sort((a, b) => a.localeCompare(b, "fr")).map((production) => {
          const list = groups[production];
          const counts = list.reduce((acc, doc) => {
            acc[doc.document_type] = (acc[doc.document_type] || 0) + 1;
            return acc;
          }, {});

          const latest = [...list].sort((a, b) => {
            if (b.doc_year !== a.doc_year) return b.doc_year - a.doc_year;
            return b.doc_month - a.doc_month;
          })[0];

          const types = Object.keys(counts).sort();

          return `
            <button class="document-folder-card document-folder-card-pro" type="button" data-doc-production-open="${escapeHtml(production)}">
              <div class="document-folder-icon">📁</div>

              <div class="document-folder-main">
                <strong>${escapeHtml(production)}</strong>
                <span>${list.length} document${list.length > 1 ? "s" : ""}</span>
              </div>

              <div class="document-folder-tags">
                ${types.slice(0, 4).map((type) => `
                  <em>${escapeHtml(type)} · ${counts[type]}</em>
                `).join("")}
              </div>

              <small>
                Dernier ajout : ${latest ? `${escapeHtml(monthName(latest.doc_month))} ${escapeHtml(latest.doc_year)}` : "—"}
              </small>
            </button>
          `;
        }).join("")}
      </div>
    `;
    return;
  }

  const productionDocs = groups[openDocumentProduction] || [];
  const filters = ["Tous", "AEM", "Fiche de paie", "Congés Spectacles", "Contrat", "Autre"];
  const filteredDocs = documentFilter === "Tous"
    ? productionDocs
    : productionDocs.filter((doc) => doc.document_type === documentFilter);

  container.innerHTML = `
    <div class="document-detail-head document-detail-head-pro">
      <button class="ghost" type="button" data-doc-production-back>‹ Retour aux productions</button>
      <div>
        <h2>${escapeHtml(openDocumentProduction)}</h2>
        <p class="sub">${productionDocs.length} document${productionDocs.length > 1 ? "s" : ""} classé${productionDocs.length > 1 ? "s" : ""}</p>
      </div>
    </div>

    <div class="document-filter-bar document-filter-bar-pro">
      ${filters.map((filter) => `
        <button
          class="doc-filter ${documentFilter === filter ? "active" : ""}"
          type="button"
          data-doc-filter="${escapeHtml(filter)}"
        >
          ${escapeHtml(filter)}
        </button>
      `).join("")}
    </div>

    <div class="documents-card-grid">
      ${filteredDocs.length ? filteredDocs.map((doc) => `
        <div class="document-card document-card-pro">
          <div class="document-file-icon">${escapeHtml(String(doc.document_type || "Doc").slice(0, 3).toUpperCase())}</div>

          <div class="document-card-content">
            <div class="document-card-head">
              <div>
                <strong>${escapeHtml(doc.document_type)} · ${escapeHtml(doc.production)}</strong>
                <span>${escapeHtml(monthName(doc.doc_month))} ${escapeHtml(doc.doc_year)}</span>
              </div>
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

  if (!currentUser) {
    alert("Connecte-toi avant d'ajouter une mission.");
    return;
  }

  if ($("endDate").value < $("date").value) {
    alert("La date de fin ne peut pas être avant la date de début.");
    return;
  }

  const payload = {
    user_id: currentUser.id,
    production: $("production").value.trim(),
    mission_type: $("type").value,
    mission_date: $("date").value,
    end_date: $("endDate").value,
    hours: Number($("hours").value),
    gross_amount: Number($("gross").value),
    km_distance: Number($("kmDistance")?.value || 0),
    km_rate: Number($("kmRate")?.value || 0),
    km_amount: calculateKmAmount()
  };

  let result;

  if (editingMissionId) {
    result = await sb
      .from("missions")
      .update(payload)
      .eq("id", editingMissionId);
  } else {
    result = await sb.from("missions").insert(payload);
  }

  const { error } = result;

  if (error) {
    alert("Erreur sauvegarde : " + error.message);
    return;
  }

  $("missionForm").reset();

  editingMissionId = null;

  const submitBtn = document.querySelector("#missionForm button[type='submit']");
  if (submitBtn) {
    submitBtn.textContent = "Enregistrer la mission";
  }

  setDefaultDates();
  updateKmPreview();
  current = new Date(payload.mission_date + "T00:00:00");
  current.setDate(1);

  await loadMissions();
  activateView("dashboard");
}

function editMission(id) {
  const mission = missions.find((m) => String(m.id) === String(id));

  if (!mission) {
    alert("Mission introuvable.");
    return;
  }

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
  if (submitBtn) {
    submitBtn.textContent = "Mettre à jour la mission";
  }

  activateView("missions");

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

async function deleteMission(id) {
  if (!confirm("Supprimer cette mission ?")) return;

  const { error } = await sb.from("missions").delete().eq("id", id);

  if (error) {
    alert("Erreur suppression : " + error.message);
    return;
  }

  await loadMissions();
}

function activateView(viewName) {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === viewName);
  });

  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.id === "view-" + viewName);
  });

  trackEvent("view_" + viewName);
}

function money(n) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  }).format(n || 0);
}

function formatDate(s) {
  return new Date(s + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function formatPeriod(a, b) {
  return !b || a === b ? formatDate(a) : formatDate(a) + " -> " + formatDate(b);
}

function todayDateOnly() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysInclusive(a, b) {
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

function missionDayCount(mission) {
  const start = new Date(mission.date + "T00:00:00");
  const end = new Date((mission.endDate || mission.date) + "T00:00:00");
  return daysInclusive(start, end);
}

function isDateInPeriod(dateStr, mission) {
  return dateStr >= mission.date && dateStr <= (mission.endDate || mission.date);
}

function overlapsMonth(mission, ref) {
  const year = ref.getFullYear();
  const month = ref.getMonth();
  const start = new Date(mission.date + "T00:00:00");
  const end = new Date((mission.endDate || mission.date) + "T00:00:00");
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59);
  return start <= monthEnd && end >= monthStart;
}

function monthMissions(ref) {
  return missions.filter((mission) => overlapsMonth(mission, ref));
}

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

  return {
    done,
    planned: Math.max(0, Math.round((totalHours - done) * 10) / 10)
  };
}

function sumDone(list) {
  return list.reduce((total, mission) => total + splitMissionByTime(mission).done, 0);
}

function sumPlanned(list) {
  return list.reduce((total, mission) => total + splitMissionByTime(mission).planned, 0);
}

function sumMissionDays(list) {
  return list.reduce((total, mission) => total + missionDayCount(mission), 0);
}

function getProductionInitials(name) {
  return String(name || "---")
    .replace(/[^a-zA-ZÀ-ÿ0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .join("")
    .slice(0, 3)
    .toUpperCase() || "---";
}

function render() {
  const now = new Date();
  const year = now.getFullYear();

  const yearMissions = missions.filter((mission) => {
    return new Date(mission.date + "T00:00:00").getFullYear() === year;
  });

  const selectedMonthMissions = monthMissions(current);

  const yearHours = Math.round(sumDone(yearMissions) * 10) / 10;
  const plannedHours = Math.round(sumPlanned(yearMissions) * 10) / 10;

  // Heures du mois affiché : on affiche le total du mois sélectionné,
  // pas seulement les heures déjà passées dans le temps.
  // Comme ça, juin affiche bien toutes les heures enregistrées en juin.
  const monthHours = Math.round(
    selectedMonthMissions.reduce((total, mission) => total + Number(mission.hours || 0), 0) * 10
  ) / 10;

  const yearGross = yearMissions.reduce((a, x) => a + Number(x.gross || 0), 0);
  const monthGross = selectedMonthMissions.reduce((a, x) => a + Number(x.gross || 0), 0);

  const percent = Math.round((yearHours / OBJECTIVE_HOURS) * 100);
  const remaining = Math.max(0, Math.round((OBJECTIVE_HOURS - yearHours) * 10) / 10);

  if ($("yearHours")) $("yearHours").textContent = yearHours;
  if ($("monthHours")) $("monthHours").textContent = monthHours + "h";
  if ($("monthGross")) $("monthGross").textContent = money(monthGross);
  if ($("yearGross")) $("yearGross").textContent = money(yearGross);
  if ($("remainingHours")) $("remainingHours").textContent = remaining + "h";
  if ($("missionCount")) $("missionCount").textContent = sumMissionDays(selectedMonthMissions);
  if ($("progressText")) $("progressText").textContent = percent + "% de ton objectif intermittent";

  if ($("fiscaliteGrossPreview")) {
    $("fiscaliteGrossPreview").textContent = "Brut annuel : " + money(yearGross);
  }

  if ($("otherIncomeInput")) {
    const savedOtherIncome = getOtherIncome();
    if (!$("otherIncomeInput").value && savedOtherIncome) $("otherIncomeInput").value = savedOtherIncome;
  }

  if ($("taxPartsInput")) {
    const savedParts = getTaxParts();
    if (!$("taxPartsInput").value && savedParts) $("taxPartsInput").value = savedParts;
  }

  const totalKmAmountForTax = yearMissions.reduce((a, x) => a + Number(x.kmAmount || 0), 0);
  const observedMonths = getObservedMissionMonths(yearMissions);
  const projectedGross = estimateAnnualProjection(yearGross, observedMonths);
  const projectedKmAmount = estimateAnnualProjection(totalKmAmountForTax, observedMonths);
  const complementaryIncome = getOtherIncome();

  if ($("fiscaliteNetPreview")) {
    $("fiscaliteNetPreview").textContent =
      "Net imposable estimé : " + money(estimateTaxableIncomeFromGross(yearGross));
  }

  if ($("fiscaliteKmDeductionPreview")) {
    $("fiscaliteKmDeductionPreview").textContent =
      "Frais km déduits : " + money(totalKmAmountForTax);
  }

  if ($("fiscaliteOtherIncomePreview")) {
    $("fiscaliteOtherIncomePreview").textContent =
      "Revenus complémentaires : " + money(complementaryIncome);
  }

  if ($("fiscaliteTotalIncomePreview")) {
    const currentTaxableBase = Math.max(
      0,
      estimateTaxableIncomeFromGross(yearGross) + complementaryIncome - totalKmAmountForTax
    );

    $("fiscaliteTotalIncomePreview").textContent =
      "Base imposable estimée : " + money(currentTaxableBase);
  }

  if ($("fiscaliteProjectionPreview")) {
    if (observedMonths > 0) {
      const projectedBase = Math.max(
        0,
        estimateTaxableIncomeFromGross(projectedGross) + complementaryIncome - projectedKmAmount
      );

      $("fiscaliteProjectionPreview").textContent =
        "Projection annuelle : " + money(projectedBase) +
        " sur " + observedMonths + " mois renseigné" + (observedMonths > 1 ? "s" : "");
    } else {
      $("fiscaliteProjectionPreview").textContent = "Projection annuelle : ajoute une mission";
    }
  }

  if ($("fiscaliteTaxPreview")) {
    const currentTaxableBase = Math.max(
      0,
      estimateTaxableIncomeFromGross(yearGross) + complementaryIncome - totalKmAmountForTax
    );
    const projectedTaxableBase = observedMonths > 0
      ? Math.max(0, estimateTaxableIncomeFromGross(projectedGross) + complementaryIncome - projectedKmAmount)
      : currentTaxableBase;

    const taxableIncome = projectedTaxableBase || currentTaxableBase;
    const parts = getTaxParts();

    if (taxableIncome > 0 && parts > 0) {
      const taxResult = calculateProgressiveTax(taxableIncome, parts);
      $("fiscaliteTaxPreview").textContent = "Impôt estimé projeté : " + money(taxResult.estimatedTax);

      if ($("fiscaliteRatePreview")) {
        $("fiscaliteRatePreview").textContent =
          "Taux moyen estimé : " + taxResult.averageRate.toFixed(1).replace(".", ",") + "%";
      }

      if ($("fiscaliteBracketPreview")) {
        $("fiscaliteBracketPreview").textContent =
          "Tranche marginale estimée : " + Math.round(taxResult.marginalRate) + "%";
      }
    } else {
      $("fiscaliteTaxPreview").textContent = "Impôt estimé : ajoute tes missions et tes parts";
      if ($("fiscaliteRatePreview")) $("fiscaliteRatePreview").textContent = "Taux moyen estimé : -";
      if ($("fiscaliteBracketPreview")) $("fiscaliteBracketPreview").textContent = "Tranche marginale estimée : -";
    }
  }

  if ($("fiscaliteKmPreview")) {
    const totalKm = Math.round(yearMissions.reduce((a, x) => a + Number(x.kmDistance || 0), 0));
    $("fiscaliteKmPreview").textContent = totalKm + " km enregistrés";
  }

  if ($("fiscaliteKmAmountPreview")) {
    const totalKmAmount = yearMissions.reduce((a, x) => a + Number(x.kmAmount || 0), 0);
    $("fiscaliteKmAmountPreview").textContent = money(totalKmAmount) + " estimés";
  }

  if ($("fiscaliteDeclarationPreview")) {
    const totalKmAmount = yearMissions.reduce((a, x) => a + Number(x.kmAmount || 0), 0);
    $("fiscaliteDeclarationPreview").textContent = "Brut " + money(yearGross) + " · Frais km " + money(totalKmAmount);
  }

  if ($("previsionConges")) {
    const estimatedConges = Math.round(yearGross * 0.10);
    $("previsionConges").textContent = yearGross > 0
      ? "Environ " + money(estimatedConges) + " brut"
      : "Estimation indicative";
  }

  if ($("previsionDroits")) {
    $("previsionDroits").textContent = remaining + "h restantes";
  }

  if ($("previsionTaux") && !$("areHours")?.value && !$("areDailyGross")?.value) {
    $("previsionTaux").textContent = "Renseigne tes heures et ton brut journée";
  }

  if ($("previsionCarence")) {
    $("previsionCarence").textContent = "Non calculé pour le moment";
  }

  renderChart(yearHours, plannedHours);
  renderHistory();
  renderAllMissions();
  renderCalendar();
  renderActualisation();
  renderDocuments();
}

function polarToCartesian(cx, cy, rx, ry, angle) {
  const rad = (angle - 90) * Math.PI / 180;
  return {
    x: cx + rx * Math.cos(rad),
    y: cy + ry * Math.sin(rad)
  };
}

function renderChart(doneHours, plannedHours = 0) {
  const total = OBJECTIVE_HOURS;
  const maxPercent = MAX_DISPLAY_PERCENT;
  const maxHours = total * (maxPercent / 100);

  const doneRaw = Math.max(0, Number(doneHours) || 0);
  const plannedRaw = Math.max(0, Number(plannedHours) || 0);
  const totalRaw = doneRaw + plannedRaw;

  const donePercent = Math.round((doneRaw / total) * 100);
  const plannedPercent = Math.round((plannedRaw / total) * 100);
  const totalPercent = donePercent + plannedPercent;

  const doneVisibleHours = Math.min(doneRaw, maxHours);
  const plannedVisibleHours = Math.min(plannedRaw, Math.max(0, maxHours - doneVisibleHours));
  const remainVisibleHours = Math.max(0, maxHours - doneVisibleHours - plannedVisibleHours);

  const cx = 250;
  const cy = 118;
  const rx = 150;
  const ry = 92;
  const depth = 28;

  const doneAngle = (doneVisibleHours / maxHours) * 360;
  const plannedAngle = (plannedVisibleHours / maxHours) * 360;

  function polarLabel(angle, ratio = 0.58) {
    const rad = (angle - 90) * Math.PI / 180;
    return {
      x: cx + rx * ratio * Math.cos(rad),
      y: cy + ry * ratio * Math.sin(rad)
    };
  }

  function wedge(startAngle, endAngle, fill) {
    if (endAngle <= startAngle) return "";

    if (endAngle - startAngle >= 359.9) {
      return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="#ffffff" stroke-width="3"/>`;
    }

    const start = polarToCartesian(cx, cy, rx, ry, endAngle);
    const end = polarToCartesian(cx, cy, rx, ry, startAngle);
    const large = endAngle - startAngle <= 180 ? 0 : 1;

    return `<path d="M ${cx} ${cy} L ${start.x} ${start.y} A ${rx} ${ry} 0 ${large} 0 ${end.x} ${end.y} Z" fill="${fill}" stroke="#ffffff" stroke-width="3"/>`;
  }

  const doneLabel = polarLabel(doneAngle / 2);
  const plannedLabel = polarLabel(doneAngle + plannedAngle / 2);

  if (!$("chart")) return;

  $("chart").innerHTML = `
    <svg viewBox="0 0 520 305" role="img" aria-label="Camembert progression heures effectuées et prévues">
      <defs>
        <linearGradient id="doneTop" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#7A9E7E"/>
          <stop offset="100%" stop-color="#1F4E5F"/>
        </linearGradient>
        <linearGradient id="plannedTop" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#FDBA74"/>
          <stop offset="100%" stop-color="#F97316"/>
        </linearGradient>
        <linearGradient id="remainTop" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#EEF4F1"/>
          <stop offset="100%" stop-color="#D8E4DF"/>
        </linearGradient>
        <linearGradient id="side" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#C7D8D1"/>
          <stop offset="100%" stop-color="#AABDB5"/>
        </linearGradient>
      </defs>

      <ellipse cx="250" cy="165" rx="168" ry="92" fill="rgba(31,78,95,.12)"/>
      <ellipse cx="${cx}" cy="${cy + depth}" rx="${rx}" ry="${ry}" fill="url(#side)"/>
      <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#remainTop)" stroke="#ffffff" stroke-width="3"/>

      ${doneVisibleHours > 0 ? wedge(0, doneAngle, "url(#doneTop)") : ""}
      ${plannedVisibleHours > 0 ? wedge(doneAngle, doneAngle + plannedAngle, "url(#plannedTop)") : ""}

      ${donePercent > 0 ? `<text x="${doneLabel.x}" y="${doneLabel.y + 7}" text-anchor="middle" class="piePercent">${donePercent}%</text>` : ""}
      ${plannedPercent > 0 ? `<text x="${plannedLabel.x}" y="${plannedLabel.y + 7}" text-anchor="middle" class="piePercent">${plannedPercent}%</text>` : ""}

      <text x="${cx}" y="252" text-anchor="middle" class="pieTotal">Total potentiel : ${totalPercent}%</text>

      <rect x="62" y="278" width="13" height="13" rx="4" fill="#1F4E5F"/>
      <text x="82" y="289" class="legendText">Effectué</text>

      <rect x="220" y="278" width="13" height="13" rx="4" fill="#F97316"/>
      <text x="240" y="289" class="legendText">Prévu</text>

      <rect x="360" y="278" width="13" height="13" rx="4" fill="#D8E4DF"/>
      <text x="380" y="289" class="legendMuted">Restant</text>
    </svg>
  `;
}

function renderHistory() {
  $("historyMonthTitle").textContent = current.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric"
  });

  const sorted = [...monthMissions(current)].sort((a, b) => new Date(b.date) - new Date(a.date));
  const missionsEl = $("missions");
  missionsEl.innerHTML = sorted.length ? "" : `<div class="empty">Aucune mission sur ce mois.</div>`;

  sorted.forEach((mission) => {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <div>${formatPeriod(mission.date, mission.endDate)}</div>
      <div><b>${mission.production}</b></div>
      <div><span class="pill">${mission.type}</span></div>
      <div>${mission.hours}h</div>
      <div>${money(mission.gross)}</div>
      <div>
        <button class="ghost" data-edit="${mission.id}" type="button">Modifier</button>
        <button class="delete" data-delete="${mission.id}" type="button">X</button>
      </div>
    `;
    missionsEl.appendChild(row);
  });
}

function renderAllMissions() {
  const allMissionsEl = $("allMissions");
  const sorted = [...missions].sort((a, b) => new Date(b.date) - new Date(a.date));

  if (!allMissionsEl) return;

  if (!sorted.length) {
    allMissionsEl.innerHTML = `<div class="empty">Aucune mission enregistrée.</div>`;
    return;
  }

  const groups = {};

  sorted.forEach((mission) => {
    const key = mission.production || "Sans production";
    if (!groups[key]) groups[key] = [];
    groups[key].push(mission);
  });

  allMissionsEl.innerHTML = `
    <div class="production-grid">
      ${Object.keys(groups).sort((a, b) => a.localeCompare(b, "fr")).map((production) => {
        const list = groups[production];
        const totalHours = Math.round(list.reduce((a, x) => a + Number(x.hours || 0), 0) * 10) / 10;
        const totalGross = list.reduce((a, x) => a + Number(x.gross || 0), 0);
        const totalDays = sumMissionDays(list);

        return `
          <button class="production-card" type="button" data-production-open="${production.replace(/"/g, "&quot;")}">
            <div class="production-card-icon" aria-hidden="true">🎬</div>
            <strong>${production}</strong>
            <span>${list.length} mission${list.length > 1 ? "s" : ""}</span>
            <span>${totalDays} jour${totalDays > 1 ? "s" : ""}</span>
            <span>${totalHours}h · ${money(totalGross)}</span>
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function openProductionMissions(productionName) {
  const allMissionsEl = $("allMissions");
  if (!allMissionsEl) return;

  const list = missions
    .filter((mission) => mission.production === productionName)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  allMissionsEl.innerHTML = `
    <div class="production-detail-head">
      <button class="ghost" type="button" data-production-back>‹ Retour</button>
      <div>
        <h2>${productionName}</h2>
        <p class="sub">${list.length} mission${list.length > 1 ? "s" : ""} enregistrée${list.length > 1 ? "s" : ""}</p>
      </div>
    </div>

    <div class="row header">
      <div>Période</div>
      <div>Production</div>
      <div>Mission</div>
      <div>Heures</div>
      <div>Brut</div>
      <div></div>
    </div>

    <div id="productionMissionRows"></div>
  `;

  const rows = $("productionMissionRows");

  list.forEach((mission) => {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <div>${formatPeriod(mission.date, mission.endDate)}</div>
      <div><b>${mission.production}</b></div>
      <div><span class="pill">${mission.type}</span></div>
      <div>${mission.hours}h</div>
      <div>${money(mission.gross)}</div>
      <div>
        <button class="ghost" data-edit="${mission.id}" type="button">Modifier</button>
        <button class="delete" data-delete="${mission.id}" type="button">X</button>
      </div>
    `;
    rows.appendChild(row);
  });
}

function moveMonth(amount) {
  current.setMonth(current.getMonth() + amount);
  current.setDate(1);
  render();
}

function renderCalendar() {
  const calendar = $("calendar");
  calendar.innerHTML = "";

  const names = ["L", "M", "M", "J", "V", "S", "D"];
  names.forEach((name) => {
    const el = document.createElement("div");
    el.className = "dayname";
    el.textContent = name;
    calendar.appendChild(el);
  });

  const year = current.getFullYear();
  const month = current.getMonth();

  $("monthTitle").textContent = current.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric"
  });

  const first = new Date(year, month, 1);
  const start = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const totalSlots = Math.ceil((start + days) / 7) * 7;

  for (let i = 0; i < start; i++) {
    const empty = document.createElement("div");
    empty.className = "day empty-day";
    calendar.appendChild(empty);
  }

  for (let d = 1; d <= days; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const box = document.createElement("div");
    box.className = "day";

    const now = new Date();
    const today =
      now.getFullYear() +
      "-" +
      String(now.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(now.getDate()).padStart(2, "0");

    if (dateStr === today) {
      box.classList.add("today");
    }

    box.innerHTML = `<b>${d}</b>`;
    box.dataset.calendarDate = dateStr;

    const missionsOfDay = missions.filter((mission) =>
      isDateInPeriod(dateStr, mission)
    );

    if (missionsOfDay.length) {
      box.dataset.hasMission = "1";
    }

    missionsOfDay.forEach((mission) => {
        const isFuture = new Date(dateStr + "T00:00:00") > todayDateOnly();
        const initials = getProductionInitials(mission.production);
        const days = missionDayCount(mission);
        const dailyHours = Math.round((Number(mission.hours || 0) / days) * 10) / 10;
        const dailyGross = Math.round(Number(mission.gross || 0) / days);
        const hours = `${String(dailyHours).replace(".5", ",5")}H`;
        const gross = `${dailyGross}€`;

        box.innerHTML += `
          <div class="dot ${isFuture ? "planned" : ""}" title="${mission.production} - ${mission.hours}h - ${money(mission.gross)}">
            ${initials} ${hours} ${gross}
          </div>
        `;
      });

    calendar.appendChild(box);
  }

  const usedSlots = start + days;
  for (let i = usedSlots; i < totalSlots; i++) {
    const empty = document.createElement("div");
    empty.className = "day empty-day";
    calendar.appendChild(empty);
  }
}

function buildActualisationText() {
  const list = monthMissions(current)
    .filter((mission) => new Date(mission.date + "T00:00:00") <= todayDateOnly())
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const title = current.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const totalHours = Math.round(sumDone(list) * 10) / 10;
  const totalGross = list.reduce((a, x) => a + Number(x.gross || 0), 0);
  const totalDays = sumMissionDays(list);

  const lines = [`Actualisation ${title}`, "", `Total journées : ${totalDays}`, `Total heures : ${totalHours}h`, `Total brut : ${money(totalGross)}`, ""];

  list.forEach((mission, index) => {
    lines.push(`${index + 1}. ${mission.production}`);
    lines.push(`Période : ${formatPeriod(mission.date, mission.endDate)}`);
    lines.push(`Mission : ${mission.type}`);
    lines.push(`Heures : ${mission.hours}h`);
    lines.push(`Brut : ${money(mission.gross)}`);
    lines.push("");
  });

  return lines.join("\n");
}

function renderActualisation() {
  if (!$('actualisationMonthTitle')) return;

  const list = monthMissions(current)
    .filter((mission) => new Date(mission.date + "T00:00:00") <= todayDateOnly())
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const totalHours = Math.round(sumDone(list) * 10) / 10;
  const totalGross = list.reduce((a, x) => a + Number(x.gross || 0), 0);
  const totalDays = sumMissionDays(list);

  $('actualisationMonthTitle').textContent = current.toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric'
  });

  if ($('actualisationDays')) $('actualisationDays').textContent = totalDays;
  if ($('actualisationHours')) $('actualisationHours').textContent = totalHours + 'h';
  if ($('actualisationGross')) $('actualisationGross').textContent = money(totalGross);
  if ($('actualisationCount')) $('actualisationCount').textContent = list.length;

  const container = $('actualisationList');
  if (!container) return;

  if (!list.length) {
    container.innerHTML = `<div class="empty">Aucune mission effectuée sur ce mois.</div>`;
    return;
  }

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const rows = list.map((mission) => `
    <tr>
      <td style="padding:12px 10px;border-bottom:1px solid #E2E8F0;font-size:14px;white-space:nowrap;">${escapeHtml(formatPeriod(mission.date, mission.endDate))}</td>
      <td style="padding:12px 10px;border-bottom:1px solid #E2E8F0;font-size:14px;"><strong style="color:#1F4E5F;">${escapeHtml(mission.production)}</strong></td>
      <td style="padding:12px 10px;border-bottom:1px solid #E2E8F0;font-size:14px;">${escapeHtml(mission.type)}</td>
      <td style="padding:12px 10px;border-bottom:1px solid #E2E8F0;font-size:14px;text-align:right;white-space:nowrap;">${escapeHtml(mission.hours)}h</td>
      <td style="padding:12px 10px;border-bottom:1px solid #E2E8F0;font-size:14px;text-align:right;white-space:nowrap;">${escapeHtml(money(mission.gross))}</td>
    </tr>
  `).join('');

  container.innerHTML = `
    <div style="margin-top:14px;border:1px solid #E2E8F0;border-radius:18px;overflow:hidden;background:#FFFFFF;box-shadow:0 8px 20px rgba(31,78,95,.04);">
      <div style="padding:14px 16px;background:#F8FAF9;border-bottom:1px solid #E2E8F0;">
        <strong style="display:block;color:#1F4E5F;font-size:16px;">Détail des missions du mois</strong>
        <span style="display:block;color:#718096;font-size:12px;margin-top:3px;">Récapitulatif prêt pour l'actualisation</span>
      </div>

      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;min-width:620px;">
          <thead>
            <tr>
              <th style="padding:11px 10px;text-align:left;font-size:11px;text-transform:uppercase;color:#718096;border-bottom:2px solid #E2E8F0;">Période</th>
              <th style="padding:11px 10px;text-align:left;font-size:11px;text-transform:uppercase;color:#718096;border-bottom:2px solid #E2E8F0;">Production</th>
              <th style="padding:11px 10px;text-align:left;font-size:11px;text-transform:uppercase;color:#718096;border-bottom:2px solid #E2E8F0;">Mission</th>
              <th style="padding:11px 10px;text-align:right;font-size:11px;text-transform:uppercase;color:#718096;border-bottom:2px solid #E2E8F0;">Heures</th>
              <th style="padding:11px 10px;text-align:right;font-size:11px;text-transform:uppercase;color:#718096;border-bottom:2px solid #E2E8F0;">Brut</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function copyActualisation() {
  const text = buildActualisationText();
  await navigator.clipboard.writeText(text);
  alert("Récapitulatif copié.");
}

function generateActualisationPDF() {
  const list = monthMissions(current)
    .filter((mission) => new Date(mission.date + "T00:00:00") <= todayDateOnly())
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const title = current.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric"
  });

  const totalHours = Math.round(sumDone(list) * 10) / 10;
  const totalGross = list.reduce((a, x) => a + Number(x.gross || 0), 0);
  const totalDays = sumMissionDays(list);

  const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  const rows = list.map((mission) => `
    <tr>
      <td>${escapeHtml(formatPeriod(mission.date, mission.endDate))}</td>
      <td><strong>${escapeHtml(mission.production)}</strong></td>
      <td>${escapeHtml(mission.type)}</td>
      <td>${escapeHtml(mission.hours)}h</td>
      <td>${escapeHtml(money(mission.gross))}</td>
    </tr>
  `).join("");

  const win = window.open("", "_blank");

  if (!win) {
    alert("Impossible d'ouvrir la fenêtre PDF. Autorise les pop-ups pour ce site.");
    return;
  }

  win.document.write(`
    <!doctype html>
    <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <title>Actualisation ${escapeHtml(title)}</title>
        <style>
          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            font-family: Arial, sans-serif;
            color: #2D3748;
            background: #ffffff;
            padding: 34px;
          }

          .header {
            border-bottom: 3px solid #1F4E5F;
            padding-bottom: 16px;
            margin-bottom: 22px;
          }

          h1 {
            margin: 0;
            color: #1F4E5F;
            font-size: 28px;
            letter-spacing: -0.03em;
          }

          .subtitle {
            color: #718096;
            margin: 6px 0 0;
            font-size: 14px;
          }

          .summary {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin: 22px 0 24px;
          }

          .summary-box {
            border: 1px solid #E2E8F0;
            border-radius: 14px;
            padding: 14px;
            background: #F8FAF9;
          }

          .summary-box strong {
            display: block;
            color: #1F4E5F;
            font-size: 24px;
            line-height: 1.1;
          }

          .summary-box span {
            display: block;
            margin-top: 4px;
            color: #718096;
            font-size: 12px;
            text-transform: uppercase;
            font-weight: 700;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
          }

          th {
            text-align: left;
            color: #718096;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.03em;
            padding: 10px 8px;
            border-bottom: 2px solid #E2E8F0;
          }

          td {
            padding: 12px 8px;
            border-bottom: 1px solid #E2E8F0;
            font-size: 14px;
            vertical-align: top;
          }

          tr:nth-child(even) td {
            background: #FBFCFC;
          }

          .empty {
            padding: 20px;
            text-align: center;
            color: #718096;
            border: 1px solid #E2E8F0;
            border-radius: 14px;
            background: #F8FAF9;
          }

          .footer {
            margin-top: 26px;
            padding-top: 12px;
            border-top: 1px solid #E2E8F0;
            font-size: 12px;
            color: #718096;
            line-height: 1.45;
          }

          @media print {
            body {
              padding: 20px;
            }

            .summary-box,
            tr:nth-child(even) td {
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }
          }
        </style>
      </head>

      <body>
        <div class="header">
          <h1>Récapitulatif actualisation</h1>
          <p class="subtitle">${escapeHtml(title)} · Généré avec Intermitrack</p>
        </div>

        <div class="summary">
          <div class="summary-box">
            <strong>${escapeHtml(totalDays)}</strong>
            <span>Journées</span>
          </div>
          <div class="summary-box">
            <strong>${escapeHtml(totalHours)}h</strong>
            <span>Heures</span>
          </div>
          <div class="summary-box">
            <strong>${escapeHtml(money(totalGross))}</strong>
            <span>Brut total</span>
          </div>
        </div>

        ${list.length ? `
          <table>
            <thead>
              <tr>
                <th>Période</th>
                <th>Production</th>
                <th>Mission</th>
                <th>Heures</th>
                <th>Brut</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        ` : `
          <div class="empty">Aucune mission effectuée sur ce mois.</div>
        `}

        <p class="footer">
          Ce document est un récapitulatif personnel destiné à faciliter l'actualisation mensuelle.
          Les informations doivent être vérifiées par l'utilisateur avant déclaration officielle.
        </p>
      </body>
    </html>
  `);

  win.document.close();
  win.focus();
  win.print();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
  if (submitBtn) {
    submitBtn.textContent = "Enregistrer la mission";
  }
}

function renderCalendarDayPanel(dateStr) {
  const form = $("missionForm");
  if (!form) return;

  let panel = $("calendarDayPanel");

  if (!panel) {
    panel = document.createElement("div");
    panel.id = "calendarDayPanel";
    panel.className = "calendar-day-panel";
    form.insertAdjacentElement("afterend", panel);
  }

  const dayMissions = missions
    .filter((mission) => isDateInPeriod(dateStr, mission))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const dateLabel = formatDate(dateStr);

  if (!dayMissions.length) {
    panel.innerHTML = `
      <div class="calendar-day-panel-head">
        <div>
          <strong>${escapeHtml(dateLabel)}</strong>
          <span>Aucune mission prévue ce jour-là.</span>
        </div>
      </div>
      <p class="hint">Le formulaire est prêt pour ajouter une mission à cette date.</p>
    `;
    return;
  }

  panel.innerHTML = `
    <div class="calendar-day-panel-head">
      <div>
        <strong>Missions du ${escapeHtml(dateLabel)}</strong>
        <span>${dayMissions.length} mission${dayMissions.length > 1 ? "s" : ""} prévue${dayMissions.length > 1 ? "s" : ""} ce jour-là.</span>
      </div>
      <button class="ghost" type="button" data-calendar-add-date="${escapeHtml(dateStr)}">Ajouter une autre mission</button>
    </div>

    <div class="calendar-day-missions">
      ${dayMissions.map((mission) => {
        const totalDays = missionDayCount(mission);
        const dailyHours = Math.round((Number(mission.hours || 0) / totalDays) * 10) / 10;
        const dailyGross = Math.round(Number(mission.gross || 0) / totalDays);

        return `
          <div class="calendar-day-mission">
            <div>
              <strong>${escapeHtml(mission.production)}</strong>
              <span>${escapeHtml(mission.type)} · ${dailyHours}h · ${money(dailyGross)}</span>
            </div>
            <div class="calendar-day-actions">
              <button class="ghost" type="button" data-edit="${escapeHtml(mission.id)}">Modifier</button>
              <button class="delete" type="button" data-delete="${escapeHtml(mission.id)}">X</button>
            </div>
          </div>
        `;
      }).join("")}
    </div>

    <p class="hint">Pour ajouter une deuxième mission le même jour, remplis le formulaire au-dessus.</p>
  `;
}

function openCalendarDay(dateStr) {
  activateView("missions");
  resetMissionFormForDate(dateStr);
  renderCalendarDayPanel(dateStr);

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
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
    let result;
    if (authMode === "signup" && password.length < 6) {
  $("authMsg").textContent =
    "Le mot de passe doit contenir au moins 6 caractères.";
  return;
}

    if (authMode === "signup") result = await sb.auth.signUp({ email, password });
    else result = await sb.auth.signInWithPassword({ email, password });

    if (result.error) {
      $("authMsg").textContent = "Erreur : " + result.error.message;
      return;
    }

    if (authMode === "signup") {
      $("authMsg").textContent = "Compte créé. Vérifiez votre boîte mail si une confirmation est demandée.";
    }

    await init();
  });

  $("missionForm").addEventListener("submit", addMission);
  if ($("kmDistance")) $("kmDistance").addEventListener("input", updateKmPreview);
  if ($("kmRate")) $("kmRate").addEventListener("input", updateKmPreview);
  if ($("saveTaxSettingsBtn")) $("saveTaxSettingsBtn").addEventListener("click", () => {
    setOtherIncome($("otherIncomeInput")?.value || 0);
    setTaxParts($("taxPartsInput")?.value || 1);
    render();
    alert("Nombre de parts enregistré.");
  });
  if ($("documentForm")) $("documentForm").addEventListener("submit", uploadDocument);
  if ($("refreshDocumentsBtn")) $("refreshDocumentsBtn").addEventListener("click", loadDocuments);
if ($("calculateAreBtn")) $("calculateAreBtn").addEventListener("click", calculateEstimatedAreDailyRate);
  $("date").addEventListener("change", () => {
    if (!$("endDate").value || $("endDate").value < $("date").value) {
      $("endDate").value = $("date").value;
    }
  });

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => activateView(tab.dataset.view));
  });

  $("historyPrevBtn").addEventListener("click", () => moveMonth(-1));
  $("historyNextBtn").addEventListener("click", () => moveMonth(1));
  $("calendarPrevBtn").addEventListener("click", () => moveMonth(-1));
  $("calendarNextBtn").addEventListener("click", () => moveMonth(1));

  if ($("actualisationPrevBtn")) $("actualisationPrevBtn").addEventListener("click", () => moveMonth(-1));
  if ($("actualisationNextBtn")) $("actualisationNextBtn").addEventListener("click", () => moveMonth(1));
  if ($("copyActualisationBtn")) $("copyActualisationBtn").addEventListener("click", copyActualisation);
  if ($("pdfActualisationBtn")) $("pdfActualisationBtn").addEventListener("click", generateActualisationPDF);

  document.addEventListener("click", async (event) => {
    const docProductionOpen = event.target.closest("[data-doc-production-open]");
    if (docProductionOpen) {
      openDocumentProduction = docProductionOpen.dataset.docProductionOpen;
      documentFilter = "Tous";
      renderDocuments();
      return;
    }

    const docProductionBack = event.target.closest("[data-doc-production-back]");
    if (docProductionBack) {
      openDocumentProduction = null;
      documentFilter = "Tous";
      renderDocuments();
      return;
    }

    const docFilterButton = event.target.closest("[data-doc-filter]");
    if (docFilterButton) {
      documentFilter = docFilterButton.dataset.docFilter;
      renderDocuments();
      return;
    }

    const calendarDay = event.target.closest("[data-calendar-date]");
    if (calendarDay) {
      openCalendarDay(calendarDay.dataset.calendarDate);
      return;
    }

    const calendarAddButton = event.target.closest("[data-calendar-add-date]");
    if (calendarAddButton) {
      resetMissionFormForDate(calendarAddButton.dataset.calendarAddDate);
      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
      return;
    }
    const productionOpenButton = event.target.closest("[data-production-open]");
    if (productionOpenButton) {
      openProductionMissions(productionOpenButton.dataset.productionOpen);
      return;
    }

    const productionBackButton = event.target.closest("[data-production-back]");
    if (productionBackButton) {
      renderAllMissions();
      return;
    }

    const openButton = event.target.closest("[data-doc-open]");
    if (openButton) {
      await openDocument(openButton.dataset.docOpen);
      return;
    }

    const downloadButton = event.target.closest("[data-doc-download]");
    if (downloadButton) {
      await downloadDocument(downloadButton.dataset.docDownload, downloadButton.dataset.docName);
      return;
    }

    const docDeleteButton = event.target.closest("[data-doc-delete]");
    if (docDeleteButton) {
      await deleteDocument(docDeleteButton.dataset.docDelete, docDeleteButton.dataset.docPath);
      return;
    }

    const editButton = event.target.closest("[data-edit]");
    if (editButton) {
      editMission(editButton.dataset.edit);
      return;
    }

    const deleteButton = event.target.closest("[data-delete]");
    if (!deleteButton) return;
    await deleteMission(deleteButton.dataset.delete);
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
  });

  if ($("installBtn")) $("installBtn").addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      alert("Sur iPhone : ouvrez Safari, bouton Partager, puis Ajouter à l'écran d'accueil. Sur Android : menu du navigateur, puis Installer l'application.");
      return;
    }

    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
  });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js");
  });
}

sb.auth.onAuthStateChange((_event, session) => {
  currentUser = session?.user || null;
  if (currentUser) {
    showApp();
    loadMissions();
    loadDocuments();
  } else {
    showAuth();
  }
});

setupEvents();
init();
