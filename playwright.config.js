// @ts-check
const path = require("path");
const fs = require("fs");
const { defineConfig, devices } = require("@playwright/test");

// Statische server op src/ (of ACTIEPAGINA_ROOT, bv. voor een dummy-pagina bij het testen van de harness).
const ROOT = path.resolve(__dirname, process.env.ACTIEPAGINA_ROOT || "src");
const PORT = Number(process.env.ACTIEPAGINA_PORT || 4173);

// Browsers zijn voorgeinstalleerd in /opt/pw-browsers (PLAYWRIGHT_BROWSERS_PATH). @playwright/test
// is gepind op 1.56.1, die bij chromium-1194 hoort. Mocht de versie ooit afwijken, dan wijzen we
// expliciet naar het aanwezige binary in plaats van `playwright install` te draaien.
const BROWSERS = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
function findChromium() {
  if (process.env.PW_CHROMIUM_PATH) return process.env.PW_CHROMIUM_PATH;
  try {
    const want = require("playwright-core/lib/server/registry/index").registry.findExecutable("chromium");
    if (want && fs.existsSync(want.executablePath())) return undefined; // versie past: niets forceren
  } catch {}
  const dirs = fs.existsSync(BROWSERS) ? fs.readdirSync(BROWSERS).filter((d) => /^chromium-\d+$/.test(d)).sort() : [];
  for (const d of dirs.reverse()) {
    const p = path.join(BROWSERS, d, "chrome-linux", "chrome");
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}
const executablePath = findChromium();

module.exports = defineConfig({
  testDir: "./tests",
  testMatch: /.*\.spec\.js$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 20_000,
  expect: { timeout: 4_000 },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: "nl-NL",
    timezoneId: "Europe/Amsterdam",
    viewport: { width: 1280, height: 860 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 } } }],
  webServer: {
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1 --directory "${ROOT}"`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "ignore",
    timeout: 15_000,
  },
});
