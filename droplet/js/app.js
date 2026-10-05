/* Droplet · slice 1 app: Outlook mail → ranked focus list → suggested
   action → your click. Markup, classes and interactions follow the
   approved v3 HUD design. */
(function (D) {
  "use strict";
  var U = D.util, rt = D.rt, store = D.store, mail = D.mail, rank = D.rank, flow = D.sendflow, chat = D.chat, teams = D.teams, meet = D.meet, mine = D.mine,
    waits = D.waits, tx = D.tx, ns = D.ns, atl = D.atl, ask = D.ask;
  var esc = U.esc, pad = U.pad;
  var FOCUS_MAX = 5;

  /* ---------------- Icons (from the design) ---------------- */
  var P = {
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6 8.5-6"/>',
    teams: '<path d="M4 5h16v11H10l-4.5 3.5V16H4z"/><path d="M8.5 9.5h7M8.5 12.5h4.5"/>',
    meeting: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M7.5 14h2M11.5 14h5M7.5 17.5h7"/>',
    mine: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="m8 12.5 3 3 5-6"/>',
    trash: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 8V4H4v12h4"/>',
    spark: '<path d="M12 3v5M12 16v5M3 12h5M16 12h5M5.6 5.6l3.2 3.2M15.2 15.2l3.2 3.2M5.6 18.4l3.2-3.2M15.2 8.8l3.2-3.2"/>',
    back: '<path d="M15 5 8 12l7 7"/>',
    chat: '<path d="M4 5h16v11h-8l-4 4v-4H4z"/>',
    down: '<path d="M12 4v15M6 13l6 6 6-6"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    send: '<path d="M4 12 20 4l-5 16-3-7z"/><path d="m12 13 8-9"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    warn: '<path d="M12 4 21 20H3z"/><path d="M12 10v4M12 17v.5"/>',
    arrowUp: '<path d="M12 20V5M6 11l6-6 6 6"/>',
    star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z"/>',
    out: '<path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5"/>',
    wait: '<path d="M7 3h10M7 21h10"/><path d="M8 3c0 5 8 5.5 8 9s-8 4-8 9M16 3c0 5-8 5.5-8 9s8 4 8 9"/>',
    jira: '<path d="M12 3 21 12l-9 9-9-9z"/><path d="m12 8.5 3.5 3.5-3.5 3.5L8.5 12z"/>',
    confluence: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h7"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    stop: '<rect x="7" y="7" width="10" height="10"/>'
  };
  function ico(name, cls) { return '<svg class="ico ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + P[name] + '</svg>'; }

  /* ---------------- State ---------------- */
  var S = {
    view: 'list', cur: null, pane: 'list', restOpen: false, q: '', chatOpen: false, scrollY: 0, toastTimer: null, anim: false,
    me: null, items: [], byId: {}, loading: true, loaded: false, ranking: 0, syncAt: null, mcpOk: null, teamsOk: null,
    notes: { mail: null, teams: null, cal: null, rank: null, store: null }, rankings: {}, feedback: [], verdict: {}, doneNow: {},
    drafts: {}, touched: {}, drafting: {}, send: {}, detail: {}, chat: {}, undo: null, handoff: {}, meetings: [], actions: {}, confirmDel: null, rankAgain: false, fresh: {}, actEdit: {},
    waits: {}, asksDb: {}, meetingsDb: {}, waitPre: [], scanning: false, teams10: [], sentMsgs: [], chaseMail: {}, ns: {},
    atlOk: null, atlItems: [], jiraMail: [], aiUndo: {}
  };
  D.state = S;
  var $ = function (id) { return document.getElementById(id); };
  var root = document.documentElement;
  var desk = function () { return window.innerWidth >= 960; };

  /* ---------------- Model ---------------- */
  function rk(it) { return it.r || rank.fallbackFor(it); }
  function groupOf(it) {
    var g = rk(it).group;
    if (it.standstill) return 'now';
    if (S.verdict[it.id] === 'up') return 'now';
    if (it.src === 'wait' && g === 'hidden') return 'later';
    if (it.src === 'mine') {
      /* Your own action: due today or earlier is "now"; a new one shows in
         Do now while Claude places it; it is never hidden. */
      if (it.due && it.due <= mine.today()) return 'now';
      if (S.fresh[it.id] && !it.r) return 'now';
      if (g === 'hidden') return 'later';
    }
    return g;
  }
  /* Your own action due today or earlier, or just added and still being
     placed by Claude: shown at the top of Do now (after R1 and ★). */
  function urgentMine(it) {
    return it.src === 'mine' && S.verdict[it.id] !== 'down' && (!!(it.due && it.due <= mine.today()) || !!(S.fresh[it.id] && !it.r));
  }
  function GI(g) { return g === 'now' ? 0 : g === 'later' ? 1 : 2; }
  function cmp(a, b) {
    var x, y;
    if ((x = a.standstill ? 0 : 1) !== (y = b.standstill ? 0 : 1)) return x - y;
    if ((x = S.verdict[a.id] === 'down' ? 1 : 0) !== (y = S.verdict[b.id] === 'down' ? 1 : 0)) return x - y;
    if ((x = S.verdict[a.id] === 'up' ? 0 : 1) !== (y = S.verdict[b.id] === 'up' ? 0 : 1)) return x - y;
    if ((x = urgentMine(a) ? 0 : 1) !== (y = urgentMine(b) ? 0 : 1)) return x - y;
    if ((x = GI(groupOf(a))) !== (y = GI(groupOf(b)))) return x - y;
    x = a.r && isFinite(a.r.pos) ? a.r.pos : Infinity; y = b.r && isFinite(b.r.pos) ? b.r.pos : Infinity;
    if (x !== y) return x < y ? -1 : 1;
    if (a.src === 'mine' && b.src === 'mine' && (a.due || '') !== (b.due || '')) return !a.due ? 1 : !b.due ? -1 : a.due < b.due ? -1 : 1;
    return String(b.received).localeCompare(String(a.received));
  }
  function actionDone(it) { var a = it.src === 'mine' && S.actions[it.docId]; return !!(a && a.done); }
  /* Marked done with Done (or d): off every list at once, for this session
     even when the db write failed. */
  function gone(id) { var d = S.doneNow[id], it = S.byId[id]; return !!(d && d.hidden) || !!(it && actionDone(it)); }
  function visible() {
    return S.items.filter(function (it) {
      if (actionDone(it) || gone(it.id)) return false;
      var d = rk(it).dupOf;
      if (d && (S.byId[d] || gone(d)) && !it.standstill) return false;
      return groupOf(it) !== 'hidden';
    }).sort(cmp);
  }
  /* Do now: the "now" items; when Claude put fewer than three there, the
     best-ranked of the rest fill up to three, so the top is never empty while
     there is work. */
  var FOCUS_MIN = 3;
  function topItems() {
    var vis = visible().filter(function (it) { return S.verdict[it.id] !== 'down'; });
    var top = vis.filter(function (it) { return groupOf(it) === 'now'; }).slice(0, FOCUS_MAX);
    if (top.length < FOCUS_MIN) vis.forEach(function (it) { if (top.length < FOCUS_MIN && top.indexOf(it) < 0) top.push(it); });
    return top;
  }
  function restItems() {
    var top = topItems();
    return visible().filter(function (it) { return top.indexOf(it) === -1; });
  }
  function dupCount(it) {
    var n = (it.merged || []).length;
    S.items.forEach(function (o) { if (o !== it && rk(o).dupOf === it.id && o.src === it.src) n += 1 + (o.merged || []).length; });
    return n;
  }
  /* R8 across sources: the other source's items that merged into this one. */
  function alsoIn(it) {
    return S.items.filter(function (o) { return o !== it && rk(o).dupOf === it.id && o.src !== it.src; });
  }
  var SRC = { mail: 'Mail', teams: 'Teams', mine: 'My action', wait: 'Waiting', meeting: 'Meeting', jira: 'Jira', confluence: 'Confluence' };
  function isJira(it) { return it && it.src === 'jira'; }
  function isPage(it) { return it && it.src === 'confluence'; }
  function isMine(it) { return it && it.src === 'mine'; }
  function isWait(it) { return it && it.src === 'wait'; }
  /* An own action made from a meeting commitment (R6). */
  function fromMeeting(it) { return isMine(it) && it.origin && it.origin.eventId ? it.origin : null; }
  function srcLabel(it) { var o = fromMeeting(it); return o ? 'From meeting ' + U.clip(o.subject || 'a meeting', 40) : SRC[it.src]; }
  /* The list item mirrors its stored action. */
  function syncAction(it) {
    var a = S.actions[it.docId]; if (!a) return it;
    it.subject = a.text; it.due = a.due || null; it.dueBy = a.dueBy || null; it.notes = a.notes || ''; it.summary = a.notes || ''; it.origin = a.origin || null;
    return it;
  }
  function isTeams(it) { return it && it.src === 'teams'; }
  /* A Teams item's title is Claude's one-line summary; a mail keeps its subject. */
  function titleOf(it) { return (isTeams(it) && it.r && it.r.title) || it.subject || '(no subject)'; }
  function sendState(id) { return S.send[id] || (S.send[id] = { phase: 'idle' }); }
  function isSent(id) { return sendState(id).phase === 'sent'; }
  function isClosed(id) { return !!S.doneNow[id]; }
  function isCur(id) { return S.view === 'item' && S.cur === id; }
  function project(it) {
    return rk(it).project || (isWait(it) ? it.project0 || 'Follow-up' : isMine(it) ? 'Own' : isJira(it) ? it.project0 || it.projectName || 'Jira' :
      isPage(it) ? it.project0 || it.spaceName || 'Confluence' : it.internal ? (isTeams(it) ? 'Chat' : 'Inbox') : 'Outside Planon');
  }
  function flag(it) {
    if (it.standstill) return 'Standstill';
    if (S.verdict[it.id] === 'up') return '★ Important';
    if (it.importance === 'high') return 'High importance';
    return '';
  }
  /* Every mail gets a draft from Claude: written while ranking, or lazily when it opens. */
  function claudeDraft(it) { return (it.r && it.r.draft) || it.lazyDraft || ''; }
  function draftOf(it) {
    if (S.drafts[it.id] == null) S.drafts[it.id] = claudeDraft(it);
    return S.drafts[it.id];
  }
  /* A draft from Claude replaces the text only while the viewer hasn't typed. */
  function applyClaudeDraft(it) {
    var st = sendState(it.id);
    if (S.touched[it.id] || st.phase !== 'idle' || String(S.drafts[it.id] || '').trim()) return false;
    if (!claudeDraft(it)) return false;
    S.drafts[it.id] = claudeDraft(it);
    return true;
  }
  function tag(it) { return U.firstName(it.senderName) || it.senderName || SRC[it.src] || 'Mail'; }
  function waitingTeams(id) { return S.handoff[id] || null; }

  /* ---------------- Render: list ---------------- */
  function renderStatus() {
    var m = S.mcpOk, cl = !!rt.sample;
    $('status').innerHTML =
      '<button class="dots" id="diagBtn" data-diag aria-expanded="' + (S.diagOpen ? 'true' : 'false') + '" aria-controls="diag" title="Show connection details">' +
      '<span data-dot="m365"><i' + (m === false ? ' class="off"' : '') + '></i>M365 link</span>' +
      '<span data-dot="teams"><i' + (S.teamsOk === false || m === false && S.teamsOk !== true ? ' class="off"' : '') + '></i>Teams</span>' +
      '<span data-dot="atlassian"><i' + (S.atlOk === false ? ' class="off"' : '') + '></i>Atlassian</span>' +
      '<span><i' + (cl ? '' : ' class="off"') + '></i>Claude</span></button>' +
      '<button class="sync" id="syncBtn" data-sync aria-label="Sync mail now">Sync ' + (S.syncAt ? U.hhmm(S.syncAt) : '··:··') + '</button>' +
      '<span>Nothing sends without you</span>';
    $('dateLine').textContent = U.dateLine(new Date());
  }
  /* What is still on its way, for the empty list: "Loading mail and Teams…". */
  function stillLoading() {
    if (!rt.inited) return 'Starting…';
    var names = { saved: 'saved items', mail: 'mail', teams: 'Teams', atl: 'Jira and Confluence' };
    var w = Object.keys(names).filter(function (k) { return S.src && S.src[k] && S.src[k].state === 'loading'; }).map(function (k) { return names[k]; });
    if (!w.length) return S.loaded || !S.loading ? '' : 'Loading…';
    return 'Loading ' + (w.length > 1 ? w.slice(0, -1).join(', ') + ' and ' + w[w.length - 1] : w[0]) + '…';
  }
  function renderNotes() {
    var h = '';
    var pn = permNote();
    if (pn) h += '<p class="note-line" data-note="perm">' + ico(pn.kind === 'denied' ? 'warn' : 'clock') + '<span>' + esc(pn.text) + '</span>' +
      (pn.kind === 'prompt' ? '<button data-perm-allow>Allow</button>' : '') + '</p>';
    /* A section still on its way says so on its own line; it becomes its
       content or its own note when it settles (each source has a timeout). */
    Object.keys(LOADING_TEXT).forEach(function (k) {
      if (S.src && S.src[k] && S.src[k].state === 'loading' && (S.items.length || k !== 'saved')) h += '<p class="note-line is-loading" data-loading="' + k + '">' + ico('clock') + '<span>' + esc(LOADING_TEXT[k]) + '</span></p>';
    });
    function line(key, text, retry) {
      h += '<p class="note-line" data-note="' + key + '">' + ico('clock') + '<span>' + esc(text) + '</span>' +
        (retry ? '<button data-retry="' + key + '">Try again</button>' : '') + '</p>';
    }
    if (S.notes.mail) line('mail', S.notes.mail, true);
    if (S.notes.teams) line('teams', S.notes.teams, true);
    if (S.notes.atl) line('atl', S.notes.atl, true);
    if (S.notes.cal) line('cal', S.notes.cal, false);
    var noun = S.rankingTeams ? ' new item' : ' new mail';
    if (S.ranking) line('ranking', 'Claude is ranking ' + S.ranking + noun + (S.ranking === 1 ? '' : 's') + '…', false);
    else if (S.notes.rank) line('rank', S.notes.rank, true);
    if (S.notes.waits) line('waits', S.notes.waits, false);
    if (S.notes.store) line('store', S.notes.store, S.notes.store === 'Couldn’t load your saved items.');
    $('notes').innerHTML = h;
  }
  function renderHeader() {
    var top = topItems(), open = top.filter(function (it) { return !isClosed(it.id); }).length, rest = restItems().length;
    $('sub').textContent = S.loading && !S.loaded ? 'Reading your inbox…' :
      (open ? open + ' action' + (open === 1 ? '' : 's') + ' queued · ' + rest + ' deferred' : 'All clear · ' + rest + ' deferred') +
      (S.waitPre.length ? ' · ' + S.waitPre.length + ' waiting on others' : '');
    renderStatus(); renderNotes();
  }
  function srcKind(it) { return isTeams(it) ? 'teams' : isWait(it) ? 'wait' : fromMeeting(it) ? 'meeting' : isMine(it) ? 'mine' : isJira(it) ? 'jira' : isPage(it) ? 'confluence' : 'mail'; }
  function srcHTML(it) { var k = srcKind(it); return '<span class="src" data-src="' + k + '">' + ico(k) + esc(srcLabel(it)) + '</span>'; }
  function dueHTML(it) { return isMine(it) && it.due ? '<span class="flag" data-due>' + esc(mine.dueLabel(it.due)) + '</span>' : ''; }
  function meetingHTML(it) { return it.meeting ? '<span class="flag" data-meeting>Meeting ' + esc(it.meeting.hhmm) + '</span>' : ''; }
  function alsoTag(it) {
    var a = alsoIn(it);
    if (!a.length) return '';
    var srcs = a.map(function (o) { return SRC[o.src]; }).filter(function (x, i, all) { return all.indexOf(x) === i; });
    return '<span data-also>Also in ' + esc(srcs.join(', ')) + '</span>';
  }
  function stateChip(id) {
    var s = sendState(id);
    if (s.phase === 'sent') return '<span class="state-chip">' + ico('check') + (isJira(S.byId[id]) ? 'Commented ' : 'Sent ') + U.hhmm(s.sentAt) + ' · done</span>';
    if (S.doneNow[id] && S.doneNow[id].how === 'chased') return '<span class="state-chip">' + ico('check') + 'Chased in Teams ' + esc(U.hhmm(new Date(S.doneNow[id].at))) + '</span>';
    if (S.doneNow[id]) return '<span class="state-chip">' + ico('check') + 'Done</span>';
    return '';
  }
  function actHTML(it) {
    if (waitingTeams(it.id)) return '<button class="btn-act is-wait" data-act="' + esc(it.id) + '" data-waiting>' + 'Waiting for you to send in Teams' + '</button>';
    if (isClosed(it.id)) return stateChip(it.id);
    return '<button class="btn-act" data-act="' + esc(it.id) + '">' + esc(rk(it).label) + '</button>';
  }
  function renderFocus() {
    var items = topItems(), h = '';
    var firstOpen = items.filter(function (it) { return !isClosed(it.id); })[0];
    items.forEach(function (it, i) {
      var cur = isCur(it.id), r = rk(it), n = dupCount(it), fl = flag(it);
      var cls = 'fi' + (it === firstOpen ? ' is-first' : '') + (isClosed(it.id) ? ' is-closed' : '') + (cur ? ' is-current' : '');
      h += '<li class="' + cls + '" data-id="' + esc(it.id) + '">' +
        '<button class="fi-open" data-open="' + esc(it.id) + '"' + (cur ? ' aria-current="true"' : '') + ' aria-label="Open ' + (i + 1) + ': ' + esc(titleOf(it)) + '">' +
          '<span class="fi-rank" aria-hidden="true">' + pad(i + 1) + '</span>' +
          '<span class="fi-body">' +
            '<span class="fi-meta">' + srcHTML(it) + '<span class="sep" aria-hidden="true">·</span><span>' + esc(project(it)) + '</span>' +
              (fl ? '<span class="flag">' + esc(fl) + '</span>' : '') + meetingHTML(it) + dueHTML(it) +
              (n ? '<span>+' + n + ' in thread</span>' : '') + alsoTag(it) +
              '<span class="cur-tag" aria-hidden="true">In panel</span></span>' +
            '<span class="fi-title">' + esc(titleOf(it)) + '</span>' +
            '<span class="fi-why">' + ico('spark') + '<span>' + esc(r.why) + '</span></span>' +
          '</span>' +
        '</button>' +
        '<div class="fi-act">' + actHTML(it) + '</div>' +
      '</li>';
    });
    if (!items.length) h = stillLoading() ? '<li class="loading-line">' + esc(stillLoading()) + '</li>' : '<li class="allclear">All clear. Nothing needs you right now.</li>';
    $('focus').innerHTML = h;
  }
  function renderRest() {
    var all = restItems(), q = S.q.trim().toLowerCase(), base = topItems().length;
    $('restCount').textContent = all.length;
    /* Waits younger than 3 working days are not listed, only found by search. */
    var list = all.concat(q ? S.waitPre : []).filter(function (it) {
      if (!q) return true;
      var extra = isTeams(it) ? ' ' + it.subject + ' ' + (it.people || []).join(' ') + ' ' + (it.participants || []).join(' ') :
        isMine(it) ? ' ' + (it.notes || '') + ' mine ' + (it.due ? mine.dueLabel(it.due) : '') + (it.origin ? ' meeting ' + it.origin.subject : '') :
        isWait(it) ? ' waiting on others ' + it.what + ' ' + it.summary :
        isJira(it) ? ' jira ' + it.issueKey + ' ' + (it.status || '') + ' ' + it.summary :
        isPage(it) ? ' confluence page ' + (it.spaceName || '') + ' ' + (it.spaceKey || '') + ' ' + it.summary : '';
      return (titleOf(it) + ' ' + project(it) + ' ' + it.senderName + ' ' + it.sender + ' ' + rk(it).why + ' ' + srcLabel(it) + extra +
        (it.meeting ? ' meeting ' + it.meeting.hhmm : '')).toLowerCase().indexOf(q) !== -1;
    });
    var h = '';
    list.forEach(function (it) {
      var n = all.indexOf(it) > -1 ? all.indexOf(it) + base + 1 : 0, cur = isCur(it.id);
      h += '<li><button class="rr' + (isClosed(it.id) ? ' is-closed' : '') + (cur ? ' is-current' : '') + '" data-open="' + esc(it.id) + '"' + (cur ? ' aria-current="true"' : '') + '>' +
        '<span class="rr-n">' + (n ? pad(n) : '··') + '</span>' + ico(srcKind(it)) +
        '<span class="rr-t"><span class="rr-title">' + esc(titleOf(it)) + '</span><span class="rr-sub">' + esc(srcLabel(it)) + ' · ' + esc(project(it)) + ' · ' + esc(it.senderName) +
        (isWait(it) && !n ? ' · asked ' + it.n + ' working day' + (it.n === 1 ? '' : 's') + ' ago' : '') +
        (it.meeting ? ' · meeting ' + esc(it.meeting.hhmm) : '') + (waitingTeams(it.id) ? ' · waiting for you to send in Teams' : '') +
        (isMine(it) && it.due ? ' · ' + esc(mine.dueLabel(it.due).toLowerCase()) : '') +
        (S.verdict[it.id] === 'down' ? ' · marked not important' : '') + '</span></span></button></li>';
    });
    if (!list.length) h = '<li class="rest-empty">' + (q ? 'Nothing matches “' + esc(S.q) + '”.' : 'Nothing else right now.') + '</li>';
    $('restList').innerHTML = h;
    $('restToggle').setAttribute('aria-expanded', String(S.restOpen));
    $('restPanel').hidden = !S.restOpen;
  }

  /* ---------------- Render: item view ---------------- */
  /* A Teams chat: the newest messages, as plain text only. */
  function teamsSourceHTML(it) {
    var d = S.detail[it.id] || {}, texts = d.state === 'ok' ? d.texts || {} : {}, h = '';
    var kind = it.chatKind === 'oneOnOne' ? '1:1 chat' : it.chatKind === 'meeting' ? 'Meeting chat' : 'Group chat';
    h += '<div class="mail-from"><span><b>' + esc(it.subject) + '</b> · ' + esc(kind) + '</span><span>' + esc(U.when(it.received, new Date())) + '</span></div>';
    if (it.more) h += '<p class="muted thread-more">' + it.more + ' earlier message' + (it.more === 1 ? '' : 's') + ' not shown</p>';
    h += '<div class="thread" id="chatThread">';
    it.msgs.forEach(function (m) {
      var t = texts[m.id] || m.text || '';
      h += '<div class="msg' + (m.me ? ' me' : '') + '"><span class="av" aria-hidden="true">' + esc((m.me ? 'You' : (m.name || '?')).charAt(0).toUpperCase()) + '</span>' +
        '<div><div class="msg-h"><b>' + esc(m.name) + '</b>' + esc(U.when(m.at, new Date())) + '</div><div class="msg-t">' + (t ? esc(t) : '<span class="muted">(no text)</span>') + '</div></div></div>';
    });
    h += '</div>';
    if (d.state === 'loading') h += '<p class="muted">Loading the full messages…</p>';
    else if (d.state === 'ok' && d.failed && d.failed >= d.asked) h += '<p class="muted">Showing the search previews; the full messages couldn’t be loaded.</p>';
    var link = U.safeTeamsLink(it.webUrl);
    if (link) h += '<div class="src-note">' + ico('out', 'ico-sm') + '<a href="' + esc(link) + '" target="_blank" rel="noopener noreferrer" data-teams-link>Open in Teams</a></div>';
    return h;
  }
  function alsoHTML(it) {
    var a = alsoIn(it);
    if (!a.length) return '';
    return '<div class="sec-label">' + ico('spark') + 'Also in</div><div class="card also" data-also-in>' + a.map(function (o) {
      return '<div class="also-row">' + srcHTML(o) + '<span class="also-t"><b>' + esc(titleOf(o)) + '</b> · ' + esc(o.senderName) + ' · ' + esc(U.when(o.received, new Date())) + '</span></div>';
    }).join('') + '</div>';
  }
  function sourceHTML(it) {
    if (isTeams(it)) return teamsSourceHTML(it);
    if (isJira(it)) return jiraSourceHTML(it);
    if (isPage(it)) return pageSourceHTML(it);
    var d = S.detail[it.id] || {}, text, note = '';
    if (d.state === 'ok') text = d.text;
    else { text = it.summary; note = d.state === 'error' ? 'Showing the preview; the full mail couldn’t be loaded.' : 'Loading the full mail…'; }
    var paras = String(text || '').split(/\n{2,}/).filter(function (p) { return p.trim(); });
    var link = U.safeOutlookLink((d.state === 'ok' && d.webLink) || it.webLink);
    return '<div class="mail-from"><span><b>' + esc(it.senderName) + '</b> · ' + esc(it.sender) + '</span><span>' + esc(U.when(it.received, new Date())) + '</span></div>' +
      '<div class="mail-subj">' + esc(it.subject || '(no subject)') + '</div>' +
      '<div class="mail-body" id="mailBody">' + (paras.length ? paras.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') : '<p class="muted">(no text)</p>') +
        (note ? '<p class="muted">' + esc(note) + (d.state === 'error' ? ' <button data-reread>Try again</button>' : '') + '</p>' : '') + '</div>' +
      (link ? '<div class="src-note">' + ico('out', 'ico-sm') + '<a href="' + esc(link) + '" target="_blank" rel="noopener noreferrer" data-outlook>Open in Outlook</a></div>' : '');
  }
  function emptyHTML() {
    return '<div class="iv-head"><span class="iv-crumb"><span class="tag"><i style="background:var(--faint)"></i>Item</span><span class="sep" aria-hidden="true">//</span><span class="c-sec">Standby</span></span></div>' +
      '<div class="empty"><div>' +
      '<svg class="empty-mark" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="44" fill="none" stroke="currentColor" stroke-width="2"/><path d="M60 4v16M60 100v16M4 60h16M100 60h16" fill="none" stroke="#ff8a1f" stroke-width="4" stroke-linecap="square"/><rect x="54" y="54" width="12" height="12" fill="#ff8a1f"/></svg>' +
      '<h2>Standing by.</h2><p>Select an item to load its next action.</p><p style="margin-top:6px">Nothing is sent without your click.</p>' +
      '<div class="keys"><span><span class="kbd">↑</span><span class="kbd">↓</span>Move</span><span><span class="kbd">Enter</span>Open</span><span><span class="kbd">/</span>Search</span><span><span class="kbd">Esc</span>Close</span></div>' +
      '</div></div>';
  }
  function problemHTML(st) {
    if (!st.message || st.phase === 'sent' || st.phase === 'sending' || st.phase === 'idle') return '';
    var link = U.safeOutlookLink(st.draftLink);
    return '<div class="warn is-problem" role="alert" data-problem="' + esc(st.phase) + '">' + ico('warn', 'ico-sm') + '<span>' + esc(st.message) +
      (link ? ' <a class="draft-link" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">Open draft in Outlook</a>' : '') + '</span>' + diagHTML(st) + '</div>';
  }
  /* Which step stopped the send, the error code and Outlook's own words (text only). */
  function diagHTML(st) {
    if (!st.step) return '';
    return '<div class="diag" data-diag><dl>' +
      '<div><dt>Step</dt><dd data-diag-step>' + esc(st.step) + '</dd></div>' +
      '<div><dt>Code</dt><dd data-diag-code>' + esc(st.code || 'unknown') + '</dd></div>' +
      (st.detail ? '<div><dt>Outlook said</dt><dd data-diag-msg>' + esc(U.clip(st.detail, 200)) + '</dd></div>' : '') +
      '</dl><button data-copydiag>Copy details</button></div>';
  }
  function draftFoot(it, locked, busy) {
    var ds = S.drafting[it.id];
    if (isJira(it)) {
      if (locked) return 'Posted once. This comment is locked.';
      if (busy) return 'Posting… Don’t close this page.';
      if (ds === 'loading' && !S.touched[it.id]) return 'Claude is writing a comment…';
      if (ds && ds.error && !S.touched[it.id] && !String(S.drafts[it.id] || '').trim()) return esc(ds.error) + '. Write your own, or <button data-redraft>Try again</button>';
      return 'Click the text to edit it. Nothing is posted until you press Comment.';
    }
    if (isTeams(it) || isWait(it)) {
      if (ds === 'loading' && !S.touched[it.id]) return 'Claude is writing a reply in your chat style…';
      if (ds && ds.error && !S.touched[it.id] && !String(S.drafts[it.id] || '').trim()) return esc(ds.error) + '. Write your own, or <button data-redraft>Try again</button>';
      return 'Click the text to edit it. Droplet never posts it for you.';
    }
    if (locked) return 'Sent once. This draft is locked.';
    if (busy) return 'Sending… Don’t close this page.';
    if (ds === 'loading' && !S.touched[it.id]) return 'Claude is writing a draft in your style…';
    if (ds && ds.error && !S.touched[it.id] && !String(S.drafts[it.id] || '').trim()) {
      return esc(ds.error) + '. Write your own, or <button data-redraft>Try again</button>';
    }
    return 'Click the text to edit it. Nothing is sent until you press Send.';
  }
  function headHTML(it, inFocus, n) {
    return '<div class="iv-head">' +
        '<button class="btn-back" data-back aria-label="Back to the list">' + ico('back') + '<span class="lbl-phone">Back</span><span class="lbl-desk">Close</span></button>' +
        '<span class="iv-crumb" aria-label="Location"><span class="c-sec">' + (inFocus ? 'Do now' : 'Everything else') + '</span><span class="sep" aria-hidden="true">›</span>' +
          '<span class="c-n">#' + pad(n) + '</span><span class="sep" aria-hidden="true">›</span><b>' + esc(isMine(it) ? 'My action' : tag(it)) + '</b></span>' +
        '<span class="kbd" aria-hidden="true">Esc</span>' +
      '</div>';
  }
  /* Your own action: edit in place (saved on blur), due date, notes, Done, Delete. */
  function actionItemHTML(it, inFocus, n) {
    var a = S.actions[it.docId] || {}, r = rk(it), fl = flag(it), ed = S.actEdit[it.docId] || {};
    var next = (it.r && it.r.next) || mine.nextStep(a.text);
    var by = a.due ? (a.dueBy === 'you' ? 'set by you' : a.dueBy === 'claude' ? 'read from your text by Claude' : 'read from your text') : 'none';
    var del = S.confirmDel === it.id
      ? '<div class="warn is-problem" role="alert" data-confirm-delete>' + ico('warn', 'ico-sm') + '<span>Delete this action? This can’t be undone.</span>' +
        '<div class="act-confirm"><button data-delete-yes>Delete</button><button data-delete-no>Keep it</button></div></div>'
      : '';
    return headHTML(it, inFocus, n) +
      '<div class="iv-scroll' + (S.anim ? ' enter' : '') + '">' +
        '<div class="iv-meta">' + srcHTML(it) + '<span class="sep" aria-hidden="true">·</span><span>' + esc(project(it)) + '</span>' +
          (fl ? '<span class="flag">' + esc(fl) + '</span>' : '') + dueHTML(it) + '<span class="sep" aria-hidden="true">·</span><span>Added ' + esc(U.when(a.created, new Date())) + '</span></div>' +
        '<h2 class="iv-title act-title" id="ivTitle" tabindex="-1"><label class="sr" for="actText">Action text</label>' +
          '<textarea id="actText" rows="2" maxlength="' + mine.MAX_TEXT + '" spellcheck="true">' + esc(ed.text != null ? ed.text : a.text || '') + '</textarea></h2>' +
        '<div class="iv-why"><span class="who" aria-hidden="true">' + ico('spark') + '</span><p><span class="sr">Claude: </span>' + esc(r.why) + '</p></div>' +
        (next ? '<p class="act-next" data-next>' + ico('spark', 'ico-sm') + '<span>Next step: ' + esc(next.charAt(0).toLowerCase() + next.slice(1)) + '</span></p>' : '') +
        nextHTML(it) +
        originHTML(it) +
        alsoHTML(it) +
        '<div class="sec-label">' + ico('mine') + 'Details</div>' +
        '<div class="card act-card">' +
          '<div class="draft-row act-row"><label class="k" for="actDue">Due</label><span class="act-due"><input type="date" id="actDue" value="' + esc(a.due || '') + '">' +
            '<span class="act-by" data-due-by>' + esc(by) + '</span></span></div>' +
          '<label class="k act-k" for="actNotes">Notes</label>' +
          '<textarea id="actNotes" placeholder="Notes, only for you">' + esc(ed.notes != null ? ed.notes : a.notes || '') + '</textarea>' +
          '<div class="draft-foot">Changes are saved when you leave a field.</div>' +
          del +
        '</div>' +
      '</div>' +
      '<div class="iv-bar">' + barHTML(it) + '</div>';
  }

  /* ---------------- Render: a wait (R3) ---------------- */
  function waitDoc(it) { return it && S.waits[it.docId] || null; }
  function isExternal(addr) { return !!addr && !U.isInternal(addr, mail.meDomain ? [mail.meDomain] : []); }
  /* Chase by mail is possible for an ask by mail to a known address. It is
     the primary chase for people outside Planon; Teams for everyone else. */
  function canMailChase(it) { var w = waitDoc(it); return !!(w && w.src === 'mail' && w.who.email && w.ref.id); }
  function chaseByMail(it) {
    if (!canMailChase(it)) return false;
    if (S.chaseMail[it.id] != null) return S.chaseMail[it.id];
    return isExternal(waitDoc(it).who.email);
  }
  function waitLink(it) {
    var w = waitDoc(it); if (!w) return null;
    return w.src === 'teams' ? U.safeTeamsLink(w.ref.webUrl) : waits.chatLink(w.who.email);
  }
  /* The draft the textarea edits: the Teams chase, or its mail version. */
  function draftKey(it) { return isWait(it) && chaseByMail(it) ? it.id + '#mail' : it.id; }
  function mailChaseText(it) {
    var k = it.id + '#mail';
    if (S.drafts[k] == null) {
      var base = String(draftOf(it) || '').trim() || 'A quick check on my question: ' + it.what + '.';
      S.drafts[k] = rank.normalizeDraft(base, { senderFirst: it.senderName, sign: rank.signName(S.me) });
    }
    return S.drafts[k];
  }
  function waitItemHTML(it) {
    var w = waitDoc(it) || { ref: {}, who: {} }, r = rk(it), st = sendState(it.id), locked = st.phase === 'sent', busy = st.phase === 'sending';
    var top = topItems(), i = top.indexOf(it), inFocus = i > -1, pre = S.waitPre.indexOf(it) > -1;
    var n = inFocus ? i + 1 : pre ? 0 : restItems().indexOf(it) + top.length + 1;
    var byMail = chaseByMail(it), first = U.firstName(it.senderName) || it.senderName, fl = flag(it);
    var srcLink = w.src === 'teams' ? U.safeTeamsLink(w.ref.webUrl) : U.safeOutlookLink(w.ref.webLink);
    var h = '<div class="iv-head">' +
        '<button class="btn-back" data-back aria-label="Back to the list">' + ico('back') + '<span class="lbl-phone">Back</span><span class="lbl-desk">Close</span></button>' +
        '<span class="iv-crumb" aria-label="Location"><span class="c-sec">' + (inFocus ? 'Do now' : pre ? 'Waiting on others' : 'Everything else') + '</span><span class="sep" aria-hidden="true">›</span>' +
          (n ? '<span class="c-n">#' + pad(n) + '</span><span class="sep" aria-hidden="true">›</span>' : '') + '<b>' + esc(first) + '</b></span>' +
        '<span class="kbd" aria-hidden="true">Esc</span>' +
      '</div>' +
      '<div class="iv-scroll' + (S.anim ? ' enter' : '') + '">' +
        '<div class="iv-meta">' + srcHTML(it) + '<span class="sep" aria-hidden="true">·</span><span>' + esc(project(it)) + '</span>' +
          (fl ? '<span class="flag">' + esc(fl) + '</span>' : '') + meetingHTML(it) + '<span class="sep" aria-hidden="true">·</span><span>Asked ' + esc(U.whenLong(it.received)) + '</span></div>' +
        '<h2 class="iv-title" id="ivTitle" tabindex="-1">' + esc(titleOf(it)) + '</h2>' +
        '<div class="iv-why"><span class="who" aria-hidden="true">' + ico('spark') + '</span><p><span class="sr">Claude: </span>' + esc(r.why) + '</p></div>' +
        '<div class="sec-label">' + ico('wait') + 'Your message' + (w.src === 'teams' ? ' · Teams' : ' · mail') + '</div>' +
        '<div class="card src-card" data-wait-src>' +
          '<div class="mail-from"><span><b>To ' + esc(it.senderName) + '</b>' + (w.ref.subject ? ' · ' + esc(w.ref.subject) : '') + '</span><span>' + esc(U.when(it.received, new Date())) + '</span></div>' +
          '<div class="thread"><div class="msg me"><span class="av" aria-hidden="true">Y</span><div><div class="msg-h"><b>You</b>' + esc(U.whenLong(it.received)) + '</div>' +
            '<div class="msg-t">' + (it.summary ? esc(it.summary) : '<span class="muted">(no text)</span>') + '</div></div></div></div>' +
          '<div class="src-note">' + ico('clock', 'ico-sm') + '<span>No answer from ' + esc(first) + ' since ' + esc(U.whenLong(it.received)) +
            (w.chasedAt ? ' · chased ' + esc(U.whenLong(w.chasedAt)) : '') + '</span></div>' +
          (srcLink ? '<div class="src-note">' + ico('out', 'ico-sm') + '<a href="' + esc(srcLink) + '" target="_blank" rel="noopener noreferrer">' + (w.src === 'teams' ? 'Open in Teams' : 'Open in Outlook') + '</a></div>' : '') +
        '</div>' +
        '<div class="sec-label">' + ico('spark') + 'Prepared chase' + (byMail ? ' · Reply · mail' : ' · Teams') + '</div>';
    if (byMail) {
      h += '<div class="card draft' + (locked ? ' is-locked' : '') + '" data-chase="mail">' +
        '<div class="draft-row"><span class="k">To</span><span class="chips"><span class="chip addr" data-to>' + esc(w.who.email) + '</span></span></div>' +
        '<div class="draft-row"><span class="k">Subject</span><span>' + esc(/^re:/i.test(w.ref.subject || '') ? w.ref.subject : 'RE: ' + (w.ref.subject || '')) + '</span></div>' +
        '<label class="sr" for="draftText">Draft text</label>' +
        '<textarea id="draftText"' + (locked || busy ? ' readonly' : '') + '>' + esc(mailChaseText(it)) + '</textarea>' +
        (isExternal(w.who.email) ? '<div class="warn" data-outside>' + ico('warn', 'ico-sm') + 'Goes outside Planon. Check before sending.</div>' : '') +
        aiNoteHTML(it) + problemHTML(st) +
        '<div class="draft-foot">' + (locked ? 'Sent once. This draft is locked.' : busy ? 'Sending… Don’t close this page.' : 'A reply to your own mail. Nothing is sent until you press Send.') + '</div></div>';
    } else {
      var link = waitLink(it), writing = S.drafting[it.id] === 'loading' && !S.touched[it.id];
      h += '<div class="card draft" data-chase="teams">' +
        '<div class="draft-row"><span class="k">To</span><span class="chips"><span class="chip" data-to>' + esc(it.senderName) + '</span></span></div>' +
        '<div class="draft-row"><span class="k">Via</span><span>' + (w.src === 'teams' ? 'The same Teams chat' : 'Teams 1:1 chat') + ' · you post it</span></div>' +
        '<label class="sr" for="draftText">Draft text</label>' +
        '<textarea id="draftText"' + (writing ? ' aria-busy="true"' : '') + ' placeholder="' + (writing ? 'Claude is writing a chase…' : 'Write your chase…') + '">' + esc(draftOf(it)) + '</textarea>' +
        (!link ? '<div class="warn is-wait" data-nolink>' + ico('warn', 'ico-sm') + '<span>' + (w.src === 'teams' ? 'Droplet has no link to this chat. It copies the text; open the chat in Teams yourself.' : 'Droplet doesn’t know ' + esc(first) + '’s address, so it can’t open a chat. It copies the text.') + '</span></div>' : '') +
        '<div class="src-note" data-teams-note>' + ico('warn', 'ico-sm') + '<span>Droplet can’t post in Teams (no permission), so it copies your chase and opens the chat.</span></div>' +
        aiNoteHTML(it) +
        '<div class="draft-foot">' + draftFoot(it, false, false) + '</div></div>';
    }
    h += '</div>' +
      '<div class="iv-bar">' + barHTML(it) + '</div>';
    return h;
  }
  function waitBarHTML(it) {
    var st = sendState(it.id), locked = st.phase === 'sent', busy = st.phase === 'sending', byMail = chaseByMail(it), w = waitDoc(it) || {};
    var off = locked || busy ? ' aria-disabled="true"' : '';
    var q = function (key, icon, label, k, pressed) {
      return '<button class="qbtn" data-' + key + off + (pressed !== undefined ? ' aria-pressed="' + pressed + '"' : '') + (k ? ' aria-keyshortcuts="' + k + '"' : '') + '>' +
        ico(icon) + '<span>' + label + '</span>' + (k ? '<span class="kbd" aria-hidden="true">' + k + '</span>' : '') + '</button>';
    };
    var btns = [];
    btns.push(askBtn());
    btns.push(q('notwaiting', 'check', 'Not waiting<span class="q-x"> anymore</span>', 'd'));
    btns.push(q('snooze', 'clock', 'Snooze 2 days'));
    if (canMailChase(it)) btns.push(byMail ? q('chaseteams', 'teams', 'Chase by Teams') : q('chasemail', 'mail', 'Chase by mail'));
    var empty = !String(S.drafts[draftKey(it)] || '').trim(), btn;
    if (byMail) {
      if (locked) btn = '<button class="btn-send is-sent" id="sendBtn" aria-disabled="true">Sent ✓ ' + U.hhmm(st.sentAt) + ' · locked</button>';
      else if (busy) btn = '<button class="btn-send" id="sendBtn" aria-disabled="true" aria-busy="true">' + ico('send') + 'Sending…</button>';
      else if (st.phase === 'unclear') btn = '<button class="btn-send is-confirm" id="sendBtn" data-send>' + (st.confirm ? 'Yes, send again' : 'Send again anyway') + '</button>';
      else btn = '<button class="btn-send" id="sendBtn" data-send' + (empty ? ' aria-disabled="true"' : '') + '>' + ico('send') + 'Send</button>';
    } else {
      btn = '<button class="btn-send" id="sendBtn" data-copyopen' + (empty ? ' aria-disabled="true"' : '') + '>' + ico('copy') +
        (S.doneNow[it.id] ? 'Copy & open again' : w.src === 'teams' ? 'Copy & open in Teams' : 'Chase by Teams') + '</button>';
    }
    return '<div class="quiet' + (btns.length === 3 ? ' is-3' : '') + '">' + btns.join('') + '</div>' + btn +
      (locked ? '<div class="sent-note">Chased once by mail</div>' : '');
  }

  /* ---------------- Render: meeting origin and next steps (R6) ---------------- */
  var fDay = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  function originHTML(it) {
    var o = fromMeeting(it); if (!o) return '';
    var d = new Date(o.date);
    return '<div class="sec-label">' + ico('meeting') + 'From the meeting transcript</div>' +
      '<div class="card src-card" data-origin>' +
        '<div class="mail-from"><span><b data-origin-subject>' + esc(o.subject || 'Meeting') + '</b></span><span data-origin-date>' + esc(isNaN(d) ? '' : fDay.format(d).replace(/,/g, '') + ' · ' + U.hhmm(d)) + '</span></div>' +
        '<div class="thread"><div class="msg me hl"><span class="av" aria-hidden="true">Y</span><div><div class="msg-h"><b>You</b>said</div>' +
          '<div class="msg-t" data-quote>' + esc(o.quote || '') + '</div></div></div></div>' +
      '</div>';
  }
  function directory() {
    var lists = [];
    S.items.forEach(function (m) {
      if (m.src === 'mail') lists.push([{ email: m.sender, name: m.senderName }]);
      if (m.src === 'teams') lists.push(m.msgs.map(function (x) { return { email: x.email, name: x.name }; }));
    });
    lists.push(S.teams10.map(function (x) { return { email: x.email, name: x.name }; }));
    S.sentMsgs.forEach(function (m) { lists.push(m.to); });
    Object.keys(S.waits).forEach(function (k) { lists.push([S.waits[k].who]); });
    S.meetings.forEach(function (ev) { lists.push(ev.people.map(function (e) { return { email: e }; })); });
    Object.keys(S.actions).forEach(function (k) { var o = S.actions[k].origin; if (o && o.attendees) lists.push(o.attendees); });
    return ns.directory(lists, S.me);
  }
  function nsKind(it) { return ns.kindOf(it.r, S.actions[it.docId]); }
  function whoNames(it) {
    var a = S.actions[it.docId] || {}, r = it.r || {};
    if (r.nextWho && r.nextWho.length) return r.nextWho;
    if (a.origin && a.origin.who && a.origin.who.length) return a.origin.who;
    return ns.namesIn(r.next || mine.nextStep(a.text) || a.text);
  }
  var NS_START = { meeting: ['clock', 'Find a time'], mail: ['mail', 'Draft a mail'], chase: ['teams', 'Chase in Teams'] };
  function nextHTML(it) {
    var kind = nsKind(it); if (!kind) return '';
    var st = S.ns[it.docId];
    if (!st || st.kind !== kind) {
      return '<div class="ns-start"><button class="ns-btn" data-ns-start="' + kind + '">' + ico(NS_START[kind][0]) + esc(NS_START[kind][1]) + '</button></div>';
    }
    return nsCardHTML(it, st);
  }
  function okPeople(st) { return st.people.filter(function (p) { return p.state === 'ok'; }); }
  function openPeople(st) { return st.people.filter(function (p) { return p.state !== 'ok'; }); }
  function peopleHTML(st, locked) {
    var h = '<div class="draft-row ns-to"><span class="k">' + (st.kind === 'meeting' ? 'Invite' : 'To') + '</span><span class="chips" data-ns-people>';
    var ok = okPeople(st);
    ok.forEach(function (p) {
      var i = st.people.indexOf(p);
      h += '<span class="chip addr" data-ns-person>' + esc(p.name) + ' · ' + esc(p.email) +
        (locked ? '' : '<button class="chip-x" data-ns-drop="' + i + '" aria-label="Leave out ' + esc(p.name) + '">×</button>') + '</span>';
    });
    if (!ok.length) h += '<span class="muted">Nobody yet</span>';
    h += '</span></div>';
    if (locked) return h;
    st.people.forEach(function (p, i) {
      if (p.state === 'ambiguous') {
        h += '<div class="ns-ask" data-ns-ambiguous="' + i + '"><p>Which ' + esc(p.name) + '?</p><div class="ns-opts">' +
          p.options.map(function (o) { return '<button class="ns-opt" data-ns-pick="' + i + '" data-email="' + esc(o.email) + '">' + esc(o.name) + ' · ' + esc(o.email) + '</button>'; }).join('') +
          '<button class="ns-opt is-quiet" data-ns-drop="' + i + '">Leave out</button></div></div>';
      } else if (p.state === 'unknown') {
        h += '<div class="ns-ask" data-ns-unknown="' + i + '"><label for="nsAddr' + i + '">Droplet doesn’t know an address for ' + esc(p.name) + '. Type it, or leave ' + esc(p.name) + ' out.</label>' +
          '<div class="ns-addr"><input type="email" id="nsAddr' + i + '" autocomplete="off" placeholder="name@planonsoftware.com" value="' + esc(p.typed || '') + '">' +
          '<button class="ns-opt" data-ns-use="' + i + '">Use</button><button class="ns-opt is-quiet" data-ns-drop="' + i + '">Leave out</button></div>' +
          (p.bad ? '<p class="ns-bad" role="alert">That isn’t an email address.</p>' : '') + '</div>';
      }
    });
    h += '<form class="ns-add" data-ns-addform autocomplete="off"><label class="sr" for="nsAdd">Add someone</label><input id="nsAdd" placeholder="Add a name or address"><button class="ns-opt" type="submit">Add</button></form>';
    return h;
  }
  function nsDraftNote(st) {
    if (st.drafting === 'loading') return '<p class="muted ns-note">Claude is drafting…</p>';
    if (st.drafting && st.drafting.error) return '<p class="muted ns-note">' + esc(st.drafting.error) + '. Write it yourself, or <button data-ns-redraft>Try again</button></p>';
    return '';
  }
  function doneOffer(it) {
    return '<button class="ns-btn" data-ns-done>' + ico('check') + 'Mark action done</button>';
  }
  function nsCardHTML(it, st) {
    var h = '<div class="sec-label">' + ico(NS_START[st.kind][0]) + (st.kind === 'meeting' ? 'Invite · Find a time' : st.kind === 'mail' ? 'New mail · Draft' : 'Chase · Teams') + '</div>' +
      '<div class="card draft ns-card" data-ns-card="' + st.kind + '">';
    var ok = okPeople(st), waiting = openPeople(st).length;
    if (st.kind === 'meeting') {
      var inv = st.inv, locked = inv.phase === 'sent' || inv.phase === 'sending';
      h += peopleHTML(st, locked);
      h += '<div class="ns-slots-wrap">';
      if (waiting) h += '<p class="muted ns-note">Choose who first, then Droplet looks for a time.</p>';
      else if (!ok.length) h += '<p class="muted ns-note">Add who to invite.</p>';
      else if (st.slotState === 'loading') h += '<p class="muted ns-note">Looking at calendars…</p>';
      else if (st.slotState === 'error') h += '<p class="muted ns-note">' + esc(st.calErr || 'Couldn’t read your calendar') + ' <button data-ns-slots>Try again</button></p>';
      else if (st.slotState === 'none') h += '<p class="muted ns-note">No free 30 minutes in working hours in the next weeks.</p>';
      else if (st.slotState === 'ok') {
        h += '<div class="ns-slots" role="group" aria-label="Choose a time">' + st.slots.map(function (sl, k) {
          return '<button class="ns-slot" data-ns-slot="' + k + '" aria-pressed="' + (k === st.slot) + '"' + (locked ? ' aria-disabled="true"' : '') + '>' + esc(ns.slotLabel(sl)) + '</button>';
        }).join('') + '</div>' + (st.calNote ? '<p class="muted ns-note" data-cal-note>' + esc(st.calNote) + '</p>' : '');
      }
      h += '</div>' +
        '<label class="k ns-k" for="nsTitle">Title</label><input class="ns-in" id="nsTitle" maxlength="255"' + (locked ? ' readonly' : '') + ' value="' + esc(st.title) + '">' +
        '<label class="ns-toggle"><input type="checkbox" id="nsOnline"' + (st.online ? ' checked' : '') + (locked ? ' disabled' : '') + '><span>Teams meeting</span></label>' +
        '<label class="k ns-k" for="nsAgenda">Agenda</label><textarea id="nsAgenda"' + (locked ? ' readonly' : '') + ' placeholder="' + (st.drafting === 'loading' ? 'Claude is drafting an agenda…' : 'A short agenda') + '">' + esc(st.agenda) + '</textarea>' +
        nsDraftNote(st) + aiNoteHTML(it) + nsProblem(inv);
      if (inv.phase === 'sent') h += '<div class="ns-done" data-ns-sent><span class="state-chip">' + ico('check') + 'Invite sent · ' + esc(inv.label) + '</span>' + doneOffer(it) + '</div>';
      else {
        var label = inv.phase === 'sending' ? 'Sending…' : inv.phase === 'unclear' ? (inv.confirm ? 'Yes, send again' : 'Send invite again anyway') : 'Send invite';
        h += '<button class="btn-send ns-go' + (inv.phase === 'unclear' ? ' is-confirm' : '') + '" data-ns-invite' + (nsReady(st) && inv.phase !== 'sending' ? '' : ' aria-disabled="true"') + '>' + ico('send') + esc(label) + '</button>';
      }
    } else if (st.kind === 'mail') {
      var sd = st.send, mlocked = sd.phase === 'sent' || sd.phase === 'sending';
      h += peopleHTML(st, mlocked);
      h += '<label class="k ns-k" for="nsSubject">Subject</label><input class="ns-in" id="nsSubject" maxlength="255"' + (mlocked ? ' readonly' : '') + ' value="' + esc(st.subject) + '">' +
        '<label class="sr" for="nsBody">Mail text</label><textarea id="nsBody"' + (mlocked ? ' readonly' : '') + ' placeholder="' + (st.drafting === 'loading' ? 'Claude is writing in your style…' : 'Write your mail…') + '">' + esc(st.body) + '</textarea>' +
        (ok.some(function (p) { return isExternal(p.email); }) ? '<div class="warn" data-outside>' + ico('warn', 'ico-sm') + 'Goes outside Planon. Check before sending.</div>' : '') +
        nsDraftNote(st) + aiNoteHTML(it) + problemHTML(sd);
      if (sd.phase === 'sent') h += '<div class="ns-done" data-ns-sent><span class="state-chip">' + ico('check') + 'Sent ' + esc(U.hhmm(sd.sentAt)) + ' · once</span>' + doneOffer(it) + '</div>';
      else {
        var ml = sd.phase === 'sending' ? 'Sending…' : sd.phase === 'unclear' ? (sd.confirm ? 'Yes, send again' : 'Send again anyway') : 'Send';
        h += '<button class="btn-send ns-go' + (sd.phase === 'unclear' ? ' is-confirm' : '') + '" data-ns-send' + (nsReady(st) && sd.phase !== 'sending' ? '' : ' aria-disabled="true"') + '>' + ico('send') + esc(ml) + '</button>';
      }
    } else {
      h += peopleHTML(st, false) +
        '<label class="sr" for="nsChase">Chase text</label><textarea id="nsChase" placeholder="' + (st.drafting === 'loading' ? 'Claude is writing a chase…' : 'Write your chase…') + '">' + esc(st.chase) + '</textarea>' +
        nsDraftNote(st) + aiNoteHTML(it) +
        '<div class="src-note">' + ico('warn', 'ico-sm') + '<span>Droplet can’t post in Teams, so it copies your text and opens a chat.</span></div>';
      if (st.chased) h += '<div class="ns-done" data-ns-sent><span class="state-chip">' + ico('check') + 'Copied ' + esc(U.hhmm(st.chased)) + '</span>' + doneOffer(it) + '</div>';
      h += '<button class="btn-send ns-go" data-ns-chase' + (nsReady(st) ? '' : ' aria-disabled="true"') + '>' + ico('copy') + (st.chased ? 'Copy & open again' : 'Copy & open in Teams') + '</button>';
    }
    return h + '</div>';
  }
  function nsProblem(inv) {
    if (inv.phase !== 'failed' && inv.phase !== 'unclear') return '';
    return '<div class="warn is-problem" role="alert" data-problem="' + esc(inv.phase) + '">' + ico('warn', 'ico-sm') + '<span>' + esc(inv.message) + '</span>' + diagHTML(inv) + '</div>';
  }
  function nsReady(st) {
    var ok = okPeople(st);
    if (!ok.length || openPeople(st).length) return false;
    if (st.kind === 'meeting') return st.slotState === 'ok' && !!st.slots[st.slot] && !!String(st.title).trim();
    if (st.kind === 'mail') return !!String(st.body).trim() && !!String(st.subject).trim();
    return !!String(st.chase).trim();
  }
  function nsGate() {
    var it = curAction(), st = it && S.ns[it.docId]; if (!st) return;
    var b = document.querySelector('[data-ns-invite], [data-ns-send], [data-ns-chase]');
    var busy = (st.inv && st.inv.phase === 'sending') || (st.send && st.send.phase === 'sending');
    if (b) { if (nsReady(st) && !busy) b.removeAttribute('aria-disabled'); else b.setAttribute('aria-disabled', 'true'); }
  }
  /* ---------------- Render: Jira and Confluence (backlog 11, 12) ---------------- */
  function paras(text) {
    var ps = String(text || '').split(/\n{2,}/).filter(function (p) { return p.trim(); });
    return ps.length ? ps.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') : '<p class="muted">(no text)</p>';
  }
  function jiraSourceHTML(it) {
    var d = S.detail[it.id] || {}, iss = d.state === 'ok' ? d.issue : null, h = '', mine0 = atl.me && atl.me.accountId;
    var status = iss ? iss.status : it.status;
    h += '<div class="mail-from"><span><b>' + esc(it.issueKey) + '</b>' + (status ? ' · ' + esc(status) : '') + (iss && iss.project ? ' · ' + esc(iss.project) : '') + '</span><span>' + esc(U.when(it.received, new Date())) + '</span></div>' +
      '<div class="mail-subj">' + esc(iss && iss.summary || it.title) + '</div>';
    if (iss) {
      h += '<div class="mail-body" id="mailBody" data-jira-desc>' + paras(U.clip(iss.description, 3000) ? iss.description.slice(0, 3000) : '') + '</div>';
      var cs = iss.comments.slice(-3);
      if (iss.comments.length > 3) h += '<p class="muted thread-more">' + (iss.comments.length - 3) + ' earlier comment' + (iss.comments.length - 3 === 1 ? '' : 's') + ' not shown</p>';
      if (cs.length) {
        h += '<div class="thread" data-jira-comments>' + cs.map(function (c) {
          var me = !!mine0 && c.accountId === mine0;
          return '<div class="msg' + (me ? ' me' : '') + '"><span class="av" aria-hidden="true">' + esc((me ? 'You' : c.author || '?').charAt(0).toUpperCase()) + '</span><div><div class="msg-h"><b>' + esc(me ? 'You' : c.author || 'Someone') + '</b>' +
            esc(U.when(c.created, new Date())) + '</div><div class="msg-t">' + esc(U.clip(c.text, 1200) ? c.text.slice(0, 1200) : '') + '</div></div></div>';
        }).join('') + '</div>';
      }
    } else {
      h += '<div class="mail-body" id="mailBody"><p>' + esc(it.summary) + '</p><p class="muted">' + (d.state === 'error' ? 'Showing the notification; the issue couldn’t be read from Jira. <button data-reread>Try again</button>' : 'Loading the issue from Jira…') + '</p></div>';
    }
    if (iss && it.via === 'mail' && it.summary) h += '<p class="muted" data-jira-notice>Notification: ' + esc(U.clip(it.summary, 220)) + '</p>';
    var link = atl.safeLink(iss && iss.webUrl || it.webLink);
    if (link) h += '<div class="src-note">' + ico('out', 'ico-sm') + '<a href="' + esc(link) + '" target="_blank" rel="noopener noreferrer" data-jira-link>Open in Jira</a></div>';
    return h;
  }
  function pageSourceHTML(it) {
    var why = it.why0 === 'mention' ? 'You are mentioned' : 'A page you watch changed';
    return '<div class="mail-from"><span><b>' + esc(it.spaceName || it.spaceKey || 'Confluence') + '</b> · ' + esc(why) + '</span><span>' + esc(U.when(it.received, new Date())) + '</span></div>' +
      '<div class="mail-subj">' + esc(it.title || it.subject) + '</div>' +
      '<div class="mail-body" id="mailBody">' + paras(it.summary || '') + '</div>' +
      (it.senderName && it.senderName !== 'Confluence' ? '<p class="muted">By ' + esc(it.senderName) + '</p>' : '') +
      (atl.safeLink(it.webUrl) ? '' : '<p class="muted" data-nolink>Droplet has no safe link to this page.</p>');
  }
  function aiNoteHTML(it) {
    if (!S.aiUndo[it.id]) return '';
    return '<div class="ai-note" data-ai-note>' + ico('spark', 'ico-sm') + '<span>Updated by Claude</span><button data-ai-undo>Undo</button></div>';
  }
  function itemTop(it) {
    var top = topItems(), i = top.indexOf(it), inFocus = i > -1;
    return { inFocus: inFocus, n: inFocus ? i + 1 : restItems().indexOf(it) + top.length + 1 };
  }
  function metaHTML(it) {
    var fl = flag(it);
    return '<div class="iv-meta">' + srcHTML(it) + '<span class="sep" aria-hidden="true">·</span><span>' + esc(project(it)) + '</span>' +
      (fl ? '<span class="flag">' + esc(fl) + '</span>' : '') + meetingHTML(it) + '<span class="sep" aria-hidden="true">·</span><span>' + esc(U.when(it.received, new Date())) + '</span></div>';
  }
  function jiraItemHTML(it) {
    var r = rk(it), st = sendState(it.id), locked = st.phase === 'sent', busy = st.phase === 'sending', p = itemTop(it);
    var writing = S.drafting[it.id] === 'loading' && !S.touched[it.id];
    return headHTML(it, p.inFocus, p.n) +
      '<div class="iv-scroll' + (S.anim ? ' enter' : '') + '">' + metaHTML(it) +
        '<h2 class="iv-title" id="ivTitle" tabindex="-1">' + esc(titleOf(it)) + '</h2>' +
        '<div class="iv-why"><span class="who" aria-hidden="true">' + ico('spark') + '</span><p><span class="sr">Claude: </span>' + esc(r.why) + '</p></div>' +
        '<div class="sec-label">' + ico('jira') + 'From Jira</div>' +
        '<div class="card src-card">' + sourceHTML(it) + '</div>' +
        alsoHTML(it) +
        '<div class="sec-label">' + ico('spark') + 'Prepared comment · ' + esc(it.issueKey) + '</div>' +
        '<div class="card draft' + (locked ? ' is-locked' : '') + '" data-jira-draft>' +
          '<div class="draft-row"><span class="k">On</span><span class="chips"><span class="chip" data-to>' + esc(it.issueKey) + '</span></span></div>' +
          '<div class="draft-row"><span class="k">Via</span><span>Jira comment · posted with your click</span></div>' +
          '<label class="sr" for="draftText">Comment text</label>' +
          '<textarea id="draftText"' + (locked || busy ? ' readonly' : '') + (writing ? ' aria-busy="true"' : '') + ' placeholder="' + (writing ? 'Claude is writing a comment…' : 'Write your comment…') + '">' + esc(draftOf(it)) + '</textarea>' +
          aiNoteHTML(it) + problemHTML(st) +
          '<div class="draft-foot">' + draftFoot(it, locked, busy) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="iv-bar">' + barHTML(it) + '</div>';
  }
  function pageItemHTML(it) {
    var r = rk(it), p = itemTop(it);
    return headHTML(it, p.inFocus, p.n) +
      '<div class="iv-scroll' + (S.anim ? ' enter' : '') + '">' + metaHTML(it) +
        '<h2 class="iv-title" id="ivTitle" tabindex="-1">' + esc(titleOf(it)) + '</h2>' +
        '<div class="iv-why"><span class="who" aria-hidden="true">' + ico('spark') + '</span><p><span class="sr">Claude: </span>' + esc(r.why) + '</p></div>' +
        '<div class="sec-label">' + ico('confluence') + 'From Confluence</div>' +
        '<div class="card src-card">' + sourceHTML(it) + '</div>' +
        '<div class="ns-start"><button class="ns-btn" data-conf-ask' + (rt.sample ? '' : ' aria-disabled="true"') + '>' + ico('chat') + 'Ask Claude to update</button></div>' +
      '</div>' +
      '<div class="iv-bar">' + barHTML(it) + '</div>';
  }
  function askBtn() {
    return '<button class="qbtn" data-chat aria-haspopup="dialog" aria-keyshortcuts="c">' + ico('chat') + '<span>Ask Claude</span></button>';
  }
  function atlBarHTML(it, q) {
    var quiet = '<div class="quiet is-tight">' + askBtn() + q('notimp', 'down', 'Not important', 'n') + q('star', 'star', '<span class="q-l">Important</span>', '', S.verdict[it.id] === 'up') + q('done', 'check', 'Done', 'd') + '</div>';
    if (isPage(it)) {
      return quiet + '<button class="btn-send" id="sendBtn" data-open-page' + (atl.safeLink(it.webUrl) ? '' : ' aria-disabled="true"') + '>' + ico('out') + 'Open page</button>' +
        (S.doneNow[it.id] ? '<div class="sent-note">Marked done</div>' : '');
    }
    var st = sendState(it.id), empty = !String(S.drafts[it.id] || '').trim(), btn;
    if (st.phase === 'sent') btn = '<button class="btn-send is-sent" id="sendBtn" aria-disabled="true">Commented ✓ ' + U.hhmm(st.sentAt) + ' · locked</button>';
    else if (st.phase === 'sending') btn = '<button class="btn-send" id="sendBtn" aria-disabled="true" aria-busy="true">' + ico('send') + 'Posting…</button>';
    else if (st.phase === 'unclear') btn = '<button class="btn-send is-confirm" id="sendBtn" data-jira-post>' + (st.confirm ? 'Yes, post again' : 'Post again anyway') + '</button>';
    else btn = '<button class="btn-send" id="sendBtn" data-jira-post' + (empty ? ' aria-disabled="true"' : '') + '>' + ico('send') + 'Comment</button>';
    return quiet + btn + (st.phase === 'sent' ? '<div class="sent-note">Commented once · done</div>' : '');
  }

  function renderItem() {
    var col = $('itemCol');
    var it = S.cur && S.byId[S.cur];
    col.classList.toggle('is-idle', S.view !== 'item' || !it);
    if (S.view !== 'item' || !it) { col.innerHTML = emptyHTML(); return; }
    if (isWait(it)) { col.innerHTML = waitItemHTML(it); S.anim = false; return; }
    if (isJira(it)) { col.innerHTML = jiraItemHTML(it); S.anim = false; return; }
    if (isPage(it)) { col.innerHTML = pageItemHTML(it); S.anim = false; return; }
    if (isMine(it)) {
      var top0 = topItems(), i0 = top0.indexOf(it);
      col.innerHTML = actionItemHTML(it, i0 > -1, i0 > -1 ? i0 + 1 : restItems().indexOf(it) + top0.length + 1);
      S.anim = false;
      return;
    }
    var r = rk(it), st = sendState(it.id), locked = st.phase === 'sent', busy = st.phase === 'sending';
    var top = topItems(), rankIdx = top.indexOf(it), inFocus = rankIdx > -1;
    var n = inFocus ? rankIdx + 1 : restItems().indexOf(it) + top.length + 1;
    var fl = flag(it), dom = mail.meDomain ? [mail.meDomain] : [], tm = isTeams(it);
    var outside = tm ? (it.participants || []).some(function (a) { return a && !U.isInternal(a, dom); }) : !U.isInternal(it.sender, dom);
    var editable = !locked && !busy;
    var draftRows = tm
      ? '<div class="draft-row"><span class="k">To</span><span class="chips">' + (it.oneOnOne ? '<span class="chip" data-to>' + esc(it.senderName) + '</span>' : '<span class="chip" data-to>' + esc(it.subject) + '</span>') + '</span></div>' +
        '<div class="draft-row"><span class="k">Via</span><span>Teams chat · you post it</span></div>'
      : '<div class="draft-row"><span class="k">To</span><span class="chips"><span class="chip addr" data-to>' + esc(it.sender) + '</span></span></div>' +
        '<div class="draft-row"><span class="k">Subject</span><span>' + esc(/^re:/i.test(it.subject) ? it.subject : 'RE: ' + it.subject) + '</span></div>';
    var wait = tm && waitingTeams(it.id);
    var hint = draftFoot(it, locked, busy);
    var writing = S.drafting[it.id] === 'loading' && !S.touched[it.id];
    col.innerHTML =
      '<div class="iv-head">' +
        '<button class="btn-back" data-back aria-label="Back to the list">' + ico('back') + '<span class="lbl-phone">Back</span><span class="lbl-desk">Close</span></button>' +
        '<span class="iv-crumb" aria-label="Location"><span class="c-sec">' + (inFocus ? 'Do now' : 'Everything else') + '</span><span class="sep" aria-hidden="true">›</span>' +
          '<span class="c-n">#' + pad(n) + '</span><span class="sep" aria-hidden="true">›</span><b>' + esc(tag(it)) + '</b></span>' +
        '<span class="kbd" aria-hidden="true">Esc</span>' +
      '</div>' +
      '<div class="iv-scroll' + (S.anim ? ' enter' : '') + '">' +
        '<div class="iv-meta">' + srcHTML(it) + '<span class="sep" aria-hidden="true">·</span><span>' + esc(project(it)) + '</span>' +
          (fl ? '<span class="flag">' + esc(fl) + '</span>' : '') + meetingHTML(it) + '<span class="sep" aria-hidden="true">·</span><span>' + esc(U.when(it.received, new Date())) + '</span></div>' +
        '<h2 class="iv-title" id="ivTitle" tabindex="-1">' + esc(titleOf(it)) + '</h2>' +
        '<div class="iv-why"><span class="who" aria-hidden="true">' + ico('spark') + '</span><p><span class="sr">Claude: </span>' + esc(r.why) + '</p></div>' +
        '<div class="sec-label">' + ico(tm ? 'teams' : 'mail') + (tm ? 'From Teams' : 'From your inbox') + '</div>' +
        '<div class="card src-card">' + sourceHTML(it) + '</div>' +
        alsoHTML(it) +
        '<div class="sec-label">' + ico('spark') + (claudeDraft(it) ? 'Prepared draft' : 'Your reply') + (tm ? ' · Reply · Teams' : ' · Reply · mail') + '</div>' +
        '<div class="card draft' + (locked ? ' is-locked' : '') + '">' + draftRows +
          '<label class="sr" for="draftText">Draft text</label>' +
          '<textarea id="draftText"' + (editable ? '' : ' readonly') + (writing ? ' aria-busy="true"' : '') + ' placeholder="' + (writing ? 'Claude is writing a draft…' : 'Write your reply…') + '">' + esc(draftOf(it)) + '</textarea>' +
          (outside ? '<div class="warn" data-outside>' + ico('warn', 'ico-sm') + 'Goes outside Planon. Check before sending.</div>' : '') +
          (wait ? '<div class="warn is-wait" data-waiting>' + ico('clock', 'ico-sm') + '<span>Waiting for you to send in Teams · copied ' + esc(U.hhmm(new Date(wait.at))) + '. It clears on the next sync once your message is in the chat.</span></div>' : '') +
          (tm ? '<div class="src-note" data-teams-note>' + ico('warn', 'ico-sm') + '<span>Droplet can’t post in Teams (no permission), so it copies your reply and opens the chat.</span></div>' : '') +
          aiNoteHTML(it) + problemHTML(st) +
          '<div class="draft-foot">' + hint + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="iv-bar">' + barHTML(it) + '</div>';
    S.anim = false;
  }
  function barHTML(it) {
    var st = sendState(it.id), locked = st.phase === 'sent', busy = st.phase === 'sending';
    var q = function (key, icon, label, k, pressed) {
      return '<button class="qbtn" data-' + key + (key === 'star' ? ' title="Important"' : '') + (locked || busy ? ' aria-disabled="true"' : '') + (pressed !== undefined ? ' aria-pressed="' + pressed + '"' : '') +
        (k ? ' aria-keyshortcuts="' + k + '"' : '') + '>' + ico(icon) + '<span>' + label + '</span>' + (k ? '<span class="kbd" aria-hidden="true">' + k + '</span>' : '') + '</button>';
    };
    if (isWait(it)) return waitBarHTML(it);
    if (isMine(it)) {
      return '<div class="quiet">' + askBtn() + q('delete', 'trash', 'Delete') + q('notimp', 'down', 'Not important', 'n') +
        q('star', 'star', '<span class="q-l">Important</span>', '', S.verdict[it.id] === 'up') + '</div>' +
        '<button class="btn-send" id="sendBtn" data-done-primary>' + ico('check') + 'Done</button>';
    }
    var empty = !String(S.drafts[it.id] || '').trim(), btn;
    if (isTeams(it)) {
      btn = '<button class="btn-send" id="sendBtn" data-copyopen' + (empty ? ' aria-disabled="true"' : '') + '>' + ico('copy') +
        (waitingTeams(it.id) ? 'Copy & open again' : 'Copy & open in Teams') + '</button>';
    } else if (locked) btn = '<button class="btn-send is-sent" id="sendBtn" aria-disabled="true">Sent ✓ ' + U.hhmm(st.sentAt) + ' · locked</button>';
    else if (busy) btn = '<button class="btn-send" id="sendBtn" aria-disabled="true" aria-busy="true">' + ico('send') + 'Sending…</button>';
    else if (st.phase === 'unclear') btn = '<button class="btn-send is-confirm" id="sendBtn" data-send>' + (st.confirm ? 'Yes, send again' : 'Send again anyway') + '</button>';
    else btn = '<button class="btn-send" id="sendBtn" data-send' + (empty ? ' aria-disabled="true"' : '') + '>' + ico('send') + 'Send</button>';
    if (isJira(it) || isPage(it)) return atlBarHTML(it, q);
    return '<div class="quiet">' + askBtn() +
        q('notimp', 'down', 'Not important', 'n') + q('star', 'star', '<span class="q-l">Important</span>', '', S.verdict[it.id] === 'up') + q('done', 'check', 'Done', 'd') + '</div>' + btn +
      (locked ? '<div class="sent-note">' + (S.doneNow[it.id] ? 'Marked done · sent once' : 'Sent once') + '</div>' : '');
  }
  function renderPane() {
    var p = S.view === 'item' ? S.pane : 'list';
    $('listCol').classList.toggle('is-active', p === 'list');
    $('itemCol').classList.toggle('is-active', p === 'item');
  }
  function renderList() { renderHeader(); renderFocus(); renderRest(); }
  /* As renderAll, but whoever is typing in the item keeps focus and caret. */
  function renderAllKeepFocus() {
    if (S.view === 'item' && !S.byId[S.cur]) return renderAll();
    $('app').setAttribute('data-view', S.view);
    root.setAttribute('data-view', S.view);
    renderList(); rerenderItemKeepFocus(); renderPane();
  }
  function renderAll() {
    if (S.view === 'item' && !S.byId[S.cur]) { S.view = 'list'; S.cur = null; }
    $('app').setAttribute('data-view', S.view);
    root.setAttribute('data-view', S.view);
    renderList(); renderItem(); renderPane();
  }
  /* Re-render the item but keep focus and caret where they were. */
  function rerenderItemKeepFocus() {
    var a = document.activeElement, id = a && a.id, sel = a && a.selectionStart, end = a && a.selectionEnd;
    renderItem();
    if (id && $(id)) { $(id).focus({ preventScroll: true }); try { if (sel != null) $(id).setSelectionRange(sel, end); } catch (e) { /* not a text field */ } }
  }

  /* ---------------- Toast ---------------- */
  function toast(msg, undo) {
    clearTimeout(S.toastTimer);
    $('toastHost').innerHTML = '<div class="toast"><span>' + esc(msg) + '</span>' + (undo ? '<button data-undo>Undo</button>' : '') + '</div>';
    S.undo = undo || null;
    S.toastTimer = setTimeout(function () { $('toastHost').innerHTML = ''; S.undo = null; }, 8000);
  }

  /* ---------------- Loading: saved state first, then each source on its own ----------------
     What Droplet remembers (your own actions, waits, cached rankings) is
     shown as soon as it is read. Mail, Teams, Atlassian, the calendar and
     get_me each update the list when they arrive; each is bounded by a
     timeout, so a consent prompt nobody answers or a stalled connector
     turns into one quiet line of its own and never blocks the rest. */
  var CORE = ['saved', 'me', 'mail', 'teams', 'atl', 'cal'];
  var SRC_NAME = { saved: 'Saved items', me: 'Your profile', mail: 'Mail', teams: 'Teams', atl: 'Jira and Confluence', cal: 'Calendar',
    waits: 'Waiting on others', tx: 'Meeting transcripts', rank: 'Claude ranking', perms: 'Permissions' };
  var LOADING_TEXT = { saved: 'Loading your saved items…', mail: 'Loading mail…', teams: 'Loading Teams chats…', atl: 'Loading Jira and Confluence…' };
  S.src = {}; S.srcMail = []; S.srcTeams = []; S.jiraRaw = null; S.jiraFirst = null; S.calWanted = false; S.savedOk = false;
  function srcState(k) { return S.src[k] || (S.src[k] = { state: 'idle', code: '', at: null, err: '', errAt: null, seq: 0, note: '' }); }
  function busy(k) { return srcState(k).state === 'loading'; }
  function coreBusy() { return CORE.some(busy) || (S.calWanted && S.items.length > 0); }
  function setSrc(k, state, e) {
    var s = srcState(k);
    s.state = state; s.at = new Date();
    s.code = e ? String(e.code || 'error') : '';
    if (e) { s.err = U.redact(e.message || e.code || ''); s.errAt = s.at; }
    S.loading = CORE.some(busy);
    if (S.diagOpen) renderDiag();
  }
  /* Runs one source, bounded by ms. Resolves {ok, r} | {ok: false, e} |
     {stale: true} when a newer run of the same source started meanwhile. */
  function run(k, make, ms) {
    var s = srcState(k), seq = ++s.seq, p;
    setSrc(k, 'loading');
    try { p = Promise.resolve(make()); } catch (e) { p = Promise.reject(e); }
    return rt.timeout(p, ms, SRC_NAME[k]).then(function (v) {
      if (seq !== s.seq) return { stale: true };
      setSrc(k, 'ok'); return { ok: true, r: v };
    }, function (e) {
      if (seq !== s.seq) return { stale: true };
      e = e && typeof e === 'object' ? e : { code: 'upstream_error', message: String(e || '') };
      setSrc(k, e.code === 'timeout' ? 'timeout' : 'error', e); return { ok: false, e: e };
    });
  }

  function load(opts) {
    opts = opts || {};
    var now = new Date();
    if (opts.full || !S.savedOk) startSaved();
    startMe();
    startMail(now); startTeams(now); startAtl();
    S.calWanted = true;
    rebuild();
  }
  /* One source again (Try again on its line). */
  function reloadSource(k) {
    var now = new Date();
    if (k === 'store') return startSaved();
    if (k === 'mail') { startMail(now); S.calWanted = true; }
    if (k === 'teams') { if (!S.me) startMe(); startTeams(now); }
    if (k === 'atl') startAtl();
    rebuild();
  }

  function startSaved() {
    var late = null;
    run('saved', function () {
      return store.loadAll().then(function (r) {
        applySaved(r);
        late = r.late || null;
        if (!r.ok) throw r.error || { code: 'unavailable', message: 'Some saved items could not be read.' };
        return r;
      });
    }, rt.cfg.storeMs + 2000).then(function (x) {
      if (x.stale) return;
      if (late) late.then(function (full) {
        /* The read that timed out arrived after all. */
        applySaved(full); setSrc('saved', 'ok'); arrived();
      }, function () { /* never arrived */ });
      arrived();
    });
  }
  function applySaved(r) {
    if (!r) return;
    S.rankings = Object.assign({}, r.rankings || {}, S.rankings);
    S.doneDb = Object.assign({}, r.done || {}, S.doneDb || {});
    S.sentDb = Object.assign({}, r.sent || {}, S.sentDb || {});
    S.handoffDb = Object.assign({}, r.handoff || {}, S.handoffDb || {});
    /* Actions added while this was loading stay. */
    S.actions = Object.assign({}, r.actions || {}, S.actions);
    S.waits = Object.assign({}, r.waits || {}, S.waits);
    S.asksDb = Object.assign({}, r.asks || {}, S.asksDb);
    S.meetingsDb = Object.assign({}, r.meetings || {}, S.meetingsDb);
    var have = {};
    S.feedback.forEach(function (f) { have[f.key] = 1; });
    S.feedback = S.feedback.concat((r.feedback || []).filter(function (f) { return !have[f.key]; }));
    var v = {};
    S.feedback.forEach(function (f) { if (f.msgId && !v[f.msgId]) v[f.msgId] = f.verdict; });
    S.verdict = Object.assign(v, S.verdict);
    if (r.ok) S.savedOk = true;
  }

  /* get_me. When it fails, the Atlassian account's email stands in (Teams
     and waits need to know which messages are yours); without either,
     Droplet runs with fewer features. */
  function startMe() {
    if (S.me && S.meFrom === 'm365' && !busy('me')) return;
    S.meP = run('me', mail.getMe, rt.cfg.callMs).then(function (x) {
      if (x.stale) return S.me;
      if (x.ok && x.r) { setMe(x.r, 'm365'); return S.me; }
      var am = atl.me ? Promise.resolve(atl.me) : atl.pending() ? rt.timeout(atl.pending(), Math.min(5000, rt.cfg.callMs)).then(null, function () { return null; }) : Promise.resolve(null);
      return am.then(function (a) {
        if (a && a.email && !(S.me && S.meFrom === 'm365')) setMe({ mail: a.email, displayName: a.name || '' }, 'atlassian');
        return S.me;
      });
    });
    S.meP.then(arrived);
  }
  function setMe(me, from) {
    S.me = me; S.meFrom = from;
    mail.meDomain = U.domainOf(me.mail);
    mail.meFirst = U.firstName(me.displayName);
  }
  function meReady() { return S.me && S.meFrom === 'm365' || !S.meP ? Promise.resolve(S.me) : S.meP; }

  function startMail(now) {
    run('mail', function () { return mail.loadInbox(now); }, rt.cfg.pageMs).then(function (x) {
      if (x.stale) return;
      if (x.ok) { S.mcpOk = true; S.syncAt = new Date(); S.srcMail = x.r.items; S.jiraRaw = x.r.jira || []; S.jiraFirst = null; S.mailErr = null; }
      else { S.mcpOk = false; S.mailErr = x.e; }
      arrived();
    });
  }
  function startTeams(now) {
    run('teams', function () {
      return teams.load(meReady(), now, function () { return mail.meDomain ? [mail.meDomain] : []; });
    }, rt.cfg.pageMs).then(function (x) {
      if (x.stale) return;
      if (x.ok) { S.teamsOk = true; S.srcTeams = x.r; S.teamsErr = null; if (srcState('mail').state === 'ok') S.syncAt = new Date(); }
      else { S.teamsOk = false; S.teamsErr = x.e; }
      arrived();
    });
  }
  function startAtl() {
    run('atl', atl.load, rt.cfg.pageMs).then(function (x) {
      if (x.stale) return;
      if (x.ok) { S.atlOk = true; S.atlItems = x.r.jql.concat(x.r.pages); S.atlErr = null; }
      else { S.atlOk = false; S.atlErr = x.e; }
      arrived();
    });
  }
  /* Today's calendar (R5): read once per sync, only when there are open
     items. Your own address is left out once get_me is known. */
  function maybeStartCal() {
    if (!S.calWanted || !S.items.length) return;
    S.calWanted = false;
    var now = new Date();
    run('cal', function () { return meet.load(function () { return S.me; }, now); }, rt.cfg.callMs + 1000).then(function (x) {
      if (x.stale) return;
      if (x.ok) { S.meetings = x.r || []; S.notes.cal = null; }
      else S.notes.cal = 'Couldn’t read today’s calendar, so meetings aren’t weighed this time.';
      arrived();
    });
  }

  /* A source settled: show what we have; when nothing is pending any more,
     rank and scan. */
  function arrived() {
    rebuild();
    if (!coreBusy()) finish(); else scheduleRank();
  }
  function finish() {
    var keep = {};
    S.items.forEach(function (m) { keep[m.id] = 1; });
    Object.keys(S.doneNow).forEach(function (id) { if (!keep[id]) delete S.doneNow[id]; });
    /* R4 for Teams: once your own message is in the chat, the chat is no
       longer an item. Only judged on a Teams read that worked. */
    if (srcState('teams').state === 'ok') Object.keys(S.handoff).forEach(function (id) {
      var it = S.byId[id];
      if (!it || it.key !== S.handoff[id].key) {
        if (S.handoff[id].key) { store.clearHandoff(S.handoff[id].key); if (S.handoffDb) delete S.handoffDb[S.handoff[id].key]; }
        delete S.handoff[id];
      }
    });
    S.loading = false; S.loaded = true;
    clearTimeout(S.rankTimer); S.rankTimer = null;
    renderAllKeepFocus();
    rankNew(false);
    scan();
    checkPerms();
  }
  /* Ranking runs on what has arrived, once the saved rankings are in (so
     cached items keep their place) and today's calendar is read. */
  function rankReady() { return !busy('saved') && !busy('cal') && !(S.calWanted && S.items.length); }
  function scheduleRank() {
    clearTimeout(S.rankTimer);
    S.rankTimer = setTimeout(function () { S.rankTimer = null; if (rankReady()) rankNew(false); }, rt.cfg.rankDebounceMs);
  }

  /* The list from every source's latest data. Items keep their objects
     where they can (a draft, a re-rank flag, the open item). */
  function rebuild() {
    try { rebuildInner(); } catch (e) { noteError('rebuild', e); try { renderAllKeepFocus(); } catch (e2) { noteError('render', e2); } }
  }
  function rebuildInner() {
    var now = new Date();
    var first = U.firstName((S.me || {}).displayName);
    if (S.jiraRaw && S.jiraFirst !== first) {
      S.jiraFirst = first;
      S.jiraMail = atl.fromMails(S.jiraRaw.filter(function (m) { return !!atl.jiraKind(m, first); }), first);
    }
    /* Jira: notification mails about a mention or a standstill (from Outlook), and
       Jira and Confluence searches (from Atlassian). One item per issue key. */
    var byIssue = {}, atlList = [];
    S.jiraMail.forEach(function (j) { byIssue[j.issueKey] = j; });
    S.atlItems.forEach(function (x) {
      var j = x.src === 'jira' && byIssue[x.issueKey];
      if (j) { j.status = j.status || x.status; j.projectName = j.projectName || x.projectName; if (!j.project0) j.project0 = x.project0; return; }
      atlList.push(x);
    });
    var all = S.srcMail.concat(S.srcTeams, S.jiraMail, atlList), doneIds = {};
    var items = all.filter(function (m) {
      var done = S.doneDb && S.doneDb[m.key] && !S.doneNow[m.id];
      /* A Jira item comes back when a newer notification arrives after your comment. */
      if (done && m.src === 'jira' && Date.parse(m.received) > (Date.parse(S.doneDb[m.key].at || '') || 0)) done = false;
      if (done) doneIds[m.id] = 1;
      return !done;
    });
    Object.keys(S.actions).forEach(function (docId) {
      var a = S.actions[docId], old = S.byId['mine:' + docId];
      var it = syncAction(old && isMine(old) ? old : mine.toItem(docId, a));
      if (a.done) doneIds[it.id] = 1; else items.push(it);
    });
    var wi = waitItemsNow(now);
    items = items.concat(wi.due); S.waitPre = wi.pre;
    items = items.filter(function (m) {
      try { attach(m); return true; } catch (e) { noteError('attach ' + (m.src || '?'), e); return !!m.src; }
    });
    /* R8: an item merged into one that is done is done too. */
    items = items.filter(function (m) { return !(m.r && m.r.dupOf && doneIds[m.r.dupOf]); });
    S.items = items;
    S.byId = {}; S.items.forEach(function (m) { S.byId[m.id] = m; });
    S.waitPre.forEach(function (m) { S.byId[m.id] = m; });
    computeNotes();
    maybeStartCal();
    renderAllKeepFocus();
  }
  /* Each source's own quiet line. The same failure as mail (no connector at
     all) needs no second line. */
  function computeNotes() {
    var ms = srcState('mail').state, mailBad = ms === 'error' || ms === 'timeout';
    S.notes.mail = mailBad ? rt.mcpCopy(S.mailErr, 'your Outlook mail') : null;
    var ts = srcState('teams').state, te = S.teamsErr;
    if ((ts === 'error' || ts === 'timeout') && te) {
      var same = mailBad && S.mailErr && (S.mailErr.code === te.code && te.code !== 'timeout' || te.code === 'no_me');
      S.notes.teams = same ? null : te.code === 'no_me' ? 'Couldn’t tell which Teams messages are yours, so Teams is left out for now.' : teamsCopy(te);
    } else S.notes.teams = null;
    var as = srcState('atl').state, ae = S.atlErr;
    if ((as === 'error' || as === 'timeout') && ae) {
      var sameA = mailBad && S.mailErr && S.mailErr.code === ae.code && ae.code !== 'timeout';
      S.notes.atl = sameA ? null : atlCopy(ae);
    } else S.notes.atl = null;
    var ss = srcState('saved').state;
    if (ss === 'error' || ss === 'timeout') S.notes.store = 'Couldn’t load your saved items.';
    else if (ss === 'ok' && !rt.db) S.notes.store = 'Droplet can’t save here, so done marks and ranking reset when you reload.';
    else if (ss === 'ok' && S.notes.store === 'Couldn’t load your saved items.') S.notes.store = null;
  }

  /* ---------------- Permissions (read without prompting; ask once, on a click) ---------------- */
  var PERM_WHAT = { mcp: 'Microsoft 365', sample: 'Claude', db: 'saving' };
  function checkPerms() {
    return rt.permState().then(function (p) {
      S.perm = p;
      if (!p) setSrc('perms', 'n/a');
      if (p) { var bad = rt.PERM_NAMES.filter(function (n) { return p[n] === 'denied'; }); setSrc('perms', bad.length ? 'error' : 'ok', bad.length ? { code: 'denied', message: 'Denied: ' + bad.join(', ') } : null); }
      renderNotes();
      return p;
    });
  }
  function permNote() {
    var p = S.perm; if (!p) return null;
    var denied = rt.PERM_NAMES.filter(function (n) { return p[n] === 'denied'; });
    if (denied.length) {
      var names = denied.map(function (n) {
        if (n !== 'mcp') return PERM_WHAT[n];
        var srv = Object.keys(p.servers || {}).filter(function (s) { return p.servers[s] === 'denied'; });
        return srv.length ? srv.join(' and ') : 'Microsoft 365';
      });
      var list = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0];
      return { kind: 'denied', text: 'Allow Droplet to use ' + list + ' in the artifact’s permissions, then reload.' };
    }
    var ask = rt.PERM_NAMES.filter(function (n) { return p[n] === 'prompt'; });
    if (ask.length && !S.permAsked) return { kind: 'prompt', text: 'Droplet needs access to your connectors.', names: ask };
    if (ask.length && S.permAsked === 'asking') return { kind: 'asking', text: 'Waiting for your answer in the permissions dialog…' };
    return null;
  }
  function allowPerms() {
    var n = permNote();
    if (!n || n.kind !== 'prompt' || S.permAsked) return;
    S.permAsked = 'asking'; renderNotes();
    rt.permRequest(n.names).then(function () {
      S.permAsked = 'done';
      return checkPerms();
    }).then(function (p) {
      /* Sources that failed while consent was pending get one more go. */
      if (p && rt.PERM_NAMES.every(function (k) { return p[k] !== 'prompt' && p[k] !== 'denied'; })) {
        var redo = ['mail', 'teams', 'atl'].filter(function (k) { var st = srcState(k).state; return st === 'error' || st === 'timeout'; });
        if (redo.length || srcState('saved').state !== 'ok') {
          if (srcState('saved').state !== 'ok') startSaved();
          if (srcState('me').state !== 'ok') startMe();
          var now = new Date();
          redo.forEach(function (k) { if (k === 'mail') startMail(now); else if (k === 'teams') startTeams(now); else startAtl(); });
          S.calWanted = true;
          rebuild();
        }
      }
    });
  }

  /* ---------------- Diagnostics (tap the status strip) ---------------- */
  var DIAG_KEYS = ['saved', 'me', 'mail', 'teams', 'atl', 'cal', 'waits', 'tx', 'rank', 'perms'];
  function hms(d) { return d ? U.hhmm(d) + ':' + pad(d.getSeconds()) : '··:··'; }
  function diagState(s) { return s.state === 'idle' ? 'not started' : s.state === 'error' ? 'error · ' + s.code : s.state; }
  function renderDiag() {
    var el = $('diag'); if (!el) return;
    el.hidden = !S.diagOpen;
    if (!S.diagOpen) return;
    var h = '<ul class="diag-list">';
    DIAG_KEYS.forEach(function (k) {
      var s = srcState(k), extra = k === 'me' && S.meFrom === 'atlassian' ? ' · using the Atlassian email' : '';
      h += '<li data-diag-src="' + k + '"><span class="d-name">' + esc(SRC_NAME[k]) + '</span>' +
        '<span class="d-state" data-state="' + esc(s.state) + '">' + esc(diagState(s) + extra) + '</span>' +
        '<span class="d-time">' + esc(hms(s.at)) + '</span>' +
        (s.err ? '<span class="d-msg">' + esc(U.clip(s.err, 120)) + (s.errAt ? ' · ' + esc(hms(s.errAt)) : '') + '</span>' : '') + '</li>';
    });
    h += '</ul><div class="diag-foot"><span>' + esc(capsLine()) + '</span><button data-diag-copy>Copy details</button></div>';
    el.innerHTML = h;
  }
  function capsLine() {
    var p = S.perm;
    return 'mcp ' + (rt.mcp ? 'yes' : 'no') + ' · sample ' + (rt.sample ? 'yes' : 'no') + ' · db ' + (rt.db ? 'yes' : 'no') +
      (p ? ' · permissions: ' + rt.PERM_NAMES.map(function (n) { return n + ' ' + p[n]; }).join(', ') : ' · permissions: n/a');
  }
  /* Plain text for a bug report: states, codes, times and counts. No mail
     content, no subjects, no addresses or links. */
  /* Any exception the page swallowed: kept for Copy details (message and
     the first frames only, no data). */
  S.errs = [];
  function noteError(where, e) {
    var msg = String(e && (e.message || e.code) || e).slice(0, 160);
    var st = String(e && e.stack || '').split('\n').slice(1, 4).map(function (l) { return l.trim().replace(/https?:\/\/[^\s)]*\//g, ''); }).join(' | ');
    S.errs.push(where + ': ' + msg + (st ? ' @ ' + st : ''));
    if (S.errs.length > 8) S.errs.shift();
  }
  D.noteError = noteError;
  window.addEventListener('error', function (ev) { noteError('page', ev.error || ev.message); });
  window.addEventListener('unhandledrejection', function (ev) { noteError('promise', ev.reason); });
  D.diagText = function () {
    var lines = ['Droplet diagnostics · ' + new Date().toISOString(), 'Capabilities: ' + capsLine()];
    DIAG_KEYS.forEach(function (k) {
      var s = srcState(k);
      lines.push(SRC_NAME[k] + ': ' + diagState(s) + (k === 'me' && S.meFrom ? ' (from ' + S.meFrom + ')' : '') + ' · ' + hms(s.at) +
        (s.err ? ' · last error ' + hms(s.errAt) + ': ' + U.redact(s.err) : ''));
    });
    var n = {};
    S.items.forEach(function (m) { n[m.src] = (n[m.src] || 0) + 1; });
    lines.push('Items: ' + (Object.keys(n).map(function (k) { return k + ' ' + n[k]; }).join(', ') || 'none') + ' · waiting (not due) ' + S.waitPre.length);
    rawLines().forEach(function (l) { lines.push(l); });
    lines.push('Errors: ' + (S.errs.length ? S.errs.map(function (x) { return U.redact(x); }).join(' || ') : 'none'));
    lines.push('Timeouts: call ' + rt.cfg.callMs + ' ms, page ' + rt.cfg.pageMs + ' ms, store ' + rt.cfg.storeMs + ' ms');
    return lines.join('\n');
  };
  /* One line per source: the SHAPE of its last raw answer (keys, types,
     content block types and lengths; never values) and counts per stage. */
  function rawLines() {
    var out = [], raw = rt.raw || {}, sr = store.raw || {};
    function sh(x) { return x || 'none yet'; }
    var cols = ['actions', 'waits', 'done', 'sent', 'rankings', 'handoff', 'asks', 'meetings', 'feedback'];
    var a = sr.actions;
    out.push('Saved raw: ' + (rt.db ? sh(a && a.shape) : 'in memory (no db)') + ' · ' + cols.map(function (c) {
      var r = sr[c];
      if (!r) return c + ' -';
      if (r.unknown) return c + ' (unknown shape)';
      return c + ' ' + r.docs + (c === 'actions' ? ' (open ' + r.open + ', done ' + r.done + ')' : '');
    }).join(', '));
    out.push('Profile raw: ' + sh(raw.get_me));
    var ms = mail.stats;
    out.push('Mail raw: ' + sh(ms && ms.shape) + (ms ? ' · raw objects ' + ms.raw + ' · parsed ' + ms.mail + ' · unread ' + ms.unread +
      (ms.unknownRead ? ' (no read flag ' + ms.unknownRead + ')' : '') + ' · after noise rules ' + (ms.afterNoise != null ? ms.afterNoise : '-') +
      ' · jira ' + (ms.jira != null ? ms.jira : '-') + ' · items ' + (ms.afterNoise != null ? ms.items : '-') + (ms.unparsed ? ' · unparsed' : '') : ''));
    var ts = teams.stats || { raw: 0, msgs: 0 };
    out.push('Teams raw: ' + sh(raw.chat_message_search) + ' · raw objects ' + ts.raw + ' · messages ' + ts.msgs + ' · items ' + S.srcTeams.length);
    out.push('Jira raw: ' + sh(raw.searchJiraIssuesUsingJql) + ' · Confluence raw: ' + sh(raw.searchConfluenceUsingCql));
    out.push('Calendar raw: ' + sh(raw.outlook_calendar_search));
    return out;
  }
  function toggleDiag() {
    S.diagOpen = !S.diagOpen;
    renderDiag();
    var b = $('diagBtn'); if (b) b.setAttribute('aria-expanded', S.diagOpen ? 'true' : 'false');
  }
  function copyDiag() {
    Promise.resolve(copyText(D.diagText())).then(function () { toast('Copied the details. Paste them into your report.'); },
      function () { toast('Couldn’t copy. Select the details and copy them.'); });
  }
  /* A saved ranking, a sent lock and a Teams hand-off, back on a fresh item. */
  function attach(m) {
    m.meeting = meet.forItem(m, S.meetings);
    var saved = S.rankings[m.key], meetKey = m.meeting ? m.meeting.key : '';
    var fix = function (t) {
      return m.src === 'teams' || m.src === 'wait' || m.src === 'jira' ? rank.normalizeChat(t, { sign: rank.signName(S.me) }) : rank.normalizeDraft(t, { senderFirst: m.senderName, sign: rank.signName(S.me) });
    };
    /* Drafts cached by an earlier version go through the same format safety net (idempotent).
       A ranking made without today's meeting (R5) is asked again. */
    /* Attach runs again whenever a source arrives: a ranking already on the
       item stays, unless today's calendar now puts a meeting on it. */
    if (m.r && saved && m.r === saved && saved.v === 1 && (saved.meet || '') !== meetKey) { delete m.r; if (saved.draft) m.lazyDraft = saved.draft; }
    else if (m.r) saved = null;
    if (!saved) { /* nothing (new) to attach */ }
    else if (saved.v === 1 && (saved.meet || '') === meetKey) { m.r = saved; if (saved.draft) saved.draft = fix(saved.draft); }
    else if (saved.v === 1 && saved.draft) m.lazyDraft = fix(saved.draft);
    else if (saved.draftOnly && typeof saved.draft === 'string') m.lazyDraft = fix(saved.draft);
    var sent = S.sentDb && S.sentDb[m.key];
    if (sent && (!S.send[m.id] || S.send[m.id].phase === 'idle')) S.send[m.id] = { phase: 'sent', sentAt: new Date(sent.sentAt) };
    var ho = S.handoffDb && S.handoffDb[m.key];
    if (ho && !S.handoff[m.id]) S.handoff[m.id] = ho;
    if (isWait(m) && m.r) m.r.why = m.whyText;
  }

  /* ---------------- R3 waits and R6 meetings: the scan ----------------
     Runs after the list is shown. Sent mail and your Teams messages of the
     last 10 days → asks → waits; replies answer them. Ended meetings with a
     transcript → your commitments → own actions. */
  function waitItemsNow(now) {
    var due = [], pre = [], dom = mail.meDomain ? [mail.meDomain] : [];
    Object.keys(S.waits).forEach(function (docId) {
      var w = S.waits[docId];
      if (!w || w.status !== 'open') return;
      var it = waits.toItem(docId, w, now, dom);
      if (it.due || S.doneNow[it.id]) due.push(it); else pre.push(it);
    });
    pre.sort(function (a, b) { return String(a.received).localeCompare(String(b.received)); });
    return { due: due, pre: pre };
  }
  /* Rebuild the wait items in the list from S.waits. */
  function refreshWaits() {
    var now = new Date(), wi = waitItemsNow(now);
    S.items = S.items.filter(function (m) { return !isWait(m); });
    Object.keys(S.byId).forEach(function (id) { if (/^wait:/.test(id)) delete S.byId[id]; });
    wi.due.forEach(function (m) { attach(m); S.items.push(m); S.byId[m.id] = m; });
    S.waitPre = wi.pre;
    wi.pre.forEach(function (m) { S.byId[m.id] = m; });
  }
  function scan() {
    if (S.scanning || !S.me || !S.me.mail || !rt.mcp) return Promise.resolve();
    var now = new Date(), before = {};
    S.items.forEach(function (m) { before[m.id] = 1; });
    S.scanning = true;
    /* Waits and transcripts each show up in the list as soon as they are read. */
    function merge() {
      refreshWaits();
      Object.keys(S.actions).forEach(function (docId) {
        var a = S.actions[docId], id = 'mine:' + docId;
        if (a && !a.done && !S.byId[id]) { var it = syncAction(mine.toItem(docId, a)); attach(it); S.items.push(it); S.byId[id] = it; }
      });
      renderAllKeepFocus();
    }
    function part(k, fn) {
      setSrc(k, 'loading');
      var p;
      try { p = Promise.resolve(fn(now)); } catch (e) { p = Promise.reject(e); }
      return p.then(function () { if (busy(k)) setSrc(k, 'ok'); }, function (e) {
        e = e || {}; setSrc(k, e.code === 'timeout' ? 'timeout' : 'error', e);
      }).then(merge);
    }
    return Promise.all([part('waits', scanWaits), part('tx', scanMeetings)]).then(function () {
      /* Only something new is ranked; earlier unranked items wait for Try again. */
      var added = S.items.some(function (m) { return !before[m.id] && !m.r; });
      S.scanning = false;
      renderAllKeepFocus();
      return added ? rankNew(false) : null;
    });
  }
  function scanWaits(now) {
    var ok = function (r) { return { ok: true, r: r }; }, bad = function (e) { return { ok: false, e: e }; };
    return Promise.all([waits.loadSent().then(ok, bad), teams.search(waits.DAYS, 4).then(ok, bad)]).then(function (got) {
      var sent = got[0].ok ? got[0].r : [], chats = got[1].ok ? got[1].r : [];
      S.sentMsgs = sent; S.teams10 = chats;
      S.notes.waits = !got[0].ok && S.mcpOk ? 'Couldn’t read your sent mail, so “waiting on others” may miss some.' : null;
      if (!got[0].ok) setSrc('waits', got[0].e && got[0].e.code === 'timeout' ? 'timeout' : 'error', got[0].e || {});
      var cutoff = now.getTime() - waits.DAYS * 864e5 - 36e5;
      var msgs = sent.concat(waits.ownTeams(chats, S.me)).filter(function (m) { return m.t >= cutoff && !S.asksDb[m.key]; })
        .sort(function (a, b) { return b.t - a.t; });
      var detect = !msgs.length || !rt.sample ? Promise.resolve() : waits.batches(msgs).reduce(function (p, batch) {
        return p.then(function () {
          return waits.ask({ me: S.me, now: now, msgs: batch }).then(function (v) {
            batch.forEach(function (m) {
              var asks = v[m.key];
              if (!asks) return; /* Claude skipped it: asked again next time */
              asks.forEach(function (a, i) {
                var doc = waits.docFor(m, a), id = waits.docId(m, i);
                if (S.waits[id] || waits.covered(S.waits, doc)) return;
                S.waits[id] = doc; store.setWait(id, doc);
              });
              var c = { at: now.toISOString(), n: asks.length };
              S.asksDb[m.key] = c; store.setAsk(m.key, c);
            });
          }, function () { /* Claude couldn't answer: these are checked again on the next sync */ });
        });
      }, Promise.resolve());
      return detect.then(function () {
        var open = Object.keys(S.waits).filter(function (k) { return S.waits[k].status === 'open'; });
        if (!open.length) return;
        var needMail = open.some(function (k) { return S.waits[k].src === 'mail'; });
        return (needMail ? waits.loadReplies().then(ok, bad) : Promise.resolve({ ok: false })).then(function (rep) {
          open.forEach(function (k) {
            var w = S.waits[k];
            if (w.src === 'mail' && !rep.ok) return;
            if (w.src === 'teams' && !got[1].ok) return;
            if (waits.answered(w, rep.ok ? rep.r : [], chats, S.me)) {
              w.status = 'answered'; w.answeredAt = now.toISOString();
              store.setWait(k, w);
            }
          });
        });
      });
    });
  }
  function scanMeetings(now) {
    if (!rt.sample) return Promise.resolve();
    return tx.loadEvents(now).then(function (evs) {
      return evs.filter(function (e) { return !S.meetingsDb[e.key]; }).reduce(function (p, ev) {
        return p.then(function () { return meetingOnce(ev, now); });
      }, Promise.resolve());
    }, function () { /* the calendar is read again on the next sync */ });
  }
  function cacheMeeting(ev, d) {
    d = Object.assign({ at: new Date().toISOString(), subject: U.clip(ev.subject, 160) }, d);
    S.meetingsDb[ev.key] = d; store.setMeeting(ev.key, d);
  }
  /* One meeting: read once; "no transcript" is remembered quietly. */
  function meetingOnce(ev, now) {
    return tx.readEvent(ev).then(function (d) {
      if (d.isCancelled || !d.transcriptUrl) return cacheMeeting(ev, { state: 'none' });
      return tx.readTranscript(d.transcriptUrl).then(function (t) {
        if (!t) return cacheMeeting(ev, { state: 'none' });
        var mineAddr = String(S.me.mail || '').toLowerCase();
        var others = d.attendees.filter(function (p) { return p.email !== mineAddr; });
        var existing = Object.keys(S.actions).filter(function (k) { return !S.actions[k].done; }).map(function (k) { return S.actions[k].text; });
        return tx.extract({ me: S.me, now: now, subject: d.subject || ev.subject, start: ev.start, attendees: others, text: t.text, lines: t.lines, existing: existing }).then(function (list) {
          var made = 0;
          list.forEach(function (c) {
            if (existing.some(function (x) { return tx.similar(x, c.what); })) return;
            var docId = mine.newId(), a = {
              text: mine.clean(c.what), created: new Date().toISOString(), done: false, doneAt: null, due: c.due || null, dueBy: c.due ? 'claude' : null, notes: '',
              origin: { eventId: ev.id, quote: c.quote, subject: U.clip(d.subject || ev.subject, 160), date: new Date(ev.start).toISOString(), kind: c.kind, who: c.who, project: c.project || null,
                attendees: others.slice(0, 20) }
            };
            S.actions[docId] = a; store.setAction(docId, a); existing.push(a.text); made++;
          });
          cacheMeeting(ev, { state: 'done', n: made });
        }, function () { /* Claude couldn't answer: read again on the next sync */ });
      });
    }, function () { /* the event couldn't be read: tried again on the next sync */ });
  }
  function atlCopy(e) {
    var code = e && e.code;
    if (code === 'needs_reauth') return 'Reconnect Atlassian Rovo in claude.ai Settings → Connectors.';
    if (code === 'server_not_connected' || code === 'server_not_found') return 'Add Atlassian Rovo in claude.ai Settings → Connectors.';
    return 'Couldn’t reach Atlassian.';
  }
  function teamsCopy(e) {
    var c = rt.mcpCopy(e, 'Teams');
    return /Outlook/.test(c) ? c.replace(/this Outlook action/, 'Teams').replace(/Outlook/, 'Teams') : c;
  }

  function rankNew(refresh) {
    /* One ranking at a time; anything added meanwhile is ranked right after. */
    if (S.ranking) { S.rankAgain = true; return S.rankRun || Promise.resolve(); }
    var fresh = S.items.filter(function (m) { return (!m.r || m.rerank) && !actionDone(m); });
    if (!fresh.length) { S.notes.rank = null; renderList(); return Promise.resolve(); }
    if (!rt.sample) {
      S.notes.rank = 'Claude isn’t available here, so new mail is newest first.';
      fresh.forEach(function (m) { if (S.fresh[m.id]) { delete S.fresh[m.id]; placedToast(m); } });
      renderAll();
      return Promise.resolve();
    }
    S.ranking = fresh.length; S.rankingTeams = fresh.some(isTeams); setSrc('rank', 'loading'); renderList();
    var ranked = visible().filter(function (m) { return m.r && !m.rerank; }).map(function (m) { return { id: m.id, src: m.src, subject: titleOf(m), senderName: m.senderName, group: groupOf(m) }; });
    var run = S.rankRun = rank.ask({ me: S.me, now: new Date(), items: fresh, ranked: ranked, feedback: S.feedback }, refresh).then(function (v) {
      var existing = S.items.filter(function (m) { return m.r && !m.rerank && isFinite(m.r.pos); }).map(function (m) { return { id: m.id, pos: m.r.pos }; });
      var got = Object.keys(v.byId).map(function (id) { return { id: id, rank: v.byId[id].rank }; });
      var pos = rank.assignPositions(existing, got);
      var at = new Date().toISOString(), writes = [];
      Object.keys(v.byId).forEach(function (id) {
        var m = S.byId[id]; if (!m) return;
        var r = Object.assign({ v: 1, pos: pos[id], rankedAt: at, meet: m.meeting ? m.meeting.key : '' }, v.byId[id]);
        if (!r.draft && m.lazyDraft) r.draft = m.lazyDraft;
        m.r = r; S.rankings[m.key] = r; delete m.rerank;
        if (isMine(m)) enrichAction(m, r); else applyClaudeDraft(m);
        writes.push([m.key, r]);
      });
      writes.reduce(function (p, w) { return p.then(function () { return store.putRanking(w[0], w[1]); }); }, Promise.resolve());
      var missing = fresh.filter(function (m) { return !m.r; }).length;
      S.notes.rank = missing ? 'Claude skipped ' + missing + (fresh.some(isTeams) ? ' item' : ' mail') + (missing === 1 ? '' : 's') + '; those are newest first.' : null;
    }, function (e) {
      S.notes.rank = rt.sampleCopy(e) + ', so new mail is newest first.';
      setSrc('rank', e && e.code === 'timeout' ? 'timeout' : 'error', e || {});
    }).then(function () {
      S.ranking = 0; S.rankingTeams = false; S.rankRun = null;
      if (busy('rank')) setSrc('rank', 'ok');
      var placed = fresh.filter(function (m) { return S.fresh[m.id]; });
      placed.forEach(function (m) { delete S.fresh[m.id]; });
      renderAllKeepFocus();
      placed.forEach(placedToast);
      var cur = S.view === 'item' && S.byId[S.cur];
      if (cur) ensureDraft(cur);
      if (S.rankAgain) { S.rankAgain = false; return rankNew(false); }
    });
    return run;
  }
  /* Claude's enrichment of your own action: the due date it read from the
     text (yours always wins). Project, why and rank live in the ranking. */
  function enrichAction(m, r) {
    var a = S.actions[m.docId]; if (!a) return;
    if (r.due && a.dueBy !== 'you' && r.due !== a.due) {
      a.due = r.due; a.dueBy = 'claude';
      store.setAction(m.docId, a);
      syncAction(m);
    }
  }
  /* Where a just-added action landed. */
  function placedToast(m) {
    if (!S.byId[m.id] || actionDone(m)) return;
    var top = topItems(), i = top.indexOf(m);
    if (i > -1) toast('Added to Do now at #' + (i + 1) + '.');
    else toast('Added under Everything else' + (m.due ? ' (' + mine.dueLabel(m.due).toLowerCase() + ')' : '') + '.');
  }

  /* A draft for a mail Claude skipped while ranking: one sample call when it
     opens, stored with its ranking so it is written once. */
  function saveLazyDraft(it, text) {
    it.lazyDraft = text;
    if (it.r && !it.r.fallback && it.r.v === 1) {
      it.r.draft = text; S.rankings[it.key] = it.r;
      return store.putRanking(it.key, it.r);
    }
    var doc = { draftOnly: true, v: 0, draft: text, rankedAt: new Date().toISOString() };
    S.rankings[it.key] = doc;
    return store.putRanking(it.key, doc);
  }
  function ensureDraft(it, again) {
    if (!it || isMine(it) || isPage(it) || claudeDraft(it) || S.touched[it.id] || sendState(it.id).phase !== 'idle') return;
    var ds = S.drafting[it.id];
    if (ds === 'loading' || (ds && !again)) return;
    if (S.ranking && !it.r) return; /* the running ranking writes one; checked again when it ends */
    if (!rt.sample) return;
    var id = it.id;
    S.drafting[id] = 'loading';
    if (isCur(id)) rerenderItemKeepFocus();
    (isWait(it) ? Promise.resolve(null) : readDetail(it)).then(function (d) {
      return rank.askDraft({ me: S.me, now: new Date(), item: it, mailText: sourceText(it, d) });
    }).then(function (text) {
      S.drafting[id] = null;
      saveLazyDraft(it, text);
      applyClaudeDraft(it);
    }, function (e) {
      S.drafting[id] = { error: rt.sampleCopy(e) };
    }).then(function () { if (isCur(id)) rerenderItemKeepFocus(); });
  }

  /* ---------------- Item: open, read ---------------- */
  function readDetail(it) {
    var d = S.detail[it.id];
    if (d && (d.state === 'ok' || d.state === 'loading')) return d.promise || Promise.resolve(d);
    d = S.detail[it.id] = { state: 'loading' };
    var read = isTeams(it) ? teams.read(it) : isJira(it) ? atl.readIssue(it.issueKey).then(function (iss) { return { issue: iss }; }) : mail.read(it);
    d.promise = read.then(function (x) {
      S.detail[it.id] = Object.assign({ state: 'ok' }, x);
      if (isJira(it)) jiraCheckDone(it, x.issue);
    }, function (e) {
      S.detail[it.id] = { state: 'error', code: String(e && e.code || 'unknown'), message: U.clip(e && e.message || '', 140) };
    }).then(function () {
      if (S.view === 'item' && S.cur === it.id) {
        var body = document.querySelector('.src-card');
        if (body) body.innerHTML = sourceHTML(it);
      }
      return S.detail[it.id];
    });
    return d.promise;
  }
  /* The source as plain text for Claude: the mail, or the chat's newest messages. */
  function sourceText(it, d) {
    d = d || S.detail[it.id];
    if (isJira(it)) {
      var iss = d && d.state === 'ok' ? d.issue : null;
      if (!iss) return (it.status ? 'Status: ' + it.status + '\n' : '') + 'Notification: ' + (it.summary || '');
      return 'Status: ' + iss.status + (iss.project ? ' · project ' + iss.project : '') + '\nSummary: ' + iss.summary + '\n\nDescription:\n' + U.clip(iss.description, 2500) +
        '\n\nLatest comments:\n' + iss.comments.slice(-4).map(function (c) { return c.author + ' (' + U.whenLong(c.created) + '): ' + U.clip(c.text, 500); }).join('\n') +
        (it.summary ? '\n\nNotification: ' + U.clip(it.summary, 400) : '');
    }
    if (isPage(it)) return it.summary || '';
    if (isMine(it)) return '';
    if (!isTeams(it)) return d && d.state === 'ok' ? d.text : '';
    var texts = d && d.state === 'ok' ? d.texts || {} : {};
    return it.msgs.map(function (m) { return (m.me ? 'You' : m.name) + ' (' + U.whenLong(m.at) + '): ' + (texts[m.id] || m.text || ''); }).join('\n');
  }
  function openItem(id, focusDraft) {
    var it = S.byId[id]; if (!it) return;
    if (S.view === 'list') S.scrollY = window.scrollY;
    S.cur = id; S.view = 'item'; S.pane = 'item'; S.anim = true; S.chatOpen = false;
    if (!isMine(it)) draftOf(it);
    S.confirmDel = null;
    renderAll();
    if (isWait(it)) ensureDraft(it);
    else if (!isMine(it) && !isPage(it)) { readDetail(it); ensureDraft(it); }
    if (!desk()) window.scrollTo(0, 0);
    var t = focusDraft && !isSent(id) ? $('draftText') : $('ivTitle');
    if (t) {
      t.focus({ preventScroll: desk() });
      if (t.id === 'draftText') { try { t.setSelectionRange(t.value.length, t.value.length); } catch (e) { /* ignore */ } }
    }
  }
  function back() {
    var prev = S.cur;
    S.view = 'list'; S.pane = 'list'; S.cur = null; S.chatOpen = false;
    renderAll();
    if (!desk()) window.scrollTo(0, S.scrollY || 0);
    var el = prev && document.querySelector('[data-open="' + (window.CSS && CSS.escape ? CSS.escape(prev) : prev) + '"]');
    if (el) el.focus({ preventScroll: true });
  }

  /* ---------------- Send (one click, once) ---------------- */
  function onSend() {
    var id = S.cur, it = S.byId[id]; if (!it) return;
    var st = sendState(id);
    if (st.phase === 'sending' || st.phase === 'sent') return;
    if (isWait(it) && !chaseByMail(it)) return;
    var text = String(S.drafts[draftKey(it)] || '').trim(); if (!text) return;
    var t = performance.now();
    if (st.phase === 'unclear') {
      if (t < (st.armAt || 0)) return;
      if (!st.confirm) { st.confirm = 1; st.armAt = t + 700; renderItem(); var b = $('sendBtn'); if (b) b.focus(); return; }
    }
    var reuse = st.draftId ? { draftId: st.draftId, link: st.draftLink, text: st.draftText } : null;
    S.send[id] = st = { phase: 'sending', draftId: st.draftId, draftLink: st.draftLink, draftText: st.draftText };
    renderItem(); renderFocus();
    var d = S.detail[id], w = waitDoc(it);
    /* A chase by mail replies to your own sent mail, to the person asked. */
    var target = w ? { id: w.ref.id, sender: w.who.email } : it;
    var conv = w ? mail.read({ uri: mail.uriFor(w.ref.id) }).then(function (x) { return Object.assign({ state: 'ok' }, x); },
      function (e) { return { state: 'error', code: String(e && e.code || 'unknown'), message: U.clip(e && e.message || '', 140) }; })
      : d && d.state === 'ok' ? Promise.resolve(d) : readDetail(it);
    conv.then(function (dd) {
      if (!dd || dd.state !== 'ok' || !dd.conversationId) {
        return { phase: 'failed', step: flow.STEPS.original, code: dd && dd.state === 'ok' ? 'no_conversation_id' : (dd && dd.code) || 'unknown',
          detail: dd && dd.message || '', message: 'Couldn’t read the original mail from Outlook, so nothing was sent. Try again.' };
      }
      return flow.send({ item: target, text: text, conversationId: dd.conversationId, reuse: reuse });
    }).then(function (res) {
      var ns = S.send[id] = { phase: res.phase, message: res.message || '', sentAt: res.sentAt, draftId: res.draftId || '', draftLink: res.draftLink || '', draftText: res.draftText || '',
        step: res.step || '', code: res.code || '', detail: res.detail || '', safeDetail: res.safeDetail || '' };
      if (res.phase === 'unclear') { ns.confirm = 0; ns.armAt = performance.now() + 700; }
      if (res.phase === 'blocked' && !res.keepDraft) { ns.draftId = ''; }
      if (res.phase === 'sent' && w) {
        S.doneNow[id] = { how: 'sent' };
        w.chasedAt = res.sentAt.toISOString(); store.setWait(it.docId, w);
        toast('Chase sent by mail.');
      } else if (res.phase === 'sent') {
        S.doneNow[id] = { how: 'sent' };
        store.setDone(it.key, { at: new Date().toISOString(), how: 'sent', sentAt: res.sentAt.toISOString() });
        store.setSent(it.key, { sentAt: res.sentAt.toISOString() });
        if (S.sentDb) S.sentDb[it.key] = { sentAt: res.sentAt.toISOString() };
        S.chatOpen = false;
        toast('Sent. Marked done.', function () { undoDone(id); });
      }
      renderAll();
      var b = $('sendBtn'); if (b && S.cur === id) b.focus({ preventScroll: true });
    });
  }
  function undoDone(id) {
    var it = S.byId[id]; if (!it) return;
    delete S.doneNow[id];
    if (S.doneDb) delete S.doneDb[it.key];
    store.clearDone(it.key);
    renderAll();
  }

  /* "Copy details": one line with step, code and message; no mail content, no addresses. */
  function copyDetails() {
    var st = S.cur && S.send[S.cur];
    if (!st || !st.step) { var nx = nsTarget(); st = nx && (nx[1].send.step ? nx[1].send : nx[1].inv); }
    if (!st || !st.step) return;
    var line = flow.detailsLine(st);
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = line; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      return ok;
    }
    var p;
    try { p = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(line) : Promise.reject(); } catch (e) { p = Promise.reject(); }
    Promise.resolve(p).then(function () { return true; }, function () { return fallback(); }).then(function (ok) {
      toast(ok ? 'Copied the details (no mail content).' : 'Couldn’t copy. The details are shown on the card.');
    });
  }

  /* ---------------- Teams: copy & open (Droplet can't post) ----------------
     Copies the edited text, opens the chat (only on teams.microsoft.com),
     and marks the item as waiting for you to post it. It never calls a tool. */
  function copyOpen() {
    var id = S.cur, it = S.byId[id]; if (!it || !(isTeams(it) || isWait(it))) return;
    var text = String(S.drafts[id] || '').trim(); if (!text) return;
    var p = copyText(text);
    var link = isWait(it) ? waitLink(it) : U.safeTeamsLink(it.webUrl);
    if (link) { try { window.open(link, '_blank', 'noopener,noreferrer'); } catch (e) { /* the Open in Teams link stays on the card */ } }
    var undo = null;
    if (isWait(it)) {
      /* The chase is yours to post; the wait comes back 3 working days after it. */
      var w = waitDoc(it), prev = w.chasedAt || null, at = new Date().toISOString();
      w.chasedAt = at; store.setWait(it.docId, w);
      S.doneNow[id] = { how: 'chased', at: at };
      undo = function () { if (prev) w.chasedAt = prev; else delete w.chasedAt; store.setWait(it.docId, w); delete S.doneNow[id]; renderAll(); };
    } else {
      var ho = S.handoff[id] = { at: new Date().toISOString(), key: it.key };
      if (S.handoffDb) S.handoffDb[it.key] = ho;
      store.setHandoff(it.key, ho);
    }
    Promise.resolve(p).then(function () { return true; }, function () { return false; }).then(function (ok) {
      renderAll();
      if (ok) {
        toast(link ? 'Copied. Paste it in the Teams chat that just opened.' : 'Copied. Open the chat in Teams and paste it.', undo);
      } else {
        var ta = $('draftText');
        if (ta && S.cur === id) { ta.focus({ preventScroll: true }); ta.select(); }
        toast('Couldn’t copy. The text is selected: press Ctrl+C (⌘C), then paste it in Teams.');
      }
    });
  }

  function copyText(text) {
    try { return navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text) : Promise.reject(); } catch (e) { return Promise.reject(); }
  }

  /* ---------------- Waits: not waiting, snooze, chase mode ---------------- */
  function changeWait(it, change, msg) {
    var w = waitDoc(it); if (!w) return;
    var prev = JSON.parse(JSON.stringify(w));
    change(w); store.setWait(it.docId, w);
    refreshWaits();
    back();
    toast(msg, function () {
      S.waits[it.docId] = prev; store.setWait(it.docId, prev);
      refreshWaits(); renderAll();
      rankNew(false);
    });
  }
  function notWaiting() {
    var it = S.byId[S.cur]; if (!isWait(it)) return;
    changeWait(it, function (w) { w.status = 'dismissed'; w.dismissedAt = new Date().toISOString(); }, 'No longer waiting on ' + (U.firstName(it.senderName) || 'them') + '.');
  }
  function snoozeWait() {
    var it = S.byId[S.cur]; if (!isWait(it)) return;
    changeWait(it, function (w) { w.snoozeUntil = mine.addWorkdays(mine.today(), 2); }, 'Snoozed for 2 working days.');
  }
  function setChaseMode(byMail) {
    var it = S.byId[S.cur]; if (!isWait(it)) return;
    S.chaseMail[it.id] = byMail; S.chatOpen = false;
    renderItem();
    var ta = $('draftText'); if (ta) ta.focus({ preventScroll: true });
  }

  /* ---------------- Next steps for your own actions ---------------- */
  function startNs(kind, preset) {
    var it = curAction(); if (!it) return;
    var a = S.actions[it.docId]; if (!a) return;
    var dir = directory(), pref = a.origin && a.origin.attendees || [], seen = {};
    var people = (preset ? preset.who : whoNames(it)).map(function (n) {
      /* An address Claude passed is used only when Droplet already knows it. */
      var e = String(n).trim().toLowerCase(), known = dir.filter(function (p) { return p.email === e; })[0];
      return ns.isEmail(e) ? (known ? { state: 'ok', name: known.name, email: e, options: [] } : { state: 'unknown', name: e, options: [] }) : ns.resolve(n, dir, pref);
    }).filter(function (p) {
      var k = p.state === 'ok' ? p.email : 'name:' + p.name.toLowerCase();
      if (seen[k]) return false; seen[k] = 1; return true;
    });
    var st = S.ns[it.docId] = { kind: kind, people: people, online: true, title: U.clip(a.text, 80), agenda: '', subject: U.clip(a.text, 80), body: '', chase: '',
      slots: [], slot: 0, slotState: null, inv: { phase: 'idle' }, send: { phase: 'idle' }, chased: null };
    if (preset) {
      st.title = U.clip(preset.title || a.text, 80); st.titleTouched = true;
      if (preset.agenda) { st.agenda = String(preset.agenda); st.agendaTouched = true; }
    }
    rerenderItemKeepFocus();
    var card = document.querySelector('[data-ns-card]'); if (card) card.scrollIntoView({ block: 'nearest' });
    if (!preset || !preset.agenda) nsDraft(it, st);
    nsSlots(it, st);
  }
  function nsRerender(it) { if (S.view === 'item' && S.cur === it.id) rerenderItemKeepFocus(); }
  function nsDraft(it, st) {
    if (!rt.sample) { st.drafting = { error: rt.sampleCopy({ code: 'not_granted' }) }; return nsRerender(it); }
    var a = S.actions[it.docId], people = st.people.map(function (p) { return { name: p.name }; });
    var o = { me: S.me, now: new Date(), action: a, people: people };
    st.drafting = 'loading'; nsRerender(it);
    var p = st.kind === 'meeting' ? ns.askInvite(o) : st.kind === 'mail' ? ns.askMail(o) : ns.askChase(o);
    p.then(function (r) {
      st.drafting = null;
      if (st.kind === 'meeting') { if (!st.titleTouched && r.title) st.title = r.title; if (!st.agendaTouched) st.agenda = r.agenda; }
      else if (st.kind === 'mail') { if (!st.subjectTouched && r.subject) st.subject = r.subject; if (!st.bodyTouched) st.body = r.draft; }
      else if (!st.chaseTouched) st.chase = r;
    }, function (e) { st.drafting = { error: rt.sampleCopy(e) }; }).then(function () { nsRerender(it); });
  }
  function nsSlots(it, st, again) {
    if (st.kind !== 'meeting') return;
    var ok = okPeople(st);
    if (!ok.length || openPeople(st).length) { st.slotState = null; return nsRerender(it); }
    var key = ok.map(function (p) { return p.email; }).sort().join(',');
    if (!again && st.slotKey === key && (st.slotState === 'ok' || st.slotState === 'loading')) return;
    st.slotKey = key; st.slotState = 'loading'; nsRerender(it);
    ns.loadBusy(ok.map(function (p) { return p.email; }), new Date()).then(function (r) {
      if (st.slotKey !== key) return;
      st.slots = ns.slots(r.busy, new Date()); st.slot = 0;
      st.slotState = st.slots.length ? 'ok' : 'none';
      var names = function (list) { return list.map(function (e) { var p = ok.filter(function (x) { return x.email === e; })[0]; return U.firstName(p && p.name) || e; }).join(', '); };
      st.calNote = r.unread.length ? 'Only your calendar was checked for ' + names(r.unread) + ': theirs isn’t readable here.'
        : 'Free in your calendar and in ' + names(ok.map(function (p) { return p.email; })) + '’s.';
    }, function (e) {
      if (st.slotKey !== key) return;
      st.slotState = 'error'; st.calErr = rt.mcpCopy(e, 'your calendar');
    }).then(function () { nsRerender(it); });
  }
  function nsPeopleChanged(it, st) { rerenderItemKeepFocus(); nsSlots(it, st); }
  function nsPick(i, email) {
    var it = curAction(), st = it && S.ns[it.docId], p = st && st.people[i]; if (!p) return;
    var o = (p.options || []).filter(function (x) { return x.email === email; })[0]; if (!o) return;
    st.people[i] = { state: 'ok', name: o.name, email: o.email, options: [] };
    nsPeopleChanged(it, st);
  }
  function nsDrop(i) {
    var it = curAction(), st = it && S.ns[it.docId]; if (!st || !st.people[i]) return;
    st.people.splice(i, 1);
    nsPeopleChanged(it, st);
  }
  /* An address you typed yourself (the only way an unknown name gets one). */
  function nsUse(i) {
    var it = curAction(), st = it && S.ns[it.docId], p = st && st.people[i]; if (!p) return;
    var inp = $('nsAddr' + i), v = inp ? inp.value.trim().toLowerCase() : '';
    if (!ns.isEmail(v)) { p.bad = true; p.typed = v; rerenderItemKeepFocus(); return; }
    st.people[i] = { state: 'ok', name: p.name, email: v, options: [] };
    nsPeopleChanged(it, st);
  }
  function nsAdd() {
    var it = curAction(), st = it && S.ns[it.docId]; if (!st) return;
    var inp = $('nsAdd'), v = inp ? inp.value.trim() : ''; if (!v) return;
    var a = S.actions[it.docId];
    var p = ns.isEmail(v) ? { state: 'ok', name: U.nameFromAddress(v), email: v.toLowerCase(), options: [] } : ns.resolve(v, directory(), a.origin && a.origin.attendees || []);
    if (p.state === 'ok' && okPeople(st).some(function (x) { return x.email === p.email; })) { inp.value = ''; return; }
    st.people.push(p);
    nsPeopleChanged(it, st);
    var ni = $('nsAdd'); if (ni) ni.focus({ preventScroll: true });
  }
  function nsTarget() { var it = curAction(); return it && S.ns[it.docId] ? [it, S.ns[it.docId]] : null; }
  /* Send invite: outlook_create_event, only on this click, once. */
  function sendInvite() {
    var x = nsTarget(); if (!x) return;
    var it = x[0], st = x[1], inv = st.inv;
    if (inv.phase === 'sending' || inv.phase === 'sent' || !nsReady(st)) return;
    var t = performance.now();
    if (inv.phase === 'unclear') {
      if (t < (inv.armAt || 0)) return;
      if (!inv.confirm) { inv.confirm = 1; inv.armAt = t + 700; rerenderItemKeepFocus(); return; }
    }
    var slot = st.slots[st.slot], people = okPeople(st).map(function (p) { return { email: p.email, name: p.name }; });
    st.inv = { phase: 'sending' }; rerenderItemKeepFocus();
    ns.eventSchema().then(function (schema) {
      var input = ns.eventInput({ subject: String(st.title).trim(), start: slot.start, end: slot.end, attendees: people, agenda: st.agenda, online: st.online }, schema);
      return rt.call('outlook_create_event', input);
    }).then(function () {
      st.inv = { phase: 'sent', label: ns.slotLabel(slot) };
      toast('Invite sent for ' + ns.slotLabel(slot) + '.');
    }, function (e) {
      var base = { step: 'create event', code: String(e && e.code || 'unknown').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 40), detail: U.clip(e && e.message || '', 140) };
      st.inv = Object.assign(base, rt.isClear(e)
        ? { phase: 'failed', message: 'Outlook didn’t create the invite' + (base.detail ? ': ' + base.detail : '') + '. Nothing was sent.' }
        : { phase: 'unclear', message: 'Outlook didn’t confirm the invite. Check your calendar before sending again.', confirm: 0, armAt: performance.now() + 700 });
    }).then(function () { nsRerender(it); });
  }
  /* Send a new mail: create draft → read back → check → send, once. */
  function sendNsMail() {
    var x = nsTarget(); if (!x) return;
    var it = x[0], st = x[1], sd = st.send;
    if (sd.phase === 'sending' || sd.phase === 'sent' || !nsReady(st)) return;
    var t = performance.now();
    if (sd.phase === 'unclear') {
      if (t < (sd.armAt || 0)) return;
      if (!sd.confirm) { sd.confirm = 1; sd.armAt = t + 700; rerenderItemKeepFocus(); return; }
    }
    var text = String(st.body).trim();
    var reuse = sd.draftId ? { draftId: sd.draftId, link: sd.draftLink, text: sd.draftText } : null;
    st.send = { phase: 'sending', draftId: sd.draftId, draftLink: sd.draftLink, draftText: sd.draftText };
    rerenderItemKeepFocus();
    flow.sendNew({ to: okPeople(st).map(function (p) { return p.email; }), subject: String(st.subject).trim(), text: text, reuse: reuse }).then(function (res) {
      var ns2 = st.send = { phase: res.phase, message: res.message || '', sentAt: res.sentAt, draftId: res.draftId || '', draftLink: res.draftLink || '', draftText: res.draftText || '',
        step: res.step || '', code: res.code || '', detail: res.detail || '', safeDetail: res.safeDetail || '' };
      if (res.phase === 'unclear') { ns2.confirm = 0; ns2.armAt = performance.now() + 700; }
      if (res.phase === 'blocked' && !res.keepDraft) ns2.draftId = '';
      if (res.phase === 'sent') toast('Sent.');
      nsRerender(it);
    });
  }
  function chaseNs() {
    var x = nsTarget(); if (!x || !nsReady(x[1])) return;
    var st = x[1], text = String(st.chase).trim();
    var link = U.safeTeamsLink('https://teams.microsoft.com/l/chat/0/0?users=' + okPeople(st).map(function (p) { return encodeURIComponent(p.email); }).join(','));
    var p = copyText(text);
    if (link) { try { window.open(link, '_blank', 'noopener,noreferrer'); } catch (e) { /* ignore */ } }
    st.chased = new Date();
    Promise.resolve(p).then(function () { return true; }, function () { return false; }).then(function (ok) {
      nsRerender(x[0]);
      toast(ok ? 'Copied. Paste it in the Teams chat that just opened.' : 'Couldn’t copy. Select the text and copy it, then paste it in Teams.');
    });
  }

  /* ---------------- Your own actions ---------------- */
  /* Saved first (db), shown at once, then ranked by Claude in the background. */
  function addAction(raw) {
    var text = mine.clean(raw); if (!text) return false;
    var now = new Date(), docId = mine.newId();
    var due = mine.parseDue(text, now);
    var a = { text: text, created: now.toISOString(), done: false, doneAt: null, due: due || null, dueBy: due ? 'parser' : null, notes: '' };
    S.actions[docId] = a;
    store.setAction(docId, a);
    var it = syncAction(mine.toItem(docId, a));
    S.fresh[it.id] = true;
    S.items.push(it); S.byId[it.id] = it;
    renderAll();
    if (S.loaded && !coreBusy()) rankNew(false); else scheduleRank();
    return docId;
  }
  function curAction() { var it = S.byId[S.cur]; return isMine(it) ? it : null; }
  /* Save on blur. A new text is ranked again; your own due date always wins. */
  function commitActionField(field, value) {
    var it = curAction(); if (!it) return;
    var a = S.actions[it.docId]; if (!a) return;
    var ed = S.actEdit[it.docId] || {};
    if (field === 'text') {
      delete ed.text;
      var text = mine.clean(value);
      if (!text || text === a.text) { if (!text) rerenderItemKeepFocus(); return; }
      a.text = text;
      if (a.dueBy !== 'you') { var d = mine.parseDue(text, new Date()); a.due = d || null; a.dueBy = d ? 'parser' : null; }
      /* Ranked again with the new text; it keeps its place until then. */
      it.rerank = true;
    } else if (field === 'notes') {
      delete ed.notes;
      if (String(value) === String(a.notes || '')) return;
      a.notes = String(value).slice(0, 4000);
    } else if (field === 'due') {
      var v = String(value || '');
      if (v && !mine.validDate(v)) return;
      if ((v || null) === (a.due || null) && (a.dueBy === 'you' || !v)) return;
      a.due = v || null; a.dueBy = v ? 'you' : null;
    }
    store.setAction(it.docId, a);
    syncAction(it);
    renderList();
    var by = document.querySelector('[data-due-by]');
    if (by && field === 'due') by.textContent = a.due ? 'set by you' : 'none';
    var meta = document.querySelector('.iv-meta');
    if (meta && field !== 'notes') { var dd = meta.querySelector('[data-due]'); if (dd) dd.textContent = a.due ? mine.dueLabel(a.due) : ''; }
    if (field === 'text') rankNew(false);
    toast('Saved.');
  }
  function markActionDone(it) {
    var a = S.actions[it.docId]; if (!a) return;
    a.done = true; a.doneAt = new Date().toISOString();
    store.setAction(it.docId, a);
    if (S.view === 'item' && S.cur === it.id) back(); else renderAll();
    toast('Done. Removed from the list.', function () {
      a.done = false; a.doneAt = null;
      store.setAction(it.docId, a);
      if (!S.byId[it.id]) { S.items.push(it); S.byId[it.id] = it; }
      renderAll();
    });
  }
  function deleteAction(it) {
    var a = S.actions[it.docId];
    delete S.actions[it.docId]; delete S.actEdit[it.docId]; delete S.fresh[it.id];
    S.items = S.items.filter(function (m) { return m !== it; });
    delete S.byId[it.id]; delete S.rankings[it.key];
    S.confirmDel = null;
    store.deleteAction(it.docId); store.clearRanking(it.key);
    back();
    toast('Deleted “' + U.clip(a && a.text || '', 40) + '”.');
  }

  /* ---------------- Quiet actions ---------------- */
  function toggleChat() { var it = S.byId[S.cur]; if (it) ask.openSheet(it.id); }
  function feedbackDoc(it, verdict) {
    return { msgId: it.id, sender: it.sender, subject: U.clip(it.subject, 160), project: rk(it).project || null, verdict: verdict, at: new Date().toISOString() };
  }
  function setVerdict(it, verdict) {
    S.feedback = S.feedback.filter(function (f) { return f.msgId !== it.id; });
    if (verdict) {
      var f = feedbackDoc(it, verdict);
      S.verdict[it.id] = verdict; S.feedback.unshift(Object.assign({ key: it.key }, f));
      store.setFeedback(it.key, f);
    } else {
      delete S.verdict[it.id];
      store.clearFeedback(it.key);
    }
  }
  function notImportant() {
    var it = S.byId[S.cur]; if (!it) return;
    var prev = S.verdict[it.id] || null;
    setVerdict(it, 'down'); back();
    toast('Moved to Everything else. I’ll rank it lower next time.', function () { setVerdict(it, prev); renderAll(); });
  }
  function toggleStar() {
    var it = S.byId[S.cur]; if (!it) return;
    var on = S.verdict[it.id] !== 'up';
    setVerdict(it, on ? 'up' : null);
    renderAll();
    toast(on ? 'Marked important. I’ll weigh this next time.' : 'No longer marked important.');
  }
  function markDone() {
    var it = S.byId[S.cur]; if (!it) return;
    if (isMine(it)) return markActionDone(it);
    if (isWait(it)) return notWaiting();
    S.doneNow[it.id] = { how: 'manual' };
    store.setDone(it.key, { at: new Date().toISOString(), how: 'manual' });
    back();
    toast('Marked done.', function () { undoDone(it.id); });
  }

  /* ---------------- Jira: Comment on KEY (once, on your click) ---------------- */
  function jiraDone(it, how) {
    var at = new Date().toISOString();
    S.doneNow[it.id] = { how: how || 'commented' };
    var d = { at: at, how: how || 'commented' };
    store.setDone(it.key, d);
    if (S.doneDb) S.doneDb[it.key] = d;
  }
  /* R4: you already commented after the item came in. */
  function jiraCheckDone(it, iss) {
    if (!iss || isClosed(it.id) || sendState(it.id).phase !== 'idle') return;
    if (!atl.userCommentedSince(iss, it.received)) return;
    jiraDone(it, 'commented');
    renderAllKeepFocus();
    toast('You already commented on ' + it.issueKey + '. Marked done.', function () { undoDone(it.id); });
  }
  function onJiraPost() {
    var id = S.cur, it = S.byId[id]; if (!isJira(it)) return;
    var st = sendState(id);
    if (st.phase === 'sending' || st.phase === 'sent') return;
    var text = String(S.drafts[id] || '').trim(); if (!text) return;
    var t = performance.now();
    if (st.phase === 'unclear') {
      if (t < (st.armAt || 0)) return;
      if (!st.confirm) { st.confirm = 1; st.armAt = t + 700; renderItem(); var b0 = $('sendBtn'); if (b0) b0.focus(); return; }
    }
    S.send[id] = { phase: 'sending' };
    renderItem(); renderFocus();
    atl.postComment(it.issueKey, text).then(function (res) {
      var n = S.send[id] = { phase: res.phase, message: res.message || '', sentAt: res.sentAt, step: res.step || '', code: res.code || '', detail: res.detail || '' };
      if (res.phase === 'unclear') { n.confirm = 0; n.armAt = performance.now() + 700; }
      if (res.phase === 'sent') {
        jiraDone(it, 'commented');
        delete S.aiUndo[id];
        toast(res.verified === false ? 'Posted. Droplet couldn’t read it back; check the issue.' : 'Commented on ' + it.issueKey + '. Marked done.', function () { undoDone(id); });
      }
      renderAll();
      var b = $('sendBtn'); if (b && S.cur === id) b.focus({ preventScroll: true });
    });
  }
  function openPage() {
    var it = S.byId[S.cur]; if (!isPage(it)) return;
    var link = atl.safeLink(it.webUrl);
    if (link) { try { window.open(link, '_blank', 'noopener,noreferrer'); } catch (e) { /* ignore */ } }
  }

  /* ---------------- Ask Claude: what the sheet may read and change ---------------- */
  function nameFor(email) {
    var e = String(email || '').toLowerCase(), hit = null;
    try { (directory() || []).forEach(function (p) { if (!hit && p.email === e && p.name) hit = p.name; }); } catch (x) { /* ignore */ }
    return hit || U.nameFromAddress(e);
  }
  /* The draft Claude may rewrite for an item, or null. */
  function draftTarget(it) {
    if (!it || isPage(it)) return null;
    var st0 = sendState(it.id);
    if (isMine(it)) {
      var st = S.ns[it.docId]; if (!st) return null;
      if (st.kind === 'mail') { var okp = okPeople(st)[0]; return { st: st, field: 'body', style: 'mail', text: st.body, first: okp ? okp.name : '', locked: st.send.phase === 'sent' || st.send.phase === 'sending', kind: 'the next-step mail body' }; }
      if (st.kind === 'meeting') return { st: st, field: 'agenda', style: 'plain', text: st.agenda, locked: st.inv.phase === 'sent' || st.inv.phase === 'sending', kind: 'the invite agenda' };
      return { st: st, field: 'chase', style: 'chat', text: st.chase, locked: false, kind: 'the Teams chase' };
    }
    var locked = st0.phase === 'sent' || st0.phase === 'sending';
    if (isWait(it)) {
      if (chaseByMail(it)) return { key: it.id + '#mail', style: 'mail', text: mailChaseText(it), first: it.senderName, locked: locked, kind: 'the mail chase' };
      return { key: it.id, style: 'chat', text: draftOf(it), locked: false, kind: 'the Teams chase' };
    }
    if (isJira(it)) return { key: it.id, style: 'comment', text: draftOf(it), locked: locked, kind: 'the Jira comment on ' + it.issueKey };
    if (isTeams(it)) return { key: it.id, style: 'chat', text: draftOf(it), locked: false, kind: 'the Teams reply' };
    return { key: it.id, style: 'mail', text: draftOf(it), first: it.senderName, locked: locked, kind: 'the mail reply' };
  }
  function setDraftFromClaude(it, raw) {
    var t = draftTarget(it);
    if (!t) throw { message: 'This item has no draft to change.' };
    if (t.locked) throw { message: 'This draft was already sent; it can’t change any more.' };
    var sign = rank.signName(S.me), text;
    if (t.style === 'mail') text = rank.normalizeDraft(raw, { senderFirst: t.first, sign: sign });
    else if (t.style === 'chat') text = rank.normalizeChat(raw, { sign: sign });
    else if (t.style === 'comment') text = rank.normalizeComment(raw, { sign: sign });
    else text = String(raw).replace(/\r\n?/g, '\n').replace(/[ \t]*—[ \t]*/g, ', ').trim();
    if (!text) throw { message: 'Empty text' };
    var prev = S.aiUndo[it.id] ? S.aiUndo[it.id].prev : t.text;
    if (t.st) { t.st[t.field] = text; t.st[t.field + 'Touched'] = true; }
    else { S.drafts[t.key] = text; S.touched[it.id] = true; }
    S.aiUndo[it.id] = { prev: prev == null ? '' : prev, text: text };
    if (isCur(it.id)) { rerenderItemKeepFocus(); nsGate(); }
    return text;
  }
  /* Undo: back to the text from before Claude's change. Never loses typing. */
  function undoClaudeDraft(id) {
    var u = S.aiUndo[id], it = S.byId[id]; if (!u) return;
    var t = it && draftTarget(it);
    if (t && !t.locked) { if (t.st) t.st[t.field] = u.prev; else S.drafts[t.key] = u.prev; }
    delete S.aiUndo[id];
    if (isCur(id)) { rerenderItemKeepFocus(); nsGate(); }
    ask.draftUndone(id, 'undo');
    toast('Restored the text from before Claude’s change.');
  }
  function typedOver(id) {
    if (!S.aiUndo[id]) return;
    delete S.aiUndo[id];
    var n = document.querySelector('[data-ai-note]'); if (n) n.remove();
    ask.draftUndone(id, 'typed');
  }
  function chatContext(it) {
    var t = draftTarget(it);
    return { me: S.me, now: new Date(), item: it, mailText: sourceText(it), draft: t ? t.text : null, draftKind: t ? t.kind : '', draftStyle: t ? t.style : '' };
  }
  function focusList() {
    var top = topItems();
    return visible().slice(0, 25).map(function (it) {
      return { ref: it.src === 'mail' ? it.id : isJira(it) ? it.issueKey : isPage(it) ? 'pageId ' + it.pageId : it.id, source: SRC[it.src], title: U.clip(titleOf(it), 120),
        from: it.senderName || '', project: project(it), why: rk(it).why, inFocus: top.indexOf(it) > -1, done: isClosed(it.id) };
    });
  }
  function removeActionQuiet(docId) {
    var id = 'mine:' + docId, it = S.byId[id];
    delete S.actions[docId]; delete S.actEdit[docId]; delete S.fresh[id];
    S.items = S.items.filter(function (m) { return m.id !== id; });
    delete S.byId[id];
    if (it) { delete S.rankings[it.key]; store.clearRanking(it.key); }
    store.deleteAction(docId);
    if (S.view === 'item' && S.cur === id) back(); else renderAll();
  }
  function openInviteFromAsk(o) {
    var docId = addAction(o.title || 'Meeting'); if (!docId) return;
    var id = 'mine:' + docId;
    openItem(id, false);
    startNs('meeting', { who: o.who, title: o.title, agenda: o.agenda });
  }
  function replySent(mailId, res) {
    var it = S.byId[mailId]; if (!it || it.src !== 'mail') return;
    S.send[mailId] = { phase: 'sent', sentAt: res.sentAt };
    S.doneNow[mailId] = { how: 'sent' };
    store.setDone(it.key, { at: new Date().toISOString(), how: 'sent', sentAt: res.sentAt.toISOString() });
    store.setSent(it.key, { sentAt: res.sentAt.toISOString() });
    if (S.sentDb) S.sentDb[it.key] = { sentAt: res.sentAt.toISOString() };
    renderAllKeepFocus();
  }
  function jiraCommentedKey(key, res) {
    var it = S.byId['jira:' + key]; if (!it) return;
    S.send[it.id] = { phase: 'sent', sentAt: res.sentAt };
    jiraDone(it, 'commented');
    renderAllKeepFocus();
  }
  ask.init({
    ico: ico, item: function (id) { return S.byId[id] || null; }, title: titleOf, me: function () { return S.me; }, toast: toast,
    isExternal: isExternal, nameFor: nameFor, draftTarget: draftTarget, draftKind: function (it) { var t = draftTarget(it); return t ? t.kind : ''; },
    setDraft: setDraftFromClaude, undoDraft: undoClaudeDraft, chatContext: chatContext, focusList: focusList,
    addAction: function (t) { return addAction(t); }, removeAction: removeActionQuiet, openInvite: openInviteFromAsk,
    replySent: replySent, jiraCommented: jiraCommentedKey
  });
  function renderAskbar() {
    var b = $('askBar'); if (!b) return;
    var on = ask.available(), hint = b.querySelector('.hint');
    if (on) b.removeAttribute('aria-disabled'); else b.setAttribute('aria-disabled', 'true');
    if (hint) hint.textContent = on ? 'Update a page · mail a supplier' : !rt.inited ? 'Starting…' : !rt.sample ? 'Claude isn’t available here' : 'Not available in this view';
    b.title = on ? 'Ask Claude (k)' : hint ? hint.textContent : '';
  }
  function askClick(t) {
    var id;
    if (t.getAttribute('aria-disabled') === 'true') return;
    if (t.hasAttribute('data-ask-new')) return ask.newConversation();
    if (t.hasAttribute('data-ask-stop')) return ask.stop();
    if ((id = t.getAttribute('data-chip'))) return ask.say(id);
    if ((id = t.getAttribute('data-askchip'))) { var inp = $('chatIn'); if (inp) { inp.value = id; inp.focus({ preventScroll: true }); try { inp.setSelectionRange(id.length, id.length); } catch (e) { /* ignore */ } } return; }
    if ((id = t.getAttribute('data-card-go'))) return ask.go(id);
    if ((id = t.getAttribute('data-card-open'))) return ask.openPage(id);
    if ((id = t.getAttribute('data-card-undo'))) return ask.undoCard(id);
    if ((id = t.getAttribute('data-card-invite'))) return ask.invite(id);
    if ((id = t.getAttribute('data-card-repropose'))) return ask.repropose(id);
    if ((id = t.getAttribute('data-ask-undo-draft'))) return undoClaudeDraft(id);
  }

  /* ---------------- Events ---------------- */
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-ask-close]')) { ask.close(); return; }
    /* Tapping the status strip (not Sync) opens the diagnostics. */
    if (e.target.closest('#status') && !e.target.closest('[data-sync]')) { toggleDiag(); return; }
    var t = e.target.closest('button, a');
    if (!t) return;
    if (t.tagName === 'A') return; /* only safe Outlook, Teams and Atlassian links are rendered as links */
    if (t.closest('#sheetHost')) return askClick(t);
    if (t.hasAttribute('data-perm-allow')) return allowPerms();
    if (t.hasAttribute('data-diag-copy')) return copyDiag();
    var id;
    if (t.hasAttribute('data-ask')) { if (ask.available()) ask.openSheet(null); return; }
    if ((id = t.getAttribute('data-open'))) return openItem(id, false);
    if ((id = t.getAttribute('data-act'))) { var it = S.byId[id]; return openItem(id, !!(it && rk(it).kind === 'reply')); }
    if (t.id === 'restToggle') { S.restOpen = !S.restOpen; renderRest(); if (S.restOpen) $('q').focus(); return; }
    if (t.hasAttribute('data-back')) return back();
    if (t.hasAttribute('data-sync')) { if (!S.loading) load({ full: false }); return; }
    if ((id = t.getAttribute('data-retry'))) {
      if (id === 'mail') { S.notes.mail = null; return (rt.mcp ? Promise.resolve() : rt.retryUse('mcp')).then(function () { reloadSource('mail'); }); }
      if (id === 'teams') { S.notes.teams = null; renderNotes(); return (rt.mcp ? Promise.resolve() : rt.retryUse('mcp')).then(function () { reloadSource('teams'); }); }
      if (id === 'store') { S.notes.store = null; renderNotes(); return (rt.db ? Promise.resolve() : rt.retryUse('db')).then(function () { reloadSource('store'); }); }
      if (id === 'rank') { S.notes.rank = null; return (rt.sample ? Promise.resolve() : rt.retryUse('sample').then(rt.checkTools)).then(function () { renderAskbar(); rankNew(true); }); }
      if (id === 'atl') { S.notes.atl = null; renderNotes(); return (rt.mcp ? Promise.resolve() : rt.retryUse('mcp')).then(function () { reloadSource('atl'); }); }
      return;
    }
    if (t.hasAttribute('data-reread') && S.cur) { delete S.detail[S.cur]; var ci0 = S.byId[S.cur]; if (ci0) readDetail(ci0); return; }
    if (t.hasAttribute('data-undo')) { var u = S.undo; S.undo = null; $('toastHost').innerHTML = ''; if (u) u(); return; }
    if (t.getAttribute('aria-disabled') === 'true') return;
    var cur = S.cur;
    if (t.hasAttribute('data-send') && cur) return onSend();
    if (t.hasAttribute('data-copyopen') && cur) return copyOpen();
    if (t.hasAttribute('data-notwaiting') && cur) return notWaiting();
    if (t.hasAttribute('data-snooze') && cur) return snoozeWait();
    if (t.hasAttribute('data-chasemail') && cur) return setChaseMode(true);
    if (t.hasAttribute('data-chaseteams') && cur) return setChaseMode(false);
    if ((id = t.getAttribute('data-ns-start')) && cur) return startNs(id);
    if (t.hasAttribute('data-ns-pick') && cur) return nsPick(+t.getAttribute('data-ns-pick'), t.getAttribute('data-email'));
    if (t.hasAttribute('data-ns-drop') && cur) return nsDrop(+t.getAttribute('data-ns-drop'));
    if (t.hasAttribute('data-ns-use') && cur) return nsUse(+t.getAttribute('data-ns-use'));
    if (t.hasAttribute('data-ns-slot') && cur) { var sx = nsTarget(); if (sx && sx[1].inv.phase === 'idle' || sx && sx[1].inv.phase === 'failed') { sx[1].slot = +t.getAttribute('data-ns-slot'); rerenderItemKeepFocus(); } return; }
    if (t.hasAttribute('data-ns-slots') && cur) { var sy = nsTarget(); if (sy) nsSlots(sy[0], sy[1], true); return; }
    if (t.hasAttribute('data-ns-redraft') && cur) { var sz = nsTarget(); if (sz) nsDraft(sz[0], sz[1]); return; }
    if (t.hasAttribute('data-ns-invite') && cur) return sendInvite();
    if (t.hasAttribute('data-ns-send') && cur) return sendNsMail();
    if (t.hasAttribute('data-ns-chase') && cur) return chaseNs();
    if (t.hasAttribute('data-ns-done') && cur) { var dx = curAction(); if (dx) markActionDone(dx); return; }
    if (t.hasAttribute('data-done-primary') && cur) return markDone();
    if (t.hasAttribute('data-delete') && cur) {
      S.confirmDel = cur; renderItem();
      var no = document.querySelector('[data-delete-no]');
      if (no) { no.focus({ preventScroll: true }); no.scrollIntoView({ block: 'center' }); }
      return;
    }
    if (t.hasAttribute('data-delete-no') && cur) { S.confirmDel = null; renderItem(); var db0 = document.querySelector('[data-delete]'); if (db0) db0.focus({ preventScroll: true }); return; }
    if (t.hasAttribute('data-delete-yes') && cur) { var dit = curAction(); if (dit && S.confirmDel === dit.id) deleteAction(dit); return; }
    if (t.hasAttribute('data-copydiag') && cur) return copyDetails();
    if (t.hasAttribute('data-redraft') && cur) { var rit = S.byId[cur]; if (rit) ensureDraft(rit, true); return; }
    if (t.hasAttribute('data-chat') && cur) return toggleChat();
    if (t.hasAttribute('data-ai-undo') && cur) return undoClaudeDraft(cur);
    if (t.hasAttribute('data-jira-post') && cur) return onJiraPost();
    if (t.hasAttribute('data-open-page') && cur) return openPage();
    if (t.hasAttribute('data-conf-ask') && cur) return ask.openSheet(cur, 'Update this page: ');
    if (t.hasAttribute('data-star') && cur) return toggleStar();
    if (t.hasAttribute('data-notimp') && cur) return notImportant();
    if (t.hasAttribute('data-done') && cur) return markDone();
  });
  document.addEventListener('submit', function (e) {
    e.preventDefault();
    if (e.target.hasAttribute('data-addform')) {
      var ai = $('addIn');
      if (ai && addAction(ai.value)) { ai.value = ''; ai.focus({ preventScroll: true }); }
      return;
    }
    if (e.target.hasAttribute('data-ns-addform')) { nsAdd(); return; }
    if (e.target.hasAttribute('data-chatform')) {
      var inp = $('chatIn'), v = inp ? inp.value.trim() : '';
      if (v && ask.open && !ask.conv(ask.scope).busy) { inp.value = ''; ask.say(v); }
    }
  });
  document.addEventListener('input', function (e) {
    if (e.target.hasAttribute('data-card-body') || e.target.hasAttribute('data-card-subject')) { ask.cardInput(e.target); return; }
    if (e.target.id === 'q') { S.q = e.target.value; renderRest(); }
    if ((e.target.id === 'actText' || e.target.id === 'actNotes') && curAction()) {
      var ed = S.actEdit[curAction().docId] = S.actEdit[curAction().docId] || {};
      ed[e.target.id === 'actText' ? 'text' : 'notes'] = e.target.value;
    }
    var nx = /^ns(Title|Agenda|Subject|Body|Chase)$/.exec(e.target.id || '');
    if (nx && nsTarget()) {
      var nst = nsTarget()[1], f = nx[1].charAt(0).toLowerCase() + nx[1].slice(1);
      nst[f] = e.target.value; nst[f + 'Touched'] = true;
      if (f === 'body' || f === 'agenda' || f === 'chase') typedOver(nsTarget()[0].id);
      nsGate();
    }
    if (/^nsAddr\d+$/.test(e.target.id || '') && nsTarget()) { var pi = nsTarget()[1].people[+e.target.id.slice(6)]; if (pi) pi.typed = e.target.value; }
    if (e.target.id === 'draftText' && S.cur) {
      var first = !S.touched[S.cur], dk = S.byId[S.cur] ? draftKey(S.byId[S.cur]) : S.cur;
      S.drafts[dk] = e.target.value; S.touched[S.cur] = true;
      typedOver(S.cur);
      if (first) { var ft = document.querySelector('.draft-foot'), cit = S.byId[S.cur]; if (ft && cit) ft.innerHTML = draftFoot(cit, false, false); }
      var b = $('sendBtn'), st = sendState(S.cur);
      if (b && (b.hasAttribute('data-send') || b.hasAttribute('data-copyopen')) && st.phase !== 'unclear') {
        if (e.target.value.trim()) b.removeAttribute('aria-disabled'); else b.setAttribute('aria-disabled', 'true');
      }
    }
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'actText') commitActionField('text', e.target.value);
    else if (e.target.id === 'actNotes') commitActionField('notes', e.target.value);
    else if (e.target.id === 'actDue') commitActionField('due', e.target.value);
    else if (e.target.id === 'nsOnline' && nsTarget()) nsTarget()[1].online = !!e.target.checked;
  });
  document.addEventListener('focusin', function (e) {
    if (S.view !== 'item') return;
    var p = $('listCol').contains(e.target) ? 'list' : $('itemCol').contains(e.target) ? 'item' : null;
    if (p && p !== S.pane) { S.pane = p; renderPane(); }
  });
  document.addEventListener('keydown', function (e) {
    var tg = (e.target.tagName || '').toLowerCase(), typing = tg === 'input' || (tg === 'textarea' && !e.target.readOnly);
    /* The sheet is modal: Esc closes it, Tab stays inside, other shortcuts wait. */
    if (ask.open) {
      if (e.key === 'Escape') { e.preventDefault(); ask.close(); return; }
      if (e.key === 'Tab') {
        var f = [].slice.call(document.querySelectorAll('#askSheet button:not([aria-disabled="true"]), #askSheet input, #askSheet textarea, #askSheet a[href]'));
        if (f.length) {
          var i0 = f.indexOf(document.activeElement);
          if (e.shiftKey && i0 <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
          else if (!e.shiftKey && (i0 === f.length - 1 || i0 === -1)) { e.preventDefault(); f[0].focus(); }
        }
      }
      return;
    }
    /* Esc in the draft only leaves the text field; a second Esc closes. */
    if (e.key === 'Escape') {
      if (e.target.id === 'draftText' || e.target.id === 'actText' || e.target.id === 'actNotes' || e.target.id === 'actDue') { e.target.blur(); return; }
      if (e.target.id === 'addIn') { e.target.blur(); return; }
      if (S.view === 'item') return back();
      return;
    }
    if (e.key === 'Enter' && /^nsAddr\d+$/.test(e.target.id || '')) { e.preventDefault(); nsUse(+e.target.id.slice(6)); return; }
    /* Enter in the action text saves it (it is one line of text). */
    if (e.key === 'Enter' && e.target.id === 'actText' && !e.shiftKey) { e.preventDefault(); e.target.blur(); return; }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      var rows = [].slice.call($('listCol').querySelectorAll('[data-open]'));
      var i = rows.indexOf(document.activeElement);
      if (i === -1 && !$('listCol').contains(document.activeElement) && document.activeElement !== document.body) return;
      e.preventDefault();
      var nx = rows[Math.max(0, Math.min(rows.length - 1, i === -1 ? 0 : i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (nx) nx.focus();
      return;
    }
    if (e.key === '/') { e.preventDefault(); if (!S.restOpen) { S.restOpen = true; renderRest(); } $('q').focus(); return; }
    if (e.key === 'a' && (desk() || S.view === 'list')) { e.preventDefault(); $('addIn').focus(); return; }
    if (e.key === 'k' && ask.available()) { e.preventDefault(); ask.openSheet(null); return; }
    if (S.view !== 'item' || S.pane !== 'item' || !S.cur) return;
    var ph = sendState(S.cur).phase;
    if (ph === 'sent' || ph === 'sending') return;
    if (e.key === 'c') { e.preventDefault(); toggleChat(); }
    else if (e.key === 'n') { e.preventDefault(); notImportant(); }
    else if (e.key === 'd') { e.preventDefault(); markDone(); }
  });

  /* ---------------- Boot ---------------- */
  store.onError = function () { S.notes.store = 'Couldn’t save a change; it may be gone after a reload.'; renderNotes(); };
  renderAll(); renderAskbar();
  /* A capability that answers after use()'s timeout lights up late. */
  rt.onLate = function (name) {
    renderStatus(); renderAskbar();
    if (name === 'db' && !S.savedOk) reloadSource('store');
    else if (name === 'mcp') load({ full: false });
    else if (name === 'permissions') checkPerms();
  };
  rt.init().then(function () {
    renderStatus(); renderAskbar();
    checkPerms();
    load({ full: true });
  });
})(window.Droplet = window.Droplet || {});
