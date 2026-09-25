// Agenda: vandaag en morgen als tijdlijn (ingang Agenda), detail van een afspraak, uitnodigingen beantwoorden
// en "Plan een vergadering" op beschikbaarheid (inline in de detailkolom).
"use strict";

// ---------- Paneel bovenaan de detailkolom (formulier zonder item) ----------
// openPane(ingang, el, opener): toont el bovenaan het detail zolang die ingang actief is, ook als de selectie
// wisselt. closePane(ingang, stil). Esc in het paneel sluit het en zet de focus op de geselecteerde rij (✕ zet hem
// terug op de knop die het opende); losse sneltoetsen gaan niet naar het item eronder.
// Gebruikt door Plan een vergadering (agenda) en Nieuwe actie (acties).
var panes = {};
function typingIn(t) { return !!(t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)); }
function openPane(entry, el, opener) {
  closePane(entry, true);
  el.classList.add("dpane");
  el._opener = opener || document.activeElement;
  el.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      e.preventDefault(); e.stopPropagation();
      closePane(entry, true);
      if (Shell.isPhone()) Shell.back(); else Shell.leaveField(null);
      return;
    }
    // Losse toetsen (e, r, j, 1..) horen bij het item eronder: in het paneel doen ze niets (behalve eigen toetsen).
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !typingIn(e.target)) { e.stopPropagation(); if (el._keys) el._keys(e); }
  });
  panes[entry] = el;
  var v = $("detailView");
  v.insertBefore(el, $("abar"));
  if (!$("chat").hidden) closePanel(true);
  syncPanes();
  Shell.showDetail();
  v.scrollTop = 0;
}
function closePane(entry, quiet) {
  var el = panes[entry];
  if (!el) return;
  delete panes[entry];
  if (el._close) try { el._close(); } catch (e) { /* */ }
  if (el.parentNode) el.parentNode.removeChild(el);
  syncPanes();
  if (quiet) return;
  var o = el._opener;
  if (Shell.isPhone()) Shell.back();
  else if (o && document.contains(o) && o.offsetParent !== null) o.focus();
}
function syncPanes() {
  var act = Shell.active();
  for (var k in panes) panes[k].hidden = k !== act;
  $("detailView").classList.toggle("has-pane", !!panes[act]);
}
function formField(label, control, id, hint) {
  control.id = id;
  return h("div", { class: "fld" }, h("label", { for: id, text: label }), control, hint ? h("p", { class: "fld-hint", text: hint }) : null);
}

// ---------- Dagen ----------
function dayOffset(n) { var d = startOfDay(new Date()); d.setDate(d.getDate() + n); return d; }
// Kort: "vandaag", "morgen", anders "ma 28 sep".
function dayLabel(d) {
  if (sameDay(d, new Date())) return "vandaag";
  if (sameDay(d, dayOffset(1))) return "morgen";
  return DAYS_S[d.getDay()] + " " + d.getDate() + " " + MONTHS_S[d.getMonth()];
}
function evFromItem(it) {
  var st = zonedDate(it.start), en = zonedDate(it.end);
  return { it: it, start: st, end: en || st, allDay: !!it.isAllDay, cancelled: !!it.isCancelled };
}
// Afspraken van morgen (calEvents() in bronnen.js blijft vandaag).
function calTomorrow() {
  var day = dayOffset(1), next = dayOffset(2);
  return S.cal.items.map(evFromItem).filter(function (e) {
    if (!e.start) return false;
    if (e.allDay) return e.start < next && e.end > day;
    return e.start >= day && e.start < next;
  }).sort(function (a, b) { return a.start - b.start; });
}

// ---------- Uitnodigingen: status ----------
// Lokaal gegeven antwoorden (id -> accept|tentative|decline) en lopende antwoorden (id -> response).
var agResp = {}, agBusy = {};
var agFull = {}; // uri -> {state, data}: volledige afspraak via read_resource (join-link, tekst, antwoordstatus)
var agLastInput = 0;
["click", "keydown"].forEach(function (t) { document.addEventListener(t, function () { agLastInput = Date.now(); }, true); });
function respState(e) {
  var it = e.it, id = str(it.id);
  if (agResp[id]) return agResp[id] === "accept" ? "accepted" : agResp[id] === "tentative" ? "tentativelyAccepted" : "declined";
  var f = agFull[str(it.uri)], rs = (f && f.data && f.data.responseStatus) || it.responseStatus;
  var r = str(isPlain(rs) ? rs.response : rs).toLowerCase();
  if (r === "notresponded" || r === "none") return "open";
  if (r) return r === "accepted" ? "accepted" : r === "organizer" ? "organizer" : r === "tentativelyaccepted" ? "tentativelyAccepted" : r === "declined" ? "declined" : r;
  // Zonder antwoordstatus: Outlook zet een onbeantwoorde uitnodiging als "voorlopig" in de agenda.
  return str(it.showAs).toLowerCase() === "tentative" ? "open" : "";
}
function isInvite(e) {
  var it = e.it;
  return !it.isOrganizer && !e.cancelled && !!e.start && e.end.getTime() > Date.now() && !!str(it.id) && respState(e) === "open";
}
var RESP_BADGE = { accepted: "Geaccepteerd", tentativelyAccepted: "Voorlopig", declined: "Afgewezen" };

