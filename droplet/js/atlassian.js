/* Droplet · Jira and Confluence through the Atlassian Rovo connector
   (backlog 11 and 12). Read tools only, except two writes that run on a
   click: addCommentToJiraIssue (Comment on KEY) and updateConfluencePage
   (Update page). Jira mentions reach the user as notification mails, so
   those mails become Jira items keyed by issue key; a JQL search adds
   issues whose comments name the user. */
(function (D) {
  "use strict";
  var U = D.util, rt = D.rt;
  var atl = D.atl = {};
  atl.SERVER = "Atlassian Rovo";
  atl.CLOUD_ID = "f5ee9bed-0e04-48ea-aa28-5c3ecd088de8";
  atl.SITE = "planon.atlassian.net";
  atl.HOSTS = [atl.SITE];
  atl.me = null; /* {accountId, name, email} from atlassianUserInfo */
  var JQL_FIELDS = ["summary", "status", "project", "updated"];
  var ISSUE_FIELDS = ["summary", "status", "project", "comment", "description", "assignee", "reporter", "updated"];

  atl.call = function (tool, input, options) { return rt.callOn(atl.SERVER, tool, input, options); };

  /* Only https links on the Planon Atlassian site are ever rendered or opened. */
  atl.safeLink = function (url) {
    try {
      var u = new URL(String(url || ""));
      if (u.protocol !== "https:" || u.username || u.password) return null;
      return atl.HOSTS.indexOf(u.hostname.toLowerCase()) >= 0 ? u.href : null;
    } catch (e) { return null; }
  };
  atl.issueUrl = function (key) { return "https://" + atl.SITE + "/browse/" + encodeURIComponent(key); };
  function pageUrl(o) {
    var abs = typeof o.webUrl === "string" ? o.webUrl : "";
    if (abs && atl.safeLink(abs)) return atl.safeLink(abs);
    var rel = o._links && typeof o._links.webui === "string" ? o._links.webui : "";
    if (rel && rel.charAt(0) === "/" && rel.charAt(1) !== "/") return atl.safeLink("https://" + atl.SITE + "/wiki" + rel);
    return null;
  }

  /* ---------- Jira notification mails ---------- */
  var KEY_RE = /\b([A-Z][A-Z0-9]{1,9}-\d{1,7})\b/;
  atl.issueKeyOf = function (s) { var m = KEY_RE.exec(String(s || "")); return m ? m[1] : ""; };
  atl.isJiraSender = function (addr) {
    var a = String(addr || "").toLowerCase(), local = a.split("@")[0], dom = U.domainOf(a);
    return /^jira([._+-].*)?$/.test(local) && (/(^|\.)atlassian\.net$/.test(dom) || /(^|\.)atlassian\.com$/.test(dom)) ||
      dom === atl.SITE;
  };
  /* What a Jira mail is about: "standstill" (R1), "mention" (the user is
     mentioned or addressed), or "" (an update robot: stays noise). */
  atl.jiraKind = function (m, first) {
    var text = (m.subject || "") + " " + (m.summary || "");
    if (/standstill/i.test(text)) return "standstill";
    if (/\bmentioned you\b|\bheeft je genoemd\b|\bnoemde je\b|\bvermeld\b/i.test(text)) return "mention";
    if (first && first.length > 1 && new RegExp("@" + first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\p{L}\\p{N}])", "iu").test(text)) return "mention";
    return "";
  };
  /* A Jira notification mail that should be an item: from Jira, with an issue key, and a standstill or a mention. */
  atl.isJiraItemMail = function (m, first) {
    return atl.isJiraSender(m.sender) && !!atl.issueKeyOf(m.subject) && !!atl.jiraKind(m, first);
  };
  /* "[JIRA] (OIDC-412) Sam mentioned you on Login loop" → "Login loop". */
  function cleanTitle(subject, key) {
    var s = String(subject || "").replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, "")
      .replace(/\[(jira|standstill)\]\s*/ig, "").replace(new RegExp("\\(?\\b" + key + "\\b\\)?\\s*[:\\-–]?\\s*"), "")
      .replace(/^.{0,60}?\bmentioned you (on|in)\s+/i, "").trim();
    return s || "Jira issue";
  }
  function actorOf(m) {
    var a = /^\s*(?:\[[^\]]+\]\s*)*(?:\([A-Z0-9-]+\)\s*)?([\p{L}][\p{L}'.-]*(?:\s+[\p{L}][\p{L}'.-]*){0,3}) mentioned you\b/iu.exec((m.subject || "") + "\n" + (m.summary || ""));
    return a ? a[1].trim() : "";
  }
  /* Jira items from notification mails: one per issue key, the newest mail leads. */
  atl.fromMails = function (mails, first) {
    var byKey = {}, out = [];
    mails.slice().sort(function (a, b) { return String(b.received).localeCompare(String(a.received)); }).forEach(function (m) {
      var key = atl.issueKeyOf(m.subject), kind = atl.jiraKind(m, first);
      var it = byKey[key];
      if (!it) {
        it = byKey[key] = atl.item(key, cleanTitle(m.subject, key), { via: "mail", received: m.received, summary: m.summary, sender: m.sender,
          senderName: actorOf(m) || "Jira", mailIds: [], mailLink: m.webLink });
        out.push(it);
      }
      it.mailIds.push(m.id);
      if (kind === "standstill" && /\boidc\b/i.test((m.subject || "") + " " + (m.summary || ""))) it.standstill = true;
      if (kind === "standstill") it.standstillAny = true;
      if (kind === "mention") it.mention = true;
    });
    return out;
  };
  atl.item = function (key, title, o) {
    o = o || {};
    var id = "jira:" + key;
    return {
      src: "jira", id: id, key: U.keyOf(id), issueKey: key, title: title, subject: key + " " + title,
      summary: String(o.summary || ""), sender: String(o.sender || ""), senderName: String(o.senderName || "Jira"),
      received: String(o.received || ""), via: o.via, mailIds: o.mailIds || [], mailLink: o.mailLink || "",
      status: o.status || "", projectName: o.projectName || "", standstill: false, mention: !!o.mention,
      internal: true, importance: "normal", webLink: atl.issueUrl(key), merged: [], project0: projectOfKey(key, o.projectName)
    };
  };
  /* R2 by project key or name, when it names a project of the list. */
  function projectOfKey(key, name) {
    var pk = String(key || "").split("-")[0];
    return D.rank.projectOf(pk) || D.rank.projectOf(name) || null;
  }
  /* R2 for a Confluence page: "OIDC | Project Overview" belongs to OIDC. */
  atl.projectFromTitle = function (title) {
    var head = String(title || "").split(/\s*[|·:–-]\s+/)[0];
    return D.rank.projectOf(head) || D.rank.projectOf(title) || null;
  };

  /* ---------- Atlassian loading ---------- */
  /* One call at a time: get_me's fallback waits on the same answer. */
  var infoP = null;
  atl.pending = function () { return infoP; };
  atl.userInfo = function () {
    if (atl.me) return Promise.resolve(atl.me);
    if (infoP) return infoP;
    var p = infoP = atl.call("atlassianUserInfo", {}).then(function (res) {
      var o = U.resultObjects(res).filter(function (x) { return x.account_id || x.accountId; })[0];
      if (!o) throw { code: "tool_error", message: "No Atlassian account" };
      atl.me = { accountId: String(o.account_id || o.accountId), name: String(o.name || o.displayName || ""), email: String(o.email || "").toLowerCase() };
      return atl.me;
    });
    p.then(function () { if (infoP === p) infoP = null; }, function () { if (infoP === p) infoP = null; });
    return p;
  };
  function nodesOf(o, path) {
    var v = o && o[path];
    if (Array.isArray(v)) return v;
    if (v && Array.isArray(v.nodes)) return v.nodes;
    if (v && Array.isArray(v.results)) return v.results;
    return [];
  }
  function firstObj(res) { return U.resultObjects(res)[0] || null; }
  /* JQL: issues where a comment names the user, last 14 days. Empty is normal. */
  atl.searchJira = function (jql, max) {
    return atl.call("searchJiraIssuesUsingJql", { cloudId: atl.CLOUD_ID, jql: jql, maxResults: Math.max(50, Math.min(100, max || 50)), fields: JQL_FIELDS.slice(), responseContentFormat: "markdown" })
      .then(function (res) {
        var o = firstObj(res) || {}, list = nodesOf(o, "issues");
        if (!list.length && Array.isArray(o.nodes)) list = o.nodes;
        return list.filter(function (n) { return n && n.key; }).map(function (n) {
          var f = n.fields || {};
          return { key: String(n.key), summary: String(f.summary || ""), status: String(f.status && f.status.name || ""),
            statusCat: String(f.status && f.status.statusCategory && f.status.statusCategory.key || ""),
            project: String(f.project && (f.project.name || f.project.key) || ""), updated: String(f.updated || ""),
            webUrl: atl.safeLink(n.webUrl) || atl.issueUrl(String(n.key)) };
        });
      });
  };
  function mentionJql(accountId) { return 'comment ~ "' + String(accountId).replace(/["\\]/g, "") + '" AND updated >= -14d'; }
  atl.MENTION_CQL = 'mention = currentUser() AND lastmodified >= now("-7d")';
  atl.WATCH_CQL = 'watcher = currentUser() AND lastmodified >= now("-2d") AND type = page';
  atl.searchConfluence = function (cql, limit) {
    return atl.call("searchConfluenceUsingCql", { cloudId: atl.CLOUD_ID, cql: cql, limit: limit || 25 }).then(function (res) {
      var o = firstObj(res) || {}, list = nodesOf(o, "content");
      if (!list.length) list = nodesOf(o, "results");
      if (!list.length && Array.isArray(o.nodes)) list = o.nodes;
      return list.filter(function (n) { return n && n.id; }).map(function (n) {
        var sp = n.space || {};
        return { id: String(n.id), type: String(n.type || "page"), title: String(n.title || ""), lastModified: String(n.lastModified || n.lastmodified || ""),
          excerpt: U.clip(String(n.summary || n.excerpt || "").replace(/@@@(end)?hl@@@/g, ""), 400), spaceKey: String(sp.key || ""), spaceName: String(sp.name || ""),
          author: String(n.author && n.author.displayName || ""), webUrl: pageUrl(n) };
      });
    });
  };
  /* Everything Atlassian adds to the list. Resolves {jql:[issue items], pages:[page items]}. */
  atl.load = function () {
    return atl.userInfo().then(function (me) {
      var soft = function (p) { return p.then(function (v) { return { ok: true, v: v }; }, function (e) { return { ok: false, e: e }; }); };
      return Promise.all([soft(atl.searchJira(mentionJql(me.accountId))), soft(atl.searchConfluence(atl.MENTION_CQL)), soft(atl.searchConfluence(atl.WATCH_CQL))]);
    }).then(function (r) {
      if (!r[0].ok && !r[1].ok && !r[2].ok) throw r[0].e;
      var jql = (r[0].ok ? r[0].v : []).filter(function (x) { return x.statusCat !== "done"; }).map(function (x) {
        return atl.item(x.key, x.summary || x.key, { via: "jql", received: x.updated, status: x.status, projectName: x.project, mention: true,
          summary: "A comment on " + x.key + " mentions you." + (x.status ? " Status: " + x.status + "." : "") });
      });
      var pages = {}, out = [];
      [[r[1], "mention"], [r[2], "watch"]].forEach(function (p) {
        if (!p[0].ok) return;
        p[0].v.forEach(function (x) {
          if (x.type !== "page" && x.type !== "blogpost") return;
          if (pages[x.id]) return; /* a mention wins over a watched change */
          var it = pages[x.id] = pageItem(x, p[1]);
          out.push(it);
        });
      });
      return { jql: jql, pages: out };
    });
  };
  function pageItem(x, why) {
    var id = "conf:" + x.id;
    return {
      src: "confluence", id: id, key: U.keyOf(id), pageId: x.id, subject: x.title || "Untitled page", title: x.title,
      summary: x.excerpt, sender: "", senderName: x.author || "Confluence", received: x.lastModified, why0: why,
      spaceKey: x.spaceKey, spaceName: x.spaceName, webUrl: x.webUrl, internal: true, importance: "normal", merged: [],
      project0: atl.projectFromTitle(x.title)
    };
  }

  /* ---------- One issue ---------- */
  /* Atlassian Document Format (or markdown) to plain text. */
  atl.adfText = function (v) {
    if (v == null) return "";
    if (typeof v === "string") return v.replace(/\r\n?/g, "\n").trim();
    var out = [];
    (function walk(n) {
      if (!n || typeof n !== "object") return;
      if (Array.isArray(n)) { n.forEach(walk); return; }
      if (n.type === "text" && typeof n.text === "string") out.push(n.text);
      else if (n.type === "mention" && n.attrs) out.push(String(n.attrs.text || "@someone"));
      else if (n.type === "hardBreak") out.push("\n");
      if (n.content) walk(n.content);
      if (/^(paragraph|heading|listItem|codeBlock|blockquote)$/.test(n.type || "")) out.push("\n");
    })(v);
    return out.join("").replace(/\n{3,}/g, "\n\n").trim();
  };
  atl.readIssue = function (key, opts) {
    return atl.call("getJiraIssue", { cloudId: atl.CLOUD_ID, issueIdOrKey: key, fields: ISSUE_FIELDS.slice(), responseContentFormat: "markdown" }, opts).then(function (res) {
      var objs = U.resultObjects(res), o = objs.filter(function (x) { return x.fields || x.issue; })[0];
      if (o && o.issue && !o.fields) o = o.issue;
      if (!o || !o.fields) throw { code: "tool_error", message: "No issue in Jira’s answer" };
      var f = o.fields, cs = f.comment && (f.comment.comments || f.comment.nodes) || [];
      var person = function (p) { return { accountId: String(p && (p.accountId || p.account_id) || ""), name: String(p && p.displayName || "") }; };
      return {
        key: String(o.key || key), summary: String(f.summary || ""), status: String(f.status && f.status.name || ""),
        project: String(f.project && (f.project.name || f.project.key) || ""), updated: String(f.updated || ""),
        description: atl.adfText(f.description), assignee: person(f.assignee).name, reporter: person(f.reporter).name,
        comments: cs.map(function (c) { var a = person(c.author); return { id: String(c.id || ""), accountId: a.accountId, author: a.name, created: String(c.created || ""), text: atl.adfText(c.body) }; }),
        webUrl: atl.safeLink(o.webUrl) || atl.issueUrl(String(o.key || key))
      };
    });
  };
  /* R4: the user commented after the item came in. */
  atl.userCommentedSince = function (issue, since) {
    var me = atl.me && atl.me.accountId, t0 = Date.parse(since || "") || 0;
    return !!me && (issue.comments || []).some(function (c) { return c.accountId === me && (Date.parse(c.created) || 0) >= t0; });
  };

  /* Comment on KEY: add once, then read back if it is cheap. Resolves a
     write result {phase: "sent"|"failed"|"unclear", message, verified}. */
  atl.postComment = function (key, text) {
    return atl.call("addCommentToJiraIssue", { cloudId: atl.CLOUD_ID, issueIdOrKey: key, commentBody: text, contentFormat: "markdown" }).then(function () {
      var want = U.alnum(text).slice(0, 40);
      return atl.readIssue(key).then(function (iss) {
        var ok = (iss.comments || []).some(function (c) { return U.alnum(c.text).indexOf(want) >= 0; });
        return { phase: "sent", sentAt: new Date(), verified: ok, issue: iss };
      }, function () { return { phase: "sent", sentAt: new Date(), verified: false }; });
    }, function (e) {
      var detail = U.clip(e && e.message || "", 140);
      var base = { step: "add comment", code: String(e && e.code || "unknown").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 40), detail: detail };
      return Object.assign(base, rt.isClear(e)
        ? { phase: "failed", message: "Jira didn’t take the comment" + (detail ? ": " + detail : "") + ". Nothing was posted; your text is kept." }
        : { phase: "unclear", message: "Jira didn’t confirm the comment. Check the issue before posting again." });
    });
  };

  /* ---------- One page ---------- */
  function bodyOf(o) {
    var b = o.body;
    if (typeof b === "string") return b;
    if (b && typeof b === "object") {
      if (typeof b.markdown === "string") return b.markdown;
      if (typeof b.value === "string") return b.value;
      if (b.storage && typeof b.storage.value === "string") return b.storage.value;
      if (b.atlas_doc_format && typeof b.atlas_doc_format.value === "string") return b.atlas_doc_format.value;
    }
    if (typeof o.content === "string") return o.content;
    if (typeof o.markdown === "string") return o.markdown;
    return null;
  }
  /* One page. format "html" (the default here) is round-trip safe: macros,
     panels, status, layouts and mentions stay as data-type nodes. Markdown
     drops macros, so Droplet only reads, edits and writes pages as HTML.
     The real answer wraps the page: {content:{totalCount, nodes:[{…, body:"…"}]}}. */
  function pageObj(objs) {
    for (var i = 0; i < objs.length; i++) {
      var o = objs[i], wrapped = null;
      [o.content, o].forEach(function (c) {
        if (wrapped || !c || typeof c !== "object") return;
        var list = Array.isArray(c.nodes) ? c.nodes : Array.isArray(c.results) ? c.results : null;
        if (list && list.length) wrapped = list[0];
      });
      if (wrapped) return wrapped;
      if (o.page && typeof o.page === "object") return o.page;
      if (o.title !== undefined || o.body !== undefined) return o;
    }
    return null;
  }
  atl.readPage = function (pageId, opts, format) {
    format = format || "html";
    return atl.call("getConfluencePage", { cloudId: atl.CLOUD_ID, pageId: String(pageId), contentFormat: format }, opts).then(function (res) {
      var o = pageObj(U.resultObjects(res));
      var body = o ? bodyOf(o) : null;
      if (!o || body == null) throw { code: "tool_error", message: "No page body in Confluence’s answer" };
      var sp = o.space || {};
      return { id: String(o.id || pageId), title: String(o.title || ""), body: String(body).replace(/\r\n?/g, "\n"), format: format,
        version: o.version && (o.version.number || o.version) || null, spaceKey: String(sp.key || o.spaceKey || ""), spaceName: String(sp.name || ""),
        webUrl: pageUrl(o) };
    });
  };
  atl.sameBody = function (a, b) {
    var n = function (s) { return String(s || "").replace(/\r\n?/g, "\n").replace(/>\s+</g, "><").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim(); };
    return n(a) === n(b);
  };
  /* The page's HTML as plain text, for the diff only (DOMParser: inert). */
  atl.pageText = function (html) { return U.htmlToText(html).replace(/•[ \t]*\n+[ \t]*/g, "• ").replace(/\n{2,}/g, "\n"); };

  /* Safety check before Update page: every page element Confluence keeps
     as data (macros, extensions, panels, status, mentions, layouts, any
     element with a local id, any custom or ac: tag) must still be there.
     Macro and extension nodes, custom and ac: tags must be byte-for-byte
     the same (outerHTML); other data-type elements must keep exactly their
     attributes (their text may change). Returns {ok, lost:[short names]}. */
  var STRICT_ATTR = /^(data-macro|data-extension|ac:|ri:)/i, KEEP_ATTR = /^(data-type|data-local-id|local-id|data-macro|data-extension|ac:|ri:)/i;
  function protectedOf(html) {
    var doc;
    try { doc = new DOMParser().parseFromString("<body>" + String(html || "") + "</body>", "text/html"); } catch (e) { return null; }
    var out = [];
    Array.prototype.forEach.call(doc.body.querySelectorAll("*"), function (el) {
      var tag = el.tagName.toLowerCase(), names = Array.prototype.map.call(el.attributes, function (a) { return a.name; });
      var custom = tag.indexOf(":") >= 0 || tag.indexOf("-") >= 0;
      if (!custom && !names.some(function (n) { return KEEP_ATTR.test(n); })) return;
      var dt = String(el.getAttribute("data-type") || "").toLowerCase();
      var strict = custom || names.some(function (n) { return STRICT_ATTR.test(n); }) || /macro|extension/.test(dt);
      var sig = strict ? "=" + el.outerHTML.replace(/\s+/g, " ") :
        "@" + tag + "[" + Array.prototype.map.call(el.attributes, function (a) { return a.name + "=" + a.value; }).sort().join("|") + "]";
      var label = (el.getAttribute("data-extension-key") || el.getAttribute("data-macro-name") || el.getAttribute("ac:name") || dt || tag);
      out.push({ sig: sig, label: label });
    });
    return out;
  }
  atl.checkKeeps = function (oldHtml, newHtml) {
    var a = protectedOf(oldHtml), b = protectedOf(newHtml);
    if (!a || !b) return { ok: false, lost: ["page"] };
    var have = {};
    b.forEach(function (x) { have[x.sig] = (have[x.sig] || 0) + 1; });
    var lost = [];
    a.forEach(function (x) { if (have[x.sig]) have[x.sig]--; else lost.push(x.label); });
    return { ok: !lost.length, lost: lost.filter(function (l, i, all) { return all.indexOf(l) === i; }).slice(0, 5) };
  };

  /* Update page: re-read the HTML first and refuse when the page changed
     since the proposal; check again that nothing is lost; then one
     updateConfluencePage in HTML; then read back the title. */
  atl.applyUpdate = function (p) {
    if (!atl.checkKeeps(p.baseBody, p.newHtml).ok) return Promise.resolve({ phase: "blocked", message: atl.LOST_MESSAGE });
    return atl.readPage(p.pageId, { cache: false }, "html").then(function (cur) {
      if (atl.sameBody(cur.body, p.newHtml)) return { phase: "sent", sentAt: new Date(), already: true, title: cur.title };
      if (!atl.sameBody(cur.body, p.baseBody)) return { phase: "stale", message: "The page changed since Claude proposed this, so Droplet didn’t update it. Ask Claude to propose it again on the current page." };
      var input = { cloudId: atl.CLOUD_ID, pageId: String(p.pageId), body: p.newHtml, contentFormat: "html", title: cur.title || p.title, versionMessage: "Updated via Droplet" };
      return atl.call("updateConfluencePage", input).then(function () {
        return atl.readPage(p.pageId, { cache: false }, "html").then(function (after) {
          if (after.title && cur.title && after.title !== cur.title) return { phase: "sent", sentAt: new Date(), warn: "Updated, but the title now reads “" + U.clip(after.title, 80) + "”. Check the page." };
          return { phase: "sent", sentAt: new Date(), title: after.title };
        }, function () { return { phase: "sent", sentAt: new Date(), warn: "Updated. Droplet couldn’t read the page back; check it in Confluence." }; });
      }, function (e) {
        var detail = U.clip(e && e.message || "", 140);
        var base = { step: "update page", code: String(e && e.code || "unknown").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 40), detail: detail };
        return Object.assign(base, rt.isClear(e)
          ? { phase: "failed", message: "Confluence didn’t update the page" + (detail ? ": " + detail : "") + ". Nothing changed." }
          : { phase: "unclear", message: "Confluence didn’t confirm the update. Check the page before updating again." });
      });
    }, function (e) {
      return { phase: "failed", step: "re-read page", code: String(e && e.code || "unknown").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 40), detail: U.clip(e && e.message || "", 140),
        message: "Couldn’t re-read the page to check it, so nothing was updated. Try again." };
    });
  };
  atl.LOST_MESSAGE = "Claude’s version would remove page elements (e.g. a Jira macro), so it can’t be applied.";

  /* ---------- A readable line diff ---------- */
  /* Changed lines with a little context: [{t:"+"|"-"|" "|"…", s}]. */
  atl.lineDiff = function (a, b, context) {
    context = context == null ? 1 : context;
    var A = String(a || "").replace(/\r\n?/g, "\n").split("\n"), B = String(b || "").replace(/\r\n?/g, "\n").split("\n");
    var pre = 0;
    while (pre < A.length && pre < B.length && A[pre] === B[pre]) pre++;
    var suf = 0;
    while (suf < A.length - pre && suf < B.length - pre && A[A.length - 1 - suf] === B[B.length - 1 - suf]) suf++;
    var a1 = A.slice(pre, A.length - suf), b1 = B.slice(pre, B.length - suf), ops = [];
    if (a1.length * b1.length <= 4e6) {
      var n = a1.length, m = b1.length, L = [];
      for (var i = 0; i <= n; i++) L.push(new Uint16Array(m + 1));
      for (i = n - 1; i >= 0; i--) for (var j = m - 1; j >= 0; j--) L[i][j] = a1[i] === b1[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
      i = 0; j = 0;
      while (i < n && j < m) {
        if (a1[i] === b1[j]) { ops.push([" ", a1[i]]); i++; j++; }
        else if (L[i + 1][j] >= L[i][j + 1]) ops.push(["-", a1[i++]]);
        else ops.push(["+", b1[j++]]);
      }
      while (i < n) ops.push(["-", a1[i++]]);
      while (j < m) ops.push(["+", b1[j++]]);
    } else {
      a1.forEach(function (s) { ops.push(["-", s]); });
      b1.forEach(function (s) { ops.push(["+", s]); });
    }
    var all = A.slice(0, pre).map(function (s) { return [" ", s]; }).concat(ops, A.slice(A.length - suf).map(function (s) { return [" ", s]; }));
    var keep = all.map(function () { return false; });
    all.forEach(function (o, k) { if (o[0] !== " ") for (var x = Math.max(0, k - context); x <= Math.min(all.length - 1, k + context); x++) keep[x] = true; });
    var out = [], gap = false;
    all.forEach(function (o, k) {
      if (keep[k]) { out.push({ t: o[0], s: o[1] }); gap = false; }
      else if (!gap) { out.push({ t: "…", s: "" }); gap = true; }
    });
    return out;
  };
})(window.Droplet = window.Droplet || {});
