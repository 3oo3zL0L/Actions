/* Droplet · Outlook mail: load unread inbox mail, filter noise, read one mail. */
(function (D) {
  "use strict";
  var U = D.util, rt = D.rt;
  var mail = D.mail = {};
  var MAX_PAGES = 4, PAGE = 25, DAYS = 3;

  /* R1: a Jira standstill mail about OIDC. Never filtered, always first. */
  mail.isStandstill = function (m) {
    var text = (m.subject || "") + " " + (m.summary || "");
    var jira = /jira|atlassian/i.test(m.sender || "") || /\b[A-Z][A-Z0-9]+-\d+\b/.test(m.subject || "") || /\bjira\b/i.test(text);
    return /standstill/i.test(text) && /\boidc\b/i.test(text) && jira;
  };

  /* Jira and Confluence digests ("…, here is your weekly update for 1 Oct",
     "…daily digest: X has made updates on …", "Updates: 3 changes on …") are
     noise: Jira items come from mentions and standstills, Confluence items from CQL. */
  mail.isDigest = function (m) {
    return /\bhere is your (weekly|daily) update\b|\bdaily digest\b|\bweekly digest\b|^\s*updates:\s*\d+\s+changes?\s+on\b/i.test(m.subject || "");
  };

  /* Obvious noise by rule: no-reply senders, notification robots, newsletters. */
  var NOISE_LOCAL = /^(no-?reply|do-?not-?reply|donotreply|noreply|notifications?|notify|notifier|alerts?|newsletters?|news|mailer-daemon|postmaster|marketing|digest|updates?|bounces?)([._+-].*)?$/i;
  mail.noiseReason = function (m) {
    if (mail.isDigest(m)) return "notification";
    if (mail.isStandstill(m)) return null;
    var addr = String(m.sender || "").toLowerCase(), local = addr.split("@")[0], dom = U.domainOf(addr);
    if (NOISE_LOCAL.test(local)) return /news/.test(local) ? "newsletter" : "notification";
    if (/^(jira|confluence)@/.test(addr) || /(^|\.)atlassian\.net$/.test(dom) && /jira|confluence/.test(local)) return "notification";
    if (/(^|\.)(newsletter|mailchimp|mcsv|sendgrid|hubspotemail|mktomail)\./.test(dom)) return "newsletter";
    var txt = (m.subject || "") + " " + (m.summary || "");
    if (/\bnewsletter\b|\bunsubscribe\b|\buitschrijven\b|\bafmelden\b/i.test(txt)) return "newsletter";
    return null;
  };

  /* The read_resource uri for a message id. The search hands each mail its
     own uri; Droplet copies the encoding seen there (encoded is the default). */
  var PREFIX = "mail:///messages/";
  mail.uriStyle = "encoded";
  mail.uriFor = function (id) {
    return PREFIX + (mail.uriStyle === "raw" ? String(id) : encodeURIComponent(String(id)));
  };
  function learnUriStyle(id, uri) {
    if (!uri || encodeURIComponent(id) === id) return;
    if (uri === PREFIX + id) mail.uriStyle = "raw";
    else if (uri === PREFIX + encodeURIComponent(id)) mail.uriStyle = "encoded";
  }

  function normalize(o) {
    var id = String(o.id || "");
    var from = o.sender !== undefined ? o.sender : o.from;
    var sender = typeof from === "string" ? from : (from && (from.address || from.emailAddress && from.emailAddress.address)) || "";
    var senderName = (from && typeof from === "object" && (from.name || from.emailAddress && from.emailAddress.name)) || U.nameFromAddress(sender);
    var uri = typeof o.uri === "string" && o.uri.indexOf(PREFIX) === 0 ? o.uri : mail.uriFor(id);
    if (uri === o.uri) learnUriStyle(id, uri);
    var m = {
      src: "mail", id: id, key: U.keyOf(id), uri: uri,
      subject: String(o.subject || ""), sender: String(sender).trim(), senderName: String(senderName),
      received: String(o.receivedDateTime || o.received || o.date || ""), summary: String(o.summary || o.bodyPreview || "").replace(/\r\n/g, "\n"),
      importance: String(o.importance || "normal").toLowerCase(), hasAttachments: !!o.hasAttachments,
      webLink: typeof o.webLink === "string" ? o.webLink : "", recipients: Array.isArray(o.recipients) ? o.recipients.length : 0,
      isRead: o.isRead === true
    };
    m.standstill = mail.isStandstill(m);
    m.internal = U.isInternal(m.sender, mail.meDomain ? [mail.meDomain] : []);
    m.thread = U.normSubject(m.subject);
    return m;
  }

  mail.getMe = function () {
    return rt.call("get_me", {}).then(function (res) {
      var o = U.resultObjects(res).filter(function (x) { return x.mail || x.displayName || x.userPrincipalName; })[0];
      if (!o) throw { code: "tool_error", message: "No profile in the answer." };
      var me = { mail: String(o.mail || o.userPrincipalName || ""), displayName: String(o.displayName || "") };
      mail.meDomain = U.domainOf(me.mail);
      mail.meFirst = U.firstName(me.displayName);
      return me;
    });
  };

  /* Mail objects in a search answer. The connector sends one JSON object
     per message (concatenated) plus a final {moreResults, nextOffset};
     a wrapper holding a list ({value|emails|messages|results|items: [...]})
     is opened as well. */
  var LIST_KEYS = ["value", "emails", "messages", "results", "items", "data", "mails"];
  mail.isMailObj = function (o) { return !!(o && o.id && (o.subject !== undefined || o.sender !== undefined || o.from !== undefined)); };
  mail.searchObjects = function (res) {
    var out = [];
    U.resultObjects(res).forEach(function (o) {
      if (mail.isMailObj(o)) return out.push(o);
      var list = null;
      LIST_KEYS.forEach(function (k) { if (!list && Array.isArray(o[k])) list = o[k]; });
      if (list) {
        list.forEach(function (x) { if (x && typeof x === "object") out.push(x); });
        if (o.moreResults !== undefined || o.nextOffset !== undefined) out.push({ moreResults: o.moreResults, nextOffset: o.nextOffset });
      } else out.push(o);
    });
    return out;
  };
  /* Unread: isRead false (Graph), or read false / unread true. The search
     may leave the flag out: then it is unknown and the mail is kept. */
  function readState(o) {
    if (o.isRead === false || o.read === false || o.unread === true) return "unread";
    if (o.isRead === true || o.read === true || o.unread === false) return "read";
    return "unknown";
  }
  /* A text that says, in words, that nothing was found. */
  var NONE_RE = /\b(no|0|zero)\s+(matching\s+|unread\s+)?(e-?mails?|messages?|results?)\b|\bnothing found\b|\bno matches\b/i;
  /* Counts per stage of the last inbox read (diagnostics; numbers only). */
  mail.stats = null;

  /* Unread inbox mail of the last 3 days, up to 4 pages of 25. Resolves
     {items, skipped} or rejects with the connector error. Rejects
     {code: "unparsed"} when Outlook answered with something but no mail
     could be read from it: an empty list must be a recognised empty list. */
  mail.loadInbox = function (now) {
    var all = [], seen = {}, page = 0, stats = { raw: 0, mail: 0, unread: 0, unknownRead: 0, noise: 0, items: 0, shape: "", unparsed: false };
    var cutoff = (now || new Date()).getTime() - DAYS * 864e5 - 36e5;
    mail.stats = stats;
    function next(offset) {
      page++;
      return rt.call("outlook_email_search", { folderName: "Inbox", afterDateTime: DAYS + " days ago", limit: PAGE, offset: offset })
        .then(function (res) {
          if (page === 1) stats.shape = U.shapeOf(res);
          var objs = mail.searchObjects(res), more = null, other = 0;
          stats.raw += objs.length;
          objs.forEach(function (o) {
            if (mail.isMailObj(o)) {
              if (!seen[o.id]) { seen[o.id] = 1; all.push(o); }
            } else if (o.moreResults !== undefined || o.nextOffset !== undefined) more = o;
            else other++;
          });
          var text = U.resultText(res).trim();
          var recognised = all.length || more || (!other && objs.length === 0 && (!text || /^\[\s*\]$/.test(text) || NONE_RE.test(text) || isEmptyList(res)));
          if (page === 1 && !recognised) {
            stats.unparsed = true;
            throw { code: "unparsed", message: "Outlook answered, but Droplet couldn’t read any mail from the answer." };
          }
          if (more && more.moreResults && typeof more.nextOffset === "number" && more.nextOffset > offset && page < MAX_PAGES) return next(more.nextOffset);
        });
    }
    return next(0).then(function () {
      var skipped = 0, items = [], jira = [];
      stats.mail = all.length;
      all.forEach(function (o) {
        var rs = readState(o);
        if (rs === "read") return;
        stats.unread++;
        if (rs === "unknown") stats.unknownRead++;
        var m = normalize(o);
        var t = Date.parse(m.received);
        if (t && t < cutoff) return;
        /* Jira notifications go to the caller, which keeps mentions and
           standstills as Jira items (it knows the user's name) and drops the rest as noise. */
        if (D.atl && !mail.isDigest(m) && D.atl.isJiraSender(m.sender) && D.atl.issueKeyOf(m.subject)) { jira.push(m); return; }
        if (mail.noiseReason(m)) { skipped++; return; }
        items.push(m);
      });
      stats.noise = skipped;
      items.sort(function (a, b) { return String(b.received).localeCompare(String(a.received)); });
      var merged = mergeThreads(items);
      stats.afterNoise = items.length; stats.jira = jira.length; stats.items = merged.length;
      return { items: merged, skipped: skipped, jira: jira };
    });
  };
  /* An envelope whose payload/structuredContent is an empty list. */
  function isEmptyList(res) {
    if (!res || typeof res !== "object") return false;
    return [res.payload, res.structuredContent].some(function (v) {
      if (Array.isArray(v)) return !v.length;
      if (v && typeof v === "object") return LIST_KEYS.some(function (k) { return Array.isArray(v[k]) && !v[k].length; });
      return false;
    });
  }

  /* R8 (rule part): unread mails of one thread become one item, the newest. */
  function mergeThreads(items) {
    var byThread = {}, out = [];
    items.forEach(function (m) {
      var k = m.thread && m.thread.length > 3 ? m.thread : null;
      if (k && byThread[k]) { byThread[k].merged.push(m.id); if (m.standstill) byThread[k].standstill = true; return; }
      m.merged = [];
      if (k) byThread[k] = m;
      out.push(m);
    });
    return out;
  }

  /* The full mail as plain text (never HTML). */
  mail.read = function (m) {
    return rt.call("read_resource", { uri: m.uri }).then(function (res) {
      var o = U.resultObjects(res).filter(function (x) { return x.id || x.body || x.subject; })[0];
      if (!o) throw { code: "tool_error", message: "Empty answer" };
      return mail.detailOf(o);
    });
  };
  mail.detailOf = function (o) {
    var from = o.sender && (o.sender.emailAddress || o.sender) || o.from && (o.from.emailAddress || o.from) || {};
    function addrs(list) {
      return (Array.isArray(list) ? list : []).map(function (r) { r = r && (r.emailAddress || r) || {}; return String(r.address || r || "").toLowerCase(); }).filter(Boolean);
    }
    return {
      id: String(o.id || ""), subject: String(o.subject || ""),
      text: U.bodyToText(o.body) || String(o.bodyPreview || ""),
      fromName: String(from.name || ""), fromAddress: String(from.address || "").toLowerCase(),
      to: addrs(o.toRecipients), cc: addrs(o.ccRecipients),
      conversationId: o.conversationId ? String(o.conversationId) : "",
      isDraft: o.isDraft === true, webLink: typeof o.webLink === "string" ? o.webLink : "",
      received: String(o.receivedDateTime || "")
    };
  };
})(window.Droplet = window.Droplet || {});
