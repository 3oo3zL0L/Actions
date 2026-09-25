// B7: command bar (Ctrl+K of /) en sneltoetsen. Eén invoer voor navigeren, uitvoeren en vragen aan Claude;
// max 7 suggesties met de sneltoets rechts; de laatste is altijd "Vraag Claude: <tekst>". Toetsen nooit tijdens typen.
const { test: base, expect } = require("@playwright/test");
const { buildMock } = require("./fixtures");
const { openPage, mcpCalls, mockLog, itemWith, goTo, entryButton, detail, actionBar, feedbackBar, openItem } = require("./helpers");

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

const bar = (page) => page.getByRole("combobox", { name: "Zoek, voer uit of vraag Claude" });
const options = (page) => page.getByRole("listbox", { name: "Suggesties" }).getByRole("option");
const activeOption = (page) => page.getByRole("listbox", { name: "Suggesties" }).locator('[role=option][aria-selected="true"]');
async function openBar(page, text) {
  await page.keyboard.press("Control+k");
  await expect(bar(page)).toBeFocused();
  if (text != null) await bar(page).fill(text);
  return bar(page);
}
async function ready(page) { await expect(page.getByText("Architectuuroverleg Object Store").first()).toBeVisible(); }

// =========================================================================================
test.describe("Openen, rollen en toetsenbord", () => {
  test("Ctrl+K en / openen de bar (combobox + listbox), max 7 suggesties met sneltoets, Esc sluit en geeft de focus terug", async ({ page, open }) => {
    await open(buildMock());
    await ready(page);
    await goTo(page, "Inbox");
    await openItem(page, "Budget CI-runners Q4");
    const box = await openBar(page);
    await expect(box).toHaveAttribute("aria-expanded", "true");
    await expect(box).toHaveAttribute("aria-controls", "cmdList");
    const n = await options(page).count();
    expect(n).toBeGreaterThan(3);
    expect(n).toBeLessThanOrEqual(7);
    // Leeg: eerst alle acties van het geselecteerde item, met hun toets.
    await expect(options(page).first()).toContainText("Beantwoord"); // B2: Beantwoord vervangt Antwoord-concept
    await expect(options(page).first()).toContainText("r");
    await expect(page.getByRole("option", { name: /Afhandelen.*e$/ })).toBeVisible();
    await expect(page.getByRole("option", { name: /Allen beantwoorden.*l$/ })).toBeVisible(); // ook acties zonder knop (slot more); max 7 suggesties
    await expect(options(page).last()).toHaveAccessibleName(/^Vraag Claude/);
    // Pijltjes en aria-activedescendant.
    const first = await box.getAttribute("aria-activedescendant");
    await page.keyboard.press("ArrowDown");
    expect(await box.getAttribute("aria-activedescendant")).not.toBe(first);
    await expect(activeOption(page)).toHaveCount(1);
    await page.keyboard.press("ArrowUp");
    expect(await box.getAttribute("aria-activedescendant")).toBe(first);
    await page.keyboard.press("Escape");
    await expect(box).toBeHidden();
    // "/" opent ook; zichtbare knop "Zoek of vraag…" in de kop opent dezelfde bar.
    await page.locator("body").press("/");
    await expect(bar(page)).toBeFocused();
    await page.keyboard.press("Escape");
    const btn = page.getByRole("button", { name: /Zoek of vraag/ });
    await expect(btn).toHaveAttribute("title", /Ctrl K/);
    await btn.click();
    await expect(bar(page)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(btn).toBeFocused();
  });

  test("toetsen zijn niet actief tijdens typen (ook niet in de bar zelf)", async ({ page, open }) => {
    await open(buildMock());
    await ready(page);
    await goTo(page, "Acties");
    await page.getByRole("button", { name: "Nieuwe actie" }).click(); // B5: formulier bovenaan het detail
    const add = page.getByRole("textbox", { name: "Nieuwe actie" });
    await add.fill("");
    await add.pressSequentially("a/b 2 jk e?");
    await expect(add).toHaveValue("a/b 2 jk e?");
    await expect(bar(page)).toBeHidden();
    await expect(entryButton(page, "Acties")).toHaveAttribute("aria-current", "page");
    // In de bar: cijfers en letters zijn tekst.
    const box = await openBar(page);
    await box.pressSequentially("2e");
    await expect(box).toHaveValue("2e");
    await expect(entryButton(page, "Acties")).toHaveAttribute("aria-current", "page");
    await page.keyboard.press("Escape");
    // Ctrl+K werkt wel vanuit een invoerveld.
    await add.focus();
    await page.keyboard.press("Control+k");
    await expect(bar(page)).toBeFocused();
  });

  test("? toont het nieuwe sneltoetsenoverzicht", async ({ page, open }) => {
    await open(buildMock());
    await ready(page);
    await page.locator("body").press("?");
    const d = page.getByRole("dialog", { name: "Sneltoetsen" });
    await expect(d).toBeVisible();
    for (const t of ["Zoek of vraag", "Vandaag, Inbox, Acties, Werk, Agenda", "Detail openen (mobiel), primaire actie", "Afhandelen of afvinken", "Beantwoorden of reageren",
      "Maak actie van dit item", "Vraag Claude over dit item", "Open in Outlook, Teams, Jira of Confluence", "Nieuwe actie", "Ongedaan maken", "Alles verversen", "Oude sprongtoetsen"]) {
      await expect(d).toContainText(t);
    }
    await expect(d).not.toContainText(/[–—]/);
  });
});

// =========================================================================================
test.describe("Navigeren", () => {
  test("ingangen op naam en synoniem, hoofdletterongevoelig; Enter springt", async ({ page, open }) => {
    await open(buildMock());
    await ready(page);
    await openBar(page, "WERK");
    await expect(options(page).first()).toHaveAccessibleName(/^Ga naar Werk 4$/);
    await page.keyboard.press("Enter");
    await expect(entryButton(page, "Werk")).toHaveAttribute("aria-current", "page");
    await openBar(page, "kalender");
    await expect(options(page).first()).toHaveAccessibleName(/Ga naar Agenda/);
    await page.keyboard.press("Enter");
    await expect(entryButton(page, "Agenda")).toHaveAttribute("aria-current", "page");
    await openBar(page, "inb");
    await expect(activeOption(page)).toHaveAccessibleName(/Ga naar Inbox/);
    await page.keyboard.press("Enter");
    await expect(entryButton(page, "Inbox")).toHaveAttribute("aria-current", "page");
  });

  test("itemtitels uit de geladen lijsten: springt naar de ingang, tab en rij en opent het detail", async ({ page, open }) => {
    await open(buildMock());
    await ready(page);
    await openBar(page, "retentie");
    await expect(activeOption(page)).toContainText("OBJS-7 Retentiebeleid voor object versies");
    await page.keyboard.press("Enter");
    await expect(entryButton(page, "Werk")).toHaveAttribute("aria-current", "page");
    await expect(detail(page).getByRole("heading", { level: 2 })).toHaveText("OBJS-7 Retentiebeleid voor object versies");
    // Confluence-pagina achter de andere tab.
    await openBar(page, "oidc ontwerp");
    await expect(activeOption(page)).toContainText("OIDC ontwerpkeuzes");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("tab", { name: /Confluence/ })).toHaveAttribute("aria-selected", "true");
    await expect(detail(page).getByRole("heading", { level: 2 })).toHaveText("OIDC ontwerpkeuzes");
    // Mail op onderwerp, met muisklik op de suggestie.
    await openBar(page, "budget");
    await page.getByRole("option", { name: /Budget CI-runners Q4/ }).click();
    await expect(entryButton(page, "Inbox")).toHaveAttribute("aria-current", "page");
    await expect(detail(page).getByRole("heading", { level: 2 })).toHaveText("Budget CI-runners Q4");
    await expect(itemWith(page, "Budget CI-runners Q4").locator('button[aria-current="true"]')).toBeFocused();
  });
});

