// B10: acceptatie. De twee-minuten-toets als gescripte test, vanaf koud openen (elke deeltaak zijn eigen nieuwe
// pagina, echt "koud"), in Dark Forest (het standaardthema), op desktop 1280 en mobiel 375:
//   (a) eerste mail afhandelen                       <= 3 klikken
//   (b) actie maken van een mail                     <= 3 klikken (Enter mag, is niet nodig)
//   (c) Claude iets vragen over een item              <= 3 klikken (+ typen)
// Klikken tellen we expliciet (elke klik in het scenario loopt via de teller hieronder, nooit los een
// .click() ernaast); de hele toets (drie koude opens) blijft binnen 120s werkelijke tijd, en geen
// enkele pagina geeft een console-error of contractschending. Los daarvan: een toetsenbord-only variant
// (2, e, z; a; c) op desktop, met nul muisklikken.
// Plan: docs/UX-PLAN.md ("Nul-leercurve-toets"), docs/PLAN-FASE2.md (B10).
const { test, expect } = require("@playwright/test");
const { buildMock } = require("./fixtures");
const { openPage, entryButton, itemWith, detail, actionBar, feedbackBar, nav } = require("./helpers");

test.describe.configure({ timeout: 150_000 });

// ---------------------------------------------------------------------------------------------
// Klikteller: elke klik in het scenario gaat via klik(), zodat het budget een harde, natelbare
// tellervariabele is en geen aanname over "wat telt als een klik" in de vrije tekst blijft.
function clickCounter() {
  let n = 0;
  return {
    get count() { return n; },
    async klik(locator, opts) { n++; await locator.click(opts); },
    reset() { n = 0; },
  };
}

/** Een echt koude, verse pagina (eigen tab in dezelfde context): geen hergebruikte window.claude-state. */
async function coldOpen(context, overrides, viewport) {
  const page = await context.newPage();
  if (viewport) await page.setViewportSize(viewport);
  const problems = await openPage(page, buildMock(overrides));
  return { page, problems };
}

/** Wacht tot de eerste render helemaal klaar is (agenda, mail, Teams, acties, werk zijn dan geladen). */
async function ready(page) {
  await expect(page.getByText("Architectuuroverleg Object Store").first()).toBeVisible();
}

/** Sluit de pagina en keur hem af op console-errors, uncaught exceptions en contractschendingen. */
async function assertHealthy(page, problems, label) {
  const log = await page.evaluate(() => window.__MOCK_LOG__).catch(() => null);
  if (log) expect(log.violations, `${label}: contractschendingen`).toEqual([]);
  expect(problems.pageErrors, `${label}: uncaught exceptions`).toEqual([]);
  expect(problems.consoleErrors, `${label}: console-errors`).toEqual([]);
}

// Eerste mail volgens de fixture (tests/fixtures/mail.json: "Volgorde = newest first"), ongeacht of een
// Teams-bericht er in de samengevoegde Inbox-lijst nog boven staat: dit is de mail die als eerste binnenkwam.
const EERSTE_MAIL = "Planning release 26.4";
const MAIL_VOOR_ACTIE = "Budget CI-runners Q4";
const MAIL_VOOR_CLAUDE = "Vraag over OIDC-scope voor partnerportaal";

async function checkForestTheme(page) {
  await expect(page.locator("html")).toHaveAttribute("data-theme", "forest");
}

