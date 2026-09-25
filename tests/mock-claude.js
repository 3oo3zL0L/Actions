/*
 * mock-claude.js — Playwright init-script dat `window.claude` nabootst
 * volgens docs/contract/*.d.ts (claude.use, mcp, sample, db, permissions).
 *
 * Configuratie per test via `window.__MOCK__` (moet VOOR dit script gezet
 * zijn; wordt lui gelezen, dus een test kan het tijdens de run aanpassen):
 *
 * {
 *   noClaude: false,                    // true: geen window.claude (top-level kopie)
 *   capabilities: { mcp, sample, db, permissions }  // false/ontbrekend key => use() -> null
 *                                        // (ontbreekt het hele object: alles aan)
 *   useDelayMs: 0,                      // vertraging voor use() resolve
 *   connected: ["Microsoft 365", "Atlassian Rovo"], // anders server_not_connected
 *   manifest: { "<server>": ["tool", ...] },        // default = manifest uit BRIEF.md
 *   tools: { "<server>": { "<tool>": Fixture } },
 *   sample: { rules: [SampleRule], default: SampleRule, error: {code,message}, context: {...} },
 *   db: { docs: { "acties/a1": {...} }, failWrites: {code,message} }
 *   comments: null | { canSend?: "available"|"writers_only"|"no_session"|"off",   // default "available"
 *               canSendError?, anchorError?, sendError?, createError? : {code,message} }
 *             // comments-capability (docs/contract/comments.d.ts); null => use("comments") -> null.
 *             // Wordt alleen geserveerd als capabilities.comments aan staat (of capabilities ontbreekt).
 * }
 *
 * Fixture (per tool):
 *   { items: [...], pagination?: object|null }  // M365-vorm: één text-blok per item
 *                                               // + paginatieblok; payload = EERSTE blok
 *   { payload: any }                            // Atlassian-vorm: één text-blok
 *   { text: "..." } | { content: [...] }        // rauw
 *   { error: {code, message, retryable?, retryAfterMs?} }  // reject McpError
 *   { sequence: [Fixture, ...] }                // n-de call krijgt n-de (laatste herhaalt)
 *   + optioneel delayMs
 *
 * SampleRule:
 *   { match?: "regex op invoertekst", text?: "...", chunks?: ["..",".."], json?: any,
 *     thinkMs?: 50, chunkDelayMs?: 40, holdLast?: false,
 *     toolCalls?: [{ tool: "regex op naam/beschrijving", input?: {...}, hints?: {...} }],
 *     error?: {code,message}, errorAfterStream?: {code,message} }
 *
 * Logs voor asserts: window.__MOCK_LOG__ = { mcp, sample, sampleTools, db, comments, violations }
 * Helpers: window.__mockDb.dump(prefix?), window.__mockReleaseSample()
 */
