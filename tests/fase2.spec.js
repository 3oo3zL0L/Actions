// Fase 2: Actiepagina is de hoofdlijst. Voorstellen uit de Cowork-ochtendrun (db `voorstellen`),
// why/extra in actierijen, PAF-lijst als archief. Zelfde mock en helpers als actiepagina.spec.js.
const { test: base, expect } = require("@playwright/test");
const { buildMock, data } = require("./fixtures");
const { openPage, mockLog, dbDump, itemWith } = require("./helpers");

const SEND_TOOLS = /send_mail|send_draft|forward_mail|outlook_send/;
const test = base.extend({
  open: async ({ page }, use) => {
    let problems = null;
    await use(async (mock, opts) => (problems = await openPage(page, mock, opts)));
    if (!problems || page.isClosed()) return;
    const log = await page.evaluate(() => window.__MOCK_LOG__).catch(() => null);
    if (log) {
      expect(log.violations, "contractschendingen").toEqual([]);
      expect(log.mcp.filter((c) => SEND_TOOLS.test(c.tool))).toEqual([]);
    }
    expect(problems.pageErrors, "uncaught exceptions").toEqual([]);
  },
});

const VOORSTELLEN = {
  "voorstellen/v1": { text: "Reageren op budgetvoorstel CI-runners", van: "Ruben Smit", onderwerp: "Budget CI-runners Q4",
    prog: "CI Acceleration", mail: "https://outlook.example.com/owa/?ItemID=mail-003", why: "Ruben wacht op akkoord voor Q4",
    createdAt: "2026-09-24T06:00:00.000Z", run: "ochtend-2026-09-24", status: "nieuw" },
  "voorstellen/v2": { tekst: "OIDC-scope beoordelen voor partnerportaal", van: "Noor Mulder", onderwerp: "Vraag over OIDC-scope",
    programma: "OIDC", mail: "https://outlook.example.com/owa/?ItemID=mail-005",
    createdAt: "2026-09-24T06:01:00.000Z", run: "ochtend-2026-09-24", status: "nieuw" },
  "voorstellen/v3": { text: "Al eerder afgewezen voorstel", van: "x", onderwerp: "y", prog: "Overig",
    mail: "https://outlook.example.com/owa/?ItemID=mail-009", createdAt: "2026-09-23T06:00:00.000Z", run: "r", status: "nee" },
};

function mockWith(extraDocs = {}) {
  const acties = JSON.parse(JSON.stringify(data.acties));
  delete acties._comment;
  return buildMock({ db: { docs: { ...acties, ...VOORSTELLEN, ...extraDocs } } });
}
const voorstelBlok = (page) => page.locator("#voorstellen");

