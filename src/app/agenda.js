// Agenda: tijdlijn van vandaag (ingang Agenda) en het detail van een afspraak.
"use strict";

// ---------- Agenda ----------
function renderToday() {
  var body = $("body-agenda");
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
  if (!evs.length && !unknown.length) { inner.append(h("p", { class: "empty", text: "Geen afspraken vandaag." })); return; }
  if (unknown.length) {
    try { console.warn("[actiepagina] " + unknown.length + " afspraak/afspraken zonder geldige starttijd"); } catch (x) { /* */ }
  }
  var allDay = evs.filter(function (e) { return e.allDay; });
  var timed = evs.filter(function (e) { return !e.allDay; });
  if (allDay.length) {
    inner.append(h("div", { class: "allday" }, h("b", { text: "Hele dag" }), allDay.map(function (e, i) { return (i ? " · " : "") + (str(e.it.subject) || "(geen onderwerp)"); }).join("")));
  }
  var nn = nowNext(evs);
  var now = Date.now();
  var ul = h("ul", { class: "list timeline" });
  var lineDone = false;
  timed.forEach(function (e) {
    if (!lineDone && e.start.getTime() > now) {
      ul.append(h("li", { class: "nowline", "aria-label": "nu " + hhmm(new Date()) }, h("span", { text: "nu " + hhmm(new Date()) })));
      lineDone = true;
    }
    ul.append(eventRow(e, nn));
  });
  if (!lineDone && timed.length) ul.append(h("li", { class: "nowline" }, h("span", { text: "nu " + hhmm(new Date()) })));
  inner.append(ul);
  var remaining = timed.filter(function (e) { return e.end.getTime() > now && !e.cancelled; });
  if (timed.length && !remaining.length) inner.append(h("p", { class: "done-note", text: "Je agenda is klaar voor vandaag." }));
  if (!timed.length) ul.remove();
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
function timeRange(e) { return e.start ? hhmm(e.start) + "-" + hhmm(e.end) : "tijd onbekend"; }
function eventRow(e, nn) {
  var it = e.it;
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
  if (e.cancelled) side.append(h("span", { class: "badge muted", text: "Geannuleerd" }));
  else if (isNow) side.append(h("span", { class: "badge now", text: "Nu" }));
  else if (isNext) side.append(h("span", { class: "badge next", text: "Volgende" }));
  if (side.firstChild) row.append(side);
  return Shell.row(row, "event", "event:" + str(it.id || subj + e.start.getTime()), e);
}

// Detail van een afspraak.
function metaList(pairs) {
  var dl = h("dl", { class: "meta-list" });
  pairs.forEach(function (p) { if (p && p[1]) dl.append(h("dt", { text: p[0] }), h("dd", { text: p[1] })); });
  return dl.firstChild ? dl : null;
}
Shell.type("event", {
  label: "Afspraak",
  title: function (e) { return str(e.it.subject) || "(geen onderwerp)"; },
  detail: function (e, body) {
    var it = e.it;
    var who = (Array.isArray(it.attendees) ? it.attendees : []).map(nameFromAddr).filter(Boolean);
    add(body, metaList([
      ["Tijd", e.allDay ? "hele dag" : timeRange(e) + (e.cancelled ? " (geannuleerd)" : "")],
      ["Waar", str(it.location)],
      ["Organisator", nameFromAddr(it.organizer)],
      ["Met", who.slice(0, 12).join(", ") + (who.length > 12 ? " en " + (who.length - 12) + " anderen" : "")]
    ]));
    if (it.summary) body.append(h("p", { class: "detail-text", text: trunc(it.summary, 2000) }));
  },
  actions: function (e) {
    var it = e.it;
    return [
      !e.cancelled && e.start && cap.sample ? { slot: "primary", label: "Bereid voor", key: "b", title: "Laat Claude deze afspraak voorbereiden", run: function (x, btn) { prepareMeeting(it, e, btn); } } : null,
      Shell.act.open(it.webLink, "Outlook")
    ];
  }
});
Shell.entry("agenda", {
  label: "Agenda",
  render: renderToday,
  empty: "Kies een afspraak om hem hier te openen.",
  count: function () { return S.cal.hasData ? calEvents().filter(function (e) { return !e.allDay && !e.cancelled && e.end.getTime() > Date.now(); }).length : ""; },
  // Start bij wat nu loopt of straks komt, niet bij wat al voorbij is.
  first: function (rows) { return rows.filter(function (r) { var e = r._sel.item; return e.end && e.end.getTime() > Date.now(); })[0] || rows[0]; }
});
