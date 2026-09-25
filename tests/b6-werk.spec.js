// B6: Werk. Jira-detail (beschrijving, commentaar nieuwste onderaan), Reageer met "Laat Claude schrijven",
// Status met alleen de transities uit getTransitionsForJiraIssue, Toewijzen, Nieuw Jira-issue vanuit mail en actie,
// en de Confluence-leesweergave zonder rauwe opmaakcodes. Gedrag via rollen en teksten (docs/PLAN-FASE2.md).
const { test: base, expect } = require("@playwright/test");
const { buildMock } = require("./fixtures");
const { openPage, mcpCalls, mockLog, dbDump, itemWith, goTo, detail, actionBar, feedbackBar, openItem, revealTab } = require("./helpers");

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

async function openIssue(page, text) {
  await goTo(page, "Werk");
  await openItem(page, text);
  await expect(detail(page).getByRole("heading", { name: "Beschrijving" })).toBeVisible();
}
const barLabels = (page) => actionBar(page).locator("button, a").evaluateAll((els) => els.map((e) => e.textContent.replace(/\s*↗.*$/, "").trim()));

// =========================================================================================
test.describe("Jira-detail", () => {
  test("toont beschrijving en commentaar (nieuwste onderaan) en de vaste actiebalk", async ({ page, open }) => {
    await open(buildMock());
    await openIssue(page, "Pipeline faalt op integratietests na upgrade");
    const d = detail(page);
    await expect(d.getByRole("heading", { level: 2 })).toHaveText("PCORE-101 Pipeline faalt op integratietests na upgrade");
    // Beschrijving als leesbare tekst: lijst en vet gerenderd, geen markdown-tekens.
    await expect(d.getByText("Lokaal niet te reproduceren")).toBeVisible();
    await expect(d.locator("strong", { hasText: "main" })).toBeVisible();
    await expect(d.getByRole("link", { name: /build-dashboard/ })).toHaveAttribute("href", "https://ci.example.com/dashboard");
    // Commentaar: oudste boven, nieuwste onderaan.
    const comments = d.getByRole("list").filter({ hasText: "Ruben Smit" }).getByRole("listitem");
    await expect(comments).toHaveCount(2);
    await expect(comments.first()).toContainText("Ruben Smit");
    await expect(comments.last()).toContainText("Noor Mulder");
    await expect(d.getByRole("heading", { name: "Commentaar (2)" })).toBeVisible();
    // Actiebalk: max 5 vaste knoppen + 1 extra; Toewijzen zit achter de toets t en de command bar.
    expect(await barLabels(page)).toEqual(["Reageer", "Maak actie", "Vraag Claude", "Open in Jira", "Status"]);
    await expect(actionBar(page).getByRole("button", { name: "Reageer" })).toHaveAttribute("title", /\(r\)$/);
    await expect(actionBar(page).getByRole("button", { name: "Status" })).toHaveAttribute("title", /\(s\)$/);
    const text = await d.innerText();
    expect(text).not.toMatch(/\*\*|^\s*\* /m);
    // getJiraIssue met commentaar en markdown.
    const [call] = await mcpCalls(page, "getJiraIssue");
    expect(call.input).toMatchObject({ issueIdOrKey: "PCORE-101", responseContentFormat: "markdown" });
    expect(call.input.fields).toContain("comment");
  });

  test("Status toont alleen de transities uit getTransitionsForJiraIssue en zet de status", async ({ page, open }) => {
    await open(buildMock());
    await openIssue(page, "Pipeline faalt op integratietests na upgrade");
    await page.keyboard.press("s");
    const group = detail(page).getByRole("group", { name: "Zet status op" });
    await expect(group.getByRole("button")).toHaveCount(2);
    expect(await group.getByRole("button").allTextContents()).toEqual(["Done", "In Progress"]);
    await expect(detail(page).getByRole("button", { name: "To Do", exact: true })).toHaveCount(0);
    const [tcall] = await mcpCalls(page, "getTransitionsForJiraIssue");
    expect(tcall.input).toMatchObject({ issueIdOrKey: "PCORE-101" });
    await group.getByRole("button", { name: "Done" }).click();
    await expect(feedbackBar(page)).toContainText("PCORE-101 staat nu op Done");
    await expect(feedbackBar(page).getByRole("link", { name: /Bekijk/ })).toHaveAttribute("href", "https://jira.example.com/browse/PCORE-101");
    await expect(feedbackBar(page).getByRole("button", { name: /Ongedaan/ })).toHaveCount(0);
    const [call] = await mcpCalls(page, "transitionJiraIssue");
    expect(call.input).toMatchObject({ issueIdOrKey: "PCORE-101", transition: { id: "41" } });
    await expect(itemWith(page, "Pipeline faalt op integratietests")).toContainText("Done");
    await expect(detail(page).getByRole("definition").first()).toHaveText(/^Done/);
    // Een ander issue heeft andere transities: nooit een vaste lijst.
    await openItem(page, "Retentiebeleid voor object versies");
    await actionBar(page).getByRole("button", { name: "Status" }).click();
    await expect(detail(page).getByRole("group", { name: "Zet status op" }).getByRole("button")).toHaveText(["In Progress"]);
    await page.keyboard.press("Escape");
    await expect(detail(page).getByRole("group", { name: "Zet status op" })).toHaveCount(0);
  });

  test("Reageer: Laat Claude schrijven in Thomas' stem zonder afsluiter, plaatsen na klik, commentaar verschijnt onderaan", async ({ page, open }) => {
    await open(buildMock({ sample: { rules: [{ match: "Jira-commentaar", text: "Ziet er goed uit — that said, graag ook de release-branch pinnen.\n\nKR\nThomas" }] } }));
    await openIssue(page, "Pipeline faalt op integratietests na upgrade");
    await page.keyboard.press("r");
    const box = detail(page).getByRole("textbox", { name: "Commentaar" });
    await expect(box).toBeFocused();
    const post = detail(page).getByRole("button", { name: "Plaats commentaar" });
    // Geen grijze knop: leeg plaatsen zegt wat er moet gebeuren en zet de focus terug in het veld.
    await expect(post).toBeEnabled();
    await post.click();
    await expect(detail(page).getByRole("alert")).toContainText("Typ eerst een reactie");
    await expect(box).toBeFocused();
    // Laat Claude schrijven: knop met toets Alt+Enter in de tooltip, en de toets werkt in het veld.
    await expect(detail(page).getByRole("button", { name: "Laat Claude schrijven" })).toHaveAttribute("title", /\(Alt\+Enter\)$/);
    await box.press("Alt+Enter");
    await expect(box).toHaveValue("Ziet er goed uit, that being said, graag ook de release-branch pinnen.");
    const prompt = (await mockLog(page)).sample.at(-1).input;
    expect(String(prompt)).toContain("PCORE-101");
    expect(String(prompt)).toMatch(/geen afsluiter/i);
    expect(await mcpCalls(page, "addCommentToJiraIssue")).toEqual([]); // niets geplaatst zonder klik
    await post.click();
    await expect(feedbackBar(page)).toContainText("Commentaar geplaatst op PCORE-101");
    await expect(feedbackBar(page).getByRole("link", { name: /Bekijk/ })).toBeVisible();
    await expect(feedbackBar(page).getByRole("button", { name: /Ongedaan/ })).toHaveCount(0);
    const [call] = await mcpCalls(page, "addCommentToJiraIssue");
    expect(call.input).toMatchObject({ issueIdOrKey: "PCORE-101", contentFormat: "markdown", commentBody: "Ziet er goed uit, that being said, graag ook de release-branch pinnen." });
    const comments = detail(page).getByRole("list").filter({ hasText: "Ruben Smit" }).getByRole("listitem");
    await expect(comments).toHaveCount(3);
    await expect(comments.last()).toContainText("release-branch pinnen");
    await expect(detail(page).getByRole("textbox", { name: "Commentaar" })).toHaveCount(0);
  });

  test("Status en Toegewezen in het detail zijn klikbaar (wijzig) en openen dezelfde invulkaart", async ({ page, open }) => {
    await open(buildMock());
    await openIssue(page, "Build-cache delen tussen runners");
    const status = detail(page).getByRole("button", { name: "Wijzig status van CIACC-42" });
    await expect(status).toHaveAttribute("title", /\(s\)$/);
    await status.click();
    await expect(detail(page).getByRole("group", { name: "Zet status op" }).getByRole("button")).toHaveText(["Review", "To Do"]);
    await page.keyboard.press("Escape");
    await detail(page).getByRole("button", { name: "Wijzig toewijzing van CIACC-42" }).click();
    await expect(detail(page).getByRole("group", { name: "Toewijzen: CIACC-42" })).toContainText("Nu: Ruben Smit");
  });

  test("Reageer: Esc sluit het invulveld; Ctrl+Enter plaatst", async ({ page, open }) => {
    await open(buildMock());
    await openIssue(page, "Build-cache delen tussen runners");
    await actionBar(page).getByRole("button", { name: "Reageer" }).click();
    const box = detail(page).getByRole("textbox", { name: "Commentaar" });
    await box.fill("j en k zijn hier gewoon letters");
    await expect(box).toHaveValue("j en k zijn hier gewoon letters");
    await box.press("Escape");
    await expect(box).toHaveCount(0);
    await page.keyboard.press("r");
    await detail(page).getByRole("textbox", { name: "Commentaar" }).fill("Top, dank je.");
    await detail(page).getByRole("textbox", { name: "Commentaar" }).press("Control+Enter");
    await expect(feedbackBar(page)).toContainText("Commentaar geplaatst op CIACC-42");
  });

  test("Toewijzen (toets t): Aan mij met het eigen Jira-account, of een gezochte persoon", async ({ page, open }) => {
    await open(buildMock());
    await openIssue(page, "Retentiebeleid voor object versies");
    await expect(actionBar(page).getByRole("button", { name: "Toewijzen" })).toHaveCount(0); // niet in de balk
    await page.keyboard.press("t");
    const panel = detail(page).getByRole("group", { name: "Toewijzen: OBJS-7" });
    await expect(panel).toContainText("Nu: niemand");
    await panel.getByRole("button", { name: "Aan mij" }).click();
    await expect(feedbackBar(page)).toContainText("OBJS-7 toegewezen aan jou");
    let [call] = await mcpCalls(page, "editJiraIssue");
    expect(call.input).toMatchObject({ issueIdOrKey: "OBJS-7", fields: { assignee: { accountId: "acc-thomas" } } });
    await expect(detail(page).getByRole("definition").nth(1)).toHaveText(/^Thomas Testpersoon/);
    // Iemand anders: zoeken op naam.
    await page.keyboard.press("t");
    await detail(page).getByRole("textbox", { name: "Zoek een persoon" }).fill("noor");
    await detail(page).getByRole("button", { name: "Noor Mulder" }).click();
    await expect(feedbackBar(page)).toContainText("OBJS-7 toegewezen aan Noor Mulder");
    call = (await mcpCalls(page, "editJiraIssue"))[1];
    expect(call.input.fields.assignee.accountId).toBe("acc-noor");
    const lookups = await mcpCalls(page, "lookupJiraAccountId");
    expect(lookups.at(-1).input).toMatchObject({ searchString: "noor" });
  });

  test("fout bij ophalen: mensentaal met Opnieuw proberen", async ({ page, open }) => {
    await open(buildMock({ tools: { "Atlassian Rovo": { getJiraIssue: { sequence: [{ error: { code: "upstream_error", message: "boom" } }] } } } }));
    await goTo(page, "Werk");
    await openItem(page, "Pipeline faalt op integratietests na upgrade");
    await expect(detail(page).getByRole("alert")).toContainText("Beschrijving en commentaar konden niet geladen worden.");
    await expect(detail(page).getByRole("button", { name: "Opnieuw proberen" })).toBeVisible();
  });
});

