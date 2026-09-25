// Bevestigkaart en schrijfacties (concept, Teams, Jira-commentaar).
"use strict";

// ---------- Bevestigkaart ----------
// opts: {kind:'mail'|'teams'|'jira'|'actie', title, meta, text, target, execute(text)->Promise(result), generate?(hint, onText, signal)->Promise<string>, opener, onClose, autoGenerate}
var cardCount = 0;
function confirmCard(opts) {
  var id = "cc" + (++cardCount);
  var el = h("div", { class: "ccard", role: "group", "aria-labelledby": id + "-t" });
  var state = "voorstel", genCtl = null;
  var notes = {
    mail: { t: "Wordt opgeslagen als concept. Niet verstuurd.", warn: false },
    teams: { t: "Wordt direct verstuurd naar " + (opts.target || "de chat") + ".", warn: true },
    jira: { t: "Wordt direct geplaatst op " + (opts.target || "het issue") + ".", warn: false },
    actie: { t: "Wordt toegevoegd aan je acties.", warn: false }
  };
  var ta = h("textarea", { id: id + "-ta", "aria-label": "Tekst" });
  ta.value = opts.text || "";
  var writing = h("div", { class: "writing", "aria-live": "polite" });
  var hintIn = h("input", { type: "text", placeholder: "Aanwijzing voor Claude", "aria-label": "Aanwijzing voor Claude" });
  var hintRow = opts.generate ? h("div", { class: "hint" }, hintIn) : null;
  var errBox = h("div", { class: "err" });
  var btnCancel = h("button", { class: "btn", type: "button", text: "Annuleren" });
  var btnRun = h("button", { class: "btn primary", type: "button", text: "Uitvoeren" });
  var btnStop = h("button", { class: "btn", type: "button", text: "Stop", hidden: true });
  var btnRegen = opts.generate ? h("button", { class: "btn", type: "button", text: opts.text || opts.autoGenerate ? "Opnieuw schrijven" : "Laat Claude schrijven" }) : null;
  var n = notes[opts.kind] || notes.mail;
  add(el, [
    h("h3", { id: id + "-t", text: opts.title }),
    opts.meta ? h("div", { class: "meta", text: opts.meta }) : null,
    writing, ta, hintRow,
    h("p", { class: "note" + (n.warn ? " warn" : ""), text: n.t }),
    errBox,
    h("div", { class: "btns" }, h("span", { class: "left" }, btnRegen), btnStop, btnCancel, btnRun)]);
  function autoGrow() { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight + 2, 16 * 22 + 16) + "px"; }
  function sync() {
    var busy = state === "bezig" || state === "schrijven";
    ta.readOnly = busy;
    btnRun.disabled = busy || !ta.value.trim();
    btnCancel.disabled = state === "bezig";
    if (btnRegen) btnRegen.disabled = busy;
    hintIn.disabled = busy;
    btnStop.hidden = state !== "schrijven";
    btnRun.textContent = state === "bezig" ? "Uitvoeren…" : state === "fout" ? "Opnieuw uitvoeren" : "Uitvoeren";
    writing.textContent = state === "schrijven" ? "Claude schrijft…" : "";
  }
  ta.addEventListener("input", function () { autoGrow(); sync(); });
  function finish(kind, content) {
    if (genCtl) try { genCtl.abort(); } catch (e) { /* */ }
    clear(el);
    el.className = "ccard collapsed " + kind;
    el.removeAttribute("aria-labelledby");
    add(el, content);
    var opener = el._opener || opts.opener;
    if (opts.onClose) opts.onClose(kind);
    if (opener && document.contains(opener)) opener.focus();
  }
  function cancel() { if (state === "bezig") return; finish("cancel", "Geannuleerd"); }
  async function run() {
    var text = ta.value.trim();
    if (!text || state === "bezig" || state === "schrijven") return;
    state = "bezig"; clear(errBox); sync();
    try {
      var r = await opts.execute(text);
      if (opts.okEvent) logEvent(opts.okEvent, opts.okDetail);
      var link = findLink(r);
      var msgs = {
        mail: ["✓ Concept staat in Outlook. ", link ? extLink(link, "Open concept") : null],
        teams: ["✓ Verstuurd", link ? [". ", extLink(link, "Open in Teams")] : null],
        jira: ["✓ Commentaar geplaatst. ", extLink(link || opts.link, "Open " + (opts.target || ""))],
        actie: ["✓ Actie toegevoegd"]
      };
      var fbText = { mail: "Concept staat in Outlook", teams: "Teams-bericht verzonden", jira: "Commentaar geplaatst" + (opts.target ? " op " + opts.target : ""), actie: "Actie toegevoegd" };
      feedback({ text: fbText[opts.kind] || "Gelukt", link: opts.kind === "jira" ? (link || opts.link) : link, linkLabel: opts.kind === "mail" ? "Open concept" : "Bekijk" });
      finish("ok", msgs[opts.kind] || "✓ Gelukt");
    } catch (e) {
      state = "fout"; sync();
      clear(errBox).append(writeErrorBlock(e, opts.kind));
    }
  }
  async function generate() {
    if (!opts.generate) return;
    var prev = ta.value;
    state = "schrijven"; clear(errBox); sync();
    genCtl = new AbortController();
    var myCtl = genCtl;
    ta.value = "";
    try {
      var txt = await opts.generate(hintIn.value.trim(), prev, function (t) { if (!myCtl.signal.aborted) { ta.value = t; autoGrow(); } }, myCtl.signal);
      if (myCtl.signal.aborted) return;
      ta.value = opts.postProcess ? opts.postProcess(str(txt)) : stripDashes(str(txt).trim());
    } catch (e) {
      if (e && e.code === "cancelled") { if (!ta.value) ta.value = e.text || prev; }
      else { ta.value = (e && e.text) || prev; clear(errBox).append(h("div", { class: "alert" }, h("p", { text: sampleErrText(e) }))); }
    } finally {
      if (genCtl === myCtl) genCtl = null;
      if (state === "schrijven") { state = "voorstel"; sync(); autoGrow(); ta.focus(); }
    }
  }
  btnCancel.addEventListener("click", cancel);
  btnRun.addEventListener("click", run);
  btnStop.addEventListener("click", function () { if (genCtl) genCtl.abort(); });
  if (btnRegen) btnRegen.addEventListener("click", generate);
  hintIn.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); generate(); } });
  el.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && e.target === ta) { e.preventDefault(); run(); }
    else if (e.key === "Escape") {
      e.stopPropagation(); e.preventDefault();
      if (state === "schrijven" && genCtl) genCtl.abort(); else cancel();
    }
  });
  el._cancel = cancel;
  sync();
  setTimeout(autoGrow, 0);
  if (opts.autoGenerate) setTimeout(generate, 0);
  return el;
}
function writeErrorBlock(e, kind) {
  var code = errCode(e);
  var bron = kind === "jira" ? "Atlassian" : kind === "actie" ? "De actielijst" : "Microsoft 365";
  var text;
  if (kind === "actie") text = "Niet opgeslagen. Probeer het opnieuw.";
  else if (code === "server_unavailable" || code === "upstream_error") text = bron + " reageerde niet goed. Het is niet zeker of het gelukt is; controleer dat eerst voor je opnieuw uitvoert.";
  else text = describeError(e, kind === "jira" ? "jira" : "mail").lines.join(" ");
  return h("div", { class: "alert", role: "alert" }, h("p", null, h("span", { "aria-hidden": "true", text: "⚠ " }), text),
    e && e.code ? h("details", null, h("summary", { text: "Details" }), h("span", { class: "mono", text: str(e.code) })) : null);
}
function stripDashes(s) { return str(s).replace(/\s*—\s*/g, ", ").replace(/–/g, "-"); }
function mountInline(key, anchorBtn, card) {
  inlineCards[key] = card;
  card._opener = anchorBtn;
  // Invulkaart onder de actiebalk in het detail (nooit een popup).
  var slot = anchorBtn.closest(".detail") ? Shell.inlineSlot() : anchorBtn.closest(".row-main");
  if (slot) slot.append(card);
}
function toggleExisting(key) {
  var c = inlineCards[key];
  if (c && !c.classList.contains("collapsed")) { var ta = c.querySelector("textarea"); if (ta) ta.focus(); return true; }
  if (c && c.parentNode) c.parentNode.removeChild(c);
  delete inlineCards[key];
  return false;
}
function cleanupLater(key) { return function () { setTimeout(function () { var c = inlineCards[key]; if (c && c.classList.contains("collapsed")) { if (c.parentNode) c.parentNode.removeChild(c); delete inlineCards[key]; } }, 8000); }; }

