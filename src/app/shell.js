// Schil: drie zones (ingangen · lijst · detail), selectiemodel, actiebalk, feedbackbalk, mobiele schermen.
"use strict";
/*
 * PLUG-IN API VOOR INGANGEN (voor B2..B8)
 * =======================================
 * Een ingang is een van de vijf vaste plekken in de navigatie: vandaag, inbox, acties, werk, agenda.
 * De markup heeft per ingang een <section data-entry="<id>"> in de lijstkolom (#lijst). De schil toont
 * alleen de sectie(s) van de actieve ingang; de detailkolom (#detail) toont het geselecteerde item.
 *
 * 1. Ingang registreren (teller en lege staat):
 *      Shell.entry("inbox", {
 *        label: "Inbox",                 // naam in de navigatie
 *        count: function () { return 3; }, // teller in de navigatie ("" of 0 = geen teller)
 *        empty: "Geen mail geselecteerd.",  // tekst in de detailkolom zonder selectie (optioneel)
 *        first: function (rows) { return rows[0]; } // welke rij automatisch geselecteerd wordt (optioneel)
 *        render: function () { renderMail(); renderTeams(); } // bouwt de lijst; roept de schil aan bij wisselen
 *      });
 *    Alleen de actieve ingang heeft rijen in de DOM. Een lijstrender begint dus met de tellers bijwerken en
 *    stopt daarna met `if (!Shell.shown("inbox")) { clear(lijst); return; }`; bij wisselen roept de schil render().
 *    Tellers worden opnieuw berekend na elke Shell.changed() (Shell.row roept dat zelf aan).
 *
 * 2. Itemtype registreren (detail en actiebalk):
 *      Shell.type("mail", {
 *        label: "Mail",                                   // klein label boven de titel
 *        title: function (m) { return m.subject; },       // kop van het detail
 *        detail: function (m, body) { body.append(...) }, // vult de detailinhoud (DOM, via h())
 *        inline: function (m) { return "mail:" + m.id; }, // sleutel in inlineCards: een open invulkaart
 *                                                         // (confirmCard) komt terug als je terugkeert
 *        actions: function (m) { return [                 // actiebalk, vaste volgorde op slot:
 *          { slot: "primary", label: "Beantwoord", key: "r", title: "…", run: function (m, btn) {} },
 *          { slot: "done",    label: "Afhandelen", key: "e", run: … },     // Afhandelen / Klaar
 *          { slot: "make",    label: "Maak actie", key: "a", run: … },
 *          { slot: "ask",     label: "Vraag Claude", key: "c", run: … },
 *          { slot: "open",    label: "Open in Outlook", key: "o", href: url }, // link met ↗, nieuw tabblad
 *          { slot: "extra",   label: "Op vandaag zetten", key: "v", run: … }   // na de vaste vijf
 *        ]; }
 *      });
 *    Knoppen die niet kunnen, laat je weg (return null of geen run/href): nooit grijze knoppen.
 *    Vraag Claude (slot ask, toets c) voegt de schil zelf toe als een type hem niet levert, met als context
 *    label, titel en de tekst van het detail; eigen context via `context: function (it) { return "…"; }`,
 *    uitzetten met `ask: false`. Maximaal 5 vaste knoppen + 1 extra: wat niet op één regel past (op mobiel
 *    twee regels) gaat vanaf achteren in "Meer"; toetsen blijven werken.
 *    Elke knop krijgt tooltip "<title of label> (<key>)" en aria-keyshortcuts; de toets werkt zolang het
 *    detail zichtbaar is en je niet typt. Helpers: Shell.act.ask(type, item), Shell.act.open(url, "Outlook").
 *
 * 3. Rijen selecteerbaar maken (na het bouwen van elke <li class="row">):
 *      Shell.row(li, "mail", "mail:" + m.id, m);
 *    De sleutel is uniek binnen de ingang. Een knop met class "sel" in de rij (meestal de titel, via
 *    Shell.selTitle(tekst, srExtra)) is het toetsenbordpunt; klikken op de rij selecteert ook. Checkboxen en
 *    links in de rij blijven gewoon werken. De schil onthoudt per ingang één selectie, markeert die na elke
 *    herrendering opnieuw en rendert het detail alleen opnieuw als het item echt veranderde.
 *
 * 4. Overig: Shell.go(id), Shell.select(key), Shell.current(), Shell.showDetail(), Shell.refreshDetail(),
 *    Shell.changed(), Shell.inlineSlot(), Shell.focusSoon() (na een actie die de rij weghaalt of terugzet: focus
 *    naar de dan geselecteerde rij; actiebalk, z en de feedbackbalk doen dit zelf). Tellers: count() van de
 *    ingang vult zowel de navigatie (nc-<id>) als de kop van de lijst (cnt-<id>). Feedback: feedback({text, undo, undoLabel, countdown,
 *    onCountdownDone, link, linkLabel, note}); toets z = laatste Ongedaan maken. Voorkeuren: getPref/setPref
 *    (app/prefs.js). Het Claude-paneel (#chat) vervangt de detailkolom: openPanel()/closePanel() in claude.js.
 *    Kiest Thomas een andere rij terwijl het paneel open is, dan blijft het open en wisselt de contextkaart naar het
 *    nieuwe item via de ask-actie van dat type (panelFollow() in vraag.js); Esc of ✕ sluit en toont het detail.
 *
 * 5. Extra acties op het type van een andere module (B6/B7), zonder die module te wijzigen:
 *      Shell.extraActions("mail", function (m) { return { slot: "extra", label: "Nieuw Jira-issue", key: "i", run: … }; });
 *    fn(item) geeft één actie, een lijst of null; ze komen na de acties van het type zelf in de actiebalk.
 *    Slot "more" (voor elk type): geen knop in de balk (max 5 vaste knoppen + 1 extra), wel via de toets en de
 *    command bar. Shell.runAction(a) voert een actie uit Shell.actions() uit.
 *    Een type dat later geregistreerd wordt, krijgt ze ook. Shell.actions() geeft de acties die nu in de
 *    actiebalk staan (label, key, slot, title, el); de command bar (app/commandbar.js) gebruikt die.
 *    Shell.runPrimary() voert de primaire actie van het open detail uit (toets Enter).
 *
 * 6. Command bar (B7): een ingang mag `search: function () { return [{ key, title, hint }] }` meegeven. Dan
 *    zoekt de command bar (Ctrl+K) in die items; Enter springt naar de ingang en selecteert Shell.select(key).
 *    Zonder search() gebruikt de command bar zijn eigen bronnen (mail, Teams, Jira, Confluence, acties, agenda).
 */

