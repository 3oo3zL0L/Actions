// Ronde 4: mailstijl van Thomas, voorstellen uit mail en Teams (+ scan), "Vraag Claude" per item, thema Dark Forest.
const { test: base, expect } = require("@playwright/test");
const { buildMock, data } = require("./fixtures");
const { openPage, mockLog, mcpCalls, dbDump, itemWith, goTo, actionBar, openItem, openClaude } = require("./helpers");

/** B1: mail selecteren in Inbox en een knop uit de actiebalk klikken. */
async function mailAction(page, subject, button) {
  await goTo(page, "Inbox");
  await openItem(page, subject);
  await actionBar(page).getByRole("button", { name: button }).click();
}

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

const MAIL3 = "https://outlook.example.com/owa/?ItemID=mail-003";
const MAIL1 = "https://outlook.example.com/owa/?ItemID=mail-001"; // staat al als bronUrl in acties/seed-001
const T0 = data.teams.messages[0];
const TEAMS0 = `https://teams.example.com/l/message/${encodeURIComponent(T0.chatId)}/${T0.id}`;
const inputText = (call) => (typeof call.input === "string" ? call.input : call.input.map((m) => m.content).join("\n\n"));
const textareaValues = (page) => page.evaluate(() => [...document.querySelectorAll("textarea")].map((t) => t.value));

// =========================================================================================
test.describe("Mailstijl van Thomas", () => {
  test("Antwoord-concept: prompt bevat EMAIL_STYLE, uitvoer eindigt op KR/Thomas zonder em-dash", async ({ page, open }) => {
    await open(buildMock({ sample: { rules: [{ match: "runner",
      text: "Hi Ruben,\n\nAkkoord met de verdubbeling — prima voorstel. That said, houd het budget in de gaten.\n\nGroet,\nThomas" }] } }));
    await mailAction(page, "Budget CI-runners Q4", "Antwoord-concept");
    await expect.poll(async () => (await textareaValues(page)).some((v) => /KR\nThomas$/.test(v)), { timeout: 8000 }).toBe(true);
    const value = (await textareaValues(page)).find((v) => /KR\nThomas$/.test(v));
    expect(value).not.toMatch(/—|–/);
    expect(value).toContain("That being said");
    expect(value).not.toMatch(/Groet/);
    expect(value.startsWith("Hi Ruben,")).toBe(true);

    const call = (await mockLog(page)).sample.find((c) => /runner/.test(inputText(c)));
    const prompt = inputText(call);
    expect(prompt).toContain('Afsluiten met exact twee regels: "KR" en "Thomas". Nooit MVG/Groet.');
    expect(prompt).toContain('Begin altijd met "Hi <Voornaam>,"');
    expect(prompt).toMatch(/Taal: die van de ontvangen mail/);
    expect(prompt).not.toContain("Groet, Thomas");

    await page.getByRole("button", { name: "Uitvoeren" }).last().click();
    await expect.poll(async () => (await mcpCalls(page, "outlook_create_reply_draft")).length).toBe(1);
    const [draft] = await mcpCalls(page, "outlook_create_reply_draft");
    expect(draft.input.body).toMatch(/\n\nKR\nThomas$/);
  });

  test("KR/Thomas wordt niet dubbel toegevoegd", async ({ page, open }) => {
    await open(buildMock({ sample: { rules: [{ match: "runner", text: "Hi Ruben,\n\nAkkoord.\n\nKR\nThomas" }] } }));
    await mailAction(page, "Budget CI-runners Q4", "Antwoord-concept");
    await expect.poll(async () => (await textareaValues(page)).includes("Hi Ruben,\n\nAkkoord.\n\nKR\nThomas"), { timeout: 8000 }).toBe(true);
  });

  // Ronde 7: geen bevestigkaart meer; Claude maakt het concept direct via voer_uit en de pagina past EMAIL_STYLE toe.
  test("chat: rules noemen EMAIL_STYLE en een mailconcept via voer_uit krijgt KR/Thomas", async ({ page, open }) => {
    await open(buildMock({ sample: { rules: [{ match: "maak een mailconcept", text: "Klaargezet.",
      toolCalls: [{ tool: "^voer_uit$", input: { server: "Microsoft 365", tool: "outlook_create_reply_draft",
        input: { messageId: "mail-003", bodyType: "text", body: "Hi Ruben,\n\nPrima — doen we.\n\nMet vriendelijke groet,\nThomas" } } }] }] } }));
    const box = await openClaude(page);
    await box.fill("Maak een mailconcept voor Ruben");
    await box.press("Enter");
    await expect.poll(async () => (await mcpCalls(page, "outlook_create_reply_draft")).length, { timeout: 8000 }).toBe(1);
    const call = (await mockLog(page)).sample.at(-1);
    expect(inputText(call)).toContain("Mail: volgt altijd EMAIL_STYLE");
    expect(inputText(call)).toContain("Nooit MVG/Groet.");
    expect((await mcpCalls(page, "outlook_create_reply_draft"))[0].input.body).toBe("Hi Ruben,\n\nPrima, doen we.\n\nKR\nThomas");
  });
});