// =========================================================================================
test.describe("Nieuw Jira-issue", () => {
  test("vanuit een mail (toets i): voorgevuld, project en type uit Jira, feedback met sleutel en Bekijk; project onthouden", async ({ page, open }) => {
    await open(buildMock());
    await goTo(page, "Inbox");
    await openItem(page, "Budget CI-runners Q4");
    await page.keyboard.press("i");
    const form = detail(page).getByRole("group", { name: "Nieuw Jira-issue van deze mail" });
    await expect(form).toBeVisible();
    await expect(form.getByRole("textbox", { name: "Samenvatting" })).toHaveValue("Budget CI-runners Q4");
    await expect(form.getByRole("textbox", { name: "Beschrijving" })).toHaveValue(/Uit een mail van Ruben Smit/);
    await expect(form.getByRole("textbox", { name: "Beschrijving" })).toHaveValue(/\[Open de mail in Outlook\]\(https:\/\/outlook\.example\.com/);
    const proj = form.getByRole("combobox", { name: "Project" });
    await expect(proj.locator("option")).toHaveCount(5);
    await proj.selectOption("PCORE");
    const type = form.getByRole("combobox", { name: "Type" });
    await expect(type).toHaveValue("Task");
    expect(await type.locator("option").allTextContents()).toEqual(["Bug", "Task", "Story", "Epic"]); // geen subtaken
    const [pcall] = await mcpCalls(page, "getVisibleJiraProjects");
    expect(pcall.input.maxResults).toBeLessThanOrEqual(50);
    await form.getByRole("button", { name: "Maak issue" }).click();
    await expect(feedbackBar(page)).toContainText("PCORE-901 aangemaakt");
    await expect(feedbackBar(page).getByRole("link", { name: /Bekijk/ })).toHaveAttribute("href", "https://jira.example.com/browse/PCORE-901");
    const [call] = await mcpCalls(page, "createJiraIssue");
    expect(call.input).toMatchObject({ projectKey: "PCORE", issueTypeName: "Task", summary: "Budget CI-runners Q4", contentFormat: "markdown" });
    expect(call.input.description).toContain("Ruben Smit");
    await expect.poll(async () => (await dbDump(page, "prefs/thomas"))["prefs/thomas"]?.jiraProject).toBe("PCORE");
    await expect(form).toHaveCount(0);
    // Vanuit een actie: laatst gebruikte project staat voor.
    await goTo(page, "Acties");
    await openItem(page, "Akkoord geven op releaseplanning 26.4");
    await page.keyboard.press("i");
    const f2 = detail(page).getByRole("group", { name: "Nieuw Jira-issue van deze actie" });
    await expect(f2.getByRole("textbox", { name: "Samenvatting" })).toHaveValue("Akkoord geven op releaseplanning 26.4");
    await expect(f2.getByRole("combobox", { name: "Project" })).toHaveValue("PCORE");
    await f2.getByRole("textbox", { name: "Samenvatting" }).press("Escape");
    await expect(f2).toHaveCount(0);
  });
});

// =========================================================================================
test.describe("Confluence-leesweergave", () => {
  test("pagina leesbaar zonder rauwe opmaakcodes; Lees, Maak actie, Vraag Claude, Open in Confluence", async ({ page, open }) => {
    await open(buildMock());
    await goTo(page, "Werk");
    await revealTab(page, /confluence/i);
    // Datums in de app-stijl: "yesterday at 9:28 AM" wordt "gisteren 09:28", nergens Engelse datumtekst.
    await expect(itemWith(page, "Migratieplan Jakarta EE 10")).toContainText("gisteren 09:28");
    expect(await page.locator("#lijst").innerText()).not.toMatch(/yesterday|\bAM\b|Sep 22/);
    await openItem(page, "Migratieplan Jakarta EE 10");
    await expect(detail(page).getByRole("definition").nth(1)).toHaveText("gisteren 09:28");
    const art = detail(page).getByRole("article", { name: /Leesweergave/ });
    await expect(art).toContainText("Alle modules gaan naar Jakarta EE 10");
    const [call] = await mcpCalls(page, "getConfluencePage");
    expect(call.input).toMatchObject({ pageId: "900101", contentFormat: "markdown" });
    // Tabel als echte tabel, lege kopregel weg, vette kopregel als kolomkoppen.
    const table = art.getByRole("table");
    await expect(table.getByRole("columnheader")).toHaveText(["Module", "Eigenaar", "Status"]);
    await expect(table.getByRole("row")).toHaveCount(4);
    await expect(table.getByRole("cell", { name: "batch | jobs" })).toBeVisible();
    await expect(art.getByRole("link", { name: /PCORE-101/ })).toHaveAttribute("href", "https://jira.example.com/browse/PCORE-101");
    await expect(art.getByRole("heading", { name: "Risico's" })).toBeVisible();
    await expect(art.getByRole("link", { name: /Afbeelding: architectuurschets/ })).toBeVisible();
    const text = await art.innerText();
    expect(text).toContain("> 10 min");
    expect(text).toContain("batch_jobs_v2");
    expect(text).toContain("mvn -pl core-api verify");
    for (const raw of ["**", "\\", "<br", "![", "| ---", "```", "# Doel", "---"]) expect(text, `rauwe opmaak ${raw}`).not.toContain(raw);
    expect(await barLabels(page)).toEqual(["Lees", "Maak actie", "Vraag Claude", "Open in Confluence"]);
    await expect(actionBar(page).getByRole("link", { name: /Open in Confluence/ })).toHaveAttribute("href", "https://wiki.example.com/spaces/DEV/pages/900101");
    await page.keyboard.press("l");
    await expect(art).toBeFocused();
  });

  test("Vraag Claude over een pagina geeft pagina-id en inhoud mee als context", async ({ page, open }) => {
    await open(buildMock());
    await goTo(page, "Werk");
    await revealTab(page, /confluence/i);
    await openItem(page, "OIDC ontwerpkeuzes");
    await expect(detail(page).getByRole("article")).toContainText("Access tokens leven 15 minuten");
    await page.keyboard.press("c");
    await expect(page.getByRole("group", { name: "Context voor je vraag" })).toContainText("OIDC ontwerpkeuzes");
    const box = page.getByRole("textbox", { name: "Bericht aan Claude" });
    await box.fill("Zet de levensduur op 10 minuten");
    await box.press("Enter");
    await expect.poll(async () => (await mockLog(page)).sample.length).toBeGreaterThan(0);
    const input = JSON.stringify((await mockLog(page)).sample.at(-1).input);
    expect(input).toContain("Confluence-pagina");
    expect(input).toContain("pageId: 900202");
    expect(input).toContain("Access tokens leven");
  });
});

// =========================================================================================
test.describe("Mobiel 375px", () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test("Werk: issue openen toont detail met Status, geen horizontale scroll", async ({ page, open }) => {
    await open(buildMock());
    await goTo(page, "Werk");
    await itemWith(page, "Build-cache delen tussen runners").click({ position: { x: 60, y: 14 } });
    await expect(detail(page).getByRole("heading", { name: "Beschrijving" })).toBeVisible();
    await expect(actionBar(page).getByRole("button", { name: "Status" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    await detail(page).getByRole("button", { name: "Terug" }).click();
    await revealTab(page, /confluence/i);
    await itemWith(page, "Migratieplan Jakarta EE 10").click({ position: { x: 60, y: 14 } });
    await expect(detail(page).getByRole("table")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  });

  // Een open invulkaart valt nooit achter de sticky actiebalk: na openen staat zijn onderkant vrij boven de balk.
  async function clearOfBar(page, card, what) {
    await expect(card).toBeVisible();
    await expect.poll(async () => {
      const c = await card.boundingBox(), b = await actionBar(page).boundingBox();
      return Math.round(b.y - (c.y + c.height));
    }, { message: what + " valt achter de actiebalk" }).toBeGreaterThanOrEqual(0);
    expect((await card.boundingBox()).y, what + ": bovenkant uit beeld").toBeGreaterThanOrEqual(0);
  }
  test("Reageer, Status en Nieuw Jira-issue: kaart en knoppen vrij van de sticky actiebalk", async ({ page, open }) => {
    await open(buildMock());
    await goTo(page, "Werk");
    await itemWith(page, "Pipeline faalt op integratietests na upgrade").click({ position: { x: 60, y: 14 } });
    await expect(detail(page).getByRole("heading", { name: "Commentaar (2)" })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); // Thomas las eerst het commentaar
    await actionBar(page).getByRole("button", { name: "Reageer" }).click();
    await clearOfBar(page, detail(page).getByRole("group", { name: "Reageer op PCORE-101" }), "Reageer");
    await expect(detail(page).getByRole("button", { name: "Plaats commentaar" })).toBeInViewport();
    await page.keyboard.press("Escape");
    await page.keyboard.press("s");
    await clearOfBar(page, detail(page).getByRole("group", { name: "Status van PCORE-101" }), "Status");
    await page.keyboard.press("Escape");
    await detail(page).getByRole("button", { name: "Terug" }).click();
    await goTo(page, "Inbox");
    await itemWith(page, "Budget CI-runners Q4").click({ position: { x: 60, y: 14 } });
    await expect(detail(page).getByRole("heading", { level: 2 })).toHaveText("Budget CI-runners Q4");
    await page.keyboard.press("i");
    const form = detail(page).getByRole("group", { name: "Nieuw Jira-issue van deze mail" });
    await clearOfBar(page, form, "Nieuw Jira-issue");
    await expect(form.getByRole("button", { name: "Maak issue" })).toBeEnabled(); // geen grijze knop
  });
});
