const SUPABASE_URL = "https://upeogpgczoghlfwblnkb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwZW9ncGdjem9naGxmd2JsbmtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MjkyMDQsImV4cCI6MjA5NjEwNTIwNH0.6535_0KMaEDLxTMhz_OX-4OqC_tpQsPJR5jkFQL7UqI";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let authMode = "login";
let currentUser = null;
let missions = [];
let current = new Date();
let deferredInstallPrompt = null;

const OBJECTIVE_HOURS = 507;

const $ = (id) => document.getElementById(id);

function setDefaultDates() {
  const today = new Date();

  if ($("date")) {
    $("date").valueAsDate = today;
  }

  if ($("endDate")) {
    $("endDate").valueAsDate = today;
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
  $("accountEmail").textContent = currentUser?.email || "-";
}

async function init() {
  setDefaultDates();

  const {
    data: { session }
  } = await sb.auth.getSession();

  currentUser = session?.user || null;

  if (!currentUser) {
    showAuth();
    return;
  }

  showApp();
  await loadMissions();
}

async function logout() {
  await sb.auth.signOut();

  currentUser = null;
  missions = [];

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
    gross: Number(x.gross_amount || 0)
  }));

  render();
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
    gross_amount: Number($("gross").value)
  };

  const { error } = await sb.from("missions").insert(payload);

  if (error) {
    alert("Erreur sauvegarde : " + error.message);
    return;
  }

  $("missionForm").reset();
  setDefaultDates();

  current = new Date(payload.mission_date + "T00:00:00");
  current.setDate(1);

  await loadMissions();
  activateView("dashboard");
}

async function deleteMission(id) {
  if (!confirm("Supprimer cette mission ?")) {
    return;
  }

  const { error } = await sb
    .from("missions")
    .delete()
    .eq("id", id);

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
}

function money(n) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  }).format(n || 0);
}

function moneyCompact(n) {
  return `${Math.round(Number(n || 0))}€`;
}

function productionCode(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 3)
    .toUpperCase() || "MIS";
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

  if (end < today) {
    return { done: totalHours, planned: 0 };
  }

  if (start > today) {
    return { done: 0, planned: totalHours };
  }

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

