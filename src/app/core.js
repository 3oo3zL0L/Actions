// Constanten, kleine helpers, tijdzones, items(), foutmapping, runtime.
"use strict";

// ---------- Constanten ----------
var M365 = "Microsoft 365";
var ATL = "Atlassian Rovo";
var CLOUD_ID = "f5ee9bed-0e04-48ea-aa28-5c3ecd088de8";
var PAF_URL = "https://claude.ai/artifact/Ar6sRYzLNFu5dzdLw1Y4gw";
var DEFAULT_JQL = "assignee = currentUser() OR reporter = currentUser() OR watcher = currentUser() ORDER BY updated DESC";
var DEFAULT_CQL = "contributor = currentUser() AND type = page ORDER BY lastmodified DESC";
var JIRA_FIELDS = ["summary", "status", "priority", "updated", "project", "issuetype", "assignee"];
var PROGS = ["UI/UX", "Platform Core", "CI Acceleration", "OIDC", "Object Store", "Jakarta migratie", "Platform Stability", "Contracten", "Overig"];
var MAX_ROWS = 8;
var LS = { theme: "actiepagina.theme", notif: "actiepagina.meldingen", jql: "actiepagina.jql", tabInbox: "actiepagina.tab.inbox", tabWork: "actiepagina.tab.werk" };
var DAYS = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
var DAYS_S = ["zo", "ma", "di", "wo", "do", "vr", "za"];
var MONTHS = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
var MONTHS_S = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

