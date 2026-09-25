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

/** Heading-locator op naam (regex), niveau-onafhankelijk; alleen zichtbare (de schil toont één ingang tegelijk). */
const heading = (page, name) => page.getByRole("heading", { name }).filter({ visible: true });

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
 * Het zichtbare item (listitem/article/rij) dat `text` bevat: de binnenste container
 * rond de tekst, zonder op classnames te leunen.
 */
function itemWith(page, text) {
  return page.locator("li, [role=listitem], article, tr, [role=row]").filter({ hasText: text }).filter({ visible: true }).last();
}

// ---- Schil (B1): ingangen, selectie, detail met actiebalk, feedbackbalk ----
const ENTRY_NAMES = ["Vandaag", "Inbox", "Acties", "Werk", "Agenda"];
/** De navigatie met de vijf ingangen. */
const nav = (page) => page.getByRole("navigation", { name: "Ingangen" });
/** Knop van een ingang in de navigatie (naam begint met de ingang; de teller staat erachter). */
const entryButton = (page, name) => nav(page).getByRole("button", { name: new RegExp("^" + name + "\\b") });
/** Naar een ingang: Vandaag, Inbox, Acties, Werk of Agenda. */
async function goTo(page, name) {
  await entryButton(page, name).click();
  await expect(entryButton(page, name)).toHaveAttribute("aria-current", "page");
}
/** De detailkolom (rechts; op mobiel het tweede scherm). */
const detail = (page) => page.getByRole("region", { name: "Detail" });
/** De actiebalk van het geopende detail. */
const actionBar = (page) => detail(page).getByRole("toolbar", { name: "Actiebalk" });
/** De feedbackbalk onderaan. */
const feedbackBar = (page) => page.locator("#feedback");
/** Selecteer de zichtbare rij met `text` (klik op de rij) en wacht tot het detail hem toont. */
async function openItem(page, text, expectInDetail) {
  const row = itemWith(page, text);
  await row.click({ position: { x: 60, y: 14 } });
  if (expectInDetail !== false) await expect(detail(page)).toContainText(expectInDetail || text);
  return row;
}
/** Open het Claude-paneel zonder item en geef de invoer terug. B7: via "Zoek of vraag…" bovenaan (de command bar)
 *  en de suggestie "Vraag Claude" (zonder tekst: paneel zonder itemcontext, zoals de oude knop). */
async function openClaude(page) {
  await page.getByRole("button", { name: /Zoek of vraag/ }).click();
  await page.getByRole("option", { name: /^Vraag Claude/ }).click();
  const box = page.getByRole("textbox", { name: "Bericht aan Claude" });
  await expect(box).toBeFocused();
  return box;
}

/**
 * Klik een tab (bv. "Teams") als die inhoud achter een tab zit; anders niets. Staat de tab in een
 * andere ingang (Mail/Teams in Inbox, Jira/Confluence in Werk), dan eerst naar die ingang.
 */
async function revealTab(page, name) {
  const tab = page.getByRole("tab", { name, includeHidden: true });
  if (!(await tab.count())) return;
  if (!(await tab.first().isVisible())) {
    const label = await tab.first().innerText();
    await goTo(page, /mail|teams/i.test(label) ? "Inbox" : "Werk");
  }
  await tab.first().click();
}

/** Tekst die nooit op het scherm mag staan (lekkende implementatie). */
const JUNK_TEXT = [/\[object Object\]/, /\bundefined\b/, /\bNaN\b/, /moreResults|nextOffset|nextCursor/];

module.exports = { openPage, mockLog, mcpCalls, dbDump, heading, section, itemWith, revealTab, JUNK_TEXT, PAGE_URL,
  ENTRY_NAMES, nav, entryButton, goTo, detail, actionBar, feedbackBar, openItem, openClaude };
