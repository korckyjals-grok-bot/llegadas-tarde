import { formatGradeSection } from "./csv.js";
import { formatReportDate, formatTimeOfDay } from "./day.js";

/**
 * @typedef {import("./csv.js").Student} Student
 */

/**
 * @typedef {object} LateEntry
 * @property {string} id
 * @property {string} student_id
 * @property {string} first_name
 * @property {string} last_name
 * @property {string} grade
 * @property {string} section
 * @property {"primaria"|"secundaria"} level
 * @property {number} loggedAt
 * @property {string} dayKey
 */

/**
 * Sort key for grades: numeric ascending, then alpha.
 * @param {string} grade
 */
export function gradeSortKey(grade) {
  const n = Number.parseInt(String(grade).replace(/\D/g, ""), 10);
  if (Number.isFinite(n)) return n;
  return 999;
}

/**
 * Group late entries by grade for cleaner paste.
 * @param {LateEntry[]} entries
 * @returns {Map<string, LateEntry[]>}
 */
export function groupByGrade(entries) {
  const map = new Map();
  const sorted = [...entries].sort((a, b) => {
    const g = gradeSortKey(a.grade) - gradeSortKey(b.grade);
    if (g !== 0) return g;
    const t = a.loggedAt - b.loggedAt;
    if (t !== 0) return t;
    return `${a.last_name} ${a.first_name}`.localeCompare(
      `${b.last_name} ${b.first_name}`,
      "es",
    );
  });

  for (const e of sorted) {
    const key = String(e.grade).trim() || "?";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(e);
  }
  return map;
}

/**
 * One report line: `7:38 — Ana Ramírez (3°A)`
 * @param {LateEntry} e
 */
export function formatReportLine(e) {
  const time = formatTimeOfDay(e.loggedAt);
  const name = `${e.first_name} ${e.last_name}`.trim();
  const gs = formatGradeSection(e);
  return `${time} — ${name} (${gs})`;
}

/**
 * Build WhatsApp-ready plain text for one level.
 * @param {object} opts
 * @param {"primaria"|"secundaria"} opts.level
 * @param {LateEntry[]} opts.entries
 * @param {Date} [opts.date]
 * @returns {string}
 */
export function buildLevelReport({ level, entries, date = new Date() }) {
  const title =
    level === "primaria"
      ? "Llegadas tarde — Primaria"
      : "Llegadas tarde — Secundaria";

  const filtered = entries.filter((e) => e.level === level);
  const dateLine = `Fecha: ${formatReportDate(date)}`;

  if (filtered.length === 0) {
    return [title, dateLine, "", "(Sin registros)"].join("\n");
  }

  const groups = groupByGrade(filtered);
  const parts = [title, dateLine, ""];

  for (const [grade, list] of groups) {
    const label = /[°º]/.test(grade) ? `Grado ${grade}` : `Grado ${grade}°`;
    parts.push(label);
    for (const e of list) {
      parts.push(formatReportLine(e));
    }
    parts.push("");
  }

  // Trim trailing blank
  while (parts.length && parts[parts.length - 1] === "") parts.pop();
  return parts.join("\n");
}

/**
 * @param {LateEntry[]} entries
 * @param {Date} [date]
 */
export function buildBothReports(entries, date = new Date()) {
  return {
    primaria: buildLevelReport({ level: "primaria", entries, date }),
    secundaria: buildLevelReport({ level: "secundaria", entries, date }),
  };
}
