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

  /* Obvious noise by rule: no-reply senders, notification robots, newsletters. */
  var NOISE_LOCAL = /^(no-?reply|do-?not-?reply|donotreply|noreply|notifications?|notify|notifier|alerts?|newsletters?|news|mailer-daemon|postmaster|marketing|digest|updates?|bounces?)([._+-].*)?$/i;
  mail.noiseReason = function (m) {
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
    var sender = typeof o.sender === "string" ? o.sender : (o.sender && (o.sender.address || o.sender.emailAddress && o.sender.emailAddress.address)) || "";
    var senderName = (o.sender && typeof o.sender === "object" && o.sender.name) || U.nameFromAddress(sender);
    var uri = typeof o.uri === "string" && o.uri.indexOf(PREFIX) === 0 ? o.uri : mail.uriFor(id);
    if (uri === o.uri) learnUriStyle(id, uri);
    var m = {
      src: "mail", id: id, key: U.keyOf(id), uri: uri,
      subject: String(o.subject || ""), sender: String(sender).trim(), senderName: String(senderName),
      received: String(o.receivedDateTime || ""), summary: String(o.summary || o.bodyPreview || "").replace(/\r\n/g, "\n"),
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
      if (!o) return null;
      var me = { mail: String(o.mail || o.userPrincipalName || ""), displayName: String(o.displayName || "") };
      mail.meDomain = U.domainOf(me.mail);
      mail.meFirst = U.firstName(me.displayName);
      return me;
    }, function () { return null; });
  };

  /* Unread inbox mail of the last 3 days, up to 4 pages of 25. Resolves
     {items, skipped} or rejects with the connector error. */
  mail.loadInbox = function (now) {
    var all = [], seen = {}, page = 0;
    var cutoff = (now || new Date()).getTime() - DAYS * 864e5 - 36e5;
    function next(offset) {
      page++;
      return rt.call("outlook_email_search", { folderName: "Inbox", afterDateTime: DAYS + " days ago", limit: PAGE, offset: offset })
        .then(function (res) {
          var objs = U.resultObjects(res), more = null;
          objs.forEach(function (o) {
            if (o.id && (o.subject !== undefined || o.sender !== undefined)) {
              if (!seen[o.id]) { seen[o.id] = 1; all.push(o); }
            } else if (o.moreResults !== undefined || o.nextOffset !== undefined) more = o;
          });
          if (more && more.moreResults && typeof more.nextOffset === "number" && more.nextOffset > offset && page < MAX_PAGES) return next(more.nextOffset);
        });
    }
    return next(0).then(function () {
      var skipped = 0, items = [], jira = [];
      all.forEach(function (o) {
        if (o.isRead !== false) return;
        var m = normalize(o);
        var t = Date.parse(m.received);
        if (t && t < cutoff) return;
        /* Jira notifications go to the caller, which keeps mentions and
           standstills as Jira items (it knows the user's name) and drops the rest as noise. */
        if (D.atl && D.atl.isJiraSender(m.sender) && D.atl.issueKeyOf(m.subject)) { jira.push(m); return; }
        if (mail.noiseReason(m)) { skipped++; return; }
        items.push(m);
      });
      items.sort(function (a, b) { return String(b.received).localeCompare(String(a.received)); });
      return { items: mergeThreads(items), skipped: skipped, jira: jira };
    });
  };

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
