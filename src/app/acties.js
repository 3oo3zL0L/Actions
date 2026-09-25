// Acties (db): lijst, toevoegen, afvinken.
"use strict";

// ---------- Acties (db) ----------
var acties = { docs: [], loaded: false, unsub: null, error: null, pending: {}, q: {}, dead: false };
var srcDraft = null;
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
  return c;
}

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
function makeActie(src) {
  logEvent("maak_actie", src && src.bron);
  srcDraft = { bron: src.bron, bronUrl: safeUrl(src.bronUrl) || "", van: str(src.van), onderwerp: str(src.onderwerp) };
  var inp = $("addInput");
  inp.value = srcDraft.onderwerp;
  renderSrcChip();
  Shell.go("acties", { user: true });
  inp.focus();
  try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) { /* */ }
  inp.scrollIntoView({ block: "nearest" });
}
function renderSrcChip() {
  var c = clear($("srcchip"));
  c.hidden = !srcDraft;
  if (!srcDraft) return;
  var lbl = { mail: "mail", teams: "Teams", jira: "Jira" }[srcDraft.bron] || srcDraft.bron;
  c.append(h("span", { text: "Bron: " + lbl + (srcDraft.van ? " van " + srcDraft.van : "") }),
    h("button", { class: "btn text", type: "button", "aria-label": "Bron loskoppelen", text: "✕", onclick: function () { srcDraft = null; renderSrcChip(); $("addInput").focus(); } }));
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
    feedback({ text: "Actie verwijderd", undo: function () {
      queueWrite(a.id, function () { return actiesCol().doc(a.id).set(copy); }).then(function () { feedback({ text: "Actie terug" }); }, function () { feedback({ text: "Terugzetten lukte niet", icon: "⚠" }); });
    } });
  }, function () { feedback({ text: "Verwijderen mislukt", icon: "⚠" }); });
}
// Afvinken of heropenen, met Ongedaan maken in de feedbackbalk.
function setDone(a, done) {
  if (!cap.db || a._pending) return;
  var before = a.status;
  updateActie(a, { status: done ? "done" : "open" });
  if (done) logEvent("actie_afgevinkt");
  feedback({ text: done ? "Actie afgevinkt" : "Actie heropend", undo: function () { updateActie(a, { status: before }); } });
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
    announce("Actie ingedeeld bij " + p + " door Claude");
  }, function () { /* voorstel is optioneel */ });
}
function onAddSubmit(e) {
  e.preventDefault();
  var inp = $("addInput");
  var raw = inp.value.trim();
  if (!raw) return;
  if (!cap.db) { announce("Acties opslaan kan hier niet. Gebruik de PAF actielijst."); return; }
  var p = parseAdd(raw);
  if (!p.text) return;
  var f = { text: p.text, who: p.who, due: p.due, dueIso: p.dueIso, prog: p.prog || "Overig", vandaag: p.vandaag, bron: "klad" };
  if (srcDraft) { f.bron = srcDraft.bron; f.bronUrl = srcDraft.bronUrl; f.van = srcDraft.van; f.onderwerp = srcDraft.onderwerp; }
  inp.value = ""; srcDraft = null; renderSrcChip();
  addActie(f).then(function (r) {
    feedback({ text: "Actie toegevoegd bij " + f.prog, undo: r ? function () { deleteActie({ id: r.id }); } : null });
    logEvent("actie_toegevoegd", f.bron);
    if (!p.prog && r) suggestProg(r.id, p.text);
  }, function () { announce("Actie niet opgeslagen."); });
}
var BRON_ICON = { mail: "✉", teams: "💬", jira: "◆", cowork: "✦", paf: "▤", klad: "" };
var BRON_LABEL = { mail: "mail", teams: "Teams", jira: "Jira", cowork: "Cowork", paf: "PAF", klad: "" };
function actieRow(a) {
  var done = a.status === "done" || a.status === "dropped";
  var row = h("li", { class: "row arow" + (done ? " done" : "") + (a._pending === "error" || (acties.rowErr && acties.rowErr[a.id]) ? " err" : "") });
  var cb = h("input", { type: "checkbox", "aria-label": (done ? "Heropen: " : "Afvinken: ") + str(a.text), title: done ? "Heropenen" : "Afvinken (e)" });
  cb.checked = done;
  cb.disabled = !!a._pending || !cap.db;
  cb.addEventListener("change", function () { setDone(a, cb.checked); });
  var ds = dueState(a);
  var meta = h("div", { class: "l2" });
  if (a.who && a.who !== "eigen actie") meta.append(h("span", { text: str(a.who) }));
  if (a.due) meta.append(h("span", { class: done ? "" : ds === "over" ? "due-over" : ds === "today" ? "due-today" : "", text: (dueDate(a) ? shortDue(dueDate(a)) : str(a.due)) + (!done && ds === "over" ? " verlopen" : "") }));
  if (a.prog) meta.append(h("span", { class: "tag", text: str(a.prog) }));
  if (a.status === "dropped") meta.append(h("span", { class: "pill", text: "n.v.t." }));
  var bu = safeUrl(a.bronUrl);
  var bl = a.bron in BRON_LABEL ? BRON_LABEL[a.bron] : str(a.bron);
  if (bu) meta.append(h("a", { href: bu, target: "_blank", rel: "noopener noreferrer", title: "Bron: " + (bl || "link"), class: "btn text", style: "min-height:0;padding:0 4px" }, (BRON_ICON[a.bron] || "↗") + (bl ? " " + bl : ""), h("span", { class: "sr", text: " (opent in nieuw tabblad)" })));
  else if (bl) meta.append(h("span", { class: "pill", title: "Bron", text: (BRON_ICON[a.bron] ? BRON_ICON[a.bron] + " " : "") + bl }));
  var main = h("div", { class: "row-main" }, h("div", { class: "l1" }, Shell.selTitle(str(a.text))),
    a.why ? h("div", { class: "why", text: str(a.why) }) : null,
    a.extra ? h("div", { class: "extra", text: str(a.extra) }) : null,
    meta.firstChild ? meta : null);
  if (a._pending === "error") main.append(h("div", { class: "errmsg" }, "Niet opgeslagen. ", h("button", { class: "btn text", type: "button", text: "Opnieuw", onclick: function () { retryAdd(a.id); } })));
  row.append(h("label", { class: "chk" }, cb), main);
  return Shell.row(row, "actie", "actie:" + a.id, a);
}
function renderActies() {
  renderActiesList();
  renderVandaag();
  Shell.changed();
}
function renderActiesList() {
  var st = clear($("acties-state")), lst = clear($("acties-list"));
  var input = $("addInput");
  var cnt = $("cnt-acties");
  if (cap.db === undefined && hasRuntime) { lst.append(skeleton(2)); input.disabled = true; cnt.textContent = ""; return; }
  if (!cap.db || acties.dead) {
    input.disabled = true;
    cnt.textContent = "";
    st.append(naBlock("Acties opslaan kan hier niet. Gebruik de PAF actielijst."));
    $("fresh-acties").textContent = "";
    return;
  }
  input.disabled = false;
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
  if (!open.length) lst.append(h("p", { class: "empty", text: "Geen open acties. Typ hierboven en druk op Enter." }));
  var today = open.filter(isToday);
  var rest = open.filter(function (a) { return !isToday(a); });
  function group(title, list, cls) {
    if (!list.length) return;
    var g = h("div", { class: "agroup" + (cls ? " " + cls : "") }, h("h3", null, title, h("span", { class: "n", text: String(list.length) })));
    var ul = h("ul", { class: "list" });
    list.forEach(function (a) { ul.append(actieRow(a)); });
    g.append(ul); lst.append(g);
  }
  group("Vandaag", today.sort(function (a, b) { return (dueDate(a) || Infinity) - (dueDate(b) || Infinity); }), "today");
  PROGS.forEach(function (p) { group(p, rest.filter(function (a) { return (PROGS.indexOf(a.prog) >= 0 ? a.prog : "Overig") === p; })); });
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


// ---------- Detail: actie ----------
Shell.type("actie", {
  label: "Actie",
  title: function (a) { return str(a.text); },
  detail: function (a, body) {
    var d = dueDate(a);
    var bl = a.bron in BRON_LABEL ? BRON_LABEL[a.bron] : str(a.bron);
    add(body, metaList([
      ["Status", a.status === "done" ? "klaar" : a.status === "dropped" ? "n.v.t." : isToday(a) ? "open, vandaag" : "open"],
      ["Wie", a.who && a.who !== "eigen actie" ? str(a.who) : ""],
      ["Deadline", a.due ? (d ? shortDue(d) : str(a.due)) + (dueState(a) === "over" && a.status === "open" ? " (verlopen)" : "") : ""],
      ["Programma", str(a.prog)],
      ["Bron", bl ? bl + (a.van ? " van " + nameFromAddr(a.van) : "") + (a.onderwerp ? ", " + str(a.onderwerp) : "") : ""]
    ]));
    if (a.why) body.append(h("p", { class: "detail-text", text: str(a.why) }));
    if (a.extra) body.append(h("p", { class: "detail-text extra", text: str(a.extra) }));
  },
  actions: function (a) {
    if (a._pending) return [];
    return [
      a.status === "open" ? { slot: "primary", label: "Vink af", key: "e", title: "Actie afvinken", run: function (x) { setDone(x, true); } }
        : { slot: "primary", label: "Heropen", key: "e", title: "Actie weer openzetten", run: function (x) { setDone(x, false); } },
      Shell.act.ask("actie", a),
      Shell.act.open(a.bronUrl, { mail: "Outlook", teams: "Teams", jira: "Jira" }[a.bron] || "bron"),
      a.status === "open" ? { slot: "extra", label: a.vandaag ? "Van vandaag halen" : "Op vandaag zetten", key: "v", run: function (x) {
        logEvent("actie_vandaag"); var was = !!x.vandaag; updateActie(x, { vandaag: !was });
        feedback({ text: was ? "Van vandaag gehaald" : "Op vandaag gezet", undo: function () { updateActie(x, { vandaag: was }); } });
      } } : null,
      a.status === "open" ? { slot: "extra", label: "Laten vervallen", key: "x", run: function (x) {
        logEvent("actie_vervallen"); updateActie(x, { status: "dropped" });
        feedback({ text: "Actie vervallen", undo: function () { updateActie(x, { status: "open" }); } });
      } } : null,
      { slot: "extra", label: "Verwijderen", title: "Actie uit je eigen lijst verwijderen (Ongedaan maken kan)", run: function (x) { deleteActie(x); } }
    ];
  }
});
Shell.entry("acties", {
  label: "Acties",
  render: function () { renderActiesList(); renderVoorstellenBlok(); },
  empty: "Kies een actie om hem hier te openen. Nieuwe actie: n.",
  count: function () { return cap.db && acties.loaded ? actieList().filter(function (a) { return a.status === "open"; }).length : ""; }
});
