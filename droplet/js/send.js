/* Droplet · sending a reply: create the draft, read it back and check it,
   only then send. Never retries a write by itself; the read-back (a read)
   is tried once more after a short wait. Every non-sent outcome says which
   step stopped it, with the error code and Outlook's own words. */
(function (D) {
  "use strict";
  var U = D.util, rt = D.rt, mail = D.mail;
  var flow = D.sendflow = {};
  var ID_RE = /^[A-Za-z0-9+/=_-]{8,512}$/;
  flow.READ_RETRY_MS = 1500;
  flow.STEPS = { create: "create draft", read: "read back", check: "check", send: "send", original: "read original" };

  /* The id inside an Outlook web link's ItemID= parameter (URL-decoded). */
  flow.idFromLink = function (link) {
    var m = /[?&]ItemID=([^&#\s"'<>]+)/i.exec(String(link || ""));
    if (!m) return "";
    var v;
    try { v = decodeURIComponent(m[1]); } catch (e) { return ""; }
    return ID_RE.test(v) ? v : "";
  };

  /* The new draft's id from Outlook's answer, never the original's id.
     Tried in order: id fields in JSON, an id named in plain prose, and
     the ItemID of the web link. The link comes from a field or the prose. */
  flow.extractDraft = function (res, originalId) {
    var objs = U.resultObjects(res), id = "", link = "", text = U.resultText(res);
    function take(c) { if (!id && typeof c === "string" && ID_RE.test(c) && c !== originalId) id = c; }
    objs.forEach(function (o) {
      [o.draftId, o.messageId, o.immutableId, o.id, o.draft && o.draft.id, o.message && o.message.id].forEach(take);
      [o.webLink, o.weblink, o.link, o.url, o.draft && o.draft.webLink].forEach(function (l) { if (!link && typeof l === "string" && /^https:\/\//i.test(l)) link = l; });
    });
    if (!link) {
      var lm = /https:\/\/[^\s"'<>()\]]+/i.exec(text);
      if (lm) link = lm[0].replace(/[.,;:]+$/, "");
    }
    if (!id) {
      /* Prose such as "Draft created. Message ID: AAMk…" or "…with id AAMk…" (not inside a link). */
      var prose = text.replace(/https?:\/\/[^\s"'<>]+/gi, " ");
      var re = /\b(?:draft[\s_-]*id|message[\s_-]*id|immutable[\s_-]*id|item[\s_-]*id|id)\b["'`]?\s*(?:is\s+)?[:=]?\s*["'`]?([A-Za-z0-9+/=_-]{16,512})/gi, m;
      while (!id && (m = re.exec(prose))) take(m[1]);
    }
    if (!id && link) take(flow.idFromLink(link));
    return { id: id, link: link };
  };

  /* Read-back check: a draft, in the same conversation, going to the expected
     address (case-insensitive), containing the start of the user's text
     (letters and digits only). Each failure has a code for diagnosis. */
  flow.verify = function (d, o) {
    function no(code, reason) { return { ok: false, code: code, reason: reason }; }
    if (!d || !d.id) return no("unreadable", "Couldn’t read the draft back from Outlook.");
    if (d.id === o.originalId) return no("same_as_original", "Outlook returned the original mail instead of a draft.");
    if (d.isDraft !== true) return no("not_draft", "What Outlook returned isn’t a draft.");
    if (!o.conversationId || d.conversationId !== o.conversationId) return no("other_conversation", "The draft isn’t in the same conversation as the mail.");
    var want = U.alnum(o.text).slice(0, 40);
    if (!want || U.alnum(d.text).indexOf(want) === -1) return no("text_mismatch", "The draft’s text doesn’t match what you wrote.");
    var to = (d.to || []).map(function (a) { return String(a).toLowerCase(); });
    if (!to.length) return no("no_recipients", "Couldn’t check who the draft goes to.");
    var expected = String(o.expectedTo || "").trim().toLowerCase();
    if (expected && to.indexOf(expected) === -1) return no("other_recipient", "Outlook would send this to " + to.join(", ") + " instead of " + expected + ".");
    return { ok: true };
  };

  function errText(e) { return U.clip(e && e.message || "", 140); }
  function codeOf(e) { return String(e && e.code || "unknown").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 40) || "unknown"; }
  /* What an answer looked like, without its content: for the copy line. */
  function shapeOf(res) {
    var objs = U.resultObjects(res);
    if (objs.length) {
      var keys = {};
      objs.forEach(function (o) { Object.keys(o).forEach(function (k) { if (/^[A-Za-z0-9_@.-]{1,40}$/.test(k)) keys[k] = 1; }); });
      return "answer had JSON keys: " + Object.keys(keys).slice(0, 12).join(", ");
    }
    var t = U.resultText(res);
    return t ? "answer was plain text (" + t.length + " chars)" : "answer was empty";
  }

  /* One read of the draft. Resolves the detail, or null with the reason. */
  function readDraft(id) {
    return rt.call("read_resource", { uri: mail.uriFor(id) }, { cache: false }).then(function (res) {
      var o2 = U.resultObjects(res).filter(function (x) { return x.id || x.body; })[0];
      return o2 ? { d: mail.detailOf(o2) } : { err: { code: "empty_answer", message: "" } };
    }, function (e) { return { err: e || { code: "unknown" } }; });
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* o: {item, text, conversationId, reuse:{draftId, link, text}}
     Resolves {phase: sent|failed|unclear|blocked, message, step, code, detail,
     safeDetail, draftId, draftLink, draftText, keepDraft} */
  flow.send = function (o) {
    var item = o.item, text = o.text, draftId = "", link = "";
    var reuse = o.reuse && o.reuse.draftId && o.reuse.text === text ? o.reuse : null;
    var S = flow.STEPS;
    var step = reuse ? Promise.resolve({ id: reuse.draftId, link: reuse.link }) :
      rt.call("outlook_create_reply_draft", { messageId: item.id, body: U.textToHtml(text), bodyType: "html" }).then(function (res) {
        var got = flow.extractDraft(res, item.id);
        if (!got.id) throw {
          phase: "blocked", step: S.create, code: "no_draft_id", draftLink: got.link,
          detail: U.clip(U.resultText(res), 200), safeDetail: shapeOf(res),
          message: "The reply may be in your Outlook Drafts, but Droplet couldn’t find the draft’s id in Outlook’s answer, so nothing was sent. Check Drafts in Outlook."
        };
        return got;
      }, function (e) {
        var base = { step: S.create, code: codeOf(e), detail: errText(e) };
        throw Object.assign(base, rt.isClear(e)
          ? { phase: "failed", message: "Outlook didn’t make the draft" + (errText(e) ? ": " + errText(e) : "") + ". Nothing was sent; your text is kept." }
          : { phase: "unclear", message: "Outlook didn’t confirm the draft. Nothing was sent, but check your Drafts and Sent Items before sending again." });
      });
    return step.then(function (got) {
      draftId = got.id; link = got.link;
      /* A new draft may not be readable at once: one more try after a short wait. */
      return readDraft(draftId).then(function (r) {
        return r.d ? r : wait(flow.READ_RETRY_MS).then(function () { return readDraft(draftId); });
      });
    }).then(function (r) {
      if (!r.d) {
        throw {
          phase: "blocked", step: S.read, code: codeOf(r.err), detail: errText(r.err), draftId: draftId, draftLink: link, draftText: text, keepDraft: true,
          message: "Outlook made the draft, but Droplet couldn’t read it back to check it, so nothing was sent. " +
            (U.safeOutlookLink(link) ? "Open the draft in Outlook to check it and send it from there." : "Find it in your Outlook Drafts to check it and send it from there.")
        };
      }
      var v = flow.verify(r.d, { originalId: item.id, conversationId: o.conversationId, text: text, expectedTo: item.sender });
      if (!v.ok) throw { phase: "blocked", step: S.check, code: v.code, detail: "", draftLink: link, message: v.reason + " Nothing was sent. The draft stays in your Outlook Drafts." };
      return rt.call("outlook_send_draft", { messageId: draftId }).then(function () {
        return { phase: "sent", draftId: draftId, draftLink: link, sentAt: new Date() };
      }, function (e) {
        var base = { step: S.send, code: codeOf(e), detail: errText(e), draftId: draftId, draftLink: link, draftText: text };
        throw Object.assign(base, rt.isClear(e)
          ? { phase: "failed", message: "Outlook didn’t send it" + (errText(e) ? ": " + errText(e) : "") + ". The draft is kept in your Drafts." }
          : { phase: "unclear", message: "Outlook didn’t confirm. It may have gone out: check Sent Items before sending again." });
      });
    }).catch(function (r) {
      if (r && r.phase) return r;
      return { phase: "unclear", step: "unknown", code: "internal", detail: "", draftId: draftId, draftLink: link, draftText: text, message: "Something went wrong mid-way. Check Sent Items before sending again." };
    });
  };

  /* One line for "Copy details": step, code and message. No mail content, no addresses, no links. */
  flow.detailsLine = function (st) {
    var msg = st.safeDetail || st.detail || "";
    msg = U.redact(msg);
    return "Droplet send " + (st.phase || "problem") + " · step: " + (st.step || "unknown") + " · code: " + (st.code || "unknown") + (msg ? " · message: " + msg : "");
  };
})(window.Droplet = window.Droplet || {});
