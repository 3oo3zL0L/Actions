// Acties (db): lijst, detail met bewerkbare velden, Nieuwe actie, afvinken.
"use strict";

// ---------- Acties (db) ----------
var acties = { docs: [], loaded: false, unsub: null, error: null, pending: {}, q: {}, dead: false };
function actiesCol() { return cap.db.collection("acties"); }
function subscribeActies() {
  if (!cap.db || acties.unsub) return;
  try {
    acties.unsub = actiesCol().onSnapshot(function (snap) {
      acties.docs = (snap && snap.docs ? snap.docs : []).filter(function (d) { return d.exists !== false; }).map(function (d) {
        return normActie(d.id, d.data() || {});
      });
      acties.docs.forEach(function (d) { if (acties.pending[d.id] && acties.pending[d.id].state !== "error") delete acties.pending[d.id]; });
      acties.loaded = true; acties.error = null; acties.updatedAt = Date.now();
      renderActies(); renderNowStrip();
    }, function (err) {
      acties.unsub = null;
      acties.error = err || { code: "unavailable" };
      if (err && (err.code === "revoked" || err.code === "not_granted" || err.code === "capability_disabled" || err.code === "capability_removed")) { acties.dead = true; }
      renderActies();
    });
  } catch (e) { acties.error = { code: "unavailable" }; renderActies(); }
}
// Leest ook oudere/alternatieve veldnamen (tekst, wie, deadline, programma, bron-als-URL, status "klaar").
function normActie(id, o) {
  var c = {}; for (var k in o) c[k] = o[k];
  c.id = id;
  if (c.text == null && c.tekst != null) c.text = c.tekst;
  if (c.who == null && c.wie != null) c.who = c.wie;
  if (c.due == null && c.deadline != null) c.due = c.deadline;
  if (c.prog == null && c.programma != null) c.prog = c.programma;
  if (!c.bronUrl && safeUrl(c.bron)) { c.bronUrl = c.bron; c.bron = /outlook|mail/i.test(c.bron) ? "mail" : /teams/i.test(c.bron) ? "teams" : /jira|atlassian/i.test(c.bron) ? "jira" : "klad"; }
  var st = str(c.status).toLowerCase();
  c.status = st === "done" || st === "klaar" || st === "gedaan" ? "done" : st === "dropped" || st === "vervallen" ? "dropped" : "open";
  if (c.why == null && c.waarom != null) c.why = c.waarom;
  c.why = c.why == null ? "" : str(c.why); c.extra = c.extra == null ? "" : str(c.extra);
  c.text = str(c.text); c.who = c.who == null ? "" : str(c.who); c.due = c.due == null ? "" : str(c.due);
  if (PROGS.indexOf(c.prog) < 0) c.prog = matchProg(c.prog) || "Overig";
  // Selectie-handtekening (Shell): alleen wat de actiebalk verandert. Zo bouwt het detail niet opnieuw op
  // terwijl Thomas een veld bewerkt; de velden zelf slaan op en werken titel en lijst bij.
  Object.defineProperty(c, "toJSON", { value: actieSig, enumerable: false });
  return c;
}
function actieSig() { return { id: this.id, status: this.status, vandaag: !!this.vandaag, bronUrl: this.bronUrl || "" }; }

