// Thema, events, sneltoetsen, klok.
"use strict";

// ---------- Thema ----------
var THEMES = ["forest", "light", "system"], THEME_LABEL = { forest: "Dark Forest", light: "Licht", system: "Systeem" };
function applyTheme(t) {
  if (t === "light" || t === "forest") document.documentElement.setAttribute("data-theme", t);
  else document.documentElement.removeAttribute("data-theme");
  var b = $("themeBtn");
  b.setAttribute("aria-label", "Thema: " + THEME_LABEL[t]);
  b.title = "Thema: " + THEME_LABEL[t];
}
var theme = lsGet(LS.theme);
if (theme === "dark") { theme = "forest"; lsSet(LS.theme, "forest"); }
if (THEMES.indexOf(theme) < 0) theme = "forest";
applyTheme(theme);
$("themeBtn").addEventListener("click", function () {
  theme = THEMES[(THEMES.indexOf(theme) + 1) % 3];
  applyTheme(theme); setLocalPref("theme", LS.theme, theme);
  announce("Thema: " + THEME_LABEL[theme]);
});
// Thema uit de voorkeuren (ook van een ander apparaat); localStorage blijft voor de eerste paint.
onPrefs(function (p) {
  var t = p.theme;
  if (THEMES.indexOf(t) < 0 || t === theme || !remoteIsNewer("theme", LS.theme)) return;
  theme = t; applyTheme(theme); lsSet(LS.theme, theme);
});

// ---------- Events ----------
$("refreshAll").addEventListener("click", function () { logEvent("ververs_alles"); refreshAll(); });
var REFRESH_NAME = { today: "agenda", vandaag: "vandaag", inbox: "inbox", work: "werk", acties: "acties" };
document.querySelectorAll("[data-refresh]").forEach(function (b) { b.addEventListener("click", function () { var g = b.getAttribute("data-refresh"); logEvent("ververs_" + (REFRESH_NAME[g] || g)); refreshGroup(g); }); });
var selectInboxTab = setupTabs("inbox", ["mail", "teams"], LS.tabInbox);
setupTabs("werk", ["jira", "conf"], LS.tabWork);
onPrefs(function (p) { if ((p.inboxFilter === "mail" || p.inboxFilter === "teams") && p.inboxFilter !== activeTab.inbox) selectInboxTab(p.inboxFilter); });
$("jqlToggle").addEventListener("click", function () {
  var f = $("jqlForm"), open = f.hidden;
  f.hidden = !open; $("jqlToggle").setAttribute("aria-expanded", open ? "true" : "false");
  if (open) { $("jqlInput").value = getJql(); $("jqlInput").focus(); }
});
$("jqlApply").addEventListener("click", function () {
  var v = $("jqlInput").value.trim();
  lsSet(LS.jql, v && v !== DEFAULT_JQL ? v : null);
  $("jqlForm").hidden = true; $("jqlToggle").setAttribute("aria-expanded", "false");
  S.jira.items = []; S.jira.hasData = false; S.jira.sig = ""; expanded.jira = false;
  refresh("jira");
  $("jqlToggle").focus();
});
$("jqlReset").addEventListener("click", function () { lsSet(LS.jql, null); $("jqlInput").value = DEFAULT_JQL; });
// Nu-strip: links springen naar de ingang.
$("nowstrip").addEventListener("click", function (e) {
  var a = e.target.closest("a[data-go]"); if (!a) return;
  e.preventDefault(); Shell.go(a.getAttribute("data-go"), { user: true, focus: true });
});