// ---------- Agenda: lijst ----------
var planBtn = null;
function agendaHead() {
  if (!planBtn) {
    planBtn = h("button", { class: "btn plan-btn", type: "button", title: "Plan een vergadering (p)", "aria-keyshortcuts": "p",
      onclick: function () { planMeeting(null, planBtn); } }, h("span", { "aria-hidden": "true", text: "+ " }), "Plan een vergadering");
    var head = document.querySelector("#agenda .card-head");
    head.insertBefore(planBtn, head.querySelector("[data-refresh]"));
  }
  planBtn.hidden = !cap.mcp || halted;
}
function renderToday() {
  var body = $("body-agenda");
  agendaHead();
  syncPanes();
  var inner = stateInto(body, "cal");
  setFresh("cal");
  $("cnt-agenda").textContent = "";
  renderVandaag();
  Shell.changed();
  if (!inner) return;
  var evs = calEvents();
  var unknown = calUnknown();
  $("cnt-agenda").textContent = evs.length + unknown.length ? String(evs.length + unknown.length) : "";
  if (!Shell.shown("agenda")) { clear(body); return; }
  if (unknown.length) {
    try { console.warn("[actiepagina] " + unknown.length + " afspraak/afspraken zonder geldige starttijd"); } catch (x) { /* */ }
  }
  inner.append(dayBlock("Vandaag", new Date(), evs, true), dayBlock("Morgen", dayOffset(1), calTomorrow(), false));
  if (unknown.length) {
    var uu = h("ul", { class: "list" });
    unknown.forEach(function (it) {
      var subj = str(it.subject) || "(geen onderwerp)";
      var li = h("li", { class: "row" }, h("div", { class: "row-main" }, h("div", { class: "l1" }, Shell.selTitle(subj)), h("div", { class: "l2", text: [str(it.location), nameFromAddr(it.organizer)].filter(Boolean).join(" · ") })));
      uu.append(Shell.row(li, "event", "event:" + str(it.id || subj), { it: it, start: null, end: null, allDay: false, cancelled: !!it.isCancelled }));
    });
    inner.append(h("div", { class: "agroup" }, h("h3", { text: "Tijd onbekend" }), uu));
  }
}
function dayBlock(title, day, evs, today) {
  var g = h("div", { class: "aday" }, h("h3", null, title, h("span", { class: "n", text: longDate(day) })));
  var allDay = evs.filter(function (e) { return e.allDay; });
  var timed = evs.filter(function (e) { return !e.allDay; });
  if (allDay.length) {
    g.append(h("div", { class: "allday" }, h("b", { text: "Hele dag" }), allDay.map(function (e, i) { return (i ? " · " : "") + (str(e.it.subject) || "(geen onderwerp)"); }).join("")));
  }
  if (!evs.length) { g.append(h("p", { class: "empty", text: today ? "Geen afspraken vandaag." : "Geen afspraken morgen." })); return g; }
  if (!timed.length) return g;
  var nn = today ? nowNext(evs) : { cur: [], next: null };
  var now = Date.now(), nowLabel = "nu " + hhmm(new Date());
  var ul = h("ul", { class: "list timeline" }), lineDone = !today;
  timed.forEach(function (e) {
    if (!lineDone && e.start.getTime() > now) { ul.append(h("li", { class: "nowline", "aria-label": nowLabel }, h("span", { text: nowLabel }))); lineDone = true; }
    ul.append(eventRow(e, nn));
  });
  if (!lineDone) ul.append(h("li", { class: "nowline" }, h("span", { text: nowLabel })));
  g.append(ul);
  if (today && !timed.some(function (e) { return e.end.getTime() > now && !e.cancelled; })) g.append(h("p", { class: "done-note", text: "Je agenda is klaar voor vandaag." }));
  return g;
}
function timeRange(e) { return e.start ? hhmm(e.start) + "-" + hhmm(e.end) : "tijd onbekend"; }
function eventRow(e, nn) {
  var it = e.it;
  nn = nn || { cur: [], next: null };
  var isNow = nn.cur.indexOf(e) >= 0, isNext = nn.next === e;
  var past = e.end.getTime() <= Date.now();
  var row = h("li", { class: "row" + (past ? " past" : "") + (e.cancelled ? " cancelled" : "") + (isNow ? " current" : ""), "aria-current": isNow ? "true" : null });
  var subj = str(it.subject) || "(geen onderwerp)";
  var loc = str(it.location);
  if (/teams/i.test(loc)) loc = "Teams";
  var l2 = [loc, nameFromAddr(it.organizer)].filter(Boolean).join(" · ");
  var main = h("div", { class: "row-main" },
    h("div", { class: "l1" }, h("span", { class: "time", text: timeRange(e) }), Shell.selTitle(subj)),
    l2 ? h("div", { class: "l2", text: l2 }) : null);
  row.append(main);
  var side = h("div", { class: "row-side" });
  var rs = respState(e);
  if (e.cancelled) side.append(h("span", { class: "badge muted", text: "Geannuleerd" }));
  else if (isInvite(e)) side.append(h("span", { class: "badge invite", text: "Uitnodiging" }));
  else if (isNow) side.append(h("span", { class: "badge now", text: "Nu" }));
  else if (isNext) side.append(h("span", { class: "badge next", text: "Volgende" }));
  if (!e.cancelled && agResp[str(it.id)] && RESP_BADGE[rs]) side.append(h("span", { class: "badge muted", text: RESP_BADGE[rs] }));
  if (side.firstChild) row.append(side);
  return Shell.row(row, "event", "event:" + str(it.id || subj + e.start.getTime()), e);
}