function resubscribeActies() {
  if (!cap.db || acties.dead) { renderActies(); return; }
  if (acties.unsub) { announce("Acties zijn live bijgewerkt"); return; }
  subscribeActies();
}
function actieList() {
  var list = acties.docs.slice();
  Object.keys(acties.pending).forEach(function (id) {
    if (!list.some(function (d) { return d.id === id; })) { var p = acties.pending[id]; var c = {}; for (var k in p.data) c[k] = p.data[k]; c.id = id; c._pending = p.state; list.push(c); }
  });
  return list;
}
function dueDate(a) {
  if (a.dueIso) { var d = parseDate(a.dueIso + "T00:00:00"); if (d) return d; }
  var s = str(a.due).trim().toLowerCase();
  if (!s) return null;
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = /^(\d{1,2})\s*[- ]?\s*([a-z]{3})[a-z]*\.?(?:\s+(\d{4}))?$/.exec(s);
  if (m) {
    var mi = MONTHS_S.indexOf(m[2]); if (mi < 0) mi = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[2]);
    if (mi >= 0) {
      var now = new Date(), y = m[3] ? +m[3] : now.getFullYear();
      var dd = new Date(y, mi, +m[1]);
      if (!m[3] && dd < new Date(now.getFullYear(), now.getMonth() - 6, 1)) dd.setFullYear(y + 1);
      return dd;
    }
  }
  if (s === "vandaag") return startOfDay(new Date());
  return null;
}
function dueState(a) {
  var d = dueDate(a); if (!d) return "";
  var t = startOfDay(new Date());
  if (d < t) return "over"; if (sameDay(d, t)) return "today"; return "";
}
function isToday(a) { return a.status === "open" && (a.vandaag === true || dueState(a) === "today" || dueState(a) === "over"); }
function actiesVandaag() { return actieList().filter(isToday); }
function normTok(s) { return str(s).toLowerCase().replace(/[^a-z0-9]/g, ""); }
function matchProg(s) {
  var n = normTok(s); if (!n) return null;
  var alias = { ui: "UI/UX", ux: "UI/UX", uiux: "UI/UX", pc: "Platform Core", core: "Platform Core", ci: "CI Acceleration", cia: "CI Acceleration", os: "Object Store", jakarta: "Jakarta migratie", jm: "Jakarta migratie", ps: "Platform Stability", stability: "Platform Stability", contract: "Contracten" };
  for (var i = 0; i < PROGS.length; i++) if (normTok(PROGS[i]) === n) return PROGS[i];
  if (alias[n]) return alias[n];
  if (n.length >= 2) for (var j = 0; j < PROGS.length; j++) if (normTok(PROGS[j]).indexOf(n) === 0) return PROGS[j];
  return null;
}
// #programma: langste programmanaam inclusief spaties, hoofdletterongevoelig; daarna korte aliassen per woord.
var PROG_NAMES = PROGS.slice().sort(function (a, b) { return b.length - a.length; });
function takeProgTags(raw, out) {
  var res = "", i = 0, lower = raw.toLowerCase();
  while (i < raw.length) {
    if (raw[i] === "#" && (i === 0 || /\s/.test(raw[i - 1]))) {
      var hit = null;
      for (var k = 0; k < PROG_NAMES.length; k++) {
        var n = PROG_NAMES[k].toLowerCase(), end = i + 1 + n.length;
        if (lower.slice(i + 1, end) === n && (end === raw.length || /\s/.test(raw[end]))) { hit = PROG_NAMES[k]; i = end; break; }
      }
      if (hit) { out.prog = hit; res += " "; continue; }
    }
    res += raw[i]; i++;
  }
  return res;
}
function parseAdd(raw) {
  var out = { text: "", who: "eigen actie", due: "", dueIso: "", prog: null, vandaag: false };
  var rest = [];
  takeProgTags(str(raw), out).split(/\s+/).forEach(function (tok) {
    if (!tok) return;
    var m;
    if ((m = /^@(.+)$/.exec(tok))) { var w = m[1].replace(/_/g, " "); out.who = /^priv[eé]$/i.test(w) ? "prive" : w; return; }
    if ((m = /^#(.+)$/.exec(tok))) { var p = matchProg(m[1]); if (p) { out.prog = p; return; } }
    if ((m = /^!(.+)$/.exec(tok))) { var d = parseDue(m[1]); if (d) { out.dueIso = isoDay(d.date); out.due = shortDue(d.date); if (d.today) out.vandaag = true; return; } }
    rest.push(tok);
  });
  out.text = rest.join(" ").trim();
  return out;
}
function parseDue(s) {
  s = str(s).toLowerCase();
  var today = startOfDay(new Date());
  if (s === "vandaag" || s === "nu") return { date: today, today: true };
  if (s === "morgen") { var t = new Date(today); t.setDate(t.getDate() + 1); return { date: t }; }
  var wd = DAYS_S.indexOf(s.slice(0, 2));
  if (wd >= 0 && /^[a-z]+$/.test(s) && (s.length === 2 || DAYS[wd].indexOf(s) === 0)) {
    var d = new Date(today); var diff = (wd - today.getDay() + 7) % 7; d.setDate(d.getDate() + diff);
    return { date: d, today: diff === 0 };
  }
  var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) { var dd = new Date(+m[1], +m[2] - 1, +m[3]); if (!isNaN(dd)) return { date: dd, today: sameDay(dd, today) }; }
  m = /^(\d{1,2})[-/](\d{1,2})$/.exec(s);
  if (m) { var d2 = new Date(today.getFullYear(), +m[2] - 1, +m[1]); if (d2 < today) d2.setFullYear(d2.getFullYear() + 1); return { date: d2, today: sameDay(d2, today) }; }
  return null;
}
function queueWrite(id, fn) {
  var prev = acties.q[id] || Promise.resolve();
  var next = prev.catch(function () {}).then(fn);
  acties.q[id] = next;
  return next;
}
function addActie(fields, fromCard, docId) {
  if (!cap.db) return Promise.reject({ code: "not_granted" });
  var now = new Date().toISOString();
  var data = {
    text: str(fields.text), who: str(fields.who) || "eigen actie", due: str(fields.due), prog: PROGS.indexOf(fields.prog) >= 0 ? fields.prog : "Overig",
    extra: str(fields.extra), why: str(fields.why), status: "open", vandaag: !!fields.vandaag,
    bron: str(fields.bron) || "klad", bronUrl: safeUrl(fields.bronUrl) || "", van: str(fields.van), onderwerp: str(fields.onderwerp),
    createdAt: now, updatedAt: now
  };
  if (fields.dueIso) data.dueIso = fields.dueIso;
  var ref;
  try { ref = docId ? actiesCol().doc(docId) : actiesCol().doc(); } catch (e) { return Promise.reject({ code: "invalid_argument" }); }
  acties.pending[ref.id] = { data: data, state: "saving", ref: ref };
  renderActies(); renderNowStrip();
  return queueWrite(ref.id, function () { return ref.set(data); }).then(function () {
    var p = acties.pending[ref.id]; if (p) p.state = "saved";
    renderActies();
    return { id: ref.id };
  }, function (e) {
    var p = acties.pending[ref.id]; if (p) { p.state = "error"; p.err = e; }
    renderActies();
    if (fromCard) { delete acties.pending[ref.id]; renderActies(); }
    throw e;
  });
}
function retryAdd(id) {
  var p = acties.pending[id]; if (!p) return;
  p.state = "saving"; renderActies();
  queueWrite(id, function () { return p.ref.set(p.data); }).then(function () { p.state = "saved"; renderActies(); }, function (e) { p.state = "error"; p.err = e; renderActies(); });
}
function updateActie(a, patch) {
  if (!cap.db) return;
  patch.updatedAt = new Date().toISOString();
  var local = acties.docs.filter(function (d) { return d.id === a.id; })[0];
  if (local) { for (var k in patch) local[k] = patch[k]; }
  renderActies(); renderNowStrip();
  queueWrite(a.id, function () { return actiesCol().doc(a.id).update(patch); }).catch(function (e) {
    announce("Wijziging niet opgeslagen" + (e && e.code === "quota_exceeded" ? ": opslag vol" : "") + ".");
    acties.rowErr = acties.rowErr || {}; acties.rowErr[a.id] = true; renderActies();
  });
}
function deleteActie(a) {
  if (a._pending) { delete acties.pending[a.id]; renderActies(); return; }
  acties.docs = acties.docs.filter(function (d) { return d.id !== a.id; });
  renderActies(); renderNowStrip();
  var copy = {}; for (var k in a) if (k !== "id" && k.charAt(0) !== "_") copy[k] = a[k];
  queueWrite(a.id, function () { return actiesCol().doc(a.id).delete(); }).then(function () {
    feedback({ text: "Actie weggehaald" + (a.text ? ": " + trunc(a.text, 60) : ""), undo: function () {
      queueWrite(a.id, function () { return actiesCol().doc(a.id).set(copy); }).then(function () { feedback({ text: "Actie terug" + (a.text ? ": " + trunc(a.text, 60) : "") }); }, function () { feedback({ text: "Terugzetten lukte niet", icon: "⚠" }); });
    } });
  }, function () { feedback({ text: "Verwijderen mislukt", icon: "⚠" }); });
}
// Afvinken of heropenen, met Ongedaan maken in de feedbackbalk.
function setDone(a, done) {
  if (!cap.db || a._pending) return;
  var before = a.status, next = done ? nextRowKey("actie:" + a.id) : null;
  updateActie(a, { status: done ? "done" : "open" });
  if (done) { logEvent("actie_afgevinkt"); moveOn("actie:" + a.id, next); }
  feedback({ text: (done ? "Actie afgevinkt: " : "Actie heropend: ") + trunc(a.text, 60),
    undoText: (done ? "Terug op de lijst: " : "Weer afgevinkt: ") + trunc(a.text, 60),
    undo: function () { updateActie(findActie(a.id) || a, { status: before }); refreshActieDetail(a.id); } });
}
// Na afvinken of laten vervallen verdwijnt de rij uit beeld (naar het ingeklapte Klaar of N.v.t.): selectie en focus
// naar de volgende zichtbare rij, anders de vorige.
function nextRowKey(key) {
  var c = Shell.current();
  if (!c || c.key !== key) return null;
  var keys = Array.prototype.slice.call(document.querySelectorAll("#lijst [data-sel-key]"))
    .filter(rowInView).map(function (li) { return li.getAttribute("data-sel-key"); });
  var i = keys.indexOf(key);
  return i < 0 ? null : keys[i + 1] || keys[i - 1] || null;
}
// Zichtbaar in de lijst: niet in een ingeklapte groep (Klaar, N.v.t.; offsetParent is daar niet betrouwbaar).
function rowInView(li) { return li.offsetParent !== null && !li.closest("details:not([open])"); }
function moveOn(key, next) {
  if (!next) return;
  var li = null;
  document.querySelectorAll("#lijst [data-sel-key]").forEach(function (x) { if (x.getAttribute("data-sel-key") === key && rowInView(x)) li = x; });
  if (li) return; // staat nog in beeld (bv. in een uitgeklapte groep)
  Shell.select(next, { user: true, focus: true, scroll: true });
}
function suggestProg(id, text) {
  if (!cap.sample || !cap.sample.json) return;
  var prompt = "Bij welk PAF-programma hoort deze actie van Thomas? Kies precies een van: " + PROGS.join(", ") + ". Kies Overig als het niet duidelijk is. Antwoord alleen met JSON: {\"prog\": \"...\"}\n\nActie (data): " + trunc(text, 500);
  Promise.resolve().then(function () { return cap.sample.json(prompt, { modelTier: "quick" }); }).then(function (r) {
    var p = r && typeof r === "object" ? matchProg(r.prog) : null;
    if (!p || p === "Overig") return;
    var doc = acties.docs.filter(function (d) { return d.id === id; })[0];
    if (!doc || doc.prog !== "Overig" || doc.status !== "open") return;
    updateActie(doc, { prog: p });
    refreshActieDetail(id);
    announce("Actie ingedeeld bij " + p + " door Claude");
  }, function () { /* voorstel is optioneel */ });
}
function findActie(id) { return actieList().filter(function (d) { return d.id === id; })[0] || null; }
function refreshActieDetail(id) { var c = Shell.current(); if (c && c.key === "actie:" + id) Shell.refreshDetail(); }

// ---------- Nieuwe actie: formulier bovenaan de detailkolom van Acties ----------
// makeActie(src): "Maak actie" vanuit mail of Teams. Opent Nieuwe actie met het onderwerp voorgevuld en de bron erbij.
function makeActie(src) {
  logEvent("maak_actie", src && src.bron);
  src = src || {};
  newActie({ bron: str(src.bron), bronUrl: safeUrl(src.bronUrl) || "", van: str(src.van), onderwerp: str(src.onderwerp), why: str(src.why) });
}
// newActie(src?, opener?): toets n en de knop Nieuwe actie.
function newActie(src, opener) {
  if (!cap.db || acties.dead) { announce("Acties opslaan kan hier niet. Gebruik de PAF actielijst."); return; }
  if (!Shell.shown("acties")) Shell.go("acties", { user: true });
  var el = newActieEl(src && src.bron ? src : null);
  openPane("acties", el, opener || $("newActieBtn"));
  var inp = el.querySelector("#na-text");
  inp.focus();
  try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) { /* */ }
}
function newActieEl(src) {
  var el = h("section", { class: "newact", "aria-labelledby": "na-t" });
  var text = h("input", { type: "text", id: "na-text", "aria-label": "Nieuwe actie", autocomplete: "off", enterkeyhint: "done",
    placeholder: "Wat moet er gebeuren?", title: "Enter bewaart, Esc sluit" });
  text.value = src ? str(src.onderwerp) : "";
  var prog = h("select", { title: "Programma. Automatisch: Claude kiest er een" });
  prog.append(h("option", { value: "", text: "Automatisch" }));
  PROGS.forEach(function (p) { prog.append(h("option", { value: p, text: p })); });
  var due = h("input", { type: "date", title: "Deadline (optioneel). Enter bewaart" });
  var msg = h("p", { class: "fld-hint err", role: "status" });
  var chip = null;
  if (src) {
    var lbl = src.bron in BRON_LABEL ? BRON_LABEL[src.bron] : src.bron;
    chip = h("div", { class: "srcchip" }, h("span", { text: "Bron: " + (lbl || "link") + (src.van ? " van " + src.van : "") }),
      h("button", { class: "btn text", type: "button", "aria-label": "Bron loskoppelen", title: "Bron loskoppelen", text: "✕",
        onclick: function () { src = null; if (chip.parentNode) chip.parentNode.removeChild(chip); text.focus(); } }));
  }
  function submit() {
    var raw = text.value.trim();
    var p = raw ? parseAdd(raw) : null;
    if (!p || !p.text) { msg.textContent = "Typ eerst wat er moet gebeuren."; text.focus(); return; }
    var f = { text: p.text, who: p.who, due: p.due, dueIso: p.dueIso, prog: prog.value || p.prog || "Overig", vandaag: p.vandaag, bron: "klad" };
    if (due.value) { var d = parseDate(due.value + "T00:00:00"); if (d) { f.dueIso = due.value; f.due = shortDue(d); } }
    if (src) { f.bron = src.bron; f.bronUrl = src.bronUrl; f.van = src.van; f.onderwerp = src.onderwerp; if (src.why) f.why = src.why; }
    var id;
    try { id = actiesCol().doc().id; } catch (e) { msg.textContent = "Opslaan kan nu niet. Probeer het opnieuw."; return; }
    var auto = !prog.value && !p.prog;
    closePane("acties", true);
    addActie(f, false, id).then(function () {
      feedback({ text: "Actie toegevoegd bij " + f.prog + ": " + trunc(f.text, 50), undoText: "Actie weggehaald: " + trunc(f.text, 50),
        undo: function () { deleteActie(findActie(id) || { id: id }); } });
      logEvent("actie_toegevoegd", f.bron);
      if (auto) suggestProg(id, f.text);
    }, function () { announce("Actie niet opgeslagen."); });
    Shell.select("actie:" + id, { user: true, focus: true, scroll: true });
  }
  [text, due, prog].forEach(function (c) {
    c.addEventListener("keydown", function (ev) { if (ev.key === "Enter" && !ev.isComposing) { ev.preventDefault(); submit(); } });
  });
  text.addEventListener("input", function () { msg.textContent = ""; });
  add(el, [
    h("div", { class: "dpane-head" }, h("h3", { id: "na-t", text: "Nieuwe actie" }),
      h("button", { class: "icon-btn", type: "button", "aria-label": "Nieuwe actie sluiten", title: "Sluiten (Esc)", text: "✕", onclick: function () { closePane("acties"); } })),
    chip,
    h("div", { class: "fld" }, text),
    h("div", { class: "fld-row2" }, formField("Programma", prog, "na-prog"), formField("Deadline", due, "na-due")),
    h("p", { class: "fld-hint", text: "Ook in de tekst: @wie, #programma, !vr of !vandaag." }),
    msg,
    h("div", { class: "btns" },
      h("button", { class: "btn", type: "button", title: "Sluiten zonder bewaren (Esc)", text: "Annuleer", onclick: function () { closePane("acties"); } }),
      h("button", { class: "btn primary", type: "button", title: "Actie bewaren (Enter)", text: "Bewaar", onclick: submit }))]);
  return el;
}

