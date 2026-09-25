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
  applyTheme(theme); lsSet(LS.theme, theme);
  announce("Thema: " + THEME_LABEL[theme]);
});

// ---------- Events ----------
$("refreshAll").addEventListener("click", function () { logEvent("ververs_alles"); refreshAll(); });
var REFRESH_NAME = { today: "vandaag", inbox: "inbox", work: "werk", acties: "acties" };
document.querySelectorAll("[data-refresh]").forEach(function (b) { b.addEventListener("click", function () { var g = b.getAttribute("data-refresh"); logEvent("ververs_" + (REFRESH_NAME[g] || g)); refreshGroup(g); }); });
document.querySelectorAll(".collapse").forEach(function (b) {
  b.addEventListener("click", function () {
    var sec = b.closest(".card"); var c = sec.getAttribute("data-collapsed") === "true";
    sec.setAttribute("data-collapsed", c ? "false" : "true"); b.setAttribute("aria-expanded", c ? "true" : "false");
  });
});
if (mqMobile.matches) { var w = $("werk"); w.setAttribute("data-collapsed", "true"); w.querySelector(".collapse").setAttribute("aria-expanded", "false"); }
setupTabs("inbox", ["mail", "teams"], LS.tabInbox);
setupTabs("werk", ["jira", "conf"], LS.tabWork);
$("addForm").addEventListener("submit", onAddSubmit);
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

$("barForm").addEventListener("submit", function (e) {
  e.preventDefault();
  var v = $("barInput").value.trim();
  if (!v || !cap.sample) return;
  $("barInput").value = "";
  openPanel($("barInput"));
  userAsk(v);
});
$("quick").addEventListener("click", function (e) {
  var b = e.target.closest("button[data-q]"); if (!b || !cap.sample) return;
  var q = b.getAttribute("data-q");
  openPanel(b);
  logEvent("claude_snelknop_" + q);
  chat.budget = 0; // snelknop: alleen lezen
  sendChat(QUICK[q] + "\n\nAlleen lezen: voer geen schrijfacties uit.", QUICK_LABEL[q]);
});
$("chatForm").addEventListener("submit", function (e) { e.preventDefault(); var v = chatInput.value; if (chat.busy) return; chatInput.value = ""; chatInput.style.height = ""; userAsk(v); });
chatInput.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("chatForm").requestSubmit(); } });
chatInput.addEventListener("input", function () { chatInput.style.height = "auto"; chatInput.style.height = Math.min(chatInput.scrollHeight + 2, 160) + "px"; });
$("chatStop").addEventListener("click", function () { if (activeCtl) activeCtl.abort(); });
$("chatClose").addEventListener("click", closePanel);
$("scrim").addEventListener("click", closePanel);
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
$("fab").addEventListener("click", function () { openPanel($("fab")); });
$("helpBtn").addEventListener("click", function () { openKeys(); });
chatEl.addEventListener("keydown", function (e) {
  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closePanel(); return; }
  if (e.key === "Tab" && isOverlayTrap()) {
    var f = Array.prototype.filter.call(chatEl.querySelectorAll("button, [href], input, textarea, select, [tabindex]:not([tabindex='-1'])"), function (x) { return !x.disabled && !x.hidden && x.offsetParent !== null; });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});
document.addEventListener("click", function (e) {
  if (!e.target.closest(".more") && !e.target.closest(".row-actions") && !e.target.closest(".amenu")) closeMenus();
});
function openKeys() { var d = $("keys"); try { if (!d.open) d.showModal(); } catch (e) { d.setAttribute("open", ""); } }

var gPending = 0;
document.addEventListener("keydown", function (e) {
  var t = e.target;
  var typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
  if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); focusBar(); return; }
  if ($("keys").open) return;
  if (e.key === "Escape") {
    if (closeMenus()) { e.preventDefault(); return; }
    if (!chatEl.hidden) { e.preventDefault(); closePanel(); return; }
    return;
  }
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  if ($("keys").open) return;
  if (gPending && Date.now() - gPending < 1500) {
    gPending = 0;
    var map = { v: "vandaag", i: "inbox", w: "werk", a: "acties" };
    var id = map[e.key.toLowerCase()];
    if (id) { e.preventDefault(); jumpTo(id); }
    return;
  }
  gPending = 0;
  if (e.key === "/") { e.preventDefault(); focusBar(); }
  else if (e.key === "?") { e.preventDefault(); openKeys(); }
  else if (e.key === "g") { gPending = Date.now(); }
  else if (e.key === "n") { e.preventDefault(); var inp = $("addInput"); if (!inp.disabled) { jumpTo("acties", true); inp.focus(); } }
  else if (e.key === "R") { e.preventDefault(); refreshAll(); }
  else if (e.key === "r") {
    var sec = t && t.closest ? t.closest("section.card") : null;
    if (sec) { e.preventDefault(); var b = sec.querySelector("[data-refresh]"); if (b) refreshGroup(b.getAttribute("data-refresh")); }
  }
});
function focusBar() { var b = $("barInput"); if (!b.disabled) { b.focus(); b.select(); } else if (!chatEl.hidden) chatInput.focus(); }
function jumpTo(id, noFocus) {
  var sec = $(id);
  if (sec.getAttribute("data-collapsed") === "true") { sec.setAttribute("data-collapsed", "false"); sec.querySelector(".collapse").setAttribute("aria-expanded", "true"); }
  sec.scrollIntoView({ block: "start" });
  if (!noFocus) { sec.setAttribute("tabindex", "-1"); sec.focus({ preventScroll: true }); }
}

// FAB bij uit beeld gescrolde Claude-balk
try {
  var io = new IntersectionObserver(function (en) { $("fab").classList.toggle("show", !en[0].isIntersecting && !!cap.sample); });
  io.observe($("claudebar"));
} catch (e) { /* geen IntersectionObserver */ }

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