test.describe("Fase 2: voorstellen uit je mail", () => {
  test("toont alleen nieuwe voorstellen met bronregel en mail-link", async ({ page, open }) => {
    await open(mockWith());
    const blok = voorstelBlok(page);
    await expect(blok.getByRole("heading", { name: /voorstellen \(2\)/i })).toBeVisible();
    await expect(blok.getByText("Reageren op budgetvoorstel CI-runners")).toBeVisible();
    await expect(blok.getByText("OIDC-scope beoordelen voor partnerportaal")).toBeVisible(); // `tekst` defensief gelezen
    await expect(blok.getByText("Al eerder afgewezen voorstel")).toHaveCount(0);
    const rij = itemWith(page, "Reageren op budgetvoorstel CI-runners");
    await expect(rij).toContainText("Ruben Smit · Budget CI-runners Q4 · CI Acceleration");
    const link = rij.getByRole("link", { name: /mail/i });
    await expect(link).toHaveAttribute("href", "https://outlook.example.com/owa/?ItemID=mail-003");
    await expect(link).toHaveAttribute("target", "_blank");
  });

  test("zonder nieuwe voorstellen alleen een compacte scanregel", async ({ page, open }) => {
    await open(buildMock());
    await expect(page.getByText("Akkoord geven op releaseplanning 26.4").first()).toBeVisible();
    // Ronde 4: geen kop, alleen een compacte regel met "Scan nu".
    await expect(page.getByRole("heading", { name: /voorstellen \(/i })).toHaveCount(0);
    await expect(page.locator("#voorstellen")).toContainText("Geen voorstellen");
    await expect(page.locator("#voorstellen").getByRole("button", { name: "Scan nu" })).toBeVisible();
  });

  test("Op de lijst maakt actie v-<id> en zet voorstel op ja", async ({ page, open }) => {
    await open(mockWith());
    await itemWith(page, "Reageren op budgetvoorstel CI-runners").getByRole("button", { name: "Op de lijst" }).click();
    await expect.poll(async () => (await dbDump(page, "voorstellen/v1"))["voorstellen/v1"]?.status).toBe("ja");
    const actie = (await dbDump(page, "acties/v-v1"))["acties/v-v1"];
    expect(actie).toMatchObject({ text: "Reageren op budgetvoorstel CI-runners", status: "open", bron: "mail",
      bronUrl: "https://outlook.example.com/owa/?ItemID=mail-003", van: "Ruben Smit", onderwerp: "Budget CI-runners Q4",
      prog: "CI Acceleration" });
    await expect(page.getByRole("heading", { name: /voorstellen \(1\)/i })).toBeVisible();
    // Actie staat nu in de lijst, met why als tweede regel.
    await expect(page.locator("#acties-list").getByText("Reageren op budgetvoorstel CI-runners")).toBeVisible();
    await expect(page.locator("#acties-list").getByText("Ruben wacht op akkoord voor Q4")).toBeVisible();
  });

  test("Weg zet voorstel op nee zonder actie te maken", async ({ page, open }) => {
    await open(mockWith());
    await itemWith(page, "OIDC-scope beoordelen voor partnerportaal").getByRole("button", { name: "Weg" }).click();
    await expect.poll(async () => (await dbDump(page, "voorstellen/v2"))["voorstellen/v2"]?.status).toBe("nee");
    expect(Object.keys(await dbDump(page, "acties/v-"))).toEqual([]);
    await expect(voorstelBlok(page).getByRole("listitem").filter({ hasText: "OIDC-scope beoordelen voor partnerportaal" })).toHaveCount(0);
    await expect(voorstelBlok(page).getByText(/Weggelegd: OIDC-scope/)).toBeVisible();
  });

  test("Ongedaan maken na Op de lijst verwijdert de actie en zet voorstel terug op nieuw", async ({ page, open }) => {
    await open(mockWith());
    await itemWith(page, "Reageren op budgetvoorstel CI-runners").getByRole("button", { name: "Op de lijst" }).click();
    await expect.poll(async () => (await dbDump(page, "voorstellen/v1"))["voorstellen/v1"]?.status).toBe("ja");
    await page.getByRole("button", { name: "Ongedaan maken" }).click();
    await expect.poll(async () => (await dbDump(page, "voorstellen/v1"))["voorstellen/v1"]?.status).toBe("nieuw");
    await expect.poll(async () => Object.keys(await dbDump(page, "acties/v-v1")).length).toBe(0);
    await expect(voorstelBlok(page).getByRole("listitem").filter({ hasText: "Reageren op budgetvoorstel CI-runners" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ongedaan maken" })).toHaveCount(0);
  });

  test("Ongedaan maken na Weg zet voorstel terug op nieuw", async ({ page, open }) => {
    await open(mockWith());
    await itemWith(page, "OIDC-scope beoordelen voor partnerportaal").getByRole("button", { name: "Weg" }).click();
    await expect.poll(async () => (await dbDump(page, "voorstellen/v2"))["voorstellen/v2"]?.status).toBe("nee");
    await page.getByRole("button", { name: "Ongedaan maken" }).click();
    await expect.poll(async () => (await dbDump(page, "voorstellen/v2"))["voorstellen/v2"]?.status).toBe("nieuw");
    const deletes = (await mockLog(page)).db.filter((w) => w.op === "delete");
    expect(deletes).toEqual([]);
  });
});

test.describe("Fase 2: actierijen en archief", () => {
  test("why en extra staan als tweede en derde regel; bron paf zonder link", async ({ page, open }) => {
    await open(mockWith({
      "acties/paf-17": { text: "Roadmap Object Store afstemmen", who: "eigen actie", due: "3 okt", prog: "Object Store",
        extra: "Notitie: na architectuuroverleg", why: "Keuze storage-backend blokkeert planning", status: "open",
        vandaag: false, bron: "paf", bronUrl: "", pafId: "17", van: "", onderwerp: "",
        createdAt: "2026-09-01T08:00:00.000Z", updatedAt: "2026-09-01T08:00:00.000Z" },
    }));
    const rij = itemWith(page, "Roadmap Object Store afstemmen");
    await expect(rij.getByText("Keuze storage-backend blokkeert planning")).toBeVisible();
    await expect(rij.getByText("Notitie: na architectuuroverleg")).toBeVisible();
    await expect(rij.getByText(/PAF/)).toBeVisible();
    await expect(rij.getByRole("link")).toHaveCount(0);
    // Volgorde: titel, why, extra.
    const txt = await rij.innerText();
    expect(txt.indexOf("Roadmap")).toBeLessThan(txt.indexOf("Keuze storage-backend"));
    expect(txt.indexOf("Keuze storage-backend")).toBeLessThan(txt.indexOf("Notitie:"));
  });

  test("PAF-link is het archief", async ({ page, open }) => {
    await open(buildMock());
    const link = page.getByRole("link", { name: /oude PAF actielijst \(archief\)/i });
    await expect(link).toHaveAttribute("href", "https://claude.ai/artifact/Ar6sRYzLNFu5dzdLw1Y4gw");
    await expect(page.getByText("Alles staat nu hier. Alleen nog ter referentie.")).toBeVisible();
  });
});
