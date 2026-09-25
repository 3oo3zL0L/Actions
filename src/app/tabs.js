// Tabs (Mail/Teams, Jira/Confluence).
"use strict";

// ---------- Tabs ----------
var activeTab = { inbox: "mail", werk: "jira" };
function setupTabs(group, keys, lsKey) {
  var tabs = keys.map(function (k) { return $("tab-" + k); });
  function select(k, focus) {
    activeTab[group] = k;
    keys.forEach(function (x) {
      var on = x === k;
      $("tab-" + x).setAttribute("aria-selected", on ? "true" : "false");
      $("tab-" + x).tabIndex = on ? 0 : -1;
      $("panel-" + x).hidden = !on;
    });
    if (focus) $("tab-" + k).focus();
    lsSet(lsKey, k);
    setFresh(k);
    var sec = group === "inbox" ? $("inbox") : $("werk");
    sec.setAttribute("data-src", k);
  }
  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () { if (activeTab[group] !== keys[i]) logEvent("tab_" + (keys[i] === "conf" ? "confluence" : keys[i])); select(keys[i]); });
    t.addEventListener("keydown", function (e) {
      var n = null;
      if (e.key === "ArrowRight") n = (i + 1) % keys.length;
      else if (e.key === "ArrowLeft") n = (i - 1 + keys.length) % keys.length;
      else if (e.key === "Home") n = 0; else if (e.key === "End") n = keys.length - 1;
      if (n != null) { e.preventDefault(); select(keys[n], true); }
    });
  });
  var saved = lsGet(lsKey);
  if (keys.indexOf(saved) >= 0) select(saved);
}