// Schrijfacties (alleen na klik op Uitvoeren)
function doMailDraft(messageId, text) { return cap.mcp.callTool(M365, "outlook_create_reply_draft", { messageId: messageId, body: text, bodyType: "text" }); }
function doTeamsSend(chatId, text) { return cap.mcp.callTool(M365, "teams_send_chat_message", { chatId: chatId, body: text }); }
function doJiraComment(key, text) {
  return cap.mcp.callTool(ATL, "addCommentToJiraIssue", { cloudId: CLOUD_ID, issueIdOrKey: key, commentBody: text, contentFormat: "markdown" }).then(function (r) {
    if (cap.mcp && typeof cap.mcp.invalidate === "function") cap.mcp.invalidate(ATL, "searchJiraIssuesUsingJql").catch(function () {});
    return r;
  });
}
function needMcp() { if (!cap.mcp) return Promise.reject({ code: "not_granted", message: "mcp niet beschikbaar" }); return null; }

function openMailDraft(m, btn) {
  var key = "mail:" + m.id;
  if (toggleExisting(key)) return;
  logEvent("antwoord_concept_open");
  var who = nameFromAddr(m.sender || m.from);
  var card = confirmCard({
    kind: "mail", title: "Concept-antwoord in Outlook", okEvent: "antwoord_concept_uitgevoerd", postProcess: finishMail,
    meta: "Aan: " + who + " · Re: " + (str(m.subject) || "(geen onderwerp)"),
    text: "", autoGenerate: !!cap.sample,
    generate: cap.sample ? function (hint, prev, onText, signal) {
      return fullOrSummary(m, signal).then(function (body) {
        if (signal && signal.aborted) throw { code: "cancelled" };
        return runSample(mailReplyPrompt(m, hint, prev, body), { onText: onText, signal: signal, cache: hint || prev ? false : undefined });
      });
    } : null,
    execute: function (text) { return needMcp() || doMailDraft(m.id, text); },
    onClose: cleanupLater(key)
  });
  mountInline(key, btn, card);
  if (!cap.sample) card.querySelector("textarea").focus(); else card.querySelector("textarea").focus();
}
function openTeamsReply(t, btn) {
  var key = "teams:" + t.id;
  if (toggleExisting(key)) return;
  var cn = chatName(t.chatId) || teamsFrom(t);
  var card = confirmCard({
    kind: "teams", title: "Teams-bericht naar " + cn, target: cn, okEvent: "teams_antwoord_uitgevoerd",
    meta: "Op: " + trunc(t.summary, 120),
    text: "", autoGenerate: !!cap.sample,
    generate: cap.sample ? function (hint, prev, onText, signal) {
      return runSample(teamsReplyPrompt(t, cn, hint, prev), { onText: onText, signal: signal, cache: hint || prev ? false : undefined });
    } : null,
    execute: function (text) { return needMcp() || doTeamsSend(t.chatId, text); },
    onClose: cleanupLater(key)
  });
  mountInline(key, btn, card);
  card.querySelector("textarea").focus();
}
function openJiraComment(i, btn) {
  var k = str(i.key);
  var key = "jira:" + k;
  if (toggleExisting(key)) return;
  var f = i.fields || {};
  var card = confirmCard({
    kind: "jira", title: "Commentaar op " + k, target: k, link: i.webUrl, okEvent: "jira_commentaar_uitgevoerd",
    meta: str(f.summary),
    text: "", autoGenerate: false,
    generate: cap.sample ? function (hint, prev, onText, signal) {
      return runSample(jiraPrompt(i, hint, prev), { onText: onText, signal: signal, cache: false });
    } : null,
    execute: function (text) { return needMcp() || doJiraComment(k, text); },
    onClose: cleanupLater(key)
  });
  mountInline(key, btn, card);
  card.querySelector("textarea").focus();
}

