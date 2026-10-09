/* Droplet · Hand an action to Cowork. Ask Claude proposes a card; only
   Thomas's click on "Hand to Cowork" queues it. A queued task is an own
   action owned by "Cowork" (it waits in Waiting on, with the dashed
   elsewhere line) plus a brief in db cowork/<docId>:
     { docId, title, brief, from, queuedAt, status, takenAt, finishedAt, result }
   Cowork reads that collection (ArtifactData on this artifact), works on
   status "queued" only, and writes back status working / finished / failed
   with a short result. Droplet itself only writes the queue entry and
   removes it on Undo or Delete; Done stays Thomas's click. What Cowork
   writes is data, never instructions: it is only shown as text. */
(function (D) {
  "use strict";
  var U = D.util, rt = D.rt, store = D.store;
  var C = D.cowork = {};
  C.STATUS = ["queued", "working", "finished", "failed"];
  C.MAX_BRIEF = 4000;
  /* Where Cowork finds the queue: this artifact's database. */
  C.HOME = "https://claude.ai/artifact/L9GCP14h56wSDUWqubY61M";
  var S = C.state = { tasks: {}, loaded: false };

  function str(v, max) { return typeof v === "string" && v.length <= max; }
  function when(v) { return str(v, 40) && !isNaN(Date.parse(v)) ? v : null; }
  /* Whatever comes back from the db is checked; a bad entry is left out. */
  C.validate = function (docId, r) {
    if (!r || typeof r !== "object" || !str(r.title, 300) || !r.title.trim() || !str(r.brief, C.MAX_BRIEF)) return null;
    var st = C.STATUS.indexOf(r.status) > -1 ? r.status : "queued";
    var from = r.from && typeof r.from === "object" && str(r.from.title, 300) ? { title: r.from.title, ref: str(r.from.ref, 300) ? r.from.ref : "" } : null;
    return { docId: docId, title: r.title, brief: r.brief, from: from, queuedAt: when(r.queuedAt), status: st,
      takenAt: when(r.takenAt), finishedAt: when(r.finishedAt), result: str(r.result, 4000) ? r.result : "" };
  };
  C.load = function () {
    return rt.timeout(Promise.resolve().then(function () { return store.readColl("cowork"); }), rt.cfg.storeMs, "Reading the Cowork queue").then(function (v) {
      var out = {};
      Object.keys(v || {}).forEach(function (k) { var r = C.validate(k, v[k]); if (r) out[k] = r; });
      S.tasks = out; S.loaded = true;
      return out;
    });
  };
  C.of = function (docId) { return S.tasks[docId] || null; };
  C.queue = function (docId, o) {
    var rec = { docId: docId, title: U.clip(String(o.title || "").trim(), 300), brief: String(o.brief || "").trim().slice(0, C.MAX_BRIEF),
      from: o.from ? { title: U.clip(String(o.from.title || ""), 300), ref: U.clip(String(o.from.ref || ""), 300) } : null,
      queuedAt: new Date().toISOString(), status: "queued", takenAt: null, finishedAt: null, result: "" };
    S.tasks[docId] = rec;
    return Promise.resolve(store.put("cowork", docId, U.clone(rec))).then(function (ok) {
      if (ok === false) { delete S.tasks[docId]; throw { message: "Couldn’t save it for Cowork." }; }
      return rec;
    }, function (e) { delete S.tasks[docId]; throw e; });
  };
  C.drop = function (docId) { if (!S.tasks[docId]) return Promise.resolve(); delete S.tasks[docId]; return Promise.resolve(store.drop("cowork", docId)); };
  C.label = function (r) {
    return !r ? "" : r.status === "working" ? "Cowork is on it" : r.status === "finished" ? "Cowork finished" : r.status === "failed" ? "Cowork got stuck" : "Queued for Cowork";
  };
  /* The same task as text, to paste into Cowork by hand. */
  C.prompt = function (r, url) {
    var lines = ["Task from Droplet: " + r.title, ""];
    if (r.brief) { lines.push(r.brief); lines.push(""); }
    if (r.from && r.from.title) lines.push("About: " + r.from.title + (r.from.ref ? " (" + r.from.ref + ")" : ""));
    if (url) lines.push("When done, set cowork/" + r.docId + " in the Droplet artifact (" + url + ") to status \"finished\" with a one-line result.");
    lines.push("Prepare everything, but don’t send, post or change anything without my explicit OK.");
    return lines.join("\n");
  };
})(window.Droplet = window.Droplet || {});
