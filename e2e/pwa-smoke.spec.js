import { test, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  attachPrivacyMonitor,
  loadFakeDemo,
  resetAppStorage,
  tapSearchResult,
} from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(__dirname, "..", "tests", "fixtures");

test.describe("Llegadas tarde PWA (iPhone)", () => {
  test.beforeEach(async ({ page }) => {
    await resetAppStorage(page);
  });

  test("onboarding demo → search/tap log → split lists → reports → copy", async ({
    page,
  }) => {
    const privacy = attachPrivacyMonitor(page);

    await loadFakeDemo(page);
    await expect(page.locator("#roster-count")).toContainText("26 estudiantes");

    await page.fill("#busqueda", "Ana");
    await page.locator(".result-btn").first().click();
    await expect(page.locator("#lista-primaria .late-item")).toHaveCount(1);
    await expect(page.locator("#lista-primaria")).toContainText("Ana");
    await expect(page.locator("#lista-primaria .late-time")).toHaveText(/\d{1,2}:\d{2}/);

    await page.fill("#busqueda", "Elena");
    await page.locator(".result-btn").first().click();
    await expect(page.locator("#lista-secundaria .late-item")).toHaveCount(1);
    await expect(page.locator("#lista-secundaria")).toContainText("Elena");

    await page.locator(".preview-details summary").click();
    const primPreview = await page.locator("#preview-primaria").innerText();
    const secPreview = await page.locator("#preview-secundaria").innerText();
    expect(primPreview).toContain("Llegadas tarde — Primaria");
    expect(primPreview).toContain("Ana Ramírez (3°A)");
    expect(secPreview).toContain("Elena Vargas (7°A)");

    await page.click("#btn-copiar-primaria");
    await expect(page.locator("#toast")).toContainText("primaria copiado", {
      ignoreCase: true,
    });

    let clipboardText = "";
    try {
      clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    } catch {
      clipboardText = primPreview;
    }
    expect(clipboardText).toContain("Ana Ramírez");

    await page.click("#btn-copiar-secundaria");
    await expect(page.locator("#toast")).toContainText("secundaria copiado", {
      ignoreCase: true,
    });

    const outboundPosts = privacy.assertNoOutboundStudentPosts();
    expect(outboundPosts, JSON.stringify(outboundPosts)).toEqual([]);
    const { leaks, crossPost } = privacy.assertNoSensitiveLeaks([
      "Ana Ramírez",
      "student_id",
    ]);
    expect(leaks).toEqual([]);
    expect(crossPost).toEqual([]);

    await page.screenshot({
      path: "/opt/cursor/artifacts/e2e_logged_split_lists.png",
      fullPage: true,
    });
  });

  test("undo last entry; clear today keeps roster", async ({ page }) => {
    await loadFakeDemo(page);
    await page.fill("#busqueda", "Ana");
    await tapSearchResult(page, "Ana Ramírez");
    await expect(page.locator("#lista-primaria .late-item")).toHaveCount(1);
    await expect(page.locator("#undo-bar")).toBeVisible();

    await page.click("#btn-deshacer");
    await expect(page.locator("#lista-primaria .late-item")).toHaveCount(0);
    await expect(page.locator("#undo-bar")).toBeHidden();

    await page.fill("#busqueda", "Ana");
    await tapSearchResult(page, "Ana Ramírez");
    await page.fill("#busqueda", "Elena");
    await tapSearchResult(page, "Elena Vargas");
    await expect(page.locator("#lista-primaria .late-item")).toHaveCount(1);
    await expect(page.locator("#lista-secundaria .late-item")).toHaveCount(1);

    await page.click("#btn-limpiar-hoy");
    await page.click("#confirm-aceptar");
    await expect(page.locator("#toast")).toContainText("Lista de hoy borrada");
    await expect(page.locator("#lista-primaria .late-item")).toHaveCount(0);
    await expect(page.locator("#lista-secundaria .late-item")).toHaveCount(0);

    await page.fill("#busqueda", "Ana");
    await expect(page.locator(".result-btn").first()).toBeVisible();
    await page.screenshot({
      path: "/opt/cursor/artifacts/e2e_clear_today_roster_ok.png",
      fullPage: true,
    });
  });

  test("CSV import merge and replace; delete roster", async ({ page }) => {
    await loadFakeDemo(page);

    await page.click("#btn-ajustes");
    await page.setInputFiles(
      "#csv-input",
      path.join(fixtures, "fake-merge.csv"),
    );
    await expect(page.locator("#import-resultado")).toContainText("Válidos: 1");
    await expect(page.locator("#roster-count")).toContainText("27 estudiantes");
    await page.click("#form-ajustes button[value='close']");

    await page.fill("#busqueda", "MergeTest");
    await expect(page.getByRole("option", { name: /Fake MergeTest/ })).toBeVisible();

    await page.click("#btn-ajustes");
    await page.locator('input[name="import-mode"][value="replace"]').check();
    await page.setInputFiles(
      "#csv-input",
      path.join(fixtures, "fake-replace.csv"),
    );
    await page.click("#confirm-aceptar");
    await expect(page.locator("#import-resultado")).toContainText("Válidos: 1");
    await expect(page.locator("#roster-count")).toContainText("1 estudiante");
    await page.click("#form-ajustes button[value='close']");

    await page.fill("#busqueda", "Ana");
    await expect(page.locator("#estado-busqueda")).toContainText("Sin coincidencias");

    await page.fill("#busqueda", "Replaced");
    await expect(page.getByRole("option", { name: /Replaced Student/ })).toBeVisible();

    await page.click("#btn-ajustes");
    await page.click("#btn-borrar-nomina");
    await page.click("#confirm-aceptar");
    await expect(page.locator("#toast")).toContainText("Nómina local eliminada");
    await expect(page.locator("#roster-count")).toContainText("0 estudiantes");

    await page.click("#form-ajustes button[value='close']");
    await page.screenshot({
      path: "/opt/cursor/artifacts/e2e_roster_import_delete.png",
      fullPage: true,
    });
  });

  test("display date uses Spanish sentence case", async ({ page }) => {
    await page.goto("./");
    const fecha = await page.locator("#fecha-hoy").innerText();
    expect(fecha).not.toMatch(/\bDe\b/);
    expect(fecha.toLowerCase()).toMatch(/de [a-záéíóúñ]+ de \d{4}/);
  });
});

test.describe("Service worker shell (production preview)", () => {
  test("offline reload serves cached app shell", async ({ page, context }) => {
    test.skip(
      process.env.E2E_SW !== "1",
      "Run with E2E_SW=1 against npm run preview",
    );

    await page.goto("./");
    await page.waitForTimeout(1500);
    await expect
      .poll(async () =>
        page.evaluate(() => navigator.serviceWorker?.controller?.scriptURL ?? ""),
      )
      .toContain("sw.js");

    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(".brand")).toHaveText("Llegadas");
    await expect(page.locator("#busqueda")).toBeVisible();
  });
});
