/** @param {import('@playwright/test').Page} page */
export async function resetAppStorage(page) {
  await page.goto("./");
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase("llegadas-tarde");
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => resolve();
    });
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: "networkidle" });
}

/** @param {import('@playwright/test').Page} page */
export async function loadFakeDemo(page) {
  const dialog = page.locator("#dialog-primer-uso");
  if (await dialog.isVisible().catch(() => false)) {
    await page.click("#primer-demo");
    await expectDialogClosed(page, "#dialog-primer-uso");
  } else {
    await page.click("#btn-ajustes");
    await page.click("#btn-demo");
    const confirm = page.locator("#dialog-confirmar");
    if (await confirm.isVisible().catch(() => false)) {
      await page.click("#confirm-aceptar");
    }
    await page.click("#form-ajustes button[value='close']");
  }
  await page.waitForTimeout(400);
}

/** Tap a search result by visible name (avoids flake from list re-render). */
export async function tapSearchResult(page, nameSubstring) {
  await page.waitForFunction(
    (needle) =>
      [...document.querySelectorAll(".result-btn")].some((b) =>
        b.textContent?.includes(needle),
      ),
    nameSubstring,
    { timeout: 8000 },
  );
  await page.evaluate((needle) => {
    const btn = [...document.querySelectorAll(".result-btn")].find((b) =>
      b.textContent?.includes(needle),
    );
    /** @type {HTMLButtonElement | undefined} */ (btn)?.click();
  }, nameSubstring);
}

/** @param {import('@playwright/test').Page} page @param {string} selector */
async function expectDialogClosed(page, selector) {
  await page.waitForFunction(
    (sel) => {
      const d = document.querySelector(sel);
      return d && !/** @type {HTMLDialogElement} */ (d).open;
    },
    selector,
    { timeout: 8000 },
  );
}

/**
 * Track network for leaked roster/late payloads (must stay local).
 * @param {import('@playwright/test').Page} page
 */
export function attachPrivacyMonitor(page) {
  /** @type {{ url: string, method: string, bodySnippet?: string }[]} */
  const events = [];

  page.on("request", (req) => {
    const url = req.url();
    const method = req.method();
    const post = req.postData() ?? "";
    events.push({
      url,
      method,
      bodySnippet: post.slice(0, 500),
    });
  });

  return {
    events,
    /** @param {string[]} forbiddenSubstrings */
    assertNoSensitiveLeaks(forbiddenSubstrings) {
      const leaks = [];
      for (const ev of events) {
        const u = new URL(ev.url);
        if (u.hostname === "127.0.0.1" || u.hostname === "localhost") continue;
        const hay = `${ev.url}\n${ev.bodySnippet ?? ""}`;
        for (const s of forbiddenSubstrings) {
          if (hay.includes(s)) leaks.push({ ev, needle: s });
        }
      }
      const crossPost = events.filter((ev) => {
        try {
          const u = new URL(ev.url);
          return (
            (u.hostname !== "127.0.0.1" && u.hostname !== "localhost") &&
            ev.method !== "GET" &&
            ev.method !== "HEAD"
          );
        } catch {
          return false;
        }
      });
      return { leaks, crossPost };
    },
    assertNoOutboundStudentPosts() {
      const bad = events.filter((ev) => {
        if (ev.method === "GET" || ev.method === "HEAD") return false;
        const hay = `${ev.url}\n${ev.bodySnippet ?? ""}`;
        return (
          hay.includes("student_id") ||
          hay.includes("loggedAt") ||
          hay.includes("Ramírez") ||
          hay.includes("Vargas")
        );
      });
      return bad;
    },
  };
}
