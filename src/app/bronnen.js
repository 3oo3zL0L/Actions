// Bronnen (mcp watch/call), kop en nu-strip, generieke sectie-helpers.
"use strict";

// ---------- Bronnen (mcp) ----------
function getJql() { return lsGet(LS.jql) || DEFAULT_JQL; }
var SOURCES = {
  cal: { server: M365, tool: "outlook_calendar_search", input: function () { return { query: "*", afterDateTime: "today", beforeDateTime: "tomorrow", limit: 25 }; }, every: 300000 },
  mail: { server: M365, tool: "outlook_email_search", input: function () { return { order: "newest", limit: 25 }; }, every: 180000 },
  teams: { server: M365, tool: "chat_message_search", input: function () { return { query: "*", afterDateTime: "yesterday", limit: 25 }; }, every: 180000 },
  chats: { server: M365, tool: "teams_list_chats", input: function () { return { limit: 25 }; }, every: 600000, silent: true },
  jira: { server: ATL, tool: "searchJiraIssuesUsingJql", input: function () { return { cloudId: CLOUD_ID, jql: getJql(), maxResults: 30, fields: JIRA_FIELDS }; }, every: 600000, first: true },
  conf: { server: ATL, tool: "searchConfluenceUsingCql", input: function () { return { cloudId: CLOUD_ID, cql: DEFAULT_CQL, limit: 15 }; }, every: 600000, first: true }
};
var S = {};
Object.keys(SOURCES).forEach(function (k) {
  S[k] = { key: k, status: "wait", items: [], hasData: false, error: null, updatedAt: null, stale: false, unsub: null, gen: 0, sig: "", refreshing: false, autoRetried: false, retryPending: false, gotData: false };
});

function stopWatch(k) { var s = S[k]; if (s.unsub) { try { s.unsub(); } catch (e) { /* al gestopt */ } s.unsub = null; } }
function startWatch(k, opts) {
  if (halted) return;
  var s = S[k], d = SOURCES[k], mcp = cap.mcp;
  if (!mcp) return;
  stopWatch(k);
  var gen = ++s.gen;
  if (!(opts && opts.auto)) { s.autoRetried = false; }
  s.retryPending = false;
  s.gotData = false;
  s.refreshing = true;
  if (!s.hasData && s.status !== "error") s.status = "loading";
  renderSource(k);
  var handler = function (ev) {
    if (gen !== s.gen || halted || !ev) return;
    if (ev.type === "data") onData(k, ev.result);
    else if (ev.type === "error") {
      var c = ev.error && ev.error.code;
      if (!s.gotData && (c === "bad_request" || c === "capability_removed") && typeof mcp.callTool === "function") { stopWatch(k); callOnce(k, gen); return; }
      onError(k, ev.error);
    }
  };
  if (typeof mcp.watchTool !== "function") { callOnce(k, gen); return; }
  try {
    s.unsub = mcp.watchTool(d.server, d.tool, d.input(), handler, { refetchInterval: d.every });
  } catch (e) { callOnce(k, gen); }
}
function callOnce(k, gen) {
  var s = S[k], d = SOURCES[k];
  Promise.resolve().then(function () { return cap.mcp.callTool(d.server, d.tool, d.input()); }).then(function (r) {
    if (gen === s.gen && !halted) onData(k, r);
  }, function (e) { if (gen === s.gen && !halted) onError(k, e); });
}
function onData(k, result) {
  var s = S[k];
  var list = items(result, { first: SOURCES[k].first });
  var sig;
  try { sig = JSON.stringify(list); } catch (e) { sig = String(Math.random()); }
  var changed = sig !== s.sig || s.status !== "ok";
  s.sig = sig; s.items = list; s.hasData = true; s.gotData = true;
  s.status = "ok"; s.error = null; s.stale = false; s.retryPending = false;
  var c = result && result.cache;
  s.updatedAt = c && typeof c.storedAt === "number" ? c.storedAt : Date.now();
  s.refreshing = !!(c && c.revalidating);
  if (!s.refreshing) s.autoRetried = false;
  renderSource(k, changed);
}
var LOG_SRC = { cal: "agenda", mail: "mail", teams: "teams", chats: "teamschats", jira: "jira", conf: "confluence" };
function onError(k, e) {
  var s = S[k];
  var code = errCode(e);
  if (code !== "cancelled" && code !== "user_changed" && !(s.status === "error" && errCode(s.error) === code)) logEvent("fout_" + LOG_SRC[k] + "_" + code);
  if (code === "user_changed") { halt(); return; }
  if (code === "cancelled") { s.refreshing = false; renderSource(k); return; }
  s.refreshing = false;
  if (RETRACT[code]) { s.items = []; s.hasData = false; s.sig = ""; s.stale = false; }
  else s.stale = s.hasData;
  s.status = "error"; s.error = e || { code: code };
  if (e && e.retryable && !s.autoRetried) {
    s.autoRetried = true; s.retryPending = true;
    var wait = typeof e.retryAfterMs === "number" && e.retryAfterMs > 0 ? Math.min(e.retryAfterMs, 60000) : 1000 + Math.random() * 2000;
    var gen = s.gen;
    setTimeout(function () { if (gen === s.gen && !halted) startWatch(k, { auto: true }); }, wait);
  }
  renderSource(k, true);
}
function refresh(k) {
  if (!cap.mcp || halted) return;
  S[k].autoRetried = false;
  startWatch(k);
}
function halt() {
  halted = true;
  Object.keys(S).forEach(function (k) { stopWatch(k); S[k].items = []; S[k].hasData = false; S[k].refreshing = false; });
  if (activeCtl) try { activeCtl.abort(); } catch (e) { /* */ }
  renderAll();
}
var GROUPS = { today: ["cal"], inbox: ["mail", "teams", "chats"], work: ["jira", "conf"] };
function refreshGroup(g) {
  if (g === "acties") { resubscribeActies(); return; }
  (GROUPS[g] || []).forEach(refresh);
}
function refreshAll() {
  if (!cap.mcp) { announce("Geen koppelingen in deze weergave."); return; }
  Object.keys(SOURCES).forEach(refresh);
  fetchMe();
}

