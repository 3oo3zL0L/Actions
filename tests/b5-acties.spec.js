// B5 Acties en voorstellen in het nieuwe patroon: rijen alleen wat en context, detail met bewerkbare velden,
// actiebalk Vink af (e) · Maak vandaag (v) · Vraag Claude (c) · Open bron (o), feedback met z = ongedaan,
// Nieuwe actie (n) als formulier bovenaan het detail, voorstellen zonder knoppen in de rij.
const { test: base, expect } = require("@playwright/test");
const { buildMock, data } = require("./fixtures");
const { openPage, mockLog, dbDump, itemWith, goTo, entryButton, detail, actionBar, feedbackBar, openItem, heading } = require("./helpers");

const test = base.extend({
  open: async ({ page }, use) => {
    let problems = null;
    await use(async (mock, opts) => (problems = await openPage(page, mock, opts)));
    if (!problems || page.isClosed()) return;
    const log = await page.evaluate(() => window.__MOCK_LOG__).catch(() => null);
    if (log) expect(log.violations, "contractschendingen").toEqual([]);
    expect(problems.pageErrors, "uncaught exceptions").toEqual([]);
    expect(problems.consoleErrors, "console-errors").toEqual([]);
  },
});

const SEED = "Akkoord geven op releaseplanning 26.4";
const seed = async (page, id = "seed-001") => (await dbDump(page, "acties/" + id))["acties/" + id];
const barLabels = (page) => actionBar(page).locator("[data-slot]").evaluateAll((els) => els.map((e) => e.childNodes[0].textContent.trim()));
const velden = (page) => detail(page).getByRole("group", { name: "Actie bewerken" });

function docsWith(extra = {}) {
  const acties = JSON.parse(JSON.stringify(data.acties));
  delete acties._comment;
  return {
    ...acties,
    "acties/oidc-1": { text: "Scope-besluit OIDC vastleggen", who: "Noor Mulder", due: "", prog: "OIDC", extra: "", why: "", status: "open",
      vandaag: false, bron: "klad", bronUrl: "", van: "", onderwerp: "", createdAt: "2026-09-24T09:00:00.000Z", updatedAt: "2026-09-24T09:00:00.000Z" },
    ...extra,
  };
}
const VOORSTEL = { "voorstellen/v1": { text: "Reageren op budgetvoorstel CI-runners", van: "Ruben Smit", onderwerp: "Budget CI-runners Q4",
  prog: "CI Acceleration", mail: "https://outlook.example.com/owa/?ItemID=mail-003", why: "Ruben wacht op akkoord voor Q4",
  createdAt: "2026-09-24T06:00:00.000Z", run: "ochtend-2026-09-24", status: "nieuw" } };