// ---------- Lijst ----------
var BRON_ICON = { mail: "✉", teams: "💬", jira: "◆", agenda: "▦", cowork: "✦", paf: "▤", klad: "" };
var BRON_LABEL = { mail: "mail", teams: "Teams", jira: "Jira", agenda: "agenda", cowork: "Cowork", paf: "PAF", klad: "" };
var BRON_WHERE = { mail: "Outlook", agenda: "Outlook", teams: "Teams", jira: "Jira" };
function dueText(a) { var d = dueDate(a); return d ? shortDue(d) : str(a.due); }
// Rij: wat (vet), context (wie, programma, bron), rechts de deadline. Geen knoppen of links in de rij: alles zit in het detail.
function actieRow(a, opts) {
  opts = opts || {};
  var done = a.status === "done" || a.status === "dropped";
  var err = a._pending === "error" || (acties.rowErr && acties.rowErr[a.id]);
  var row = h("li", { class: "row arow" + (done ? " done" : "") + (err ? " err" : "") });
  var cb = h("input", { type: "checkbox", "aria-label": (done ? "Heropen: " : "Afvinken: ") + str(a.text), title: done ? "Heropenen (e)" : "Afvinken (e)" });
  cb.checked = done;
  cb.disabled = !!a._pending || !cap.db;
  cb.addEventListener("change", function () { setDone(a, cb.checked); });
  var ds = dueState(a);
  var meta = h("div", { class: "l2" });
  if (a.who && a.who !== "eigen actie") meta.append(h("span", { text: str(a.who) }));
  if (a.prog && !opts.noProg) meta.append(h("span", { class: "tag", text: str(a.prog) }));
  var bl = a.bron in BRON_LABEL ? BRON_LABEL[a.bron] : str(a.bron);
  if (bl) meta.append(h("span", { class: "pill", title: "Bron", text: (BRON_ICON[a.bron] ? BRON_ICON[a.bron] + " " : "") + bl }));
  if (a.status === "dropped") meta.append(h("span", { class: "pill", text: "n.v.t." }));
  if (err) meta.append(h("span", { class: "errmsg", text: "Niet opgeslagen" }));
  var main = h("div", { class: "row-main" }, h("div", { class: "l1" }, Shell.selTitle(str(a.text))), meta.firstChild ? meta : null);
  row.append(h("label", { class: "chk" }, cb), main);
  if (a.due) row.append(h("div", { class: "row-side" }, h("span", { class: "when" + (done ? "" : ds === "over" ? " due-over" : ds === "today" ? " due-today" : ""),
    text: dueText(a) + (!done && ds === "over" ? " verlopen" : "") })));
  return Shell.row(row, "actie", "actie:" + a.id, a);
}
function renderActies() {
  renderActiesList();
  renderVandaag();
  Shell.changed();
}
function renderActiesList() {
  var st = clear($("acties-state")), lst = clear($("acties-list"));
  var btn = $("newActieBtn");
  var cnt = $("cnt-acties");
  syncPanes();
  if (cap.db === undefined && hasRuntime) { lst.append(skeleton(2)); btn.hidden = true; cnt.textContent = ""; return; }
  if (!cap.db || acties.dead) {
    btn.hidden = true;
    cnt.textContent = "";
    st.append(naBlock("Acties opslaan kan hier niet. Gebruik de PAF actielijst."));
    $("fresh-acties").textContent = "";
    return;
  }
  btn.hidden = false;
  if (acties.error) {
    st.append(h("div", { class: "alert", role: "alert" }, h("p", { text: "⚠ Acties bijwerken lukt nu niet." }),
      h("div", { class: "btns" }, h("button", { class: "btn", type: "button", text: "Opnieuw proberen", onclick: resubscribeActies })),
      h("details", null, h("summary", { text: "Details" }), h("span", { class: "mono", text: str(acties.error.code) }))));
  }
  if (!acties.loaded && !Object.keys(acties.pending).length) { if (!acties.error) lst.append(skeleton(2)); return; }
  $("fresh-acties").textContent = acties.updatedAt ? "bijgewerkt " + hhmm(new Date(acties.updatedAt)) : "";
  var all = actieList().sort(function (a, b) { return str(a.createdAt) < str(b.createdAt) ? -1 : 1; });
  var open = all.filter(function (a) { return a.status === "open" || !a.status; });
  var closed = all.filter(function (a) { return a.status === "done" || a.status === "dropped"; });
  cnt.textContent = open.length ? String(open.length) : "";
  if (!Shell.shown("acties")) { clear(st); return; }
  if (!open.length) lst.append(h("p", { class: "empty", text: "Geen open acties. Nieuwe actie: n, of de knop Nieuwe actie hierboven." }));
  var today = open.filter(isToday);
  var rest = open.filter(function (a) { return !isToday(a); });
  function group(title, list, cls, noProg) {
    if (!list.length) return;
    var g = h("div", { class: "agroup" + (cls ? " " + cls : "") }, h("h3", null, title, h("span", { class: "n", text: String(list.length) })));
    var ul = h("ul", { class: "list" });
    list.forEach(function (a) { ul.append(actieRow(a, { noProg: noProg })); });
    g.append(ul); lst.append(g);
  }
  group("Vandaag", today.sort(function (a, b) { return (dueDate(a) || Infinity) - (dueDate(b) || Infinity); }), "today");
  PROGS.forEach(function (p) { group(p, rest.filter(function (a) { return (PROGS.indexOf(a.prog) >= 0 ? a.prog : "Overig") === p; }), "", true); });
  function closedGroup(label, list, key) {
    if (!list.length) return;
    var det = h("details", { class: "klaar" }, h("summary", { text: label + " (" + list.length + ")" }));
    var ul = h("ul", { class: "list" });
    list.slice().reverse().forEach(function (a) { ul.append(actieRow(a)); });
    det.append(ul);
    det.open = !!acties[key];
    det.addEventListener("toggle", function () { acties[key] = det.open; });
    lst.append(det);
  }
  closedGroup("Klaar", closed.filter(function (a) { return a.status === "done"; }), "klaarOpen");
  closedGroup("N.v.t.", closed.filter(function (a) { return a.status === "dropped"; }), "nvtOpen");
}
$("newActieBtn").addEventListener("click", function () { newActie(null, $("newActieBtn")); });

