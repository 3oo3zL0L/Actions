// Werk: Jira en Confluence; renderSource en renderAll.
"use strict";

// ---------- Werk: Jira ----------
function renderJira() {
  var body = $("jira-body");
  var inner = stateInto(body, "jira");
  setFresh("jira");
  var list = S.jira.items.filter(function (x) { return x && (x.key || x.fields); });
  $("tc-jira").textContent = S.jira.hasData && list.length ? " " + list.length : "";
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
  var url = safeUrl(i.webUrl);
  var summ = str(f.summary) || "(geen titel)";
  var titleEl = url ? h("a", { class: "stretch title", href: url, target: "_blank", rel: "noopener noreferrer" }, summ, h("span", { class: "sr", text: " (opent in nieuw tabblad)" })) : h("span", { class: "title", text: summ });
  var upd = jiraDate(f.updated);
  var l2 = [f.project && f.project.name, f.assignee && f.assignee.displayName, upd ? "bijgewerkt " + whenLabel(upd) : ""].filter(Boolean).join(" · ");
  var main = h("div", { class: "row-main" },
    h("div", { class: "l1" }, h("span", { class: "key", text: key }), titleEl),
    l2 ? h("div", { class: "l2", text: l2 }) : null);
  var acts = h("div", { class: "row-actions" });
  var cBtn = h("button", { class: "btn text", type: "button", text: "Commentaar", onclick: function () { openJiraComment(i, cBtn); } });
  acts.append(cBtn, h("button", { class: "btn text", type: "button", text: "Maak actie", onclick: function () { makeActie({ bron: "jira", bronUrl: i.webUrl, van: str(f.assignee && f.assignee.displayName), onderwerp: key + " " + summ }); } }), askBtn("jira", i));
  main.append(acts);
  var card = inlineCards["jira:" + key];
  if (card) { card._opener = cBtn; main.append(card); }
  row.append(main);
  var side = h("div", { class: "row-side" });
  var st = f.status || {};
  var catKey = st.statusCategory && st.statusCategory.key;
  if (st.name) side.append(h("span", { class: "pill" + (catKey === "indeterminate" ? " info" : catKey === "done" ? " success" : ""), text: str(st.name) }));
  if (f.priority && f.priority.name) side.append(h("span", { class: "when", title: "Prioriteit", text: priIcon(f.priority.name) + " " + f.priority.name }));
  side.append(moreBtn(row));
  row.append(side);
  return row;
}
function priIcon(p) { p = str(p).toLowerCase(); return /highest|blocker|critical/.test(p) ? "⏫" : /high|major/.test(p) ? "▲" : /low|minor|trivial/.test(p) ? "▽" : "▬"; }

// ---------- Werk: Confluence ----------
function renderConf() {
  var panel = $("panel-conf");
  var inner = stateInto(panel, "conf");
  setFresh("conf");
  var list = S.conf.items.filter(function (x) { return x && (x.title || x.id); });
  $("tc-conf").textContent = S.conf.hasData && list.length ? " " + list.length : "";
  if (!inner) return;
  if (!list.length) { inner.append(h("p", { class: "empty", text: "Geen pagina's die je recent bewerkte." })); return; }
  var ul = h("ul", { class: "list" });
  limited(list, "conf").forEach(function (p) {
    var row = h("li", { class: "row" });
    var url = safeUrl(p.webUrl || (p._links && p._links.webui));
    var t = str(p.title) || "(zonder titel)";
    var titleEl = url ? h("a", { class: "stretch title", href: url, target: "_blank", rel: "noopener noreferrer" }, t, h("span", { class: "sr", text: " (opent in nieuw tabblad)" })) : h("span", { class: "title", text: t });
    var l2 = [p.space && (p.space.name || p.space.key), str(p.lastModified)].filter(Boolean).join(" · ");
    row.append(h("div", { class: "row-main" }, h("div", { class: "l1" }, titleEl), l2 ? h("div", { class: "l2", text: l2 }) : null));
    var o = extLink(p.webUrl, "Open");
    if (o) row.append(h("div", { class: "row-side" }, o));
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
  if (k === "cal") { renderToday(); renderNowStrip(); }
  else if (k === "mail") { renderMail(); renderNowStrip(); if (changed && S.mail.status === "ok") announce("Inbox bijgewerkt, " + mailSplit().unread + " ongelezen"); }
  else if (k === "teams") renderTeams();
  else if (k === "chats") { if (S.teams.hasData) renderTeams(); }
  else if (k === "jira") renderJira();
  else if (k === "conf") renderConf();
  setBusy();
}
function renderAll() { renderHeader(); renderToday(); renderMail(); renderTeams(); renderJira(); renderConf(); renderActies(); setBusy(); }