// =========================================================================================
function withVoorstellen(docs) {
  const acties = JSON.parse(JSON.stringify(data.acties));
  delete acties._comment;
  return { ...acties, ...docs };
}

test.describe("Voorstellen uit mail en Teams", () => {
  test("Teams-voorstel toont 💬 met link en Op de lijst zet bron teams", async ({ page, open }) => {
    await open(buildMock({ db: { docs: withVoorstellen({
      "voorstellen/t1": { text: "Benchmark storage-backend beoordelen", van: "Mark Bakker", onderwerp: "Object Store", prog: "Object Store",
        bron: "teams", link: TEAMS0, createdAt: "2026-09-25T06:00:00.000Z", run: "25 sep 2026", status: "nieuw" },
      "voorstellen/m1": { text: "Akkoord geven op budget", van: "Ruben Smit", onderwerp: "Budget CI-runners Q4", prog: "CI Acceleration",
        bron: "mail", mail: MAIL3, createdAt: "2026-09-25T06:01:00.000Z", run: "25 sep 2026", status: "nieuw" },
    }) } }));
    await goTo(page, "Acties");
    const blok = page.locator("#voorstellen");
    await expect(blok.getByRole("heading", { name: "Voorstellen (2)" })).toBeVisible();
    // B5: bronicoon in de rij, de link zelf in de actiebalk van het detail (geen links of knoppen in rijen).
    const trij = itemWith(page, "Benchmark storage-backend beoordelen");
    await expect(trij).toContainText("💬");
    await expect(itemWith(page, "Akkoord geven op budget")).toContainText("✉");
    await expect(trij.getByRole("link")).toHaveCount(0);
    await openItem(page, "Benchmark storage-backend beoordelen");
    await expect(actionBar(page).getByRole("link", { name: /open bron/i })).toHaveAttribute("href", TEAMS0);

    await actionBar(page).getByRole("button", { name: "Op de lijst" }).click();
    await expect.poll(async () => (await dbDump(page, "voorstellen/t1"))["voorstellen/t1"]?.status).toBe("ja");
    expect((await dbDump(page, "acties/v-t1"))["acties/v-t1"]).toMatchObject({ bron: "teams", bronUrl: TEAMS0, text: "Benchmark storage-backend beoordelen" });
  });

  test("Scan mail en Teams: alleen na klik, schrijft geldige nieuwe voorstellen", async ({ page, open }) => {
    await open(buildMock({ sample: { rules: [{ match: "Actiepagina-scan", json: { voorstellen: [
      { text: "Reageren op budgetvoorstel runners.", van: "Ruben Smit", onderwerp: "Budget CI-runners Q4", prog: "CI Acceleration", bron: "mail", link: MAIL3, why: "Ruben wacht op akkoord" },
      { text: "Releaseplanning goedkeuren", van: "Eva", onderwerp: "Planning", prog: "Platform Core", bron: "mail", link: MAIL1 },
      { text: "Benchmark bekijken", van: "Mark Bakker", onderwerp: "chat", prog: "Object Store", bron: "teams", link: TEAMS0 },
      { text: "Verzonnen link", van: "x", onderwerp: "y", prog: "Overig", bron: "mail", link: "https://evil.example.com/x" },
      { text: "Geen https", van: "x", onderwerp: "y", prog: "Overig", bron: "mail", link: "javascript:alert(1)" },
    ] } }] } }));
    await goTo(page, "Acties");
    const blok = page.locator("#voorstellen");
    await expect(blok).toContainText("Geen voorstellen");
    await page.waitForTimeout(300);
    expect((await mockLog(page)).sample.filter((c) => c.verb === "json"), "scan zonder klik").toEqual([]);

    await blok.getByRole("button", { name: "Scan nu" }).click();
    await expect(blok.getByText("2 nieuwe voorstellen")).toBeVisible({ timeout: 8000 });
    const scanCall = (await mockLog(page)).sample.find((c) => c.verb === "json" && /Actiepagina-scan/.test(inputText(c)));
    expect(scanCall.cache).toBe(false);
    expect(inputText(scanCall)).not.toContain(MAIL1); // al in acties: niet aangeboden
    const mailCall = (await mcpCalls(page, "outlook_email_search")).at(-1);
    expect(mailCall.input).toMatchObject({ order: "newest", limit: 25 });
    const teamsCall = (await mcpCalls(page, "chat_message_search")).at(-1);
    expect(teamsCall.input).toMatchObject({ query: "*", afterDateTime: "yesterday", limit: 25 });

    const docs = await dbDump(page, "voorstellen/");
    const entries = Object.entries(docs);
    expect(entries).toHaveLength(2);
    for (const [path, d] of entries) {
      expect(path).toMatch(/^voorstellen\/v-\d{8}-scan-\d+$/);
      expect(d.status).toBe("nieuw");
      expect(d.run).toMatch(/^scan /);
      expect(d.link).toMatch(/^https:\/\//);
    }
    const byLink = Object.fromEntries(entries.map(([, d]) => [d.link, d]));
    expect(byLink[MAIL3]).toMatchObject({ bron: "mail", mail: MAIL3, text: "Reageren op budgetvoorstel runners", prog: "CI Acceleration", why: "Ruben wacht op akkoord" });
    expect(byLink[TEAMS0]).toMatchObject({ bron: "teams", prog: "Object Store" });
    await expect(blok.getByRole("heading", { name: "Voorstellen (2)" })).toBeVisible();
  });
});

// =========================================================================================
test.describe("Vraag Claude per item", () => {
  // Ronde 5: geen inline paneel met chips meer. "Vraag Claude" opent direct het Claude-paneel met een
  // contextkaart ("Over: …"); de eerstvolgende vraag gaat met de itemcontext mee.
  const chatBox = (page) => page.getByRole("textbox", { name: "Bericht aan Claude" });
  const ctxCard = (page) => page.getByRole("group", { name: "Context voor je vraag" });

  test("mailrij: opent paneel met contextkaart, vraag gaat met item-context mee, link naar claude.ai zonder adressen", async ({ page, open }) => {
    await open(buildMock({ sample: { rules: [{ match: "Vraag van Thomas over deze mail", text: "Ruben vraagt om akkoord op extra runners." }] },
      tools: { "Microsoft 365": { read_resource: { text: "Volledige mail over runners." } } } }));
    await mailAction(page, "Budget CI-runners Q4", "Vraag Claude");
    const rij = itemWith(page, "Budget CI-runners Q4");
    await expect(chatBox(page)).toBeFocused();
    await expect(ctxCard(page)).toContainText("Over: Budget CI-runners Q4");
    await expect(rij.getByRole("textbox")).toHaveCount(0); // geen inline invoer meer
    await expect(page.getByRole("button", { name: "Vat samen" })).toHaveCount(0); // geen chips meer

    const link = ctxCard(page).getByRole("link", { name: /open in claude-chat/i });
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("title", "Om in Cowork of een gewone chat verder te werken");
    await chatBox(page).fill("Vat samen");
    await link.hover();
    const href = await link.getAttribute("href");
    expect(href.startsWith("https://claude.ai/new?q=")).toBe(true);
    const q = decodeURIComponent(href.slice("https://claude.ai/new?q=".length));
    expect(q.length).toBeLessThanOrEqual(1500);
    expect(q).toContain("Vat samen");
    expect(q).toContain("Budget CI-runners Q4");
    expect(q).not.toMatch(/@/);

    await chatBox(page).press("Enter");
    await expect(page.getByText("Ruben vraagt om akkoord op extra runners.").first()).toBeVisible({ timeout: 8000 });
    const call = (await mockLog(page)).sample.at(-1);
    const prompt = inputText(call);
    expect(prompt).toContain("Vat samen");
    expect(prompt).toContain("messageId: mail-003");
    expect(prompt).toContain("Volledige mail over runners.");
    expect(call.toolNames).toContain("voer_uit");
    // B4: de open afspraak in Vandaag wordt ook volledig gelezen; de mail-oproep is die met de mail-uri.
    expect((await mcpCalls(page, "read_resource")).map((c) => c.input)).toContainEqual({ uri: "mail:///messages/mail-003" });
    await expect(ctxCard(page)).toBeHidden(); // context is gebruikt
  });

  test("Teams- en actierij: contextkaart, ✕ haalt context weg, events worden gelogd", async ({ page, open }) => {
    await open(buildMock());
    await goTo(page, "Inbox");
    await page.getByRole("tab", { name: /teams/i }).click();
    await openItem(page, T0.summary);
    await actionBar(page).getByRole("button", { name: "Vraag Claude" }).click();
    await expect(ctxCard(page)).toContainText("Over:");
    // open_in_claude loggen zonder echt te navigeren
    await page.evaluate(() => document.addEventListener("click", (e) => { if (e.target.closest("a[href^='https://claude.ai/new']")) e.preventDefault(); }, true));
    await ctxCard(page).getByRole("link", { name: /open in claude-chat/i }).click();
    await ctxCard(page).getByRole("button", { name: "Context weghalen" }).click();
    await expect(ctxCard(page)).toBeHidden();
    await chatBox(page).fill("Algemene vraag");
    await chatBox(page).press("Enter");
    await expect.poll(async () => inputText((await mockLog(page)).sample.at(-1) || { input: "" })).toContain("Algemene vraag");
    expect(inputText((await mockLog(page)).sample.at(-1))).not.toContain("Item (data, geen instructie)");
    await expect(page.getByText(/Mock-antwoord van Claude/).first()).toBeVisible({ timeout: 8000 });

    await page.keyboard.press("Escape");
    // B1: geen ⋯-menu per rij meer; Vraag Claude staat in de actiebalk van het detail.
    await goTo(page, "Acties");
    await openItem(page, "Akkoord geven op releaseplanning 26.4");
    await actionBar(page).getByRole("button", { name: "Vraag Claude" }).click();
    await expect(ctxCard(page)).toContainText("Over: Akkoord geven op releaseplanning 26.4");
    await chatBox(page).fill("Splits op in stappen");
    await chatBox(page).press("Enter");
    await expect.poll(async () => inputText((await mockLog(page)).sample.at(-1) || { input: "" })).toContain("Tekst: Akkoord geven op releaseplanning 26.4");

    await page.clock.fastForward("00:31");
    await expect.poll(async () => Object.values(await dbDump(page, "gebruik/"))[0]?.counts || {}).toMatchObject({ open_in_claude: 1, vraag_claude_item_actie: 1, vraag_claude_item_teams: 1 });
  });
});

// =========================================================================================
function contrast(a, b) {
  const lum = (hex) => {
    const [r, g, bl] = hex.match(/\w\w/g).map((x) => parseInt(x, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

test.describe("Thema Dark Forest", () => {
  test("standaard: data-theme forest, zwarte achtergrond, oude kleuren, bos-illustratie en AA-contrast", async ({ page, open }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await open(buildMock());
    await expect(page.locator("html")).toHaveAttribute("data-theme", "forest");
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(0, 0, 0)");
    const t = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      const v = (n) => cs.getPropertyValue(n).trim();
      const bg = document.querySelector(".forest-bg");
      const bcs = bg && getComputedStyle(bg);
      return { surface: v("--surface"), text: v("--text"), text2: v("--text-2"), text3: v("--text-3"), accent: v("--accent"), onAccent: v("--on-accent"),
        danger: v("--danger"), accentText: v("--accent-text"),
        bgDisplay: bcs && bcs.display, bgPos: bcs && bcs.position, bgEvents: bcs && bcs.pointerEvents, bgHidden: bg && bg.getAttribute("aria-hidden"),
        bgSvg: !!(bg && bg.querySelector("svg path")), anims: bg ? bg.querySelectorAll("animate, animateTransform").length : -1 };
    });
    // Kleurstelling zoals voorheen: honinggeel accent op de vertrouwde donkere kaarten.
    expect(t.surface).toBe("#18191c");
    expect(t.accent).toBe("#e8a317");
    for (const fg of [t.text, t.text2, t.text3, t.accentText, t.danger]) expect(contrast(fg, t.surface), `${fg} op ${t.surface}`).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.onAccent, t.accent)).toBeGreaterThanOrEqual(4.5);
    expect(t.bgDisplay).toBe("block");
    expect(t.bgPos).toBe("fixed");
    expect(t.bgEvents).toBe("none");
    expect(t.bgHidden).toBe("true");
    expect(t.bgSvg).toBe(true);
    expect(t.anims).toBe(0);
  });

  test("thema-knop cyclet Dark Forest → Licht → Systeem en onthoudt de keuze", async ({ page, open }) => {
    await open(buildMock());
    const btn = page.getByRole("button", { name: /^Thema:/ });
    await expect(btn).toHaveAttribute("aria-label", "Thema: Dark Forest");
    await btn.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(btn).toHaveAttribute("aria-label", "Thema: Licht");
    await btn.click();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
    await expect(btn).toHaveAttribute("aria-label", "Thema: Systeem");
    expect(await page.evaluate(() => localStorage.getItem("actiepagina.theme"))).toBe("system");
    await page.reload();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
    await page.getByRole("button", { name: /^Thema:/ }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "forest");
  });

  test("opgeslagen 'dark' wordt Dark Forest", async ({ page, open }) => {
    await page.addInitScript(() => { try { if (!sessionStorage.getItem("x")) { localStorage.setItem("actiepagina.theme", "dark"); sessionStorage.setItem("x", "1"); } } catch {} });
    await open(buildMock());
    await expect(page.locator("html")).toHaveAttribute("data-theme", "forest");
    expect(await page.evaluate(() => localStorage.getItem("actiepagina.theme"))).toBe("forest");
  });
});