// Open invulkaarten per item (bv. "mail:<id>"), blijven bestaan als je van selectie wisselt.
var inlineCards = {};

var Shell = (function () {
  var ORDER = ["vandaag", "inbox", "acties", "werk", "agenda"];
  var entries = {}, types = {}, extras = {};
  // sel: per ingang de geselecteerde sleutel; auto: selectie kwam van de schil (niet van Thomas) en volgt de eerste rij.
  var st = { entry: null, sel: {}, auto: {}, cur: null, sig: "", screen: "list", userNav: false, pending: false };
  var mqPhone = window.matchMedia("(max-width: 700px)");
  function isPhone() { return mqPhone.matches; }

  function entry(id, spec) { spec.id = id; entries[id] = spec; }
  function type(t, spec) { types[t] = spec; }
  function extraActions(t, fn) { (extras[t] = extras[t] || []).push(fn); }
  function actionsOf(t, it) {
    var spec = types[t], list = spec && spec.actions ? spec.actions(it) || [] : [];
    (extras[t] || []).forEach(function (fn) { var r = null; try { r = fn(it); } catch (e) { r = null; } list = list.concat(r || []); });
    return list;
  }

  function sections(id) { return Array.prototype.slice.call(document.querySelectorAll('#lijst section[data-entry="' + id + '"]')); }
  function navBtn(id) { return document.querySelector('#nav [data-entry="' + id + '"]'); }

  // Rijen van de actieve ingang die zichtbaar zijn (in DOM-volgorde).
  function rows(id) {
    var out = [];
    sections(id || st.entry).forEach(function (s) {
      s.querySelectorAll("[data-sel-key]").forEach(function (li) { if (li._sel && li.offsetParent !== null) out.push(li); });
    });
    return out;
  }
  function rowFor(key) {
    var list = rows();
    for (var i = 0; i < list.length; i++) if (list[i]._sel.key === key) return list[i];
    // ook onzichtbare rijen (bv. ingeklapte meldingen) van de actieve ingang
    var all = [];
    sections(st.entry).forEach(function (s) { all = all.concat(Array.prototype.slice.call(s.querySelectorAll("[data-sel-key]"))); });
    for (var j = 0; j < all.length; j++) if (all[j]._sel && all[j]._sel.key === key) return all[j];
    return null;
  }

  function selTitle(text, srExtra) {
    // aria-label i.p.v. een sr-span: een absoluut gepositioneerde span gaf een losse spatie in de naam ("Naam , mail").
    return h("button", { class: "stretch title sel", type: "button", "aria-label": srExtra ? str(text) + srExtra : null }, text);
  }

  function row(li, t, key, item) {
    li.setAttribute("data-sel-key", key);
    li._sel = { type: t, key: key, item: item };
    if (!li._selBound) {
      li._selBound = true;
      li.addEventListener("click", function (e) {
        var hit = e.target.closest("a, button, input, label, select, textarea, summary, details");
        if (hit && !hit.classList.contains("sel")) return;
        pick(li, { user: true, open: true });
      });
    }
    changed();
    return li;
  }

  // Na elke (her)rendering: selectie opnieuw markeren, item bijwerken, tellers verversen.
  function changed() {
    if (st.pending) return;
    st.pending = true;
    Promise.resolve().then(function () { st.pending = false; sync(); });
  }
  function sigOf(cur) { try { return cur.type + "|" + JSON.stringify(cur.item); } catch (e) { return String(Math.random()); } }
  function neighbor(key, old) {
    old = old || [];
    var i = old.indexOf(key);
    if (i < 0) return null;
    for (var a = i + 1; a < old.length; a++) { var n = rowFor(old[a]); if (n) return n; }
    for (var b = i - 1; b >= 0; b--) { var p = rowFor(old[b]); if (p) return p; }
    return null;
  }
  function sync() {
    renderCounts();
    if (!st.entry) return;
    try { syncSel(); } finally { checkFocus(); }
  }
  function syncSel() {
    var keysNow = rows().map(function (r) { return r._sel.key; });
    var lastKeys = st.lastKeys;
    if (keysNow.length) st.lastKeys = keysNow;
    var key = st.sel[st.entry];
    var li = key ? rowFor(key) : null;
    document.querySelectorAll("#lijst .row.is-sel").forEach(function (r) { if (r !== li) mark(r, false); });
    if (li && st.auto[st.entry] && !isPhone()) {
      var spec0 = entries[st.entry] || {}, list0 = rows();
      var want = list0.length ? (spec0.first ? spec0.first(list0) : list0[0]) : null;
      if (want && want !== li) { pick(want, { auto: true }); return; }
    }
    if (li) {
      mark(li, true);
      var cur = { entry: st.entry, type: li._sel.type, key: key, item: li._sel.item };
      var sig = sigOf(cur);
      if (!st.cur || st.cur.key !== key || sig !== st.sig) { st.cur = cur; st.sig = sig; renderDetail(); }
      else st.cur.item = cur.item;
      return;
    }
    if (key && st.cur && st.cur.key === key && st.cur.entry === st.entry) {
      // Geselecteerd item verdween (afgehandeld, uit de lijst): naar de volgende rij, anders de vorige.
      var next = neighbor(key, lastKeys);
      if (next) { pick(next, {}); return; }
    }
    autoSelect();
  }
  function mark(li, on) {
    li.classList.toggle("is-sel", on);
    var b = li.querySelector(".sel");
    if (b) { if (on) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current"); }
  }
  function autoSelect() {
    var list = rows();
    var spec = entries[st.entry] || {};
    if (!list.length || isPhone()) {
      if (st.cur && st.cur.entry === st.entry && !rowFor(st.cur.key)) { st.cur = null; st.sig = ""; st.sel[st.entry] = null; renderDetail(); }
      else if (!st.cur || st.cur.entry !== st.entry) { st.cur = null; st.sig = ""; renderDetail(); }
      return;
    }
    var li = spec.first ? spec.first(list) : list[0];
    if (li) pick(li, { auto: true });
  }

  // Selecteer een rij. opts.user: door Thomas (klik/j/k): opent op mobiel het detail; staat het Claude-paneel open,
  // dan blijft het open en volgt de contextkaart de nieuwe selectie (panelFollow in vraag.js).
  function pick(li, opts) {
    opts = opts || {};
    var s = li._sel; if (!s) return;
    st.sel[st.entry] = s.key;
    st.auto[st.entry] = !!opts.auto;
    var cur = { entry: st.entry, type: s.type, key: s.key, item: s.item };
    var same = st.cur && st.cur.key === s.key && st.cur.entry === st.entry;
    st.cur = cur; st.sig = sigOf(cur);
    document.querySelectorAll("#lijst .row.is-sel").forEach(function (r) { if (r !== li) mark(r, false); });
    mark(li, true);
    if (!same || opts.user) renderDetail();
    checkFocus();
    if (opts.user) {
      if (!$("chat").hidden) panelFollow(); // B8: paneel blijft open, de contextkaart volgt de selectie
      if (opts.focus) { var b = li.querySelector(".sel"); if (b) b.focus({ preventScroll: true }); }
      if (opts.scroll) li.scrollIntoView({ block: "nearest" });
      if (opts.open && isPhone()) showScreen("detail");
    }
  }
  // Na een tabwissel: staat de selectie niet meer in beeld, dan de eerste zichtbare rij.
  function revalidate() {
    var key = st.sel[st.entry], list = rows();
    if (list.some(function (r) { return r._sel.key === key; })) return;
    if (list.length && !isPhone()) pick(list[0], { auto: true });
  }
  function select(key, opts) { var li = rowFor(key); if (li) pick(li, opts || { user: true }); return !!li; }
  function move(delta) {
    var list = rows(); if (!list.length) return;
    var key = st.sel[st.entry], i = -1;
    for (var k = 0; k < list.length; k++) if (list[k]._sel.key === key) { i = k; break; }
    var n = i < 0 ? (delta > 0 ? 0 : list.length - 1) : Math.max(0, Math.min(list.length - 1, i + delta));
    pick(list[n], { user: true, focus: true, scroll: true });
  }

  // ---- Detail en actiebalk ----
  var SLOTS = ["primary", "done", "make", "ask", "open", "extra", "more"];
  var curActions = [];
  function inlineSlot() { return $("detailInline"); }
  // Mobiel: een invulkaart in de detailkolom (Reageer, Status, concept, formulier) mag niet achter de sticky
  // actiebalk vallen. Na openen, en als hij groeit terwijl je erin werkt, scrollt de pagina tot zijn onderkant
  // vrij boven de balk staat (de bovenkant blijft in beeld). Zie ook scroll-padding-bottom in shell.css.
  function keepInlineVisible(force) {
    if (!isPhone() || st.screen !== "detail") return;
    var slot = $("detailInline"), bar = $("abar"), card = slot.lastElementChild;
    if (!card || (!force && !slot.contains(document.activeElement))) return;
    var r = card.getBoundingClientRect();
    var barTop = bar.hidden || !bar.offsetParent ? window.innerHeight : bar.getBoundingClientRect().top;
    var over = r.bottom - (barTop - 8);
    if (over > 0) window.scrollBy(0, Math.min(over, Math.max(0, r.top - 8)));
  }
  try {
    new MutationObserver(function () { requestAnimationFrame(function () { keepInlineVisible(true); }); }).observe($("detailInline"), { childList: true });
    if (window.ResizeObserver) new ResizeObserver(function () { keepInlineVisible(false); }).observe($("detailInline"));
  } catch (e) { /* oudere browser: alleen scroll-padding */ }
  function renderDetail() {
    var body = clear($("detailBody")), bar = clear($("abar")), slot = clear($("detailInline"));
    curActions = [];
    var cur = st.cur;
    var spec = cur && types[cur.type];
    $("detailView").classList.toggle("is-empty", !spec);
    if (!spec) {
      var e = entries[st.entry] || {};
      bar.hidden = true;
      body.append(h("div", { class: "detail-empty" },
        h("p", { text: e.empty || "Kies links een item om het hier te openen." }),
        h("p", { class: "hint", text: "Met j en k of de pijltjes loop je door de lijst." })));
      return;
    }
    var it = cur.item;
    var acts = actionsOf(cur.type, it).filter(Boolean);
    if (spec.ask !== false && !acts.some(function (a) { return a.slot === "ask"; })) acts.push(askDefault(cur.type, spec));
    acts = acts.filter(function (a) { return a && (a.run || safeUrl(a.href)); });
    acts.sort(function (a, b) { return SLOTS.indexOf(a.slot || "extra") - SLOTS.indexOf(b.slot || "extra"); });
    // slot "more": geen knop (de balk past zo op één regel), wel bereikbaar met de toets en via de command bar.
    var more = acts.filter(function (a) { return a.slot === "more" && a.run; });
    acts = acts.filter(function (a) { return a.slot !== "more"; });
    bar.hidden = !acts.length;
    acts.forEach(function (a) {
      var tip = (a.title || a.label) + (a.key ? " (" + a.key + ")" : "");
      var el;
      if (a.href) {
        el = h("a", { class: "btn", href: a.href, target: "_blank", rel: "noopener noreferrer", title: tip, "aria-keyshortcuts": a.key || null, "data-slot": a.slot || "extra" },
          a.label, h("span", { "aria-hidden": "true", text: " ↗" }), h("span", { class: "sr", text: " (opent in nieuw tabblad)" }));
        el.addEventListener("click", function () { logEvent("detail_open_" + cur.type); });
      } else {
        el = h("button", { class: "btn" + (a.slot === "primary" ? " primary" : ""), type: "button", title: tip, "aria-keyshortcuts": a.key || null, "data-slot": a.slot || "extra", text: a.label });
        el.addEventListener("click", function () { if (st.cur) st.auto[st.cur.entry] = false; focusSoon(); a.run(st.cur ? st.cur.item : it, el); });
      }
      a.el = el;
      curActions.push(a);
      bar.append(el);
    });
    more.forEach(function (a) { a.el = null; curActions.push(a); });
    body.append(h("p", { class: "detail-type", text: spec.label || "" }), h("h2", { class: "detail-title", id: "detailTitle", text: spec.title ? spec.title(it) : "" }));
    if (spec.detail) spec.detail(it, body);
    var ik = spec.inline ? spec.inline(it) : null;
    if (ik && inlineCards[ik]) slot.append(inlineCards[ik]);
    $("detailView").scrollTop = 0;
    fitBar();
  }
  // Vraag Claude voor elk type: context = label, titel en de zichtbare tekst van het detail (of spec.context).
  function askDefault(t, spec) {
    if (!cap.sample) return null;
    return { slot: "ask", label: "Vraag Claude", key: "c", title: "Vraag Claude over dit item", run: function (x, btn) {
      var title = spec.title ? spec.title(x) : "";
      var text = spec.context ? spec.context(x) : [spec.label || "Item", title, ($("detailBody").innerText || "").split("\n").slice(2).join("\n")].join("\n");
      openAsk("item", { title: title, context: trunc(text, 4000).replace(/ \n/g, "\n") }, btn);
    } };
  }
  // Actiebalk op één regel (mobiel: twee): extra knoppen die niet passen gaan vanaf achteren in "Meer".
  // Acties met slot "more" (geen eigen knop) staan altijd in "Meer", met hun toets erbij: zo vindt wie alleen klikt ze ook.
  var moreOpen = false;
  function fitBar() {
    var bar = $("abar");
    var old = bar.querySelector(".abar-more");
    if (old) { old.querySelectorAll("[data-slot]").forEach(function (x) { bar.insertBefore(x, old); }); old.remove(); }
    if (bar.hidden || !bar.offsetParent) return;
    var first = bar.firstElementChild; if (!first) return;
    var lineH = first.offsetHeight, maxRows = isPhone() ? 2 : 1;
    var fits = function () { return bar.scrollHeight - parseFloat(getComputedStyle(bar).paddingTop) - parseFloat(getComputedStyle(bar).paddingBottom) <= lineH * maxRows + 6 * (maxRows - 1) + 2; };
    var moreActs = curActions.filter(function (a) { return a.slot === "more" && a.run && !a.el; });
    if (fits() && !moreActs.length) return;
    var menu = h("div", { class: "abar-menu", role: "menu", "aria-label": "Meer acties", hidden: !moreOpen });
    var btn = h("button", { class: "btn", type: "button", "aria-haspopup": "menu", "aria-expanded": moreOpen ? "true" : "false", "aria-label": "Meer acties", title: "Meer acties" }, "Meer", h("span", { "aria-hidden": "true", text: " ▾" }));
    var wrap = h("div", { class: "abar-more" }, btn, menu);
    btn.addEventListener("click", function () { moreOpen = menu.hidden; menu.hidden = !moreOpen; btn.setAttribute("aria-expanded", moreOpen ? "true" : "false"); if (moreOpen) { var f = menu.querySelector("button, a"); if (f) f.focus(); } });
    menu.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); moreOpen = false; menu.hidden = true; btn.setAttribute("aria-expanded", "false"); btn.focus(); } });
    bar.append(wrap);
    moreActs.forEach(function (a) {
      menu.append(h("button", { class: "btn", type: "button", role: "menuitem", title: (a.title || a.label) + (a.key ? " (" + a.key + ")" : ""), "aria-keyshortcuts": a.key || null,
        text: a.label + (a.key ? " (" + a.key + ")" : ""), onclick: function () { closeMore(); runAction(a); } }));
    });
    var extras = Array.prototype.filter.call(bar.children, function (x) { return x.getAttribute && x.getAttribute("data-slot") === "extra"; });
    while (extras.length && !fits()) { var x = extras.pop(); x.setAttribute("role", "menuitem"); menu.insertBefore(x, menu.firstChild); }
    if (!menu.firstChild) wrap.remove();
  }
  function closeMore() { var m = document.querySelector("#abar .abar-menu"); if (m && !m.hidden) { moreOpen = false; m.hidden = true; var b = m.previousSibling; if (b) b.setAttribute("aria-expanded", "false"); return true; } return false; }
  var fitTimer = null;
  window.addEventListener("resize", function () { clearTimeout(fitTimer); fitTimer = setTimeout(fitBar, 100); });
  document.addEventListener("click", function (e) { if (!e.target.closest(".abar-more")) closeMore(); });

  // Focus na een actie die de rij weghaalt of terugzet (e, z, afvinken): naar de dan geselecteerde rij, niet body.
  var wantFocus = 0, lastFocus = null;
  // Onthoud of de focus in de lijst, de actiebalk of de feedbackbalk stond: verdwijnt dat element bij een
  // herrendering, dan komt de focus terug op de geselecteerde rij.
  document.addEventListener("focusin", function (e) { var t = e.target; lastFocus = t && t.closest && t.closest("#lijst .row, #abar, #feedback") ? t : null; });
  function focusSoon() { wantFocus = Date.now(); setTimeout(checkFocus, 50); setTimeout(checkFocus, 400); }
  function focusLost() { var a = document.activeElement; return !a || a === document.body || a === document.documentElement || !document.contains(a); }
  function checkFocus() {
    var fromRemoved = lastFocus && !document.contains(lastFocus);
    if (wantFocus && Date.now() - wantFocus > 1500) wantFocus = 0;
    if (!wantFocus && !fromRemoved) return;
    if (!focusLost()) { if (!fromRemoved) wantFocus = 0; return; }
    var target = null;
    if (isPhone() && st.screen === "detail") target = $("abar").querySelector("button, a") || $("detailBack");
    else { var key = st.sel[st.entry], li = key && rowFor(key); target = li && li.querySelector(".sel"); }
    if (target && target.offsetParent !== null) { target.focus({ preventScroll: true }); wantFocus = 0; lastFocus = target; }
  }
  // Esc in een tekstveld van de pagina: veld verlaten, focus terug naar de geselecteerde rij (sneltoetsen werken weer).
  function leaveField(el) {
    if (el && el.blur) el.blur();
    var key = st.sel[st.entry], li = key && rowFor(key), b = li && li.querySelector(".sel");
    if (isPhone() && st.screen === "detail") b = $("abar").querySelector("button, a") || $("detailBack");
    if (b && b.offsetParent !== null) b.focus({ preventScroll: true });
    else { var l = $("lijst"); l.focus({ preventScroll: true }); }
  }
  function paneOpen() { return $("detailView").classList.contains("has-pane"); }
  function runPrimary() {
    if (!$("chat").hidden || !st.cur || paneOpen()) return false;
    for (var i = 0; i < curActions.length; i++) {
      var a = curActions[i];
      if (a.slot === "primary" && a.el && document.contains(a.el)) { a.el.click(); return true; }
    }
    return false;
  }
  function refreshDetail() { if (st.cur) st.sig = sigOf(st.cur); renderDetail(); }
  function runKey(k) {
    if (!$("chat").hidden || !st.cur || paneOpen()) return false;
    if (isPhone() && st.screen !== "detail") return false;
    for (var i = 0; i < curActions.length; i++) {
      var a = curActions[i];
      if (a.key === k && a.el && document.contains(a.el)) { closeMore(); a.el.click(); return true; }
      if (a.key === k && a.slot === "more" && a.run) { runAction(a); return true; }
    }
    return false;
  }
  // Voer een actie uit de actiebalk uit (knop klikken, of bij slot "more" direct run).
  function runAction(a) {
    if (!a) return false;
    if (a.el && document.contains(a.el)) { a.el.click(); return true; }
    if (a.run && st.cur) { st.auto[st.cur.entry] = false; a.run(st.cur.item, null); return true; }
    return false;
  }

  // ---- Ingangen ----
  function go(id, opts) {
    opts = opts || {};
    if (!entries[id]) return;
    if (opts.user) { st.userNav = true; if (id !== st.entry) { setLocalPref("lastEntry", "actiepagina.ingang", id); logEvent("ingang_" + id); } }
    var prev = st.entry;
    st.entry = id;
    ORDER.forEach(function (x) {
      var on = x === id;
      sections(x).forEach(function (s) { s.hidden = !on; });
      var b = navBtn(x); if (b) { if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); }
    });
    // Alleen de actieve ingang heeft rijen in de DOM: nu renderen.
    [prev !== id ? prev : null, id].forEach(function (x) { // vorige ingang leegmaken, nieuwe renderen
      if (x && entries[x] && entries[x].render) { try { entries[x].render(); } catch (e) { try { console.warn(e); } catch (y) { /* */ } } }
    });
    document.body.setAttribute("data-entry", id);
    if (isPhone()) showScreen("list");
    $("lijst").scrollTop = 0;
    st.cur = null; st.sig = "";
    var key = st.sel[id];
    if (!(key && select(key, { auto: !!st.auto[id] }))) autoSelect();
    if (opts.focus) { var h2 = sections(id)[0]; if (h2) { h2.setAttribute("tabindex", "-1"); h2.focus({ preventScroll: true }); } }
  }
  function renderCounts() {
    ORDER.forEach(function (id) {
      var e = entries[id], el = document.getElementById("nc-" + id);
      if (!e || !el) return;
      var n = "";
      try { n = e.count ? e.count() : ""; } catch (x) { n = ""; }
      el.textContent = n ? String(n) : "";
      var head = document.getElementById("cnt-" + id); // kop van de lijst telt hetzelfde als de navigatie
      if (head) head.textContent = n ? String(n) : "";
    });
  }

  // ---- Mobiel: lijst en detail als twee schermen ----
  var listScroll = 0;
  function showScreen(s) {
    if (!isPhone()) { st.screen = "list"; document.body.classList.remove("m-detail"); return; }
    if (s === st.screen) return;
    if (s === "detail") listScroll = window.scrollY;
    st.screen = s;
    document.body.classList.toggle("m-detail", s === "detail");
    if (s === "detail") { window.scrollTo(0, 0); fitBar(); }
    else window.scrollTo(0, listScroll);
  }
  function showDetail() { if (isPhone()) showScreen("detail"); }
  function back() {
    if (!$("chat").hidden) closePanel();
    showScreen("list");
    var key = st.sel[st.entry], li = key && rowFor(key);
    var b = li && li.querySelector(".sel");
    if (b) b.focus({ preventScroll: true });
  }
  try { mqPhone.addEventListener("change", function () { if (!isPhone()) showScreen("list"); }); } catch (e) { /* oudere browser */ }

  function init() {
    document.querySelectorAll("#nav [data-entry]").forEach(function (b) {
      b.addEventListener("click", function () { go(b.getAttribute("data-entry"), { user: true }); });
    });
    $("detailBack").addEventListener("click", back);
    var start = null;
    try { start = localStorage.getItem("actiepagina.ingang"); } catch (e) { /* geen opslag */ }
    go(entries[start] ? start : "vandaag");
  }
  // Voorkeur uit db (ander apparaat of lege lokale opslag): alleen als die nieuwer is en Thomas nog niet zelf navigeerde.
  function restore(id) { if (!st.userNav && entries[id] && id !== st.entry && remoteIsNewer("lastEntry", "actiepagina.ingang")) go(id); }

  var act = {
    ask: function (t, it) { return { slot: "ask", label: "Vraag Claude", key: "c", title: "Vraag Claude over dit item", run: cap.sample ? function (x, btn) { openAsk(t, x, btn); } : null }; },
    open: function (url, where) { return { slot: "open", label: "Open in " + where, key: "o", href: safeUrl(url) }; }
  };

  return { ORDER: ORDER, entry: entry, type: type, row: row, selTitle: selTitle, changed: changed, go: go, select: select, move: move,
    current: function () { return st.cur; }, active: function () { return st.entry; }, shown: function (id) { return st.entry === id; }, isPhone: isPhone, showDetail: showDetail, back: back,
    focusSoon: focusSoon, leaveField: leaveField, closeMore: closeMore,
    screen: function () { return st.screen; }, refreshDetail: refreshDetail, revalidate: revalidate, inlineSlot: inlineSlot, runKey: runKey, init: init, restore: restore,
    act: act, renderCounts: renderCounts, extraActions: extraActions, runPrimary: runPrimary, runAction: runAction,
    actions: function () { return st.cur ? curActions.slice() : []; }, entrySpec: function (id) { return entries[id] || null; },
    typeSpec: function (t) { return types[t] || null; } };
})();

