// B4 Agenda: vandaag en morgen als tijdlijn, uitnodigingen beantwoorden (met terugdraai-actie), afspraakdetail,
// Maak actie vanuit een afspraak en "Plan een vergadering" op beschikbaarheid. Gedrag via rollen en teksten.
const { test: base, expect } = require("@playwright/test");
const { buildMock } = require("./fixtures");
const { buildAgendaMock, freeSlots, nextWorkdays } = require("./fixtures/agenda");
const { openPage, mockLog, mcpCalls, dbDump, itemWith, goTo, entryButton, detail, actionBar, feedbackBar, openItem, heading } = require("./helpers");

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

const barLabels = (page) => actionBar(page).locator("[data-slot]").evaluateAll((els) => els.map((e) => e.childNodes[0].textContent.trim()));
const respondCalls = (page) => mcpCalls(page, "outlook_respond_to_event");
const planner = (page) => detail(page).getByRole("region", { name: "Plan een vergadering" });

// =========================================================================================
test.describe("Agenda: vandaag en morgen", () => {
  test("toont Vandaag met nu-lijn en Morgen als tijdlijn; uitnodigingen gemarkeerd; bereik tot overmorgen", async ({ page, open }) => {
    await open(buildAgendaMock());
    await goTo(page, "Agenda");
    await expect(heading(page, /^Vandaag/)).toBeVisible();
    await expect(heading(page, /^Morgen/)).toBeVisible();
    const morgen = page.locator(".aday").filter({ has: page.getByRole("heading", { name: /^Morgen/ }) });
    await expect(morgen.getByText("Roadmapsessie Jakarta migratie")).toBeVisible();
    await expect(morgen).toContainText("09:30-10:30");
    await expect(morgen.getByText(/^nu \d/)).toHaveCount(0); // nu-lijn alleen bij vandaag
    const vandaag = page.locator(".aday").filter({ has: page.getByRole("heading", { name: /^Vandaag/ }) });
    await expect(vandaag.getByText(/^nu 10:1\d$/)).toBeVisible();
    await expect(vandaag.getByText("Roadmapsessie Jakarta migratie")).toHaveCount(0);
    // Onbeantwoorde uitnodigingen (vandaag en morgen) dragen "Uitnodiging"; gewone afspraken niet.
    await expect(itemWith(page, "Kwartaalplanning Platform Stability")).toContainText("Uitnodiging");
    await expect(itemWith(page, "Demo CI Acceleration")).toContainText("Uitnodiging");
    await expect(itemWith(page, "Sync CI Acceleration")).not.toContainText("Uitnodiging");
    // Rij: tijd, titel, plaats (Teams); geen knoppen of links behalve de rij zelf.
    const rij = itemWith(page, "Kwartaalplanning Platform Stability");
    await expect(rij).toContainText("14:30-15:00");
    await expect(rij).toContainText("Teams");
    await expect(rij.getByRole("link")).toHaveCount(0);
    await expect(rij.getByRole("button")).toHaveCount(1);
    // Zoekbereik: vandaag tot het begin van overmorgen (morgen zit erin).
    const [call] = await mcpCalls(page, "outlook_calendar_search");
    const d = new Date(await page.evaluate(() => Date.now()));
    d.setDate(d.getDate() + 2);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(call.input).toMatchObject({ afterDateTime: "today", beforeDateTime: iso });
    expect(call.input.limit).toBeLessThanOrEqual(25);
    // Teller van Agenda blijft: afspraken van vandaag die nog komen of lopen (4 + uitnodiging 14:30).
    await expect(entryButton(page, "Agenda")).toHaveAccessibleName("Agenda 5");
  });

  test("zonder afspraken morgen een uitleg in plaats van een lege plek", async ({ page, open }) => {
    await open(buildMock());
    await goTo(page, "Agenda");
    await expect(heading(page, /^Morgen/)).toBeVisible();
    await expect(page.getByText("Geen afspraken morgen.")).toBeVisible();
  });

  test("Vandaag: als de dag voorbij is, staat de eerste afspraak van morgen erbij", async ({ page, open }) => {
    const mock = buildAgendaMock();
    mock.refNow += 8 * 3600000; // 18:15
    await open(mock);
    await expect(page.getByText("Geen afspraken meer vandaag.")).toBeVisible();
    await expect(page.getByText("Morgen als eerste")).toBeVisible();
    await expect(itemWith(page, "Roadmapsessie Jakarta migratie")).toContainText("09:30-10:30");
    await expect(page.getByText("Demo CI Acceleration")).toHaveCount(0); // alleen de eerste
  });
});

