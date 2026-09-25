// Actiepagina — gedragstests tegen src/index.html met een mock van window.claude.
// Selecteert op rollen en zichtbare tekst (getByRole/getByText), niet op classnames.
// Microcopy-regexen bovenaan volgen docs/UX.md (sectie 5 en 6).
const { test: base, expect } = require("@playwright/test");
const { buildMock, emptyMock } = require("./fixtures");
const { openPage, mockLog, mcpCalls, dbDump, heading, section, itemWith, revealTab, JUNK_TEXT,
  goTo, actionBar, openItem, openClaude, detail } = require("./helpers");

// ---- Microcopy-aannames (UI is Nederlands, zie BRIEF.md) ----------------------------------
const H = {
  agenda: /agenda|vandaag/i,
  inbox: /inbox|mail/i,
  jira: /werk|jira/i,        // UX.md: sectie "Werk" met tabs Jira / Confluence
  confluence: /werk|confluence/i,
  acties: /acties/i,
  claude: /claude/i,
};
const CLAUDE_INPUT = /claude|vraag/i;
const ACTIE_INPUT = /actie/i;
const PROGRAMMAS = ["UI/UX", "Platform Core", "CI Acceleration", "OIDC", "Object Store", "Jakarta migratie",
  "Platform Stability", "Contracten", "Overig"];
const PAF_URL = "https://claude.ai/artifact/Ar6sRYzLNFu5dzdLw1Y4gw";
const CONFIRM_BTN = /^uitvoeren$/i;
const DRAFT_CONFIRM_BTN = /uitvoeren|maak concept|concept (maken|aanmaken|opslaan)|opslaan als concept/i;
const CANCEL_BTN = /annuleer|annuleren|afwijzen|niet uitvoeren/i;
const NOISE_TOGGLE = /meldingen|notificaties|ruis|no-?reply|overig/i;
const REFRESH_BTN = /ververs|vernieuw/i;
// UX.md 6: "/" of Ctrl/Cmd+K opent de invoer voor vragen aan Claude (B7: de command bar, waarin elke niet-commando-tekst
// als vraag naar Claude gaat; niet actief in invoervelden, behalve Ctrl+K).
const CLAUDE_SHORTCUTS = ["/", "Control+k"];
// Tools die de pagina NOOIT mag aanroepen (versturen i.p.v. concept).
const SEND_TOOLS = /send_mail|send_draft|forward_mail|outlook_send/;

// Fixture `open` laadt de pagina en controleert na elke test de invarianten:
// geen contractschendingen (calls buiten manifest, ongeldige sample-calls),
// nooit een verstuur-tool, geen uncaught exceptions.
const test = base.extend({
  open: async ({ page }, use) => {
    let problems = null;
    await use(async (mock, opts) => (problems = await openPage(page, mock, opts)));
    if (!problems || page.isClosed()) return;
    const log = await page.evaluate(() => window.__MOCK_LOG__).catch(() => null);
    if (log) {
      expect(log.violations, "contractschendingen t.o.v. docs/contract/*.d.ts").toEqual([]);
      expect(log.mcp.filter((c) => SEND_TOOLS.test(c.tool)), "verstuur-tool aangeroepen").toEqual([]);
    }
    expect(problems.pageErrors, "uncaught exceptions in de pagina").toEqual([]);
  },
});

// ---- kleine helpers ----------------------------------------------------------------------
async function expectNoJunk(page) {
  const text = await page.locator("body").innerText();
  for (const re of JUNK_TEXT) expect(text, `pagina toont ${re}`).not.toMatch(re);
}

/** Tekst staat in de zichtbare tekst OF in de waarde van een invoerveld. */
function pageContains(page, s) {
  return page.evaluate((needle) => {
    if (document.body.innerText.includes(needle)) return true;
    return [...document.querySelectorAll("textarea, input, [contenteditable]")]
      .some((el) => (el.value ?? el.innerText ?? "").includes(needle));
  }, s);
}