// ---------- Detail van een afspraak ----------
function metaList(pairs) {
  var dl = h("dl", { class: "meta-list" });
  pairs.forEach(function (p) { if (p && p[1]) dl.append(h("dt", { text: p[0] }), h("dd", null, p[1])); });
  return dl.firstChild ? dl : null;
}
function evHtmlText(s) {
  return str(s).replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/_{8,}/g, "").trim();
}
// Volledige afspraak ophalen (één keer per uri). Alleen als Thomas de afspraak zelf opent of in Agenda kijkt.
function eventFull(e) {
  var uri = str(e.it.uri);
  if (!uri || !cap.mcp || typeof cap.mcp.callTool !== "function") return null;
  if (agFull[uri]) return agFull[uri];
  var f = agFull[uri] = { state: "loading", data: null };
  var before = isInvite(e);
  cap.mcp.callTool(M365, "read_resource", { uri: uri }).then(function (r) {
    var obj = null;
    (Array.isArray(r && r.content) ? r.content : []).some(function (b) {
      if (!b || b.type !== "text" || typeof b.text !== "string") return false;
      try { var v = JSON.parse(b.text); if (isPlain(v) && (v.subject || isPlain(v.body) || v.attendees || v.onlineMeeting)) { obj = v; return true; } } catch (x) { /* geen JSON */ }
      return false;
    });
    f.state = "ok"; f.data = obj || {};
    var cur = Shell.current();
    if (cur && cur.type === "event" && cur.item && str(cur.item.it.uri) === uri) Shell.refreshDetail();
    if (isInvite(e) !== before) renderToday();
  }, function () { f.state = "err"; });
  return f;
}
function joinUrl(e) {
  var it = e.it, f = agFull[str(it.uri)], d = (f && f.data) || {};
  var om = d.onlineMeeting || it.onlineMeeting;
  var u = safeUrl(om && om.joinUrl) || safeUrl(d.onlineMeetingUrl) || safeUrl(it.onlineMeetingUrl);
  if (u) return u;
  var m = /https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s"'<>]+/.exec(str(d.body && d.body.content).replace(/&amp;/g, "&"));
  return m ? safeUrl(m[0]) : null;
}
function evPersonName(p) {
  if (!p) return "";
  if (isPlain(p) && p.emailAddress) p = p.emailAddress;
  return isPlain(p) ? str(p.name || p.displayName || nameFromAddr(p.address || p.email)) : nameFromAddr(p);
}
function eventWhen(e) {
  if (e.allDay) return e.start ? dayLabel(e.start) + ", hele dag" : "hele dag";
  if (!e.start) return "tijd onbekend";
  return dayLabel(e.start) + " " + timeRange(e) + (e.cancelled ? " (geannuleerd)" : "");
}
Shell.type("event", {
  label: "Afspraak",
  title: function (e) { return str(e.it.subject) || "(geen onderwerp)"; },
  // Context voor Vraag Claude (standaardactie van de schil): ids voor voer_uit, namen en de volledige tekst als die er is.
  context: function (e) { return eventContext(e); },
  inline: function (e) { return "event:" + str(e.it.id); },
  detail: function (e, body) {
    var it = e.it;
    // Volledige afspraak alleen ophalen in Agenda of als Thomas zelf net klikte/typte (niet bij de automatische
    // selectie in Vandaag bij het openen van de pagina).
    if (Shell.active() === "agenda" || Date.now() - agLastInput < 1500) eventFull(e);
    var f = agFull[str(it.uri)], d = (f && f.data) || {};
    var ppl = (Array.isArray(d.attendees) && d.attendees.length ? d.attendees : Array.isArray(it.attendees) ? it.attendees : []).map(evPersonName).filter(Boolean);
    var loc = str(d.location && (d.location.displayName || d.location)) || str(it.location);
    var jl = joinUrl(e);
    var invite = isInvite(e), rs = respState(e);
    if (invite) body.firstChild.textContent = "Uitnodiging";
    add(body, metaList([
      ["Tijd", eventWhen(e)],
      ["Organisator", evPersonName(d.organizer) || nameFromAddr(it.organizer)],
      ["Deelnemers", ppl.slice(0, 12).join(", ") + (ppl.length > 12 ? " en " + (ppl.length - 12) + " anderen" : "")],
      ["Waar", /teams/i.test(loc) && jl ? "Teams" : loc],
      ["Teams", jl ? extLink(jl, "Deelnemen aan de vergadering", "ext") : null],
      ["Antwoord", invite ? "Nog niet beantwoord" : RESP_BADGE[rs] || ""]
    ]));
    var txt = isPlain(d.body) ? (str(d.body.contentType).toLowerCase() === "text" ? str(d.body.content).trim() : evHtmlText(d.body.content)) : "";
    txt = txt || str(it.summary);
    if (txt) body.append(h("p", { class: "detail-text", text: txt.length > 4000 ? txt.slice(0, 3999) + "…" : txt }));
    else if (f && f.state === "loading") body.append(h("p", { class: "hint", text: "Tekst ophalen…" }));
    var key = "event:" + str(it.id);
    if (invite && !inlineCards[key]) inlineCards[key] = respondBox(e);
    if (!invite && inlineCards[key] && !agBusy[str(it.id)]) delete inlineCards[key];
  },
  actions: function (e) {
    var it = e.it;
    var acts = [];
    if (isInvite(e) && cap.mcp) {
      acts.push({ slot: "primary", label: "Accepteer", key: "r", title: "Uitnodiging accepteren, met je bericht als je er een typte (r of Enter in het berichtveld)", run: function (x) { respondEvent(x, "accept"); } });
      acts.push({ slot: "done", label: "Voorlopig", key: "t", title: "Voorlopig accepteren", run: function (x) { respondEvent(x, "tentative"); } });
      acts.push({ slot: "done", label: "Afwijzen", key: "x", title: "Uitnodiging afwijzen (de afspraak verdwijnt uit je agenda)", run: function (x) { respondEvent(x, "decline"); } });
    } else if (!e.cancelled && e.start && joinUrl(e) && e.end.getTime() > Date.now()) {
      acts.push({ slot: "primary", label: "Deelnemen", key: "d", title: "Deelnemen aan de Teams-vergadering", href: joinUrl(e) });
    }
    if (cap.db && !isInvite(e)) acts.push({ slot: "make", label: "Maak actie", key: "a", title: "Actie maken voor na deze afspraak", run: function (x) { eventActie(x); } });
    acts.push(Shell.act.open(it.webLink, "Outlook")); // Vraag Claude (c) voegt de schil toe, met context() hieronder
    if (!isInvite(e) && !e.cancelled && e.start && cap.sample) acts.push({ slot: "extra", label: "Bereid voor", key: "b", title: "Laat Claude deze afspraak voorbereiden", run: function (x, btn) { prepareMeeting(x.it, x, btn); } });
    return acts;
  }
});

