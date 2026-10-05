/* Droplet · what Droplet remembers (db capability; in-memory when absent).
   Collections: rankings/<msgKey>, done/<msgKey>, sent/<msgKey>, feedback/<msgKey>,
   handoff/<itemKey> (a Teams reply copied out, waiting for you to post it),
   actions/<docId> (your own actions; done ones stay stored with doneAt),
   waits/<docId> (R3: your asks to others: open, answered or dismissed),
   asks/<msgKey> (R3: a sent message Claude already checked for asks),
   meetings/<eventKey> (R6: a meeting whose transcript was read, or "none"),
   matches/<key> (a sent mail or meeting checked for whether it finished an open own action). */
(function (D) {
  "use strict";
  var rt = D.rt;
  var store = D.store = { persistent: false, failed: false };
  var mem = { rankings: {}, done: {}, sent: {}, feedback: {}, handoff: {}, actions: {}, waits: {}, asks: {}, meetings: {}, matches: {} };
  var chains = {};
  var KEEP_RANKINGS_DAYS = 14, KEEP_FEEDBACK = 200;

  function db() { return rt.db; }
  /* One write at a time per document. */
  function queue(path, fn) {
    var prev = chains[path] || Promise.resolve();
    /* Resolves true when written, false when the write failed (never rejects). */
    var next = prev.then(fn, fn).then(function () { return true; }, function () { store.failed = true; if (store.onError) store.onError(path); return false; });
    chains[path] = next;
    return next;
  }
  /* What the last read of each collection looked like (diagnostics):
     store.raw[name] = {shape, docs, open, done}. Keys and types only. */
  store.raw = {};
  /* The documents of one query snapshot, per the db contract
     (QuerySnapshot {docs: DocumentSnapshot[], size, empty}, data() a
     function). Tolerated as well: an array of documents, an object with
     forEach, and data as a plain object. null = a shape we don't know. */
  function docsOf(snap) {
    if (!snap || typeof snap !== "object") return null;
    if (Array.isArray(snap.docs)) return snap.docs;
    if (snap.docs && typeof snap.docs.forEach === "function") { var a = []; snap.docs.forEach(function (d) { a.push(d); }); return a; }
    if (Array.isArray(snap)) return snap;
    if (typeof snap.forEach === "function") { var b = []; snap.forEach(function (d) { b.push(d); }); return b; }
    return null;
  }
  function bodyOf(d) {
    if (!d || typeof d !== "object" || d.exists === false) return { skip: true };
    var v = typeof d.data === "function" ? d.data() : d.data;
    /* data() is frozen (db contract): the app gets its own copy. */
    if (v && typeof v === "object" && !Array.isArray(v)) return { v: U().clone(v) };
    if (v === undefined && typeof d.data === "function") return { skip: true }; /* exists unknown, no body */
    return null;
  }
  /* A next page, when a runtime ever pages (not in the contract today):
     snap.next() or a cursor we can hand back. */
  function nextPage(snap) {
    if (snap && typeof snap.next === "function" && (snap.hasMore === true || snap.nextPageToken || snap.nextCursor)) return snap.next();
    return null;
  }
  var MAX_DB_PAGES = 20;
  function readAll(name) {
    if (!db()) return Promise.resolve(mem[name]);
    var out = {}, n = 0, pages = 0, first = null;
    function shapeErr(snap) {
      store.raw[name] = { shape: U().shapeOf(snap), docs: n, unknown: true };
      return Promise.reject({ code: "unknown_shape", message: "The saved " + name + " came back in a form Droplet doesn’t know." });
    }
    function take(snap) {
      pages++;
      if (!first) first = snap;
      var docs = docsOf(snap);
      if (!docs) return shapeErr(snap);
      for (var i = 0; i < docs.length; i++) {
        var d = docs[i], b = bodyOf(d);
        if (!b || (!b.skip && (typeof d.id !== "string" || !d.id))) return shapeErr(snap);
        if (b.skip) continue;
        out[d.id] = b.v; n++;
      }
      var more = pages < MAX_DB_PAGES ? nextPage(snap) : null;
      if (more) return Promise.resolve(more).then(take);
      var open = 0, done = 0;
      Object.keys(out).forEach(function (k) { if (out[k].done) done++; else open++; });
      store.raw[name] = { shape: U().shapeOf(first), docs: n, open: open, done: done, pages: pages };
      return out;
    }
    return Promise.resolve().then(function () {
      var ref = db().collection(name);
      /* At most 1000 per query (db contract); no default page size is documented. */
      if (ref && typeof ref.limit === "function") ref = ref.limit(1000);
      return ref.get();
    }).then(take);
  }
  function U() { return D.util; }
  var NAMES = ["rankings", "done", "feedback", "sent", "handoff", "actions", "waits", "asks", "meetings", "matches"];
  function build(got) {
    var r = got.map(function (g) { return g.v; }), failed = [], err = null, timedOut = false;
    got.forEach(function (g, i) { if (!g.ok) { failed.push(NAMES[i]); err = err || g.e; if (g.e && g.e.code === "timeout") timedOut = true; } });
    var fb = Object.keys(r[2]).map(function (k) { var v = Object.assign({}, r[2][k]); v.key = k; return v; })
      .sort(function (a, b) { return String(b.at || "").localeCompare(String(a.at || "")); });
    /* Prune only after a complete read. */
    if (!failed.length) { prune(r[0], fb, r[3], r[4]); pruneScan(r[7], r[8], r[9]); }
    else store.failed = true;
    return { rankings: r[0], done: r[1], feedback: fb, sent: r[3], handoff: r[4], actions: r[5], waits: r[6], asks: r[7], meetings: r[8], matches: r[9],
      ok: !failed.length, failed: failed, timedOut: timedOut,
      error: err ? { code: String(err.code || "unavailable"), message: String(err.message || "") } : null };
  }
  /* Everything Droplet remembers. Each collection on its own, each bounded
     by cfg.storeMs: one that can't be read (or never answers) doesn't hide
     the others, your own actions above all. Never rejects. When some read
     timed out, .late resolves the complete result if they all do arrive. */
  store.loadAll = function (ms) {
    store.persistent = !!db();
    ms = ms || rt.cfg.storeMs;
    var raw = NAMES.map(function (n) { return readAll(n); });
    return Promise.all(raw.map(function (p, i) {
      return rt.timeout(p, ms, "Reading " + NAMES[i]).then(function (v) { return { ok: true, v: v || {} }; }, function (e) { return { ok: false, v: {}, e: e }; });
    })).then(function (got) {
      var out = build(got);
      if (out.timedOut) {
        out.late = Promise.all(raw).then(function (all) { return build(all.map(function (v) { return { ok: true, v: v || {} }; })); });
        out.late.catch(function () { /* never arrived complete */ });
      }
      return out;
    });
  };
  function prune(rankings, fb, sent, handoff) {
    var cutoff = Date.now() - KEEP_RANKINGS_DAYS * 864e5, n = 0;
    Object.keys(rankings).forEach(function (k) {
      var t = Date.parse(rankings[k].rankedAt || "");
      if (n < 20 && (!t || t < cutoff)) { n++; del("rankings", k); }
    });
    Object.keys(sent || {}).forEach(function (k) {
      var t = Date.parse(sent[k].sentAt || "");
      if (n < 40 && (!t || t < cutoff)) { n++; del("sent", k); }
    });
    Object.keys(handoff || {}).forEach(function (k) {
      var t = Date.parse(handoff[k].at || "");
      if (n < 60 && (!t || t < Date.now() - 3 * 864e5)) { n++; del("handoff", k); }
    });
    fb.slice(KEEP_FEEDBACK).forEach(function (f) { del("feedback", f.key); });
  }
  /* Scan caches older than 30 days can go: their messages and meetings are
     out of the scan window by then. */
  function pruneScan(asks, meetings, matches) {
    var cutoff = Date.now() - 30 * 864e5, n = 0;
    [["asks", asks], ["meetings", meetings], ["matches", matches]].forEach(function (p) {
      Object.keys(p[1] || {}).forEach(function (k) {
        var t = Date.parse(p[1][k].at || "");
        if (n < 40 && (!t || t < cutoff)) { n++; del(p[0], k); }
      });
    });
  }
  function set(name, key, data) {
    if (!db()) { mem[name][key] = data; return Promise.resolve(true); }
    return queue(name + "/" + key, function () { return db().collection(name).doc(key).set(data); });
  }
  function del(name, key) {
    if (!db()) { delete mem[name][key]; return Promise.resolve(true); }
    return queue(name + "/" + key, function () { return db().collection(name).doc(key).delete(); });
  }
  store.putRanking = function (key, r) { return set("rankings", key, r); };
  store.setDone = function (key, d) { return set("done", key, d); };
  store.clearDone = function (key) { return del("done", key); };
  /* A sent reply stays locked, also after Undo of its done mark and a reload. */
  store.setSent = function (key, d) { return set("sent", key, d); };
  store.setAction = function (id, a) { return set("actions", id, a); };
  store.deleteAction = function (id) { return del("actions", id); };
  store.clearRanking = function (key) { return del("rankings", key); };
  store.setHandoff = function (key, d) { return set("handoff", key, d); };
  store.clearHandoff = function (key) { return del("handoff", key); };
  store.setWait = function (id, w) { return set("waits", id, w); };
  store.setAsk = function (key, d) { return set("asks", key, d); };
  store.setMeeting = function (key, d) { return set("meetings", key, d); };
  /* matches/<key>: a sent mail or a meeting Claude already checked against your open actions. */
  store.setMatch = function (key, d) { return set("matches", key, d); };
  store.setFeedback = function (key, f) { return set("feedback", key, f); };
  store.clearFeedback = function (key) { return del("feedback", key); };
})(window.Droplet = window.Droplet || {});
