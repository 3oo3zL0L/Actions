// Inbox: mail, mail afhandelen, Teams.
"use strict";

// ---------- Inbox: Mail ----------
var NOTIF_LOCAL = /^(no-?reply|do-?not-?reply|noreply|notifications?|notify|alerts?|mailer-daemon|postmaster|bounce|automated|system)/;
var NOTIF_DOMAINS = ["atlassian.net", "atlassian.com", "github.com", "microsoft.com", "office365.com", "teams.mail.microsoft", "sharepoint.com", "yammer.com", "jenkins", "sonarcloud.io"];
var NOTIF_SUBJ = ["[jira]", "[confluence]", "automatic reply", "automatisch antwoord", "out of office", "afwezig", "undeliverable", "onbestelbaar", "accepted:", "geaccepteerd:", "declined:", "tentative:", "digest", "newsletter", "nieuwsbrief"];
function senderAddr(m) {
  var s = m.sender || m.from;
  if (s && typeof s === "object") s = s.email || s.address || (s.emailAddress && s.emailAddress.address) || "";
  s = str(s).toLowerCase().trim();
  var mm = /<([^>]+)>/.exec(s);
  return mm ? mm[1] : s;
}
function isNotification(m) {
  if (str(m.importance).toLowerCase() === "high") return false;
  var addr = senderAddr(m);
  var at = addr.lastIndexOf("@");
  var local = at >= 0 ? addr.slice(0, at) : addr, domain = at >= 0 ? addr.slice(at + 1) : "";
  if (NOTIF_LOCAL.test(local) || local.indexOf("noreply") >= 0) return true;
  for (var i = 0; i < NOTIF_DOMAINS.length; i++) {
    var d = NOTIF_DOMAINS[i];
    if (d === "jenkins" ? domain.indexOf("jenkins") >= 0 : (domain === d || domain.slice(-(d.length + 1)) === "." + d)) return true;
  }
  var subj = str(m.subject).toLowerCase();
  for (var j = 0; j < NOTIF_SUBJ.length; j++) if (subj.indexOf(NOTIF_SUBJ[j]) >= 0) return true;
  return false;
}
// ---------- Mail afhandelen (verbergen + categorie in Outlook) ----------
var handled = { byMsg: {}, local: {}, undone: {}, unsub: null, last: null };
function handledDocId(messageId) {
  var id = "m-" + str(messageId).replace(/[^A-Za-z0-9_\-.~:@+]/g, "_");
  if (id.length > 190) id = id.slice(0, 150) + "-" + hashStr(messageId);
  return id;
}
function hashStr(t) { var x = 5381; for (var i = 0; i < t.length; i++) x = ((x << 5) + x + t.charCodeAt(i)) >>> 0; return x.toString(36); }
function isHandled(m) { var id = str(m && m.id); return !!id && !handled.undone[id] && (handled.local[id] || handled.byMsg[id]); }
function subscribeHandled() {
  if (!cap.db || handled.unsub) return;
  try {
    handled.unsub = cap.db.collection("inbox_verborgen").onSnapshot(function (snap) {
      var map = {};
      (snap && snap.docs ? snap.docs : []).forEach(function (d) { if (d.exists === false) return; var o = d.data() || {}; if (o.messageId) map[str(o.messageId)] = d.id; });
      handled.byMsg = map;
      if (S.mail.hasData) { renderMail(); renderNowStrip(); }
    }, function () { handled.unsub = null; });
  } catch (e) { /* zonder lijst: niets verborgen */ }
}
function handleMail(m) {
  var id = str(m.id); if (!id) return;
  delete handled.undone[id];
  handled.local[id] = true;
  var st = { m: m, id: id, docId: handledDocId(id), note: "" };
  handled.last = st;
  logEvent("mail_afgehandeld");
  renderMail(); renderNowStrip();
  st.fb = feedback({ text: "Mail afgehandeld", undo: undoHandled });
  var noteFail = function (t) { if (handled.last === st) { st.note = t; st.fb.update({ note: t }); } };
  if (cap.db) {
    queueWrite("verborgen:" + st.docId, function () {
      return cap.db.collection("inbox_verborgen").doc(st.docId).set({ messageId: id, onderwerp: str(m.subject), van: nameFromAddr(m.sender || m.from), at: new Date().toISOString() });
    }).catch(function () { noteFail("Verborgen voor nu, maar onthouden lukte niet."); });
  }
  if (cap.mcp) {
    Promise.resolve().then(function () { return cap.mcp.callTool(M365, "outlook_modify_labels", { messageId: id, addCategories: ["Afgehandeld"] }); })
      .catch(function () { noteFail("Verborgen, maar categorie in Outlook zetten lukte niet"); });
  }
}
function undoHandled() {
  var st = handled.last; if (!st) return;
  handled.last = null;
  delete handled.local[st.id];
  handled.undone[st.id] = true;
  renderMail(); renderNowStrip();
  Shell.select("mail:" + st.id, {});
  feedback({ text: "Mail terug in de lijst" });
  if (cap.db) queueWrite("verborgen:" + st.docId, function () { return cap.db.collection("inbox_verborgen").doc(st.docId).delete(); })
    .then(function () { delete handled.undone[st.id]; }, function () { /* blijft lokaal zichtbaar */ });
}
function renderMail() {
  var panel = $("panel-mail");
  var inner = stateInto(panel, "mail");
  setFresh("mail");
  var split = S.mail.hasData ? mailSplit() : null;
  $("tc-mail").textContent = split && split.unread ? " " + split.unread : "";
  Shell.changed();
  if (!Shell.shown("inbox")) { clear(panel); return; }
  if (!inner) return;
  if (!split.normal.length && !split.notif.length) { inner.append(h("p", { class: "empty", text: "Geen nieuwe mail." })); return; }
  if (!split.normal.length) inner.append(h("p", { class: "empty", text: "Geen nieuwe mail." }));
  var ul = h("ul", { class: "list" });
  limited(split.normal, "mail").forEach(function (m) { ul.append(mailRow(m)); });
  inner.append(ul);
  add(inner, showAllBtn(split.normal, "mail", renderMail));
  if (split.notif.length) {
    var open = lsGet(LS.notif) === "open";
    var nl = h("ul", { class: "list", id: "notif-list" });
    nl.hidden = !open;
    split.notif.forEach(function (m) { nl.append(mailRowCompact(m)); });
    var tg = h("button", { class: "notif-toggle", type: "button", "aria-expanded": open ? "true" : "false", "aria-controls": "notif-list", onclick: function () {
      var o = tg.getAttribute("aria-expanded") !== "true";
      tg.setAttribute("aria-expanded", o ? "true" : "false"); nl.hidden = !o; lsSet(LS.notif, o ? "open" : "dicht");
    } }, h("span", { class: "chev", "aria-hidden": "true", text: "▸" }), "Meldingen (" + split.notif.length + ")");
    inner.append(tg, nl);
  }
}
function mailRow(m) {
  var unread = m.isRead === false;
  var row = h("li", { class: "row" + (unread ? " unread" : ""), "data-id": str(m.id) });
  var who = nameFromAddr(m.sender || m.from) || "(onbekend)";
  var when = relTime(parseDate(m.receivedDateTime));
  var marks = [];
  if (m.hasAttachments) marks.push(h("span", { "aria-label": "bijlage", role: "img", text: "📎" }));
  if (str(m.importance).toLowerCase() === "high") marks.push(h("span", { class: "due-over", "aria-label": "belangrijk", role: "img", text: "!" }));
  var main = h("div", { class: "row-main" },
    h("div", { class: "l1" }, Shell.selTitle(who, unread ? " (ongelezen)" : ""), marks, when),
    h("div", { class: "l3" }, h("span", { style: "color:var(--text)", text: str(m.subject) || "(geen onderwerp)" }), m.summary ? " · " + trunc(m.summary, 240) : ""));
  row.append(main);
  return Shell.row(row, "mail", "mail:" + str(m.id), m);
}
function mailRowCompact(m) {
  var row = h("li", { class: "row compact" });
  var who = nameFromAddr(m.sender || m.from);
  var label = (str(m.subject) || "(geen onderwerp)");
  row.append(h("div", { class: "row-main" }, h("div", { class: "l1" }, Shell.selTitle(label), h("span", { class: "when", text: who }), relTime(parseDate(m.receivedDateTime)))));
  return Shell.row(row, "mail", "mail:" + str(m.id), m);
}