function eventContext(e) {
  var it = e.it, f = agFull[str(it.uri)], d = (f && f.data) || {};
  var who = function (p) { var n = planPerson(p); return n ? n.name + " <" + n.email + ">" : evPersonName(p); };
  var ppl = (Array.isArray(d.attendees) && d.attendees.length ? d.attendees : Array.isArray(it.attendees) ? it.attendees : []).map(who).filter(Boolean);
  var txt = isPlain(d.body) ? (str(d.body.contentType).toLowerCase() === "text" ? str(d.body.content) : evHtmlText(d.body.content)) : "";
  return [
    "Afspraak", "eventId: " + str(it.id), "uri: " + str(it.uri), "Onderwerp: " + str(it.subject), "Tijd: " + eventWhen(e),
    "Waar: " + (str(d.location && d.location.displayName) || str(it.location)), "Organisator: " + who(d.organizer || it.organizer),
    ppl.length ? "Deelnemers: " + ppl.slice(0, 20).join(", ") : "",
    isInvite(e) ? "Uitnodiging: nog niet beantwoord (beantwoorden met outlook_respond_to_event)" : RESP_BADGE[respState(e)] ? "Antwoord: " + RESP_BADGE[respState(e)] : "",
    txt ? "Volledige tekst (data):\n" + trunc(txt, 3000) : it.summary ? "Beschrijving: " + trunc(it.summary, 3000) : ""
  ].filter(Boolean).join("\n");
}
// Berichtveld onder de actiebalk: optioneel bericht aan de organisator bij Accepteer, Voorlopig of Afwijzen.
function respondBox(e) {
  var it = e.it, id = "resp-" + str(it.id).replace(/[^A-Za-z0-9_-]/g, "").slice(-40);
  var org = nameFromAddr(it.organizer) || "de organisator";
  var inp = h("input", { type: "text", id: id, maxlength: "1024", autocomplete: "off", placeholder: "Bijvoorbeeld: ik schuif na tien minuten aan",
    title: "Enter accepteert met dit bericht, Esc verlaat het veld" });
  inp.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter" && !ev.isComposing) { ev.preventDefault(); var c = Shell.current(); respondEvent(c && c.type === "event" ? c.item : e, "accept"); }
    else if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); inp.blur(); }
  });
  var box = h("div", { class: "respond", role: "group", "aria-label": "Antwoord op de uitnodiging" },
    h("label", { for: id, text: "Bericht aan " + org + " (optioneel)" }), inp, h("div", { class: "resp-status", "aria-live": "polite" }));
  box._input = inp;
  return box;
}
function setRespStatus(box, content) {
  if (!box) return;
  var s = box.querySelector(".resp-status");
  clear(s); add(s, content);
}
var RESP_DONE = { accept: "Geaccepteerd", tentative: "Voorlopig geaccepteerd", decline: "Afgewezen" };
var RESP_BUSY = { accept: "Accepteren…", tentative: "Voorlopig accepteren…", decline: "Afwijzen…" };
// Beantwoordt een uitnodiging. reverse: terugdraai-actie uit de feedbackbalk (Toch afwijzen / Toch accepteren).
function respondEvent(e, response, reverse) {
  var it = e.it, id = str(it.id), key = "event:" + id;
  if (!cap.mcp || !id || agBusy[id]) return;
  var box = inlineCards[key];
  var comment = !reverse && box && box._input ? box._input.value.trim() : "";
  var input = { eventId: id, response: response, sendResponse: true };
  if (comment) input.comment = comment.slice(0, 1024);
  agBusy[id] = response;
  setRespStatus(box, RESP_BUSY[response]);
  logEvent("uitnodiging_" + response);
  var subj = trunc(str(it.subject) || "afspraak", 60);
  Promise.resolve().then(function () { return cap.mcp.callTool(M365, "outlook_respond_to_event", input); }).then(function () {
    delete agBusy[id];
    agResp[id] = response;
    if (inlineCards[key]) { var c = inlineCards[key]; if (c.parentNode) c.parentNode.removeChild(c); delete inlineCards[key]; }
    var back = response === "accept" ? "decline" : "accept";
    feedback({ text: RESP_DONE[response] + ": " + subj, undo: function () { respondEvent(e, back, true); }, undoLabel: back === "decline" ? "Toch afwijzen" : "Toch accepteren" });
    afterResponse(key);
  }, function (err) {
    delete agBusy[id];
    if (reverse) {
      feedback({ icon: "⚠", text: "Terugdraaien lukte niet voor " + subj + ". Open de afspraak in Outlook.", link: it.webLink, linkLabel: "Open in Outlook" });
    } else {
      setRespStatus(box, [agError(err, "Outlook nam je antwoord niet aan.", true), h("button", { class: "btn", type: "button", text: "Opnieuw proberen", title: "Opnieuw proberen (Enter in het berichtveld accepteert)",
        onclick: function () { respondEvent(e, response); } })]);
      feedback({ icon: "⚠", text: "Beantwoorden lukte niet: " + subj });
    }
    afterResponse(key);
  });
}
// Fout bij een agenda-aanroep in mensentaal, met Details. write: bij een schrijfactie is de uitkomst soms onzeker.
function agError(e, text, write) {
  var code = errCode(e), lines;
  if (write && (code === "server_unavailable" || code === "upstream_error" || code === "rate_limited"))
    lines = ["Microsoft 365 reageerde niet goed. Het is niet zeker of het gelukt is; kijk eerst in Outlook voor je het opnieuw probeert."];
  else if (code === "tool_error" || code === "bad_request" || code === "upstream_error") lines = [text];
  else lines = describeError(e, "cal").lines;
  return h("div", { class: "alert", role: "alert" }, h("p", null, h("span", { "aria-hidden": "true", text: "⚠ " }), lines.join(" ")),
    e && e.code ? h("details", null, h("summary", { text: "Details" }), h("span", { class: "mono", text: str(e.code) + (e.message ? ": " + trunc(e.message, 200) : "") })) : null);
}
function afterResponse(key) {
  renderToday();
  var cur = Shell.current();
  if (cur && cur.key === key) Shell.refreshDetail();
  if (cap.mcp && !halted) refresh("cal");
}