// =========================================================================================
test.describe("Uitvoeren", () => {
  test("acties van het geselecteerde item, ook via synoniem ('beantwoord', 'afhandelen')", async ({ page, open }) => {
    await open(buildMock());
    await ready(page);
    await goTo(page, "Inbox");
    await openItem(page, "Budget CI-runners Q4");
    await openBar(page, "beantwoord");
    await expect(activeOption(page)).toHaveAccessibleName(/Beantwoord Mail: Budget CI-runners Q4 r$/);
    await page.keyboard.press("Enter");
    await expect(detail(page).getByRole("textbox", { name: "Tekst" })).toBeVisible();
    await detail(page).getByRole("button", { name: "Annuleren" }).click();
    await openBar(page, "afhandelen");
    await expect(activeOption(page)).toHaveAccessibleName(/Afhandelen Mail: Budget CI-runners Q4 e$/);
    await page.keyboard.press("Enter");
    await expect(feedbackBar(page)).toContainText("Budget CI-runners Q4 afgehandeld"); // PO: de balk noemt het item
  });

  test("Jira: Status en Toewijzen (geen knop) via de bar", async ({ page, open }) => {
    await open(buildMock());
    await ready(page);
    await goTo(page, "Werk");
    await openItem(page, "Retentiebeleid voor object versies");
    await openBar(page);
    const names = ["Reageer", "Maak actie", "Vraag Claude", "Open in Jira", "Status", "Toewijzen"];
    for (let k = 0; k < names.length; k++) await expect(options(page).nth(k)).toHaveAccessibleName(new RegExp("^Doen " + names[k] + " Jira: OBJS-7"));
    await bar(page).fill("toew");
    await expect(activeOption(page)).toHaveAccessibleName(/Toewijzen .* t$/);
    await page.keyboard.press("Enter");
    await expect(detail(page).getByRole("group", { name: "Toewijzen: OBJS-7" })).toBeVisible();
    await page.keyboard.press("Escape");
    await openBar(page, "status");
    await page.keyboard.press("Enter");
    await expect(detail(page).getByRole("group", { name: "Zet status op" })).toBeVisible();
  });

  test("algemene commando's: nieuwe actie, ververs alles, thema, nieuw Jira-issue, plan een vergadering", async ({ page, open }) => {
    await open(buildMock());
    await ready(page);
    // Nieuwe actie
    await openBar(page, "nieuwe actie");
    await expect(activeOption(page)).toHaveAccessibleName(/Nieuwe actie n$/);
    await page.keyboard.press("Enter");
    await expect(entryButton(page, "Acties")).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("textbox", { name: "Nieuwe actie" })).toBeFocused();
    // Ververs alles
    const before = (await mcpCalls(page, "outlook_email_search")).length;
    await openBar(page, "ververs");
    await expect(activeOption(page)).toHaveAccessibleName(/Ververs alles Shift R$/);
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await mcpCalls(page, "outlook_email_search")).length).toBeGreaterThan(before);
    // Thema
    const t0 = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    await openBar(page, "thema");
    await page.keyboard.press("Enter");
    await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme"))).not.toBe(t0);
    // Nieuw Jira-issue vanuit een Jira-item: project van dat item staat voor.
    await goTo(page, "Werk");
    await openItem(page, "Build-cache delen tussen runners");
    await openBar(page, "nieuw jira");
    await page.keyboard.press("Enter");
    const form = detail(page).getByRole("group", { name: /^Nieuw Jira-issue/ });
    await expect(form).toBeVisible();
    await expect(form.getByRole("combobox", { name: "Project" })).toHaveValue("CIACC");
    await form.getByRole("textbox", { name: "Samenvatting" }).press("Escape");
    // Plan een vergadering (groep B levert planMeeting): de bar noemt toets p en opent de planner in Agenda.
    await openBar(page, "vergadering");
    await expect(activeOption(page)).toHaveAccessibleName(/Plan een vergadering p$/);
    await page.keyboard.press("Enter");
    await expect(entryButton(page, "Agenda")).toHaveAttribute("aria-current", "page");
    await expect(detail(page).getByRole("region", { name: "Plan een vergadering" })).toBeVisible();
  });
});

