/**
 * CSV parse + roster validation (entirely client-side).
 * Required logical fields: student_id, first_name, last_name, grade, section, level
 */

const HEADER_ALIASES = {
  student_id: ["student_id", "id", "codigo", "código", "studentid"],
  first_name: ["first_name", "firstname", "nombre", "name", "first"],
  last_name: ["last_name", "lastname", "apellido", "apellidos", "last"],
  grade: ["grade", "grado", "year"],
  section: ["section", "seccion", "sección", "grupo", "class"],
  level: ["level", "nivel", "ciclo"],
};

/**
 * Normalize level to "primaria" | "secundaria" or null if invalid.
 * @param {string} raw
 * @param {string} [grade]
 */
export function normalizeLevel(raw, grade) {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

  if (["primary", "primaria", "p", "prim"].includes(v)) return "primaria";
  if (["secondary", "secundaria", "s", "sec", "secund"].includes(v)) {
    return "secundaria";
  }

  // Fallback from grade only when level empty
  if (!v && grade != null && String(grade).trim() !== "") {
    const g = Number.parseInt(String(grade).replace(/\D/g, ""), 10);
    if (Number.isFinite(g)) {
      if (g >= 1 && g <= 5) return "primaria";
      if (g >= 6 && g <= 12) return "secundaria";
    }
  }

  return null;
}

/**
 * Parse a single CSV line respecting quoted fields.
 * @param {string} line
 * @returns {string[]}
 */
export function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/**
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsvText(text) {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n").filter((l) => l.trim().length > 0);
  return lines.map(parseCsvLine);
}

function normalizeHeaderKey(h) {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[\s-]+/g, "_");
}

/**
 * Map header row to canonical field indices.
 * @param {string[]} headers
 * @returns {{ map: Record<string, number>, missing: string[] }}
 */
export function mapHeaders(headers) {
  const normalized = headers.map(normalizeHeaderKey);
  const map = {};

  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = normalized.findIndex((h) => aliases.includes(h));
    if (idx >= 0) map[canonical] = idx;
  }

  const required = Object.keys(HEADER_ALIASES);
  const missing = required.filter((k) => map[k] === undefined);
  return { map, missing };
}

/**
 * @typedef {object} Student
 * @property {string} student_id
 * @property {string} first_name
 * @property {string} last_name
 * @property {string} grade
 * @property {string} section
 * @property {"primaria"|"secundaria"} level
 */

/**
 * @typedef {object} ImportError
 * @property {number} row
 * @property {string} reason
 */

/**
 * Validate and convert CSV text into students.
 * @param {string} text
 * @returns {{ students: Student[], errors: ImportError[], totalRows: number }}
 */
export function importRosterCsv(text) {
  const rows = parseCsvText(text);
  if (rows.length === 0) {
    return {
      students: [],
      errors: [{ row: 0, reason: "El archivo CSV está vacío" }],
      totalRows: 0,
    };
  }

  const [header, ...dataRows] = rows;
  const { map, missing } = mapHeaders(header);
  if (missing.length > 0) {
    return {
      students: [],
      errors: [
        {
          row: 1,
          reason: `Faltan columnas: ${missing.join(", ")}`,
        },
      ],
      totalRows: dataRows.length,
    };
  }

  /** @type {Student[]} */
  const students = [];
  /** @type {ImportError[]} */
  const errors = [];
  const seenIds = new Set();

  dataRows.forEach((cols, i) => {
    const rowNum = i + 2; // 1-based + header
    const get = (key) => (cols[map[key]] ?? "").trim();

    const student_id = get("student_id");
    const first_name = get("first_name");
    const last_name = get("last_name");
    const grade = get("grade");
    const section = get("section");
    const levelRaw = get("level");

    const missingFields = [];
    if (!student_id) missingFields.push("student_id");
    if (!first_name) missingFields.push("first_name");
    if (!last_name) missingFields.push("last_name");
    if (!grade) missingFields.push("grade");
    if (!section) missingFields.push("section");
    if (!levelRaw) missingFields.push("level");

    if (missingFields.length > 0) {
      errors.push({
        row: rowNum,
        reason: `Campos vacíos: ${missingFields.join(", ")}`,
      });
      return;
    }

    const level = normalizeLevel(levelRaw, grade);
    if (!level) {
      errors.push({
        row: rowNum,
        reason: `Nivel inválido: "${levelRaw}" (use primaria/secundaria)`,
      });
      return;
    }

    if (seenIds.has(student_id)) {
      errors.push({
        row: rowNum,
        reason: `ID duplicado en el archivo: ${student_id}`,
      });
      return;
    }
    seenIds.add(student_id);

    students.push({
      student_id,
      first_name,
      last_name,
      grade,
      section,
      level,
    });
  });

  return { students, errors, totalRows: dataRows.length };
}

/**
 * Filter students by query against first/last name (accent-insensitive).
 * @param {Student[]} students
 * @param {string} query
 * @param {number} [limit]
 */
export function filterStudents(students, query, limit = 40) {
  const q = fold(query);
  if (!q) return [];

  const scored = [];
  for (const s of students) {
    const first = fold(s.first_name);
    const last = fold(s.last_name);
    const full = `${first} ${last}`;
    const reverse = `${last} ${first}`;

    if (
      first.startsWith(q) ||
      last.startsWith(q) ||
      full.includes(q) ||
      reverse.includes(q)
    ) {
      const rank =
        first.startsWith(q) || last.startsWith(q)
          ? 0
          : full.startsWith(q) || reverse.startsWith(q)
            ? 1
            : 2;
      scored.push({ s, rank, sort: `${last} ${first}` });
    }
  }

  scored.sort((a, b) => a.rank - b.rank || a.sort.localeCompare(b.sort, "es"));
  return scored.slice(0, limit).map((x) => x.s);
}

function fold(str) {
  return String(str ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

/**
 * Display label like "3°A"
 * @param {Pick<Student, "grade"|"section">} s
 */
export function formatGradeSection(s) {
  const g = String(s.grade ?? "").trim();
  const sec = String(s.section ?? "").trim().toUpperCase();
  if (!g) return sec;
  const withDegree = /[°º]/.test(g) ? g : `${g}°`;
  return `${withDegree}${sec}`;
}
