import { describe, expect, it } from "vitest";
import { getDayKey, formatReportDate, formatDisplayDate } from "../src/day.js";

describe("getDayKey", () => {
  it("returns YYYY-MM-DD for El Salvador timezone", () => {
    // 2026-09-22 05:30 UTC = 2026-09-21 23:30 in El Salvador (UTC-6)
    const lateUtc = new Date("2026-09-22T05:30:00Z");
    expect(getDayKey(lateUtc)).toBe("2026-09-21");

    // 2026-09-22 06:30 UTC = 2026-09-22 00:30 in El Salvador
    const earlyLocal = new Date("2026-09-22T06:30:00Z");
    expect(getDayKey(earlyLocal)).toBe("2026-09-22");
  });
});

describe("formatReportDate", () => {
  it("formats as DD/MM/YYYY in El Salvador", () => {
    const d = new Date("2026-09-22T18:00:00Z");
    expect(formatReportDate(d)).toMatch(/\d{2}\/\d{2}\/2026/);
  });
});

describe("formatDisplayDate", () => {
  it("keeps Spanish 'de' lowercase", () => {
    const text = formatDisplayDate(new Date("2026-09-22T18:00:00Z"));
    expect(text).not.toMatch(/\bDe\b/);
    expect(text.toLowerCase()).toContain("de septiembre de");
  });
});