// =========================================================================================
test.describe("Vragen", () => {
  test("onbekende tekst gaat als eigen vraag naar Claude, met het geselecteerde item als context", async ({ page, open }) => {
    await open(buildMock());
    await ready(page);
    await goTo(page, "Inbox");
    await openItem(page, "Budget CI-runners Q4");
    await openBar(page, "Wat wil Ruben precies weten over de runners?");
    await expect(options(page).last()).toHaveAccessibleName(/^Vraag Claude: Wat wil Ruben precies weten over de runners\? over Budget CI-runners Q4$/);
    await expect(activeOption(page)).toHaveAccessibleName(/^Vraag Claude:/);
    await page.keyboard.press("Enter");
    await expect(page.locator("#chat")).toBeVisible();
    await expect.poll(async () => (await mockLog(page)).sample.length).toBeGreaterThan(0);
    const input = JSON.stringify((await mockLog(page)).sample.at(-1).input);
    expect(input).toContain("Vraag van Thomas over deze mail: Wat wil Ruben precies weten over de runners?");
    expect(input).toContain("messageId: mail-003");
    // Eigen getypte vraag: taakmodus met schrijfbudget 5, net als in het paneel.
    expect(await page.evaluate(() => window.chat.budget)).toBe(5);
    await expect(page.getByText("Wat wil Ruben precies weten over de runners? · Over: Budget CI-runners Q4")).toBeVisible();
  });

  test("de laatste suggestie is altijd Vraag Claude, ook als er treffers zijn", async ({ page, open }) => {
    await open(buildMock());
    await ready(page);
    await openBar(page, "werk");
    await expect(options(page).last()).toHaveAccessibleName(/^Vraag Claude: werk/);
    await expect(activeOption(page)).toHaveAccessibleName(/Ga naar Werk/);
    await bar(page).fill("qqzzx");
    await expect(options(page)).toHaveCount(1);
    await expect(activeOption(page)).toHaveAccessibleName(/^Vraag Claude: qqzzx/);
  });
});

