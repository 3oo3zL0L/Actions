// Ronde 6: het Claude-paneel geeft altijd antwoord (turns, tools-limiet, terugval, foutdetails),
// gebruikt modelTier "complex" en ziet eruit als een klein Claude/Cowork-venster.
const { test: base, expect } = require("@playwright/test");
const { buildMock } = require("./fixtures");
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

const chatBox = (page) => page.getByRole("textbox", { name: "Bericht aan Claude" });
const panel = (page) => page.locator("#chat");
const chatCalls = async (page) => (await mockLog(page)).sample.filter((c) => c.verb === "text" && Array.isArray(c.input));
async function ask(page, q) {
  await expect(panel(page).getByRole("button", { name: "Verstuur" })).toBeVisible({ timeout: 8000 }); // vorig antwoord klaar
  await chatBox(page).fill(q);
  await chatBox(page).press("Enter");
}
function roles(call) { return call.input.map((m) => m.role); }
function alternates(call) {
  const r = roles(call);
  return r[0] === "user" && r[r.length - 1] === "user" && r.every((x, i) => i === 0 || x !== r[i - 1]);
}

// =========================================================================================
test.describe("Claude geeft antwoord", () => {
  test("turns wisselen strikt af; rules zitten in de eerste user-turn; ook na een fout", async ({ page, open }) => {
    await open(buildMock({ sample: { rules: [
      // De mock matcht op de hele invoer (ook eerdere turns): nieuwste vraag eerst.
      { match: "derde vraag", text: "Antwoord op de derde vraag." },
      { match: "tweede vraag", error: { code: "upstream_error", message: "tijdelijk" } },
      { match: "eerste vraag", text: "Antwoord op de eerste vraag." },
    ] } }));
    await page.getByRole("button", { name: /wat moet ik vandaag/i }).click(); // opent het paneel
    await expect(page.getByText(/Mock-antwoord van Claude/).first()).toBeVisible({ timeout: 8000 });
    await ask(page, "Dit is de eerste vraag");
    await expect(page.getByText("Antwoord op de eerste vraag.").first()).toBeVisible({ timeout: 8000 });
    await ask(page, "Dit is de tweede vraag");
    await expect(page.getByText("Claude kon niet antwoorden.").first()).toBeVisible({ timeout: 8000 });
    await ask(page, "Dit is de derde vraag"); // na een fout: twee user-berichten achter elkaar in het gesprek
    await expect(page.getByText("Antwoord op de derde vraag.").first()).toBeVisible({ timeout: 8000 });

    const calls = await chatCalls(page);
    expect(calls.length).toBeGreaterThanOrEqual(4);
    for (const c of calls) {
      expect(alternates(c), `turns: ${roles(c).join(",")}`).toBe(true);
      expect(c.outcome).not.toBe("invalid_request");
    }
    const last = calls.at(-1);
    expect(last.input[0].content).toMatch(/^Je bent Claude in Thomas' Actiepagina/);
    expect(last.input[0].content).toContain("\n\n---\n\n");
    expect(last.input.at(-1).content).toContain("Dit is de tweede vraag"); // samengevoegd met de derde
    expect(last.input.at(-1).content).toContain("Dit is de derde vraag");
  });

  test("tools beperkt tot limits().tools.maxCount, in volgorde van belang", async ({ page, open }) => {
    await open(buildMock({ sample: { toolsMax: 4, default: { text: "Ok." } } }));
    await page.getByRole("button", { name: /wat moet ik vandaag/i }).click();
    await expect(page.getByText("Ok.").first()).toBeVisible({ timeout: 8000 });
    const [call] = await chatCalls(page);
    expect(call.toolNames).toEqual(["voer_uit", "lees", "schema", "acties_lijst"]); // ronde 7: generieke tools
    await expect.poll(async () => (await chatCalls(page))[0].outcome).toBe("ok");
  });

  test("standaard mock-limiet 8: alle vijf generieke tools passen", async ({ page, open }) => {
    await open(buildMock());
    await page.getByRole("button", { name: /wat moet ik vandaag/i }).click();
    await expect(page.getByText(/Mock-antwoord van Claude/).first()).toBeVisible({ timeout: 8000 });
    const [call] = await chatCalls(page);
    expect(call.toolNames).toEqual(["voer_uit", "lees", "schema", "acties_lijst", "actie_toevoegen"]);
  });

  test("invalid_request met tools: één terugval zonder tools, met pagina-context", async ({ page, open }) => {
    await open(buildMock({ sample: { rules: [{ match: "budget", errorIfTools: { code: "invalid_request", message: "tool schema refused" },
      text: "Antwoord zonder tools over het budget." }] } }));
    await expect(page.getByText("Budget CI-runners Q4").first()).toBeVisible();
    await page.getByRole("textbox", { name: /vraag claude/i }).first().fill("Wat speelt er rond het budget?");
    await page.getByRole("textbox", { name: /vraag claude/i }).first().press("Enter");
    await expect(page.getByText("Antwoord zonder tools over het budget.").first()).toBeVisible({ timeout: 8000 });
    const calls = await chatCalls(page);
    expect(calls).toHaveLength(2);
    expect(calls[0].toolNames.length).toBeGreaterThan(0);
    expect(calls[0].outcome).toBe("invalid_request");
    expect(calls[1].toolNames).toEqual([]);
    expect(calls[1].cache).toBe(false);
    const ctx = calls[1].input[0].content;
    expect(ctx).toContain("Agenda van vandaag");
    expect(ctx).toContain("Architectuuroverleg Object Store");
    expect(ctx).toContain("Budget CI-runners Q4");
    expect(ctx).toContain("Open acties");
    expect(ctx).toContain("Akkoord geven op releaseplanning 26.4");
    await expect(panel(page).getByText("Beantwoord zonder tools, met de gegevens op deze pagina.")).toBeVisible();
  });

  test("tools_unavailable (geen tools in deze weergave): direct zonder tools en toch antwoord", async ({ page, open }) => {
    await open(buildMock({ sample: { toolsMax: 0, default: { text: "Antwoord zonder tools." } } }));
    await page.getByRole("button", { name: /wat moet ik vandaag/i }).click();
    await expect(page.getByText("Antwoord zonder tools.").first()).toBeVisible({ timeout: 8000 });
    const calls = await chatCalls(page);
    expect(calls).toHaveLength(1);
    expect(calls[0].toolNames).toEqual([]);
    expect(calls[0].input[0].content).toContain("Agenda van vandaag");
  });

  test("fout: melding met Details (code en message) en event claude_fout_<code>", async ({ page, open }) => {
    await open(buildMock({ sample: { default: { error: { code: "rate_limited", message: "Usage limit reached for this viewer" } } } }));
    await page.getByRole("button", { name: /wat moet ik vandaag/i }).click();
    const err = panel(page).getByRole("alert");
    await expect(err).toContainText(/te veel vragen|limiet/i);
    await panel(page).getByText("Details").click();
    await expect(panel(page).getByText("rate_limited: Usage limit reached for this viewer")).toBeVisible();
    await expect(err.getByRole("button", { name: "Opnieuw" })).toBeVisible();
    await page.clock.fastForward("00:31");
    await expect.poll(async () => Object.values(await dbDump(page, "gebruik/"))[0]?.counts?.claude_fout_rate_limited).toBe(1);
  });
});

// =========================================================================================
test.describe("Model", () => {
  test("chat, Bereid voor en Antwoord-concept vragen modelTier complex; kop toont het gebruikte tier", async ({ page, open }) => {
    await open(buildMock({ sample: { rules: [
      { match: "runner", text: "Hi Ruben,\n\nAkkoord.\n\nKR\nThomas", tierApplied: "default" },
      { match: "Architectuuroverleg", text: "Voorbereiding klaar." },
    ] } }));
    await itemWith(page, "Architectuuroverleg Object Store").getByRole("button", { name: /bereid voor/i }).click();
    await expect(page.getByText("Voorbereiding klaar.").first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator("#chatTier")).toHaveText("· meest capabel");
    await expect(page.locator("#chatTitle")).toHaveText("Claude");

    await page.getByRole("button", { name: "Sluit Claude-paneel" }).click();
    await itemWith(page, "Budget CI-runners Q4").getByRole("button", { name: "Antwoord-concept" }).click();
    await expect.poll(async () => page.evaluate(() => [...document.querySelectorAll("textarea")].some((t) => /KR\nThomas$/.test(t.value))), { timeout: 8000 }).toBe(true);
    await expect(page.locator("#chatTier")).toHaveText("· standaard"); // plan gaf een ander tier terug

    const log = (await mockLog(page)).sample;
    const prep = log.find((c) => /Architectuuroverleg/.test(JSON.stringify(c.input)));
    const draft = log.find((c) => typeof c.input === "string" && /runner/.test(c.input));
    expect(prep.modelTier).toBe("complex");
    expect(draft.modelTier).toBe("complex");
  });
});

// =========================================================================================
test.describe("Claude/Cowork-look", () => {
  test("kleuren, bubbel, serif-antwoord, tool-regels, Kopieer/Opnieuw, verzend- en stopknop", async ({ page, open }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await open(buildMock({ sample: { rules: [{ match: "vandaag", chunkDelayMs: 60,
      toolCalls: [
        { tool: "^lees$", input: { server: "Microsoft 365", tool: "outlook_calendar_search", input: { query: "*", afterDateTime: "today", beforeDateTime: "tomorrow" } } },
        { tool: "^lees$", input: { server: "Microsoft 365", tool: "outlook_email_search", input: { query: "budget", order: "newest" } } }],
      text: "## Je dag\n\nEerst **Ruben** antwoorden.\n\n- punt een\n- punt twee\n\n```\nnpm test\n```\n\nZie `code` en [plan](https://wiki.example.com/x)." }] } }));
    await page.getByRole("button", { name: /wat moet ik vandaag/i }).click();
    // Tijdens streamen: vierkante stopknop.
    await expect(panel(page).getByRole("button", { name: "Stop" })).toBeVisible({ timeout: 8000 });
    await expect(page.getByText("punt twee").first()).toBeVisible({ timeout: 8000 });
    await expect(panel(page).getByRole("button", { name: "Verstuur" })).toBeVisible();

    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    const st = await page.evaluate(() => {
      const cs = (sel, pseudo) => getComputedStyle(document.querySelector(sel), pseudo);
      return {
        panel: cs("#chat").backgroundColor, head: cs(".chat-head").backgroundColor,
        bubble: cs(".msg.me").backgroundColor, bubbleText: cs(".msg.me").color, radius: cs(".msg.me").borderTopLeftRadius,
        answerFont: cs(".msg.cl .cl-text").fontFamily, answerSize: cs(".msg.cl .cl-text").fontSize, answerColor: cs(".msg.cl .cl-text").color,
        answerBg: cs(".msg.cl").backgroundColor,
        composer: cs(".composer").backgroundColor, composerBorder: cs(".composer").borderTopColor, composerRadius: cs(".composer").borderTopLeftRadius,
        send: cs("#chatSend").backgroundColor, sendRadius: cs("#chatSend").borderTopLeftRadius,
        pre: cs(".cl-text pre").fontFamily, preBg: cs(".cl-text pre").backgroundColor,
      };
    });
    expect(st.panel).toBe("rgb(38, 38, 36)");
    expect(st.head).toBe("rgb(31, 30, 29)");
    expect(st.bubble).toBe("rgb(57, 57, 55)");
    expect(st.bubbleText).toBe("rgb(245, 244, 239)");
    expect(st.radius).toBe("18px");
    expect(st.answerFont).toMatch(/Source Serif 4/);
    expect(st.answerSize).toBe("16px");
    expect(st.answerColor).toBe("rgb(236, 234, 228)");
    expect(st.answerBg).toBe("rgba(0, 0, 0, 0)"); // geen bubbel
    expect(st.composer).toBe("rgb(48, 48, 46)");
    expect(st.composerBorder).toBe("rgb(74, 73, 69)");
    expect(st.composerRadius).toBe("16px");
    expect(st.send).toBe("rgb(217, 119, 87)");
    expect(st.sendRadius).toBe("50%");
    expect(st.pre).toMatch(/mono/i);
    expect(st.preBg).toBe("rgb(31, 30, 29)");

    // Markdown
    const ans = panel(page).locator(".msg.cl").last();
    await expect(ans.getByRole("heading", { name: "Je dag" })).toBeVisible();
    await expect(ans.locator("strong", { hasText: "Ruben" })).toBeVisible();
    await expect(ans.getByRole("listitem")).toHaveCount(2);
    await expect(ans.locator("pre code")).toHaveText("npm test");
    await expect(ans.getByRole("link", { name: /plan/ })).toHaveAttribute("href", "https://wiki.example.com/x");
    // Sterretje als avatar
    await expect(ans.locator(".cl-avatar svg")).toHaveCount(1);

    // Tool-regels inklapbaar met details
    const toolLine = panel(page).locator("details.tool").filter({ hasText: "Agenda bekeken" });
    await expect(toolLine).toBeVisible();
    await expect(toolLine.getByText(/outlook_calendar_search/)).toBeHidden();
    await toolLine.locator("summary").click();
    await expect(toolLine.getByText(/outlook_calendar_search/)).toBeVisible();
    await expect(panel(page).locator("details.tool").filter({ hasText: "Mail doorzocht" })).toContainText('"query": "budget"');

    // Kopieer onder elk antwoord, Opnieuw alleen bij het laatste
    await expect(ans.getByRole("button", { name: "Kopieer antwoord" })).toBeVisible();
    await expect(panel(page).getByRole("button", { name: "Opnieuw antwoorden" })).toHaveCount(1);
    const before = (await chatCalls(page)).length;
    await panel(page).getByRole("button", { name: "Opnieuw antwoorden" }).click();
    await expect.poll(async () => (await chatCalls(page)).length).toBe(before + 1);
    const again = (await chatCalls(page)).at(-1);
    expect(again.input.at(-1).role).toBe("user");
    expect(again.input.filter((m) => m.role === "assistant")).toHaveLength(0); // oud antwoord vervangen
    await expect(page.getByText("punt twee")).toHaveCount(1, { timeout: 8000 });
  });

  test("invoer: Enter verstuurt, Shift+Enter nieuwe regel; + voegt sectiecontext toe", async ({ page, open }) => {
    await open(buildMock({ sample: { rules: [{ match: "over mijn acties", text: "Je hebt één open actie." }] } }));
    await page.getByRole("button", { name: /wat moet ik vandaag/i }).click();
    await expect(page.getByText(/Mock-antwoord van Claude/).first()).toBeVisible({ timeout: 8000 });
    await expect(chatBox(page)).toHaveAttribute("placeholder", "Antwoord aan Claude…");
    await chatBox(page).fill("regel een");
    await chatBox(page).press("Shift+Enter");
    await chatBox(page).type("regel twee");
    await expect(chatBox(page)).toHaveValue("regel een\nregel twee");

    await panel(page).getByRole("button", { name: "Context toevoegen" }).click();
    await expect(panel(page).getByRole("menuitem", { name: "Vraag over Vandaag" })).toBeVisible();
    await panel(page).getByRole("menuitem", { name: "Vraag over Acties" }).click();
    await expect(page.getByRole("group", { name: "Context voor je vraag" })).toContainText("Over: Acties");
    await chatBox(page).press("Enter");
    await expect(page.getByText("Je hebt één open actie.").first()).toBeVisible({ timeout: 8000 });
    const last = (await chatCalls(page)).at(-1);
    expect(last.input.at(-1).content).toContain("regel een\nregel twee");
    expect(last.input.at(-1).content).toContain("Akkoord geven op releaseplanning 26.4");
    expect(last.modelTier).toBe("complex");
  });
});