// ---------- Inbox: Teams ----------
function chatName(chatId) {
  var c = S.chats.items.filter(function (x) { return x && x.id === chatId; })[0];
  if (!c) return "";
  if (c.topic) return str(c.topic);
  var names = (c.members || []).map(function (p) { return str(p && p.displayName); }).filter(function (n) { return n && (!me.name || n.indexOf(me.name) !== 0); });
  if (names.length) return trunc(names.join(", "), 40);
  return c.chatType === "oneOnOne" ? "Chat" : "";
}
function teamsFrom(t) { var f = t.from || {}; return str(f.displayName || (f.user && f.user.displayName) || nameFromAddr(f.email)) || "(onbekend)"; }
function renderTeams() {
  var panel = $("panel-teams");
  var inner = stateInto(panel, "teams");
  setFresh("teams");
  var list = S.teams.items.slice().sort(function (a, b) { return (parseDate(b.createdDateTime) || 0) - (parseDate(a.createdDateTime) || 0); });
  $("tc-teams").textContent = S.teams.hasData && list.length ? " " + list.length : "";
  Shell.changed();
  if (!Shell.shown("inbox")) { clear(panel); return; }
  if (!inner) return;
  if (!list.length) { inner.append(h("p", { class: "empty", text: "Geen Teams-berichten sinds gisteren." })); return; }
  var ul = h("ul", { class: "list" });
  limited(list, "teams").forEach(function (t) { ul.append(teamsRow(t)); });
  inner.append(ul);
  add(inner, showAllBtn(list, "teams", renderTeams));
}
function teamsRow(t) {
  var row = h("li", { class: "row" });
  var who = teamsFrom(t);
  var cn = chatName(t.chatId) || str(t.subject);
  var text = trunc(t.summary || t.body || t.text, 400);
  var main = h("div", { class: "row-main" },
    h("div", { class: "l1" }, Shell.selTitle(who), cn ? h("span", { class: "tag", text: trunc(cn, 32) }) : null, relTime(parseDate(t.createdDateTime))),
    h("div", { class: "l3", text: text || "(geen tekst)" }));
  row.append(main);
  return Shell.row(row, "teams", "teams:" + str(t.id), t);
}