/** Alle signalen (tekst, aria-label/current, title) van de items rond `subject`. */
function markers(page, subject, { innermostOnly = false } = {}) {
  return page.evaluate(({ subject, innermostOnly }) => {
    const sel = "li, article, [role=listitem], [aria-current]";
    let els = [...document.querySelectorAll(sel)].filter((e) => e.innerText && e.innerText.includes(subject));
    if (innermostOnly) els = els.filter((e) => !els.some((o) => o !== e && e.contains(o)));
    return els.map((el) => {
      const attrs = [el, ...el.querySelectorAll("[aria-label],[title],[aria-current]")]
        .map((x) => [x.getAttribute("aria-label"), x.getAttribute("title"), x.getAttribute("aria-current") ? "aria-current" : ""].join(" "));
      return el.innerText + " " + attrs.join(" ");
    });
  }, { subject, innermostOnly });
}

function claudeInput(page) {
  return page.getByRole("textbox", { name: CLAUDE_INPUT }).first();
}

async function askClaude(page, question) {
  const before = (await mockLog(page)).sample.length;
  const box = page.getByRole("textbox", { name: "Bericht aan Claude" });
  if (!(await box.isVisible())) await openClaude(page); // B1: geen Claude-balk meer, het paneel in de detailkolom
  await box.fill(question);
  await box.press("Enter");
  try {
    await expect.poll(async () => (await mockLog(page)).sample.length, { timeout: 1000 }).toBeGreaterThan(before);
  } catch {
    // Enter geeft in een textarea mogelijk een nieuwe regel: dan de verstuurknop.
    await page.getByRole("button", { name: /^(vraag|verstuur|stuur|vraag claude)$/i }).first().click();
    await expect.poll(async () => (await mockLog(page)).sample.length).toBeGreaterThan(before);
  }
}

async function bodyBg(page) {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
}

// =========================================================================================
test.describe("Zonder capabilities", () => {
  test("rendert met nette lege staten als elke use() null geeft", async ({ page, open }) => {
    await open(emptyMock());
    await expect(page.getByText(/koppel microsoft 365/i).first()).toBeVisible();
    // B1: één ingang tegelijk; elke ingang toont zijn kop.
    for (const [entry, h] of [["Agenda", H.agenda], ["Inbox", H.inbox], ["Werk", H.jira], ["Acties", H.acties]]) {
      await goTo(page, entry);
      await expect(heading(page, h).first()).toBeVisible();
    }
    // Zonder mcp geen calls, en geen kapotte weergave.
    expect((await mockLog(page)).mcp).toEqual([]);
    await expectNoJunk(page);
    // PAF-link heeft geen capability nodig.
    await expect(page.getByRole("link", { name: /PAF/i }).first()).toHaveAttribute("href", PAF_URL);
    // sample = null: Claude-invoer verborgen of uitgeschakeld.
    const box = page.getByRole("textbox", { name: CLAUDE_INPUT });
    if (await box.count()) {
      const usable = await box.first().isVisible() && await box.first().isEditable();
      expect(usable, "Claude-invoer bruikbaar terwijl sample null is").toBe(false);
    }
  });

  test("rendert als window.claude ontbreekt (losse kopie van de pagina)", async ({ page, open }) => {
    await open(emptyMock({ noClaude: true }));
    for (const [entry, h] of [["Agenda", H.agenda], ["Inbox", H.inbox], ["Werk", H.jira], ["Acties", H.acties]]) {
      await goTo(page, entry);
      await expect(heading(page, h).first()).toBeVisible();
    }
    await expectNoJunk(page);
  });

  test("eerste render < 1s met laadstaat terwijl capabilities nog niet binnen zijn", async ({ page, open }) => {
    const t0 = Date.now();
    await open(buildMock({ useDelayMs: 2500 }), { waitFor: "domcontentloaded" });
    await expect(heading(page, H.agenda).first()).toBeVisible({ timeout: Math.max(100, 1000 - (Date.now() - t0)) });
    const loading = page.locator("[aria-busy=true]").or(page.getByText(/laden|bezig/i));
    expect(await loading.count(), "geen skeleton/laadstaat zichtbaar").toBeGreaterThan(0);
    await expect(page.getByText("Architectuuroverleg Object Store").first()).toBeVisible({ timeout: 8000 });
  });
});

