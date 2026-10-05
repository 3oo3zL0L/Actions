/* Droplet · the weekly Salesforce hours run (from the Hours Approver extension).

   The extension (hours-approver/) runs every Monday at 13:00 in Thomas's
   Chrome: it approves timecards, rejects overhead and checks the hours of
   the PREVIOUS ISO week. Its bridge hands the report to this page:

     Droplet → {source: "droplet", type: "hello"}
     bridge  → {source: "sf-approver", type: "reports", reports: [...]}
     Droplet → {source: "droplet", type: "ack", ids: [...]}    (stored in db hours/<id>)
     Droplet → {source: "droplet", type: "done", ids: [...]}   (its reminder run finished)

   Reminder mails are the ONE deliberate exception to "nothing sends without
   your click", asked for explicitly: a fixed template (no Claude text), only
   to people on the fixed ALLOW list who the report lists with fewer than 40
   hours, once per person per ISO week (hours-sent/<week>~<nameKey>, written
   BEFORE the send), only from a fresh report (run within 24 h, for last
   week), never from a fatal or truncated one. Addresses come only from the
   people search (or the sender of a mail), a single @planonsoftware.com
   match whose name matches; nothing in a report can add a recipient. */
(function (D) {
  "use strict";
  var U = D.util, rt = D.rt, store = D.store;
  var H = D.hours = {};

  /* ---------- Fixed lists ---------- */
  H.ALLOW = ["Bart Smits", "Chad Caliskan", "Christoph Orths", "Edward Zents", "Joep Top", "Kristiaan Jansen",
    "Louis Schrauwen", "Marc Ebbers", "Maurice Quaedackers", "Paul van Haaster", "Peter Kisters", "Remy Kaufmann",
    "Sander Hartogensis", "Sander Hoevers", "Tom Sandig", "Olaf Hoogakker", "Tom Gerritsen", "Reinier Goeman"];
  /* English mail; everyone else gets Dutch. Marcin Kaszubski is not on ALLOW, so he is never mailed. */
  H.ENGLISH = ["Tom Sandig", "Christoph Orths", "Marcin Kaszubski"];
  H.DOMAIN = "planonsoftware.com";
  H.REQUIRED = 40;
  H.FRESH_MS = 24 * 3600e3;
  H.KEEP_DAYS = 21; /* a week's recap shows while its newest report is this recent */

  /* "André de Kleijn" and "Kleijn, André de" both become "andre de kleijn" (words sorted). */
  H.nameKey = function (n) {
    return String(n || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");
  };
  /* The same key as a document id: words joined with "-". */
  H.idKey = function (n) { return H.nameKey(n).replace(/ /g, "-"); };
  var ALLOW_BY_KEY = {}, EN_KEYS = {};
  H.ALLOW.forEach(function (n) { ALLOW_BY_KEY[H.nameKey(n)] = n; });
  H.ENGLISH.forEach(function (n) { EN_KEYS[H.nameKey(n)] = 1; });
  H.langOf = function (name) { return EN_KEYS[H.nameKey(name)] ? "en" : "nl"; };
  H.allowed = function (name) { return ALLOW_BY_KEY[H.nameKey(name)] || null; };

  /* ---------- ISO weeks (local calendar date; the page runs in Europe/Amsterdam) ---------- */
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  H.isoWeek = function (d) {
    d = new Date(d);
    var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    var y = t.getUTCFullYear();
    var w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
    return y + "-W" + pad2(w);
  };
  H.prevWeek = function (now) {
    var d = new Date(now);
    return H.isoWeek(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7, 12));
  };
  var WEEK_RE = /^(\d{4})-W(\d{2})$/;
  /* Monday of an ISO week, as a UTC date. */
  H.monday = function (week) {
    var m = WEEK_RE.exec(week); if (!m) return null;
    var y = +m[1], w = +m[2], jan4 = new Date(Date.UTC(y, 0, 4)), day = jan4.getUTCDay() || 7;
    return new Date(Date.UTC(y, 0, 4 - day + 1 + (w - 1) * 7));
  };
  function isoDate(d) { return d.toISOString().slice(0, 10); }
  H.weekNr = function (week) { var m = WEEK_RE.exec(week); return m ? String(+m[2]) : ""; };
  var MON = { nl: ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"],
    en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] };
  /* "21 t/m 27 sep" / "21 to 27 Sep"; across months "28 sep t/m 4 okt". */
  H.periodText = function (week, lang) {
    var a = H.monday(week); if (!a) return "";
    var b = new Date(a.getTime() + 6 * 864e5), mo = MON[lang] || MON.nl, sep = lang === "en" ? " to " : " t/m ";
    var left = a.getUTCMonth() === b.getUTCMonth() ? String(a.getUTCDate()) : a.getUTCDate() + " " + mo[a.getUTCMonth()];
    return left + sep + b.getUTCDate() + " " + mo[b.getUTCMonth()];
  };
  H.hoursText = function (h, lang) {
    var n = Math.round(Number(h) * 100) / 100, s = String(n);
    return lang === "en" ? s : s.replace(".", ",");
  };

  /* ---------- Templates (fixed; Thomas's style) ---------- */
  H.mailFor = function (name, hours, week) {
    var lang = H.langOf(name), first = String(name).trim().split(/\s+/)[0];
    var nr = H.weekNr(week), period = H.periodText(week, lang), h = H.hoursText(hours, lang);
    if (lang === "en") return { lang: lang, subject: "Please complete your hours for week " + nr,
      text: "Hi " + first + ",\n\nYour hours for week " + nr + " (" + period + ") aren't complete in Salesforce yet: " + h + " of 40 so far. Could you add them today? Then I can approve them.\n\nThanks!\n\nKR\nThomas" };
    return { lang: lang, subject: "Uren week " + nr + " aanvullen",
      text: "Hi " + first + ",\n\nJe uren voor week " + nr + " (" + period + ") staan nog niet compleet in Salesforce: nu " + h + " van de 40. Wil je ze vandaag aanvullen? Dan kan ik ze goedkeuren.\n\nDank je!\n\nKR\nThomas" };
  };

  /* ---------- Strict validation: anything off and the report is ignored ---------- */
  function str(v, max) { return typeof v === "string" && v.length <= max; }
  function num(v) { return typeof v === "number" && isFinite(v); }
  function cnt(v) { return num(v) && v >= 0 && Math.floor(v) === v; }
  H.validate = function (r) {
    if (!r || typeof r !== "object" || Array.isArray(r)) return null;
    if (!str(r.id, 80) || !/^[A-Za-z0-9_-]{1,80}$/.test(r.id)) return null;
    if (!num(r.startedAt) || (r.finishedAt != null && !num(r.finishedAt))) return null;
    if (!str(r.week, 8) || !WEEK_RE.test(r.week) || !H.monday(r.week)) return null;
    if (r.trigger !== "schedule" && r.trigger !== "manual") return null;
    if (r.fatal != null && !str(r.fatal, 2000)) return null;
    if (!Array.isArray(r.rows) || r.rows.length > 5000) return null;
    var rows = [];
    for (var i = 0; i < r.rows.length; i++) {
      var x = r.rows[i];
      if (!x || typeof x !== "object" || ["approved", "rejected", "error"].indexOf(x.outcome) < 0) return null;
      if (x.label != null && !str(x.label, 500)) return null;
      if (x.assignment != null && !str(x.assignment, 500)) return null;
      if (x.error != null && !str(x.error, 2000)) return null;
      rows.push({ label: String(x.label || ""), assignment: String(x.assignment || ""), outcome: x.outcome, error: x.error ? String(x.error) : "" });
    }
    var out = { id: r.id, startedAt: r.startedAt, finishedAt: num(r.finishedAt) ? r.finishedAt : null, week: r.week, trigger: r.trigger,
      auto: r.auto === true, fatal: r.fatal ? String(r.fatal) : "", rows: rows,
      approved: cnt(r.approved) ? r.approved : 0, rejected: cnt(r.rejected) ? r.rejected : 0, errors: cnt(r.errors) ? r.errors : 0, hours: null };
    if (r.hours != null) {
      var h = r.hours;
      if (typeof h !== "object" || Array.isArray(h)) return null;
      if (h.error != null) {
        if (!str(h.error, 2000)) return null;
        out.hours = { error: String(h.error) };
      } else {
        if (!str(h.period, 200) || !num(h.required) || !cnt(h.checked) || !Array.isArray(h.missing) || h.missing.length > 500) return null;
        if (h.truncated != null && typeof h.truncated !== "boolean") return null;
        var missing = [];
        for (var j = 0; j < h.missing.length; j++) {
          var p = h.missing[j];
          if (!p || typeof p !== "object" || !str(p.name, 120) || !num(p.hours) || p.hours < 0) return null;
          missing.push({ name: p.name, hours: p.hours, inReport: p.inReport === true });
        }
        out.hours = { period: h.period, required: h.required, checked: h.checked, missing: missing, truncated: h.truncated === true };
      }
    }
    return out;
  };

  /* ---------- What is stored ---------- */
  var S = H.state = { reports: {}, sent: {}, people: {}, loaded: false, failed: false };
  var onChange = function () {}, buffer = [], started = false, chain = Promise.resolve();
  H.busy = 0;

  function post(msg) { try { window.postMessage(msg, "*"); } catch (e) { /* ignore */ } }

  /* Only from this window itself: the bridge is a content script in the same frame. */
  function onMessage(e) {
    if (!e || e.source !== window) return;
    try { if (e.origin && e.origin !== window.location.origin) return; } catch (x) { return; }
    var d = e.data;
    if (!d || typeof d !== "object" || d.source !== "sf-approver" || d.type !== "reports" || !Array.isArray(d.reports)) return;
    var list = d.reports.slice(0, 50);
    if (!started) { buffer = buffer.concat(list); return; }
    receive(list);
  }
  window.addEventListener("message", onMessage);

  function readColl(name) {
    return rt.timeout(Promise.resolve().then(function () { return store.readColl(name); }), rt.cfg.storeMs, "Reading " + name)
      .then(function (v) { return U.clone(v || {}); });
  }

  /* Called once the runtime is up. opts.onChange: the list should rebuild. */
  H.start = function (opts) {
    if (started) return Promise.resolve();
    onChange = opts && opts.onChange || onChange;
    return Promise.all([readColl("hours"), readColl("hours-sent"), readColl("hours-people")]).then(function (r) {
      S.reports = r[0]; S.sent = r[1]; S.people = r[2]; S.loaded = true;
    }, function () { S.failed = true; }).then(function () {
      started = true;
      var b = buffer; buffer = [];
      if (b.length) receive(b);
      /* Stored reports whose reminder run never finished (a closed tab, no db at the time). */
      if (S.loaded) Object.keys(S.reports).forEach(function (id) { if (!S.reports[id].processedAt) enqueue(id); });
      post({ source: "droplet", type: "hello" });
      onChange();
    });
  };

  function receive(list) {
    /* Without the stored reports we can't tell new from handled: leave them with the extension. */
    if (!S.loaded) return Promise.resolve();
    var acks = [], writes = [];
    list.forEach(function (raw) {
      var r = H.validate(raw);
      if (!r) return; /* malformed: ignored, not acked */
      if (S.reports[r.id]) { acks.push(r.id); return; } /* already stored: ack again */
      var rec = { report: U.clone(r), receivedAt: Date.now() };
      S.reports[r.id] = rec;
      writes.push(store.put("hours", r.id, U.clone(rec)).then(function (ok) {
        if (ok) { acks.push(r.id); enqueue(r.id); }
        else delete S.reports[r.id]; /* not stored: the extension keeps it and sends it again */
      }));
    });
    return Promise.all(writes).then(function () {
      if (acks.length) post({ source: "droplet", type: "ack", ids: acks });
      onChange();
    });
  }

  function enqueue(id) {
    H.busy++;
    chain = chain.then(function () { return process(id); }).then(null, function (e) {
      var rec = S.reports[id];
      if (rec && !rec.processedAt) { rec.outcome = { at: Date.now(), blocked: "Something went wrong while sending reminders: " + U.clip(String(e && e.message || e), 120) }; rec.processedAt = Date.now(); store.put("hours", id, U.clone(rec)); }
    }).then(function () {
      H.busy--;
      if (S.reports[id] && S.reports[id].processedAt) post({ source: "droplet", type: "done", ids: [id] });
      onChange();
    });
    return chain;
  }

  /* Why this report may not send any mail, or "" when it may. */
  H.blockReason = function (r, now) {
    var runAt = r.finishedAt || r.startedAt;
    if (r.fatal) return "The Salesforce run failed (" + U.clip(r.fatal, 160) + "), so no reminders were sent.";
    if (!r.hours) return "The run has no hours check, so no reminders were sent.";
    if (r.hours.error) return "The hours check failed (" + U.clip(r.hours.error, 160) + "), so no reminders were sent.";
    if (r.hours.truncated) return "The hours report was cut off (more than 2,000 rows), so totals may be incomplete and no reminders were sent.";
    if (now - runAt > H.FRESH_MS) return "The report reached Droplet " + Math.round((now - runAt) / 3600e3) + " h after the run (more than 24 h), so no reminders were sent.";
    if (runAt - now > 5 * 60e3) return "The report's run time is in the future, so no reminders were sent.";
    if (r.week !== H.prevWeek(now)) return "The report is for week " + H.weekNr(r.week) + ", not last week, so no reminders were sent.";
    var dates = String(r.hours.period).match(/\d{4}-\d{2}-\d{2}/g) || [];
    if (!dates.length || dates[0] !== isoDate(H.monday(r.week))) return "The report's period (" + U.clip(r.hours.period, 60) + ") isn't week " + H.weekNr(r.week) + ", so no reminders were sent.";
    return "";
  };

  /* Allowlisted people the report lists with fewer than 40 hours (the allowlist's own spelling). */
  H.candidates = function (r) {
    var seen = {}, out = [];
    ((r.hours && r.hours.missing) || []).forEach(function (p) {
      var name = H.allowed(p.name), k = H.nameKey(p.name);
      if (!name || seen[k] || !(p.hours < H.REQUIRED)) return;
      seen[k] = 1;
      out.push({ name: name, hours: p.hours, inReport: p.inReport });
    });
    return out;
  };

  function process(id) {
    var rec = S.reports[id];
    if (!rec || rec.processedAt) return Promise.resolve();
    var r = rec.report, now = Date.now();
    if (!S.loaded) return Promise.resolve(); /* can't tell who was mailed: wait for a reload */
    var block = H.blockReason(r, now);
    if (!block && (!rt.mcp || typeof rt.mcp.callTool !== "function")) {
      /* No Outlook in this view: try again on a later load while the report is fresh. */
      rec.waiting = "Outlook isn’t available here, so reminders wait until Droplet can reach it.";
      return Promise.resolve();
    }
    delete rec.waiting;
    var outcome = { at: now, blocked: block, notMailed: [], skipped: [] };
    var work = Promise.resolve();
    if (!block) H.candidates(r).forEach(function (p) {
      work = work.then(function () { return remind(r.week, p, outcome); });
    });
    return work.then(function () {
      outcome.at = Date.now();
      rec.outcome = outcome; rec.processedAt = Date.now();
      return store.put("hours", id, U.clone(rec));
    });
  }

  function sentKey(week, name) { return week + "~" + H.idKey(name); }

  function remind(week, p, outcome) {
    var key = sentKey(week, p.name);
    if (S.sent[key]) { outcome.skipped.push(p.name); return Promise.resolve(); } /* once per person per week */
    return H.resolve(p.name).then(function (addr) {
      if (!addr.email) { outcome.notMailed.push({ name: p.name, hours: p.hours, why: addr.why }); return; }
      if (S.sent[key]) { outcome.skipped.push(p.name); return; }
      var m = H.mailFor(p.name, p.hours, week);
      var rec = { week: week, name: p.name, email: addr.email, lang: m.lang, hours: p.hours, status: "sending", at: new Date().toISOString() };
      S.sent[key] = rec; /* this session never tries twice, whatever the db says */
      return store.put("hours-sent", key, U.clone(rec)).then(function (ok) {
        if (!ok) {
          rec.status = "failed"; rec.detail = "Couldn’t record the reminder first, so it wasn’t sent.";
          return;
        }
        return D.sendflow.sendNew({ to: [addr.email], subject: m.subject, text: m.text }).then(function (res) {
          rec.status = res.phase === "sent" ? "sent" : res.phase === "unclear" ? "unclear" : "failed";
          if (rec.status !== "sent") rec.detail = U.clip(res.message || "", 200);
          rec.doneAt = new Date().toISOString();
          return store.put("hours-sent", key, U.clone(rec));
        });
      });
    });
  }

  /* ---------- Finding an address ---------- */
  var EMAIL_RE = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+$/;
  function planon(a) {
    a = String(a || "").trim().toLowerCase();
    return EMAIL_RE.test(a) && a.split("@")[1] === H.DOMAIN ? a : "";
  }
  var LIST_KEYS = ["value", "people", "results", "items", "persons", "data", "matches"];
  function flatten(objs) {
    var out = [];
    objs.forEach(function (o) {
      var list = null;
      LIST_KEYS.forEach(function (k) { if (!list && Array.isArray(o[k])) list = o[k]; });
      if (list) list.forEach(function (x) { if (x && typeof x === "object") out.push(x); });
      else out.push(o);
    });
    return out;
  }
  function personName(o) {
    var n = o.displayName || o.name || o.fullName;
    if (!n && (o.givenName || o.surname)) n = (o.givenName || "") + " " + (o.surname || "");
    return typeof n === "string" ? n : "";
  }
  /* One address per entry: mail first, then the other fields. */
  function personEmail(o) {
    var c = [o.mail, o.email, o.emailAddress && (o.emailAddress.address || o.emailAddress), o.address, o.userPrincipalName];
    ["emailAddresses", "scoredEmailAddresses"].forEach(function (k) {
      if (Array.isArray(o[k])) o[k].forEach(function (x) { c.push(x && typeof x === "object" ? x.address : x); });
    });
    for (var i = 0; i < c.length; i++) { var a = planon(typeof c[i] === "string" ? c[i] : ""); if (a) return a; }
    return "";
  }
  /* {email} for one unambiguous match, {why} otherwise. */
  function pick(entries, key) {
    var found = {};
    entries.forEach(function (e) { if (H.nameKey(e.name) === key && e.email) found[e.email] = 1; });
    var list = Object.keys(found);
    if (list.length === 1) return { email: list[0] };
    if (list.length > 1) return { why: "Couldn’t find address: more than one match", ambiguous: true };
    return null;
  }
  var schemaP = null;
  function peopleField() {
    if (schemaP) return schemaP;
    var m = rt.mcp;
    if (!m || typeof m.describeTool !== "function") return (schemaP = Promise.resolve({ field: "query", limit: false }));
    schemaP = rt.timeout(Promise.resolve().then(function () { return m.describeTool(rt.SERVER, "search_people"); }), rt.cfg.callMs, "describe search_people")
      .then(function (d) {
        var props = d && d.inputSchema && d.inputSchema.properties;
        if (!props || typeof props !== "object") return { field: "query", limit: false };
        var field = props.query ? "query" : ["searchQuery", "q", "search", "name", "text"].filter(function (k) { return props[k]; })[0] ||
          Object.keys(props).filter(function (k) { return props[k] && props[k].type === "string"; })[0] || "query";
        return { field: field, limit: !!props.limit };
      }, function () { return { field: "query", limit: false }; });
    return schemaP;
  }
  function viaPeople(name, key) {
    return peopleField().then(function (f) {
      var input = {}; input[f.field] = name; if (f.limit) input.limit = 10;
      return rt.call("search_people", input);
    }).then(function (res) {
      var entries = flatten(U.resultObjects(res)).map(function (o) { return { name: personName(o), email: personEmail(o) }; });
      return pick(entries, key);
    }, function () { return { error: true }; });
  }
  function viaMail(name, key) {
    return rt.call("outlook_email_search", { sender: name, limit: 10 }).then(function (res) {
      var entries = D.mail.searchObjects(res).map(function (o) {
        var from = o.sender !== undefined ? o.sender : o.from;
        var addr = typeof from === "string" ? from : from && (from.address || from.emailAddress && from.emailAddress.address) || "";
        var nm = from && typeof from === "object" && (from.name || from.emailAddress && from.emailAddress.name) || o.senderName || U.nameFromAddress(addr);
        return { name: String(nm || ""), email: planon(addr) };
      });
      return pick(entries, key);
    }, function () { return { error: true }; });
  }
  H.resolve = function (name) {
    var key = H.nameKey(name), id = H.idKey(name), c = S.people[id];
    if (c && planon(c.email) && H.nameKey(c.name) === key) return Promise.resolve({ email: planon(c.email) });
    return viaPeople(name, key).then(function (a) {
      if (a && (a.email || a.ambiguous)) return a.email ? Object.assign(a, { via: "people" }) : a;
      return viaMail(name, key).then(function (b) {
        if (b && b.email) return Object.assign(b, { via: "mail" });
        if (b && b.ambiguous) return b;
        if ((a && a.error) && (b && b.error)) return { why: "Couldn’t find address: the people search failed" };
        return { why: "Couldn’t find address" };
      });
    }).then(function (r) {
      if (r.email) {
        S.people[id] = { name: name, email: r.email, via: r.via, at: new Date().toISOString() };
        store.put("hours-people", id, U.clone(S.people[id]));
      }
      return r;
    });
  };

  /* ---------- The weekly recap ---------- */
  /* One recap per week with a report: {week, reports (oldest first), sent, at}. */
  H.recaps = function (now) {
    now = now || Date.now();
    var byWeek = {};
    Object.keys(S.reports).forEach(function (id) {
      var rec = S.reports[id], r = rec && rec.report; if (!r || !r.week) return;
      (byWeek[r.week] = byWeek[r.week] || []).push(rec);
    });
    return Object.keys(byWeek).map(function (week) {
      var list = byWeek[week].sort(function (a, b) { return (a.report.finishedAt || a.report.startedAt) - (b.report.finishedAt || b.report.startedAt); });
      var last = list[list.length - 1], at = last.report.finishedAt || last.report.startedAt;
      var sent = Object.keys(S.sent).filter(function (k) { return S.sent[k].week === week; }).map(function (k) { return S.sent[k]; })
        .sort(function (a, b) { return a.name.localeCompare(b.name); });
      return { week: week, reports: list, sent: sent, at: at };
    }).filter(function (x) { return now - x.at < H.KEEP_DAYS * 864e5; })
      .sort(function (a, b) { return b.at - a.at; });
  };
  H.summary = function (x) {
    var c = H.counts(x), parts = [];
    parts.push(c.approved + " approved", c.rejected + " rejected");
    var mailed = x.sent.filter(function (s) { return s.status === "sent"; }).length;
    parts.push(mailed + " reminder" + (mailed === 1 ? "" : "s") + " sent");
    var nm = H.notMailed(x).length;
    if (nm) parts.push(nm + " not mailed");
    return parts.join(" · ");
  };
  H.counts = function (x) {
    var c = { approved: 0, rejected: 0, errors: 0 };
    x.reports.forEach(function (rec) {
      rec.report.rows.forEach(function (row) { if (row.outcome === "approved") c.approved++; else if (row.outcome === "rejected") c.rejected++; else c.errors++; });
    });
    return c;
  };
  /* Who couldn't be mailed, and why: per person, the latest word wins; mailed people aren't listed. */
  H.notMailed = function (x) {
    var out = {}, done = {};
    x.sent.forEach(function (s) {
      var k = H.nameKey(s.name);
      if (s.status === "sent") done[k] = 1;
      else out[k] = { name: s.name, hours: s.hours, lang: s.lang, why: s.status === "unclear" ? "Outlook didn’t confirm the send; check Sent Items (not tried again)" :
        s.status === "sending" ? "The send was interrupted; check Sent Items (not tried again)" : (s.detail || "The send failed") + " (not tried again)" };
    });
    x.reports.forEach(function (rec) {
      ((rec.outcome && rec.outcome.notMailed) || []).forEach(function (n) {
        var k = H.nameKey(n.name);
        if (!done[k] && !(out[k] && out[k].lang)) out[k] = { name: n.name, hours: n.hours, why: n.why };
      });
    });
    return Object.keys(out).map(function (k) { return out[k]; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  };
  H.problems = function (x) {
    var out = [];
    x.reports.forEach(function (rec) {
      var r = rec.report, when = new Date(r.finishedAt || r.startedAt);
      var tag = (r.trigger === "schedule" ? "Scheduled run " : "Manual run ") + U.hhmm(when) + " " + when.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      if (rec.outcome && rec.outcome.blocked) out.push(tag + ": " + rec.outcome.blocked);
      else if (r.fatal) out.push(tag + ": " + r.fatal);
      else if (!rec.outcome) {
        if (rec.waiting) out.push(tag + ": " + rec.waiting);
        else if (r.hours && r.hours.error) out.push(tag + ": the hours check failed (" + r.hours.error + ").");
      }
      r.rows.forEach(function (row) { if (row.outcome === "error") out.push(tag + ": " + (row.label || "a timecard") + ": " + (row.error || "error")); });
    });
    return out;
  };

  function esc(s) { return U.esc(s); }
  /* The panel's body (cards), no buttons. */
  H.recapHTML = function (x) {
    var c = H.counts(x), h = "";
    var mailed = x.sent.filter(function (s) { return s.status === "sent"; });
    var nm = H.notMailed(x), probs = H.problems(x);
    var last = x.reports[x.reports.length - 1].report;
    h += '<div class="sec-label">Timecards</div><div class="card hr-card" data-hours-counts>' +
      '<p><b data-approved>' + c.approved + '</b> approved · <b data-rejected>' + c.rejected + '</b> rejected (overhead)' + (c.errors ? ' · <b>' + c.errors + '</b> with an error' : '') + '</p>' +
      (last.hours && last.hours.period ? '<p class="muted">Hours period: ' + esc(last.hours.period) + '</p>' : '') + '</div>';
    h += '<div class="sec-label">Reminders sent</div><div class="card hr-card"><ul class="hr-list" data-hours-mailed>' +
      (mailed.length ? mailed.map(function (s) {
        return '<li data-person="' + esc(s.name) + '"><span class="hr-n">' + esc(s.name) + '</span><span class="hr-m">' + esc(H.hoursText(s.hours, "en")) + ' h · ' + (s.lang === "en" ? "EN" : "NL") + '</span></li>';
      }).join("") : '<li class="muted">Nobody was mailed.</li>') + '</ul></div>';
    if (nm.length) h += '<div class="sec-label">Couldn’t mail</div><div class="card hr-card"><ul class="hr-list" data-hours-notmailed>' + nm.map(function (n) {
      return '<li data-person="' + esc(n.name) + '"><span class="hr-n">' + esc(n.name) + '</span><span class="hr-m">' + esc(H.hoursText(n.hours, "en")) + ' h</span><span class="hr-why">' + esc(n.why) + '</span></li>';
    }).join("") + '</ul></div>';
    if (probs.length) h += '<div class="sec-label">Errors</div><div class="card hr-card"><ul class="hr-list" data-hours-errors>' + probs.map(function (p) {
      return '<li><span class="hr-why">' + esc(p) + '</span></li>';
    }).join("") + '</ul></div>';
    return h;
  };
})(window.Droplet = window.Droplet || {});
