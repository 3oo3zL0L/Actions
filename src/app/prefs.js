// Voorkeuren van Thomas in db-doc prefs/thomas (gedeeld over apparaten). Kleine API:
//   getPref(naam)            waarde of de standaard
//   setPref(naam, waarde)    lokaal direct, schrijft gebundeld (één write tegelijk, alleen bij een echte wijziging)
//   onPrefs(fn)              fn(prefs) na laden en na elke wijziging van buitenaf (ander apparaat)
// Velden: vip [], theme, lastEntry, followedChannels [], inboxFilter, teamsSendBlocked ({since} of null).
"use strict";

var PREF_DEFAULTS = { vip: [], theme: "forest", lastEntry: "vandaag", followedChannels: [], inboxFilter: "alles", teamsSendBlocked: null };
var prefs = { data: {}, loaded: false, dirty: {}, timer: null, writing: null, unsub: null, listeners: [] };

function getPref(name) {
  var v = prefs.data[name];
  if (v === undefined) v = PREF_DEFAULTS[name];
  return v && typeof v === "object" ? JSON.parse(JSON.stringify(v)) : v;
}
function setPref(name, value) {
  if (JSON.stringify(prefs.data[name]) === JSON.stringify(value)) return;
  prefs.data[name] = value;
  prefs.dirty[name] = true;
  schedulePrefsWrite();
}
// Voorkeuren die ook lokaal staan voor de eerste paint (thema, laatste ingang): lokaal en in db met tijdstip;
// bij laden wint de nieuwste. Zo wint een keuze op dit apparaat van een db-write die nog onderweg was.
function setLocalPref(name, lsKey, value) {
  var at = new Date().toISOString();
  lsSet(lsKey, value); lsSet(lsKey + ".at", at);
  setPref(name, value); setPref(name + "At", at);
}
function remoteIsNewer(name, lsKey) {
  var r = prefs.data[name + "At"], l = lsGet(lsKey + ".at");
  return prefs.data[name] != null && !!r && (!l || r > l);
}
function onPrefs(fn) { prefs.listeners.push(fn); if (prefs.loaded) fn(prefs.data); }
function prefsRef() { return cap.db.collection("prefs").doc("thomas"); }
function schedulePrefsWrite() {
  if (!cap.db || !prefs.loaded) return; // na het laden schrijven, anders overschrijven we andermans keuzes
  clearTimeout(prefs.timer);
  prefs.timer = setTimeout(writePrefs, 400);
}
function writePrefs() {
  if (!cap.db || !Object.keys(prefs.dirty).length) return;
  if (prefs.writing) { prefs.writing.then(writePrefs, writePrefs); return; }
  prefs.dirty = {};
  var body = JSON.parse(JSON.stringify(prefs.data));
  body.updatedAt = new Date().toISOString();
  prefs.writing = Promise.resolve().then(function () { return prefsRef().set(body); }).then(function () { prefs.writing = null; }, function () {
    prefs.writing = null;
    announce("Voorkeur niet opgeslagen.");
  });
}
function loadPrefs() {
  if (!cap.db || prefs.unsub) return;
  try {
    prefs.unsub = prefsRef().onSnapshot(function (snap) {
      var remote = snap && snap.exists ? (snap.data() || {}) : {};
      var merged = {};
      for (var k in remote) if (k !== "updatedAt") merged[k] = remote[k];
      for (var d in prefs.dirty) merged[d] = prefs.data[d]; // eigen, nog niet geschreven wijzigingen winnen
      var first = !prefs.loaded;
      prefs.data = merged;
      prefs.loaded = true;
      if (first && Object.keys(prefs.dirty).length) schedulePrefsWrite();
      prefs.listeners.forEach(function (fn) { try { fn(prefs.data, first); } catch (e) { /* */ } });
    }, function () { prefs.unsub = null; prefs.loaded = true; });
  } catch (e) { prefs.loaded = true; }
}