// =========================================================================================
test.describe("Agenda", () => {
  test("toont de afspraken van vandaag met wandkloktijden (niet als UTC)", async ({ page, open }) => {
    await open(buildMock());
    await goTo(page, "Agenda"); // B1: de hele dag staat onder Agenda; Vandaag toont alleen nu en straks
    for (const s of ["Stand-up Platform Core", "Architectuuroverleg Object Store", "Sync CI Acceleration",
      "OIDC review met security", "Voortgang Jakarta migratie"]) {
      await expect(page.getByText(s).first()).toBeVisible();
    }
    // 10:00 W. Europe = 10:00 lokaal. Als UTC geparsed zou hier 12:00 staan.
    await expect(itemWith(page, "Architectuuroverleg Object Store")).toContainText("10:00");
    await expect(itemWith(page, "Architectuuroverleg Object Store")).not.toContainText("12:00");
    const [call] = await mcpCalls(page, "outlook_calendar_search");
    expect(call, "outlook_calendar_search niet aangeroepen").toBeTruthy();
    expect(call.server).toBe("Microsoft 365");
    expect(call.input).toHaveProperty("afterDateTime");
    expect(call.input).toHaveProperty("beforeDateTime");
    await expectNoJunk(page);
  });

  test("markeert de lopende afspraak als nu en de eerstvolgende als volgende", async ({ page, open }) => {
    await open(buildMock()); // klok staat op 10:15
    await goTo(page, "Agenda");
    await expect(page.getByText("Architectuuroverleg Object Store").first()).toBeVisible();
    const nu = await markers(page, "Architectuuroverleg Object Store");
    expect(nu.some((t) => /\bnu\b|aria-current/i.test(t)), `geen "nu"-markering: ${nu}`).toBe(true);
    const volgende = await markers(page, "Sync CI Acceleration");
    expect(volgende.some((t) => /volgende/i.test(t)), `geen "volgende"-markering: ${volgende}`).toBe(true);
    const verleden = await markers(page, "Stand-up Platform Core", { innermostOnly: true });
    expect(verleden.some((t) => /\bnu\b|aria-current|volgende/i.test(t)), "afgelopen afspraak gemarkeerd").toBe(false);
  });

  test("afspraak linkt naar Outlook en 'Bereid voor' vraagt Claude om voorbereiding", async ({ page, open }) => {
    await open(buildMock({
      sample: { rules: [{ match: "Architectuuroverleg", text: "Voorbereiding: Mark Bakker wil een besluit over de storage-backend." }] },
    }));
    // B1: rij selecteren opent het detail; Open en Bereid voor staan in de actiebalk.
    await openItem(page, "Architectuuroverleg Object Store");
    await expect(actionBar(page).getByRole("link", { name: /open in outlook/i })).toHaveAttribute("href", /itemid=evt-003/);
    await actionBar(page).getByRole("button", { name: /bereid voor/i }).click();
    await expect(page.getByText(/Mark Bakker wil een besluit over de storage-backend/).first()).toBeVisible({ timeout: 8000 });
  });
});

