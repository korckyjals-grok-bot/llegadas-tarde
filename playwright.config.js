import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:43123/llegadas-tarde/";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e-report" }]],
  projects: [
    {
      name: "iphone-chromium",
      use: {
        baseURL,
        browserName: "chromium",
        ...devices["iPhone 13"],
        locale: "es-SV",
        timezoneId: "America/El_Salvador",
        permissions: ["clipboard-read", "clipboard-write"],
        trace: "retain-on-failure",
      },
    },
  ],
});