// ---------- Header, begroeting, nu-strip ----------
var me = { name: "", email: "" };
function fetchMe() {
  if (!cap.mcp || typeof cap.mcp.callTool !== "function") return;
  cap.mcp.callTool(M365, "get_me", {}, { cache: { staleTime: 300000, gcTime: 86400000 } }).then(function (r) {
    var list = items(r);
    var o = list[0] || (isPlain(r && r.payload) ? r.payload : null) || {};
    var name = str(o.displayName || o.givenName || o.name).trim();
    me.email = str(o.mail || o.email || o.userPrincipalName).toLowerCase();
    if (name) { me.name = (o.givenName ? str(o.givenName) : name.split(/[\s,]+/)[0]).trim(); renderHeader(); }
  }, function () { /* begroeting zonder naam */ });
}
function renderHeader() {
  var now = new Date(), hr = now.getHours();
  var g = hr < 12 ? "Goedemorgen" : hr < 18 ? "Goedemiddag" : "Goedenavond";
  $("greet").textContent = me.name ? g + ", " + me.name : g;
  $("date").textContent = longDate(now);
  renderNowStrip();
}
function calEvents() {
  var today = new Date();
  return S.cal.items.map(function (it) {
    var st = zonedDate(it.start), en = zonedDate(it.end);
    return { it: it, start: st, end: en || st, allDay: !!it.isAllDay, cancelled: !!it.isCancelled };
  }).filter(function (e) {
    if (!e.start) return false; // zonder geldige tijd: zie calUnknown()
    if (e.allDay) return e.start <= new Date(startOfDay(today).getTime() + 86400000) && e.end >= startOfDay(today);
    return sameDay(e.start, today) || (e.start < today && e.end > startOfDay(today));
  }).sort(function (a, b) { return a.start - b.start; });
}
function calUnknown() {
  return S.cal.items.filter(function (it) { return it && typeof it === "object" && !it.isAllDay && !zonedDate(it.start) && (it.subject || it.id); });
}
function nowNext(evs) {
  var now = Date.now(), cur = [], next = null;
  evs.forEach(function (e) {
    if (e.allDay || e.cancelled) return;
    if (e.start.getTime() <= now && e.end.getTime() > now) cur.push(e);
    else if (e.start.getTime() > now && !next) next = e;
  });
  return { cur: cur, next: next };
}
function mailSplit() {
  var normal = [], notif = [];
  S.mail.items.forEach(function (m) { if (!isHandled(m)) (isNotification(m) ? notif : normal).push(m); });
  normal.sort(function (a, b) {
    if (!!a.isRead !== !!b.isRead) return a.isRead ? 1 : -1;
    return (parseDate(b.receivedDateTime) || 0) - (parseDate(a.receivedDateTime) || 0);
  });
  notif.sort(function (a, b) { return (parseDate(b.receivedDateTime) || 0) - (parseDate(a.receivedDateTime) || 0); });
  return { normal: normal, notif: notif, unread: normal.filter(function (m) { return m.isRead === false; }).length };
}
function renderNowStrip() {
  var el = clear($("nowstrip"));
  if (halted) return;
  var parts = [];
  var ph = function () { return h("span", { class: "chip-ph", "aria-hidden": "true" }); };
  if (!cap.mcp && cap.mcp !== undefined) {
    // geen koppelingen: alleen acties
  } else if (S.cal.status === "ok" || (S.cal.hasData)) {
    var nn = nowNext(calEvents());
    if (nn.cur.length) {
      var c = nn.cur[0];
      parts.push(h("a", { href: "#vandaag" }, "Nu: ", h("strong", { text: str(c.it.subject) || "(geen onderwerp)" }), " tot ", h("time", { text: hhmm(c.end) })));
    }
    if (nn.next) {
      var mins = Math.round((nn.next.start - Date.now()) / 60000);
      parts.push(h("a", { href: "#vandaag" }, "Straks ", h("time", { text: hhmm(nn.next.start) }), " " + (str(nn.next.it.subject) || "(geen onderwerp)") + (mins < 60 ? " (over " + Math.max(mins, 1) + " min)" : "")));
    }
    if (!nn.cur.length && !nn.next) parts.push(h("a", { href: "#vandaag", text: "Geen afspraken meer vandaag" }));
  } else if (S.cal.status === "error") {
    // niets
  } else parts.push(ph());
  if (cap.mcp) {
    if (S.mail.hasData) parts.push(h("a", { href: "#inbox", text: mailSplit().unread + " ongelezen" }));
    else if (S.mail.status !== "error") parts.push(ph());
  }
  if (cap.db) parts.push(h("a", { href: "#acties", text: plural(actiesVandaag().length, "actie", "acties") + " vandaag" }));
  else if (cap.db === undefined && hasRuntime) parts.push(ph());
  parts.forEach(function (p, i) { if (i) el.append(h("span", { class: "sep", "aria-hidden": "true", text: "·" })); el.append(p); });
}