// Maak actie vanuit een afspraak: blijft in Agenda, actie met bron agenda en "Na <titel>" als waarom.
function progIn(text) {
  var t = str(text).toLowerCase();
  for (var i = 0; i < PROG_NAMES.length; i++) if (PROG_NAMES[i] !== "Overig" && t.indexOf(PROG_NAMES[i].toLowerCase()) >= 0) return PROG_NAMES[i];
  return null;
}
// Naar Acties en de actie selecteren (Bekijk in de feedbackbalk).
function showActie(id) { Shell.go("acties", { user: true }); Shell.select("actie:" + id, { user: true, focus: true, scroll: true }); }
function eventActie(e) {
  var it = e.it, subj = str(it.subject) || "afspraak";
  var prog = progIn(subj);
  var f = { text: "Opvolgen: " + subj, who: "eigen actie", prog: prog || "Overig", bron: "agenda", bronUrl: it.webLink, van: nameFromAddr(it.organizer),
    onderwerp: subj, why: "Na " + subj };
  logEvent("maak_actie", "agenda");
  addActie(f).then(function (r) {
    feedback({ text: "Actie toegevoegd bij " + f.prog + ": " + trunc(f.text, 50), undo: function () { deleteActie(findActie(r.id) || { id: r.id }); },
      action: { label: "Bekijk", title: "Naar de actie in Acties", run: function () { showActie(r.id); } } });
    if (!prog && r) suggestProg(r.id, f.text);
  }, function () { feedback({ icon: "⚠", text: "Actie niet opgeslagen. Probeer het opnieuw." }); });
}