// ---------- Detail: mail en Teams ----------
Shell.type("mail", {
  label: "Mail",
  title: function (m) { return str(m.subject) || "(geen onderwerp)"; },
  inline: function (m) { return "mail:" + m.id; },
  detail: function (m, body) {
    var d = parseDate(m.receivedDateTime);
    add(body, metaList([
      ["Van", nameFromAddr(m.sender || m.from) || "(onbekend)"],
      ["Ontvangen", d ? whenLabel(d) + (sameDay(d, new Date()) ? "" : " " + hhmm(d)) : ""],
      ["Bijlage", m.hasAttachments ? "ja, open de mail in Outlook" : ""],
      ["Belang", str(m.importance).toLowerCase() === "high" ? "hoog" : ""]
    ]));
    body.append(h("p", { class: "detail-text", text: str(m.summary) || "(geen voorbeeldtekst)" }));
  },
  actions: function (m) {
    var who = nameFromAddr(m.sender || m.from) || "(onbekend)";
    return [
      { slot: "primary", label: "Antwoord-concept", key: "r", title: "Concept-antwoord in Outlook, in jouw stijl", run: function (x, btn) { openMailDraft(x, btn); } },
      { slot: "done", label: "Afhandelen", key: "e", title: "Uit de lijst halen en in Outlook categorie Afgehandeld zetten", run: function (x) { handleMail(x); } },
      { slot: "make", label: "Maak actie", key: "a", run: function (x) { makeActie({ bron: "mail", bronUrl: x.webLink, van: who, onderwerp: str(x.subject) }); } },
      Shell.act.ask("mail", m),
      Shell.act.open(m.webLink, "Outlook")
    ];
  }
});
Shell.type("teams", {
  label: "Teams",
  title: function (t) { return teamsFrom(t) + (chatName(t.chatId) ? " in " + chatName(t.chatId) : ""); },
  inline: function (t) { return "teams:" + t.id; },
  detail: function (t, body) {
    var d = parseDate(t.createdDateTime);
    add(body, metaList([["Van", teamsFrom(t)], ["Chat", chatName(t.chatId) || str(t.subject)], ["Tijd", d ? whenLabel(d) + (sameDay(d, new Date()) ? "" : " " + hhmm(d)) : ""]]));
    body.append(h("p", { class: "detail-text", text: trunc(t.summary || t.body || t.text, 4000) || "(geen tekst)" }));
  },
  actions: function (t) {
    var who = teamsFrom(t), text = trunc(t.summary || t.body || t.text, 400);
    return [
      t.chatId ? { slot: "primary", label: "Antwoord", key: "r", title: "Antwoord in deze chat", run: function (x, btn) { openTeamsReply(x, btn); } } : null,
      { slot: "make", label: "Maak actie", key: "a", run: function (x) { makeActie({ bron: "teams", bronUrl: x.webUrl, van: who, onderwerp: trunc(text, 80) }); } },
      Shell.act.ask("teams", t),
      Shell.act.open(t.webUrl || t.webLink, "Teams")
    ];
  }
});
Shell.entry("inbox", {
  label: "Inbox",
  render: function () { renderMail(); renderTeams(); },
  empty: "Kies een mail of Teams-bericht om het hier te openen.",
  count: function () {
    var n = 0;
    if (S.mail.hasData) n += mailSplit().unread;
    if (S.teams.hasData) n += S.teams.items.length;
    return n;
  }
});