// =========================================================================================
test.describe("Inbox", () => {
  test("toont alle mails uit de losse contentblokken, ongelezen eerst", async ({ page, open }) => {
    await open(buildMock());
    await goTo(page, "Inbox");
    // payload bevat alleen het eerste blok (mail-001); de rest bewijst dat alle blokken geparsed zijn.
    for (const s of ["Planning release 26.4", "Budget CI-runners Q4", "Vraag over OIDC-scope voor partnerportaal"]) {
      await expect(page.getByText(s).first()).toBeVisible();
    }
    const unreadFirst = await page.evaluate(() => {
      const find = (s) => {
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) if (n.textContent.includes(s)) return n;
        return null;
      };
      const unread = find("Budget CI-runners Q4"), read = find("Planning release 26.4");
      return !!(unread && read && (unread.compareDocumentPosition(read) & Node.DOCUMENT_POSITION_FOLLOWING));
    });
    expect(unreadFirst, "ongelezen mail staat niet boven gelezen mail").toBe(true);
    await expectNoJunk(page); // o.a. geen paginatieblok als item
  });

  test("no-reply/notificaties zijn ingeklapt en uit te klappen", async ({ page, open }) => {
    await open(buildMock());
    await goTo(page, "Inbox");
    await expect(page.getByText("Budget CI-runners Q4").first()).toBeVisible();
    await expect(page.getByText("Je wekelijkse samenvatting")).toBeHidden();
    await expect(page.getByText("[Jira] PCORE-101 is toegewezen aan jou")).toBeHidden();
    await page.getByRole("button", { name: NOISE_TOGGLE }).first().click();
    await expect(page.getByText("Je wekelijkse samenvatting").first()).toBeVisible();
    await expect(page.getByText("[Jira] PCORE-101 is toegewezen aan jou").first()).toBeVisible();
  });

  test("toont Teams-berichten van vandaag en gisteren", async ({ page, open }) => {
    await open(buildMock());
    await revealTab(page, /teams/i);
    await expect(page.getByText("Heb je de benchmark van de nieuwe storage-backend al gezien?").first()).toBeVisible();
    await expect(page.getByText("Nightly build was gisteren weer groen na de cachefix.").first()).toBeVisible();
    await expect(page.getByRole("tabpanel", { name: /teams/i }).getByText("Mark Bakker").first()).toBeVisible();
    await expectNoJunk(page);
  });

  test("Antwoord-concept maakt pas na bevestiging een concept in Outlook, nooit versturen", async ({ page, open }) => {
    await open(buildMock({
      sample: { rules: [{ match: "runner", text: "Dag Ruben, akkoord met de verdubbeling van de runners. Groet, Thomas" }] },
    }));
    await goTo(page, "Inbox");
    await openItem(page, "Budget CI-runners Q4");
    await actionBar(page).getByRole("button", { name: /antwoord/i }).click();
    await expect.poll(() => pageContains(page, "akkoord met de verdubbeling"), { timeout: 8000 }).toBe(true);
    expect(await mcpCalls(page, "outlook_create_reply_draft"), "concept al gemaakt zonder bevestiging").toEqual([]);

    // Thomas past de tekst aan (als die in een bewerkbaar veld staat).
    const edited = await page.evaluate(() => {
      const el = [...document.querySelectorAll("textarea, [contenteditable=true]")]
        .find((e) => (e.value ?? e.innerText).includes("akkoord met de verdubbeling"));
      if (!el) return false;
      el.setAttribute("data-test-draft", "1");
      return true;
    });
    if (edited) await page.locator("[data-test-draft]").fill("Dag Ruben, akkoord. AANGEPAST door Thomas.");

    await page.getByRole("button", { name: DRAFT_CONFIRM_BTN }).last().click();
    await expect.poll(async () => (await mcpCalls(page, "outlook_create_reply_draft")).length).toBe(1);
    const [draft] = await mcpCalls(page, "outlook_create_reply_draft");
    expect(draft.server).toBe("Microsoft 365");
    expect(draft.input.messageId).toBe("mail-003");
    const body = String(draft.input.body ?? draft.input.comment ?? "");
    expect(body).toContain(edited ? "AANGEPAST door Thomas" : "akkoord met de verdubbeling");
    expect(await mcpCalls(page, /send/), "verstuur-tool aangeroepen").toEqual([]);
  });
});

// =========================================================================================
test.describe("Jira en Confluence", () => {
  test("Jira-issues met link die in een nieuw tabblad opent", async ({ page, open }) => {
    await open(buildMock());
    await goTo(page, "Werk");
    await openItem(page, "Pipeline faalt op integratietests na upgrade");
    const link = actionBar(page).getByRole("link", { name: /open in jira/i });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "https://jira.example.com/browse/PCORE-101");
    await expect(link).toHaveAttribute("target", "_blank");
    expect.soft(await link.getAttribute("rel") || "", "rel mist noopener").toMatch(/noopener/);
    await expect(page.getByText("Build-cache delen tussen runners").first()).toBeVisible();
    const [call] = await mcpCalls(page, "searchJiraIssuesUsingJql");
    expect(call.server).toBe("Atlassian Rovo");
    expect(typeof call.input.cloudId === "string" && call.input.cloudId.length > 0).toBe(true);
    expect(call.input.jql).toMatch(/currentUser\(\)/);
  });

  test("Confluence-pagina's met link die in een nieuw tabblad opent", async ({ page, open }) => {
    await open(buildMock());
    await revealTab(page, /confluence/i);
    await openItem(page, "Migratieplan Jakarta EE 10");
    const link = actionBar(page).getByRole("link", { name: /open in confluence/i });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "https://wiki.example.com/spaces/DEV/pages/900101");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(page.getByText("OIDC ontwerpkeuzes").first()).toBeVisible();
    const [call] = await mcpCalls(page, "searchConfluenceUsingCql");
    expect(call.server).toBe("Atlassian Rovo");
    expect(call.input.cql).toBeTruthy();
  });

  test("lege Jira-resultaten tonen een fallback-tekst", async ({ page, open }) => {
    await open(buildMock({ tools: { "Atlassian Rovo": {
      searchJiraIssuesUsingJql: { payload: { issues: { nodes: [], pageInfo: { hasNextPage: false } } } } } } }));
    await goTo(page, "Werk");
    const jira = await section(page, H.jira);
    await expect(jira).toContainText(/geen/i);
    await expectNoJunk(page);
  });
});

