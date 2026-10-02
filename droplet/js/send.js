/* Droplet · sending a reply: create the draft, read it back and check it,
   only then send. Never retries by itself. */
(function (D) {
  "use strict";
  var U = D.util, rt = D.rt, mail = D.mail;
  var flow = D.sendflow = {};
  var ID_RE = /^[A-Za-z0-9+/=_-]{8,512}$/;

  /* The new draft’s id from Outlook's answer, never the original's id. */
  flow.extractDraft = function (res, originalId) {
    var objs = U.resultObjects(res), id = "", link = "";
    objs.forEach(function (o) {
      var cands = [o.draftId, o.messageId, o.id, o.draft && o.draft.id];
      cands.forEach(function (c) { if (!id && typeof c === "string" && ID_RE.test(c) && c !== originalId) id = c; });
      if (!link && typeof o.webLink === "string") link = o.webLink;
    });
    if (!id) {
      var m = /\b(?:draftId|messageId|id)["']?\s*[:=]\s*["']?([A-Za-z0-9+/=_-]{16,512})/.exec(U.resultText(res));
      if (m && m[1] !== originalId) id = m[1];
    }
    return { id: id, link: link };
  };

  /* Read-back check: a draft, in the same conversation, going to the expected
     address, containing the start of the user's text (letters and digits only). */
  flow.verify = function (d, o) {
    if (!d || !d.id) return { ok: false, reason: "Couldn’t read the draft back from Outlook." };
    if (d.id === o.originalId) return { ok: false, reason: "Outlook returned the original mail instead of a draft." };
    if (d.isDraft !== true) return { ok: false, reason: "What Outlook returned isn’t a draft." };
    if (!o.conversationId || d.conversationId !== o.conversationId) return { ok: false, reason: "The draft isn’t in the same conversation as the mail." };
    var want = U.alnum(o.text).slice(0, 40);
    if (!want || U.alnum(d.text).indexOf(want) === -1) return { ok: false, reason: "The draft’s text doesn’t match what you wrote." };
    var to = d.to || [];
    if (!to.length) return { ok: false, reason: "Couldn’t check who the draft goes to." };
    var expected = String(o.expectedTo || "").toLowerCase();
    if (expected && to.indexOf(expected) === -1) return { ok: false, reason: "Outlook would send this to " + to.join(", ") + " instead of " + expected + "." };
    return { ok: true };
  };

  function errText(e) { return U.clip(e && e.message || "", 140); }

  /* o: {item, text, conversationId, reuse:{draftId, link, text}}
     Resolves {phase: sent|failed|unclear|blocked, message, draftId, draftLink, draftText} */
  flow.send = function (o) {
    var item = o.item, text = o.text, draftId = "", link = "";
    var reuse = o.reuse && o.reuse.draftId && o.reuse.text === text ? o.reuse : null;
    var step = reuse ? Promise.resolve({ id: reuse.draftId, link: reuse.link }) :
      rt.call("outlook_create_reply_draft", { messageId: item.id, body: U.textToHtml(text), bodyType: "html" }).then(function (res) {
        return flow.extractDraft(res, item.id);
      }, function (e) {
        throw rt.isClear(e)
          ? { phase: "failed", message: "Outlook didn’t make the draft" + (errText(e) ? ": " + errText(e) : "") + ". Nothing was sent; your text is kept." }
          : { phase: "unclear", message: "Outlook didn’t confirm the draft. Nothing was sent, but check your Drafts and Sent Items before sending again." };
      });
    return step.then(function (got) {
      if (!got.id) throw { phase: "blocked", message: "The reply may be in your Outlook Drafts, but Droplet couldn’t confirm it, so nothing was sent. Check Drafts in Outlook.", draftLink: got.link };
      draftId = got.id; link = got.link;
      return rt.call("read_resource", { uri: "mail:///messages/" + encodeURIComponent(draftId) }, { cache: false }).then(function (res) {
        var o2 = U.resultObjects(res).filter(function (x) { return x.id || x.body; })[0];
        return o2 ? mail.detailOf(o2) : null;
      }, function () { return null; });
    }).then(function (d) {
      var v = flow.verify(d, { originalId: item.id, conversationId: o.conversationId, text: text, expectedTo: item.sender });
      if (!v.ok) throw { phase: "blocked", message: v.reason + " Nothing was sent. The draft stays in your Outlook Drafts.", draftLink: link };
      return rt.call("outlook_send_draft", { messageId: draftId }).then(function () {
        return { phase: "sent", draftId: draftId, draftLink: link, sentAt: new Date() };
      }, function (e) {
        throw rt.isClear(e)
          ? { phase: "failed", draftId: draftId, draftLink: link, draftText: text, message: "Outlook didn’t send it" + (errText(e) ? ": " + errText(e) : "") + ". The draft is kept in your Drafts." }
          : { phase: "unclear", draftId: draftId, draftLink: link, draftText: text, message: "Outlook didn’t confirm. It may have gone out: check Sent Items before sending again." };
      });
    }).catch(function (r) {
      if (r && r.phase) return r;
      return { phase: "unclear", draftId: draftId, draftLink: link, draftText: text, message: "Something went wrong mid-way. Check Sent Items before sending again." };
    });
  };
})(window.Droplet = window.Droplet || {});