// ---------- Feedbackbalk: één balk onderaan voor alles ----------
// feedback({text, undo?: fn, undoLabel?, countdown?: seconden, onCountdownDone?: fn, link?, linkLabel?, note?,
//           action?: {label, title?, run}, undoText?})  action: een tweede knop in de app zelf (bv. "Bekijk": naar het nieuwe item).
// Na Ongedaan maken / Annuleer zegt de balk wat nu waar is: undoText ("Terug op de lijst: …"), anders "Ongedaan gemaakt"
// (bij een uitstel "Geannuleerd"). Roept de undo zelf feedback() aan, dan wint die melding.
// Toont "✓ <text> · <undoLabel> (Ns) · Bekijk ↗". Geeft {update(opts), close()} terug. Toets z = undo.
// Met countdown is undo een annuleer-knop: onCountdownDone loopt na N seconden (bv. mail echt versturen),
// of direct als er een nieuwe melding komt of de balk gesloten wordt (een uitstel wordt nooit stil geannuleerd).
var fb = { cur: null, timer: null, tick: null };
function feedback(o) {
  var box = $("feedback");
  var prev = fb.cur;
  if (prev && prev.countdown && !prev.settled) { prev.settled = true; try { if (prev.onCountdownDone) prev.onCountdownDone(); } catch (e) { /* */ } }
  clearTimeout(fb.timer); clearInterval(fb.tick);
  var cur = { text: o.text, undo: o.undo || null, undoLabel: o.undoLabel || (o.countdown ? "Annuleer" : "Ongedaan maken"),
    countdown: o.countdown || 0, left: o.countdown || 0, onCountdownDone: o.onCountdownDone || null, link: safeUrl(o.link), linkLabel: o.linkLabel || "Bekijk",
    note: o.note || "", settled: false, icon: o.icon == null ? "✓" : o.icon, btn: null,
    action: o.action && typeof o.action.run === "function" ? o.action : null,
    undoText: o.undoText || (o.countdown ? "Geannuleerd" : "Ongedaan gemaakt") };
  fb.cur = cur;
  function label() { return cur.undoLabel + (cur.countdown && !cur.settled ? " (" + cur.left + "s)" : ""); }
  function paint() {
    var hadFocus = cur.btn && document.activeElement === cur.btn;
    clear(box);
    box.hidden = false;
    box.append(h("span", { class: "fb-text" }, cur.icon ? h("span", { "aria-hidden": "true", text: cur.icon + " " }) : null, cur.text));
    cur.btn = null;
    if (cur.undo && !cur.settled) {
      cur.btn = h("button", { class: "btn text", type: "button", title: cur.undoLabel + " (z)", "aria-keyshortcuts": "z", text: label(), onclick: runUndo });
      box.append(h("span", { class: "fb-sep", "aria-hidden": "true", text: "·" }), cur.btn);
    }
    if (cur.link) box.append(h("span", { class: "fb-sep", "aria-hidden": "true", text: "·" }), extLink(cur.link, cur.linkLabel, "btn text"));
    if (cur.action) box.append(h("span", { class: "fb-sep", "aria-hidden": "true", text: "·" }),
      h("button", { class: "btn text", type: "button", title: cur.action.title || cur.action.label, text: cur.action.label, onclick: function () { var a = cur.action; try { a.run(); } catch (e) { /* */ } } }));
    box.append(h("button", { class: "icon-btn fb-close", type: "button", "aria-label": "Melding sluiten", title: "Sluiten", text: "✕", onclick: close }));
    if (cur.note) box.append(h("span", { class: "fb-note", text: cur.note }));
    if (hadFocus && cur.btn) cur.btn.focus();
    fbSpace();
  }
  // Mobiel: de balk zweeft boven de tabbalk; de pagina houdt er ruimte voor vrij (--fb-h), zodat hij niets bedekt.
  function fbSpace() { document.documentElement.style.setProperty("--fb-h", box.hidden ? "0px" : (box.offsetHeight + 8) + "px"); document.body.classList.toggle("fb-open", !box.hidden); }
  function runUndo() {
    if (!cur.undo || cur.settled) return;
    cur.settled = true;
    clearInterval(fb.tick);
    var u = cur.undo; cur.undo = null;
    Shell.focusSoon();
    cur.text = cur.undoText; cur.icon = "✓"; cur.action = null; cur.link = null;
    paint();
    try { u(); } catch (e) { /* */ }
    if (fb.cur === cur) hideLater(4000);
  }
  function close() {
    if (fb.cur !== cur) return;
    if (cur.countdown && !cur.settled) { cur.settled = true; try { if (cur.onCountdownDone) cur.onCountdownDone(); } catch (e) { /* */ } }
    box.hidden = true; clear(box); fb.cur = null; clearTimeout(fb.timer); clearInterval(fb.tick);
    fbSpace();
  }
  function hideLater(ms) {
    clearTimeout(fb.timer);
    fb.timer = setTimeout(function () { if (fb.cur !== cur) return; if (box.contains(document.activeElement) || box.matches(":hover")) hideLater(3000); else close(); }, ms);
  }
  cur.runUndo = runUndo;
  paint();
  if (cur.countdown) {
    fb.tick = setInterval(function () {
      if (fb.cur !== cur || cur.settled) { clearInterval(fb.tick); return; }
      cur.left--;
      if (cur.left > 0) { if (cur.btn) cur.btn.textContent = label(); return; }
      clearInterval(fb.tick); cur.settled = true; cur.undo = null;
      try { if (cur.onCountdownDone) cur.onCountdownDone(); } catch (e) { /* */ }
      paint(); hideLater(4000);
    }, 1000);
  } else hideLater(cur.undo ? 10000 : 5000);
  return {
    update: function (p) { if (fb.cur !== cur) return; for (var k in p) cur[k] = k === "link" ? safeUrl(p[k]) : p[k]; paint(); },
    close: close
  };
}
function undoLast() { var c = fb.cur; if (c && c.undo && !c.settled && c.runUndo) { c.runUndo(); return true; } return false; }
