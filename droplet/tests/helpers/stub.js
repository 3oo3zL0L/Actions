/* Runs in the page before any app script (page.addInitScript).
   Stubs window.claude.use("mcp" | "sample" | "db") with fixture mail,
   scripted Claude answers and an in-memory db (kept in sessionStorage so a
   reload sees the same store). Every call is recorded in window.__calls. */
function installDropletStub(cfg) {
  "use strict";
  var calls = window.__calls = [];
  var SERVER = "Microsoft 365";
  var faults = cfg.faults || {};
  function err(code, message, resultText) {
    var e = { code: code, message: message || code, retryable: code === "server_unavailable" || undefined };
    /* Like the runtime: a tool failure rejects with tool_error and the tool's own envelope on .result. */
    if (code === "tool_error" && resultText != null) e.result = result(resultText);
    return e;
  }
  function later(v) { return new Promise(function (res) { setTimeout(function () { res(v); }, cfg.latency || 0); }); }
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
  window.__stub = {
    addMail: function (m) { mailList.unshift(m); },
    setFault: function (tool, f) { if (f == null) delete faults[tool]; else faults[tool] = f; },
    setRank: function (r) { cfg.rank = r; },
    setRankPlan: function (p) { cfg.rankPlan = p; },
    drafts: drafts, sent: sent
  };
  function findMail(id) { return mailList.filter(function (m) { return m.id === id; })[0]; }
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
      var off = input.offset || 0, lim = input.limit || 10;
      var page = mailList.slice(off, off + lim).map(function (m, i) {
        var o = Object.assign({ uri: "mail:///messages/" + encodeURIComponent(m.id) }, m); o.offset = off + i; return o;
      });
      var parts = page.map(function (o) { return JSON.stringify(o); });
      if (off + lim < mailList.length) parts.push(JSON.stringify({ moreResults: true, nextOffset: off + lim, totalResultCount: mailList.length }));
      /* Like the real connector: concatenated objects, split over two content blocks. */
      var half = Math.ceil(parts.length / 2);
      var blocks = [parts.slice(0, half).join(""), parts.slice(half).join("")].filter(Boolean);
      return result(blocks.join(""), blocks.length ? blocks : ["[]"]);
    },
    read_resource: function (input) {
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
      var to = orig.sender.replace(/(^|[.@])([a-z])/g, function (x, p, c) { return p + c.toUpperCase(); }); /* mixed case, like Outlook */
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
    outlook_send_draft: function (input) {
      if (!drafts[input.messageId]) throw err("tool_error", "Draft not found");
      sent.push(input.messageId);
      return result("Draft sent to 1 recipient(s) and saved to Sent Items.");
    }
  };
  var mcp = {
    callTool: function (server, tool, input, options) {
      calls.push({ kind: "mcp", server: server, tool: tool, input: JSON.parse(JSON.stringify(input || {})), t: performance.now() });
      if (server !== SERVER || !tools[tool]) return Promise.reject(err("not_in_manifest"));
      var f = fault(tool);
      if (f) return later(null).then(function () { throw f; });
      try { var r = tools[tool](input || {}); return later(r); } catch (e) { return later(null).then(function () { throw e; }); }
    },
    listTools: function () { return Promise.resolve({ servers: [] }); }
  };

  /* ---------- sample ---------- */
  function idsIn(prompt) {
    var re = /<<<EMAIL \d+ id="([^"]+)">>>/g, m, out = [];
    while ((m = re.exec(prompt))) out.push(m[1]);
    return out;
  }
  function rankAnswer(prompt) {
    if (cfg.rank === "INVALID_JSON") throw { code: "invalid_json", message: "not json", text: "Sure! Here is" };
    if (cfg.rank && cfg.rank !== "AUTO") return JSON.parse(JSON.stringify(cfg.rank));
    var plan = cfg.rankPlan || {};
    var items = idsIn(prompt).map(function (id, i) {
      return Object.assign({ id: id, group: "later", rank: 50 + i, project: null, why: "Routine mail.", action: "open", label: "Open it" }, plan[id] || {});
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
    calls.push({ kind: "sample", json: asJson, input: JSON.parse(JSON.stringify(input)), options: options ? JSON.parse(JSON.stringify(options)) : null });
    var prompt = typeof input === "string" ? input : input.map(function (t) { return t.content; }).join("\n");
    return later(null).then(function () {
      if (cfg.sampleFault) throw { code: cfg.sampleFault, message: cfg.sampleFault };
      var a = /You rank unread email/.test(prompt) ? rankAnswer(prompt) : /You draft one email reply/.test(prompt) ? draftAnswer(prompt) :
        (chatQueue.length > 1 ? chatQueue.shift() : chatQueue[0] || { reply: "OK.", draft: null });
      return asJson ? a : { text: JSON.stringify(a), truncated: false, modelTierApplied: "default" };
    });
  }
  var sample = function (input, options) { return answer(input, options, false); };
  sample.json = function (input, options) { return answer(input, options, true); };
  sample.limits = function () { return Promise.resolve({ maxPromptBytes: 262144 }); };

  /* ---------- db ---------- */
  var KEY = "__droplet_stub_db";
  var data;
  try { data = JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch (e) { data = null; }
  if (!data) data = JSON.parse(JSON.stringify(cfg.dbSeed || {}));
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ } }
  window.__db = function () { return JSON.parse(JSON.stringify(data)); };
  function snap(id, v) {
    return { id: id, exists: v !== undefined, data: function () { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }, metadata: { fromCache: false, hasPendingWrites: false } };
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
        var docs = Object.keys(data).filter(function (k) { return k.indexOf(path + "/") === 0 && k.split("/").length === path.split("/").length + 1; })
          .sort().map(function (k) { return snap(k.split("/").pop(), data[k]); });
        return Promise.resolve({ docs: docs, size: docs.length, empty: !docs.length, docChanges: function () { return []; }, metadata: {} });
      }
    };
  }
  var db = { doc: docRef, collection: colRef };

  var caps = { mcp: cfg.noMcp ? null : mcp, sample: cfg.noSample ? null : sample, db: cfg.noDb ? null : db };
  window.claude = Object.freeze({
    use: function (name) { return new Promise(function (res) { setTimeout(function () { res(caps[name] || null); }, 0); }); }
  });
}
module.exports = { installDropletStub: installDropletStub };
