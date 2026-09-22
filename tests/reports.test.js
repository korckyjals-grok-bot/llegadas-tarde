import { describe, expect, it } from "vitest";
import {
  buildBothReports,
  buildLevelReport,
  formatReportLine,
  gradeSortKey,
  groupByGrade,
} from "../src/reports.js";

/** @type {import("../src/reports.js").LateEntry[]} */
const entries = [
  {
    id: "1",
    student_id: "P001",
    first_name: "Ana",
    last_name: "Ramírez",
    grade: "3",
    section: "A",
    level: "primaria",
    loggedAt: new Date("2026-09-22T13:38:00Z").getTime(),
    dayKey: "2026-09-22",
  },
  {
    id: "2",
    student_id: "P002",
    first_name: "Luis",
    last_name: "Hernández",
    grade: "1",
    section: "B",
    level: "primaria",
    loggedAt: new Date("2026-09-22T13:41:00Z").getTime(),
    dayKey: "2026-09-22",
  },
  {
    id: "3",
    student_id: "S001",
    first_name: "Elena",
    last_name: "Vargas",
    grade: "7",
    section: "A",
    level: "secundaria",
    loggedAt: new Date("2026-09-22T13:45:00Z").getTime(),
    dayKey: "2026-09-22",
  },
];

describe("formatReportLine", () => {
  it("uses time — name (grade+section)", () => {
    const line = formatReportLine(entries[0]);
    expect(line).toMatch(/— Ana Ramírez \(3°A\)$/);
    expect(line).toMatch(/^\d{1,2}:\d{2}/);
  });
});

describe("groupByGrade", () => {
  it("orders by grade number and omits empty", () => {
    const map = groupByGrade(entries.filter((e) => e.level === "primaria"));
    expect([...map.keys()]).toEqual(["1", "3"]);
  });
});

describe("gradeSortKey", () => {
  it("parses numeric grades", () => {
    expect(gradeSortKey("3")).toBe(3);
    expect(gradeSortKey("10°")).toBe(10);
  });
});

describe("buildLevelReport", () => {
  it("builds primaria report with date and grade groups", () => {
    const text = buildLevelReport({
      level: "primaria",
      entries,
      date: new Date("2026-09-22T15:00:00Z"),
    });
    expect(text).toContain("Llegadas tarde — Primaria");
    expect(text).toContain("Fecha:");
    expect(text).toContain("Grado 1°");
    expect(text).toContain("Grado 3°");
    expect(text).toContain("Ana Ramírez (3°A)");
    expect(text).toContain("Luis Hernández (1°B)");
    expect(text).not.toContain("Elena");
  });

  it("shows empty placeholder when no entries", () => {
    const text = buildLevelReport({
      level: "secundaria",
      entries: [],
      date: new Date("2026-09-22T15:00:00Z"),
    });
    expect(text).toContain("(Sin registros)");
  });
});

describe("buildBothReports", () => {
  it("returns both level texts", () => {
    const { primaria, secundaria } = buildBothReports(entries);
    expect(primaria).toContain("Primaria");
    expect(secundaria).toContain("Secundaria");
    expect(secundaria).toContain("Elena Vargas (7°A)");
  });
});
