// B9: licht thema, mobiel-polish, toegankelijkheid (contrast AA, actiebalk als toolbar met roving
// tabindex, reduced motion, landmarks). Test gedrag via rollen/teksten en berekend contrast, niet
// via classnamen (docs/PLAN-FASE2.md, definition of done).
const { test: base, expect } = require("@playwright/test");
const { buildMock } = require("./fixtures");
const { openPage, goTo, itemWith, actionBar, detail, feedbackBar, nav, ENTRY_NAMES } = require("./helpers");

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

// ---- Contrast (compacte versie van scratchpad/b9/contrast.js): AA voor tekst en 3:1 voor UI-randen. ----
function relLum({ r, g, b }) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function parseColor(str) {
  const m = /rgba?\(([^)]+)\)/.exec(str);
  if (!m) return null;
  const p = m[1].split(",").map(Number);
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
}
function contrastOf(fgStr, bgStr) {
  const fg = parseColor(fgStr), bg = parseColor(bgStr);
  if (!fg || !bg) return null;
  const flat = fg.a < 1 ? { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) } : fg;
  const l1 = relLum(flat), l2 = relLum(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}
/** Alle zichtbare tekstelementen op de pagina (nu): { fg, bg, fs, large }. */
async function textNodes(page) {
  return page.evaluate(() => {
    function bgOf(el) {
      let node = el;
      while (node) {
        const bg = getComputedStyle(node).backgroundColor;
        if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg;
        node = node.parentElement;
      }
      return "rgb(255, 255, 255)";
    }
    const out = [];
    document.querySelectorAll("body *").forEach((el) => {
      if (el.closest("[hidden]")) return;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) === 0) return;
      let ownText = false;
      for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { ownText = true; break; }
      if (!ownText) return;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const fs = parseFloat(cs.fontSize), fw = cs.fontWeight;
      const large = fs >= 24 || (fs >= 18.66 && (fw === "bold" || parseInt(fw, 10) >= 700));
      out.push({ fg: cs.color, bg: bgOf(el), large, tag: el.tagName, cls: el.className, text: (el.textContent || "").trim().slice(0, 40) });
    });
    return out;
  });
}
/** Faalt de test als een zichtbaar tekstelement onder de AA-drempel zit (4.5:1 normaal, 3:1 groot). */
async function expectAllTextAA(page, label) {
  const nodes = await textNodes(page);
  const fails = [];
  for (const n of nodes) {
    const cr = contrastOf(n.fg, n.bg);
    if (cr == null) continue;
    const need = n.large ? 3.0 : 4.5;
    if (cr < need - 0.02) fails.push({ ...n, cr: +cr.toFixed(2), need });
  }
  expect(fails, `${label}: tekst onder AA-contrast (${JSON.stringify(fails)})`).toEqual([]);
}

// =========================================================================================
test.describe("Licht thema volgt overal mee", () => {
  test("Claude-paneel, command bar en feedbackbalk zijn leesbaar (AA) in licht thema, en Dark Forest blijft ongewijzigd", async ({ page, open }) => {
    await open(buildMock());
    // Uitgangspunt: Dark Forest, zwarte achtergrond, zoals altijd.
    await expect(page.locator("html")).toHaveAttribute("data-theme", "forest");
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(0, 0, 0)");
    await expectAllTextAA(page, "forest/Vandaag");

    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.waitForTimeout(250); // laat de CSS-transitie (--dur) landen voor we kleuren meten
    await expectAllTextAA(page, "light/Vandaag");

    // Feedbackbalk
    await goTo(page, "Inbox");
    await itemWith(page, "Budget CI-runners Q4").click({ position: { x: 60, y: 14 } });
    await actionBar(page).getByRole("button", { name: "Afhandelen" }).click();
    await expect(feedbackBar(page)).toBeVisible();
    await expectAllTextAA(page, "light/feedbackbalk");

    // Claude-paneel: was altijd donker (los van het paginathema); moet nu meelopen met licht.
    await actionBar(page).getByRole("button", { name: "Vraag Claude" }).click().catch(() => {});
    const panel = page.locator("#chat");
    if (!(await panel.isVisible())) { await page.getByRole("button", { name: /Zoek of vraag/ }).click(); await page.getByRole("option", { name: /^Vraag Claude/ }).click(); }
    await expect(panel).toBeVisible();
    const chatBg = await panel.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(chatBg, "Claude-paneel is nog steeds hard donker in het lichte thema").toBe("rgb(255, 255, 255)");
    await expectAllTextAA(page, "light/Claude-paneel");

    // Command bar (Ctrl+K)
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+k");
    await expect(page.locator("#cmdbar")).toBeVisible();
    await expectAllTextAA(page, "light/command bar");
  });

  test("systeemthema (geen data-theme) volgt prefers-color-scheme, ook voor het Claude-paneel", async ({ page, open }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await open(buildMock());
    await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));
    await goTo(page, "Inbox");
    await itemWith(page, "Budget CI-runners Q4").click({ position: { x: 60, y: 14 } });
    await actionBar(page).getByRole("button", { name: "Vraag Claude" }).click();
    const panel = page.locator("#chat");
    await expect(panel).toBeVisible();
    expect(await panel.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(255, 255, 255)");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(() => panel.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgb(255, 255, 255)");
  });
});

