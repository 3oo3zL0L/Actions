// Opstart.
"use strict";

// ---------- Opstart ----------
Shell.init();
onPrefs(function (p, first) { if (first && p.lastEntry) Shell.restore(p.lastEntry); });
renderAll();
applySampleState();
if (!hasRuntime) {
  cap.mcp = null; cap.sample = null; cap.db = null;
  renderAll(); applySampleState();
} else {
  useCap("mcp").then(function (m) {
    cap.mcp = m;
    renderVoorstellen();
    if (!m) { renderAll(); return; }
    ["cal", "mail", "teams", "chats", "jira", "conf"].forEach(function (k) { startWatch(k); });
    fetchMe();
    renderNowStrip();
  });
  useCap("sample").then(function (s) {
    cap.sample = s;
    if (s && typeof s.limits === "function") {
      sampleLimitsP = Promise.resolve().then(function () { return s.limits(); }).then(function (l) {
        if (l && typeof l === "object") {
          if (!l.tools) sampleHasTools = false;
          else if (typeof l.tools.maxCount === "number") sampleToolMax = Math.max(0, Math.floor(l.tools.maxCount));
        }
      }, function () { /* onbekend: tools proberen, terugval vangt het op */ });
    }
    applySampleState();
  });
  useCap("db").then(function (d) {
    cap.db = d;
    if (d) { loadPrefs(); subscribeActies(); subscribeVoorstellen(); subscribeHandled(); }
    else usage.buf = [];
    renderActies(); renderNowStrip();
  });
  logEvent("open_pagina");
}