// Claude openen zonder item (tot de command bar er is): knop, / en Ctrl+K.
function openClaude(opener) {
  if (!cap.sample) return;
  logEvent("claude_open");
  openPanel(opener || $("askClaude"));
}
$("askClaude").addEventListener("click", function () { openClaude($("askClaude")); });
$("chatForm").addEventListener("submit", function (e) { e.preventDefault(); var v = chatInput.value; if (chat.busy) return; chatInput.value = ""; chatInput.style.height = ""; userAsk(v); });
chatInput.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("chatForm").requestSubmit(); } });
chatInput.addEventListener("input", function () { chatInput.style.height = "auto"; chatInput.style.height = Math.min(chatInput.scrollHeight + 2, 160) + "px"; });
$("chatStop").addEventListener("click", function () { if (activeCtl) activeCtl.abort(); });
$("chatClose").addEventListener("click", closePanel);
$("chatNew").addEventListener("click", function () { if (activeCtl) activeCtl.abort(); chat.turns = []; chat.ctx = null; renderCtx(); clear(chatLog); chatInput.focus(); });
// "+": context van een sectie toevoegen aan de volgende vraag.
function setPlusMenu(open, focusFirst) {
  $("chatPlusMenu").hidden = !open;
  $("chatPlus").setAttribute("aria-expanded", open ? "true" : "false");
  if (open && focusFirst) { var f = $("chatPlusMenu").querySelector("button"); if (f) f.focus(); }
}
$("chatPlus").addEventListener("click", function () { setPlusMenu($("chatPlusMenu").hidden, true); });
$("chatPlusMenu").addEventListener("click", function (e) {
  var b = e.target.closest("button[data-ctx]"); if (!b) return;
  var t = b.getAttribute("data-ctx");
  chat.ctx = { type: t, it: {}, title: SECTION_TITLE[t] };
  logEvent("claude_context_" + t);
  setPlusMenu(false); renderCtx(); chatInput.focus();
});
$("chatPlusMenu").addEventListener("keydown", function (e) {
  var items = Array.prototype.slice.call($("chatPlusMenu").querySelectorAll("button"));
  var i = items.indexOf(document.activeElement);
  if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setPlusMenu(false); $("chatPlus").focus(); }
});
document.addEventListener("click", function (e) { if (!e.target.closest(".plus-wrap")) setPlusMenu(false); });
$("chatBack").addEventListener("click", function () { Shell.back(); });
$("helpBtn").addEventListener("click", function () { openKeys(); });
chatEl.addEventListener("keydown", function (e) {
  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closePanel(); return; }
});
function openKeys() { var d = $("keys"); try { if (!d.open) d.showModal(); } catch (e) { d.setAttribute("open", ""); } }

// ---------- Sneltoetsen (nooit tijdens typen) ----------
var gPending = 0;
var ENTRY_KEYS = { "1": "vandaag", "2": "inbox", "3": "acties", "4": "werk", "5": "agenda" };
document.addEventListener("keydown", function (e) {
  var t = e.target;
  var typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
  if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); openClaude(); return; }
  if ($("keys").open) return;
  if (e.key === "Escape") {
    if (closeMenus()) { e.preventDefault(); return; }
    if (!chatEl.hidden) { e.preventDefault(); closePanel(); return; }
    if (Shell.isPhone() && Shell.screen() === "detail") { e.preventDefault(); Shell.back(); return; }
    return;
  }
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  var inChat = t && t.closest && t.closest("#chat");
  if (gPending && Date.now() - gPending < 1500) {
    gPending = 0;
    var map = { v: "vandaag", i: "inbox", w: "werk", a: "acties" };
    var id = map[e.key.toLowerCase()];
    if (id) { e.preventDefault(); Shell.go(id, { user: true, focus: true }); }
    return;
  }
  gPending = 0;
  if (ENTRY_KEYS[e.key] && !e.shiftKey) { e.preventDefault(); Shell.go(ENTRY_KEYS[e.key], { user: true, focus: true }); }
  else if (!inChat && (e.key === "j" || e.key === "ArrowDown")) { e.preventDefault(); Shell.move(1); }
  else if (!inChat && (e.key === "k" || e.key === "ArrowUp")) { e.preventDefault(); Shell.move(-1); }
  else if (e.key === "/") { e.preventDefault(); openClaude(); }
  else if (e.key === "?") { e.preventDefault(); openKeys(); }
  else if (e.key === "z") { if (undoLast()) e.preventDefault(); }
  else if (e.key === "g") { gPending = Date.now(); }
  else if (e.key === "n") { e.preventDefault(); newActie(); }
  else if (e.key === "R") { e.preventDefault(); refreshAll(); }
  else if (!inChat && e.key.length === 1 && Shell.runKey(e.key)) { e.preventDefault(); }
  else if (e.key === "c") { e.preventDefault(); openClaude(); }
  else if (e.key === "r") {
    var sec = t && t.closest ? t.closest("section.card") : null;
    if (sec) { e.preventDefault(); var b = sec.querySelector("[data-refresh]"); if (b) refreshGroup(b.getAttribute("data-refresh")); }
  }
});

// Klok: elke minuut, zonder netwerk
var lastDay = new Date().getDate();
setInterval(function () {
  if (halted) return;
  renderHeader();
  if (S.cal.hasData) renderToday();
  if (acties.loaded) renderActies();
  tickRelTimes();
  var d = new Date().getDate();
  if (d !== lastDay && cap.mcp) { lastDay = d; refresh("cal"); refresh("teams"); }
}, 60000);