// ---------- Generieke sectie-helpers ----------
var expanded = {};
var FRESH = { cal: "fresh-vandaag", mail: "fresh-inbox", teams: "fresh-inbox", jira: "fresh-werk", conf: "fresh-werk" };
function freshText(s) {
  if (!s.updatedAt) return "";
  var t = hhmm(new Date(s.updatedAt));
  if (s.status === "error" && s.stale) return "Niet actueel, laatst " + t;
  return "bijgewerkt " + t;
}
function setFresh(k) {
  var id = FRESH[k]; if (!id) return;
  var s = S[k];
  if ((k === "mail" || k === "teams") && activeTab.inbox !== k) return;
  if ((k === "jira" || k === "conf") && activeTab.werk !== k) return;
  $(id).textContent = freshText(s);
}
function setBusy() {
  var map = { today: ["cal"], inbox: ["mail", "teams"], work: ["jira", "conf"] };
  Object.keys(map).forEach(function (g) {
    var b = document.querySelector('[data-refresh="' + g + '"]');
    var busy = map[g].some(function (k) { return S[k].refreshing && S[k].hasData; });
    b.classList.toggle("busy", busy);
    b.setAttribute("aria-busy", busy ? "true" : "false");
  });
  var any = Object.keys(SOURCES).some(function (k) { return S[k].refreshing; });
  var ra = $("refreshAll");
  ra.classList.toggle("busy", any);
  ra.querySelector(".lbl").textContent = any ? "Verversen…" : "Alles verversen";
}
// Rendert standaard-staat; geeft container terug waarin de lijst moet (of null)
var PAGE_KEYS_SECT = ["cal", "mail", "teams", "jira", "conf"];
var AUTH_CODES = { needs_reauth: 1, server_not_connected: 1, server_not_found: 1, selection_required: 1 };
function pageAuthCode() {
  var code = null;
  for (var i = 0; i < PAGE_KEYS_SECT.length; i++) {
    var s = S[PAGE_KEYS_SECT[i]];
    if (s.status !== "error") return null;
    var c = errCode(s.error);
    if (!AUTH_CODES[c]) return null;
    var norm = c === "server_not_found" ? "server_not_connected" : c;
    if (code && code !== norm) return null;
    code = norm;
  }
  return code;
}
function renderPageAlert() {
  var el = clear($("pageAlert"));
  var code = halted ? null : pageAuthCode();
  el.hidden = !code;
  if (!code) return;
  var txt = code === "needs_reauth" ? "Je koppelingen met Microsoft 365 en Atlassian zijn verlopen. Koppel opnieuw in claude.ai via Instellingen > Connectors."
    : code === "selection_required" ? "Kies in claude.ai welke Microsoft 365- en Atlassian-koppeling je wilt gebruiken."
    : "Microsoft 365 en Atlassian zijn niet gekoppeld. Koppel Microsoft 365 en Atlassian in claude.ai via Instellingen > Connectors.";
  el.append(h("p", null, h("span", { "aria-hidden": "true", text: "⚠ " }), txt));
  el.append(h("button", { class: "btn", type: "button", text: "Opnieuw proberen", onclick: refreshAll }),
    h("details", null, h("summary", { text: "Details" }), h("span", { class: "mono", text: code })));
}
function stateInto(container, k, emptyText) {
  var s = S[k];
  clear(container);
  if (halted) return null;
  if (cap.mcp === null) { container.append(naBlock()); return null; }
  if (s.status === "error" && !s.hasData && pageAuthCode()) { container.append(h("p", { class: "empty", text: "Niet beschikbaar, zie de melding bovenaan." })); return null; }
  if (s.status === "wait" || (s.status === "loading" && !s.hasData)) { container.append(skeleton(3)); return null; }
  if (s.status === "error") {
    container.append(errorBlock(s.error, k, s, function () { refresh(k); }));
    if (!s.hasData) return null;
    container.append(h("p", { class: "stale-label", text: "Niet actueel" }));
    var w = h("div", { class: "stale-wrap" });
    container.append(w);
    return w;
  }
  return container;
}
function limited(list, key) { return expanded[key] ? list : list.slice(0, MAX_ROWS); }
function showAllBtn(list, key, rerender) {
  if (list.length <= MAX_ROWS || expanded[key]) return null;
  return h("button", { class: "btn text showall", type: "button", text: "Toon alle (" + list.length + ")", onclick: function () { expanded[key] = true; rerender(); } });
}
function moreBtn(row) {
  return h("button", { class: "icon-btn more", type: "button", "aria-label": "Meer acties", "aria-expanded": "false", onclick: function (ev) {
    var open = !row.classList.contains("menu-open");
    closeMenus();
    row.classList.toggle("menu-open", open);
    ev.currentTarget.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) { var f = row.querySelector(".row-actions button, .row-actions a, .amenu button"); if (f) f.focus(); }
  } }, "⋯");
}
function closeMenus() {
  var any = false;
  document.querySelectorAll(".menu-open").forEach(function (r) {
    r.classList.remove("menu-open"); any = true;
    var b = r.querySelector(".more"); if (b) b.setAttribute("aria-expanded", "false");
  });
  document.querySelectorAll(".amenu").forEach(function (m) { if (!m.hidden) { m.hidden = true; any = true; } });
  return any;
}
function nameFromAddr(a) {
  if (!a) return "";
  if (typeof a === "object") return str(a.displayName || a.name || a.email || a.address);
  var s = String(a).trim();
  var m = /^(.*?)\s*<([^>]+)>$/.exec(s);
  if (m && m[1]) return m[1].replace(/^"|"$/g, "");
  var local = s.split("@")[0];
  if (!local) return s;
  return local.split(/[._-]+/).filter(Boolean).map(function (p) { return p.charAt(0).toUpperCase() + p.slice(1); }).join(" ");
}