function render() {
  const now = new Date();
  const year = now.getFullYear();

  const yearMissions = missions.filter((mission) => {
    return new Date(mission.date + "T00:00:00").getFullYear() === year;
  });

  const selectedMonthMissions = monthMissions(current);

  const yearHours = Math.round(sumDone(yearMissions) * 10) / 10;
  const plannedHours = Math.round(sumPlanned(yearMissions) * 10) / 10;
  const monthHours = Math.round(sumDone(selectedMonthMissions) * 10) / 10;

  const yearGross = yearMissions.reduce((a, x) => a + Number(x.gross || 0), 0);
  const monthGross = selectedMonthMissions.reduce((a, x) => a + Number(x.gross || 0), 0);

  const percent = Math.min(100, Math.round((yearHours / OBJECTIVE_HOURS) * 100));
  const remaining = Math.max(0, OBJECTIVE_HOURS - yearHours);

  $("yearHours").textContent = yearHours;
  $("monthHours").textContent = monthHours + "h";
  $("monthGross").textContent = money(monthGross);
  $("yearGross").textContent = money(yearGross);
  $("remainingHours").textContent = remaining + "h";
  $("missionCount").textContent = missions.length;
  $("progressText").textContent = percent + "% de ton objectif intermittent";

  renderChart(yearHours, plannedHours);
  renderHistory();
  renderAllMissions();
  renderCalendar();
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
  const done = Math.max(0, Math.min(Number(doneHours) || 0, total));
  const planned = Math.max(0, Math.min(Number(plannedHours) || 0, Math.max(0, total - done)));
  const remain = Math.max(0, total - done - planned);

  const donePercent = Math.round((done / total) * 100);
  const plannedPercent = Math.round((planned / total) * 100);
  const potentialPercent = Math.min(100, donePercent + plannedPercent);

  const cx = 310;
  const cy = 142;
  const rx = 158;
  const ry = 94;
  const depth = 34;

  const doneAngle = (done / total) * 360;
  const plannedAngle = (planned / total) * 360;

  function wedge(startAngle, endAngle, fill) {
    if (endAngle <= startAngle) {
      return "";
    }

    if (endAngle - startAngle >= 359.9) {
      return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="#ffffff" stroke-width="3"/>`;
    }

    const start = polarToCartesian(cx, cy, rx, ry, endAngle);
    const end = polarToCartesian(cx, cy, rx, ry, startAngle);
    const large = endAngle - startAngle <= 180 ? 0 : 1;

    return `<path d="M ${cx} ${cy} L ${start.x} ${start.y} A ${rx} ${ry} 0 ${large} 0 ${end.x} ${end.y} Z" fill="${fill}" stroke="#ffffff" stroke-width="3"/>`;
  }

  if (!$("chart")) {
    return;
  }

  $("chart").innerHTML = `
    <svg viewBox="0 0 620 350" role="img" aria-label="Camembert progression heures effectuées et prévues">
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

      <ellipse cx="${cx}" cy="${cy + depth + 10}" rx="182" ry="103" fill="rgba(31,78,95,.12)"/>
      <ellipse cx="${cx}" cy="${cy + depth}" rx="${rx}" ry="${ry}" fill="url(#side)"/>
      <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#remainTop)" stroke="#ffffff" stroke-width="3"/>

      ${done > 0 ? wedge(0, doneAngle, "url(#doneTop)") : ""}
      ${planned > 0 ? wedge(doneAngle, doneAngle + plannedAngle, "url(#plannedTop)") : ""}

      <text x="${cx}" y="${cy - 12}" text-anchor="middle" class="pieText">${donePercent}%</text>
      <text x="${cx}" y="${cy + 16}" text-anchor="middle" class="pieSub">${done}h faites</text>
      <text x="${cx}" y="${cy + 36}" text-anchor="middle" class="pieSub">+ ${planned}h prévues</text>

      <g class="chartLegend">
        <rect x="68" y="284" width="16" height="16" rx="5" fill="#1F4E5F"/>
        <text x="92" y="297" class="legendText">Effectué : ${done}h / ${donePercent}%</text>

        <rect x="250" y="284" width="16" height="16" rx="5" fill="#F97316"/>
        <text x="274" y="297" class="legendText">Prévu : ${planned}h / ${plannedPercent}%</text>

        <rect x="426" y="284" width="16" height="16" rx="5" fill="#D8E4DF"/>
        <text x="450" y="297" class="legendMuted">Total : ${potentialPercent}%</text>
      </g>
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
      <div><button class="delete" data-delete="${mission.id}">X</button></div>
    `;

    missionsEl.appendChild(row);
  });
}

function renderAllMissions() {
  const allMissionsEl = $("allMissions");
  const sorted = [...missions].sort((a, b) => new Date(b.date) - new Date(a.date));

  allMissionsEl.innerHTML = sorted.length ? "" : `<div class="empty">Aucune mission enregistrée.</div>`;

  sorted.forEach((mission) => {
    const row = document.createElement("div");
    row.className = "row";

    row.innerHTML = `
      <div>${formatPeriod(mission.date, mission.endDate)}</div>
      <div><b>${mission.production}</b></div>
      <div><span class="pill">${mission.type}</span></div>
      <div>${mission.hours}h</div>
      <div>${money(mission.gross)}</div>
      <div><button class="delete" data-delete="${mission.id}">X</button></div>
    `;

    allMissionsEl.appendChild(row);
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
  const totalCells = 42;

  for (let cell = 0; cell < totalCells; cell++) {
    const dayNumber = cell - start + 1;
    const box = document.createElement("div");

    if (dayNumber < 1 || dayNumber > days) {
      box.className = "day blank";
      calendar.appendChild(box);
      continue;
    }

    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
    box.className = "day";

    if (dateStr === new Date().toISOString().slice(0, 10)) {
      box.classList.add("today");
    }

    box.innerHTML = `<b>${dayNumber}</b>`;

    missions
      .filter((mission) => isDateInPeriod(dateStr, mission))
      .forEach((mission) => {
        const isFuture = new Date(dateStr + "T00:00:00") > todayDateOnly();
        const label = `${productionCode(mission.production)} ${mission.hours}H ${moneyCompact(mission.gross)}`;

        box.innerHTML += `<div class="dot ${isFuture ? "planned" : ""}" title="${mission.production} - ${mission.hours}h - ${money(mission.gross)}">${label}</div>`;
      });

    calendar.appendChild(box);
  }
}

function setupEvents() {
  $("loginModeBtn").addEventListener("click", () => setAuthMode("login"));
  $("signupModeBtn").addEventListener("click", () => setAuthMode("signup"));
  $("logoutBtn").addEventListener("click", logout);

  $("authForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    $("authMsg").textContent = "Chargement...";

    const email = $("authEmail").value.trim();
    const password = $("authPassword").value;
    let result;

    if (authMode === "signup") {
      result = await sb.auth.signUp({ email, password });
    } else {
      result = await sb.auth.signInWithPassword({ email, password });
    }

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

  document.addEventListener("click", async (event) => {
    const deleteButton = event.target.closest("[data-delete]");

    if (!deleteButton) {
      return;
    }

    await deleteMission(deleteButton.dataset.delete);
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
  });

  $("installBtn").addEventListener("click", async () => {
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
  } else {
    showAuth();
  }
});

setupEvents();
init();