(() => {
  "use strict";
  const cfg = () => window.__MOCK__ || {};

  const DEFAULT_MANIFEST = {
    "Microsoft 365": [
      "outlook_calendar_search", "outlook_email_search", "chat_message_search",
      "teams_list_chats", "read_resource", "outlook_create_reply_draft",
      "teams_send_chat_message", "get_me",
    ],
    "Atlassian Rovo": ["searchJiraIssuesUsingJql", "searchConfluenceUsingCql", "addCommentToJiraIssue"],
  };
  const WRITE_TOOLS = new Set(["outlook_create_reply_draft", "teams_send_chat_message", "addCommentToJiraIssue"]);

  const LOG = (window.__MOCK_LOG__ = {
    mcp: [],          // {via, server, tool, input, t, outcome}
    sample: [],       // {verb, input, toolNames, modelTier, cache, t, outcome}
    sampleTools: [],  // {name, input, result|error}
    db: [],           // {op, path, data}
    comments: [],     // {verb, args, outcome, t}
    violations: [],   // contractschendingen door de pagina (string)
  });

  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const violation = (msg) => { LOG.violations.push(msg); console.warn("[mock-claude] contract: " + msg); };

  function isPlainJson(v, depth = 0) {
    if (depth > 64) return false;
    if (v === null || typeof v === "string" || typeof v === "boolean") return true;
    if (typeof v === "number") return Number.isFinite(v);
    if (Array.isArray(v)) return v.every((x) => isPlainJson(x, depth + 1));
    if (typeof v === "object") {
      const proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== null) return false;
      return Object.values(v).every((x) => x === undefined || isPlainJson(x, depth + 1));
    }
    return false;
  }
  const isPlainObject = (v) =>
    v !== null && typeof v === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(v));

  // ------------------------------------------------------------------ mcp
  const mcpErr = (code, message, extra = {}) => ({ code, message, ...extra });

  function defaultFixture(server, tool) {
    if (WRITE_TOOLS.has(tool)) {
      const id = "mock-" + tool + "-" + (LOG.mcp.length + 1);
      return { payload: { id, webLink: "https://outlook.example.com/owa/?itemid=" + id } };
    }
    if (server === "Microsoft 365") return { items: [], pagination: { moreResults: false } };
    if (tool === "searchJiraIssuesUsingJql") return { payload: { issues: { nodes: [], pageInfo: { hasNextPage: false } } } };
    if (tool === "searchConfluenceUsingCql") return { payload: { content: { totalCount: 0, nodes: [] } } };
    return { payload: {} };
  }

  function tryParse(text) { try { return JSON.parse(text); } catch { return text; } }

  function buildResult(fx) {
    let content;
    if (Array.isArray(fx.items)) {
      content = fx.items.map((it) => ({ type: "text", text: JSON.stringify(it) }));
      const pag = fx.pagination === undefined ? { moreResults: true, nextOffset: fx.items.length } : fx.pagination;
      if (pag) content.push({ type: "text", text: JSON.stringify(pag) });
    } else if ("payload" in fx) {
      content = [{ type: "text", text: JSON.stringify(fx.payload) }];
    } else if (typeof fx.text === "string") {
      content = [{ type: "text", text: fx.text }];
    } else {
      content = clone(fx.content || []);
    }
    const result = { content };
    // payload = structuredContent (nooit bij deze connectors) of EERSTE text-blok geparsed.
    const first = content.find((b) => b.type === "text");
    if (first) result.payload = tryParse(first.text);
    return result;
  }

  function countPrior(server, tool) {
    return LOG.mcp.filter((c) => c.server === server && c.tool === tool).length - 1;
  }

  async function execTool(server, tool, input, via, signal) {
    const entry = { via, server, tool, input: clone(input), t: Date.now(), outcome: "pending" };
    LOG.mcp.push(entry);
    try {
      if (typeof server !== "string" || typeof tool !== "string")
        throw mcpErr("bad_request", "server and tool must be strings");
      if (input !== undefined && !isPlainJson(input))
        throw mcpErr("bad_request", "input is not JSON-serializable");
      const c = cfg();
      const connected = c.connected || Object.keys(DEFAULT_MANIFEST);
      const manifest = c.manifest || DEFAULT_MANIFEST;
      if (!(manifest[server] || []).includes(tool)) {
        violation(`call outside manifest: ${server}/${tool}`);
        throw mcpErr("not_in_manifest", `${tool} is not in this artifact's manifest`, { server });
      }
      if (!connected.includes(server))
        throw mcpErr("server_not_connected", `No connector named ${server}`, { server });
      // Schema-grenzen van de echte connectors (M365 max 25, Jira max 100, Confluence max 250).
      const MAX = { outlook_calendar_search: 25, outlook_email_search: 25, chat_message_search: 25, teams_list_chats: 25 };
      const lim = input && (input.limit != null ? input.limit : input.maxResults);
      const max = MAX[tool] || (tool === "searchJiraIssuesUsingJql" ? 100 : tool === "searchConfluenceUsingCql" ? 250 : null);
      if (max && lim != null && lim > max) {
        violation(`${tool}: limit ${lim} > max ${max}`);
        throw mcpErr("tool_error", `Input validation error: limit must be <= ${max}`, { server });
      }
      let fx = c.tools && c.tools[server] && c.tools[server][tool];
      if (fx && Array.isArray(fx.sequence)) {
        const n = countPrior(server, tool);
        fx = fx.sequence[Math.min(n, fx.sequence.length - 1)];
      }
      if (!fx) fx = defaultFixture(server, tool);
      await sleep(fx.delayMs || 5);
      if (signal && signal.aborted) throw mcpErr("cancelled", "aborted");
      if (fx.error) {
        const e = { server, ...clone(fx.error) };
        if (e.code === "tool_error" && !("result" in e))
          e.result = { content: [{ type: "text", text: e.message || "Tool failed" }], isError: true };
        throw e;
      }
      const res = buildResult(fx);
      entry.outcome = "ok";
      return res;
    } catch (e) {
      entry.outcome = e && e.code ? e.code : "error";
      throw e;
    }
  }

  function callTool(server, tool, input, options) {
    return new Promise((resolve, reject) => {
      if (options !== undefined && !isPlainObject(options)) {
        violation("callTool options not a plain object");
      }
      const signal = options && options.signal;
      let done = false;
      if (signal) {
        if (signal.aborted) return reject(mcpErr("cancelled", "aborted"));
        signal.addEventListener("abort", () => { if (!done) { done = true; reject(mcpErr("cancelled", "aborted")); } });
      }
      queueMicrotask(() => {
        execTool(server, tool, input, "callTool", signal).then(
          (r) => { if (!done) { done = true; resolve(r); } },
          (e) => { if (!done) { done = true; reject(e); } },
        );
      });
    });
  }

  const watchers = new Set();
  function runWatcher(w) {
    execTool(w.server, w.tool, w.input === null ? undefined : w.input, "watchTool").then(
      (result) => { if (w.active) w.handler({ type: "data", result }); },
      (error) => { if (w.active) w.handler({ type: "error", error }); },
    );
  }
  function watchTool(server, tool, input, handler, options) {
    if (typeof handler !== "function") throw new TypeError("watchTool: handler must be a function");
    const w = { server, tool, input: clone(input), handler, active: true, timer: null };
    watchers.add(w);
    queueMicrotask(() => { if (w.active) runWatcher(w); });
    if (options && options.refetchInterval) {
      w.timer = setInterval(() => w.active && runWatcher(w), Math.max(30000, options.refetchInterval));
    }
    return () => { w.active = false; if (w.timer) clearInterval(w.timer); watchers.delete(w); };
  }

  function invalidate(server, tool, input) {
    return new Promise((resolve) => {
      queueMicrotask(() => {
        const key = input === undefined ? undefined : JSON.stringify(input);
        for (const w of watchers) {
          if (server !== undefined && w.server !== server) continue;
          if (tool !== undefined && w.tool !== tool) continue;
          if (key !== undefined && JSON.stringify(w.input) !== key) continue;
          runWatcher(w);
        }
        resolve();
      });
    });
  }

  async function listTools(server) {
    await sleep(1);
    const c = cfg();
    const manifest = c.manifest || DEFAULT_MANIFEST;
    const connected = c.connected || Object.keys(DEFAULT_MANIFEST);
    const servers = Object.keys(manifest)
      .filter((s) => connected.includes(s) && (server === undefined || s === server))
      .map((s) => ({
        server: s,
        kind: "connector",
        authStatus: "connected",
        tools: manifest[s].map((name) => ({
          name, description: "", annotations: { readOnlyHint: !WRITE_TOOLS.has(name) },
        })),
      }));
    return { servers };
  }

  async function serverHandle(name) {
    const { servers } = await listTools(name);
    if (!servers.length) throw mcpErr("server_not_connected", `No connector named ${name}`, { server: name });
    const h = {};
    for (const t of servers[0].tools) {
      h[t.name] = (input, options) =>
        callTool(name, t.name, input, options).then((r) => ("payload" in r ? r.payload : r));
    }
    return Object.freeze(h);
  }

  const mcpNs = Object.freeze({
    callTool,
    watchTool,
    invalidate,
    listTools,
    server: serverHandle,
    describeTool: () => Promise.reject(mcpErr("bad_request", "describeTool is not answered for connectors")),
  });

  // --------------------------------------------------------------- sample
  const sampleErr = (code, message, text) => (text ? { code, message, text } : { code, message });
  const TOOL_NAME_RE = /^[A-Za-z0-9_-]{1,128}$/;

  function inputText(input) {
    return typeof input === "string" ? input : input.map((m) => m.content).join("\n\n");
  }

  function validateSample(input, options) {
    if (typeof input === "string") {
      if (!input.trim()) return "input is empty";
    } else if (Array.isArray(input)) {
      if (!input.length) return "input turn list is empty";
      for (const m of input) {
        if (!m || !["user", "assistant"].includes(m.role)) return "turn with invalid role";
        if (typeof m.content !== "string" || !m.content) return "turn with empty content";
      }
      if (input[0].role !== "user" || input[input.length - 1].role !== "user")
        return "turns must start and end on a user turn";
    } else {
      return "input must be a string or turn list (not {prompt})";
    }
    if (options === undefined) return null;
    if (!isPlainObject(options)) return "options must be a plain object";
    if ("onText" in options && typeof options.onText !== "function") return "onText must be a function";
    if ("signal" in options && !(options.signal instanceof AbortSignal)) return "signal must be an AbortSignal";
    if ("modelTier" in options && !["default", "complex", "quick"].includes(options.modelTier)) return "unknown modelTier";
    if ("tools" in options) {
      if (!Array.isArray(options.tools)) return "tools must be an array";
      const names = new Set();
      for (const t of options.tools) {
        if (!t || !TOOL_NAME_RE.test(t.name || "")) return "tool name invalid";
        if (names.has(t.name)) return "duplicate tool name " + t.name;
        names.add(t.name);
        if (typeof t.description !== "string" || !t.description) return `tool ${t.name}: description required`;
        if (typeof t.execute !== "function") return `tool ${t.name}: execute must be a function`;
        if (t.inputSchema && t.inputSchema.type !== "object") return `tool ${t.name}: inputSchema.type must be "object"`;
      }
      if ("cache" in options && options.cache !== false) return "cache (other than false) with tools";
    }
    if ("cache" in options) {
      const ca = options.cache;
      const ok = ca === true || ca === false || (isPlainObject(ca) && (ca.gcTime === undefined || ca.gcTime > 0));
      if (!ok) return "invalid cache option";
    }
    if (new TextEncoder().encode(inputText(input)).length > 65536) return "__too_large__";
    return null;
  }

  function autoFill(schema, hints) {
    const ctx = Object.assign({}, cfg().sample && cfg().sample.context, hints || {});
    const out = {};
    const props = (schema && schema.properties) || {};
    for (const [key, def] of Object.entries(props)) {
      if (key in ctx) { out[key] = ctx[key]; continue; }
      const k = key.toLowerCase();
      if (/message.?id|mail.?id|email.?id/.test(k)) out[key] = ctx.messageId || "mock-message-id";
      else if (/chat.?id/.test(k)) out[key] = ctx.chatId || "19:mock-chat";
      else if (/issue|key/.test(k)) out[key] = ctx.issueKey || "PCORE-101";
      else if (/cloud/.test(k)) out[key] = "mock-cloud";
      else if (/body|text|comment|content|message|tekst|antwoord/.test(k)) out[key] = ctx.body || "Mock-concept van Claude.";
      else if (def && Array.isArray(def.enum)) out[key] = def.enum[0];
      else if (def && def.type === "number") out[key] = 1;
      else if (def && def.type === "boolean") out[key] = false;
      else if (def && def.type === "array") out[key] = [];
      else if (def && def.type === "object") out[key] = {};
      else out[key] = ctx[key] || "mock";
    }
    return out;
  }

  function splitText(t) {
    const parts = t.match(/\S+\s*/g) || [t];
    const chunks = [];
    for (let i = 0; i < parts.length; i += 3) chunks.push(parts.slice(i, i + 3).join(""));
    return chunks;
  }

  const releasers = [];
  window.__mockReleaseSample = () => { while (releasers.length) releasers.shift()(); };

  function runSample(verb, input, options) {
    return new Promise((resolve, reject) => {
      const bad = validateSample(input, options);
      const entry = {
        verb,
        input: clone(input),
        toolNames: options && Array.isArray(options.tools) ? options.tools.map((t) => t && t.name) : [],
        modelTier: options && options.modelTier,
        cache: options && "cache" in options ? clone(options.cache) : undefined,
        streamed: false,
        t: Date.now(),
        outcome: "pending",
      };
      LOG.sample.push(entry);
      if (bad) {
        entry.outcome = bad === "__too_large__" ? "prompt_too_large" : "invalid_request";
        if (bad !== "__too_large__") violation("sample: " + bad);
        return queueMicrotask(() => reject(sampleErr(entry.outcome, bad)));
      }
      const signal = options && options.signal;
      const onText = options && options.onText;
      let text = "";
      let settled = false;
      const fail = (e) => { if (!settled) { settled = true; entry.outcome = e.code; reject(e); } };
      const ok = (v) => { if (!settled) { settled = true; entry.outcome = "ok"; resolve(v); } };
      if (signal) {
        if (signal.aborted) return queueMicrotask(() => fail(sampleErr("cancelled", "aborted")));
        signal.addEventListener("abort", () => fail(sampleErr("cancelled", "aborted", text || undefined)));
      }
      const emit = (delta) => {
        if (settled || !delta) return;
        text += delta;
        entry.streamed = true;
        if (onText) {
          try { onText({ text, delta }); } catch (err) { console.warn("[mock-claude] onText threw", err); }
        }
      };

      (async () => {
        await sleep(0); // nooit synchroon
        const sc = cfg().sample || {};
        if (sc.error) return fail(clone(sc.error));
        const txt = inputText(input);
        const rules = sc.rules || [];
        const rule = rules.find((r) => !r.match || new RegExp(r.match, "i").test(txt)) ||
          sc.default || { text: "Mock-antwoord van Claude." };
        await sleep(rule.thinkMs == null ? 50 : rule.thinkMs);
        if (settled) return;
        if (rule.error) return fail(clone(rule.error));

        const tools = (options && options.tools) || [];
        for (const tc of rule.toolCalls || []) {
          const re = new RegExp(tc.tool, "i");
          const tool = tools.find((t) => re.test(t.name)) || tools.find((t) => re.test(t.description || ""));
          if (!tool) {
            LOG.sampleTools.push({ name: null, wanted: tc.tool, error: "no matching page tool" });
            continue;
          }
          const tin = tc.input ? clone(tc.input) : autoFill(tool.inputSchema, tc.hints);
          const rec = { name: tool.name, input: tin };
          LOG.sampleTools.push(rec);
          const ctl = new AbortController();
          if (signal) signal.addEventListener("abort", () => ctl.abort());
          try {
            const r = await tool.execute(tin, { signal: ctl.signal });
            rec.result = clone(r === undefined ? null : r);
          } catch (err) {
            rec.error = "Error: " + (err && err.message ? err.message : String(err));
          }
          if (settled) return;
        }

        let chunks = rule.chunks || splitText(
          rule.text != null ? rule.text : rule.json !== undefined ? JSON.stringify(rule.json) : "Mock-antwoord van Claude.");
        chunks = chunks.filter(Boolean);
        for (let i = 0; i < chunks.length; i++) {
          if (settled) return;
          if (rule.holdLast && i === chunks.length - 1) {
            await new Promise((r) => releasers.push(r));
            if (settled) return;
          }
          emit(chunks[i]);
          await sleep(rule.chunkDelayMs == null ? 40 : rule.chunkDelayMs);
        }
        if (rule.errorAfterStream) return fail({ ...clone(rule.errorAfterStream), text });
        if (verb === "json") {
          if (rule.json !== undefined) return ok(clone(rule.json));
          try { return ok(JSON.parse(text)); } catch {
            const m = text.match(/[[{][\s\S]*[\]}]/);
            if (m) { try { return ok(JSON.parse(m[0])); } catch {} }
            return fail(sampleErr("invalid_json", "no JSON in reply", text));
          }
        }
        ok({ text, truncated: false, modelTierApplied: (options && options.modelTier) || "default" });
      })().catch((e) => fail(sampleErr("upstream_error", String(e && e.message || e))));
    });
  }

  function sample(input, options) { return runSample("text", input, options); }
  sample.json = (input, options) => runSample("json", input, options);
  sample.limits = () => Promise.resolve({ maxPromptBytes: 65536, tools: { maxCount: 20 } });
  Object.freeze(sample);

  // ------------------------------------------------------------------- db
  const SEG_RE = /^[A-Za-z0-9_\-.~:@+]+$/;
  function checkPath(path, wantEven) {
    if (typeof path !== "string" || !path) throw new TypeError("path must be a non-empty string");
    const segs = path.split("/");
    if (segs.length > 16) throw new TypeError("too many segments");
    for (const s of segs) {
      if (!SEG_RE.test(s) || s === "." || s === "..") throw new TypeError(`invalid path segment "${s}"`);
    }
    if ((segs.length % 2 === 0) !== wantEven)
      throw new TypeError(`${wantEven ? "document" : "collection"} path needs an ${wantEven ? "even" : "odd"} number of segments (got ${segs.length})`);
    return segs;
  }

  const store = new Map();
  for (const [p, d] of Object.entries((cfg().db && cfg().db.docs) || {})) store.set(p, clone(d));
  let idSeq = 0;
  const newId = () => "mock" + Date.now().toString(36) + (++idSeq).toString(36);
  const dbErr = (code, message) => ({ code, message });
  const deepFreeze = (o) => { if (o && typeof o === "object") { Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; };
  const META = Object.freeze({ fromCache: false, hasPendingWrites: false });

  function docSnap(path) {
    const id = path.split("/").pop();
    const exists = store.has(path);
    const body = exists ? deepFreeze(clone(store.get(path))) : undefined;
    return Object.freeze({ id, exists, data: () => body, metadata: META, _path: path });
  }

  function mergeDeep(target, src) {
    for (const [k, v] of Object.entries(src)) {
      if (isPlainObject(v) && isPlainObject(target[k])) mergeDeep(target[k], v);
      else target[k] = clone(v);
    }
    return target;
  }

  const listeners = new Set();
  let notifyQueued = false;
  function notify() {
    if (notifyQueued) return;
    notifyQueued = true;
    setTimeout(() => { notifyQueued = false; for (const l of [...listeners]) l.run(); }, 0);
  }

  function writeGuard() {
    const f = cfg().db && cfg().db.failWrites;
    if (f) throw clone(f);
  }

  function docRef(path) {
    checkPath(path, true);
    const ref = {
      id: path.split("/").pop(),
      path,
      get: async () => { await sleep(1); return docSnap(path); },
      set: async (data) => {
        await sleep(1);
        if (!isPlainObject(data) || !isPlainJson(data)) throw dbErr("invalid_argument", "body must be a plain JSON object");
        writeGuard();
        LOG.db.push({ op: "set", path, data: clone(data) });
        store.set(path, clone(data));
        notify();
      },
      update: async (data) => {
        await sleep(1);
        if (!isPlainObject(data) || !isPlainJson(data)) throw dbErr("invalid_argument", "body must be a plain JSON object");
        if (!store.has(path)) throw dbErr("invalid_argument", "update requires an existing document");
        writeGuard();
        LOG.db.push({ op: "update", path, data: clone(data) });
        store.set(path, mergeDeep(clone(store.get(path)), data));
        notify();
      },
      delete: async () => {
        await sleep(1);
        writeGuard();
        LOG.db.push({ op: "delete", path });
        store.delete(path);
        notify();
      },
      acquire: async (o) => ({ acquired: true, version: 1, holder: o && o.holder,
        expiresAt: new Date(Date.now() + ((o && o.ttlMs) || 30000)).toISOString() }),
      onSnapshot: (next, error) => {
        let last;
        const l = {
          run: () => {
            const s = docSnap(path);
            const key = JSON.stringify([s.exists, s.data()]);
            if (key === last) return;
            last = key;
            try { next(s); } catch (e) { console.error(e); }
          },
        };
        listeners.add(l);
        queueMicrotask(() => listeners.has(l) && l.run());
        return () => listeners.delete(l);
      },
      collection: (sub) => collRef(path + "/" + sub),
    };
    return Object.freeze(ref);
  }

  const OPS = {
    "==": (a, b) => JSON.stringify(a) === JSON.stringify(b),
    "!=": (a, b) => JSON.stringify(a) !== JSON.stringify(b),
    "<": (a, b) => a < b, "<=": (a, b) => a <= b, ">": (a, b) => a > b, ">=": (a, b) => a >= b,
    "in": (a, b) => Array.isArray(b) && b.some((x) => OPS["=="](a, x)),
    "not-in": (a, b) => Array.isArray(b) && !b.some((x) => OPS["=="](a, x)),
    "array-contains": (a, b) => Array.isArray(a) && a.some((x) => OPS["=="](x, b)),
  };

  function makeQuery(collPath, q) {
    const run = () => {
      const depth = collPath.split("/").length + 1;
      let paths = [...store.keys()].filter((p) => p.startsWith(collPath + "/") && p.split("/").length === depth);
      paths.sort();
      for (const [f, op, v] of q.where) paths = paths.filter((p) => { const d = store.get(p); return f in d && OPS[op](d[f], v); });
      if (q.order) {
        const [f, dir] = q.order;
        paths.sort((a, b) => {
          const x = store.get(a)[f], y = store.get(b)[f];
          if (x === undefined && y === undefined) return 0;
          if (x === undefined) return 1;
          if (y === undefined) return -1;
          const c = x < y ? -1 : x > y ? 1 : 0;
          return dir === "desc" ? -c : c;
        });
      }
      if (q.limit) paths = paths.slice(0, q.limit);
      return paths.map(docSnap);
    };
    const qsnap = (docs, prev) => {
      const prevIds = prev ? prev.map((d) => d._path) : [];
      const changes = [];
      docs.forEach((d, i) => {
        const oi = prevIds.indexOf(d._path);
        if (oi < 0) changes.push({ type: "added", doc: d, oldIndex: -1, newIndex: i });
        else if (JSON.stringify(prev[oi].data()) !== JSON.stringify(d.data()) || oi !== i)
          changes.push({ type: "modified", doc: d, oldIndex: oi, newIndex: i });
      });
      (prev || []).forEach((d, oi) => {
        if (!docs.some((x) => x._path === d._path)) changes.push({ type: "removed", doc: d, oldIndex: oi, newIndex: -1 });
      });
      return Object.freeze({ docs, size: docs.length, empty: !docs.length, docChanges: () => changes, metadata: META });
    };
    const api = {
      where: (f, op, v) => {
        if (!(op in OPS)) throw new TypeError("unknown operator " + op);
        if (q.where.length >= 10) throw new TypeError("too many filters");
        return makeQuery(collPath, { ...q, where: [...q.where, [f, op, v]] });
      },
      orderBy: (f, dir = "asc") => makeQuery(collPath, { ...q, order: [f, dir] }),
      limit: (n) => makeQuery(collPath, { ...q, limit: n }),
      get: async () => { await sleep(1); return qsnap(run(), null); },
      onSnapshot: (next, error) => {
        let prev = null, lastKey;
        const l = {
          run: () => {
            const docs = run();
            const key = JSON.stringify(docs.map((d) => [d._path, d.data()]));
            if (key === lastKey) return;
            lastKey = key;
            const s = qsnap(docs, prev);
            prev = docs;
            try { next(s); } catch (e) { console.error(e); }
          },
        };
        listeners.add(l);
        queueMicrotask(() => listeners.has(l) && l.run());
        return () => listeners.delete(l);
      },
    };
    return api;
  }

  function collRef(path) {
    checkPath(path, false);
    const q = makeQuery(path, { where: [], order: null, limit: 0 });
    return Object.freeze({
      ...q,
      path,
      doc: (id) => docRef(path + "/" + (id === undefined ? newId() : id)),
      add: async (data) => { const r = docRef(path + "/" + newId()); await r.set(data); return r; },
    });
  }

  const dbNs = Object.freeze({ doc: docRef, collection: collRef });
  window.__mockDb = {
    dump: (prefix = "") => Object.fromEntries([...store].filter(([p]) => p.startsWith(prefix)).map(([p, d]) => [p, clone(d)])),
  };

  // ---------------------------------------------------------- permissions
  const permNs = Object.freeze({
    state: (name) => Promise.resolve(name === undefined ? { mcp: "granted", sample: "granted", db: "granted" } : "granted"),
    request: (names) => Promise.resolve(Object.fromEntries((names || ["mcp", "sample", "db"]).map((n) => [n, "granted"]))),
  });

  // ------------------------------------------------------------- comments
  const cErr = (code, message) => ({ code, message });
  const commentsCfg = () => (cfg().comments && typeof cfg().comments === "object" ? cfg().comments : {});
  let threadSeq = 0;
  function isAnchor(a) {
    return isPlainObject(a) && typeof a.path === "string" && Number.isFinite(a.x) && Number.isFinite(a.y);
  }
  function checkText(text) {
    if (typeof text !== "string" || !text.trim()) return "empty text";
    if (new TextEncoder().encode(text).length > 4096) return "text over 4 KiB";
    if (/[\u0000-\u0008\u000B-\u001F\u007F]/.test(text)) return "control characters";
    return null;
  }
  function cCall(verb, args, fn) {
    const entry = { verb, args: clone(args), outcome: "pending", t: Date.now() };
    LOG.comments.push(entry);
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        try {
          const r = fn();
          entry.outcome = "ok"; entry.result = clone(r); resolve(r);
        } catch (e) { entry.outcome = e && e.code ? e.code : "error"; reject(e); }
      }, 2);
    });
  }
  const commentsNs = Object.freeze({
    canSendToClaude: () => cCall("canSendToClaude", null, () => {
      const c = commentsCfg();
      if (c.canSendError) throw clone(c.canSendError);
      return c.canSend || "available";
    }),
    anchorFor: (el) => {
      const ok = el instanceof Element && document.contains(el);
      const path = ok ? (el.id ? "#" + el.id : el.tagName.toLowerCase()) : null;
      return cCall("anchorFor", { path }, () => {
        const c = commentsCfg();
        if (c.anchorError) throw clone(c.anchorError);
        if (!ok) throw cErr("invalid", "anchorFor: element not attached to the document");
        const r = el.getBoundingClientRect();
        return { path, x: Math.round(r.left + r.width / 2 + scrollX), y: Math.round(r.top + r.height / 2 + scrollY) };
      });
    },
    sendToClaude: (target) => cCall("sendToClaude", target, () => {
      const c = commentsCfg();
      if (!isPlainObject(target)) { violation("comments.sendToClaude: target not a plain object"); throw cErr("invalid", "target"); }
      const hasA = "anchor" in target, hasT = "threadId" in target;
      if (hasA === hasT) { violation("comments.sendToClaude: exactly one of anchor/threadId"); throw cErr("invalid", "target"); }
      if (hasA && !isAnchor(target.anchor)) { violation("comments.sendToClaude: malformed anchor"); throw cErr("invalid", "anchor"); }
      const bad = checkText(target.text);
      if (bad) { violation("comments.sendToClaude: " + bad); throw cErr("invalid", bad); }
      if (c.sendError) throw clone(c.sendError);
      if ((c.canSend || "available") !== "available") throw cErr("claude_unavailable", "cannot send to Claude from this view");
      const threadId = hasT ? target.threadId : "thread-" + (++threadSeq);
      return { threadId, commentId: "comment-" + threadSeq };
    }),
    create: (opts) => cCall("create", opts, () => {
      const c = commentsCfg();
      if (!isPlainObject(opts) || !isAnchor(opts.anchor)) throw cErr("invalid", "anchor");
      const bad = checkText(opts.text); if (bad) throw cErr("invalid", bad);
      if (c.createError) throw clone(c.createError);
      return { threadId: "thread-" + (++threadSeq), commentId: "comment-" + threadSeq };
    }),
    reply: (threadId, text) => cCall("reply", { threadId, text }, () => {
      const bad = checkText(text); if (bad) throw cErr("invalid", bad);
      return { commentId: "comment-" + (++threadSeq) };
    }),
    openComposer: (target) => cCall("openComposer", null, () => {
      const el = target && (target.element || (target.range && target.range.startContainer));
      if (!el || !document.contains(el)) throw cErr("invalid", "target");
      return { opened: true };
    }),
    resolve: (threadId, resolved) => cCall("resolve", { threadId, resolved }, () => undefined),
    delete: (threadId) => cCall("delete", { threadId }, () => undefined),
    customAnchors: () => cCall("customAnchors", null, () => { throw cErr("not_granted", "customAnchors not declared"); }),
  });

  // ------------------------------------------------------------------ use
  const NAMESPACES = { mcp: mcpNs, sample, db: dbNs, permissions: permNs, comments: commentsNs };
  const memo = {};
  function use(name) {
    const c = cfg();
    const caps = c.capabilities || { mcp: true, sample: true, db: true, permissions: true, comments: true };
    const served = typeof name === "string" && NAMESPACES[name] && caps[name] && !(name === "comments" && c.comments === null);
    if (!served) return new Promise((r) => setTimeout(() => r(null), c.useDelayMs || 0));
    if (!memo[name]) memo[name] = new Promise((r) => setTimeout(() => r(NAMESPACES[name]), c.useDelayMs || 0));
    return memo[name];
  }

  if (!cfg().noClaude) {
    Object.defineProperty(window, "claude", { value: Object.freeze({ use }), writable: false, configurable: false });
  }
})();