// ---------- Kleine helpers ----------
function $(id) { return document.getElementById(id); }
function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { if (v == null) window.localStorage.removeItem(k); else window.localStorage.setItem(k, v); } catch (e) { /* geen opslag */ } }
function h(tag, attrs) {
  var el = document.createElement(tag);
  if (attrs) {
    for (var k in attrs) {
      if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = String(v);
      else if (k.slice(0, 2) === "on" && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "href") { var u = safeUrl(v); if (u) el.setAttribute("href", u); }
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, String(v));
    }
  }
  for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
  return el;
}
function add(el, c) {
  if (c == null || c === false) return;
  if (Array.isArray(c)) { c.forEach(function (x) { add(el, x); }); return; }
  el.append(c instanceof Node ? c : String(c));
}
function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); return el; }
function str(v) { return v == null ? "" : String(v); }
function trunc(s, n) { s = str(s).replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
function safeUrl(u) {
  if (typeof u !== "string") return null;
  var t = u.trim();
  if (!/^https:\/\//i.test(t)) return null;
  try { var p = new URL(t); return p.protocol === "https:" ? p.href : null; } catch (e) { return null; }
}
function extLink(url, label, cls) {
  var u = safeUrl(url);
  if (!u) return null;
  return h("a", { href: u, target: "_blank", rel: "noopener noreferrer", class: cls || "btn text" },
    label, h("span", { "aria-hidden": "true", text: " ↗" }), h("span", { class: "sr", text: " (opent in nieuw tabblad)" }));
}
function pad(n) { return (n < 10 ? "0" : "") + n; }
function hhmm(d) { return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function whenLabel(d) {
  if (!d || isNaN(d)) return "";
  var now = new Date();
  if (sameDay(d, now)) return hhmm(d);
  var y = new Date(now); y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return "gisteren";
  return DAYS_S[d.getDay()] + " " + d.getDate() + " " + MONTHS_S[d.getMonth()];
}
function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }
// Inbox-tijd: < 60 min relatief, vandaag klok, gisteren "gisteren 16:05", ouder datum.
function relWhen(d) {
  if (!d || isNaN(d)) return "";
  var now = new Date(), diff = Math.round((now - d) / 60000);
  if (diff >= 0 && diff < 1) return "zojuist";
  if (diff >= 1 && diff < 60) return diff + " min geleden";
  if (sameDay(d, now)) return hhmm(d);
  var y = new Date(now); y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return "gisteren " + hhmm(d);
  return DAYS_S[d.getDay()] + " " + d.getDate() + " " + MONTHS_S[d.getMonth()];
}
function relTime(d) { return h("time", { class: "when", "data-rel": d && !isNaN(d) ? String(d.getTime()) : null, datetime: d && !isNaN(d) ? d.toISOString() : null, text: relWhen(d) }); }
function tickRelTimes() {
  document.querySelectorAll("time[data-rel]").forEach(function (t) { var v = relWhen(new Date(+t.getAttribute("data-rel"))); if (t.textContent !== v) t.textContent = v; });
}
function longDate(d) { return DAYS[d.getDay()] + " " + d.getDate() + " " + MONTHS[d.getMonth()]; }
function shortDue(d) { return d.getDate() + " " + MONTHS_S[d.getMonth()]; }
function isoDay(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function parseDate(s) { if (!s) return null; var d = new Date(s); return isNaN(d) ? null : d; }
function jiraDate(s) {
  if (!s) return null;
  var m = /^(.*[+-]\d{2})(\d{2})$/.exec(String(s));
  return parseDate(m ? m[1] + ":" + m[2] : s);
}

var statusEl = $("status");
var statusTimer = null;
function announce(msg) {
  clearTimeout(statusTimer);
  statusEl.textContent = "";
  statusTimer = setTimeout(function () { statusEl.textContent = msg; }, 60);
}

// ---------- Tijdzones (agenda: wandkloktijd in genoemde zone) ----------
var WIN_TZ = {
  "W. Europe Standard Time": "Europe/Amsterdam", "Romance Standard Time": "Europe/Paris",
  "Central Europe Standard Time": "Europe/Budapest", "Central European Standard Time": "Europe/Warsaw",
  "GMT Standard Time": "Europe/London", "Greenwich Standard Time": "Atlantic/Reykjavik",
  "UTC": "UTC", "Coordinated Universal Time": "UTC", "E. Europe Standard Time": "Europe/Chisinau",
  "FLE Standard Time": "Europe/Helsinki", "GTB Standard Time": "Europe/Bucharest",
  "Eastern Standard Time": "America/New_York", "Central Standard Time": "America/Chicago",
  "Mountain Standard Time": "America/Denver", "Pacific Standard Time": "America/Los_Angeles",
  "India Standard Time": "Asia/Kolkata", "China Standard Time": "Asia/Shanghai",
  "Tokyo Standard Time": "Asia/Tokyo", "AUS Eastern Standard Time": "Australia/Sydney",
  "Singapore Standard Time": "Asia/Singapore"
};
var tzFmtCache = {};
function tzParts(ms, tz) {
  var f = tzFmtCache[tz];
  if (!f) {
    f = tzFmtCache[tz] = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  var o = {};
  f.formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = p.value; });
  return Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour % 24, +o.minute, +o.second);
}
function zonedDate(v) {
  if (!v) return null;
  var dt = typeof v === "string" ? v : v.dateTime;
  var tz = typeof v === "string" ? null : v.timeZone;
  if (!dt) return null;
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(dt)) return parseDate(dt);
  var m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(dt);
  if (!m) return parseDate(dt);
  var parts = [+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)];
  var iana = tz ? (WIN_TZ[tz] || tz) : null;
  if (iana) {
    try {
      var guess = Date.UTC.apply(null, parts);
      var off = tzParts(guess, iana) - guess;
      var t = guess - off;
      var off2 = tzParts(t, iana) - t;
      if (off2 !== off) t = guess - off2;
      return new Date(t);
    } catch (e) { /* onbekende zone: val terug op lokale wandklok */ }
  }
  return new Date(parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]);
}

