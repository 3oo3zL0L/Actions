/* Droplet · Leave approvals from the "Planon Verlof Goedkeurder" extension
   (a colleague's Chrome extension, v1.1+). Its bridge runs in this frame and
   speaks to "Action Desk"; Droplet uses the same messages:
     Droplet → { source: 'action-desk', type: 'hello' }
     bridge  → { source: 'leave-approver', type: 'reports', reports: [...] }
     Droplet → { source: 'action-desk', type: 'leave-ack', ids: [...] }  (after storing)
   A report is stored once (db leave/<id>) and only then acked; the extension
   keeps it until then. Thomas only wants to hear about approved days: a
   report with approved requests becomes one card in Today, with Done. The
   rest of a run (skipped, not done) is not shown. Read-only: Droplet never
   approves anything itself and never starts a run. */
(function (D) {
  "use strict";
  var U = D.util, rt = D.rt, store = D.store;
  var L = D.leave = {};
  L.HELLO_MS = 5000;
  var OUTCOMES = ["approved", "checked", "check-failed", "unknown", "not-done"];

  function str(v, max) { return typeof v === "string" && v.length <= (max || 200); }
  function isoOrEmpty(v) { return v === "" || str(v, 40) && !isNaN(Date.parse(v)); }
  L.validate = function (r) {
    if (!r || typeof r !== "object" || !str(r.id, 40) || !/^run-\d{10,16}$/.test(r.id)) return null;
    if (!Array.isArray(r.requests) || r.requests.length > 100) return null;
    var reqs = [];
    for (var i = 0; i < r.requests.length; i++) {
      var q = r.requests[i];
      if (!q || typeof q !== "object" || !str(q.number, 40) || !str(q.requestor, 120) || !str(q.fromText || "", 60) || !str(q.tillText || "", 60)) return null;
      if (!isoOrEmpty(q.from || "") || !isoOrEmpty(q.till || "") || OUTCOMES.indexOf(q.outcome) < 0) return null;
      if (q.hours != null && (typeof q.hours !== "number" || !isFinite(q.hours) || q.hours < 0 || q.hours > 2000)) return null;
      reqs.push({ number: q.number, requestor: q.requestor, type: str(q.type, 80) ? q.type : "", fromText: q.fromText || "", tillText: q.tillText || "",
        from: q.from || "", till: q.till || "", hours: q.hours == null ? null : q.hours, outcome: q.outcome });
    }
    var fin = typeof r.finishedAt === "number" && isFinite(r.finishedAt) ? r.finishedAt : typeof r.startedAt === "number" ? r.startedAt : Date.now();
    return { id: r.id, finishedAt: fin, auto: r.auto === true, requests: reqs };
  };
  L.approved = function (rep) { return (rep && rep.requests || []).filter(function (q) { return q.outcome === "approved"; }); };

  var S = L.state = { reports: {}, loaded: false, bridge: null };
  var onChange = function () {}, onBridge = function () {}, buffer = [], started = false;
  function post(msg) { try { window.postMessage(msg, "*"); } catch (e) { /* ignore */ } }

  /* Only from this window itself: the bridge is a content script in the same frame. */
  function onMessage(e) {
    if (!e || e.source !== window) return;
    try { if (e.origin && e.origin !== window.location.origin) return; } catch (x) { return; }
    var d = e.data;
    if (!d || typeof d !== "object" || d.source !== "leave-approver" || d.type !== "reports" || !Array.isArray(d.reports)) return;
    var list = d.reports.slice(0, 50);
    if (S.bridge !== true) { S.bridge = true; onBridge(true); } /* the extension answered: it is installed here */
    if (!started) { buffer = buffer.concat(list); return; }
    receive(list);
  }
  window.addEventListener("message", onMessage);

  function receive(list) {
    if (!S.loaded) return Promise.resolve(); /* can't tell new from handled: the extension keeps them */
    var acks = [], writes = [];
    list.forEach(function (raw) {
      var r = L.validate(raw);
      if (!r) return; /* malformed: ignored, not acked */
      if (S.reports[r.id]) { acks.push(r.id); return; }
      var rec = { report: U.clone(r), receivedAt: Date.now() };
      S.reports[r.id] = rec;
      writes.push(Promise.resolve(store.put("leave", r.id, U.clone(rec))).then(function (ok) {
        if (ok !== false) acks.push(r.id); else delete S.reports[r.id];
      }, function () { delete S.reports[r.id]; }));
    });
    return Promise.all(writes).then(function () {
      if (acks.length) post({ source: "action-desk", type: "leave-ack", ids: acks });
      onChange();
    });
  }

  L.start = function (opts) {
    if (started) return Promise.resolve();
    onChange = opts && opts.onChange || onChange;
    onBridge = opts && opts.onBridge || onBridge;
    return rt.timeout(Promise.resolve().then(function () { return store.readColl("leave"); }), rt.cfg.storeMs, "Reading leave").then(function (v) {
      S.reports = U.clone(v || {}); S.loaded = true;
    }, function () { S.loaded = false; }).then(function () {
      started = true;
      var b = buffer; buffer = [];
      if (b.length) receive(b);
      post({ source: "action-desk", type: "hello" });
      /* The bridge answers a hello at once; no answer means no extension in this browser. */
      setTimeout(function () { if (S.bridge !== true) { S.bridge = false; onBridge(false); } }, L.HELLO_MS);
      onChange();
    });
  };
  /* Newest first; only runs that approved something. */
  L.withApprovals = function () {
    return Object.keys(S.reports).map(function (k) { return S.reports[k] && S.reports[k].report; })
      .filter(function (r) { return r && L.approved(r).length; })
      .sort(function (a, b) { return b.finishedAt - a.finishedAt; });
  };
  var fDay = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", weekday: "short", day: "2-digit", month: "short" });
  L.span = function (q) {
    var a = q.from ? new Date(q.from) : null, b = q.till ? new Date(q.till) : null;
    if (!a || !b) return [q.fromText, q.tillText].filter(Boolean).join(" – ");
    var da = fDay.format(a).replace(/,/g, ""), db = fDay.format(b).replace(/,/g, "");
    return da === db ? da : da + " – " + db;
  };
  L.hoursText = function (h) { return h == null ? "" : (Math.round(h * 100) / 100) + " h"; };
})(window.Droplet = window.Droplet || {});
