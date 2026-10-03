/* Droplet · the claude.ai runtime: capabilities and connector calls.
   Every capability may be null; callers design for that. */
(function (D) {
  "use strict";
  var rt = D.rt = { mcp: null, sample: null, db: null, inited: false };
  rt.SERVER = "Microsoft 365";

  function use(name) {
    try {
      if (!window.claude || typeof window.claude.use !== "function") return Promise.resolve(null);
      return Promise.resolve(window.claude.use(name)).then(function (v) { return v || null; }, function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }
  rt.init = function () {
    return Promise.all([use("mcp"), use("sample"), use("db")]).then(function (r) {
      rt.mcp = r[0]; rt.sample = r[1]; rt.db = r[2]; rt.inited = true;
      return rt.checkTools();
    }).then(function () { return rt; });
  };
  /* Page tools for Claude (sample options.tools) exist only where
     sample.limits() reports them. Ask Claude needs them. */
  rt.tools = false;
  rt.checkTools = function () {
    rt.tools = false;
    if (!rt.sample || typeof rt.sample.limits !== "function") return Promise.resolve(false);
    return Promise.resolve().then(function () { return rt.sample.limits(); }).then(function (l) {
      rt.tools = !!(l && l.tools); return rt.tools;
    }, function () { return false; });
  };
  rt.retryUse = function (name) {
    return use(name).then(function (v) { if (v) rt[name] = v; return v; });
  };

  /* One connector call. Rejects with an McpError-shaped object. */
  rt.call = function (tool, input, options) { return rt.callOn(rt.SERVER, tool, input, options); };
  /* The same, on another connector (Atlassian Rovo). */
  rt.callOn = function (server, tool, input, options) {
    if (!rt.mcp || typeof rt.mcp.callTool !== "function") {
      return Promise.reject({ code: "not_granted", message: "Connectors are not available in this view." });
    }
    try {
      return Promise.resolve(rt.mcp.callTool(server, tool, input || {}, options)).then(function (res) {
        if (res && res.isError) throw { code: "tool_error", message: U().clip(U().resultText(res), 200) || "The tool reported a failure.", result: res };
        return res;
      }, function (e) {
        /* A tool failure rejects with code tool_error and the tool's own
           envelope on .result: prefer its words over a generic message. */
        var code = e && typeof e === "object" && e.code ? String(e.code) : "upstream_error";
        var msg = e && typeof e === "object" ? String(e.message || "") : String(e || "");
        var own = e && e.result ? U().clip(U().resultText(e.result), 200) : "";
        throw { code: code, message: own || U().clip(msg, 200), retryable: !!(e && e.retryable), result: e && e.result };
      });
    } catch (e) { return Promise.reject({ code: "upstream_error", message: String(e && e.message || e) }); }
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
    return "Couldn’t reach " + (what || "Outlook") + " just now.";
  };
  rt.sampleCopy = function (e) {
    var code = e && e.code;
    if (code === "not_granted" || code === "sampling_disabled" || code === "not_declared" ||
        code === "capability_disabled" || code === "capability_removed") return "Claude isn’t available here";
    if (code === "rate_limited") return "Claude is busy";
    if (code === "session_expired") return "Sign in to claude.ai again to use Claude";
    if (code === "invalid_json" || code === "refused" || code === "empty_completion") return "Claude’s answer couldn’t be read";
    return "Claude couldn’t answer just now";
  };
})(window.Droplet = window.Droplet || {});
