// B7: command bar (Ctrl+K of /). Eén invoer, geen modus: navigeren, uitvoeren en vragen aan Claude.
// Max 7 suggesties met de sneltoets rechts; de laatste is altijd "Vraag Claude: <tekst>" (typen kan nooit fout zijn).
// Uitvoeren haalt de acties van het geselecteerde item uit de schil (Shell.actions(), ook slot "more" en wat
// andere modules via Shell.extraActions toevoegen). Items komen uit entry.search() als een ingang die heeft,
// anders uit de geladen bronnen. Een vraag gaat als Thomas' eigen getypte vraag naar Claude (taakmodus, budget 5),
// met het geselecteerde item als context.
"use strict";

var cmd = { el: null, input: null, list: null, opener: null, opts: [], active: 0, q: "" };
var CMD_MAX = 7;
var CMD_ENTRIES = [
  { id: "vandaag", label: "Vandaag", key: "1", words: ["start", "nu", "dag", "today"] },
  { id: "inbox", label: "Inbox", key: "2", words: ["mail", "teams", "post", "berichten", "chat"] },
  { id: "acties", label: "Acties", key: "3", words: ["taken", "todo", "to-do", "lijst", "paf"] },
  { id: "werk", label: "Werk", key: "4", words: ["jira", "confluence", "issues", "wiki", "pagina's"] },
  { id: "agenda", label: "Agenda", key: "5", words: ["kalender", "afspraken", "planning", "vergaderingen", "morgen"] }
];
// Synoniemen per toets, zodat "afhandelen", "beantwoord" of "reageer" de actie van het item vinden.
var CMD_SYN = {
  r: ["beantwoord", "beantwoorden", "antwoord", "reageer", "reageren", "reply"], e: ["afhandelen", "afvinken", "klaar", "gedaan", "done", "weg"],
  a: ["maak actie", "actie maken", "taak"], c: ["vraag claude", "claude"], o: ["open", "openen", "bekijk"], s: ["status", "transitie", "zet op"],
  t: ["toewijzen", "assign", "aan mij"], i: ["nieuw jira-issue", "jira issue", "ticket", "bug"], l: ["lees", "lezen"], b: ["bereid voor", "voorbereiden"],
  v: ["vandaag", "op vandaag"], x: ["vervallen", "laten vervallen"]
};

function cmdNorm(s) { return str(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036F]/g, "").replace(/\s+/g, " ").trim(); }
function cmdSubseq(q, s) { var j = 0; for (var i = 0; i < s.length && j < q.length; i++) if (s.charAt(i) === q.charAt(j)) j++; return j === q.length; }
// Score 0..100: exact, begin, woordbegin, bevat, alle woorden; kort en losjes (subreeks) alleen voor commando's.
function cmdScore(q, c) {
  var best = 0, fields = [c.label].concat(c.words || []);
  for (var i = 0; i < fields.length; i++) {
    var n = cmdNorm(fields[i]); if (!n) continue;
    var s = 0, cap100 = i === 0 ? 100 : 90;
    if (n === q) s = cap100;
    else if (n.indexOf(q) === 0) s = 80;
    else if (n.split(/[\s\-\/:·,.()]+/).some(function (w) { return w && w.indexOf(q) === 0; })) s = 65;
    else if (n.indexOf(q) >= 0) s = 45;
    else if (q.indexOf(" ") > 0 && q.split(" ").every(function (t) { return n.indexOf(t) >= 0; })) s = 35;
    else if (c.kind !== "item" && q.length >= 2 && q.length <= 6 && cmdSubseq(q, n)) s = 12;
    if (c.kind === "item" && i > 0) s = Math.min(s, 40); // afzender/sleutel telt, maar minder dan de titel
    if (s > best) best = s;
  }
  if (!best) return 0;
  return best + ({ nav: 8, act: 6, gen: 4, item: 0 }[c.kind] || 0);
}

