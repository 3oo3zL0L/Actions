// Gedeelde helpers voor de Actiepagina-tests.
const path = require("path");
const { expect } = require("@playwright/test");

const MOCK_SCRIPT = path.join(__dirname, "mock-claude.js");
const PAGE_URL = process.env.ACTIEPAGINA_PAGE || "/index.html";

/**
 * Laadt de pagina met de mock. `mock` = window.__MOCK__ (zie fixtures/index.js).
 * Zet de browserklok op mock.refNow (tijd loopt daarna gewoon door), vangt
 * console-errors en pageerrors op, en stubt Google Fonts zodat tests niet van
 * het netwerk afhangen.
 */
async function openPage(page, mock, { url = PAGE_URL, waitFor = "load" } = {}) {
  const problems = { consoleErrors: [], pageErrors: [], requestFailures: [] };
  page.on("console", (msg) => { if (msg.type() === "error") problems.consoleErrors.push(msg.text()); });
  page.on("pageerror", (err) => problems.pageErrors.push(String(err && err.stack || err)));
  page.on("requestfailed", (req) => problems.requestFailures.push(`${req.url()} ${req.failure() && req.failure().errorText}`));

  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/, (route) =>
    route.fulfill({ status: 200, contentType: route.request().url().includes("googleapis") ? "text/css" : "font/woff2", body: "" }));

  if (mock && mock.refNow) await page.clock.install({ time: mock.refNow });
  await page.addInitScript((cfg) => { window.__MOCK__ = cfg; }, mock || {});
  await page.addInitScript({ path: MOCK_SCRIPT });
  await page.goto(url, { waitUntil: waitFor });
  return problems;
}

/** Alle mock-logs uit de pagina. */
const mockLog = (page) => page.evaluate(() => window.__MOCK_LOG__);
const mcpCalls = async (page, tool) => (await mockLog(page)).mcp.filter((c) => !tool || (tool instanceof RegExp ? tool.test(c.tool) : c.tool === tool));
const dbDump = (page, prefix = "") => page.evaluate((p) => window.__mockDb.dump(p), prefix);

/** Heading-locator op naam (regex), niveau-onafhankelijk. */
const heading = (page, name) => page.getByRole("heading", { name });

/**
 * De sectie die bij een heading hoort: bij voorkeur een benoemde region
 * (section met aria-labelledby), anders de binnenste section/article/aside
 * die de heading bevat.
 */
async function section(page, name) {
  await expect(heading(page, name).first()).toBeVisible();
  const region = page.getByRole("region", { name });
  if (await region.count()) return region.first();
  return page.locator("section, [role=region], article, aside")
    .filter({ has: page.getByRole("heading", { name }) }).last();
}

/**
 * Het item (listitem/article/rij) dat `text` bevat: de binnenste container
 * rond de tekst, zonder op classnames te leunen.
 */
function itemWith(page, text) {
  return page.locator("li, [role=listitem], article, tr, [role=row]").filter({ hasText: text }).last();
}

/** Klik een tab/knop "Teams" als Teams achter een tab zit; anders niets. */
async function revealTab(page, name) {
  const tab = page.getByRole("tab", { name });
  if (await tab.count()) await tab.first().click();
}

/** Tekst die nooit op het scherm mag staan (lekkende implementatie). */
const JUNK_TEXT = [/\[object Object\]/, /\bundefined\b/, /\bNaN\b/, /moreResults|nextOffset|nextCursor/];

module.exports = { openPage, mockLog, mcpCalls, dbDump, heading, section, itemWith, revealTab, JUNK_TEXT, PAGE_URL };
