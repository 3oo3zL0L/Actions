/* Droplet · Teams chats as a source (backlog 7, R4).
   Recent chat messages → one item per chat that waits on you. A chat where
   you wrote last is done (R4) and is not an item. Droplet can only read
   Teams (Chat.Read, ChatMessage.Read): it never posts. */
(function (D) {
  "use strict";
  var U = D.util, rt = D.rt;
  var teams = D.teams = {};
  var MAX_PAGES = 3, PAGE = 25, DAYS = 2, SHOW = 6, READ_MAX = 3;
  var URI_RE = /^teams:\/\/\/chats\/([^/]+)\/messages\/([^/?#]+)$/;

  /* Search summaries are plain text, but may carry hit markers (<c0>…</c0>,
     <ddd/>). Those go; everything else is shown as the text it is. */
  teams.summaryText = function (s) {
    return String(s == null ? "" : s).replace(/<\/?c\d+>/gi, "").replace(/<ddd\s*\/>/gi, "…")
      .replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  };
  /* A read message body: HTML by default (as Teams stores it), turned into text. */
  teams.bodyText = function (b) {
    if (b == null) return "";
    if (typeof b === "string") return U.htmlToText(b);
    var type = String(b.contentType || "html").toLowerCase();
    return type === "text" ? String(b.content || "").replace(/\r\n?/g, "\n").trim() : U.htmlToText(b.content);
  };

  function person(from) {
    var f = from && (from.user || from.emailAddress || from) || {};
    if (typeof f === "string") f = { email: f };
    var email = String(f.email || f.address || f.mail || f.userPrincipalName || "").trim().toLowerCase();
    var name = String(f.displayName || f.name || "").trim();
    return { email: email, name: name || (email ? U.nameFromAddress(email) : "") };
  }
  function chatFromUri(uri) {
    var m = URI_RE.exec(String(uri || ""));
    if (!m) return "";
    try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
  }
  teams.uriFor = function (chatId, id) {
    return "teams:///chats/" + encodeURIComponent(chatId) + "/messages/" + encodeURIComponent(id);
  };
  teams.itemId = function (chatId) { return "teams:" + chatId; };

  function normMsg(o) {
    var id = String(o.id || ""), chatId = String(o.chatId || chatFromUri(o.uri) || "");
    var t = Date.parse(o.createdDateTime || o.lastModifiedDateTime || "");
    var p = person(o.from);
    return {
      id: id, chatId: chatId, at: isNaN(t) ? 0 : t, created: String(o.createdDateTime || o.lastModifiedDateTime || ""),
      uri: typeof o.uri === "string" && URI_RE.test(o.uri) ? o.uri : teams.uriFor(chatId, id),
      email: p.email, name: p.name, text: teams.summaryText(o.summary || o.bodyPreview || ""),
      topic: String(o.subject || o.topic || "").trim(), webUrl: typeof o.webUrl === "string" ? o.webUrl : "",
      importance: String(o.importance || "normal").toLowerCase()
    };
  }

  function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  /* The user is named in the text: "@Sam", "Sam," or "sam" as a word. */
  teams.mentions = function (text, first) {
    if (!first || first.length < 2) return false;
    return new RegExp("(^|[^\\p{L}\\p{N}])@?" + escRe(first) + "(?![\\p{L}\\p{N}])", "iu").test(String(text || ""));
  };
  /* A question mark outside links. */
  teams.asks = function (text) {
    return /\?/.test(String(text || "").replace(/\b(?:https?:\/\/|www\.)\S+/gi, " "));
  };

  /* Messages → items, one per chat that has messages from others after the
     user's own last message. Pure: exposed for tests. */
  teams.build = function (msgs, me, now, extraDomains) {
    var mine = String(me && me.mail || "").trim().toLowerCase();
    var myName = String(me && me.displayName || "").trim().toLowerCase();
    var first = U.firstName(me && me.displayName);
    var nowT = (now || new Date()).getTime(), cutoff = nowT - DAYS * 864e5 - 36e5;
    function isMe(m) { return mine ? m.email === mine || (!m.email && myName && m.name.toLowerCase() === myName) : false; }
    var byChat = {}, order = [];
    msgs.forEach(function (m) {
      if (!m.chatId || !m.id || !m.at || m.at < cutoff || m.at > nowT + 36e5) return;
      if (!m.email && !m.name) return; /* system events */
      if (!byChat[m.chatId]) { byChat[m.chatId] = []; order.push(m.chatId); }
      if (byChat[m.chatId].some(function (x) { return x.id === m.id; })) return;
      byChat[m.chatId].push(m);
    });
    var items = [];
    order.forEach(function (chatId) {
      var list = byChat[chatId].sort(function (a, b) { return a.at - b.at || String(a.id).localeCompare(String(b.id)); });
      var lastMine = -1;
      list.forEach(function (m, i) { m.me = isMe(m); if (m.me) lastMine = i; });
      var pending = list.slice(lastMine + 1);
      if (!pending.length) return; /* R4: you wrote last */
      var seen = {}, others = [], names = [];
      list.forEach(function (m) {
        var k = m.me ? "\u0000me" : (m.email || m.name.toLowerCase());
        if (seen[k]) return;
        seen[k] = 1;
        if (!m.me) { others.push(m.email); names.push(m.name); }
      });
      var meeting = /^19:meeting_/i.test(chatId);
      var oneOnOne = !meeting && (/@unq\.gbl\.spaces$/i.test(chatId) || Object.keys(seen).length === 2 && lastMine >= 0);
      var text = pending.map(function (m) { return m.text; }).join("\n");
      var mention = teams.mentions(text, first), question = teams.asks(text);
      var latest = pending[pending.length - 1];
      var topic = list.map(function (m) { return m.topic; }).filter(Boolean).pop() || "";
      var kind = meeting ? "meeting" : oneOnOne ? "oneOnOne" : "group";
      var shortNames = names.map(U.firstName).filter(Boolean);
      var subject = topic || (kind === "oneOnOne" ? "Chat with " + latest.name :
        (kind === "meeting" ? "Meeting chat with " : "Group chat with ") + shortNames.slice(0, 2).join(", ") + (shortNames.length > 2 ? " +" + (shortNames.length - 2) : ""));
      var link = "";
      for (var i = pending.length - 1; i >= 0 && !link; i--) link = U.safeTeamsLink(pending[i].webUrl) ? pending[i].webUrl : "";
      var shown = (lastMine >= 0 ? [list[lastMine]] : []).concat(pending.slice(-SHOW));
      items.push({
        src: "teams", id: teams.itemId(chatId), key: U.keyOf("teams:" + chatId + ":" + latest.id), chatId: chatId,
        subject: subject, topic: topic, chatKind: kind, oneOnOne: oneOnOne, mention: mention, question: question,
        waits: oneOnOne || mention || question,
        sender: latest.email, senderName: latest.name || "Someone", participants: others, people: names,
        received: latest.created, summary: text, pendingCount: pending.length, more: Math.max(0, pending.length - SHOW),
        msgs: shown.map(function (m) { return { id: m.id, uri: m.uri, me: m.me, name: m.me ? "You" : m.name, email: m.email, at: m.created, text: m.text }; }),
        uri: latest.uri, webUrl: link || latest.webUrl, recipients: others.length,
        importance: pending.some(function (m) { return m.importance === "high" || m.importance === "urgent"; }) ? "high" : "normal",
        internal: U.isInternal(latest.email, extraDomains || [])
      });
    });
    items.sort(function (a, b) { return String(b.received).localeCompare(String(a.received)); });
    return items;
  };

  /* Chat messages of the last `days` days, up to `pages` pages of 25,
     normalised. Rejects with the connector error. */
  teams.search = function (days, pages) {
    var all = [], page = 0;
    function next(offset) {
      page++;
      return rt.call("chat_message_search", { query: "*", afterDateTime: days + " days ago", limit: PAGE, offset: offset }).then(function (res) {
        var more = null;
        U.resultObjects(res).forEach(function (o) {
          if (o.id && (o.chatId || URI_RE.test(String(o.uri || "")))) all.push(normMsg(o));
          else if (o.moreResults !== undefined || o.nextOffset !== undefined) more = o;
        });
        if (more && more.moreResults && typeof more.nextOffset === "number" && more.nextOffset > offset && page < pages) return next(more.nextOffset);
      });
    }
    return next(0).then(function () { return all; });
  };
  /* The last 2 days of chat messages, up to 3 pages of 25. Resolves the
     items; rejects with the connector error. */
  teams.load = function (me, now, extraDomains) {
    /* me may be a promise (get_me still on its way): the search starts at once. */
    return Promise.all([teams.search(DAYS, MAX_PAGES), Promise.resolve(me)]).then(function (r) {
      var who = r[1];
      if (!who || !who.mail) throw { code: "no_me", message: "Your own address is unknown." };
      return teams.build(r[0], who, now, typeof extraDomains === "function" ? extraDomains() : extraDomains);
    });
  };

  /* The full text of the newest messages from others (read_resource), as
     plain text. Resolves {texts: {msgId: text}, failed: n}. */
  teams.read = function (it) {
    var want = it.msgs.filter(function (m) { return !m.me; }).slice(-READ_MAX);
    return Promise.all(want.map(function (m) {
      return rt.call("read_resource", { uri: m.uri }).then(function (res) {
        var o = U.resultObjects(res).filter(function (x) { return x.body || x.id; })[0];
        var t = o ? teams.bodyText(o.body) : "";
        return t ? [m.id, t] : null;
      }, function () { return null; });
    })).then(function (r) {
      var texts = {}, failed = 0;
      r.forEach(function (x) { if (x) texts[x[0]] = x[1]; else failed++; });
      return { texts: texts, failed: failed, asked: want.length };
    });
  };
})(window.Droplet = window.Droplet || {});