// =========================================================================================
test.describe("Sneltoetsen volgens het plan", () => {
  test("Enter voert de primaire actie uit als het detail open is; Shift+R ververst alles; g w blijft werken", async ({ page, open }) => {
    await open(buildMock());
    await ready(page);
    await goTo(page, "Werk");
    await openItem(page, "Build-cache delen tussen runners");
    await page.keyboard.press("j");
    await expect(detail(page).getByRole("heading", { level: 2 })).toHaveText(/OBJS-7/);
    await page.keyboard.press("Enter");
    await expect(detail(page).getByRole("textbox", { name: "Commentaar" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(detail(page).getByRole("textbox", { name: "Commentaar" })).toHaveCount(0);
    const before = (await mcpCalls(page, "searchJiraIssuesUsingJql")).length;
    await page.locator("body").press("Shift+R");
    await expect.poll(async () => (await mcpCalls(page, "searchJiraIssuesUsingJql")).length).toBeGreaterThan(before);
    await page.locator("body").press("1");
    await page.keyboard.press("g");
    await page.keyboard.press("w");
    await expect(entryButton(page, "Werk")).toHaveAttribute("aria-current", "page");
  });
});

// =========================================================================================
test.describe("Mobiel 375px", () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test("gelabelde 'Zoek of vraag…' in de kop opent de bar; Enter op een rij opent het detail", async ({ page, open }) => {
    await open(buildMock());
    await ready(page);
    const btn = page.getByRole("button", { name: /Zoek of vraag/ });
    await expect(btn).toBeVisible();
    await expect(btn).toContainText("Zoek of vraag…");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    await btn.click();
    await expect(bar(page)).toBeFocused();
    await bar(page).fill("retentie");
    await page.keyboard.press("Enter");
    await expect(detail(page).getByRole("heading", { level: 2 })).toHaveText(/OBJS-7/);
    await expect(detail(page)).toBeVisible();
    await detail(page).getByRole("button", { name: "Terug" }).click();
    await expect(page.locator("#lijst")).toBeVisible();
    await itemWith(page, "Build-cache delen tussen runners").getByRole("button", { name: "Build-cache delen tussen runners" }).focus();
    await page.keyboard.press("Enter");
    await expect(detail(page).getByRole("heading", { level: 2 })).toHaveText(/CIACC-42/);
    await expect(actionBar(page).getByRole("button", { name: "Reageer" })).toBeVisible();
  });
});