// =========================================================================================
test.describe("Lijst", () => {
  test("gegroepeerd Vandaag, dan per programma; Klaar en N.v.t. ingeklapt; rijen zonder knoppen of links", async ({ page, open }) => {
    await open(buildMock({ db: { docs: docsWith() } }));
    await goTo(page, "Acties");
    const lijst = page.locator("#acties-list");
    const koppen = await lijst.getByRole("heading").allInnerTexts();
    expect(koppen.map((k) => k.replace(/\s*\d+$/, ""))).toEqual(["Vandaag", "OIDC"]);
    await expect(lijst.getByText("Klaar (1)")).toBeVisible();
    await expect(lijst.getByText("N.v.t. (1)")).toBeVisible();
    await expect(page.getByText("Benchmark storage-backend doorlezen")).toBeHidden(); // Klaar is ingeklapt
    const rij = itemWith(page, SEED);
    await expect(rij).toContainText("26 sep"); // deadline rechts
    await expect(rij).toContainText("Platform Core"); // programma als context in de groep Vandaag
    await expect(rij).toContainText("mail");
    await expect(rij.getByRole("link")).toHaveCount(0);
    await expect(rij.getByRole("button")).toHaveCount(1); // alleen de rij zelf (selectie)
    await expect(rij).not.toContainText("Release kan pas door na akkoord"); // why staat in het detail
    const oidc = itemWith(page, "Scope-besluit OIDC vastleggen");
    await expect(oidc).toContainText("Noor Mulder");
    await expect(oidc.getByText("OIDC", { exact: true })).toHaveCount(0); // programma staat al in de groepskop
    // Geen oude invoerregel meer in de lijst; wel de knop Nieuwe actie met toets in de tooltip.
    await expect(page.locator("#acties-list").getByRole("textbox")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Nieuwe actie" })).toHaveAttribute("title", "Nieuwe actie (n)");
  });
});

// =========================================================================================
test.describe("Detail en actiebalk", () => {
  test("actiebalk: Vink af · Haal van vandaag · Vraag Claude · Open bron ↗ · Laten vervallen; elke knop noemt zijn toets", async ({ page, open }) => {
    await open(buildMock());
    await goTo(page, "Acties");
    await openItem(page, SEED);
    expect(await barLabels(page)).toEqual(["Vink af", "Haal van vandaag", "Vraag Claude", "Open bron", "Laten vervallen"]);
    for (const [name, key] of [["Vink af", "e"], ["Haal van vandaag", "v"], ["Vraag Claude", "c"], ["Laten vervallen", "x"]]) {
      await expect(actionBar(page).getByRole("button", { name })).toHaveAttribute("title", new RegExp("\\(" + key + "\\)$"));
    }
    const bron = actionBar(page).getByRole("link", { name: /Open bron/ });
    await expect(bron).toHaveAttribute("href", "https://outlook.example.com/owa/?ItemID=mail-001");
    await expect(bron).toHaveAttribute("title", "Open de bron in Outlook (o)");
    await expect(actionBar(page).getByRole("button", { name: "Verwijderen" })).toHaveCount(0);
  });

  test("e vinkt af met feedback die de actie noemt; z maakt het ongedaan", async ({ page, open }) => {
    await open(buildMock());
    await goTo(page, "Acties");
    await openItem(page, SEED);
    await page.keyboard.press("e");
    await expect.poll(async () => (await seed(page)).status).toBe("done");
    const bar = feedbackBar(page);
    await expect(bar).toContainText("✓ Actie afgevinkt: " + SEED);
    await expect(bar.getByRole("button", { name: "Ongedaan maken" })).toHaveAttribute("title", "Ongedaan maken (z)");
    await page.keyboard.press("z");
    await expect.poll(async () => (await seed(page)).status).toBe("open");
    await expect(itemWith(page, SEED)).toBeVisible();
  });

  test("alle velden bewerkbaar in het detail: tekst, wie, deadline, programma, waarom, notities; z zet een veld terug", async ({ page, open }) => {
    await open(buildMock({ db: { docs: docsWith() } }));
    await goTo(page, "Acties");
    await openItem(page, "Scope-besluit OIDC vastleggen");
    const v = velden(page);
    await expect(v.getByRole("textbox", { name: "Wie" })).toHaveValue("Noor Mulder");
    await expect(v.getByRole("combobox", { name: "Programma" })).toHaveValue("OIDC");

    // Deadline via een datumveld.
    await v.getByLabel("Deadline").fill("2026-10-03");
    await v.getByLabel("Deadline").press("Enter");
    await expect.poll(async () => (await seed(page, "oidc-1"))).toMatchObject({ dueIso: "2026-10-03", due: "3 okt" });
    await expect(feedbackBar(page)).toContainText("✓ Deadline aangepast: Scope-besluit OIDC vastleggen");
    await expect(itemWith(page, "Scope-besluit OIDC vastleggen")).toContainText("3 okt");
    await page.locator("body").press("z");
    await expect.poll(async () => (await seed(page, "oidc-1"))).toMatchObject({ dueIso: "", due: "" });
    await expect(v.getByLabel("Deadline")).toHaveValue("");

    // Tekst: Enter slaat op; titel en rij volgen. Wie + Tab: de focus blijft in het formulier (geen herbouw).
    const wat = v.getByRole("textbox", { name: "Wat" });
    await wat.fill("Scope-besluit OIDC vastleggen in ADR");
    await wat.press("Enter");
    await expect.poll(async () => (await seed(page, "oidc-1")).text).toBe("Scope-besluit OIDC vastleggen in ADR");
    await expect(detail(page).getByRole("heading", { level: 2 })).toHaveText("Scope-besluit OIDC vastleggen in ADR");
    await expect(itemWith(page, "Scope-besluit OIDC vastleggen in ADR")).toBeVisible();
    const wie = v.getByRole("textbox", { name: "Wie" });
    await wie.fill("Mark Bakker");
    await wie.press("Tab");
    await expect(v.getByLabel("Deadline")).toBeFocused();
    await expect.poll(async () => (await seed(page, "oidc-1")).who).toBe("Mark Bakker");

    // Waarom en notities (tekstvakken): opslaan bij verlaten; Esc verlaat het veld.
    const waarom = v.getByRole("textbox", { name: "Waarom" });
    await waarom.fill("Partnerportaal wacht op de scope");
    await waarom.press("Escape");
    await expect(waarom).not.toBeFocused();
    await expect.poll(async () => (await seed(page, "oidc-1")).why).toBe("Partnerportaal wacht op de scope");
    const notities = v.getByRole("textbox", { name: "Notities" });
    await notities.fill("Na security-review");
    await notities.blur();
    await expect.poll(async () => (await seed(page, "oidc-1")).extra).toBe("Na security-review");

    // Programma: de actie verhuist naar de andere groep.
    await v.getByRole("combobox", { name: "Programma" }).selectOption("Platform Core");
    await expect.poll(async () => (await seed(page, "oidc-1")).prog).toBe("Platform Core");
    await expect(page.locator("#acties-list").getByRole("heading", { name: /^Platform Core/ })).toBeVisible();
    await expect(page.locator("#acties-list").getByRole("heading", { name: /^OIDC/ })).toHaveCount(0);
  });

  test("v zet op vandaag en haalt ervan af; x laat vervallen naar N.v.t.; Heropen zet hem terug", async ({ page, open }) => {
    await open(buildMock({ db: { docs: docsWith() } }));
    await goTo(page, "Acties");
    await openItem(page, "Scope-besluit OIDC vastleggen");
    await page.keyboard.press("v");
    await expect.poll(async () => (await seed(page, "oidc-1")).vandaag).toBe(true);
    await expect(feedbackBar(page)).toContainText("✓ Op vandaag gezet: Scope-besluit OIDC vastleggen");
    await expect(actionBar(page).getByRole("button", { name: "Haal van vandaag" })).toBeVisible();
    const vandaagGroep = page.locator("#acties-list .agroup").filter({ has: page.getByRole("heading", { name: /^Vandaag/ }) });
    await expect(vandaagGroep.getByText("Scope-besluit OIDC vastleggen")).toBeVisible();
    await page.keyboard.press("z");
    await expect.poll(async () => (await seed(page, "oidc-1")).vandaag).toBe(false);

    await openItem(page, "Scope-besluit OIDC vastleggen");
    await page.keyboard.press("x");
    await expect.poll(async () => (await seed(page, "oidc-1")).status).toBe("dropped");
    await expect(feedbackBar(page)).toContainText("✓ Actie vervallen: Scope-besluit OIDC vastleggen");
    await page.getByText("N.v.t. (2)").click();
    await openItem(page, "Scope-besluit OIDC vastleggen");
    await expect(actionBar(page).getByRole("button", { name: "Heropen" })).toBeVisible();
    await page.keyboard.press("e");
    await expect.poll(async () => (await seed(page, "oidc-1")).status).toBe("open");
  });

  test("Vraag Claude (c) opent het paneel met de actie als context", async ({ page, open }) => {
    await open(buildMock());
    await goTo(page, "Acties");
    await openItem(page, SEED);
    await page.keyboard.press("c");
    await expect(page.getByRole("textbox", { name: "Bericht aan Claude" })).toBeFocused();
    await expect(page.getByRole("group", { name: "Context voor je vraag" })).toContainText("Over: " + SEED);
  });
});

// =========================================================================================
test.describe("Nieuwe actie", () => {
  test("n opent het formulier bovenaan het detail; tekst, programma en deadline; Enter bewaart en selecteert de nieuwe actie", async ({ page, open }) => {
    await open(buildMock());
    await goTo(page, "Acties");
    await openItem(page, SEED);
    await page.keyboard.press("n");
    const form = detail(page).getByRole("region", { name: "Nieuwe actie" });
    const text = form.getByRole("textbox", { name: "Nieuwe actie" });
    await expect(text).toBeFocused();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(form).not.toContainText(/\bnull\b|\bundefined\b/);
    await text.fill("Runnerkosten doorrekenen @Ruben_Smit");
    await form.getByRole("combobox", { name: "Programma" }).selectOption("CI Acceleration");
    await form.getByLabel("Deadline").fill("2026-10-02");
    await form.getByLabel("Deadline").press("Enter");
    await expect(form).toHaveCount(0);
    await expect(detail(page).getByRole("heading", { level: 2 })).toHaveText("Runnerkosten doorrekenen");
    await expect(feedbackBar(page)).toContainText("✓ Actie toegevoegd bij CI Acceleration: Runnerkosten doorrekenen");
    const doc = Object.values(await dbDump(page, "acties/")).find((d) => d.text === "Runnerkosten doorrekenen");
    expect(doc).toMatchObject({ who: "Ruben Smit", prog: "CI Acceleration", dueIso: "2026-10-02", due: "2 okt", status: "open", bron: "klad" });
    await expect(velden(page).getByRole("textbox", { name: "Wie" })).toHaveValue("Ruben Smit");
    // z haalt de nieuwe actie weer weg.
    await page.locator("body").press("z");
    await expect.poll(async () => Object.values(await dbDump(page, "acties/")).some((d) => d.text === "Runnerkosten doorrekenen")).toBe(false);
  });

  test("knop Nieuwe actie in de lijstkop; Esc sluit zonder op te slaan; lege tekst geeft uitleg", async ({ page, open }) => {
    await open(buildMock());
    await goTo(page, "Acties");
    await page.getByRole("button", { name: "Nieuwe actie" }).click();
    const form = detail(page).getByRole("region", { name: "Nieuwe actie" });
    await form.getByRole("button", { name: "Bewaar" }).click();
    await expect(form).toContainText("Typ eerst wat er moet gebeuren.");
    const before = (await mockLog(page)).db.filter((w) => w.op === "set" && w.path.startsWith("acties/")).length;
    await form.getByRole("textbox", { name: "Nieuwe actie" }).fill("Dit bewaar ik niet");
    await page.keyboard.press("Escape");
    await expect(form).toHaveCount(0);
    await expect(page.locator('#lijst button[aria-current="true"]')).toBeFocused(); // Esc: focus naar de geselecteerde rij
    expect((await mockLog(page)).db.filter((w) => w.op === "set" && w.path.startsWith("acties/")).length).toBe(before);
  });

  test("Maak actie vanuit een mail: formulier met onderwerp en bron; Enter bewaart met bronlink", async ({ page, open }) => {
    await open(buildMock());
    await goTo(page, "Inbox");
    await openItem(page, "Budget CI-runners Q4");
    await actionBar(page).getByRole("button", { name: "Maak actie" }).click();
    await expect(entryButton(page, "Acties")).toHaveAttribute("aria-current", "page");
    const form = detail(page).getByRole("region", { name: "Nieuwe actie" });
    await expect(form).toContainText("Bron: mail van Ruben Smit");
    const text = form.getByRole("textbox", { name: "Nieuwe actie" });
    await expect(text).toHaveValue("Budget CI-runners Q4");
    await expect(text).toBeFocused();
    await text.press("Enter");
    await expect.poll(async () => Object.values(await dbDump(page, "acties/")).some((d) => d.text === "Budget CI-runners Q4")).toBe(true);
    const saved = Object.values(await dbDump(page, "acties/")).find((d) => d.text === "Budget CI-runners Q4");
    expect(saved).toMatchObject({ bron: "mail", bronUrl: "https://outlook.example.com/owa/?ItemID=mail-003", van: "Ruben Smit", onderwerp: "Budget CI-runners Q4" });
    await expect(actionBar(page).getByRole("link", { name: /Open bron/ })).toHaveAttribute("href", "https://outlook.example.com/owa/?ItemID=mail-003");
  });
});

// =========================================================================================
test.describe("Voorstellen en Vandaag", () => {
  test("voorstel: rij zonder knoppen, detail met Op de lijst · Weg · Open bron; e legt weg, z zet terug", async ({ page, open }) => {
    await open(buildMock({ db: { docs: docsWith(VOORSTEL) } }));
    await goTo(page, "Acties");
    const rij = itemWith(page, "Reageren op budgetvoorstel CI-runners");
    await expect(rij.getByRole("button")).toHaveCount(1);
    await expect(rij.getByRole("link")).toHaveCount(0);
    await openItem(page, "Reageren op budgetvoorstel CI-runners");
    expect(await barLabels(page)).toEqual(["Op de lijst", "Weg", "Vraag Claude", "Open bron"]); // Vraag Claude: standaard van de schil
    await expect(actionBar(page).getByRole("button", { name: "Op de lijst" })).toHaveAttribute("title", /\(a\)$/);
    await page.keyboard.press("e");
    await expect.poll(async () => (await dbDump(page, "voorstellen/v1"))["voorstellen/v1"].status).toBe("nee");
    await expect(feedbackBar(page)).toContainText("✓ Weggelegd: Reageren op budgetvoorstel CI-runners");
    await page.keyboard.press("z");
    await expect.poll(async () => (await dbDump(page, "voorstellen/v1"))["voorstellen/v1"].status).toBe("nieuw");
  });

  test("Vandaag: afspraken van nu, acties met vandaag en nieuwe voorstellen; Haal van vandaag haalt de actie eruit", async ({ page, open }) => {
    await open(buildMock({ db: { docs: docsWith(VOORSTEL) } }));
    await expect(heading(page, "Acties voor vandaag")).toBeVisible();
    await expect(heading(page, "Nieuwe voorstellen")).toBeVisible();
    await expect(itemWith(page, "Reageren op budgetvoorstel CI-runners")).toBeVisible();
    await openItem(page, SEED);
    await actionBar(page).getByRole("button", { name: "Haal van vandaag" }).click();
    await expect(page.getByText("Geen acties voor vandaag. Open een actie en kies Maak vandaag (v).")).toBeVisible();
    await expect(entryButton(page, "Vandaag")).toHaveAttribute("aria-current", "page");
  });

  test("mobiel 375px: Acties, detail met velden en actiebalk, geen horizontale scroll", async ({ page, open }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await open(buildMock());
    await goTo(page, "Acties");
    await openItem(page, SEED);
    await expect(velden(page).getByRole("textbox", { name: "Wat" })).toBeVisible();
    await expect(actionBar(page).getByRole("button", { name: "Vink af" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole("button", { name: /Terug/ }).click();
    await page.getByRole("button", { name: "Nieuwe actie" }).click();
    await expect(detail(page).getByRole("region", { name: "Nieuwe actie" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