// ---------- items(result): PO-besluit ----------
var PAGE_KEYS = ["moreResults", "nextOffset", "nextCursor"];
var CONTAINERS = [["issues", "nodes"], ["content", "nodes"], ["issues"], ["nodes"], ["results"], ["value"], ["items"], ["events"], ["messages"], ["chats"], ["pages"]];
function isPlain(o) { return o && typeof o === "object" && !Array.isArray(o); }
function flatten(v, out) {
  if (Array.isArray(v)) { v.forEach(function (x) { flatten(x, out); }); return; }
  if (!isPlain(v)) return;
  for (var i = 0; i < CONTAINERS.length; i++) {
    var path = CONTAINERS[i], cur = v, ok = true;
    for (var j = 0; j < path.length; j++) { if (cur && typeof cur === "object" && path[j] in cur) cur = cur[path[j]]; else { ok = false; break; } }
    if (ok && Array.isArray(cur)) { flatten(cur, out); return; }
  }
  for (var k = 0; k < PAGE_KEYS.length; k++) if (PAGE_KEYS[k] in v) return; // paginatie-object
  out.push(v);
}
function items(result, opts) {
  var out = [];
  if (!result || typeof result !== "object") return out;
  var firstOnly = opts && opts.first;
  if (firstOnly) {
    var p = result.payload;
    if (p !== undefined && typeof p !== "string") { flatten(p, out); return out; }
  }
  var blocks = Array.isArray(result.content) ? result.content : [];
  var parsed = 0;
  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i];
    if (!b || b.type !== "text" || typeof b.text !== "string") continue;
    try { var v = JSON.parse(b.text); parsed++; flatten(v, out); } catch (e) { /* geen JSON-blok, overslaan */ }
    if (firstOnly && parsed) break;
  }
  if (!parsed) {
    if (result.structuredContent !== undefined) flatten(result.structuredContent, out);
    else if (result.payload !== undefined && typeof result.payload !== "string") flatten(result.payload, out);
  }
  return out;
}
function findLink(result) {
  var seen = 0;
  function walk(v) {
    if (seen++ > 400 || !v || typeof v !== "object") return null;
    if (!Array.isArray(v)) {
      var keys = ["webLink", "webUrl", "url", "link"];
      for (var i = 0; i < keys.length; i++) { var u = safeUrl(v[keys[i]]); if (u) return u; }
    }
    for (var k in v) { if (v[k] && typeof v[k] === "object") { var r = walk(v[k]); if (r) return r; } }
    return null;
  }
  if (!result) return null;
  var all = items(result);
  for (var i = 0; i < all.length; i++) { var r = walk(all[i]); if (r) return r; }
  return walk(result.payload) || null;
}