// ---------- Detail: actie met bewerkbare velden ----------
var FIELD_LABEL = { text: "Tekst", who: "Wie", due: "Deadline", prog: "Programma", why: "Waarom", extra: "Notities" };
function actieForm(a) {
  var id = a.id;
  var form = h("div", { class: "aform", role: "group", "aria-label": "Actie bewerken" });
  function doc() { return findActie(id) || a; }
  function save(patch, label) {
    var cur = doc(), before = {}, same = true;
    for (var k in patch) { before[k] = cur[k] == null ? "" : cur[k]; if (str(before[k]) !== str(patch[k])) same = false; }
    if (same) return;
    updateActie(cur, patch);
    if (patch.text != null) { var t = $("detailTitle"); if (t && Shell.current() && Shell.current().key === "actie:" + id) t.textContent = patch.text; }
    feedback({ text: label + " aangepast: " + trunc(doc().text, 50), undoText: label + " teruggezet: " + trunc(doc().text, 50),
      undo: function () { updateActie(doc(), before); refreshActieDetail(id); } });
    logEvent("actie_bewerkt");
  }
  function ctl(el, name) {
    el.name = name;
    el.disabled = !cap.db;
    el.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); el.blur(); }
      else if (ev.key === "Enter" && el.tagName === "INPUT" && !ev.isComposing) { ev.preventDefault(); el.blur(); }
    });
    return el;
  }
  var text = ctl(h("input", { type: "text", autocomplete: "off", title: "Enter of Tab slaat op, Esc verlaat het veld" }), "text");
  text.value = str(a.text);
  text.addEventListener("change", function () { var v = text.value.trim(); if (!v) { text.value = str(doc().text); return; } save({ text: v }, FIELD_LABEL.text); });
  var who = ctl(h("input", { type: "text", autocomplete: "off", placeholder: "eigen actie", title: "Wie moet het doen? Leeg is eigen actie" }), "who");
  who.value = a.who && a.who !== "eigen actie" ? str(a.who) : "";
  who.addEventListener("change", function () { save({ who: who.value.trim() || "eigen actie" }, FIELD_LABEL.who); });
  var due = ctl(h("input", { type: "date", title: "Deadline; leegmaken haalt hem weg" }), "due");
  var dd = dueDate(a);
  due.value = a.dueIso || (dd ? isoDay(dd) : "");
  due.addEventListener("change", function () {
    var v = due.value, d = v ? parseDate(v + "T00:00:00") : null;
    if (v && !d) return;
    save({ dueIso: v, due: d ? shortDue(d) : "" }, FIELD_LABEL.due);
  });
  var prog = ctl(h("select", { title: "Programma" }), "prog");
  PROGS.forEach(function (p) { prog.append(h("option", { value: p, text: p })); });
  prog.value = PROGS.indexOf(a.prog) >= 0 ? a.prog : "Overig";
  prog.addEventListener("change", function () { save({ prog: prog.value }, FIELD_LABEL.prog); });
  var why = ctl(h("textarea", { rows: "2", placeholder: "Waarom ligt dit bij jou?", title: "Tab of klik ergens anders slaat op, Esc verlaat het veld" }), "why");
  why.value = str(a.why);
  why.addEventListener("change", function () { save({ why: why.value.trim() }, FIELD_LABEL.why); });
  var extra = ctl(h("textarea", { rows: "3", placeholder: "Notities", title: "Tab of klik ergens anders slaat op, Esc verlaat het veld" }), "extra");
  extra.value = str(a.extra);
  extra.addEventListener("change", function () { save({ extra: extra.value.trim() }, FIELD_LABEL.extra); });
  var p = "af-" + str(id).replace(/[^A-Za-z0-9_-]/g, "").slice(-40) + "-";
  form.append(
    formField("Wat", text, p + "text"),
    h("div", { class: "fld-row2" }, formField("Wie", who, p + "who"), formField("Deadline", due, p + "due")),
    formField("Programma", prog, p + "prog"),
    formField("Waarom", why, p + "why"),
    formField("Notities", extra, p + "extra"));
  return form;
}
Shell.type("actie", {
  label: "Actie",
  title: function (a) { return str(a.text); },
  detail: function (a, body) {
    var bl = a.bron in BRON_LABEL ? BRON_LABEL[a.bron] : str(a.bron);
    add(body, metaList([
      ["Status", a.status === "done" ? "klaar" : a.status === "dropped" ? "n.v.t." : isToday(a) ? "open, vandaag" + (dueState(a) === "over" ? " (deadline verlopen)" : "") : "open"],
      ["Bron", bl ? bl + (a.van ? " van " + nameFromAddr(a.van) : "") + (a.onderwerp ? ", " + str(a.onderwerp) : "") : ""]
    ]));
    if (a._pending === "error") { body.append(h("p", { class: "errmsg", role: "alert", text: "Niet opgeslagen. Kies Opnieuw opslaan." })); return; }
    if (a._pending) { body.append(h("p", { class: "hint", text: "Wordt opgeslagen…" })); return; }
    body.append(actieForm(a));
  },
  actions: function (a) {
    if (a._pending) return a._pending === "error" ? [{ slot: "primary", label: "Opnieuw opslaan", key: "e", title: "Actie opnieuw proberen op te slaan", run: function (x) { retryAdd(x.id); } }] : [];
    var open = a.status === "open";
    var where = BRON_WHERE[a.bron];
    var todayByDue = dueState(a) === "today" || dueState(a) === "over";
    return [
      open ? { slot: "primary", label: "Vink af", key: "e", title: "Actie afvinken", run: function (x) { setDone(x, true); } }
        : { slot: "primary", label: "Heropen", key: "e", title: "Actie weer openzetten", run: function (x) { setDone(x, false); } },
      open && (a.vandaag || !todayByDue) ? { slot: "make", label: a.vandaag ? "Haal van vandaag" : "Maak vandaag", key: "v",
        title: a.vandaag ? "Niet meer op je lijst voor vandaag" : "Op je lijst voor vandaag zetten", run: function (x) {
          logEvent("actie_vandaag"); var was = !!x.vandaag; updateActie(x, { vandaag: !was });
          feedback({ text: (was ? "Van vandaag gehaald: " : "Op vandaag gezet: ") + trunc(x.text, 60), undoText: (was ? "Weer op vandaag: " : "Niet meer op vandaag: ") + trunc(x.text, 60),
            undo: function () { updateActie(findActie(x.id) || x, { vandaag: was }); refreshActieDetail(x.id); } });
        } } : null,
      Shell.act.ask("actie", a),
      { slot: "open", label: "Open bron", key: "o", title: "Open de bron" + (where ? " in " + where : ""), href: safeUrl(a.bronUrl) },
      open ? { slot: "extra", label: "Laten vervallen", key: "x", title: "Niet meer nodig: naar N.v.t. (Heropen zet hem terug)", run: function (x) {
        logEvent("actie_vervallen"); var next = nextRowKey("actie:" + x.id); updateActie(x, { status: "dropped" }); moveOn("actie:" + x.id, next);
        feedback({ text: "Actie vervallen: " + trunc(x.text, 60), undoText: "Terug op de lijst: " + trunc(x.text, 60),
          undo: function () { updateActie(findActie(x.id) || x, { status: "open" }); refreshActieDetail(x.id); } });
      } } : null
    ];
  }
});
Shell.entry("acties", {
  label: "Acties",
  render: function () { renderActiesList(); renderVoorstellenBlok(); },
  empty: "Kies een actie om hem hier te openen. Nieuwe actie: n.",
  count: function () { return cap.db && acties.loaded ? actieList().filter(function (a) { return a.status === "open"; }).length : ""; },
  // Command bar (Ctrl+K): open acties en nieuwe voorstellen; Enter selecteert het item in Acties.
  search: function () {
    var out = [];
    if (!cap.db) return out;
    if (acties.loaded) actieList().forEach(function (a) { if (a.status === "open") out.push({ key: "actie:" + a.id, title: str(a.text), hint: str(a.prog), tag: "Actie", words: [str(a.who)] }); });
    voorstNieuw().forEach(function (v) { out.push({ key: "voorstel:" + v.id, title: v.text, hint: "voorstel" + (v.van ? " van " + v.van : ""), tag: "Voorstel", words: [v.van, v.onderwerp, "voorstel"] }); });
    return out;
  }
});