// =========================================================================================
test.describe("Uitnodiging beantwoorden", () => {
  test("detail: tijd, organisator, deelnemers, plaats, Teams-link en tekst; actiebalk Accepteer eerst", async ({ page, open }) => {
    await open(buildAgendaMock());
    await goTo(page, "Agenda");
    await openItem(page, "Kwartaalplanning Platform Stability");
    const d = detail(page);
    await expect(d.getByText("Uitnodiging", { exact: true })).toBeVisible();
    await expect(d).toContainText("vandaag 14:30-15:00");
    await expect(d).toContainText("Eva Jansen");
    await expect(d).toContainText("Ruben Smit");
    await expect(d).toContainText("Nog niet beantwoord");
    await expect(d.getByRole("link", { name: /Deelnemen aan de vergadering/ })).toHaveAttribute("href", "https://teams.example.com/l/meetup-join/evt-101");
    await expect(d).toContainText("Voorstel voor de planning van Q4.");
    await expect(d).toContainText("Stand van zaken"); // volledige tekst uit read_resource
    expect((await mcpCalls(page, "read_resource")).map((c) => c.input.uri)).toContain("calendar:///events/evt-101");
    // Max 5 knoppen in vaste volgorde (Maak actie komt na het antwoord); elke knop noemt zijn toets.
    expect(await barLabels(page)).toEqual(["Accepteer", "Voorlopig", "Afwijzen", "Vraag Claude", "Open in Outlook"]);
    await expect(actionBar(page).getByRole("button", { name: "Accepteer" })).toHaveAttribute("title", /\(r\)$/);
    await expect(actionBar(page).getByRole("button", { name: "Afwijzen" })).toHaveAttribute("title", /\(x\)$/);
    await expect(actionBar(page).getByRole("button", { name: "Voorlopig" })).toHaveAttribute("title", /\(t\)$/);
    await expect(actionBar(page).getByRole("button", { name: "Vraag Claude" })).toHaveAttribute("title", /\(c\)$/);
    // Optioneel bericht: inline veld onder de actiebalk, geen popup.
    await expect(d.getByRole("textbox", { name: "Bericht aan Eva Jansen (optioneel)" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("Accepteer met bericht (Enter) roept respond_to_event; Toch afwijzen draait het echt terug", async ({ page, open }) => {
    await open(buildAgendaMock());
    await goTo(page, "Agenda");
    await openItem(page, "Kwartaalplanning Platform Stability");
    const msg = detail(page).getByRole("textbox", { name: /Bericht aan Eva Jansen/ });
    await msg.fill("Ik schuif iets later aan.");
    await msg.press("Enter");
    await expect.poll(async () => (await respondCalls(page)).length).toBe(1);
    expect((await respondCalls(page))[0].input).toEqual({ eventId: "evt-101", response: "accept", sendResponse: true, comment: "Ik schuif iets later aan." });
    const bar = feedbackBar(page);
    await expect(bar).toContainText("✓ Geaccepteerd: Kwartaalplanning Platform Stability");
    await expect(bar.getByRole("button", { name: "Toch afwijzen" })).toHaveAttribute("title", "Toch afwijzen (z)");
    await expect(bar.getByRole("button", { name: /Ongedaan/ })).toHaveCount(0); // geen nep-ongedaan
    // De rij is geen uitnodiging meer; het berichtveld is weg; de actiebalk wisselt naar Deelnemen.
    await expect(itemWith(page, "Kwartaalplanning Platform Stability")).not.toContainText("Uitnodiging");
    await expect(itemWith(page, "Kwartaalplanning Platform Stability")).toContainText("Geaccepteerd");
    await expect(detail(page).getByRole("textbox", { name: /Bericht aan/ })).toHaveCount(0);
    await expect(actionBar(page).getByRole("link", { name: "Deelnemen" })).toHaveAttribute("href", "https://teams.example.com/l/meetup-join/evt-101");

    await bar.getByRole("button", { name: "Toch afwijzen" }).click();
    await expect.poll(async () => (await respondCalls(page)).length).toBe(2);
    expect((await respondCalls(page))[1].input).toEqual({ eventId: "evt-101", response: "decline", sendResponse: true });
    await expect(bar).toContainText("✓ Afgewezen: Kwartaalplanning Platform Stability");
    await expect(bar.getByRole("button", { name: "Toch accepteren" })).toBeVisible();
  });

  test("toetsen: r accepteert, z draait terug (afwijzen); t is voorlopig, x wijst af", async ({ page, open }) => {
    await open(buildAgendaMock());
    await goTo(page, "Agenda");
    await openItem(page, "Kwartaalplanning Platform Stability");
    await page.keyboard.press("r");
    await expect.poll(async () => (await respondCalls(page)).map((c) => c.input.response)).toEqual(["accept"]);
    await expect(feedbackBar(page)).toContainText("Geaccepteerd");
    await page.keyboard.press("z");
    await expect.poll(async () => (await respondCalls(page)).map((c) => c.input.response)).toEqual(["accept", "decline"]);

    await openItem(page, "Demo CI Acceleration");
    await expect(detail(page)).toContainText("morgen 13:00-13:45");
    await page.keyboard.press("t");
    await expect.poll(async () => (await respondCalls(page)).at(-1)?.input).toEqual({ eventId: "evt-202", response: "tentative", sendResponse: true });
    await expect(feedbackBar(page)).toContainText("✓ Voorlopig geaccepteerd: Demo CI Acceleration");
    await expect(feedbackBar(page).getByRole("button", { name: "Toch accepteren" })).toBeVisible();
  });

  test("Afwijzen met bericht; fout in mensentaal met Opnieuw proberen", async ({ page, open }) => {
    await open(buildAgendaMock({ tools: { "Microsoft 365": { outlook_respond_to_event: { sequence: [
      { error: { code: "tool_error", message: "The meeting organizer cannot respond." } }, { text: "ok" }] } } } }));
    await goTo(page, "Agenda");
    await openItem(page, "Demo CI Acceleration");
    await detail(page).getByRole("textbox", { name: /Bericht aan Ruben Smit/ }).fill("Past niet, ik lees de notulen.");
    await actionBar(page).getByRole("button", { name: "Afwijzen" }).click();
    await expect(detail(page).getByRole("alert")).toBeVisible();
    await expect(feedbackBar(page)).toContainText("Beantwoorden lukte niet: Demo CI Acceleration");
    await expect(itemWith(page, "Demo CI Acceleration")).toContainText("Uitnodiging"); // niets veranderd
    await detail(page).getByRole("button", { name: "Opnieuw proberen" }).click();
    await expect.poll(async () => (await respondCalls(page)).length).toBe(2);
    expect((await respondCalls(page))[1].input).toEqual({ eventId: "evt-202", response: "decline", sendResponse: true, comment: "Past niet, ik lees de notulen." });
    await expect(feedbackBar(page)).toContainText("✓ Afgewezen: Demo CI Acceleration");
  });
});

// =========================================================================================
test.describe("Gewone afspraak", () => {
  test("Deelnemen is de primaire actie; Vraag Claude (c) met de afspraak als context; Bereid voor als extra", async ({ page, open }) => {
    await open(buildAgendaMock());
    await goTo(page, "Agenda");
    await openItem(page, "Architectuuroverleg Object Store");
    await expect(actionBar(page).getByRole("link", { name: "Deelnemen" })).toHaveAttribute("href", "https://teams.example.com/l/meetup-join/evt-003");
    expect(await barLabels(page)).toEqual(["Deelnemen", "Maak actie", "Vraag Claude", "Open in Outlook", "Bereid voor"]);
    await expect(actionBar(page).getByRole("link", { name: "Deelnemen" })).toHaveAttribute("title", "Deelnemen aan de Teams-vergadering (d)");
    await page.keyboard.press("c");
    await expect(page.getByRole("textbox", { name: "Bericht aan Claude" })).toBeFocused();
    await expect(page.getByRole("group", { name: "Context voor je vraag" })).toContainText("Over: Architectuuroverleg Object Store");
  });

  test("Maak actie (a) blijft in Agenda: actie met bron agenda en 'Na <titel>'; Bekijk selecteert hem", async ({ page, open }) => {
    await open(buildAgendaMock());
    await goTo(page, "Agenda");
    await openItem(page, "Architectuuroverleg Object Store");
    await page.keyboard.press("a");
    await expect(feedbackBar(page)).toContainText("✓ Actie toegevoegd bij Object Store");
    await expect(entryButton(page, "Agenda")).toHaveAttribute("aria-current", "page");
    const docs = Object.values(await dbDump(page, "acties/"));
    const doc = docs.find((x) => x.bron === "agenda");
    expect(doc).toMatchObject({ text: "Opvolgen: Architectuuroverleg Object Store", why: "Na Architectuuroverleg Object Store", prog: "Object Store",
      bron: "agenda", bronUrl: "https://outlook.example.com/owa/?itemid=evt-003", status: "open" });
    // z blijft Ongedaan maken; Bekijk is een eigen knop die naar de actie gaat.
    await expect(feedbackBar(page).getByRole("button", { name: "Ongedaan maken" })).toHaveAttribute("title", "Ongedaan maken (z)");
    await feedbackBar(page).getByRole("button", { name: "Bekijk" }).click();
    await expect(entryButton(page, "Acties")).toHaveAttribute("aria-current", "page");
    await expect(detail(page).getByRole("heading", { level: 2 })).toHaveText("Opvolgen: Architectuuroverleg Object Store");
    await page.locator("body").press("z");
    await expect.poll(async () => Object.values(await dbDump(page, "acties/")).some((x) => x.bron === "agenda")).toBe(false);
  });
});

// =========================================================================================
test.describe("Plan een vergadering", () => {
  const slotsFixture = (ref) => freeSlots(ref, [
    [0, "07:00", 100], // buiten werktijd: valt af
    [0, "10:00", 100], [0, "14:00", 50, false], [1, "09:30", 100], [1, "16:00", 80, false], [2, "11:00", 100],
  ], 60);

  test("knop in de lijstkop, deelnemer uit suggesties, 60 min, Zoek tijd toont de drie beste sloten, klik maakt Teams-vergadering", async ({ page, open }) => {
    const mock = buildAgendaMock();
    mock.tools["Microsoft 365"].outlook_find_available_time = slotsFixture(mock.refNow);
    await open(mock);
    await goTo(page, "Agenda");
    const btn = page.getByRole("button", { name: "Plan een vergadering" });
    await expect(btn).toHaveAttribute("title", "Plan een vergadering (p)");
    await btn.click();
    const p = planner(page);
    await expect(p).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0); // inline, geen popup
    const who = p.getByRole("combobox", { name: "Deelnemers" });
    await expect(who).toBeFocused();
    await who.pressSequentially("lot");
    await expect(p.getByRole("option", { name: /Lotte Visser/ })).toBeVisible(); // uit de agenda (adresboek-terugval)
    await who.press("Enter");
    await expect(p.getByRole("button", { name: "Haal Lotte Visser weg" })).toBeVisible();
    await p.getByRole("textbox", { name: "Onderwerp" }).fill("Afstemming runners");
    await p.getByRole("radio", { name: "60 min" }).check();
    await p.getByRole("textbox", { name: "Notitie (optioneel)" }).fill("Doel — keuze runners. That said, kort houden.");
    await p.getByRole("button", { name: "Zoek tijd" }).click();

    const slots = p.getByRole("group", { name: "Vrije momenten" }).getByRole("button");
    await expect(slots).toHaveCount(3);
    const [find] = await mcpCalls(page, "outlook_find_available_time");
    expect(find.input.participants).toEqual(["lotte.visser@example.com"]);
    expect(find.input.durationMinutes).toBe(60);
    expect(find.input.afterDateTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    const days = (Date.parse(find.input.beforeDateTime) - Date.parse(find.input.afterDateTime)) / 86400000;
    expect(days).toBeGreaterThan(4); // de komende 5 werkdagen
    expect(days).toBeLessThan(10);
    // Beste drie (iedereen vrij, hoogste zekerheid), op tijdvolgorde; 07:00 valt af.
    await expect(slots.nth(0)).toContainText("10:00-11:00");
    await expect(slots.nth(1)).toContainText("09:30-10:30");
    await expect(slots.nth(2)).toContainText("11:00-12:00");
    await expect(p).not.toContainText("07:00");
    await expect(slots.nth(0)).toHaveAttribute("title", /\(1\)$/);
    await expect(p).not.toContainText(/\bnull\b|\bundefined\b|NaN/);

    await slots.nth(1).click();
    await expect.poll(async () => (await mcpCalls(page, "outlook_create_event")).length).toBe(1);
    const [ev] = await mcpCalls(page, "outlook_create_event");
    const wd = nextWorkdays(mock.refNow, 2)[1];
    const day = new Date(mock.refNow + wd * 86400000).toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
    expect(ev.input).toEqual({
      subject: "Afstemming runners",
      start: { dateTime: `${day}T09:30:00`, timeZone: "Europe/Amsterdam" },
      end: { dateTime: `${day}T10:30:00`, timeZone: "Europe/Amsterdam" },
      attendees: [{ email: "lotte.visser@example.com", name: "Lotte Visser", type: "required" }],
      isOnlineMeeting: true,
      body: "Doel, keuze runners. That being said, kort houden.",
      bodyType: "text",
    });
    const bar = feedbackBar(page);
    await expect(bar).toContainText(/✓ Vergadering gepland op \S+( \d+ \S+)? 09:30/);
    await expect(bar.getByRole("link", { name: /Bekijk/ })).toHaveAttribute("href", /outlook\.example\.com/);
    await expect(planner(page)).toHaveCount(0);
  });

  test("geen gezamenlijke tijd: uitleg en Andere dagen zoekt de werkdagen daarna", async ({ page, open }) => {
    const mock = buildAgendaMock();
    mock.tools["Microsoft 365"].outlook_find_available_time = { sequence: [
      { payload: { nowDateTime: new Date(mock.refNow).toISOString(), availableTimes: [], unavailableParticipants: [] } },
      slotsFixture(mock.refNow)] };
    await open(mock);
    await page.evaluate(() => planMeeting({ subject: "Budget CI-runners Q4", attendees: [{ name: "Ruben Smit", email: "ruben.smit@example.com" }] }));
    const p = planner(page);
    await expect(entryButton(page, "Agenda")).toHaveAttribute("aria-current", "page");
    await expect(p.getByRole("textbox", { name: "Onderwerp" })).toHaveValue("Budget CI-runners Q4");
    await expect(p.getByRole("button", { name: "Haal Ruben Smit weg" })).toBeVisible();
    await p.getByRole("button", { name: "Zoek tijd" }).click();
    await expect(p).toContainText("Geen tijd gevonden waarop iedereen kan");
    const more = p.getByRole("button", { name: "Andere dagen" });
    await expect(more).toBeFocused();
    await expect(more).toHaveAttribute("title", /\(a\)$/);
    await page.keyboard.press("a");
    await expect(p.getByRole("group", { name: "Vrije momenten" }).getByRole("button")).toHaveCount(3);
    const calls = await mcpCalls(page, "outlook_find_available_time");
    expect(calls).toHaveLength(2);
    expect(Date.parse(calls[1].input.afterDateTime)).toBeGreaterThanOrEqual(Date.parse(calls[0].input.beforeDateTime));
    expect(calls[1].input.durationMinutes).toBe(30);
  });

  test("standaard mock-sloten, toets 1 kiest het eerste; zonder deelnemer eerst een uitleg", async ({ page, open }) => {
    await open(buildAgendaMock());
    await goTo(page, "Agenda");
    await page.keyboard.press("p");
    const p = planner(page);
    await expect(p).toBeVisible();
    await p.getByRole("textbox", { name: "Onderwerp" }).fill("Kort overleg");
    await p.getByRole("button", { name: "Zoek tijd" }).click();
    await expect(p).toContainText("Voeg minstens een deelnemer toe.");
    await expect(p).not.toContainText(/\bnull\b|\bundefined\b/);
    expect(await mcpCalls(page, "outlook_find_available_time")).toEqual([]);
    const who = p.getByRole("combobox", { name: "Deelnemers" });
    await who.fill("noor.mulder@example.com");
    await p.getByRole("textbox", { name: "Onderwerp" }).press("Enter"); // Enter zoekt tijd; getypt adres telt mee
    const slots = p.getByRole("group", { name: "Vrije momenten" }).getByRole("button");
    await expect(slots).toHaveCount(3);
    await slots.first().focus();
    await page.keyboard.press("1");
    await expect.poll(async () => (await mcpCalls(page, "outlook_create_event")).length).toBe(1);
    const [ev] = await mcpCalls(page, "outlook_create_event");
    expect(ev.input.attendees).toEqual([{ email: "noor.mulder@example.com", name: "Noor Mulder", type: "required" }]);
    expect(ev.input.isOnlineMeeting).toBe(true);
    expect(ev.input).not.toHaveProperty("body");
    await expect(entryButton(page, "Agenda")).toHaveAttribute("aria-current", "page"); // 1 navigeerde niet naar Vandaag
    await expect(feedbackBar(page)).toContainText("✓ Vergadering gepland op");
  });

  test("adresboek van de app (window.addressBook) levert suggesties als het er is; Esc sluit de planner", async ({ page, open }) => {
    await open(buildAgendaMock());
    await page.evaluate(() => { window.addressBook = { search: (q) => [{ name: "Sophie de Wit", email: "sophie.dewit@example.com" }].filter((p) => p.name.toLowerCase().includes(q)) }; });
    await goTo(page, "Agenda");
    await page.getByRole("button", { name: "Plan een vergadering" }).click();
    const who = planner(page).getByRole("combobox", { name: "Deelnemers" });
    await who.pressSequentially("sop");
    await expect(planner(page).getByRole("option", { name: /Sophie de Wit/ })).toBeVisible();
    await who.press("ArrowDown");
    await who.press("Enter");
    await expect(planner(page).getByRole("button", { name: "Haal Sophie de Wit weg" })).toBeVisible();
    await expect(who).toBeFocused();
    // Snel getypt: naam + Enter voordat de suggesties er zijn kiest toch de eerste treffer.
    await who.fill("ma");
    await who.press("Enter");
    await expect(planner(page).getByRole("button", { name: "Haal Mark Bakker weg" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(planner(page)).toHaveCount(0);
    await expect(page.locator('#lijst button[aria-current="true"]')).toBeFocused(); // Esc: focus naar de geselecteerde rij
  });
});
