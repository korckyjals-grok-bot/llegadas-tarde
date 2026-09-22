import { describe, expect, it } from "vitest";
import {
  filterStudents,
  formatGradeSection,
  importRosterCsv,
  mapHeaders,
  normalizeLevel,
  parseCsvLine,
} from "../src/csv.js";

describe("normalizeLevel", () => {
  it("accepts primaria aliases", () => {
    expect(normalizeLevel("primaria")).toBe("primaria");
    expect(normalizeLevel("PRIMARY")).toBe("primaria");
    expect(normalizeLevel("Primária")).toBe("primaria");
  });

  it("accepts secundaria aliases", () => {
    expect(normalizeLevel("secundaria")).toBe("secundaria");
    expect(normalizeLevel("secondary")).toBe("secundaria");
  });

  it("infers from grade when level empty", () => {
    expect(normalizeLevel("", "3")).toBe("primaria");
    expect(normalizeLevel("", "7")).toBe("secundaria");
  });

  it("rejects bad levels", () => {
    expect(normalizeLevel("media")).toBeNull();
  });
});

describe("parseCsvLine", () => {
  it("handles quotes and commas", () => {
    expect(parseCsvLine('a,"b,c",d')).toEqual(["a", "b,c", "d"]);
    expect(parseCsvLine('a,"b""c",d')).toEqual(["a", 'b"c', "d"]);
  });
});

describe("mapHeaders", () => {
  it("maps aliases case-insensitively", () => {
    const { map, missing } = mapHeaders([
      "ID",
      "Nombre",
      "Apellido",
      "Grado",
      "Sección",
      "Nivel",
    ]);
    expect(missing).toEqual([]);
    expect(map.student_id).toBe(0);
    expect(map.first_name).toBe(1);
    expect(map.last_name).toBe(2);
    expect(map.level).toBe(5);
  });
});

describe("importRosterCsv", () => {
  const header =
    "student_id,first_name,last_name,grade,section,level";

  it("imports valid rows", () => {
    const csv = `${header}\nP1,Ana,Ramírez,3,A,primaria\nS1,Elena,Vargas,7,B,secondary\n`;
    const { students, errors } = importRosterCsv(csv);
    expect(errors).toEqual([]);
    expect(students).toHaveLength(2);
    expect(students[0].level).toBe("primaria");
    expect(students[1].level).toBe("secundaria");
  });

  it("reports missing fields and bad level", () => {
    const csv = `${header}\n,Ana,Ramírez,3,A,primaria\nP2,Luis,Hernández,4,B,xyz\n`;
    const { students, errors } = importRosterCsv(csv);
    expect(students).toHaveLength(0);
    expect(errors.length).toBe(2);
    expect(errors[0].reason).toMatch(/student_id/);
    expect(errors[1].reason).toMatch(/Nivel inválido/);
  });

  it("rejects duplicate ids in file", () => {
    const csv = `${header}\nP1,Ana,A,3,A,primaria\nP1,Luis,B,4,B,primaria\n`;
    const { students, errors } = importRosterCsv(csv);
    expect(students).toHaveLength(1);
    expect(errors[0].reason).toMatch(/duplicado/);
  });

  it("requires header columns", () => {
    const csv = "a,b,c\n1,2,3\n";
    const { students, errors } = importRosterCsv(csv);
    expect(students).toHaveLength(0);
    expect(errors[0].reason).toMatch(/Faltan columnas/);
  });
});

describe("filterStudents", () => {
  const roster = [
    {
      student_id: "1",
      first_name: "Ana",
      last_name: "Ramírez",
      grade: "3",
      section: "A",
      level: /** @type {const} */ ("primaria"),
    },
    {
      student_id: "2",
      first_name: "Luis",
      last_name: "Hernández",
      grade: "1",
      section: "B",
      level: /** @type {const} */ ("primaria"),
    },
  ];

  it("matches first or last name accent-insensitively", () => {
    expect(filterStudents(roster, "ram").map((s) => s.student_id)).toEqual([
      "1",
    ]);
    expect(filterStudents(roster, "HERN").map((s) => s.student_id)).toEqual([
      "2",
    ]);
    expect(filterStudents(roster, "ana ram").map((s) => s.student_id)).toEqual([
      "1",
    ]);
  });
});

describe("formatGradeSection", () => {
  it("formats grade and section", () => {
    expect(formatGradeSection({ grade: "3", section: "a" })).toBe("3°A");
    expect(formatGradeSection({ grade: "7°", section: "B" })).toBe("7°B");
  });
});