// =========================================================================================
test.describe("Actiebalk: role=toolbar met roving tabindex (ARIA APG)", () => {
  test("←/→ en Home/End bewegen de focus binnen de balk; slechts één knop is tabbaar", async ({ page, open }) => {
    await open(buildMock());
    await goTo(page, "Inbox");
    await itemWith(page, "Budget CI-runners Q4").click({ position: { x: 60, y: 14 } });
    const bar = actionBar(page);
    await expect(bar).toHaveAttribute("role", "toolbar");
    const btns = bar.locator(":scope > .btn, :scope > .abar-more > .btn");
    const n = await btns.count();
    expect(n).toBeGreaterThan(1);
    // Precies één knop staat in de tabvolgorde.
    const tabidx = await btns.evaluateAll((els) => els.map((e) => e.tabIndex));
    expect(tabidx.filter((t) => t === 0).length).toBe(1);
    await btns.first().focus();
    await expect(btns.first()).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(btns.nth(1)).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(btns.nth(2)).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(btns.nth(1)).toBeFocused();
    await page.keyboard.press("End");
    await expect(btns.last()).toBeFocused();
    await page.keyboard.press("Home");
    await expect(btns.first()).toBeFocused();
    // Na het bewegen is de nieuw gefocuste knop de enige met tabindex 0.
    const tabidx2 = await btns.evaluateAll((els) => els.map((e) => e.tabIndex));
    expect(tabidx2[0]).toBe(0);
    expect(tabidx2.slice(1).every((t) => t === -1)).toBe(true);
  });

  test("elke knop in de actiebalk heeft een naam (icoon-only inbegrepen)", async ({ page, open }) => {
    await open(buildMock());
    await goTo(page, "Inbox");
    await itemWith(page, "Budget CI-runners Q4").click({ position: { x: 60, y: 14 } });
    const bar = actionBar(page);
    const btns = bar.locator(":scope > .btn, :scope > .abar-more > .btn");
    const n = await btns.count();
    for (let i = 0; i < n; i++) {
      const name = await btns.nth(i).evaluate((el) => (el.getAttribute("aria-label") || el.textContent || "").trim());
      expect(name.length, `knop ${i} zonder naam`).toBeGreaterThan(0);
    }
  });
});

// =========================================================================================
test.describe("Reduced motion", () => {
  test("prefers-reduced-motion: reduce schakelt animaties en transities uit", async ({ page, open }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(buildMock());
    const anims = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll("body *"));
      return els.map((el) => {
        const cs = getComputedStyle(el);
        return { anim: cs.animationName, animDur: cs.animationDuration, transDur: cs.transitionDuration };
      }).filter((x) => x.anim !== "none" || parseFloat(x.animDur) > 0 || (x.transDur && x.transDur.split(",").some((d) => parseFloat(d) > 0)));
    });
    expect(anims, "elementen met actieve animatie/transitie ondanks reduced motion").toEqual([]);
  });
});

// =========================================================================================
test.describe("375px: geen horizontale scroll, tabbalk en terug-knop op elke ingang", () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test("alle vijf ingangen en hun detail blijven binnen 375px", async ({ page, open }) => {
    await open(buildMock());
    const noHScroll = async (label) => {
      const m = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, vw: window.innerWidth }));
      expect(m.doc, `${label}: documentbreedte ${m.doc} > ${m.vw}`).toBeLessThanOrEqual(m.vw);
      expect(m.body, `${label}: bodybreedte ${m.body} > ${m.vw}`).toBeLessThanOrEqual(m.vw);
    };
    for (const name of ENTRY_NAMES) {
      await goTo(page, name);
      await page.waitForTimeout(80);
      await noHScroll(name);
      const row = page.locator("#lijst [data-sel-key] button.sel").first();
      if (await row.count()) {
        await row.click();
        await expect(detail(page)).toBeVisible();
        await noHScroll(name + "/detail");
        const back = detail(page).getByRole("button", { name: "Terug" });
        await expect(back).toBeVisible();
        await back.click();
        await expect(page.locator("#lijst")).toBeVisible();
      }
    }
    const tabbar = await nav(page).boundingBox();
    expect(Math.round(tabbar.width)).toBe(375);
  });
});

// =========================================================================================
test.describe("Landmarks in het Nederlands", () => {
  test("navigatie, lijst en detail zijn benoemde landmarks", async ({ page, open }) => {
    await open(buildMock());
    await expect(page.getByRole("navigation", { name: "Ingangen" })).toBeVisible();
    await expect(page.getByRole("main", { name: "Lijst" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Detail" })).toHaveCount(1);
    await goTo(page, "Inbox");
    await itemWith(page, "Budget CI-runners Q4").click({ position: { x: 60, y: 14 } });
    await actionBar(page).getByRole("button", { name: "Vraag Claude" }).click();
    await expect(page.getByRole("complementary", { name: "Vraag Claude" })).toBeVisible();
  });
});