// ---------- Kandidaten ----------
function cmdCurTitle() {
  var cur = Shell.current(), spec = cur && Shell.typeSpec(cur.type);
  if (!cur || !spec) return "";
  try { return str(spec.title ? spec.title(cur.item) : ""); } catch (e) { return ""; }
}
function cmdNav() {
  return CMD_ENTRIES.map(function (e) {
    return { kind: "nav", tag: "Ga naar", label: e.label, key: e.key, words: e.words, run: function () { Shell.go(e.id, { user: true, focus: true }); } };
  });
}
function cmdItemActions() {
  var cur = Shell.current(); if (!cur) return [];
  var spec = Shell.typeSpec(cur.type) || {}, title = cmdCurTitle();
  return Shell.actions().map(function (a) {
    return { kind: "act", tag: "Doen", label: a.label, hint: (spec.label ? spec.label + ": " : "") + trunc(title, 60), key: a.key || "",
      words: (CMD_SYN[a.key] || []).concat(a.title ? [a.title] : []), action: a,
      run: function () {
        if (Shell.isPhone() && Shell.screen() !== "detail" && !a.href) Shell.showDetail();
        Shell.runAction(a);
      } };
  });
}
function cmdGeneral(itemActs) {
  var has = function (label) { return itemActs.some(function (x) { return x.label === label; }); };
  var out = [];
  out.push({ kind: "gen", tag: "Doen", label: "Nieuwe actie", key: "n", words: ["actie toevoegen", "taak", "todo", "to-do"], run: function () {
    newActie(); // B5: formulier bovenaan het detail van Acties, focus in het tekstveld
  } });
  if (typeof window.planMeeting === "function") out.push({ kind: "gen", tag: "Doen", label: "Plan een vergadering", key: "p", words: ["vergadering", "meeting", "inplannen", "afspraak plannen", "overleg"], run: function () { window.planMeeting(); } });
  if (cap.mcp && typeof newJiraIssueFromSelection === "function" && !has("Nieuw Jira-issue")) out.push({ kind: "gen", tag: "Doen", label: "Nieuw Jira-issue", key: "", words: ["jira issue", "ticket", "bug", "story"], run: function () { newJiraIssueFromSelection(); } });
  out.push({ kind: "gen", tag: "Doen", label: "Ververs alles", key: "Shift R", words: ["verversen", "vernieuwen", "refresh", "herladen", "opnieuw laden"], run: function () { logEvent("ververs_alles"); refreshAll(); } });
  var next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  out.push({ kind: "gen", tag: "Doen", label: "Thema wisselen", hint: "nu " + THEME_LABEL[theme] + ", daarna " + THEME_LABEL[next], key: "", words: ["thema", "donker", "licht", "forest", "dark mode", "kleur"], run: function () { $("themeBtn").click(); } });
  if (fb.cur && fb.cur.undo && !fb.cur.settled) out.push({ kind: "gen", tag: "Doen", label: "Ongedaan maken", hint: trunc(fb.cur.text, 50), key: "z", words: ["undo", "terug", "herstel"], run: function () { undoLast(); } });
  out.push({ kind: "gen", tag: "Hulp", label: "Sneltoetsen", key: "?", words: ["toetsen", "help", "hulp", "overzicht", "shortcuts"], run: function () { openKeys(); } });
  return out;
}
// Items uit de geladen lijsten (of entry.search()). tab: de tab binnen de ingang, als die er is.
function cmdItems() {
  var out = [];
  function push(entry, tab, src, key, label, hint, words) { out.push({ kind: "item", tag: src, label: label, hint: hint, entry: entry, tab: tab, selKey: key, words: words || [] }); }
  var searched = {};
  Shell.ORDER.forEach(function (id) {
    var sp = Shell.entrySpec(id);
    if (!sp || typeof sp.search !== "function") return;
    searched[id] = true;
    try { (sp.search() || []).forEach(function (x) { if (x && x.key) push(id, x.tab || null, x.tag || sp.label || id, x.key, str(x.title), str(x.hint), x.words); }); } catch (e) { /* ingang zonder zoekresultaat */ }
  });
  if (!searched.inbox) {
    if (S.mail.hasData) S.mail.items.forEach(function (m) { if (m && m.id && !isHandled(m)) push("inbox", "mail", "Mail", "mail:" + str(m.id), str(m.subject) || "(geen onderwerp)", "van " + nameFromAddr(m.sender || m.from), [nameFromAddr(m.sender || m.from)]); });
    if (S.teams.hasData) S.teams.items.forEach(function (t) { if (t && t.id) push("inbox", "teams", "Teams", "teams:" + str(t.id), trunc(t.summary || t.body, 70) || "Teams-bericht", "van " + teamsFrom(t), [teamsFrom(t)]); });
  }
  if (!searched.werk) {
    if (S.jira.hasData) S.jira.items.forEach(function (i) { if (i && i.key) push("werk", "jira", "Jira", "jira:" + str(i.key), str(i.key) + " " + str(i.fields && i.fields.summary), str(i.fields && i.fields.status && i.fields.status.name), [str(i.key)]); });
    if (S.conf.hasData) S.conf.items.forEach(function (p) { if (p && (p.id || p.title)) push("werk", "conf", "Pagina", "conf:" + str(p.id || p.title), str(p.title) || "(zonder titel)", str(p.space && (p.space.name || p.space.key)), []); });
  }
  if (!searched.acties && cap.db && acties.loaded) actieList().forEach(function (a) { if (a && a.id && a.status === "open") push("acties", null, "Actie", "actie:" + a.id, str(a.text), str(a.prog), [str(a.who)]); });
  if (!searched.agenda && S.cal.hasData) calEvents().forEach(function (e) {
    var it = e.it, subj = str(it.subject);
    push("agenda", null, "Afspraak", "event:" + str(it.id || subj + e.start.getTime()), subj || "(geen onderwerp)", e.allDay ? "hele dag" : hhmm(e.start), []);
  });
  return out;
}
function cmdJump(c) {
  Shell.go(c.entry, { user: true });
  var tabEl = c.tab ? $("tab-" + c.tab) : null;
  if (tabEl && tabEl.getAttribute("aria-selected") !== "true") tabEl.click();
  var opts = { user: true, open: true, focus: true, scroll: true };
  if (Shell.select(c.selKey, opts)) return;
  var src = c.tab || c.entry; // lijst ingekort (Toon alle): uitklappen en opnieuw
  if (typeof expanded === "object" && !expanded[src]) { expanded[src] = true; Shell.go(c.entry); if (tabEl && tabEl.getAttribute("aria-selected") !== "true") tabEl.click(); Shell.select(c.selKey, opts); }
}
function cmdAskOption(q) {
  if (!cap.sample) return null;
  var title = cmdCurTitle();
  return { kind: "ask", tag: "", label: q ? "Vraag Claude: " + q : "Vraag Claude", hint: q ? (title ? "over " + trunc(title, 50) : "") : "algemene vraag, zonder item", key: "", run: function () { cmdAsk(q); } };
}
// Een vraag van Thomas zelf: Claude-paneel met het geselecteerde item als context, dan versturen.
function cmdAsk(text) {
  if (!text) { openClaude(cmd.opener); return; }
  logEvent("commandbar_vraag");
  var cur = Shell.current();
  var ask = Shell.actions().filter(function (a) { return a.slot === "ask" && a.run; })[0];
  if (!$("chat").hidden) openPanel(); // gesprek loopt al: vervolgvraag, context blijft zoals hij is
  else if (cur && ask) ask.run(cur.item, null);
  else if (cur && ASK_NOUN[cur.type]) openAsk(cur.type, cur.item, null);
  else openPanel(cmd.opener);
  if (chat.busy) { chatInput.value = text; chatInput.focus(); announce("Claude is nog bezig. Je vraag staat klaar in het invoerveld."); return; }
  userAsk(text);
}

