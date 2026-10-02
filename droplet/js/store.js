/* Droplet · what Droplet remembers (db capability; in-memory when absent).
   Collections: rankings/<msgKey>, done/<msgKey>, sent/<msgKey>, feedback/<msgKey>,
   handoff/<itemKey> (a Teams reply copied out, waiting for you to post it),
   actions/<docId> (your own actions; done ones stay stored with doneAt). */
(function (D) {
  "use strict";
  var rt = D.rt;
  var store = D.store = { persistent: false, failed: false };
  var mem = { rankings: {}, done: {}, sent: {}, feedback: {}, handoff: {}, actions: {} };
  var chains = {};
  var KEEP_RANKINGS_DAYS = 14, KEEP_FEEDBACK = 200;

  function db() { return rt.db; }
  /* One write at a time per document. */
  function queue(path, fn) {
    var prev = chains[path] || Promise.resolve();
    var next = prev.then(fn, fn).catch(function () { store.failed = true; if (store.onError) store.onError(); });
    chains[path] = next;
    return next;
  }
  function readAll(name) {
    if (!db()) return Promise.resolve(mem[name]);
    return db().collection(name).get().then(function (snap) {
      var out = {};
      (snap && snap.docs || []).forEach(function (d) { var v = d.data && d.data(); if (v) out[d.id] = v; });
      return out;
    });
  }

  store.loadAll = function () {
    store.persistent = !!db();
    return Promise.all([readAll("rankings"), readAll("done"), readAll("feedback"), readAll("sent"), readAll("handoff"), readAll("actions")]).then(function (r) {
      var fb = Object.keys(r[2]).map(function (k) { var v = Object.assign({}, r[2][k]); v.key = k; return v; })
        .sort(function (a, b) { return String(b.at || "").localeCompare(String(a.at || "")); });
      prune(r[0], fb, r[3], r[4]);
      return { rankings: r[0], done: r[1], feedback: fb, sent: r[3], handoff: r[4], actions: r[5], ok: true };
    }, function () {
      store.failed = true;
      return { rankings: {}, done: {}, feedback: [], sent: {}, handoff: {}, actions: {}, ok: false };
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
  function set(name, key, data) {
    if (!db()) { mem[name][key] = data; return Promise.resolve(); }
    return queue(name + "/" + key, function () { return db().collection(name).doc(key).set(data); });
  }
  function del(name, key) {
    if (!db()) { delete mem[name][key]; return Promise.resolve(); }
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
  store.setFeedback = function (key, f) { return set("feedback", key, f); };
  store.clearFeedback = function (key) { return del("feedback", key); };
})(window.Droplet = window.Droplet || {});