// =========================================================================================
test.describe("Fouten per sectie", () => {
  test("needs_reauth op Jira: Jira toont herstelactie, rest werkt, geen herhaling", async ({ page, open }) => {
    await open(buildMock({ tools: { "Atlassian Rovo": { searchJiraIssuesUsingJql: {
      error: { code: "needs_reauth", server: "Atlassian Rovo", message: "token expired" } } } } }));
    await goTo(page, "Werk");
    const jira = await section(page, H.jira);
    await expect(jira).toContainText(/opnieuw|verbind|koppel/i);
    await expect(jira).toContainText(/Atlassian/);
    await goTo(page, "Vandaag");
    await expect(page.getByText("Architectuuroverleg Object Store").first()).toBeVisible();
    await goTo(page, "Inbox");
    await expect(page.getByText("Budget CI-runners Q4").first()).toBeVisible();
    await revealTab(page, /confluence/i);
    await expect(page.getByText("Migratieplan Jakarta EE 10").first()).toBeVisible();
    await page.waitForTimeout(1500);
    expect((await mcpCalls(page, "searchJiraIssuesUsingJql")).length, "needs_reauth mag niet automatisch herhaald worden").toBe(1);
    await expectNoJunk(page);
  });

  test("retryable fout wordt hoogstens één keer herhaald en herstelt", async ({ page, open }) => {
    await open(buildMock({ tools: { "Atlassian Rovo": { searchConfluenceUsingCql: { sequence: [
      { error: { code: "server_unavailable", server: "Atlassian Rovo", message: "503", retryable: true, retryAfterMs: 300 } },
      { payload: require("./fixtures/confluence.json") },
    ] } } } }));
    await goTo(page, "Werk");
    await expect(heading(page, H.confluence).first()).toBeVisible();
    await revealTab(page, /confluence/i);
    const title = page.getByText("Migratieplan Jakarta EE 10").first();
    try {
      await expect(title).toBeVisible({ timeout: 4000 });
    } catch {
      // Geen automatische retry: dan moet er een handmatige optie zijn.
      const conf = await section(page, H.confluence);
      await conf.getByRole("button", { name: /opnieuw|probeer|ververs|vernieuw/i }).first().click();
      await expect(title).toBeVisible();
    }
    await page.waitForTimeout(1000);
    expect((await mcpCalls(page, "searchConfluenceUsingCql")).length).toBeLessThanOrEqual(2);
  });

  test("tool_error op de agenda toont een melding, andere secties werken", async ({ page, open }) => {
    await open(buildMock({ tools: { "Microsoft 365": { outlook_calendar_search: {
      error: { code: "tool_error", server: "Microsoft 365", message: "Mailbox tijdelijk niet beschikbaar" } } } } }));
    const agenda = await section(page, H.agenda);
    await expect(agenda).toContainText(/niet|mislukt|fout|kon|beschikbaar/i);
    await goTo(page, "Werk");
    await expect(page.getByText("Pipeline faalt op integratietests na upgrade").first()).toBeVisible();
    await goTo(page, "Inbox");
    await expect(page.getByText("Budget CI-runners Q4").first()).toBeVisible();
    await expectNoJunk(page);
  });

  test("Microsoft 365 niet gekoppeld: koppel-instructie, Atlassian werkt", async ({ page, open }) => {
    await open(buildMock({ connected: ["Atlassian Rovo"] }));
    await expect(page.getByText(/Microsoft 365 is niet gekoppeld|koppel.*Microsoft 365/i).first()).toBeVisible();
    await goTo(page, "Werk");
    await expect(page.getByText("Pipeline faalt op integratietests na upgrade").first()).toBeVisible();
    await expectNoJunk(page);
  });
});

