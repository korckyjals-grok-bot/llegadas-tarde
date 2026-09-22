/** Calendar day helpers using America/El_Salvador (UTC-6, no DST). */

export const TIMEZONE = "America/El_Salvador";

/**
 * @param {Date} [date]
 * @returns {string} YYYY-MM-DD in America/El_Salvador
 */
export function getDayKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * @param {Date} [date]
 * @returns {string} e.g. "Martes, 22 de septiembre de 2026"
 */
export function formatDisplayDate(date = new Date()) {
  const raw = new Intl.DateTimeFormat("es-SV", {
    timeZone: TIMEZONE,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
  // Engines differ on capitalization; prefer sentence case with lowercase "de".
  const lower = raw.toLocaleLowerCase("es-SV");
  return lower.replace(/^\p{L}/u, (ch) => ch.toLocaleUpperCase("es-SV"));
}

/**
 * @param {Date|string|number} date
 * @returns {string} H:MM in 24h local device clock (for display of logged time)
 */
export function formatTimeOfDay(date) {
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat("es-SV", {
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/**
 * Compact date for report headers: DD/MM/YYYY in El Salvador calendar.
 * @param {Date} [date]
 */
export function formatReportDate(date = new Date()) {
  return new Intl.DateTimeFormat("es-SV", {
    timeZone: TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}