// =========================================================================================
for (const [label, viewport] of [["Desktop 1280", null], ["Mobiel 375", { width: 375, height: 812 }]]) {
  test.describe(`Twee-minuten-toets, ${label}, Dark Forest`, () => {
    test(`${label}: afhandelen, maak actie en Vraag Claude elk binnen 3 klikken, alles binnen 120s`, async ({ page: seedPage }) => {
      const context = seedPage.context();
      await seedPage.close(); // alleen nodig om aan een context te komen; elk deel opent zijn eigen koude pagina

      const t0 = Date.now();
      const pages = [];

      // ---- (a) Eerste mail afhandelen: nav -> rij -> Afhandelen. ----
      {
        const { page, problems } = await coldOpen(context, {}, viewport);
        pages.push(page);
        await ready(page);
        await checkForestTheme(page);
        const clicks = clickCounter();
        await clicks.klik(entryButton(page, "Inbox"));
        await clicks.klik(itemWith(page, EERSTE_MAIL));
        await expect(detail(page)).toContainText(EERSTE_MAIL);
        await clicks.klik(actionBar(page).getByRole("button", { name: "Afhandelen" }));
        await expect(feedbackBar(page)).toContainText(new RegExp(EERSTE_MAIL + " afgehandeld"));
        expect(clicks.count, "(a) afhandelen: klikbudget").toBeLessThanOrEqual(3);
        await assertHealthy(page, problems, "(a) afhandelen");
      }

      // ---- (b) Actie maken van een mail: nav -> rij -> Maak actie. Enter mag (typen in het na-veld en
      //      Enter bewaart), maar is hier niet nodig: de actiebalkknop voegt de actie direct toe. ----
      {
        const { page, problems } = await coldOpen(context, {}, viewport);
        pages.push(page);
        await ready(page);
        const clicks = clickCounter();
        await clicks.klik(entryButton(page, "Inbox"));
        await clicks.klik(itemWith(page, MAIL_VOOR_ACTIE));
        await expect(detail(page)).toContainText(MAIL_VOOR_ACTIE);
        await clicks.klik(actionBar(page).getByRole("button", { name: "Maak actie" }));
        await expect(feedbackBar(page)).toContainText(/Actie toegevoegd/);
        expect(clicks.count, "(b) maak actie: klikbudget").toBeLessThanOrEqual(3);
        await assertHealthy(page, problems, "(b) maak actie");
      }

      // ---- (c) Claude iets vragen over een mail: nav -> rij -> Vraag Claude, dan typen (+Enter) om te versturen. ----
      {
        const { page, problems } = await coldOpen(context, {}, viewport);
        pages.push(page);
        await ready(page);
        const clicks = clickCounter();
        await clicks.klik(entryButton(page, "Inbox"));
        await clicks.klik(itemWith(page, MAIL_VOOR_CLAUDE));
        await expect(detail(page)).toContainText(MAIL_VOOR_CLAUDE);
        await clicks.klik(actionBar(page).getByRole("button", { name: "Vraag Claude" }));
        const box = page.getByRole("textbox", { name: "Bericht aan Claude" });
        await expect(box).toBeFocused();
        await expect(page.getByRole("group", { name: "Context voor je vraag" })).toContainText("Over: " + MAIL_VOOR_CLAUDE);
        await box.fill("Wat vraagt Noor precies?"); // typen, telt niet als klik
        await box.press("Enter"); // versturen met Enter, geen extra klik
        await expect(page.getByText("Mock-antwoord van Claude").first()).toBeVisible({ timeout: 8000 });
        expect(clicks.count, "(c) Vraag Claude: klikbudget").toBeLessThanOrEqual(3);
        await assertHealthy(page, problems, "(c) Vraag Claude");
      }

      const elapsedMs = Date.now() - t0;
      for (const page of pages) await page.close();
      expect(elapsedMs, "de hele twee-minuten-toets (drie koude opens)").toBeLessThanOrEqual(120_000);
    });
  });
}

// =========================================================================================
test.describe("Toetsenbord-only variant (desktop, Dark Forest)", () => {
  test("2, e, z; a; c: eerste bericht afhandelen, ongedaan maken, actie maken en Claude vragen zonder één muisklik", async ({ page }) => {
    await openPage(page, buildMock());
    await ready(page);
    await checkForestTheme(page);

    // 2: naar Inbox (autoselecteert het bovenste bericht, want desktop selecteert automatisch de eerste rij).
    await page.keyboard.press("2");
    await expect(entryButton(page, "Inbox")).toHaveAttribute("aria-current", "page");
    await expect(detail(page).getByRole("heading", { level: 2 })).not.toHaveText("");
    const titel = await detail(page).getByRole("heading", { level: 2 }).innerText();

    // e: afhandelen (mail of Teams, wat er ook bovenaan staat); z: direct terugdraaien.
    await page.keyboard.press("e");
    await expect(feedbackBar(page)).toContainText("afgehandeld");
    await page.keyboard.press("z");
    await expect(feedbackBar(page)).toContainText("terug in de lijst");
    await expect(detail(page).getByRole("heading", { level: 2 })).toHaveText(titel); // zelfde item weer geselecteerd

    // a: actie maken van hetzelfde item.
    await page.keyboard.press("a");
    await expect(feedbackBar(page)).toContainText(/Actie toegevoegd/);

    // c: Vraag Claude over hetzelfde item.
    await page.keyboard.press("c");
    await expect(page.locator("#chat")).toBeVisible();
    await expect(page.getByRole("group", { name: "Context voor je vraag" })).toContainText(/^Over:/);
    await expect(page.getByRole("textbox", { name: "Bericht aan Claude" })).toBeFocused();

    const log = await page.evaluate(() => window.__MOCK_LOG__).catch(() => null);
    if (log) expect(log.violations, "contractschendingen").toEqual([]);
  });
});
