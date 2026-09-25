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
 *   sample: { rules: [SampleRule], default: SampleRule, error: {code,message}, context: {...},
 *             toolsMax?: number (default 8; 0 = geen tools), allowSameRoleTurns?: boolean },
 *   db: { docs: { "acties/a1": {...} }, failWrites: {code,message}, persist?: false }
 *        // De store overleeft een herlaad binnen dezelfde test (sessionStorage), zoals de echte db;
 *        // persist: false zet dat uit.
 *   werk: { … }                        // B6: staat voor Jira-detail/transities/personen/projecten/Confluence
 *                                        // (tests/fixtures/werk.js, werkState()); zie blok "B6 Werk" hieronder.
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
 *   { match?: "regex op invoertekst", text?: "...", chunks?: ["..",".."], json?: any, tierApplied?: "quick"|"default"|"complex",
 *     errorIfTools?: {code,message},       // fout alleen als de call tools meestuurt
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

  // Default-manifest = de allowlists van de Claude-taakmodus (ronde 7), zoals de PO publiceert.
  const M365_READ = ["outlook_calendar_search", "outlook_email_search", "chat_message_search", "teams_list_chats", "teams_list_teams",
    "teams_list_channels", "teams_list_channel_messages", "read_resource", "get_me", "search_people", "find_meeting_availability", "outlook_find_available_time"];
  const M365_WRITE = ["teams_send_chat_message", "teams_create_chat", "teams_send_channel_message", "teams_reply_channel_message", "outlook_create_event",
    "outlook_update_event", "outlook_respond_to_event", "outlook_send_mail", "outlook_create_draft", "outlook_create_reply_draft", "outlook_create_reply_all_draft",
    "outlook_update_draft", "outlook_send_draft", "outlook_forward_mail", "outlook_modify_labels"];
  const ATL_READ = ["searchJiraIssuesUsingJql", "searchConfluenceUsingCql", "getJiraIssue", "getConfluencePage", "getConfluenceSpaces", "getPagesInConfluenceSpace",
    "getVisibleJiraProjects", "getTransitionsForJiraIssue", "lookupJiraAccountId", "getJiraProjectIssueTypesMetadata", "search"];
  const ATL_WRITE = ["addCommentToJiraIssue", "createJiraIssue", "editJiraIssue", "transitionJiraIssue", "createConfluencePage", "updateConfluencePage", "createConfluenceFooterComment"];
  const DEFAULT_MANIFEST = {
    "Microsoft 365": [...M365_READ, ...M365_WRITE],
    "Atlassian Rovo": [...ATL_READ, ...ATL_WRITE],
  };
  const WRITE_TOOLS = new Set([...M365_WRITE, ...ATL_WRITE]);
  window.__MOCK_MANIFEST__ = { read: { "Microsoft 365": M365_READ, "Atlassian Rovo": ATL_READ }, write: { "Microsoft 365": M365_WRITE, "Atlassian Rovo": ATL_WRITE } };

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

  // ======================= B6 Werk: Jira-detail en Confluence (begin) ================  // Staat per pagina uit __MOCK__.werk (tests/fixtures/werk.js). Alleen actief als er voor de tool geen
  // eigen fixture in __MOCK__.tools staat. Vormen zoals de echte Atlassian Rovo-connector.
  const WERK_TOOLS = new Set(["getJiraIssue", "getTransitionsForJiraIssue", "transitionJiraIssue", "addCommentToJiraIssue",
    "editJiraIssue", "lookupJiraAccountId", "getVisibleJiraProjects", "getJiraProjectIssueTypesMetadata", "createJiraIssue", "getConfluencePage"]);
  let werkState = null;
  function werkS() { if (!werkState) werkState = clone(cfg().werk); return werkState; }
  const toolErr = (message) => ({ error: { code: "tool_error", message } });
  function werkPerson(W, id) {
    const u = (W.users || []).find((x) => x.accountId === id);
    return u ? { accountId: u.accountId, displayName: u.displayName, emailAddress: u.email, active: true, accountType: "atlassian" } : null;
  }
  function werkIssue(W, key) {
    const i = W.issues[key];
    if (!i) return null;
    return {
      expand: "renderedFields,names,schema", id: i.id, key, self: "https://api.example.com/rest/api/3/issue/" + i.id,
      fields: {
        summary: i.summary, description: i.description || null, status: clone(i.status), assignee: werkPerson(W, i.assignee),
        reporter: werkPerson(W, i.reporter), priority: i.priority ? { name: i.priority } : null, issuetype: { name: i.issuetype },
        project: { key: i.project[0], name: i.project[1] }, created: i.created, updated: i.updated,
        comment: { comments: (i.comments || []).map((c) => ({ id: c.id, author: werkPerson(W, c.author), body: c.body, created: c.created, updated: c.created })),
          total: (i.comments || []).length, startAt: 0, maxResults: (i.comments || []).length },
      },
      webUrl: W.site + "/browse/" + key,
    };
  }
  function werkFixture(tool, input) {
    const W = werkS();
    const inp = input || {};
    const key = inp.issueIdOrKey;
    const ctx = { atlassianAccountId: W.me, cloudId: inp.cloudId, toolName: tool };
    if (["getJiraIssue", "getTransitionsForJiraIssue", "transitionJiraIssue", "addCommentToJiraIssue", "editJiraIssue"].includes(tool) && !W.issues[key])
      return toolErr("Issue does not exist or you do not have permission to see it.");
    switch (tool) {
      case "getJiraIssue": {
        const f = inp.fields || [];
        const issue = werkIssue(W, key);
        if (!f.includes("comment")) delete issue.fields.comment; // zoals echt: commentaar alleen op verzoek
        return { payload: { issues: { nodes: [issue] }, context: ctx } };
      }
      case "getTransitionsForJiraIssue":
        return { payload: { transitions: clone(W.transitionsByStatus[W.issues[key].status.name] || []) } };
      case "transitionJiraIssue": {
        const id = inp.transition && inp.transition.id;
        const t = (W.transitionsByStatus[W.issues[key].status.name] || []).find((x) => x.id === id);
        if (!t) return toolErr("Transition id '" + id + "' is not valid for this issue.");
        W.issues[key].status = clone(t.to);
        W.issues[key].updated = new Date().toISOString();
        return { payload: { success: true, issueIdOrKey: key } };
      }
      case "addCommentToJiraIssue": {
        if (inp.contentFormat !== "markdown") violation("addCommentToJiraIssue zonder contentFormat markdown");
        if (!inp.commentBody || !String(inp.commentBody).trim()) return toolErr("commentBody is required");
        const c = { id: "c" + (Date.now() % 100000), author: W.me, created: new Date().toISOString(), body: String(inp.commentBody) };
        W.issues[key].comments.push(c);
        return { payload: { id: c.id, self: "https://api.example.com/rest/api/3/issue/" + W.issues[key].id + "/comment/" + c.id, body: c.body, created: c.created, author: werkPerson(W, W.me) } };
      }
      case "editJiraIssue": {
        const a = inp.fields && inp.fields.assignee;
        if (a !== undefined) {
          if (a && !(W.users || []).some((u) => u.accountId === a.accountId)) return toolErr("User '" + (a && a.accountId) + "' does not exist.");
          W.issues[key].assignee = a ? a.accountId : null;
        }
        W.issues[key].updated = new Date().toISOString();
        return { payload: { success: true, key } };
      }
      case "lookupJiraAccountId": {
        const q = String(inp.searchString || "").toLowerCase();
        const hits = (W.users || []).filter((u) => q && (u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)));
        return { payload: { data: { users: { users: hits.map((u) => ({ accountId: u.accountId, accountType: "atlassian", displayName: u.displayName,
          html: "<strong>" + u.displayName + "</strong> - " + u.email })), total: hits.length, header: "Showing " + hits.length + " of " + hits.length + " matching users" },
          groups: { header: "Showing 0 of 0 matching groups", total: 0, groups: [] } }, statusCode: 200 } };
      }
      case "getVisibleJiraProjects": {
        const max = inp.maxResults == null ? 50 : inp.maxResults, start = inp.startAt || 0;
        if (max > 50) { violation("getVisibleJiraProjects: maxResults " + max + " > 50"); return toolErr("maxResults must be <= 50"); }
        const q = String(inp.searchString || "").toLowerCase();
        const all = W.projects.filter((p) => !q || p.name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q));
        const page = all.slice(start, start + max);
        return { payload: { self: "https://api.example.com/rest/api/3/project/search", maxResults: max, startAt: start, total: all.length, isLast: start + max >= all.length,
          values: page.map((p) => ({ expand: "description,lead,issueTypes", self: "https://api.example.com/rest/api/3/project/" + p.id, id: p.id, key: p.key, name: p.name,
            issueTypes: inp.expandIssueTypes === false ? undefined : clone(W.issueTypes), projectTypeKey: "software" })) } };
      }
      case "getJiraProjectIssueTypesMetadata": {
        if (!W.projects.some((p) => p.key === inp.projectIdOrKey || p.id === inp.projectIdOrKey)) return toolErr("No project could be found with key '" + inp.projectIdOrKey + "'.");
        return { payload: { startAt: 0, maxResults: 50, total: W.issueTypes.length, issueTypes: clone(W.issueTypes) } };
      }
      case "createJiraIssue": {
        if (inp.contentFormat !== "markdown") violation("createJiraIssue zonder contentFormat markdown");
        const p = W.projects.find((x) => x.key === inp.projectKey);
        if (!p) return toolErr("Project '" + inp.projectKey + "' does not exist.");
        if (!W.issueTypes.some((t) => t.name === inp.issueTypeName)) return toolErr("Issue type '" + inp.issueTypeName + "' is not valid for this project.");
        if (!inp.summary || !String(inp.summary).trim()) return toolErr("summary is required");
        W.created = (W.created || 0) + 1;
        const newKey = p.key + "-" + (900 + W.created), id = String(30000 + W.created);
        W.issues[newKey] = { id, summary: inp.summary, description: inp.description || "", status: clone(W.transitionsByStatus["Done"][0].to), assignee: null,
          reporter: W.me, priority: "Major", issuetype: inp.issueTypeName, project: [p.key, p.name], created: new Date().toISOString(), updated: new Date().toISOString(), comments: [] };
        return { payload: { id, key: newKey, self: "https://api.example.com/rest/api/3/issue/" + id } };
      }
      case "getConfluencePage": {
        if (inp.contentFormat !== "markdown") violation("getConfluencePage zonder contentFormat markdown");
        const pg = W.pages[inp.pageId];
        if (!pg) return toolErr("Page not found: " + inp.pageId);
        return { payload: { content: { totalCount: 1, nodes: [{ id: inp.pageId, type: "page", status: "current", title: pg.title, lastModified: pg.lastModified,
          space: clone(pg.space), author: { displayName: pg.author }, body: pg.body,
          _links: { webui: "/spaces/" + pg.space.key + "/pages/" + inp.pageId }, webUrl: W.wiki + "/spaces/" + pg.space.key + "/pages/" + inp.pageId }] } } };
      }
    }
    return null;
  }
  // Zoekresultaat met de actuele status/toewijzing uit de werk-staat (zoals Jira na een transitie).
  function werkSearch(fx) {
    const W = werkS(), out = clone(fx);
    const nodes = out.payload && out.payload.issues && out.payload.issues.nodes;
    (Array.isArray(nodes) ? nodes : []).forEach((n) => {
      const i = n && W.issues[n.key];
      if (!i || !n.fields) return;
      n.fields.status = clone(i.status);
      n.fields.assignee = i.assignee ? { displayName: werkPerson(W, i.assignee).displayName, accountId: i.assignee } : null;
    });
    return out;
  }
  // ======================= B6 Werk: Jira-detail en Confluence (einde) ========================
  // ==== B4 Agenda (additief, begin) =====================================================================
  // Echte vormen en invoergrenzen van outlook_find_available_time, outlook_respond_to_event en
  // outlook_create_event (schema's van de Microsoft 365-connector), plus read_resource per uri.
  //   Fixture per invoer (zelfde vorm als groep A): { byInput: [{ when: { uri: "…" }, ...Fixture }], otherwise?: Fixture }.
  //   Na de merge van groep A doet hun fixtureByInput() dit al vóór deze regel; deze regel is dan een no-op.
  //   Zonder fixture: find_available_time geeft vrije sloten op werkdagen (09:30, 11:00, 14:00, 16:00,
  //   wandklok "W. Europe Standard Time") binnen [afterDateTime, beforeDateTime); respond geeft een tekstblok;
  //   create_event geeft {id, webLink, onlineMeeting?}. Ongeldige invoer zonder fixture = contractschending.
  const AG_WALL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,7})?)?$/;
  const AG_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
  const AG_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const AG_EVENT_ID = /^[A-Za-z0-9+/=_-]+$/;
  const AG_CREATE_KEYS = ["subject", "start", "end", "attendees", "body", "bodyType", "calendarId", "importance", "isOnlineMeeting", "location",
    "responseRequested", "sensitivity", "showAs"];
  function agendaInputError(tool, i) {
    i = i || {};
    if (tool === "outlook_find_available_time") {
      if (!AG_UTC.test(i.afterDateTime || "") || !AG_UTC.test(i.beforeDateTime || "")) return "afterDateTime/beforeDateTime must be ISO 8601 UTC (YYYY-MM-DDTHH:mm:ssZ)";
      if (Date.parse(i.beforeDateTime) <= Date.parse(i.afterDateTime)) return "beforeDateTime must be after afterDateTime";
      if (i.durationMinutes != null && !(Number.isInteger(i.durationMinutes) && i.durationMinutes >= 15 && i.durationMinutes <= 480)) return "durationMinutes must be 15..480";
      if (i.participants != null && (!Array.isArray(i.participants) || i.participants.length > 50 || !i.participants.every((x) => AG_EMAIL.test(String(x))))) return "participants must be email addresses (max 50)";
      if (i.maxCandidates != null && !(Number.isInteger(i.maxCandidates) && i.maxCandidates >= 1 && i.maxCandidates <= 50)) return "maxCandidates must be 1..50";
    } else if (tool === "outlook_respond_to_event") {
      if (!AG_EVENT_ID.test(i.eventId || "") || String(i.eventId).length > 512) return "eventId invalid";
      if (!["accept", "decline", "tentative"].includes(i.response)) return "response must be accept|decline|tentative";
      if (i.comment != null && (typeof i.comment !== "string" || i.comment.length > 1024)) return "comment must be a string (max 1024)";
      if (i.comment && i.sendResponse === false) return "comment requires sendResponse";
      if (i.proposedNewTime && i.response === "accept") return "proposedNewTime only with decline or tentative";
    } else if (tool === "outlook_create_event") {
      const extra = Object.keys(i).filter((k) => !AG_CREATE_KEYS.includes(k));
      if (extra.length) return "unknown field(s) " + extra.join(", ");
      if (typeof i.subject !== "string" || !i.subject || i.subject.length > 255) return "subject required (max 255)";
      for (const k of ["start", "end"]) {
        const t = i[k];
        if (!t || typeof t !== "object" || !AG_WALL.test(t.dateTime || "") || !t.timeZone) return k + " must be {dateTime (no offset), timeZone}";
      }
      if (i.start.timeZone === i.end.timeZone && i.end.dateTime <= i.start.dateTime) return "end must be after start";
      if (i.attendees != null && (!Array.isArray(i.attendees) || i.attendees.length > 50 ||
        !i.attendees.every((a) => a && AG_EMAIL.test(a.email || "") && (!a.type || ["required", "optional", "resource"].includes(a.type)) && (a.name == null || String(a.name).length <= 256))))
        return "attendees must be [{email, name?, type?}] (max 50)";
      if (i.bodyType != null && !["text", "html"].includes(i.bodyType)) return "bodyType must be text|html";
    }
    return null;
  }
  const agendaPad = (n) => String(n).padStart(2, "0");
  const agendaWall = (d) => d.getFullYear() + "-" + agendaPad(d.getMonth() + 1) + "-" + agendaPad(d.getDate()) + "T" + agendaPad(d.getHours()) + ":" + agendaPad(d.getMinutes()) + ":00.0000000";
  function agendaDefaultFixture(tool, i) {
    i = i || {};
    if (tool === "outlook_find_available_time") {
      // De testbrowser draait in Europe/Amsterdam: lokale tijd = wandklok W. Europe Standard Time.
      const from = new Date(i.afterDateTime), to = new Date(i.beforeDateTime), dur = i.durationMinutes || 60, max = i.maxCandidates || 10;
      const out = [];
      const day = new Date(from.getFullYear(), from.getMonth(), from.getDate());
      for (let n = 0; n < 60 && day < to && out.length < max; n++, day.setDate(day.getDate() + 1)) {
        if (day.getDay() === 0 || day.getDay() === 6) continue;
        for (const [hh, mm, conf] of [[9, 30, 100], [11, 0, 100], [14, 0, 80], [16, 0, 50]]) {
          const st = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh, mm);
          const en = new Date(st.getTime() + dur * 60000);
          if (st < from || en > to || out.length >= max) continue;
          out.push({ start: { dateTime: agendaWall(st), timeZone: "W. Europe Standard Time" }, end: { dateTime: agendaWall(en), timeZone: "W. Europe Standard Time" },
            confidence: conf, organizerAvailability: "free",
            attendeeAvailability: (i.participants || []).map((email) => ({ email, availability: conf === 100 ? "free" : "tentative" })) });
        }
      }
      return { payload: { nowDateTime: new Date().toISOString(), availableTimes: out, unavailableParticipants: [] } };
    }
    if (tool === "outlook_respond_to_event") return { text: "Responded '" + i.response + "' to event " + i.eventId + "." };
    if (tool === "outlook_create_event") {
      const id = "mock-event-" + (LOG.mcp.length + 1);
      return { payload: { id, webLink: "https://outlook.example.com/owa/?itemid=" + id, subject: i.subject,
        onlineMeeting: i.isOnlineMeeting ? { joinUrl: "https://teams.example.com/l/meetup-join/" + id } : null } };
    }
    return null;
  }
  // ==== B4 Agenda (additief, einde) =====================================================================

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
      if (!fx && c.werk && server === "Atlassian Rovo" && WERK_TOOLS.has(tool)) fx = werkFixture(tool, input); // B6 Werk
      if (fx && c.werk && tool === "searchJiraIssuesUsingJql" && fx.payload) fx = werkSearch(fx); // B6: zoeken volgt de werk-staat
      // ---- B4 Agenda (additief): read_resource per uri, invoercontrole en standaardvormen agenda-tools ----
      if (fx && Array.isArray(fx.byInput)) {
        const hit = fx.byInput.find((e) => Object.entries(e.when || {}).every(([k, v]) => input && JSON.stringify(input[k]) === JSON.stringify(v)));
        if (hit) { const { when, ...rest } = hit; fx = rest; } else fx = fx.otherwise || null;
      }
      if (!fx && server === "Microsoft 365") {
        const bad = agendaInputError(tool, input);
        if (bad) { violation(`${tool}: ${bad}`); throw mcpErr("tool_error", "Input validation error: " + bad, { server }); }
        fx = agendaDefaultFixture(tool, input);
      }
      // ---- B4 Agenda (einde) ----
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
    // Contract: voor connectors rejects describeTool met bad_request. Met __MOCK__.describeSchemas = true
    // geeft de mock een simpel schema (om die tak van de pagina te testen).
    describeTool: (server, tool) => {
      const c = cfg();
      const manifest = c.manifest || DEFAULT_MANIFEST;
      if (c.describeSchemas && (manifest[server] || []).includes(tool)) {
        return Promise.resolve({ name: tool, description: "Mock-beschrijving van " + tool,
          inputSchema: { type: "object", properties: { voorbeeld: { type: "string" } } } });
      }
      return Promise.reject(mcpErr("bad_request", "describeTool is not answered for connectors"));
    },
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
      // Strenger dan het contract (dat staat opeenvolgende zelfde rollen toe): de pagina moet strikt
      // user/assistant afwisselen (PO-besluit ronde 6). Uit te zetten met __MOCK__.sample.allowSameRoleTurns.
      if (!(cfg().sample && cfg().sample.allowSameRoleTurns)) {
        for (let i = 1; i < input.length; i++) if (input[i].role === input[i - 1].role) return "two consecutive turns with the same role";
      }
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
      const lim = sampleLimits();
      if (!lim.tools && options.tools.length) return "__tools_unavailable__";
      if (lim.tools && options.tools.length > lim.tools.maxCount) return `too many tools (${options.tools.length} > ${lim.tools.maxCount})`;
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
        entry.outcome = bad === "__too_large__" ? "prompt_too_large" : bad === "__tools_unavailable__" ? "tools_unavailable" : "invalid_request";
        if (entry.outcome === "invalid_request") violation("sample: " + bad);
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
        if (rule.errorIfTools && options && Array.isArray(options.tools) && options.tools.length) return fail(clone(rule.errorIfTools));

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
        ok({ text, truncated: false, modelTierApplied: rule.tierApplied || (options && options.modelTier) || "default" });
      })().catch((e) => fail(sampleErr("upstream_error", String(e && e.message || e))));
    });
  }

  function sample(input, options) { return runSample("text", input, options); }
  sample.json = (input, options) => runSample("json", input, options);
  // limits(): standaard 8 tools; __MOCK__.sample.toolsMax (getal) of .toolsMax = 0 (geen tools in deze weergave).
  function sampleLimits() {
    const sc = cfg().sample || {};
    const max = sc.toolsMax === undefined ? 8 : sc.toolsMax;
    return max ? { maxPromptBytes: 65536, tools: { maxCount: max } } : { maxPromptBytes: 65536 };
  }
  sample.limits = () => Promise.resolve(sampleLimits());
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
  const PERSIST_KEY = "__mockDbStore";
  const persistOn = () => !(cfg().db && cfg().db.persist === false);
  let saved = null;
  try { saved = persistOn() ? JSON.parse(sessionStorage.getItem(PERSIST_KEY) || "null") : null; } catch { saved = null; }
  if (Array.isArray(saved)) for (const [p, d] of saved) store.set(p, d);
  else for (const [p, d] of Object.entries((cfg().db && cfg().db.docs) || {})) store.set(p, clone(d));
  function persist() { if (!persistOn()) return; try { sessionStorage.setItem(PERSIST_KEY, JSON.stringify([...store])); } catch { /* vol of geblokkeerd */ } }
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
        persist();
        notify();
      },
      update: async (data) => {
        await sleep(1);
        if (!isPlainObject(data) || !isPlainJson(data)) throw dbErr("invalid_argument", "body must be a plain JSON object");
        if (!store.has(path)) throw dbErr("invalid_argument", "update requires an existing document");
        writeGuard();
        LOG.db.push({ op: "update", path, data: clone(data) });
        store.set(path, mergeDeep(clone(store.get(path)), data));
        persist();
        notify();
      },
      delete: async () => {
        await sleep(1);
        writeGuard();
        LOG.db.push({ op: "delete", path });
        store.delete(path);
        persist();
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