// ---------- Foutmapping ----------
var BRON = { cal: "Microsoft 365", mail: "Microsoft 365", teams: "Microsoft 365", chats: "Microsoft 365", me: "Microsoft 365", jira: "Atlassian", conf: "Atlassian" };
var DIRECT = { cal: "https://outlook.office.com/calendar/", mail: "https://outlook.office.com/mail/", teams: "https://teams.microsoft.com/", jira: "https://home.atlassian.com/", conf: "https://home.atlassian.com/" };
var DIRECT_LABEL = { cal: "Open Outlook", mail: "Open Outlook", teams: "Open Teams", jira: "Open Atlassian", conf: "Open Atlassian" };
var RETRACT = { needs_reauth: 1, server_not_connected: 1, server_not_found: 1, selection_required: 1, not_in_manifest: 1, blocked_by_policy: 1, approval_required: 1, consent_required: 1, not_granted: 1, capability_disabled: 1, capability_removed: 1 };
var KNOWN = ["needs_reauth", "server_not_connected", "selection_required", "server_not_found", "server_unavailable", "not_in_manifest", "blocked_by_policy", "approval_required", "tool_error", "bad_request", "cancelled", "rate_limited", "upstream_error", "not_granted", "capability_disabled", "capability_removed", "transform_error", "consent_required", "user_changed"];
function errCode(e) { var c = e && typeof e === "object" ? e.code : null; return KNOWN.indexOf(c) >= 0 ? c : "upstream_error"; }
// Ontbrekend recht in Microsoft Entra (tool_error "FORBIDDEN: Missing scope '<scope>'"): geeft de scope of null.
function missingScope(e) {
  if (!e || typeof e !== "object") return null;
  var t = str(e.message);
  var c = e.result && Array.isArray(e.result.content) ? e.result.content : [];
  c.forEach(function (b) { if (b && typeof b.text === "string") t += " " + b.text; });
  var m = /Missing scope '([^']+)'/.exec(t);
  return m ? m[1] : null;
}
var TEAMS_BLOCKED_TEXT = "Teams staat direct versturen niet toe voor jouw account (IT moet toestemming geven).";
var NA_TEXT = "Geen koppelingen in deze weergave. Open de pagina in claude.ai en koppel Microsoft 365 en Atlassian.";
// Geeft {cat, lines:[...], btn:null|"retry"|"consent", link:bool}
function describeError(e, key, state) {
  var code = errCode(e), bron = BRON[key] || "de bron";
  switch (code) {
    case "server_not_connected": case "server_not_found":
      return { cat: "auth", lines: [bron + " is niet gekoppeld. Koppel " + bron + " in claude.ai via Instellingen > Connectors."] };
    case "selection_required":
      return { cat: "auth", lines: ["Kies welke " + bron + "-koppeling je wilt gebruiken in claude.ai."] };
    case "needs_reauth":
      return { cat: "auth", lines: ["Je koppeling met " + bron + " is verlopen. Koppel opnieuw in claude.ai via Instellingen > Connectors."], btn: "retry" };
    case "not_in_manifest": case "approval_required":
      return { cat: "perm", lines: ["Deze pagina heeft geen toestemming voor " + bron + "."] };
    case "blocked_by_policy":
      return { cat: "perm", lines: ["Deze pagina heeft geen toestemming voor " + bron + ".", "Je organisatie blokkeert dit."] };
    case "consent_required":
      return { cat: "perm", lines: ["Deze pagina heeft geen toestemming voor " + bron + "."], btn: "consent" };
    case "not_granted": case "capability_disabled": case "capability_removed":
      return { cat: "na", lines: [NA_TEXT] };
    case "server_unavailable": case "rate_limited":
      return tempErr(bron, state);
    case "upstream_error":
      if (e && e.retryable) return tempErr(bron, state);
      return { cat: "unknown", lines: ["Ophalen mislukt. Probeer het opnieuw of open " + bron + " direct."], btn: "retry", link: true };
    default:
      return { cat: "unknown", lines: ["Ophalen mislukt. Probeer het opnieuw of open " + bron + " direct."], btn: "retry", link: true };
  }
}
function tempErr(bron, state) {
  var lines = [bron + " reageert nu niet. We proberen het zo opnieuw."];
  if (state && state.autoRetried && !state.retryPending) lines = [bron + " reageert nu niet.", "Lukt nog steeds niet."];
  return { cat: "temp", lines: lines, btn: "retry" };
}
function errorBlock(e, key, state, onRetry) {
  var d = describeError(e, key, state);
  var box = h("div", { class: "alert" + (d.cat === "na" ? " na" : ""), role: "alert" });
  box.append(h("p", null, h("span", { "aria-hidden": "true", text: "⚠ " }), d.lines[0]));
  for (var i = 1; i < d.lines.length; i++) box.append(h("p", { text: d.lines[i] }));
  var btns = h("div", { class: "btns" });
  if (d.btn === "retry" && onRetry) btns.append(h("button", { class: "btn", type: "button", onclick: onRetry, text: "Opnieuw proberen" }));
  if (d.btn === "consent" && onRetry) btns.append(h("button", { class: "btn", type: "button", onclick: onRetry, text: "Toestemming vragen" }));
  if (d.link && DIRECT[key]) add(btns, extLink(DIRECT[key], DIRECT_LABEL[key], "btn"));
  if (btns.firstChild) box.append(btns);
  if (e && e.code) box.append(h("details", null, h("summary", { text: "Details" }), h("span", { class: "mono", text: str(e.code) + (e.message ? ": " + trunc(e.message, 300) : "") })));
  return box;
}
function naBlock(text) { return h("div", { class: "alert na" }, h("p", { text: text || NA_TEXT })); }
function skeleton(n) {
  var ul = h("ul", { class: "list", "aria-busy": "true" }, h("li", { class: "sr", text: "Laden…" }));
  for (var i = 0; i < (n || 3); i++) ul.append(h("li", { class: "sk", "aria-hidden": "true" }, h("span"), h("span")));
  return ul;
}

// ---------- Runtime (window.claude) ----------
var halted = false;
var cap = { mcp: undefined, sample: undefined, db: undefined };
function useCap(name) {
  try {
    var c = window.claude;
    if (!c || typeof c.use !== "function") return Promise.resolve(null);
    return Promise.resolve(c.use(name)).then(function (v) { return v || null; }, function () { return null; });
  } catch (e) { return Promise.resolve(null); }
}
var hasRuntime = false;
try { hasRuntime = !!(window.claude && typeof window.claude.use === "function"); } catch (e) { hasRuntime = false; }
