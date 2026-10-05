/* Droplet · small pure helpers (no runtime access). */
(function (D) {
  "use strict";
  var U = D.util = {};

  U.ORG_DOMAIN = "planonsoftware.com";
  U.OUTLOOK_HOSTS = ["outlook.office365.com", "outlook.office.com"];
  U.TEAMS_HOSTS = ["teams.microsoft.com"];

  U.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  U.pad = function (n) { return ("0" + n).slice(-2); };

  /* Every JSON value in a text, also when several objects are concatenated
     ({..}{..}) or surrounded by prose. Strings are respected while scanning. */
  U.parseJsonValues = function (text) {
    var out = [], s = String(text == null ? "" : text), i = 0, n = s.length;
    while (i < n) {
      var c = s.charAt(i);
      if (c !== "{" && c !== "[") { i++; continue; }
      var depth = 0, inStr = false, bs = false, j = i;
      for (; j < n; j++) {
        var ch = s.charAt(j);
        if (inStr) {
          if (bs) bs = false; else if (ch === "\\") bs = true; else if (ch === '"') inStr = false;
          continue;
        }
        if (ch === '"') inStr = true;
        else if (ch === "{" || ch === "[") depth++;
        else if (ch === "}" || ch === "]") { depth--; if (depth === 0) break; }
      }
      if (j >= n) break;
      try { out.push(JSON.parse(s.slice(i, j + 1))); i = j + 1; } catch (e) { i++; }
    }
    return out;
  };

  /* The MCP result envelope (artifact mcp.d.ts, CallToolResult):
     {content: ContentBlock[], structuredContent?, payload?} where payload is
     structuredContent when present, else the first text block parsed as JSON,
     else that text verbatim. Connectors answer in JSON or in plain text
     ("Draft created with 1 recipient(s).\nid: …\nwebLink: …"). These helpers
     accept every form: text blocks (one or several), an empty content list
     with a string payload, structuredContent/payload objects, an object that
     only holds the text ({text}, {content}, {result}, {message}), and a bare
     string. */
  var HOLDER_KEYS = ["text", "content", "result", "message", "output"];
  function blockTexts(blocks) {
    var out = [];
    (Array.isArray(blocks) ? blocks : []).forEach(function (b) {
      if (typeof b === "string") out.push(b);
      else if (b && typeof b === "object") {
        if (typeof b.text === "string" && (!b.type || b.type === "text")) out.push(b.text);
        else if (b.type === "resource" && b.resource && typeof b.resource.text === "string") out.push(b.resource.text);
      }
    });
    return out;
  }
  /* Text held by an object such as {text: "..."} or {content: [{type:"text", text}]}. */
  function holderTexts(o) {
    if (!o || typeof o !== "object" || Array.isArray(o)) return [];
    for (var i = 0; i < HOLDER_KEYS.length; i++) {
      var v = o[HOLDER_KEYS[i]];
      if (typeof v === "string" && v) return [v];
      if (Array.isArray(v)) { var t = blockTexts(v); if (t.length) return t; }
    }
    return [];
  }
  function isEnvelope(res) {
    return !!res && typeof res === "object" && ("content" in res || "payload" in res || "structuredContent" in res);
  }
  U.resultObjects = function (res) {
    var out = [];
    function add(v) {
      if (Array.isArray(v)) v.forEach(add);
      else if (v && typeof v === "object") out.push(v);
    }
    function parse(t) { U.parseJsonValues(t).forEach(add); }
    if (res == null) return out;
    if (typeof res === "string") { parse(res); return out; }
    blockTexts(res.content).forEach(parse);
    [res.structuredContent, res.payload].forEach(function (v) {
      if (out.length || v == null) return;
      if (typeof v === "string") return parse(v);
      var held = holderTexts(v);
      if (held.length) { held.forEach(parse); if (!out.length) add(v); return; }
      add(v);
    });
    if (!out.length && !isEnvelope(res) && typeof res === "object") {
      var held2 = holderTexts(res);
      if (held2.length) held2.forEach(parse); else add(res);
    }
    return out;
  };
  U.resultText = function (res) {
    if (res == null) return "";
    if (typeof res === "string") return res;
    var t = blockTexts(res.content);
    if (t.length) return t.join("\n");
    var vals = [res.structuredContent, res.payload];
    for (var i = 0; i < vals.length; i++) {
      if (typeof vals[i] === "string" && vals[i]) return vals[i];
      var held = holderTexts(vals[i]);
      if (held.length) return held.join("\n");
    }
    if (!isEnvelope(res)) { var h = holderTexts(res); if (h.length) return h.join("\n"); }
    return "";
  };

  /* A SHAPE signature of a raw result for diagnostics: keys and types only,
     never values. At most depth 3 and 12 keys per level. Content blocks show
     their type and text length (text(5321)); arrays of other things show
     their length and the shape of the first one (3×{id:str}). Keys that look
     like data (an address, a link, an id) are shown as #. */
  var SAFE_KEY = /^[A-Za-z_$][A-Za-z0-9_$-]{0,39}$/;
  function keyName(k) { return SAFE_KEY.test(k) && !/@/.test(k) ? k : "#"; }
  U.shapeOf = function (v, depth) {
    depth = depth == null ? 3 : depth;
    try {
      if (v === null) return "null";
      var t = typeof v;
      if (t === "string") return "str";
      if (t === "number") return "num";
      if (t === "boolean") return "bool";
      if (t === "undefined") return "undef";
      if (t === "function") return "fn";
      if (t !== "object") return t;
      if (Array.isArray(v)) {
        if (!v.length) return "[]";
        var blocks = v.every(function (b) { return b && typeof b === "object" && typeof b.type === "string"; });
        if (blocks) {
          var bs = v.slice(0, 12).map(function (b) {
            var ty = /^[a-z_-]{1,20}$/i.test(b.type) ? b.type : "?";
            var len = typeof b.text === "string" ? b.text.length : typeof b.data === "string" ? b.data.length :
              b.resource && typeof b.resource.text === "string" ? b.resource.text.length : null;
            return ty + (len != null ? "(" + len + ")" : "");
          });
          return "[" + bs.join(",") + (v.length > 12 ? ",…+" + (v.length - 12) : "") + "]";
        }
        return "[" + v.length + "×" + (depth > 1 ? U.shapeOf(v[0], depth - 1) : "…") + "]";
      }
      if (depth <= 0) return "{…}";
      var keys = [];
      for (var k in v) keys.push(k); /* own and inherited enumerable (frozen snapshots, getters) */
      if (!keys.length) return "{}";
      var parts = keys.slice(0, 12).map(function (k) {
        var x; try { x = v[k]; } catch (e) { return keyName(k) + ":err"; }
        return keyName(k) + ":" + (depth > 1 ? U.shapeOf(x, depth - 1) : (x && typeof x === "object" ? (Array.isArray(x) ? "[" + x.length + "]" : "{…}") : U.shapeOf(x, 0)));
      });
      return "{" + parts.join(",") + (keys.length > 12 ? ",…+" + (keys.length - 12) : "") + "}";
    } catch (e) { return "?"; }
  };

  /* HTML mail body to plain text. DOMParser builds an inert document: no
     scripts run and nothing loads. Hidden elements are left out. */
  U.htmlToText = function (html) {
    var doc;
    try { doc = new DOMParser().parseFromString(String(html || ""), "text/html"); } catch (e) { return ""; }
    var kill = doc.querySelectorAll("script,style,head,title,meta,link,noscript,template,iframe,object,embed,svg,[hidden]");
    Array.prototype.forEach.call(kill, function (el) { el.remove(); });
    Array.prototype.forEach.call(doc.querySelectorAll("[style]"), function (el) {
      if (/display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*[01]px/i.test(el.getAttribute("style") || "")) el.remove();
    });
    var out = [];
    var BLOCK = /^(p|div|li|tr|h[1-6]|table|ul|ol|blockquote|pre|hr|section|article|header|footer|address|dl|dt|dd)$/;
    (function walk(node) {
      for (var c = node.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) { out.push(c.nodeValue.replace(/\s+/g, " ")); continue; }
        if (c.nodeType !== 1) continue;
        var tag = c.tagName.toLowerCase();
        if (tag === "br") { out.push("\n"); continue; }
        var block = BLOCK.test(tag);
        if (block) out.push("\n");
        if (tag === "li") out.push("• ");
        if (tag === "td" || tag === "th") out.push(" ");
        walk(c);
        if (block) out.push("\n");
      }
    })(doc.body || doc);
    return out.join("")
      .replace(/[ \t ]+\n/g, "\n").replace(/\n[ \t ]+/g, "\n")
      .replace(/[ \t ]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  };
  U.bodyToText = function (body) {
    if (!body) return "";
    if (typeof body === "string") return body;
    var type = String(body.contentType || "").toLowerCase();
    return type === "html" ? U.htmlToText(body.content) : String(body.content || "").replace(/\r\n/g, "\n").trim();
  };

  /* The user's text as reply HTML: only <p> and <br>, everything escaped. */
  U.textToHtml = function (text) {
    return String(text || "").replace(/\r\n/g, "\n").trim().split(/\n{2,}/).map(function (para) {
      return "<p>" + para.split("\n").map(U.esc).join("<br>") + "</p>";
    }).join("");
  };

  /* Letters and digits only, lower case, accents folded: for comparing text
     regardless of HTML, line breaks and punctuation. */
  U.alnum = function (s) {
    return String(s || "").normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  };

  U.domainOf = function (addr) {
    var m = /@([^@\s>]+)$/.exec(String(addr || "").trim().toLowerCase());
    return m ? m[1] : "";
  };
  U.isInternal = function (addr, extra) {
    var d = U.domainOf(addr);
    if (!d) return false;
    var list = [U.ORG_DOMAIN].concat(extra || []).filter(Boolean);
    return list.some(function (x) { x = x.toLowerCase(); return d === x || d.slice(-(x.length + 1)) === "." + x; });
  };
  U.nameFromAddress = function (addr) {
    var local = String(addr || "").split("@")[0] || "";
    var parts = local.split(/[._\-+]+/).filter(function (p) { return p && !/^\d+$/.test(p); });
    if (!parts.length) return local || "Unknown";
    return parts.map(function (p) { return p.charAt(0).toUpperCase() + p.slice(1); }).join(" ");
  };
  U.firstName = function (name) { return String(name || "").trim().split(/\s+/)[0] || ""; };

  /* Only https links to Outlook on the web are ever rendered as links. */
  U.safeOutlookLink = function (url) {
    try {
      var u = new URL(String(url || ""));
      if (u.protocol !== "https:" || u.username || u.password) return null;
      return U.OUTLOOK_HOSTS.indexOf(u.hostname.toLowerCase()) >= 0 ? u.href : null;
    } catch (e) { return null; }
  };

  /* Only https links to Teams on the web are ever opened. */
  U.safeTeamsLink = function (url) {
    try {
      var u = new URL(String(url || ""));
      if (u.protocol !== "https:" || u.username || u.password) return null;
      return U.TEAMS_HOSTS.indexOf(u.hostname.toLowerCase()) >= 0 ? u.href : null;
    } catch (e) { return null; }
  };

  U.hasAddressOrUrl = function (s) {
    s = String(s || "");
    return /[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(s) || /\b(?:https?:\/\/|www\.)/i.test(s) ||
      /\b[a-z0-9-]+\.(?:com|net|org|nl|io|de|eu|co|info|biz|ru|xyz|app|dev)\b/i.test(s);
  };
  /* For a diagnostic line: no addresses, no links, one line, short. */
  U.redact = function (s) {
    return U.clip(String(s == null ? "" : s)
      .replace(/[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+/g, "[address]")
      .replace(/\b(?:https?:\/\/|www\.)[^\s"'<>]+/gi, "[link]"), 160);
  };
  U.clip = function (s, n) {
    s = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
    return s.length > n ? s.slice(0, n - 1).trim() + "…" : s;
  };

  /* Clock helpers (local time of the viewer). */
  var fTime = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  var fDay = new Intl.DateTimeFormat("en-GB", { weekday: "short" });
  var fFull = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  U.hhmm = function (d) { return fTime.format(d || new Date()); };
  U.dateLine = function (d) { d = d || new Date(); return fFull.format(d).replace(/,/g, "") + " · " + U.hhmm(d); };
  U.sameDay = function (a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); };
  U.when = function (iso, now) {
    var d = new Date(iso);
    if (isNaN(d)) return "";
    return U.sameDay(d, now || new Date()) ? U.hhmm(d) : fDay.format(d);
  };
  U.whenLong = function (iso) {
    var d = new Date(iso);
    return isNaN(d) ? "" : fDay.format(d) + " " + U.hhmm(d);
  };

  /* A db-safe document id for a message id (path segments allow letters,
     digits and _ - . ~ : @ + only, at most 200 bytes). */
  U.keyOf = function (id) {
    var s = String(id || "").replace(/[^A-Za-z0-9_\-.~:@+]/g, function (c) { return "~" + c.charCodeAt(0).toString(16); });
    if (s.length <= 180 && s !== "." && s !== "..") return s;
    var h1 = 0x811c9dc5, h2 = 0;
    for (var i = 0; i < id.length; i++) { h1 ^= id.charCodeAt(i); h1 = Math.imul(h1, 16777619) >>> 0; h2 = (h2 * 31 + id.charCodeAt(i)) >>> 0; }
    return "h" + h1.toString(36) + h2.toString(36) + "-" + s.slice(-120);
  };

  U.normSubject = function (s) {
    var t = String(s || "").trim(), prev;
    do { prev = t; t = t.replace(/^\s*(re|fw|fwd|aw|wg|antw|tr|sv)\s*(\[\d+\])?\s*:\s*/i, ""); } while (t !== prev);
    return t.toLowerCase().replace(/\s+/g, " ").trim();
  };
})(window.Droplet = window.Droplet || {});
