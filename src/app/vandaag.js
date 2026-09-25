// Vandaag: agenda van vandaag.
"use strict";

// ---------- Vandaag ----------
function renderToday() {
  var body = $("body-vandaag");
  var inner = stateInto(body, "cal");
  setFresh("cal");
  $("cnt-vandaag").textContent = "";
  if (!inner) return;
  var evs = calEvents();
  var unknown = calUnknown();
  $("cnt-vandaag").textContent = evs.length + unknown.length ? String(evs.length + unknown.length) : "";
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
      var subj = str(it.subject) || "(geen onderwerp)", url = safeUrl(it.webLink);
      var t = url ? h("a", { class: "stretch title", href: url, target: "_blank", rel: "noopener noreferrer" }, subj, h("span", { class: "sr", text: " (opent in nieuw tabblad)" })) : h("span", { class: "title", text: subj });
      uu.append(h("li", { class: "row" }, h("div", { class: "row-main" }, h("div", { class: "l1" }, t), h("div", { class: "l2", text: [str(it.location), nameFromAddr(it.organizer)].filter(Boolean).join(" · ") }))));
    });
    inner.append(h("div", { class: "agroup" }, h("h3", { text: "Tijd onbekend" }), uu));
  }
}
function eventRow(e, nn) {
  var it = e.it;
  var isNow = nn.cur.indexOf(e) >= 0, isNext = nn.next === e;
  var past = e.end.getTime() <= Date.now();
  var row = h("li", { class: "row" + (past ? " past" : "") + (e.cancelled ? " cancelled" : "") + (isNow ? " current" : ""), "aria-current": isNow ? "true" : null });
  var subj = str(it.subject) || "(geen onderwerp)";
  var url = safeUrl(it.webLink);
  var titleEl = url ? h("a", { class: "stretch title", href: url, target: "_blank", rel: "noopener noreferrer" }, subj, h("span", { class: "sr", text: " (opent in nieuw tabblad)" })) : h("span", { class: "title", text: subj });
  var loc = str(it.location);
  if (/teams/i.test(loc)) loc = "Teams";
  var l2 = [loc, nameFromAddr(it.organizer)].filter(Boolean).join(" · ");
  var main = h("div", { class: "row-main" },
    h("div", { class: "l1" }, h("span", { class: "time", text: hhmm(e.start) + "–" + hhmm(e.end) }), titleEl),
    l2 ? h("div", { class: "l2", text: l2 }) : null);
  var acts = h("div", { class: "row-actions" });
  if (!e.cancelled && cap.sample) acts.append(h("button", { class: "btn text", type: "button", text: "Bereid voor", onclick: function (ev) { prepareMeeting(it, e, ev.currentTarget); } }));
  add(acts, extLink(it.webLink, "Open"));
  if (acts.firstChild) main.append(acts);
  row.append(main);
  var side = h("div", { class: "row-side" });
  if (e.cancelled) side.append(h("span", { class: "badge muted", text: "Geannuleerd" }));
  else if (isNow) side.append(h("span", { class: "badge now", text: "Nu" }));
  else if (isNext) side.append(h("span", { class: "badge next", text: "Volgende" }));
  if (acts.firstChild) side.append(moreBtn(row));
  if (side.firstChild) row.append(side);
  return row;
}