// ---------- Plan een vergadering ----------
// planMeeting(prefill?, opener?): opent de planner in de detailkolom van Agenda.
// prefill: {subject, attendees: [{name, email}] of e-mailadressen, note, duration: 30|60}. Ook aan te roepen vanuit een mail.
var PLAN_DAYS = 5;
function planMeeting(prefill, opener) {
  if (!cap.mcp) { announce("Plannen kan hier niet: geen koppeling met Microsoft 365."); return; }
  prefill = prefill || {};
  logEvent("plan_open");
  if (!Shell.shown("agenda")) Shell.go("agenda", { user: true });
  var el = plannerEl(prefill);
  openPane("agenda", el, opener || planBtn);
  var first = el.querySelector(el._people.length ? "#pl-subj" : "#pl-who");
  if (el._people.length && prefill.subject) first = el.querySelector("#pl-go");
  if (first) first.focus();
}
var PLAN_EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[a-z]{2,}$/i;
function planPerson(p) {
  if (!p) return null;
  if (typeof p === "string") {
    var m = /^(.*?)\s*<([^>]+)>$/.exec(p.trim());
    var em = (m ? m[2] : p).trim().toLowerCase();
    return PLAN_EMAIL_RE.test(em) ? { name: m && m[1] ? m[1].replace(/^"|"$/g, "") : nameFromAddr(em), email: em } : null;
  }
  if (isPlain(p) && p.emailAddress) p = p.emailAddress;
  var e2 = str(p.email || p.address || p.mail).trim().toLowerCase();
  if (!PLAN_EMAIL_RE.test(e2)) return null;
  return { name: str(p.name || p.displayName).trim() || nameFromAddr(e2), email: e2 };
}
// Suggesties: het adresboek van de app (window.addressBook, groep A) als dat er is, anders deelnemers uit de agenda.
function planLocalPeople() {
  var seen = {}, out = [];
  function take(p) { var n = planPerson(p); if (n && !seen[n.email]) { seen[n.email] = 1; out.push(n); } }
  S.cal.items.forEach(function (it) { take(it.organizer); (Array.isArray(it.attendees) ? it.attendees : []).forEach(take); });
  return out;
}
function planSearch(q) {
  q = str(q).trim().toLowerCase();
  var src = null;
  try { if (window.addressBook && typeof window.addressBook.search === "function") src = window.addressBook.search(q); } catch (e) { src = null; }
  return Promise.resolve(src).then(function (r) { return Array.isArray(r) ? r : null; }, function () { return null; }).then(function (r) {
    var list = (r || []).map(planPerson).filter(Boolean);
    if (!list.length) list = planLocalPeople().filter(function (p) { return !q || p.name.toLowerCase().indexOf(q) >= 0 || p.email.indexOf(q) >= 0; });
    return list;
  });
}
function plannerEl(pre) {
  var el = h("section", { class: "planner", "aria-labelledby": "pl-t" });
  var people = [];
  (Array.isArray(pre.attendees) ? pre.attendees : []).forEach(function (p) { var n = planPerson(p); if (n && n.email !== me.email && !people.some(function (x) { return x.email === n.email; })) people.push(n); });
  el._people = people;
  var st = { dur: pre.duration === 60 ? 60 : 30, week: 0, busy: false, slots: [], seq: 0, active: -1, sugg: [] };
  var chips = h("div", { class: "chips" });
  var who = h("input", { type: "text", role: "combobox", "aria-autocomplete": "list", "aria-expanded": "false", "aria-controls": "pl-sug", autocomplete: "off",
    placeholder: "Naam of e-mailadres", title: "Typ een naam; Enter kiest, Backspace haalt de laatste weg" });
  var sug = h("ul", { id: "pl-sug", role: "listbox", class: "sugg", "aria-label": "Suggesties", hidden: true });
  var subj = h("input", { type: "text", maxlength: "255", autocomplete: "off", placeholder: "Waar gaat het over?", title: "Enter zoekt tijd" });
  subj.value = str(pre.subject);
  var note = h("textarea", { rows: "3", maxlength: "4000", placeholder: "Doel of agenda, in je eigen woorden" });
  note.value = str(pre.note);
  var result = h("div", { class: "pl-result", "aria-live": "polite" });
  var go = h("button", { class: "btn primary", type: "button", id: "pl-go", title: "Zoek vrije tijd in de komende " + PLAN_DAYS + " werkdagen (Enter)", text: "Zoek tijd" });
  var durBox = h("div", { class: "seg", role: "radiogroup", "aria-label": "Duur" });
  [30, 60].forEach(function (m) {
    var r = h("input", { type: "radio", name: "pl-dur", value: String(m), id: "pl-dur-" + m });
    r.checked = st.dur === m;
    r.addEventListener("change", function () { if (r.checked) { st.dur = m; resetSlots(); } });
    durBox.append(h("label", { for: "pl-dur-" + m, title: m + " minuten" }, r, h("span", { text: m + " min" })));
  });
  var gen = cap.sample ? h("button", { class: "btn text", type: "button", title: "Laat Claude een korte agendatekst schrijven in jouw stijl", text: "Laat Claude schrijven" }) : null;

  function paintChips() {
    clear(chips);
    people.forEach(function (p, i) {
      chips.append(h("span", { class: "chip" }, h("span", { text: p.name, title: p.email }),
        h("button", { class: "chip-x", type: "button", "aria-label": "Haal " + p.name + " weg", title: "Weghalen (Backspace in het lege veld haalt de laatste weg)", text: "✕",
          onclick: function () { people.splice(i, 1); paintChips(); resetSlots(); who.focus(); } })));
    });
    chips.append(who);
  }
  function addPerson(p) {
    var n = planPerson(p);
    if (!n || n.email === me.email) return false;
    if (!people.some(function (x) { return x.email === n.email; })) people.push(n);
    who.value = ""; closeSug(); paintChips(); resetSlots(); who.focus();
    return true;
  }
  function closeSug() { sug.hidden = true; who.setAttribute("aria-expanded", "false"); who.removeAttribute("aria-activedescendant"); st.active = -1; }
  function paintSug() {
    clear(sug);
    st.sugg.forEach(function (p, i) {
      var li = h("li", { role: "option", id: "pl-opt-" + i, "aria-selected": i === st.active ? "true" : "false" }, h("span", { text: p.name }), h("span", { class: "sub", text: p.email }));
      li.addEventListener("mousedown", function (ev) { ev.preventDefault(); addPerson(p); });
      sug.append(li);
    });
    sug.hidden = !st.sugg.length;
    who.setAttribute("aria-expanded", st.sugg.length ? "true" : "false");
    if (st.active >= 0) who.setAttribute("aria-activedescendant", "pl-opt-" + st.active); else who.removeAttribute("aria-activedescendant");
  }
  function suggest() {
    var q = who.value.trim(), my = ++st.seq;
    if (!q) { st.sugg = []; closeSug(); return; }
    planSearch(q).then(function (list) {
      if (my !== st.seq) return;
      st.sugg = list.filter(function (p) { return p.email !== me.email && !people.some(function (x) { return x.email === p.email; }); }).slice(0, 6);
      st.active = st.sugg.length ? 0 : -1;
      st.sugQ = q;
      paintSug();
    });
  }
  who.addEventListener("input", suggest);
  who.addEventListener("blur", function () { setTimeout(closeSug, 150); });
  who.addEventListener("keydown", function (ev) {
    if (ev.key === "ArrowDown" && st.sugg.length) { ev.preventDefault(); st.active = (st.active + 1) % st.sugg.length; paintSug(); }
    else if (ev.key === "ArrowUp" && st.sugg.length) { ev.preventDefault(); st.active = (st.active - 1 + st.sugg.length) % st.sugg.length; paintSug(); }
    else if ((ev.key === "Enter" || ev.key === "," || ev.key === ";" || ev.key === "Tab") && who.value.trim()) {
      // Suggesties zijn er (voor precies deze tekst): kies de actieve. Anders een volledig adres, of (snel getypt,
      // suggesties nog onderweg) de eerste treffer voor de getypte naam.
      var q = who.value.trim();
      var pick = !sug.hidden && st.sugQ === q && st.active >= 0 ? st.sugg[st.active] : planPerson(q);
      if (pick) { ev.preventDefault(); addPerson(pick); }
      else if (ev.key !== "Tab") {
        ev.preventDefault();
        planSearch(q).then(function (list) {
          if (who.value.trim() !== q) return;
          var hit = list.filter(function (p) { return p.email !== me.email && !people.some(function (x) { return x.email === p.email; }); })[0];
          if (hit) addPerson(hit); else showMsg("Kies iemand uit de suggesties of typ een volledig e-mailadres.");
        });
      }
    } else if (ev.key === "Enter" && !who.value.trim()) { ev.preventDefault(); subj.focus(); }
    else if (ev.key === "Backspace" && !who.value && people.length) { people.pop(); paintChips(); resetSlots(); }
    else if (ev.key === "Escape" && !sug.hidden) { ev.preventDefault(); ev.stopPropagation(); closeSug(); }
  });
  subj.addEventListener("keydown", function (ev) { if (ev.key === "Enter" && !ev.isComposing) { ev.preventDefault(); findTime(); } });
  subj.addEventListener("input", function () { if (st.slots.length) resetSlots(); });
  note.addEventListener("keydown", function (ev) { if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); findTime(); } });
  go.addEventListener("click", function () { findTime(); });
  if (gen) gen.addEventListener("click", function () { writeNote(); });

  function showMsg(t, extra) { clear(result); add(result, [h("p", { class: "pl-msg", text: t }), extra]); }
  function resetSlots() { if (st.busy) return; st.slots = []; st.week = 0; clear(result); }
  function range(week) {
    // De komende werkdagen: vandaag telt mee als het een werkdag is en er nog tijd over is.
    var days = [], d = startOfDay(new Date()), now = new Date();
    if (now.getHours() >= 17) d.setDate(d.getDate() + 1);
    while (days.length < PLAN_DAYS * (week + 1)) { if (d.getDay() > 0 && d.getDay() < 6) days.push(new Date(d)); d.setDate(d.getDate() + 1); }
    days = days.slice(PLAN_DAYS * week);
    var from = days[0], to = new Date(days[days.length - 1]); to.setDate(to.getDate() + 1);
    if (from < now) from = new Date(Math.ceil((now.getTime() + 10 * 60000) / 900000) * 900000);
    return { from: from, to: to, days: days };
  }
  function utc(d) { return d.toISOString().replace(/\.\d{3}Z$/, "Z"); }
  function findTime(week) {
    if (st.busy) return;
    if (who.value.trim()) { var p = planPerson(who.value); if (p) addPerson(p); else { showMsg("Kies iemand uit de suggesties of typ een volledig e-mailadres."); who.focus(); return; } }
    if (!people.length) { showMsg("Voeg minstens een deelnemer toe."); who.focus(); return; }
    if (!subj.value.trim()) { showMsg("Vul een onderwerp in."); subj.focus(); return; }
    st.week = week || 0;
    var r = range(st.week);
    st.busy = true;
    showMsg("Vrije tijd zoeken…");
    logEvent("plan_zoek_tijd");
    var input = { afterDateTime: utc(r.from), beforeDateTime: utc(r.to), durationMinutes: st.dur, participants: people.map(function (x) { return x.email; }), maxCandidates: 40 };
    Promise.resolve().then(function () { return cap.mcp.callTool(M365, "outlook_find_available_time", input); }).then(function (res) {
      st.busy = false;
      var data = freeTimePayload(res);
      st.slots = bestFreeSlots(data.availableTimes, st.dur);
      paintSlots(r, data);
    }, function (err) {
      st.busy = false;
      showMsg("", h("div", null, agError(err, "Beschikbaarheid ophalen lukte niet."), h("button", { class: "btn", type: "button", text: "Opnieuw proberen", onclick: function () { findTime(st.week); } })));
    });
  }
  function paintSlots(r, data) {
    clear(result);
    var span = dayLabel(r.days[0]) + " t/m " + dayLabel(r.days[r.days.length - 1]);
    var more = h("button", { class: "btn", type: "button", id: "pl-more", title: "Zoek in de " + PLAN_DAYS + " werkdagen daarna (a)", "aria-keyshortcuts": "a", text: "Andere dagen",
      onclick: function () { findTime(st.week + 1); } });
    var unk = (Array.isArray(data.unavailableParticipants) ? data.unavailableParticipants : []).map(function (x) { var n = planPerson(x); return n ? n.name : str(x); }).filter(Boolean);
    if (!st.slots.length) {
      result.append(h("p", { class: "pl-msg", text: "Geen tijd gevonden waarop iedereen kan, " + span + ". Probeer andere dagen of een kortere duur." }), h("div", { class: "btns" }, more));
      more.focus();
      return;
    }
    result.append(h("p", { class: "pl-msg", text: "Beste momenten, " + span + ":" }));
    var list = h("div", { class: "slots", role: "group", "aria-label": "Vrije momenten" });
    st.slots.forEach(function (s, i) {
      var b = h("button", { class: "btn slot", type: "button", title: "Plan op " + dayLabel(s.start) + " " + hhmm(s.start) + " (" + (i + 1) + ")", "aria-keyshortcuts": String(i + 1) },
        h("span", { class: "slot-day", text: dayLabel(s.start) }), h("span", { class: "slot-time", text: hhmm(s.start) + "-" + hhmm(s.end) }),
        s.allFree ? null : h("span", { class: "slot-note", text: "niet iedereen zeker" }));
      b.addEventListener("click", function () { createAt(s); });
      list.append(b);
    });
    result.append(list, h("div", { class: "btns" }, more));
    if (unk.length) result.append(h("p", { class: "fld-hint", text: "Agenda niet te zien van " + unk.join(", ") + "; hun beschikbaarheid is niet zeker." }));
  }
  function createAt(s) {
    if (st.busy) return;
    st.busy = true;
    var dayTime = dayLabel(s.start) + " " + hhmm(s.start);
    showMsg("Vergadering plannen op " + dayTime + "…");
    var input = {
      subject: subj.value.trim().slice(0, 255),
      start: { dateTime: amsWall(s.start), timeZone: "Europe/Amsterdam" },
      end: { dateTime: amsWall(s.end), timeZone: "Europe/Amsterdam" },
      attendees: people.map(function (x) { var a = { email: x.email, type: "required" }; if (x.name) a.name = x.name.slice(0, 256); return a; }),
      isOnlineMeeting: true
    };
    var body = agendaNote(note.value);
    if (body) { input.body = body; input.bodyType = "text"; }
    logEvent("plan_maak");
    Promise.resolve().then(function () { return cap.mcp.callTool(M365, "outlook_create_event", input); }).then(function (r) {
      st.busy = false;
      closePane("agenda", true);
      feedback({ text: "Vergadering gepland op " + dayTime + ": " + trunc(input.subject, 50), link: findLink(r), linkLabel: "Bekijk" });
      if (!halted) refresh("cal");
      if (planBtn && planBtn.offsetParent !== null) planBtn.focus();
    }, function (err) {
      st.busy = false;
      showMsg("", h("div", null, agError(err, "Outlook maakte de vergadering niet aan.", true), h("div", { class: "btns" },
        h("button", { class: "btn", type: "button", text: "Opnieuw proberen", onclick: function () { createAt(s); } }),
        h("button", { class: "btn", type: "button", text: "Andere tijd kiezen", onclick: function () { paintSlots(range(st.week), {}); } }))));
    });
  }
  var genCtl = null;
  function writeNote() {
    if (!cap.sample || genCtl) return;
    genCtl = new AbortController();
    var prev = note.value.trim();
    gen.textContent = "Claude schrijft…";
    var prompt = [
      "Schrijf de tekst voor een Teams-uitnodiging namens Thomas (Software Development Manager, PAF-programma's).",
      "Onderwerp: " + (subj.value.trim() || "(nog geen onderwerp)"), "Deelnemers: " + people.map(function (x) { return x.name; }).join(", "), "Duur: " + st.dur + " minuten.",
      prev ? "Aanzet of aanwijzing van Thomas (data): " + trunc(prev, 1500) : "",
      "Stijl van Thomas: eerst het doel of de vraag, dan waarom; details als \"- \" bullets; warm maar zonder opvulling; geen hedging.",
      "Geen aanhef en geen afsluiter (dus geen KR/Thomas): Outlook toont al wie uitnodigt. Nooit em-dashes. Nooit \"that said\", wel \"that being said\". Maximaal vijf regels. Alleen de tekst."
    ].filter(Boolean).join("\n");
    runSample(prompt, { modelTier: "default", signal: genCtl.signal, onText: function (t) { note.value = t; } }).then(function (t) {
      note.value = agendaNote(t) || prev;
    }, function (e) { note.value = prev; if (!(e && e.code === "cancelled")) showMsg(sampleErrText(e)); }).then(function () {
      genCtl = null; if (gen) gen.textContent = "Laat Claude schrijven"; note.focus();
    });
  }
  el._close = function () { if (genCtl) try { genCtl.abort(); } catch (e) { /* */ } };
  // In de planner: 1, 2, 3 kiezen een moment, a zoekt andere dagen (tooltips noemen de toets).
  el._keys = function (ev) {
    var n = +ev.key;
    if (n >= 1 && n <= st.slots.length && !ev.shiftKey) { ev.preventDefault(); createAt(st.slots[n - 1]); return true; }
    if (ev.key === "a" && el.querySelector("#pl-more") && !st.busy) { ev.preventDefault(); findTime(st.week + 1); return true; }
    return false;
  };
  paintChips();
  add(el, [
    h("div", { class: "dpane-head" }, h("h3", { id: "pl-t", text: "Plan een vergadering" }),
      h("button", { class: "icon-btn", type: "button", "aria-label": "Planner sluiten", title: "Sluiten (Esc)", text: "✕", onclick: function () { closePane("agenda"); } })),
    h("div", { class: "fld" }, h("label", { for: "pl-who", text: "Deelnemers" }), chips, sug),
    formField("Onderwerp", subj, "pl-subj"),
    h("div", { class: "fld" }, h("span", { class: "fld-label", id: "pl-dur-l", text: "Duur" }), durBox),
    h("div", { class: "fld" }, h("div", { class: "fld-row" }, h("label", { for: "pl-note", text: "Notitie (optioneel)" }), gen), note,
      h("p", { class: "fld-hint", text: "Komt in de uitnodiging. Het wordt een Teams-vergadering." })),
    h("div", { class: "btns" }, go),
    result]);
  note.id = "pl-note"; who.id = "pl-who";
  durBox.setAttribute("aria-labelledby", "pl-dur-l"); durBox.removeAttribute("aria-label");
  return el;
}
// Wandkloktijd in Europe/Amsterdam ("2026-09-28T10:00:00") van een Date.
function amsWall(d) {
  try { return new Date(tzParts(d.getTime(), "Europe/Amsterdam")).toISOString().slice(0, 19); } catch (e) { return isoDay(d) + "T" + hhmm(d) + ":00"; }
}
// Tekst van de uitnodiging: Thomas' stem (geen em-dashes, "that being said"); geen KR/Thomas, het is geen brief.
function agendaNote(t) {
  return stripDashes(str(t)).replace(/\r\n/g, "\n").replace(/\b([Tt])hat said\b/g, "$1hat being said").replace(/(?:^|\n)[ \t]*KR[ \t]*\n[ \t]*Thomas[ \t]*$/i, "").trim();
}
function freeTimePayload(res) {
  var list = items(res, { first: true });
  var o = list.filter(function (x) { return x && Array.isArray(x.availableTimes); })[0];
  if (o) return o;
  if (isPlain(res && res.payload) && Array.isArray(res.payload.availableTimes)) return res.payload;
  // Losse sloten (een blok per slot).
  return { availableTimes: list.filter(function (x) { return x && x.start && x.end; }) };
}
// De drie beste momenten: binnen werktijd (ma-vr 08:30-18:00, niet in het verleden), iedereen vrij eerst, dan hoogste
// zekerheid, dan het vroegst; getoond op volgorde van tijd.
function bestFreeSlots(list, dur) {
  var now = Date.now() + 10 * 60000, seen = {};
  var out = (Array.isArray(list) ? list : []).map(function (s) {
    var st = zonedDate(s && s.start);
    if (!st) return null;
    var en = new Date(st.getTime() + dur * 60000);
    var att = Array.isArray(s.attendeeAvailability) ? s.attendeeAvailability : [];
    var allFree = att.every(function (a) { return str(a && a.availability).toLowerCase() === "free"; }) && str(s.organizerAvailability || "free").toLowerCase() === "free";
    var conf = typeof s.confidence === "number" ? s.confidence : parseFloat(s.confidence) || 0;
    return { start: st, end: en, allFree: allFree, conf: conf };
  }).filter(function (s) {
    if (!s || s.start.getTime() < now || seen[s.start.getTime()]) return false;
    var wd = s.start.getDay(), m0 = s.start.getHours() * 60 + s.start.getMinutes(), m1 = m0 + dur;
    if (wd === 0 || wd === 6 || m0 < 8 * 60 + 30 || m1 > 18 * 60 || !sameDay(s.start, new Date(s.end.getTime() - 1))) return false;
    seen[s.start.getTime()] = 1;
    return true;
  });
  out.sort(function (a, b) { return (b.allFree - a.allFree) || (b.conf - a.conf) || (a.start - b.start); });
  return out.slice(0, 3).sort(function (a, b) { return a.start - b.start; });
}
// Toets p: Plan een vergadering (overal, niet tijdens typen).
document.addEventListener("keydown", function (e) {
  if (e.key !== "p" || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || typingIn(e.target)) return;
  if ($("keys").open || !$("chat").hidden || !cap.mcp || halted) return;
  e.preventDefault();
  planMeeting(null, planBtn && planBtn.offsetParent !== null ? planBtn : null);
});

Shell.entry("agenda", {
  label: "Agenda",
  render: renderToday,
  empty: "Kies een afspraak om hem hier te openen. Nieuwe vergadering: p.",
  count: function () { return S.cal.hasData ? calEvents().filter(function (e) { return !e.allDay && !e.cancelled && e.end.getTime() > Date.now(); }).length : ""; },
  // Start bij wat nu loopt of straks komt, niet bij wat al voorbij is.
  first: function (rows) { return rows.filter(function (r) { var e = r._sel.item; return e.end && e.end.getTime() > Date.now(); })[0] || rows[0]; }
});