// =========================================================================================
test.describe("Acties", () => {
  test("prominente link naar de PAF actielijst", async ({ page, open }) => {
    await open(buildMock());
    await goTo(page, "Acties");
    const link = page.getByRole("link", { name: /PAF/i }).first();
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", PAF_URL);
  });

  test("bestaande acties uit db zijn zichtbaar", async ({ page, open }) => {
    await open(buildMock());
    await goTo(page, "Acties");
    await expect(page.getByText("Akkoord geven op releaseplanning 26.4").first()).toBeVisible();
  });

  test("actie toevoegen met Enter schrijft naar db-collectie acties", async ({ page, open }) => {
    await open(buildMock());
    await goTo(page, "Acties");
    await page.getByRole("button", { name: "Nieuwe actie" }).click(); // B5: Nieuwe actie opent een formulier bovenaan het detail
    const input = page.getByRole("textbox", { name: ACTIE_INPUT }).first();
    await input.fill("Offerte runners opvragen bij leverancier");
    await input.press("Enter");
    await expect.poll(async () => (await mockLog(page)).db
      .filter((w) => w.op === "set" && /^acties\/[^/]+$/.test(w.path) && JSON.stringify(w.data).includes("Offerte runners opvragen")).length)
      .toBe(1);
    const docs = Object.values(await dbDump(page, "acties/"));
    const doc = docs.find((d) => JSON.stringify(d).includes("Offerte runners opvragen"));
    // PAF-compatibel model (BRIEF.md, Besluit klant 24 sep).
    expect(doc.text).toBe("Offerte runners opvragen bij leverancier");
    expect(doc.status).toBe("open");
    expect(typeof doc.createdAt === "string" || typeof doc.createdAt === "number", "createdAt ontbreekt").toBe(true);
    if ("prog" in doc && doc.prog) expect(PROGRAMMAS).toContain(doc.prog);
    await expect(page.getByText("Offerte runners opvragen bij leverancier").first()).toBeVisible();
    // B5: het formulier sluit en de nieuwe actie is geselecteerd (detail rechts).
    await expect(page.getByRole("textbox", { name: "Nieuwe actie" })).toHaveCount(0);
    await expect(detail(page).getByRole("heading", { level: 2 })).toHaveText("Offerte runners opvragen bij leverancier");
  });

  test("actie afvinken zet status op done", async ({ page, open }) => {
    await open(buildMock());
    await goTo(page, "Acties");
    const item = itemWith(page, "Akkoord geven op releaseplanning 26.4");
    await item.getByRole("checkbox").first().click();
    await expect.poll(async () => (await dbDump(page, "acties/seed-001"))["acties/seed-001"]?.status).toBe("done");
    const doc = (await dbDump(page, "acties/seed-001"))["acties/seed-001"];
    expect(doc.text, "bestaande velden gewist bij afvinken").toBe("Akkoord geven op releaseplanning 26.4");
  });
});

