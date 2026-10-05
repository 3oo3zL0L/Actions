/* Droplet · the claude.ai runtime: capabilities and connector calls.
   Every capability may be null; callers design for that. Every call is
   bounded by a timeout: a consent prompt nobody answers, a stalled
   connector or a silent runtime never blocks the page. */
(function (D) {
  "use strict";
  var rt = D.rt = { mcp: null, sample: null, db: null, perms: null, inited: false };
  rt.SERVER = "Microsoft 365";

  /* Timeouts (ms). A page may override them before the scripts run with
     window.__dropletConfig (the tests use short ones). */
  var cfg = rt.cfg = { callMs: 30000, pageMs: 45000, storeMs: 15000, useMs: 15000, sampleMs: 150000, rankDebounceMs: 250, rankBatch: 8, rankRetryMs: [4000, 15000] };
  try { if (window.__dropletConfig) Object.keys(window.__dropletConfig).forEach(function (k) { cfg[k] = window.__dropletConfig[k]; }); } catch (e) { /* ignore */ }

  /* Settles like p, or rejects {code: "timeout"} after ms. */
  rt.timeout = function (p, ms, what) {
    return new Promise(function (res, rej) {
      var done = false;
      var t = setTimeout(function () {
        if (done) return; done = true;
        rej({ code: "timeout", message: (what || "The call") + " got no answer within " + Math.round(ms / 1000) + " s." });
      }, ms);
      Promise.resolve(p).then(function (v) { if (done) return; done = true; clearTimeout(t); res(v); },
        function (e) { if (done) return; done = true; clearTimeout(t); rej(e); });
    });
  };

  /* use() resolves null after ~10 s in a frame nobody answers; we still
     bound it. A capability that arrives after our timeout is taken late. */
  rt.onLate = null;
  function use(name) {
    try {
      if (!window.claude || typeof window.claude.use !== "function") return Promise.resolve(null);
      var p = Promise.resolve(window.claude.use(name)).then(function (v) { return v || null; }, function () { return null; });
      return rt.timeout(p, cfg.useMs, "use(" + name + ")").then(null, function () {
        p.then(function (v) {
          var key = name === "permissions" ? "perms" : name;
          if (v && !rt[key]) { rt[key] = v; if (rt.onLate) rt.onLate(name); }
        });
        return null;
      });
    } catch (e) { return Promise.resolve(null); }
  }
  rt.init = function () {
    return Promise.all([use("mcp"), use("sample"), use("db"), use("permissions")]).then(function (r) {
      rt.mcp = r[0]; rt.sample = r[1]; rt.db = r[2]; rt.perms = r[3]; rt.inited = true;
      return rt.checkTools();
    }).then(function () { return rt; });
  };
  /* Page tools for Claude (sample options.tools) exist only where
     sample.limits() reports them. Ask Claude needs them. */
  rt.tools = false;
  rt.checkTools = function () {
    rt.tools = false;
    if (!rt.sample || typeof rt.sample.limits !== "function") return Promise.resolve(false);
    return rt.timeout(Promise.resolve().then(function () { return rt.sample.limits(); }), cfg.callMs, "sample.limits").then(function (l) {
      rt.tools = !!(l && l.tools); return rt.tools;
    }, function () { return false; });
  };
  rt.retryUse = function (name) {
    return use(name).then(function (v) { if (v) rt[name] = v; return v; });
  };

  /* ---------- Permissions (built in; reading never prompts) ---------- */
  rt.PERM_NAMES = ["mcp", "sample", "db"];
  /* {mcp, sample, db, servers: {"Microsoft 365": state, ...}} or null when
     the permissions capability isn't here. Absent keys are "unavailable". */
  rt.permState = function () {
    if (!rt.perms || typeof rt.perms.state !== "function") return Promise.resolve(null);
    return rt.timeout(Promise.resolve().then(function () { return rt.perms.state(); }), cfg.callMs, "permissions.state").then(function (map) {
      map = map && typeof map === "object" ? map : {};
      var out = { servers: {} };
      rt.PERM_NAMES.forEach(function (n) { out[n] = typeof map[n] === "string" ? map[n] : "unavailable"; });
      Object.keys(map).forEach(function (k) { if (k.indexOf("mcp:") === 0) out.servers[k.slice(4)] = map[k]; });
      return out;
    }, function () { return null; });
  };
  /* One batched dialog for the names still at "prompt". Never loops: the
     caller calls it once, from a click. The promise can stay pending as
     long as the viewer takes to decide. */
  rt.permRequest = function (names) {
    if (!rt.perms || typeof rt.perms.request !== "function") return Promise.resolve(null);
    return Promise.resolve().then(function () { return rt.perms.request(names); }).then(function (m) { return m || {}; }, function () { return null; });
  };

  /* Tools that change something. Never aborted, never retried on their own. */
  var WRITE_RE = /create|send|update|delete|forward|addComment|modify|respond|trash|move|rename|upload|copy|set_|transition|edit/i;
  rt.isWriteTool = function (tool) { return WRITE_RE.test(String(tool || "")); };

  /* One connector call. Rejects with an McpError-shaped object. A call
     with no answer within its timeout (options.timeoutMs, default
     cfg.callMs) rejects {code: "timeout"}: a failure for a read, an
     unclear outcome for a write (never retried automatically). A read is
     also aborted then; a write never is. */
  /* The SHAPE of each tool's last raw answer (keys and types only), for diagnostics. */
  rt.raw = {};
  rt.call = function (tool, input, options) { return rt.callOn(rt.SERVER, tool, input, options); };
  /* The same, on another connector (Atlassian Rovo). */
  rt.callOn = function (server, tool, input, options) {
    if (!rt.mcp || typeof rt.mcp.callTool !== "function") {
      return Promise.reject({ code: "not_granted", message: "Connectors are not available in this view." });
    }
    var ms = options && options.timeoutMs || cfg.callMs, opts = options ? Object.assign({}, options) : undefined, ctl = null;
    if (opts) delete opts.timeoutMs;
    if (!rt.isWriteTool(tool) && typeof AbortController === "function" && !(opts && opts.signal)) {
      ctl = new AbortController();
      opts = Object.assign({}, opts || {}, { signal: ctl.signal });
    }
    try {
      var p = Promise.resolve(rt.mcp.callTool(server, tool, input || {}, opts)).then(function (res) {
        rt.raw[tool] = U().shapeOf(res);
        if (res && res.isError) throw { code: "tool_error", message: U().clip(U().resultText(res), 200) || "The tool reported a failure.", result: res };
        return U().clone(res); /* mcp results are frozen */
      }, function (e) {
        /* A tool failure rejects with code tool_error and the tool's own
           envelope on .result: prefer its words over a generic message. */
        var code = e && typeof e === "object" && e.code ? String(e.code) : "upstream_error";
        var msg = e && typeof e === "object" ? String(e.message || "") : String(e || "");
        var own = e && e.result ? U().clip(U().resultText(e.result), 200) : "";
        throw { code: code, message: own || U().clip(msg, 200), retryable: !!(e && e.retryable), result: e && e.result };
      });
      return rt.timeout(p, ms, server + " " + tool).then(null, function (e) {
        if (e && e.code === "timeout" && ctl) { try { ctl.abort(); } catch (x) { /* ignore */ } }
        throw e;
      });
    } catch (e) { return Promise.reject({ code: "upstream_error", message: String(e && e.message || e) }); }
  };
  /* sample.json with a timeout (Claude may think up to two minutes). */
  rt.sampleJson = function (input, options, ms) {
    if (!rt.sample || typeof rt.sample.json !== "function") return Promise.reject({ code: "not_granted" });
    var p;
    try { p = Promise.resolve(rt.sample.json(input, options)).then(function (v) { return U().clone(v); }); } catch (e) { return Promise.reject(e); }
    return rt.timeout(p, ms || cfg.sampleMs, "Claude");
  };
  function U() { return D.util; }

  /* Codes after which we know the call did NOT take effect (or the tool
     itself reported failure). Anything else is an unclear outcome. */
  var CLEAR = ["tool_error", "bad_request", "not_in_manifest", "blocked_by_policy", "approval_required",
    "needs_reauth", "server_not_connected", "selection_required", "server_not_found", "not_granted",
    "capability_disabled", "capability_removed", "transform_error", "consent_required", "user_changed"];
  rt.isClear = function (e) { return !!(e && CLEAR.indexOf(e.code) >= 0); };

  /* Plain words for a connector failure; never the raw message for auth states. */
  rt.mcpCopy = function (e, what) {
    var code = e && e.code;
    if (code === "needs_reauth") return "Reconnect Microsoft 365 in claude.ai Settings → Connectors.";
    if (code === "server_not_connected" || code === "server_not_found") return "Add Microsoft 365 in claude.ai Settings → Connectors.";
    if (code === "selection_required") return "Choose which Microsoft 365 connector to use, then try again.";
    if (code === "not_in_manifest" || code === "consent_required") return "Microsoft 365 isn’t allowed for this page yet.";
    if (code === "blocked_by_policy" || code === "approval_required") return "Your organisation blocks this Outlook action here.";
    if (code === "not_granted" || code === "capability_disabled" || code === "capability_removed") return "Outlook isn’t available in this view.";
    if (code === "timeout") return "Couldn’t reach " + (what || "Outlook") + ": no answer in time.";
    return "Couldn’t reach " + (what || "Outlook") + " just now.";
  };
  rt.sampleCopy = function (e) {
    var code = e && e.code;
    if (code === "not_granted" || code === "sampling_disabled" || code === "not_declared" ||
        code === "capability_disabled" || code === "capability_removed") return "Claude isn’t available here";
    if (code === "rate_limited") return "Claude is busy";
    if (code === "timeout") return "Claude didn’t answer in time";
    if (code === "session_expired") return "Sign in to claude.ai again to use Claude";
    if (code === "invalid_json" || code === "refused" || code === "empty_completion") return "Claude’s answer couldn’t be read";
    return "Claude couldn’t answer just now";
  };
})(window.Droplet = window.Droplet || {});
