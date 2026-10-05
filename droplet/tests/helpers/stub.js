/* Runs in the page before any app script (page.addInitScript).
   Stubs window.claude.use("mcp" | "sample" | "db") with fixture mail,
   scripted Claude answers and an in-memory db (kept in sessionStorage so a
   reload sees the same store). Every call is recorded in window.__calls. */
function installDropletStub(cfg) {
  "use strict";
  var calls = window.__calls = [];
  /* Like the real runtime (db.d.ts, mcp.d.ts): what it hands out is frozen, deep. */
  function deepFreeze(v) {
    if (v && typeof v === "object" && !Object.isFrozen(v)) { Object.freeze(v); Object.keys(v).forEach(function (k) { deepFreeze(v[k]); }); }
    return v;
  }
  var SERVER = "Microsoft 365";
  var faults = cfg.faults || {};
  /* Short app timeouts for tests (window.__dropletConfig, read by runtime.js). */
  if (cfg.dropletConfig) window.__dropletConfig = cfg.dropletConfig;
  /* cfg.hang: {tools: true | [tool names], servers: [server names], sample: bool, dbGet: bool | [collections], use: [capability names]}.
     A hanging call never settles (an unanswered consent prompt, a stalled connector). */
  var hang = cfg.hang || {};
  /* A test can make the next load hang (after a reload) through sessionStorage. */
  try { var hs = sessionStorage.getItem("__droplet_stub_hang"); if (hs) hang = JSON.parse(hs); } catch (e) { /* ignore */ }
  function never(signal) {
    return new Promise(function (res, rej) {
      if (signal && typeof signal.addEventListener === "function") signal.addEventListener("abort", function () { rej({ code: "cancelled", message: "cancelled" }); });
    });
  }
  function hangs(server, tool) {
    return hang.tools === true || (Array.isArray(hang.tools) && hang.tools.indexOf(tool) >= 0) || (Array.isArray(hang.servers) && hang.servers.indexOf(server) >= 0);
  }
  /* cfg.delays (smoke): {servers: {name: [minMs, maxMs]}, sample: [minMs, maxMs], consentMs}: a realistic answer time,
     and the first call on each server waits consentMs longer (the consent prompt). */
  var delays = cfg.delays || null, consentUntil = {};
  function delayFor(server) {
    if (!delays) return 0;
    var r = server === "sample" ? delays.sample : (delays.servers || {})[server];
    var d = r ? r[0] + Math.random() * (r[1] - r[0]) : 0;
    /* Every call on a server waits for its consent, which the first call asks. */
    var t = performance.now();
    if (consentUntil[server] == null) consentUntil[server] = t + (delays.consentMs || 0);
    return d + Math.max(0, consentUntil[server] - t);
  }
  function delayed(server, p) {
    var d = delayFor(server);
    return d ? new Promise(function (r) { setTimeout(r, d); }).then(function () { return p(); }) : p();
  }
  function err(code, message, resultText) {
    var e = { code: code, message: message || code, retryable: code === "server_unavailable" || undefined };
    /* Like the runtime: a tool failure rejects with tool_error and the tool's own envelope on .result. */
    if (code === "tool_error" && resultText != null) e.result = result(resultText);
    return e;
  }
  function later(v) { return new Promise(function (res) { setTimeout(function () { res(deepFreeze(v)); }, cfg.latency || 0); }); }
  function fault(tool) {
    var f = faults[tool];
    if (!f) return null;
    if (typeof f === "string") return err(f);
    if (f.times != null) { if (f.times <= 0) return null; f.times--; }
    return err(f.code, f.message, f.resultText);
  }
  /* The CallToolResult envelope (artifact mcp.d.ts). cfg.envelope picks the form:
     "blocks" (default): text blocks; payload = first block parsed as JSON, else verbatim.
     "payloadString": no blocks, payload is the text.
     "holder": no blocks, structuredContent/payload is an object holding the text.
     "structured": no blocks, structuredContent/payload is the JSON object (or {result: text}).
     "multiBlock": the text split over two text blocks.
     "bare": the call resolves the text itself (tolerated, not documented). */
  function parsed(t) { try { return JSON.parse(t); } catch (e) { return t; } }
  function result(text, blocks) {
    var mode = cfg.envelope || "blocks";
    blocks = blocks || [text];
    if (mode === "multiBlock" && blocks.length === 1) {
      var cut = text.indexOf("\n") > 0 ? text.indexOf("\n") + 1 : Math.ceil(text.length / 2);
      if (text.charAt(0) !== "{" && text.charAt(0) !== "[") blocks = [text.slice(0, cut), text.slice(cut)];
    }
    if (mode === "payloadString") return { content: [], payload: text };
    if (mode === "holder") return { content: [], structuredContent: { text: text }, payload: { text: text } };
    if (mode === "structured") {
      var p = parsed(text), sc = p && typeof p === "object" ? p : { result: text };
      return { content: [], structuredContent: sc, payload: sc };
    }
    if (mode === "bare") return text;
    return { content: blocks.map(function (t) { return { type: "text", text: t }; }), payload: parsed(blocks[0]) };
  }

  /* ---------- mail ---------- */
  var mailList = (cfg.mail || []).slice();
  var details = cfg.details || {};
  var drafts = {}, draftN = 0, sent = [];
  var draftReads = { fail: cfg.draftReadFail || 0, empty: cfg.draftReadEmpty || 0 };
  /* ---------- teams + calendar ---------- */
  var teamsList = (cfg.teams || []).slice();
  var teamsBodies = cfg.teamsBodies || {};
  var events = (cfg.events || []).slice();
  /* ---------- increment 3: sent mail, calendar, transcripts, new drafts, invites ---------- */
  var sentList = (cfg.sent || []).slice();
  var calendar = (cfg.calendar || []).slice();
  var transcripts = cfg.transcripts || {};
  var created = [];
  window.__stub = {
    addMail: function (m) { mailList.unshift(m); },
    addTeams: function (t) { teamsList.unshift(t); },
    setEvents: function (e) { events = e.slice(); },
    addSent: function (m) { sentList.unshift(m); },
    setCalendar: function (c) { calendar = c.slice(); },
    setEventFault: function (f) { cfg.eventFault = f; },
    created: created,
    setFault: function (tool, f) { if (f == null) delete faults[tool]; else faults[tool] = f; },
    setRank: function (r) { cfg.rank = r; },
    setRankPlan: function (p) { cfg.rankPlan = p; },
    setDraftAnswer: function (d) { cfg.draftAnswer = d; },
    setActionPlan: function (p) { cfg.actionPlan = p; },
    setRankDelay: function (ms) { cfg.rankDelay = ms; },
    setDbFault: function (f) { cfg.dbFault = f || null; },
    setFulfilPlan: function (p) { cfg.fulfilPlan = p; },
    drafts: drafts, sent: sent
  };
  function findMail(id) { return mailList.concat(sentList).filter(function (m) { return m.id === id; })[0]; }
  function isSentMail(id) { return sentList.some(function (m) { return m.id === id; }); }
  /* Calendar fixtures: {id, subject, start, end, organizer:{name,address}, people:[{name,address}], isCancelled, showAs, transcript}. */
  function calWhen(dt) { return window.Droplet.meet.toInstant(dt); }
  function calSearchShape(e) {
    return { uri: "calendar:///events/" + encodeURIComponent(e.id), id: e.id, subject: e.subject, organizer: e.organizer.address,
      attendees: (e.people || []).map(function (p) { return p.address; }), start: e.start, end: e.end, isCancelled: !!e.isCancelled,
      showAs: e.showAs || "busy", isAllDay: !!e.isAllDay, isOrganizer: e.organizer.address === (cfg.me || {}).mail, webLink: "https://outlook.office365.com/calendar/item/" + e.id };
  }
  function bound(s, end) {
    if (!s) return end ? Infinity : -Infinity;
    if (s === "tomorrow") return Date.parse("2026-10-03T00:00:00+02:00");
    var d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? Date.parse(s + "T00:00:00+02:00") : Date.parse(s);
    return isNaN(d) ? (end ? Infinity : -Infinity) : d;
  }
  function inWindow(list, input) {
    var a = bound(input.afterDateTime, false), b = bound(input.beforeDateTime, true);
    return list.filter(function (e) { return calWhen(e.start) >= a && calWhen(e.end) <= b; });
  }
  function convOf(id) { return "AAQkADInventedConv" + String(id).replace(/[^A-Za-z0-9]/g, "") + "AAA="; }
  function readOf(id) {
    if (drafts[id]) {
      var d = JSON.parse(JSON.stringify(drafts[id]));
      if (cfg.readBack === "mismatch") d.body.content = "<p>Something else entirely</p>";
      if (cfg.readBack === "notDraft") d.isDraft = false;
      if (cfg.readBack === "otherConversation") d.conversationId = "AAQkADotherConversationAAA=";
      if (cfg.readBack === "otherRecipient") d.toRecipients = [{ name: "X", address: "Someone@Else.example" }];
      return d;
    }
    var m = findMail(id);
    if (!m) return null;
    var det = details[id] || {};
    return {
      id: m.id, subject: m.subject, bodyPreview: m.summary,
      body: { contentType: det.contentType || "html", content: det.body != null ? det.body : "<p>" + String(m.summary).replace(/</g, "&lt;") + "</p>" },
      sender: { name: det.senderName || "", address: m.sender },
      toRecipients: [{ name: "Sam de Vries", address: "sam.devries@planonsoftware.com" }], ccRecipients: [],
      receivedDateTime: m.receivedDateTime, isDraft: false, isRead: m.isRead,
      conversationId: convOf(m.id), webLink: m.webLink, internetMessageId: "<" + m.id + "@example>", parentFolderId: "AAMkADinventedInbox"
    };
  }
  var tools = {
    get_me: function () { return result(JSON.stringify(cfg.me || { displayName: "Sam de Vries", mail: "sam.devries@planonsoftware.com", id: "u1" })); },
    outlook_email_search: function (input) {
      /* A search by sender (the hours module's address fallback): cfg.senderSearch {"<sender>": [mail objects]}. */
      if (input.sender && !input.folderName && !input.query) {
        var bySender = (cfg.senderSearch || {})[input.sender] || [];
        return result(bySender.map(function (o) { return JSON.stringify(o); }).join("") || "[]");
      }
      var off = input.offset || 0, lim = input.limit || 10;
      var list = input.folderName === "Sent Items" ? sentList : mailList;
      var page = list.slice(off, off + lim).map(function (m, i) {
        var o = Object.assign({ uri: "mail:///messages/" + encodeURIComponent(m.id) }, m); o.offset = off + i; return o;
      });
      /* cfg.search (inbox only): "noReadFlag" leaves isRead out, "wrapper" answers {value: [...], moreResults, nextOffset},
         "prose" answers plain text Droplet can't read, "noneText" answers "No emails found." */
      var inbox = input.folderName !== "Sent Items", sm = inbox && cfg.search;
      if (sm === "noReadFlag") page.forEach(function (o) { delete o.isRead; });
      if (sm === "prose") return result("Found " + page.length + " emails.\n" + page.map(function (o) { return "- " + o.subject + " from " + o.sender; }).join("\n"));
      if (sm === "noneText" && !page.length) return result("No emails found.");
      if (sm === "wrapper") return result(JSON.stringify({ value: page, moreResults: off + lim < list.length, nextOffset: off + lim }));
      var parts = page.map(function (o) { return JSON.stringify(o); });
      if (off + lim < list.length) parts.push(JSON.stringify({ moreResults: true, nextOffset: off + lim, totalResultCount: list.length }));
      /* Like the real connector: concatenated objects, split over two content blocks. */
      var half = Math.ceil(parts.length / 2);
      var blocks = [parts.slice(0, half).join(""), parts.slice(half).join("")].filter(Boolean);
      return result(blocks.join(""), blocks.length ? blocks : ["[]"]);
    },
    /* Seen live (2026-10): one JSON object per message, concatenated, then {moreResults, nextOffset}. */
    chat_message_search: function (input) {
      var off = input.offset || 0, lim = input.limit || 25;
      var parts = teamsList.slice(off, off + lim).map(function (t) {
        return JSON.stringify(Object.assign({ uri: "teams:///chats/" + encodeURIComponent(t.chatId) + "/messages/" + t.id, chatUri: "teams:///chats/" + encodeURIComponent(t.chatId), subject: "", importance: "normal", lastModifiedDateTime: t.createdDateTime }, t));
      });
      parts.push(JSON.stringify({ moreResults: off + lim < teamsList.length, nextOffset: off + lim }));
      return result(parts.join(""));
    },
    outlook_calendar_search: function (input) {
      if (input.afterDateTime === "today") return result(events.map(function (e) { return JSON.stringify(e); }).join("") || "[]");
      var list = calendar;
      if (input.calendarOwnerEmail) {
        var other = (cfg.othersCalendars || {})[String(input.calendarOwnerEmail).toLowerCase()];
        if (!other) throw err("tool_error", "Access is denied. Check credentials and try again.");
        list = other;
      }
      var got = inWindow(list, input).map(calSearchShape);
      return result(got.map(function (e) { return JSON.stringify(e); }).join("") || "[]");
    },
    read_resource: function (input) {
      var cm = /^calendar:\/\/\/events\/(.+)$/.exec(input.uri || "");
      if (cm) {
        var eid = decodeURIComponent(cm[1]), ev = calendar.filter(function (e) { return e.id === eid; })[0];
        if (!ev) throw err("tool_error", "Not found");
        var full = { id: ev.id, subject: ev.subject, body: { contentType: "html", content: "<p>Invented agenda</p>" },
          organizer: { name: ev.organizer.name, address: ev.organizer.address },
          attendees: (ev.people || []).map(function (p) { return { name: p.name, address: p.address, type: "required", responseStatus: "accepted" }; }),
          start: ev.start, end: ev.end, location: { displayName: "Room 1" }, isCancelled: !!ev.isCancelled, showAs: ev.showAs || "busy", isAllDay: false,
          onlineMeeting: { joinUrl: "https://teams.microsoft.com/l/meetup-join/invented" }, webLink: "https://outlook.office365.com/calendar/item/" + ev.id };
        if (ev.transcript !== undefined) full.meetingTranscriptUrl = "meeting-transcript:///events/tok" + encodeURIComponent(ev.id) + "?start=" + ev.start.dateTime + "&end=" + ev.end.dateTime;
        return result(JSON.stringify(full));
      }
      var mt = /^meeting-transcript:\/\/\/events\/tok([^?]+)\?/.exec(input.uri || "");
      if (mt) {
        var tev = calendar.filter(function (e) { return e.id === decodeURIComponent(mt[1]); })[0];
        var tr = tev && tev.transcript;
        if (!tev || tr === "FAIL") throw err("tool_error", "No transcript is available for this meeting.");
        if (tr && typeof tr === "object") return result(JSON.stringify(tr));
        return result(String(tr || ""));
      }
      var tm = /^teams:\/\/\/chats\/([^/]+)\/messages\/(.+)$/.exec(input.uri || "");
      if (tm) {
        var chatId = decodeURIComponent(tm[1]), mid = decodeURIComponent(tm[2]);
        var tmsg = teamsList.filter(function (t) { return t.chatId === chatId && t.id === mid; })[0];
        if (!tmsg) throw err("tool_error", "Not found");
        if (teamsBodies[mid] === "FAIL") throw err("tool_error", "Message not available");
        return result(JSON.stringify({ id: mid, chatId: chatId, createdDateTime: tmsg.createdDateTime, from: { user: { displayName: tmsg.from.displayName, email: tmsg.from.email } },
          body: { contentType: "html", content: teamsBodies[mid] != null ? teamsBodies[mid] : "<p>" + String(tmsg.summary).replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</p>" } }));
      }
      var m = /^mail:\/\/\/messages\/(.+)$/.exec(input.uri || "");
      var id = m && decodeURIComponent(m[1]);
      if (id && drafts[id] && draftReads.fail > 0) { draftReads.fail--; throw err("tool_error", "Tool call failed", "The specified object was not found in the store."); }
      if (id && drafts[id] && draftReads.empty > 0) { draftReads.empty--; return result(""); }
      var o = id && readOf(id);
      if (!o) throw err("tool_error", "Not found");
      return result(JSON.stringify(o));
    },
    /* The real answer is plain text (seen live, 2026-10):
       "Draft created with 1 recipient(s).\nid: <immutable id>\nwebLink: <OWA link>".
       The immutable id (AAkALg…) is URL-safe base64; the link's ItemID is standard base64, URL-encoded. */
    outlook_create_reply_draft: function (input) {
      var orig = findMail(input.messageId);
      if (!orig) throw err("tool_error", "Message not found");
      var n = ("000" + (++draftN)).slice(-4);
      var id = "AAkALgAAAAAAHYQDInventedXyzAC-EWg0AZnzTVwCYQECtK1RmE-l8iwACkVS" + n + "AAA";
      var link = "https://outlook.office365.com/owa/?ItemID=" + encodeURIComponent(id.replace(/-/g, "/").replace(/_/g, "+")) + "&exvsurl=1&viewmodel=ReadMessageItem";
      var to = (isSentMail(orig.id) ? orig.recipients[0] : orig.sender).replace(/(^|[.@])([a-z])/g, function (x, p, c) { return p + c.toUpperCase(); }); /* mixed case, like Outlook */
      drafts[id] = {
        id: id, subject: "RE: " + orig.subject, bodyPreview: "", isDraft: true, conversationId: convOf(orig.id),
        body: { contentType: "html", content: "\r\n" + input.body + "<hr><p>From: " + orig.sender + "</p><p>" + orig.summary + "</p>" },
        sender: { name: null, address: null },
        toRecipients: [{ name: "", address: to }], ccRecipients: [],
        webLink: link, parentFolderId: "AAMkADinventedDrafts", internetMessageId: "<draft" + n + "@example>"
      };
      var shape = cfg.createShape || "text";
      if (shape === "json") return result(JSON.stringify({ id: id, webLink: link }));
      if (shape === "prose") return result("Your reply draft was created with id " + id + ". You can open it in Outlook on the web.");
      if (shape === "linkOnly") return result("Draft created with 1 recipient(s).\nwebLink: " + link);
      if (shape === "noId") return result("Draft created with 1 recipient(s).");
      return result("Draft created with 1 recipient(s).\nid: " + id + "\nwebLink: " + link);
    },
    /* Plain text, like the reply draft (shape given by the PO). */
    outlook_create_draft: function (input) {
      var n = ("000" + (++draftN)).slice(-4);
      var id = "AAkALgAAAAAAHYQDInventedNewMail" + n + "AAA";
      var link = "https://outlook.office365.com/owa/?ItemID=" + encodeURIComponent(id) + "&exvsurl=1&viewmodel=ReadMessageItem";
      drafts[id] = {
        id: id, subject: input.subject || "", bodyPreview: "", isDraft: true, conversationId: "AAQkADnewconv" + n + "AAA=",
        body: { contentType: "html", content: input.body || "" }, sender: { name: null, address: null },
        toRecipients: (input.to || []).map(function (a) { return { name: "", address: a }; }), ccRecipients: [],
        webLink: link, parentFolderId: "AAMkADinventedDrafts"
      };
      return result("Draft created with " + (input.to || []).length + " recipient(s).\nid: " + id + "\nwebLink: " + link);
    },
    outlook_create_event: function (input) {
      if (cfg.eventFault) { var f = cfg.eventFault; cfg.eventFault = null; throw err(f); }
      created.push(input);
      return result("Event created.\nid: AAMkADinventedEvent" + created.length + "\nwebLink: https://outlook.office365.com/calendar/item/new" + created.length);
    },
    /* People search (hours reminders): cfg.people {"<query>": [person objects] | "FAIL"}; like the
       real tool, one JSON object per person, concatenated. */
    search_people: function (input) {
      var q = input.query;
      var list = (cfg.people || {})[q];
      if (list === "FAIL") throw err("tool_error", "Search failed");
      return result((list || []).map(function (o) { return JSON.stringify(o); }).join("") || "[]");
    },
    outlook_send_draft: function (input) {
      if (!drafts[input.messageId]) throw err("tool_error", "Draft not found");
      sent.push(input.messageId);
      return result("Draft sent to 1 recipient(s) and saved to Sent Items.");
    }
  };
  /* ---------- Atlassian Rovo (invented site data; shapes as captured by the PO) ---------- */
  var ATL = "Atlassian Rovo", CLOUD = "f5ee9bed-0e04-48ea-aa28-5c3ecd088de8";
  var atl = cfg.atlassian || {};
  var atlUser = atl.user || { account_id: "acc-sam-0001", name: "Sam de Vries", email: "sam.devries@planonsoftware.com" };
  var issues = atl.issues || {}, pages = atl.pages || {}, jqlKeys = (atl.jql || []).slice();
  var atlLog = { comments: [], updates: [] };
  window.__stub.atl = atlLog;
  window.__stub.setHang = function (h) { hang = h || {}; };
  window.__stub.setPage = function (id, html) { pages[id].html = html; pages[id].version = (pages[id].version || 1) + 1; };
  window.__stub.addIssueComment = function (key, c) { issues[key].comments = (issues[key].comments || []).concat([c]); };
  function needCloud(input) { if (input.cloudId !== CLOUD) throw err("tool_error", "Unknown cloudId"); }
  function issueShape(key, fieldsWanted) {
    var x = issues[key];
    var f = { summary: x.summary, status: { name: x.status || "In Progress", statusCategory: { key: x.statusCat || "indeterminate", name: "In Progress" } },
      project: { key: key.split("-")[0], name: x.project || key.split("-")[0] }, updated: x.updated || "2026-10-02T07:00:00.000+0200" };
    if (!fieldsWanted || fieldsWanted.indexOf("description") >= 0) {
      f.description = x.description || ""; f.assignee = { displayName: x.assignee || "Bram Kok", accountId: "acc-bram" }; f.reporter = { displayName: "Lena Smit", accountId: "acc-lena" };
      f.comment = { comments: (x.comments || []).map(function (c, i) { return { id: String(1000 + i), author: { accountId: c.accountId, displayName: c.author }, body: c.body, created: c.created }; }), total: (x.comments || []).length };
    }
    return { id: "100" + key.replace(/\D/g, ""), key: key, self: "https://api.atlassian.com/ex/jira/" + CLOUD + "/rest/api/3/issue/" + key, fields: f, webUrl: x.webUrl || "https://planon.atlassian.net/browse/" + key };
  }
  /* withBody: "html" or "markdown". Markdown has no macros (as live: they are dropped). */
  function pageShape(id, withBody) {
    var p = pages[id];
    var o = { id: id, type: p.type || "page", status: "current", title: p.title, lastModified: p.lastModified || "2026-10-02T06:00:00.000Z",
      summary: p.excerpt || "", space: { key: p.spaceKey || "OIDC", name: p.spaceName || "OIDC" }, _links: { webui: p.webui || "/spaces/" + (p.spaceKey || "OIDC") + "/pages/" + id },
      author: { displayName: p.author || "Lena Smit" } };
    if (p.webUrl !== undefined) o.webUrl = p.webUrl;
    if (withBody) o.body = withBody === "html" ? (p.html != null ? p.html : "<p>" + p.body + "</p>") : p.body;
    return o;
  }
  var atlTools = {
    atlassianUserInfo: function () { return result(JSON.stringify(atlUser)); },
    getAccessibleAtlassianResources: function () { return result(JSON.stringify([{ id: CLOUD, url: "https://planon.atlassian.net", name: "planon" }])); },
    searchJiraIssuesUsingJql: function (input) {
      needCloud(input);
      var keys = /comment ~/.test(input.jql) ? jqlKeys : Object.keys(issues).filter(function (k) { var q = (/text ~ "([^"]*)"/.exec(input.jql) || [])[1]; return q && (issues[k].summary || "").toLowerCase().indexOf(q.toLowerCase()) >= 0; });
      return result(JSON.stringify({ issues: { nodes: keys.map(function (k) { return issueShape(k, input.fields); }), pageInfo: { hasNextPage: false, endCursor: null } }, context: { cloudId: CLOUD } }));
    },
    getJiraIssue: function (input) {
      needCloud(input);
      if (!issues[input.issueIdOrKey]) throw err("tool_error", "Issue does not exist");
      return result(JSON.stringify(issueShape(input.issueIdOrKey)));
    },
    addCommentToJiraIssue: function (input) {
      needCloud(input);
      if (!issues[input.issueIdOrKey]) throw err("tool_error", "Issue does not exist");
      atlLog.comments.push(JSON.parse(JSON.stringify(input)));
      issues[input.issueIdOrKey].comments = (issues[input.issueIdOrKey].comments || []).concat([{ accountId: atlUser.account_id, author: atlUser.name, body: input.commentBody, created: new Date().toISOString() }]);
      return result(JSON.stringify({ id: "2000", created: new Date().toISOString() }));
    },
    searchConfluenceUsingCql: function (input) {
      needCloud(input);
      var ids = /mention = currentUser\(\)/.test(input.cql) ? atl.mentions || [] : /watcher = currentUser\(\)/.test(input.cql) ? atl.watched || [] :
        Object.keys(pages).filter(function (id) { var q = (/title ~ "([^"]*)"/.exec(input.cql) || [])[1] || ""; return q && pages[id].title.toLowerCase().indexOf(q.toLowerCase()) >= 0; });
      return result(JSON.stringify({ content: { totalCount: ids.length, nodes: ids.map(function (id) { return pageShape(id, false); }) } }));
    },
    getConfluencePage: function (input) {
      needCloud(input);
      if (!pages[input.pageId]) throw err("tool_error", "Page not found");
      /* Seen live (2026-10): the page comes wrapped like a search result, body a plain string. */
      return result(JSON.stringify({ content: { totalCount: 1, nodes: [pageShape(input.pageId, input.contentFormat === "html" ? "html" : "markdown")] } }));
    },
    updateConfluencePage: function (input) {
      needCloud(input);
      if (!pages[input.pageId]) throw err("tool_error", "Page not found");
      atlLog.updates.push(JSON.parse(JSON.stringify(input)));
      if (input.contentFormat === "html") pages[input.pageId].html = input.body; else pages[input.pageId].body = input.body;
      pages[input.pageId].version = (pages[input.pageId].version || 1) + 1;
      return result(JSON.stringify({ id: input.pageId, title: pages[input.pageId].title, version: { number: pages[input.pageId].version } }));
    }
  };
  var mcp = {
    callTool: function (server, tool, input, options) {
      calls.push({ kind: "mcp", server: server, tool: tool, input: JSON.parse(JSON.stringify(input || {})), t: performance.now() });
      if (hangs(server, tool)) return never(options && options.signal);
      if (delays) return delayed(server, function () { return mcp.callNow(server, tool, input, options); });
      return mcp.callNow(server, tool, input, options);
    },
    callNow: function (server, tool, input) {
      if (server === ATL) {
        if (cfg.noAtlassian || !atlTools[tool]) return Promise.reject(err(cfg.noAtlassian || "not_in_manifest"));
        var fa = fault(tool);
        if (fa) return later(null).then(function () { throw fa; });
        try { var ra = atlTools[tool](input || {}); return later(ra); } catch (e) { return later(null).then(function () { throw e; }); }
      }
      if (server !== SERVER || !tools[tool]) return Promise.reject(err("not_in_manifest"));
      var f = fault(tool);
      if (f) return later(null).then(function () { throw f; });
      try { var r = tools[tool](input || {}); return later(r); } catch (e) { return later(null).then(function () { throw e; }); }
    },
    listTools: function () { return Promise.resolve({ servers: [] }); }
  };
  if (cfg.eventSchema || cfg.peopleSchema) mcp.describeTool = function (server, tool) {
    calls.push({ kind: "describe", tool: tool });
    if (tool === "outlook_create_event" && cfg.eventSchema) return Promise.resolve({ name: tool, inputSchema: cfg.eventSchema });
    if (tool === "search_people" && cfg.peopleSchema) return Promise.resolve(deepFreeze({ name: tool, inputSchema: JSON.parse(JSON.stringify(cfg.peopleSchema)) }));
    return Promise.reject(err("not_in_manifest"));
  };

  /* ---------- sample ---------- */
  function idsIn(prompt) {
    var re = /<<<(?:EMAIL|TEAMS|ACTION|WAIT|JIRA|PAGE) \d+ id="([^"]+)">>>/g, m, out = [];
    while ((m = re.exec(prompt))) out.push(m[1]);
    return out;
  }
  function rankAnswer(prompt) {
    if (cfg.rank === "INVALID_JSON") throw { code: "invalid_json", message: "not json", text: "Sure! Here is" };
    if (cfg.rank && cfg.rank !== "AUTO") return JSON.parse(JSON.stringify(cfg.rank));
    var plan = cfg.rankPlan || {};
    /* Own actions get random ids: cfg.actionPlan is keyed by a piece of their text. */
    function actionPlan(id) {
      var s = prompt.indexOf('id="' + id + '">>>'), block = s >= 0 ? prompt.slice(s, prompt.indexOf("<<<END ACTION", s)) : "";
      var text = (/\nText: (.*)/.exec(block) || [])[1] || "";
      var keys = Object.keys(cfg.actionPlan || {}).filter(function (k) { return text.indexOf(k) >= 0; });
      return keys.length ? cfg.actionPlan[keys[0]] : null;
    }
    var items = idsIn(prompt).map(function (id, i) {
      var p = plan[id] || (/^mine:/.test(id) ? actionPlan(id) : null);
      return Object.assign({ id: id, group: "later", rank: 50 + i, project: null, why: "Routine mail.", action: "open", label: "Open it" }, p || {});
    });
    return { items: items.concat(cfg.rankExtra || []) };
  }
  var chatQueue = (cfg.chat || []).slice();
  /* A lazily written draft: cfg.draftAnswer, or a default in the user's style. */
  function draftAnswer(prompt) {
    if (cfg.draftAnswer === "INVALID_JSON") throw { code: "invalid_json", message: "not json" };
    if (cfg.draftAnswer) return JSON.parse(JSON.stringify(cfg.draftAnswer));
    var from = /\nFrom: ([^ <\n]+)/.exec(prompt);
    return { draft: "Hi " + (from ? from[1] : "there") + ",\n\nThanks, noted. I will come back to you on this.\n\nKR\nSam" };
  }
  function answer(input, options, asJson) {
    calls.push({ kind: "sample", json: asJson, input: JSON.parse(JSON.stringify(input)), options: options ? JSON.parse(JSON.stringify(Object.assign({}, options, { signal: undefined }))) : null });
    if (hang.sample) return never(options && options.signal);
    if (delays) return delayed("sample", function () { return answerNow(input, options, asJson); });
    return answerNow(input, options, asJson);
  }
  function answerNow(input, options, asJson) {
    var prompt = typeof input === "string" ? input : input.map(function (t) { return t.content; }).join("\n");
    var isDraft = /You draft one (email|Teams chat) reply|You draft one Teams chat chase for|You draft one Jira comment/.test(prompt) && !/<<<ACTION>>>/.test(prompt);
    var extra = isDraft ? cfg.draftDelay || 0 : /You rank unread email/.test(prompt) ? cfg.rankDelay || 0 : 0;
    if (options && options.tools) return later(null).then(function () {
      if (cfg.sampleFault) throw { code: cfg.sampleFault, message: cfg.sampleFault };
      return toolLoop(prompt, options);
    });
    return later(null).then(function () { return new Promise(function (r) { setTimeout(r, extra); }); }).then(function () {
      if (cfg.sampleFault) throw { code: cfg.sampleFault, message: cfg.sampleFault };
      /* cfg.rankFault {code, message, times}: the next ranking calls fail (e.g. "sampling is unavailable right now"). */
      if (/You rank unread email/.test(prompt) && cfg.rankFault && cfg.rankFault.times > 0) { cfg.rankFault.times--; throw { code: cfg.rankFault.code, message: cfg.rankFault.message || cfg.rankFault.code }; }
      var a = /You rank unread email/.test(prompt) ? rankAnswer(prompt) : isDraft ? draftAnswer(prompt) : extraAnswer(prompt) ||
        (chatQueue.length > 1 ? chatQueue.shift() : chatQueue[0] || { reply: "OK.", draft: null });
      return deepFreeze(asJson ? a : { text: JSON.stringify(a), truncated: false, modelTierApplied: "default" });
    });
  }
  /* Increment 3 prompts: asks in sent messages, commitments in a transcript,
     an invite agenda, a new mail and a chase for an own action. */
  function extraAnswer(prompt) {
    if (/^You find requests that/.test(prompt)) {
      if (cfg.asksFault) throw { code: cfg.asksFault, message: cfg.asksFault };
      var re = /<<<SENT \d+ id="([^"]+)">>>/g, mm, msgs = [];
      while ((mm = re.exec(prompt))) msgs.push({ id: mm[1], asks: JSON.parse(JSON.stringify((cfg.asksPlan || {})[mm[1]] || [])) });
      return { messages: msgs };
    }
    /* Done whichever way: cfg.fulfilPlan {itemKey: {action: "<piece of the action text>", clear}} or
       cfg.fulfilAll (a Claude that obeys injected text: every item finishes every action). */
    if (/^You check whether messages and meetings/.test(prompt)) {
      var acts = [], ra = /<<<ACTION \d+ id="([^"]+)">>>\nText: ([^\n]*)/g, ma;
      while ((ma = ra.exec(prompt))) acts.push({ id: ma[1], text: ma[2] });
      var ri = /<<<ITEM \d+ id="([^"]+)">>>/g, mi, items = [];
      while ((mi = ri.exec(prompt))) {
        var key = mi[1];
        if (cfg.fulfilRaw && cfg.fulfilRaw[key]) { cfg.fulfilRaw[key].forEach(function (x) { items.push(Object.assign({ id: key }, x)); }); continue; }
        if (cfg.fulfilAll) { acts.forEach(function (a) { items.push({ id: key, action: a.id, clear: true }); }); continue; }
        var p = (cfg.fulfilPlan || {})[key];
        var hit = p && acts.filter(function (a) { return a.text.indexOf(p.action) >= 0; })[0];
        items.push({ id: key, action: hit ? hit.id : null, clear: p ? p.clear !== false : false });
      }
      return { items: items };
    }
    if (/^You read one meeting transcript/.test(prompt)) {
      var subj = (/\nMeeting: "([^"]*)"/.exec(prompt) || [])[1] || "";
      var plan = cfg.commitPlan || {}, key = Object.keys(plan).filter(function (k) { return subj.indexOf(k) >= 0; })[0];
      return { commitments: key ? JSON.parse(JSON.stringify(plan[key])) : [] };
    }
    if (/^You draft a short meeting invite/.test(prompt)) return cfg.inviteAnswer || { title: "DoD follow-up", agenda: "Agree the final DoD.\n\n- Walk through the draft\n- Decide what goes to PST" };
    if (/^You draft one new email/.test(prompt)) return cfg.newMailAnswer || { subject: "The DoD draft", draft: "Hi Anna,\n\nHere is the DoD draft we discussed. Can you review it by Tuesday?\n\nKR\nSam" };
    if (/^You draft one Teams chat chase for/.test(prompt)) return cfg.chaseAnswer || { draft: "Any news on this? I need it to plan the next step." };
    return null;
  }
  /* Page tools (sample options.tools): a scripted Claude runs rounds of tool
     calls (all calls of one round start together), then answers. cfg.ask is
     a queue of {rounds: [[{name, input}]], text}; without it, a cfg.chat
     answer {reply, draft} becomes update_draft(draft) + reply. */
  var askQueue = (cfg.ask || []).slice();
  window.__tools = [];
  window.__stub.setAsk = function (q) { askQueue = q.slice(); };
  function toolLoop(prompt, options) {
    var a = askQueue.length > 1 ? askQueue.shift() : askQueue[0];
    if (!a) {
      var c = chatQueue.length > 1 ? chatQueue.shift() : chatQueue[0] || { reply: "OK.", draft: null };
      a = { rounds: c.draft && options.tools.some(function (t) { return t.name === "update_draft"; }) ? [[{ name: "update_draft", input: { newText: c.draft } }]] : [], text: c.reply };
    }
    if (typeof a === "function") a = a(prompt);
    var byName = {}, sig = options.signal, i = 0, rounds = a.rounds || [];
    options.tools.forEach(function (t) { byName[t.name] = t; });
    function next() {
      if (sig && sig.aborted) throw { code: "cancelled", message: "cancelled" };
      if (i >= rounds.length) return { text: a.text || "OK.", truncated: false, modelTierApplied: "default" };
      var round = rounds[i++];
      var ps = round.map(function (call) {
        var rec = { name: call.name, input: JSON.parse(JSON.stringify(call.input || {})), round: i };
        window.__tools.push(rec);
        var t = byName[call.name];
        if (!t) { rec.error = "unknown tool"; return Promise.resolve(); }
        var p;
        try { p = Promise.resolve(t.execute(JSON.parse(JSON.stringify(call.input || {})), { signal: sig || new AbortController().signal })); }
        catch (e) { p = Promise.reject(e); }
        return p.then(function (v) { rec.result = JSON.parse(JSON.stringify(v === undefined ? null : v)); }, function (e) { rec.error = "Error: " + (e && e.message || e); });
      });
      return Promise.all(ps).then(function () { return later(null); }).then(next);
    }
    return Promise.resolve().then(next);
  }
  var sample = function (input, options) { return answer(input, options, false); };
  sample.json = function (input, options) { return answer(input, options, true); };
  sample.limits = function () { return Promise.resolve(cfg.noTools ? { maxPromptBytes: 262144 } : { maxPromptBytes: 262144, tools: { maxCount: 32 } }); };

  /* ---------- db ---------- */
  var KEY = "__droplet_stub_db";
  var data;
  try { data = JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch (e) { data = null; }
  if (!data) data = JSON.parse(JSON.stringify(cfg.dbSeed || {}));
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ } }
  window.__db = function () { return JSON.parse(JSON.stringify(data)); };
  function snap(id, v) {
    return deepFreeze({ id: id, exists: v !== undefined, data: function () { return v === undefined ? undefined : deepFreeze(JSON.parse(JSON.stringify(v))); }, metadata: { fromCache: false, hasPendingWrites: false } });
  }
  function docRef(path) {
    var id = path.split("/").pop();
    return {
      id: id, path: path,
      get: function () { return Promise.resolve(snap(id, data[path])); },
      set: function (v) { calls.push({ kind: "db", op: "set", path: path, data: JSON.parse(JSON.stringify(v)) }); if (cfg.dbFault) return Promise.reject({ code: cfg.dbFault }); data[path] = JSON.parse(JSON.stringify(v)); save(); return Promise.resolve(); },
      update: function (v) { if (data[path] === undefined) return Promise.reject({ code: "invalid_argument" }); Object.assign(data[path], v); save(); return Promise.resolve(); },
      delete: function () { calls.push({ kind: "db", op: "delete", path: path }); delete data[path]; save(); return Promise.resolve(); }
    };
  }
  function colRef(path) {
    return {
      path: path,
      doc: function (id) { return docRef(path + "/" + (id || ("auto" + Math.random().toString(36).slice(2)))); },
      get: function () {
        calls.push({ kind: "db", op: "list", path: path });
        if (hang.dbGet === true || (Array.isArray(hang.dbGet) && hang.dbGet.indexOf(path) >= 0)) return never();
        var self = this;
        if (hang.dbDelayMs) return new Promise(function (r) { setTimeout(r, hang.dbDelayMs); }).then(function () { return self.getNow(); });
        return this.getNow();
      },
      getNow: function () {
        var docs = Object.keys(data).filter(function (k) { return k.indexOf(path + "/") === 0 && k.split("/").length === path.split("/").length + 1; })
          .sort().map(function (k) { return snap(k.split("/").pop(), data[k]); });
        /* cfg.dbShape: how the snapshot comes back. "docs" (the contract, default), "array" (the docs array itself),
           "forEach" (an object with forEach only), "dataObject" (data a plain object), "paged" (one doc per page, next()),
           "unknown" (a form Droplet doesn't know). */
        var shape = cfg.dbShape;
        if (shape === "dataObject") docs = docs.map(function (d) { return { id: d.id, exists: true, data: d.data() }; });
        if (shape === "array") return Promise.resolve(docs);
        if (shape === "forEach") return Promise.resolve({ size: docs.length, forEach: function (f) { docs.forEach(f); } });
        if (shape === "unknown") return Promise.resolve({ items: docs.map(function (d) { return { key: d.id, value: d.data() }; }), count: docs.length });
        if (shape === "paged") {
          var pageAt = function (i) {
            return { docs: docs.slice(i, i + 1), size: Math.min(1, docs.length - i), empty: i >= docs.length, hasMore: i + 1 < docs.length,
              next: function () { calls.push({ kind: "db", op: "next", path: path }); return Promise.resolve(pageAt(i + 1)); } };
          };
          return Promise.resolve(pageAt(0));
        }
        return Promise.resolve({ docs: docs, size: docs.length, empty: !docs.length, docChanges: function () { return []; }, metadata: {} });
      },
      limit: function (n) {
        calls.push({ kind: "db", op: "limit", path: path, n: n });
        var self = this;
        return { get: function () { return self.get(); } };
      }
    };
  }
  var db = { doc: docRef, collection: colRef };

  /* ---------- permissions (built in): cfg.permissions is the state() map; absent → no capability ---------- */
  var permMap = cfg.permissions ? JSON.parse(JSON.stringify(cfg.permissions)) : null;
  var permissions = permMap && {
    state: function (name) {
      calls.push({ kind: "perm", op: "state", name: name || null });
      if (name) return Promise.resolve(permMap[name] || "unavailable");
      return Promise.resolve(JSON.parse(JSON.stringify(permMap)));
    },
    request: function (names) {
      calls.push({ kind: "perm", op: "request", names: names ? names.slice() : null });
      var after = cfg.permAfterRequest || {};
      (names || Object.keys(permMap)).forEach(function (n) { if (permMap[n] === "prompt") permMap[n] = after[n] || "granted"; });
      Object.keys(permMap).forEach(function (k) { if (k.indexOf("mcp:") === 0 && permMap[k] === "prompt" && (!names || names.indexOf("mcp") >= 0)) permMap[k] = after[k] || "granted"; });
      return Promise.resolve(JSON.parse(JSON.stringify(permMap)));
    }
  };

  var caps = { mcp: cfg.noMcp ? null : mcp, sample: cfg.noSample ? null : sample, db: cfg.noDb ? null : db, permissions: permissions || null };
  window.claude = Object.freeze({
    use: function (name) {
      if (Array.isArray(hang.use) && hang.use.indexOf(name) >= 0) return never();
      return new Promise(function (res) { setTimeout(function () { res(caps[name] || null); }, 0); });
    }
  });
}
module.exports = { installDropletStub: installDropletStub };