// ---------- Suggesties bouwen ----------
function cmdBuild(raw) {
  var q = cmdNorm(raw);
  var acts = cmdItemActions(), gen = cmdGeneral(acts), list;
  if (!q) {
    list = acts.slice(0, 6).concat(gen).slice(0, CMD_MAX - (cap.sample ? 1 : 0)); // eerst alle acties van het item
  } else {
    var all = cmdNav().concat(acts, gen, cmdItems());
    all.forEach(function (c) { c.score = cmdScore(q, c); });
    list = all.filter(function (c) { return c.score > 0; });
    list.sort(function (a, b) { return b.score - a.score; });
    // Dubbele labels (bv. twee rijen met hetzelfde onderwerp) mogen; dezelfde actie twee keer niet.
    list = list.slice(0, CMD_MAX - (cap.sample ? 1 : 0));
  }
  var ask = cmdAskOption(str(raw).trim());
  if (ask) list.push(ask);
  var active = 0;
  var best = list[0] && list[0].kind !== "ask" ? list[0].score || 0 : 0;
  var words = q ? q.split(" ").length : 0;
  if (q && ask && (best < 45 || /\?$/.test(q) || (words >= 4 && best < 80))) active = list.length - 1; // lijkt een vraag
  return { list: list, active: active };
}
function cmdRender() {
  var r = cmdBuild(cmd.input.value);
  cmd.opts = r.list; cmd.active = r.active;
  var ul = clear(cmd.list);
  if (!r.list.length) ul.append(h("li", { class: "cmd-empty", role: "presentation", text: "Niets gevonden." }));
  r.list.forEach(function (c, i) {
    var li = h("li", { role: "option", id: "cmd-o-" + i, class: "cmd-opt k-" + c.kind, "aria-selected": i === r.active ? "true" : "false" },
      c.kind === "ask" ? h("span", { class: "cmd-ic", "aria-hidden": "true", text: "↵" }) : h("span", { class: "cmd-tag", text: c.tag }),
      h("span", { class: "cmd-label", text: c.label }),
      c.hint ? h("span", { class: "cmd-hint", text: c.hint }) : null,
      c.key ? h("kbd", { class: "cmd-key", title: "Sneltoets", text: c.key }) : null);
    li.addEventListener("mousedown", function (e) { e.preventDefault(); });
    li.addEventListener("mousemove", function () { if (cmd.active !== i) cmdSetActive(i); });
    li.addEventListener("click", function () { cmdRun(i); });
    ul.append(li);
  });
  cmdSetActive(r.active);
}
function cmdSetActive(i) {
  if (!cmd.opts.length) { cmd.input.removeAttribute("aria-activedescendant"); return; }
  cmd.active = (i + cmd.opts.length) % cmd.opts.length;
  cmd.list.querySelectorAll("[role=option]").forEach(function (li, k) { li.setAttribute("aria-selected", k === cmd.active ? "true" : "false"); });
  var el = $("cmd-o-" + cmd.active);
  cmd.input.setAttribute("aria-activedescendant", "cmd-o-" + cmd.active);
  if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
}
function cmdRun(i) {
  var c = cmd.opts[i]; if (!c) return;
  logEvent("commandbar_" + c.kind);
  closeCmdBar(true);
  try {
    if (c.kind === "item") cmdJump(c);
    else c.run();
  } catch (e) { try { console.warn(e); } catch (x) { /* */ } }
}

