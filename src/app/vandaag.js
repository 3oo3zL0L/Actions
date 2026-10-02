// Vandaag (start): afspraken van nu en straks, acties met Vandaag-markering, nieuwe voorstellen.
"use strict";

function vandaagParts() {
  var now = Date.now();
  var evs = S.cal.hasData ? calEvents() : [];
  return {
    evs: evs,
    meet: evs.filter(function (e) { return !e.allDay && !e.cancelled && e.end.getTime() > now; }),
    allDay: evs.filter(function (e) { return e.allDay && !e.cancelled; }),
    // Dag voorbij: de eerste afspraak van morgen, zodat je ziet waar de dag morgen mee begint.
    morgen: S.cal.hasData ? calTomorrow().filter(function (e) { return !e.allDay && !e.cancelled; })[0] || null : null,
    acties: cap.db && acties.loaded ? actiesVandaag() : [],
    voorst: cap.db && voorst.loaded ? voorstNieuw() : []
  };
}
function renderVandaag() {
  var body = $("body-vandaag");
  if (!body) return;
  var p = vandaagParts();
  clear(body);
  var n = p.meet.length + p.acties.length + p.voorst.length;
  $("cnt-vandaag").textContent = n ? String(n) : "";
  Shell.changed();
  if (halted || !Shell.shown("vandaag")) return;
  // 1. Afspraken van nu en straks
  var g1 = h("div", { class: "vgroup" }, h("h3", { text: "Afspraken" }));
  var box = h("div");
  var inner = stateInto(box, "cal");
  g1.append(box);
  if (inner) {
    if (p.allDay.length) inner.append(h("div", { class: "allday" }, h("b", { text: "Hele dag" }), p.allDay.map(function (e, i) { return (i ? " · " : "") + (str(e.it.subject) || "(geen onderwerp)"); }).join("")));
    if (!p.meet.length) {
      inner.append(h("p", { class: "empty", text: p.evs.length ? "Geen afspraken meer vandaag." : "Geen afspraken vandaag." }));
      if (p.morgen) inner.append(h("p", { class: "vsub", text: nextDayTitle() + " als eerste" }), h("ul", { class: "list timeline" }, eventRow(p.morgen)));
    } else {
      var nn = nowNext(p.evs);
      var ul = h("ul", { class: "list timeline" });
      p.meet.forEach(function (e) { ul.append(eventRow(e, nn)); });
      inner.append(ul);
    }
  }
  body.append(g1);
  // 2. Acties voor vandaag
  if (cap.db && acties.loaded) {
    var g2 = h("div", { class: "vgroup" }, h("h3", { text: "Acties voor vandaag" }));
    if (!p.acties.length) g2.append(h("p", { class: "empty", text: "Geen acties voor vandaag. Open een actie en kies Maak vandaag (v)." }));
    else {
      var ul2 = h("ul", { class: "list" });
      p.acties.sort(function (a, b) { return (dueDate(a) || Infinity) - (dueDate(b) || Infinity); }).forEach(function (a) { ul2.append(actieRow(a)); });
      g2.append(ul2);
    }
    body.append(g2);
  }
  // 3. Nieuwe voorstellen uit de ochtendrun of scan
  if (p.voorst.length) {
    var g3 = h("div", { class: "vgroup" }, h("h3", { text: "Nieuwe voorstellen" }));
    var ul3 = h("ul", { class: "list" });
    p.voorst.forEach(function (v) { ul3.append(voorstelRow(v)); });
    g3.append(ul3);
    body.append(g3);
  }
  Shell.changed();
}
Shell.entry("vandaag", {
  label: "Vandaag",
  render: renderVandaag,
  empty: "Kies een afspraak, actie of voorstel om het hier te openen.",
  count: function () { var p = vandaagParts(); return p.meet.length + p.acties.length + p.voorst.length; }
});
