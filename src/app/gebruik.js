// Gebruikslog (analist).
"use strict";

// ---------- Gebruikslog (analist) ----------
// Alleen event-namen en de eigen Claude-vraag; nooit adressen, namen of inhoud uit bronnen.
var usage = { buf: [], writing: false };
function logEvent(e, d) {
  if (halted || cap.db === null) return;
  var ev = { t: new Date().toISOString(), e: String(e).replace(/[^a-z0-9_]/gi, "_").slice(0, 64) };
  if (d != null && String(d).trim()) ev.d = String(d).replace(/\s+/g, " ").trim().slice(0, 120);
  usage.buf.push(ev);
  if (usage.buf.length > 1000) usage.buf.splice(0, usage.buf.length - 1000);
}
function flushUsage() {
  if (!cap.db || usage.writing || !usage.buf.length) return Promise.resolve();
  var batch = usage.buf.splice(0);
  var byDay = {};
  batch.forEach(function (ev) { var day = isoDay(new Date(ev.t)); (byDay[day] = byDay[day] || []).push(ev); });
  usage.writing = true;
  var days = Object.keys(byDay).sort(), failed = [];
  function next(i) {
    if (i >= days.length) return Promise.resolve();
    var day = days[i], evs = byDay[day];
    var ref;
    try { ref = cap.db.collection("gebruik").doc(day); } catch (e) { return next(i + 1); }
    return ref.get().then(function (snap) {
      var old = snap && snap.exists ? (snap.data() || {}) : {};
      var counts = {};
      var oc = isPlain(old.counts) ? old.counts : {};
      for (var k in oc) if (typeof oc[k] === "number") counts[k] = oc[k];
      evs.forEach(function (ev) { counts[ev.e] = (counts[ev.e] || 0) + 1; });
      var list = (Array.isArray(old.events) ? old.events.filter(isPlain) : []).concat(evs);
      if (list.length > 300) list = list.slice(list.length - 300);
      return ref.set({ counts: counts, events: list, updatedAt: new Date().toISOString() });
    }).catch(function () { failed = failed.concat(evs); }).then(function () { return next(i + 1); });
  }
  return next(0).then(function () {
    usage.writing = false;
    if (failed.length) usage.buf = failed.concat(usage.buf).slice(-1000);
  });
}
setInterval(flushUsage, 30000);
document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flushUsage(); });
window.addEventListener("pagehide", function () { flushUsage(); });