// ---------- Openen en sluiten ----------
function cmdEnsure() {
  if (cmd.el) return;
  cmd.input = h("input", { id: "cmdInput", type: "text", role: "combobox", "aria-expanded": "true", "aria-controls": "cmdList", "aria-autocomplete": "list",
    "aria-label": "Zoek, voer uit of vraag Claude", placeholder: "Ga naar, doe iets of vraag Claude…", autocomplete: "off", spellcheck: "false" });
  cmd.list = h("ul", { id: "cmdList", role: "listbox", "aria-label": "Suggesties" });
  cmd.el = h("dialog", { id: "cmdbar", class: "cmdbar", "aria-label": "Zoek of vraag" },
    h("div", { class: "cmd-box" }, h("span", { class: "cmd-search", "aria-hidden": "true", text: "⌕" }), cmd.input,
      h("button", { class: "icon-btn cmd-close", type: "button", "aria-label": "Sluiten", title: "Sluiten (Esc)", text: "✕", onclick: function () { closeCmdBar(); } })),
    cmd.list,
    h("p", { class: "cmd-foot", "aria-hidden": "true" }, "↑ ↓ kiezen · ↵ uitvoeren · Esc sluiten · ? alle toetsen"));
  document.body.append(cmd.el);
  cmd.input.addEventListener("input", cmdRender);
  cmd.input.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown" || (e.ctrlKey && e.key === "n")) { e.preventDefault(); cmdSetActive(cmd.active + 1); }
    else if (e.key === "ArrowUp" || (e.ctrlKey && e.key === "p")) { e.preventDefault(); cmdSetActive(cmd.active - 1); }
    else if (e.key === "Home" && e.ctrlKey) { e.preventDefault(); cmdSetActive(0); }
    else if (e.key === "End" && e.ctrlKey) { e.preventDefault(); cmdSetActive(cmd.opts.length - 1); }
    else if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); e.stopPropagation(); cmdRun(cmd.active); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeCmdBar(); }
    else if (e.key === "Tab") { e.preventDefault(); cmdSetActive(cmd.active + (e.shiftKey ? -1 : 1)); }
  });
  cmd.el.addEventListener("cancel", function (e) { e.preventDefault(); closeCmdBar(); });
  cmd.el.addEventListener("mousedown", function (e) { if (e.target === cmd.el) { e.preventDefault(); closeCmdBar(); } }); // klik op de achtergrond
}
function cmdOpen() { return !!(cmd.el && cmd.el.open); }
function openCmdBar(opener) {
  cmdEnsure();
  if (cmdOpen()) { closeCmdBar(); return; }
  cmd.opener = opener || document.activeElement;
  closeMenus();
  if ($("keys").open) $("keys").close();
  cmd.input.value = "";
  cmdRender();
  try { cmd.el.showModal(); } catch (e) { cmd.el.setAttribute("open", ""); }
  cmd.input.focus();
  logEvent("commandbar_open");
}
function closeCmdBar(forRun) {
  if (!cmdOpen()) return;
  try { cmd.el.close(); } catch (e) { cmd.el.removeAttribute("open"); }
  if (forRun) return;
  var o = cmd.opener;
  if (o && o !== document.body && document.contains(o) && o.offsetParent !== null) o.focus({ preventScroll: true });
}