// =========================================================================================
test.describe("Claude-paneel", () => {
  test("vraag aan Claude streamt het antwoord in beeld", async ({ page, open }) => {
    await open(buildMock({ sample: { rules: [{ match: "release", holdLast: true, chunkDelayMs: 30,
      chunks: ["Eerste deel van het antwoord. ", "Tweede deel over de release. ", "Slotzin van Claude."] }] } }));
    await askClaude(page, "Wat speelt er rond de release?");
    await expect(page.getByText(/Tweede deel over de release/).first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/Slotzin van Claude/)).toHaveCount(0); // nog niet klaar: dus gestreamd
    await page.evaluate(() => window.__mockReleaseSample());
    await expect(page.getByText(/Slotzin van Claude/).first()).toBeVisible();
    const call = (await mockLog(page)).sample.at(-1);
    expect(JSON.stringify(call.input)).toContain("Wat speelt er rond de release?");
    expect(call.toolNames.length, "Claude krijgt geen page-tools om context op te halen").toBeGreaterThan(0);
  });

  // B1: de snelknoppen en de Claude-balk bovenaan vervielen (plan 3a/3c). Vervangend pad: de knop Vraag Claude
  // bovenaan opent het paneel in de detailkolom; een getypte vraag krijgt antwoord.
  test("snelknoppen zijn vervangen door Vraag Claude: paneel opent en een getypte vraag krijgt antwoord", async ({ page, open }) => {
    await open(buildMock());
    for (const name of [/wat moet ik vandaag/i, /vat mijn inbox samen/i, /wat (speelt er|is er gebeurd) in teams/i]) {
      await expect(page.getByRole("button", { name })).toHaveCount(0);
    }
    const box = await openClaude(page);
    await box.fill("Wat moet ik vandaag?");
    await box.press("Enter");
    await expect(page.getByText(/je hebt vandaag vijf afspraken/).first()).toBeVisible({ timeout: 8000 });
  });

  // Ronde 7 (klantbesluit): het Claude-paneel werkt als een Cowork-taak. Vraagt Thomas zelf om een schrijfactie,
  // dan voert Claude die direct uit via voer_uit (geen bevestigkaart meer in de chat). Snelknoppen mogen niets schrijven.
  const WRITE_RULE = (match) => ({ match, text: "Concept-antwoord staat klaar in Outlook.",
    toolCalls: [{ tool: "^voer_uit$", input: { server: "Microsoft 365", tool: "outlook_create_reply_draft",
      input: { messageId: "mail-003", body: "Dag Ruben, prima voorstel.", bodyType: "text" }, samenvatting: "aan Ruben Smit" } }] });

  test("schrijfactie waar Thomas om vraagt voert Claude direct uit, met ✓-regel en zonder bevestigkaart", async ({ page, open }) => {
    await open(buildMock({ sample: { rules: [WRITE_RULE("antwoord-concept")] } }));
    await askClaude(page, "Maak een antwoord-concept voor de mail over het runnerbudget");
    await expect.poll(async () => (await mcpCalls(page, "outlook_create_reply_draft")).length, { timeout: 8000 }).toBe(1);
    const [draft] = await mcpCalls(page, "outlook_create_reply_draft");
    expect(draft.input.messageId).toBe("mail-003");
    await expect(page.getByText(/Concept-antwoord gemaakt aan Ruben Smit/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: CONFIRM_BTN })).toHaveCount(0);
    expect(await mcpCalls(page, /send/)).toEqual([]);
  });

  // B1: snelknoppen vervielen; Bereid voor is nu het pad waarop Claude zonder eigen getypte vraag werkt.
  test("Bereid voor mag niets schrijven: schrijfactie wordt geweigerd", async ({ page, open }) => {
    await open(buildMock({ sample: { rules: [WRITE_RULE("Bereid mijn afspraak voor")] } }));
    await openItem(page, "Architectuuroverleg Object Store");
    await actionBar(page).getByRole("button", { name: /bereid voor/i }).click();
    await expect(page.getByText(/Niet uitgevoerd/).first()).toBeVisible({ timeout: 8000 });
    await page.waitForTimeout(300);
    expect(await mcpCalls(page, /create_reply_draft|send|addComment/)).toEqual([]);
    await expect(page.getByRole("button", { name: CONFIRM_BTN })).toHaveCount(0);
  });
});

