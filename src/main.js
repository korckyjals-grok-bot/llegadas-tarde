import {
  filterStudents,
  formatGradeSection,
  importRosterCsv,
} from "./csv.js";
import {
  addLateEntry,
  clearLatesForDay,
  clearRoster,
  getAllStudents,
  getLatesForDay,
  getMeta,
  getStudentCount,
  purgeOldLates,
  removeLateEntry,
  replaceRoster,
  setMeta,
  upsertStudents,
} from "./db.js";
import {
  formatDisplayDate,
  formatTimeOfDay,
  getDayKey,
} from "./day.js";
import { buildBothReports } from "./reports.js";

/** @type {import("./csv.js").Student[]} */
let roster = [];
/** @type {import("./reports.js").LateEntry[]} */
let todaysLates = [];
/** @type {string | null} */
let lastUndoId = null;
let toastTimer = 0;

const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

async function init() {
  registerServiceWorker();
  wireEvents();
  $("fecha-hoy").textContent = formatDisplayDate();

  const today = getDayKey();
  await purgeOldLates(today);
  await setMeta("activeDayKey", today);

  roster = await getAllStudents();
  todaysLates = await getLatesForDay(today);
  renderAll();

  const sawOnboarding = await getMeta("onboardingDone");
  if (!sawOnboarding && roster.length === 0) {
    /** @type {HTMLDialogElement} */ ($("dialog-primer-uso")).showModal();
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`;
    navigator.serviceWorker.register(swUrl).catch(() => {
      /* offline shell optional; ignore registration errors in file:// */
    });
  });
}

function wireEvents() {
  const search = /** @type {HTMLInputElement} */ ($("busqueda"));
  search.addEventListener("input", () => renderSearch(search.value));
  search.addEventListener("search", () => renderSearch(search.value));

  $("btn-ajustes").addEventListener("click", () => {
    updateRosterCount();
    /** @type {HTMLDialogElement} */ ($("dialog-ajustes")).showModal();
  });

  $("btn-deshacer").addEventListener("click", onUndo);
  $("btn-limpiar-hoy").addEventListener("click", onClearToday);
  $("btn-copiar-primaria").addEventListener("click", () => copyReport("primaria"));
  $("btn-copiar-secundaria").addEventListener("click", () =>
    copyReport("secundaria"),
  );

  $("csv-input").addEventListener("change", onCsvPicked);
  $("btn-demo").addEventListener("click", () => loadDemoRoster(true));
  $("btn-borrar-nomina").addEventListener("click", onDeleteRoster);

  $("primer-demo").addEventListener("click", async () => {
    await loadDemoRoster(false);
    await setMeta("onboardingDone", true);
    /** @type {HTMLDialogElement} */ ($("dialog-primer-uso")).close();
  });
  $("primer-vacio").addEventListener("click", async () => {
    await setMeta("onboardingDone", true);
    /** @type {HTMLDialogElement} */ ($("dialog-primer-uso")).close();
  });

  // Keep day boundary fresh if app stays open overnight
  setInterval(async () => {
    const today = getDayKey();
    const stored = await getMeta("activeDayKey");
    if (stored !== today) {
      await purgeOldLates(today);
      await setMeta("activeDayKey", today);
      todaysLates = [];
      lastUndoId = null;
      $("fecha-hoy").textContent = formatDisplayDate();
      renderAll();
      showToast("Nuevo día: lista de tarde reiniciada");
    }
  }, 60_000);
}

function renderAll() {
  renderSearch(/** @type {HTMLInputElement} */ ($("busqueda")).value);
  renderLateLists();
  renderReportPreviews();
  updateUndoBar();
  updateRosterCount();
}

function renderSearch(query) {
  const list = /** @type {HTMLUListElement} */ ($("resultados"));
  const empty = $("estado-busqueda");
  list.innerHTML = "";

  if (!query.trim()) {
    empty.hidden = false;
    empty.textContent =
      roster.length === 0
        ? "Nómina vacía. Abre Ajustes para importar CSV o cargar datos demo."
        : "Escribe un nombre para buscar.";
    return;
  }

  if (roster.length === 0) {
    empty.hidden = false;
    empty.textContent = "No hay estudiantes. Importa un CSV en Ajustes.";
    return;
  }

  const matches = filterStudents(roster, query);
  if (matches.length === 0) {
    empty.hidden = false;
    empty.textContent = "Sin coincidencias.";
    return;
  }

  empty.hidden = true;
  const frag = document.createDocumentFragment();
  for (const s of matches) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "result-btn";
    btn.setAttribute("role", "option");
    btn.innerHTML = `
      <span class="result-name">${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)}</span>
      <span class="result-meta">${escapeHtml(formatGradeSection(s))} · ${escapeHtml(labelLevel(s.level))}</span>
    `;
    btn.addEventListener("click", () => logLate(s));
    li.appendChild(btn);
    frag.appendChild(li);
  }
  list.appendChild(frag);
}

/**
 * @param {import("./csv.js").Student} student
 */
async function logLate(student) {
  const now = new Date();
  const entry = {
    id: `${student.student_id}-${now.getTime()}`,
    student_id: student.student_id,
    first_name: student.first_name,
    last_name: student.last_name,
    grade: student.grade,
    section: student.section,
    level: student.level,
    loggedAt: now.getTime(),
    dayKey: getDayKey(now),
  };

  await addLateEntry(entry);
  todaysLates = [...todaysLates, entry];
  lastUndoId = entry.id;

  const search = /** @type {HTMLInputElement} */ ($("busqueda"));
  search.value = "";
  search.focus();

  renderAll();
  showToast(
    `Registrado: ${student.first_name} ${student.last_name} · ${formatTimeOfDay(now)}`,
  );
}

async function onUndo() {
  if (!lastUndoId) return;
  const id = lastUndoId;
  await removeLateEntry(id);
  todaysLates = todaysLates.filter((e) => e.id !== id);
  lastUndoId = null;
  renderAll();
  showToast("Último registro deshecho");
}

function updateUndoBar() {
  const bar = $("undo-bar");
  if (!lastUndoId) {
    bar.hidden = true;
    return;
  }
  const entry = todaysLates.find((e) => e.id === lastUndoId);
  if (!entry) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  $("undo-text").textContent =
    `Último: ${entry.first_name} ${entry.last_name} (${formatTimeOfDay(entry.loggedAt)})`;
}

function renderLateLists() {
  renderLevelList("primaria", $("lista-primaria"), $("vacio-primaria"));
  renderLevelList("secundaria", $("lista-secundaria"), $("vacio-secundaria"));
}

/**
 * @param {"primaria"|"secundaria"} level
 * @param {HTMLElement} listEl
 * @param {HTMLElement} emptyEl
 */
function renderLevelList(level, listEl, emptyEl) {
  const items = todaysLates.filter((e) => e.level === level);
  listEl.innerHTML = "";
  if (items.length === 0) {
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;
  for (const e of items) {
    const li = document.createElement("li");
    li.className = "late-item";
    li.innerHTML = `
      <span class="late-time">${escapeHtml(formatTimeOfDay(e.loggedAt))}</span>
      <span class="late-name">${escapeHtml(e.first_name)} ${escapeHtml(e.last_name)}</span>
      <span class="late-gs">${escapeHtml(formatGradeSection(e))}</span>
    `;
    listEl.appendChild(li);
  }
}

function renderReportPreviews() {
  const reports = buildBothReports(todaysLates);
  $("preview-primaria").textContent = reports.primaria;
  $("preview-secundaria").textContent = reports.secundaria;
}

/**
 * @param {"primaria"|"secundaria"} level
 */
async function copyReport(level) {
  const reports = buildBothReports(todaysLates);
  const text = reports[level];
  try {
    await navigator.clipboard.writeText(text);
    showToast(
      level === "primaria"
        ? "Texto de primaria copiado"
        : "Texto de secundaria copiado",
    );
  } catch {
    // Fallback for older iOS / insecure contexts
    const ok = fallbackCopy(text);
    showToast(
      ok
        ? level === "primaria"
          ? "Texto de primaria copiado"
          : "Texto de secundaria copiado"
        : "No se pudo copiar. Abre la vista previa y copia manualmente.",
    );
  }
}

function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}

async function onClearToday() {
  const ok = await confirmDialog(
    "Limpiar hoy",
    "¿Borrar todas las llegadas tarde de hoy? La nómina no se toca.",
  );
  if (!ok) return;
  const today = getDayKey();
  await clearLatesForDay(today);
  todaysLates = [];
  lastUndoId = null;
  renderAll();
  showToast("Lista de hoy borrada");
}

async function onDeleteRoster() {
  const ok = await confirmDialog(
    "Borrar nómina",
    "¿Eliminar toda la nómina local? Los registros de hoy no se borran, pero ya no podrás buscar nombres.",
  );
  if (!ok) return;
  await clearRoster();
  roster = [];
  renderAll();
  showToast("Nómina local eliminada");
}

/**
 * @param {Event} ev
 */
async function onCsvPicked(ev) {
  const input = /** @type {HTMLInputElement} */ (ev.target);
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;

  const mode =
    /** @type {HTMLInputElement} */ (
      document.querySelector('input[name="import-mode"]:checked')
    )?.value ?? "merge";

  if (mode === "replace") {
    const ok = await confirmDialog(
      "Reemplazar nómina",
      "Se borrará la nómina actual y se cargará solo este CSV. ¿Continuar?",
    );
    if (!ok) return;
  }

  let text;
  try {
    text = await file.text();
  } catch {
    showImportResult("No se pudo leer el archivo.", true);
    return;
  }

  const { students, errors, totalRows } = importRosterCsv(text);

  if (students.length === 0 && errors.length > 0) {
    showImportResult(formatImportMessage(0, errors, totalRows), true);
    return;
  }

  if (mode === "replace") {
    await replaceRoster(students);
  } else {
    await upsertStudents(students);
  }

  roster = await getAllStudents();
  renderAll();
  showImportResult(formatImportMessage(students.length, errors, totalRows), false);
  showToast(`Importados ${students.length} estudiantes`);
}

/**
 * @param {number} okCount
 * @param {{row:number, reason:string}[]} errors
 * @param {number} totalRows
 */
function formatImportMessage(okCount, errors, totalRows) {
  const lines = [
    `Válidos: ${okCount} de ${totalRows} filas.`,
    `Errores: ${errors.length}.`,
  ];
  const samples = errors.slice(0, 5).map((e) => `Fila ${e.row}: ${e.reason}`);
  if (samples.length) {
    lines.push("Ejemplos:");
    lines.push(...samples);
  }
  return lines.join("\n");
}

/**
 * @param {string} msg
 * @param {boolean} isError
 */
function showImportResult(msg, isError) {
  const el = $("import-resultado");
  el.hidden = false;
  el.textContent = msg;
  el.classList.toggle("is-error", isError);
}

/**
 * @param {boolean} fromSettings
 */
async function loadDemoRoster(fromSettings) {
  if (fromSettings && roster.length > 0) {
    const ok = await confirmDialog(
      "Cargar demo",
      "Esto reemplazará la nómina actual con datos FAKE de demostración. ¿Continuar?",
    );
    if (!ok) return;
  }

  const res = await fetch(`${import.meta.env.BASE_URL}sample-roster.csv`);
  if (!res.ok) {
    showToast("No se pudo cargar el CSV demo");
    return;
  }
  const text = await res.text();
  const { students, errors } = importRosterCsv(text);
  if (students.length === 0) {
    showToast("Demo inválida");
    return;
  }
  await replaceRoster(students);
  roster = students;
  renderAll();
  if (fromSettings) {
    showImportResult(
      formatImportMessage(students.length, errors, students.length + errors.length),
      false,
    );
  }
  showToast(`Demo falsa cargada (${students.length} estudiantes)`);
}

function updateRosterCount() {
  const n = roster.length;
  $("roster-count").textContent =
    n === 1
      ? "1 estudiante en este dispositivo."
      : `${n} estudiantes en este dispositivo.`;
}

/**
 * @param {string} title
 * @param {string} message
 * @returns {Promise<boolean>}
 */
function confirmDialog(title, message) {
  return new Promise((resolve) => {
    const dialog = /** @type {HTMLDialogElement} */ ($("dialog-confirmar"));
    $("confirm-titulo").textContent = title;
    $("confirm-mensaje").textContent = message;

    const onAccept = () => {
      cleanup();
      dialog.close();
      resolve(true);
    };
    const onCancel = () => {
      cleanup();
      dialog.close();
      resolve(false);
    };
    const cleanup = () => {
      $("confirm-aceptar").removeEventListener("click", onAccept);
      $("confirm-cancelar").removeEventListener("click", onCancel);
    };

    $("confirm-aceptar").addEventListener("click", onAccept);
    $("confirm-cancelar").addEventListener("click", onCancel);
    dialog.showModal();
  });
}

/**
 * @param {string} msg
 */
function showToast(msg) {
  const toast = $("toast");
  toast.hidden = false;
  toast.textContent = msg;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 2800);
}

function labelLevel(level) {
  return level === "primaria" ? "Primaria" : "Secundaria";
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

init().catch((err) => {
  console.error(err);
  showToast("Error al iniciar la app");
});
