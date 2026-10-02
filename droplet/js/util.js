/* Droplet · small pure helpers (no runtime access). */
(function (D) {
  "use strict";
  var U = D.util = {};

  U.ORG_DOMAIN = "planonsoftware.com";
  U.OUTLOOK_HOSTS = ["outlook.office365.com", "outlook.office.com"];

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

  /* All JSON objects in an MCP CallToolResult: per text content block (each may
     hold several concatenated objects), arrays flattened; payload as fallback. */
  U.resultObjects = function (res) {
    var out = [];
    function add(v) {
      if (Array.isArray(v)) v.forEach(add);
      else if (v && typeof v === "object") out.push(v);
    }
    if (res && Array.isArray(res.content)) {
      res.content.forEach(function (b) {
        if (b && b.type === "text" && typeof b.text === "string") U.parseJsonValues(b.text).forEach(add);
      });
    }
    if (!out.length && res) {
      if (res.structuredContent && typeof res.structuredContent === "object") add(res.structuredContent);
      else if (res.payload && typeof res.payload === "object") add(res.payload);
      else if (typeof res.payload === "string") U.parseJsonValues(res.payload).forEach(add);
    }
    return out;
  };
  U.resultText = function (res) {
    if (!res || !Array.isArray(res.content)) return typeof (res && res.payload) === "string" ? res.payload : "";
    return res.content.filter(function (b) { return b && b.type === "text"; }).map(function (b) { return b.text; }).join("\n");
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