// =========================================================================================
test.describe("Layout, thema en toegankelijkheid", () => {
  test("geen horizontale scroll op 375px", async ({ page, open }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await open(buildMock());
    await expect(page.getByText("Architectuuroverleg Object Store").first()).toBeVisible();
    const m = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, vw: window.innerWidth,
    }));
    expect(m.doc, `documentbreedte ${m.doc} > ${m.vw}`).toBeLessThanOrEqual(m.vw);
    expect(m.body).toBeLessThanOrEqual(m.vw);
  });

  test("donker thema geeft een andere achtergrond, ook via data-theme", async ({ page, open }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await open(buildMock());
    // Ronde 4: standaardthema is Dark Forest (data-theme="forest", zwarte achtergrond), ongeacht het systeem.
    await expect(page.locator("html")).toHaveAttribute("data-theme", "forest");
    expect(await bodyBg(page), "Dark Forest is niet de standaard").toBe("rgb(0, 0, 0)");
    // Thema "Systeem" = geen data-theme: dan volgt de pagina prefers-color-scheme.
    await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));
    const light = await bodyBg(page);
    await page.emulateMedia({ colorScheme: "dark" });
    const dark = await bodyBg(page);
    expect(dark, "prefers-color-scheme: dark verandert de achtergrond niet").not.toBe(light);
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
    expect(await bodyBg(page), "data-theme=light overschrijft dark scheme niet").toBe(light);
    await page.emulateMedia({ colorScheme: "light" });
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    expect(await bodyBg(page), "data-theme=dark werkt niet in light scheme").toBe(dark);
  });

  test("sneltoetsen / en Ctrl+K focussen de invoer (command bar) die een vraag naar Claude stuurt, / niet tijdens typen", async ({ page, open }) => {
    await open(buildMock());
    await expect(page.getByText("Architectuuroverleg Object Store").first()).toBeVisible();
    const box = page.getByRole("combobox", { name: /vraag Claude/i });
    for (const key of CLAUDE_SHORTCUTS) {
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      await page.keyboard.press(key);
      await expect(box, `${key} opent de invoer niet`).toBeVisible();
      expect(await box.evaluate((el) => el === document.activeElement), `${key} focust de invoer niet`).toBe(true);
      await page.keyboard.press("Escape");
      await expect(box).toBeHidden();
    }
    // Een vraag via de invoer komt bij Claude aan.
    await page.keyboard.press("Control+k");
    await box.fill("Wat speelt er vandaag?");
    await box.press("Enter");
    await expect(claudeInput(page)).toBeVisible();
    await expect.poll(async () => (await mockLog(page)).sample.length).toBeGreaterThan(0);
    await goTo(page, "Acties");
    await page.getByRole("button", { name: "Nieuwe actie" }).click(); // B5: Nieuwe actie opent een formulier bovenaan het detail
    const actie = page.getByRole("textbox", { name: ACTIE_INPUT }).first();
    await actie.fill("");
    await actie.focus();
    await page.keyboard.type("a/b");
    await expect(actie).toHaveValue("a/b");
  });

  test("zichtbare focus bij toetsenbordnavigatie", async ({ page, open }) => {
    await open(buildMock());
    await page.keyboard.press("Tab");
    const style = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      return { outline: s.outlineStyle, width: s.outlineWidth, shadow: s.boxShadow };
    });
    expect(style, "Tab brengt de focus nergens heen").not.toBeNull();
    expect(style.outline !== "none" && style.width !== "0px" || style.shadow !== "none", `geen focusstijl: ${JSON.stringify(style)}`).toBe(true);
  });

  test("toont versheid en een ververs-knop die opnieuw ophaalt", async ({ page, open }) => {
    await open(buildMock());
    await expect(page.getByText("Architectuuroverleg Object Store").first()).toBeVisible();
    await expect(page.getByText(/bijgewerkt\s+\d{1,2}[:.]\d{2}/i).first()).toBeVisible();
    const before = (await mockLog(page)).mcp.length;
    await page.getByRole("button", { name: REFRESH_BTN }).first().click();
    await expect.poll(async () => (await mockLog(page)).mcp.length).toBeGreaterThan(before);
  });

  test("geen console-errors bij laden en gebruik", async ({ page, open }) => {
    const problems = await open(buildMock());
    await expect(page.getByText("Architectuuroverleg Object Store").first()).toBeVisible();
    await goTo(page, "Werk");
    await expect(page.getByText("Pipeline faalt op integratietests na upgrade").first()).toBeVisible();
    await revealTab(page, /teams/i);
    await page.waitForTimeout(500);
    expect(problems.consoleErrors, "console-errors").toEqual([]);
    expect(problems.pageErrors, "uncaught exceptions").toEqual([]);
    expect(problems.requestFailures, "mislukte requests").toEqual([]);
  });
});
