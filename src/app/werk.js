// Werk: Jira en Confluence; renderSource en renderAll.
"use strict";

// ---------- Werk: Jira ----------
function renderJira() {
  var body = $("jira-body");
  var inner = stateInto(body, "jira");
  setFresh("jira");
  var list = S.jira.items.filter(function (x) { return x && (x.key || x.fields); });
  $("tc-jira").textContent = S.jira.hasData && list.length ? " " + list.length : "";
  Shell.changed();
  if (!Shell.shown("werk")) { clear(body); return; }
  if (!inner) return;
  if (!list.length) { inner.append(h("p", { class: "empty", text: "Geen issues gevonden voor deze zoekopdracht." })); $("jqlToggle").hidden = false; return; }
  var ul = h("ul", { class: "list" });
  limited(list, "jira").forEach(function (i) { ul.append(jiraRow(i)); });
  inner.append(ul);
  add(inner, showAllBtn(list, "jira", renderJira));
}
function jiraRow(i) {
  var f = i.fields || {};
  var key = str(i.key);
  var row = h("li", { class: "row" });
  var summ = str(f.summary) || "(geen titel)";
  var upd = jiraDate(f.updated);
  var l2 = [f.project && f.project.name, f.assignee && f.assignee.displayName, upd ? "bijgewerkt " + whenLabel(upd) : ""].filter(Boolean).join(" · ");
  var main = h("div", { class: "row-main" },
    h("div", { class: "l1" }, h("span", { class: "key", text: key }), Shell.selTitle(summ)),
    l2 ? h("div", { class: "l2", text: l2 }) : null);
  row.append(main);
  var side = h("div", { class: "row-side" });
  var st = f.status || {};
  var catKey = st.statusCategory && st.statusCategory.key;
  if (st.name) side.append(h("span", { class: "pill" + (catKey === "indeterminate" ? " info" : catKey === "done" ? " success" : ""), text: str(st.name) }));
  if (f.priority && f.priority.name) side.append(h("span", { class: "when", title: "Prioriteit", text: priIcon(f.priority.name) + " " + f.priority.name }));
  if (side.firstChild) row.append(side);
  return Shell.row(row, "jira", "jira:" + key, i);
}
function priIcon(p) { p = str(p).toLowerCase(); return /highest|blocker|critical/.test(p) ? "⏫" : /high|major/.test(p) ? "▲" : /low|minor|trivial/.test(p) ? "▽" : "▬"; }

// ---------- Werk: Confluence ----------
function renderConf() {
  var panel = $("panel-conf");
  var inner = stateInto(panel, "conf");
  setFresh("conf");
  var list = S.conf.items.filter(function (x) { return x && (x.title || x.id); });
  $("tc-conf").textContent = S.conf.hasData && list.length ? " " + list.length : "";
  Shell.changed();
  if (!Shell.shown("werk")) { clear(panel); return; }
  if (!inner) return;
  if (!list.length) { inner.append(h("p", { class: "empty", text: "Geen pagina's die je recent bewerkte." })); return; }
  var ul = h("ul", { class: "list" });
  limited(list, "conf").forEach(function (p) {
    var row = h("li", { class: "row" });
    var t = str(p.title) || "(zonder titel)";
    var l2 = [p.space && (p.space.name || p.space.key), str(p.lastModified)].filter(Boolean).join(" · ");
    row.append(h("div", { class: "row-main" }, h("div", { class: "l1" }, Shell.selTitle(t)), l2 ? h("div", { class: "l2", text: l2 }) : null));
    Shell.row(row, "conf", "conf:" + str(p.id || t), p);
    ul.append(row);
  });
  inner.append(ul);
  add(inner, showAllBtn(list, "conf", renderConf));
}

var lastPageAlert = null;
function renderSource(k, changed) {
  var pc = pageAuthCode();
  if (pc !== lastPageAlert) {
    lastPageAlert = pc; renderPageAlert();
    renderToday(); renderMail(); renderTeams(); renderJira(); renderConf();
  }
  if (k === "cal") { renderToday(); renderNowStrip(); renderInbox(); } // Inbox: wie je vandaag spreekt staat bovenaan
  else if (k === "mail") { renderMail(); renderNowStrip(); if (changed && S.mail.status === "ok") announce("Inbox bijgewerkt, " + mailSplit().unread + " ongelezen"); }
  else if (k === "teams") renderTeams();
  else if (k === "chats") { if (S.teams.hasData) renderTeams(); }
  else if (k === "jira") renderJira();
  else if (k === "conf") renderConf();
  setBusy();
}
function renderAll() { renderHeader(); renderToday(); renderVandaag(); renderMail(); renderTeams(); renderJira(); renderConf(); renderActies(); setBusy(); }


// ---------- Detail: Jira en Confluence ----------
function confUrl(p) { return safeUrl(p.webUrl) || safeUrl(p._links && p._links.webui); }
Shell.type("jira", {
  label: "Jira",
  title: function (i) { return str(i.key) + " " + (str(i.fields && i.fields.summary) || "(geen titel)"); },
  inline: function (i) { return "jira:" + str(i.key); },
  detail: function (i, body) {
    var f = i.fields || {}, upd = jiraDate(f.updated);
    add(body, metaList([
      ["Status", str(f.status && f.status.name)], ["Prioriteit", str(f.priority && f.priority.name)],
      ["Type", str(f.issuetype && f.issuetype.name)], ["Project", str(f.project && f.project.name)],
      ["Toegewezen", str(f.assignee && f.assignee.displayName)], ["Bijgewerkt", upd ? whenLabel(upd) : ""]
    ]));
  },
  actions: function (i) {
    var f = i.fields || {}, key = str(i.key), summ = str(f.summary) || "(geen titel)";
    return [
      { slot: "primary", label: "Commentaar", key: "r", title: "Commentaar plaatsen op " + key, run: function (x, btn) { openJiraComment(x, btn); } },
      { slot: "make", label: "Maak actie", key: "a", run: function (x) { makeActie({ bron: "jira", bronUrl: x.webUrl, van: str(f.assignee && f.assignee.displayName), onderwerp: key + " " + summ }); } },
      Shell.act.ask("jira", i),
      Shell.act.open(i.webUrl, "Jira")
    ];
  }
});
Shell.type("conf", {
  label: "Confluence",
  title: function (p) { return str(p.title) || "(zonder titel)"; },
  detail: function (p, body) {
    add(body, metaList([["Space", str(p.space && (p.space.name || p.space.key))], ["Gewijzigd", str(p.lastModified)]]));
    if (p.excerpt) body.append(h("p", { class: "detail-text", text: trunc(p.excerpt, 2000) }));
  },
  actions: function (p) { return [Shell.act.open(confUrl(p), "Confluence")]; }
});
Shell.entry("werk", {
  label: "Werk",
  render: function () { renderJira(); renderConf(); },
  empty: "Kies een Jira-issue of Confluence-pagina om het hier te openen.",
  count: function () { return S.jira.hasData ? S.jira.items.filter(function (x) { return x && (x.key || x.fields); }).length : ""; }
});
