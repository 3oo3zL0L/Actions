/* Droplet · slice 1 app: Outlook mail → ranked focus list → suggested
   action → your click. Markup, classes and interactions follow the
   approved Lambda v3 design. */
(function (D) {
  "use strict";
  var U = D.util, rt = D.rt, store = D.store, mail = D.mail, rank = D.rank, flow = D.sendflow, chat = D.chat, teams = D.teams, meet = D.meet, mine = D.mine,
    waits = D.waits, tx = D.tx, ns = D.ns;
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
    wait: '<path d="M7 3h10M7 21h10"/><path d="M8 3c0 5 8 5.5 8 9s-8 4-8 9M16 3c0 5-8 5.5-8 9s8 4 8 9"/>'
  };
  function ico(name, cls) { return '<svg class="ico ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + P[name] + '</svg>'; }

  /* ---------------- State ---------------- */
  var S = {
    view: 'list', cur: null, pane: 'list', restOpen: false, q: '', chatOpen: false, scrollY: 0, toastTimer: null, anim: false,
    me: null, items: [], byId: {}, loading: true, loaded: false, ranking: 0, syncAt: null, mcpOk: null, teamsOk: null,
    notes: { mail: null, teams: null, cal: null, rank: null, store: null }, rankings: {}, feedback: [], verdict: {}, doneNow: {},
    drafts: {}, touched: {}, drafting: {}, send: {}, detail: {}, chat: {}, undo: null, handoff: {}, meetings: [], actions: {}, confirmDel: null, rankAgain: false, fresh: {}, actEdit: {},
    waits: {}, asksDb: {}, meetingsDb: {}, waitPre: [], scanning: false, teams10: [], sentMsgs: [], chaseMail: {}, ns: {}
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
  function visible() {
    return S.items.filter(function (it) {
      if (actionDone(it)) return false;
      var d = rk(it).dupOf;
      if (d && S.byId[d] && !it.standstill) return false;
      return groupOf(it) !== 'hidden';
    }).sort(cmp);
  }
  function topItems() {
    return visible().filter(function (it) { return groupOf(it) === 'now' && S.verdict[it.id] !== 'down'; }).slice(0, FOCUS_MAX);
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
  var SRC = { mail: 'Mail', teams: 'Teams', mine: 'My action', wait: 'Waiting', meeting: 'Meeting' };
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
  function project(it) { return rk(it).project || (isWait(it) ? it.project0 || 'Follow-up' : isMine(it) ? 'Own' : it.internal ? (isTeams(it) ? 'Chat' : 'Inbox') : 'Outside Planon'); }
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
      '<span data-dot="m365"><i' + (m === false ? ' class="off"' : '') + '></i>M365 link</span>' +
      '<span data-dot="teams"><i' + (S.teamsOk === false || m === false && S.teamsOk !== true ? ' class="off"' : '') + '></i>Teams</span>' +
      '<span><i' + (cl ? '' : ' class="off"') + '></i>Claude</span>' +
      '<button class="sync" id="syncBtn" data-sync aria-label="Sync mail now">Sync ' + (S.syncAt ? U.hhmm(S.syncAt) : '··:··') + '</button>' +
      '<span>Nothing sends without you</span>';
    $('dateLine').textContent = U.dateLine(new Date());
  }
  function renderNotes() {
    var h = '';
    function line(key, text, retry) {
      h += '<p class="note-line" data-note="' + key + '">' + ico('clock') + '<span>' + esc(text) + '</span>' +
        (retry ? '<button data-retry="' + key + '">Try again</button>' : '') + '</p>';
    }
    if (S.notes.mail) line('mail', S.notes.mail, true);
    if (S.notes.teams) line('teams', S.notes.teams, true);
    if (S.notes.cal) line('cal', S.notes.cal, false);
    var noun = S.rankingTeams ? ' new item' : ' new mail';
    if (S.ranking) line('ranking', 'Claude is ranking ' + S.ranking + noun + (S.ranking === 1 ? '' : 's') + '…', false);
    else if (S.notes.rank) line('rank', S.notes.rank, true);
    if (S.notes.waits) line('waits', S.notes.waits, false);
    if (S.notes.store) line('store', S.notes.store, false);
    $('notes').innerHTML = h;
  }
  function renderHeader() {
    var top = topItems(), open = top.filter(function (it) { return !isClosed(it.id); }).length, rest = restItems().length;
    $('sub').textContent = S.loading && !S.loaded ? 'Reading your inbox…' :
      (open ? open + ' action' + (open === 1 ? '' : 's') + ' queued · ' + rest + ' deferred' : 'All clear · ' + rest + ' deferred') +
      (S.waitPre.length ? ' · ' + S.waitPre.length + ' waiting on others' : '');
    renderStatus(); renderNotes();
  }
  function srcKind(it) { return isTeams(it) ? 'teams' : isWait(it) ? 'wait' : fromMeeting(it) ? 'meeting' : isMine(it) ? 'mine' : 'mail'; }
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
    if (s.phase === 'sent') return '<span class="state-chip">' + ico('check') + 'Sent ' + U.hhmm(s.sentAt) + ' · done</span>';
    if (S.doneNow[id] && S.doneNow[id].how === 'chased') return '<span class="state-chip">' + ico('check') + 'Chased in Teams ' + esc(U.hhmm(new Date(S.doneNow[id].at))) + '</span>';
    if (S.doneNow[id]) return '<span class="state-chip">' + ico('check') + 'Done</span>';
    return '';
  }
  function actHTML(it) {
    if (isClosed(it.id)) return stateChip(it.id);
    if (waitingTeams(it.id)) return '<button class="btn-act is-wait" data-act="' + esc(it.id) + '" data-waiting>' + 'Waiting for you to send in Teams' + '</button>';
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
    if (!items.length) h = S.loading && !S.loaded ? '<li class="loading-line">Loading mail and chats…</li>' : '<li class="allclear">All clear. Nothing needs you right now.</li>';
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
        isWait(it) ? ' waiting on others ' + it.what + ' ' + it.summary : '';
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
  function chatHTML(it) {
    var c = S.chat[it.id] || { log: [] };
    var h = '<div class="chat" id="chat"><div class="chat-log">' +
      '<div class="cm c">' + ico('spark') + '<span>' + (rt.sample ? 'What should change? I can make it shorter, firmer, or add a date.' : 'Claude isn’t available here. You can still edit the draft yourself.') + '</span></div>';
    c.log.forEach(function (m) {
      h += m.u ? '<div class="cm u">' + esc(m.t) + '</div>' : '<div class="cm c' + (m.wait ? ' is-wait' : '') + '">' + ico('spark') + '<span>' + esc(m.t) + '</span></div>';
    });
    h += '</div>';
    if (rt.sample) {
      h += '<div class="chat-chips">' + ['Shorter', 'More direct', 'Add a deadline'].map(function (x) { return '<button class="chat-chip" data-chip="' + x + '"' + (c.busy ? ' aria-disabled="true"' : '') + '>' + x + '</button>'; }).join('') +
        '</div><form class="chat-form" data-chatform><label class="sr" for="chatIn">Message Claude about this item</label>' +
        '<input id="chatIn" placeholder="Tell Claude what to change" autocomplete="off"><button class="icon-btn" type="submit" aria-label="Send to Claude">' + ico('arrowUp') + '</button></form>';
    }
    return h + '</div>';
  }
  function emptyHTML() {
    return '<div class="iv-head"><span class="iv-crumb"><span class="tag"><i style="background:var(--faint)"></i>Item</span><span class="sep" aria-hidden="true">//</span><span class="c-sec">Standby</span></span></div>' +
      '<div class="empty"><div>' +
      '<svg class="empty-mark" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="44" fill="none" stroke="currentColor" stroke-width="2"/><path d="M44 88 60 52M54 32c6 0 8 4 10 10l14 46" fill="none" stroke="#ff8a1f" stroke-width="5" stroke-linecap="square"/></svg>' +
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
    if (isTeams(it)) {
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
  function renderItem() {
    var col = $('itemCol');
    var it = S.cur && S.byId[S.cur];
    col.classList.toggle('is-idle', S.view !== 'item' || !it);
    if (S.view !== 'item' || !it) { col.innerHTML = emptyHTML(); return; }
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
          problemHTML(st) +
          '<div class="draft-foot">' + hint + '</div>' +
        '</div>' +
        (S.chatOpen && !locked ? chatHTML(it) : '') +
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
    if (isMine(it)) {
      return '<div class="quiet is-3">' + q('delete', 'trash', 'Delete') + q('notimp', 'down', 'Not important', 'n') +
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
    return '<div class="quiet">' + q('chat', 'chat', 'Chat<span class="q-x"> about this</span>', 'c', S.chatOpen) +
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

  /* ---------------- Loading and ranking ---------------- */
  var loadSeq = 0;
  /* Mail and Teams load side by side; a failing source keeps its last items
     and shows one quiet line of its own. Today's calendar (R5) is read only
     when there are open items, before ranking, so Claude sees the meetings. */
  function load(opts) {
    opts = opts || {};
    var seq = ++loadSeq, now = new Date();
    S.loading = true; renderList();
    var me = S.me ? Promise.resolve(S.me) : mail.getMe();
    var saved = S.loaded && !opts.full ? Promise.resolve(null) : store.loadAll();
    var inbox = mail.loadInbox(now).then(function (r) { return { ok: true, r: r }; }, function (e) { return { ok: false, e: e }; });
    var chats = me.then(function (who) {
      if (!who || !who.mail) return { ok: false, e: { code: 'no_me' } };
      return teams.load(who, now, mail.meDomain ? [mail.meDomain] : []).then(function (r) { return { ok: true, r: r }; }, function (e) { return { ok: false, e: e }; });
    });
    var cal = { ok: true, r: S.meetings };
    return Promise.all([me, saved, inbox, chats]).then(function (res) {
      if (seq !== loadSeq) return null;
      S.me = res[0] || S.me;
      if (res[1]) {
        S.rankings = res[1].rankings; S.doneDb = res[1].done; S.feedback = res[1].feedback; S.sentDb = res[1].sent || {};
        S.handoffDb = res[1].handoff || {};
        /* Actions added while this was loading stay. */
        S.actions = Object.assign({}, res[1].actions || {}, S.actions);
        S.verdict = {};
        S.feedback.forEach(function (f) { if (f.msgId && !S.verdict[f.msgId]) S.verdict[f.msgId] = f.verdict; });
        if (!res[1].ok) S.notes.store = 'Couldn’t read what Droplet remembers; ranking and done marks start fresh.';
        else if (!rt.db) S.notes.store = 'Droplet can’t save here, so done marks and ranking reset when you reload.';
      }
      var inb = res[2], ch = res[3];
      var mailItems = S.items.filter(function (m) { return m.src !== 'teams'; });
      var teamItems = S.items.filter(function (m) { return m.src === 'teams'; });
      if (inb.ok) {
        S.mcpOk = true; S.notes.mail = null; S.syncAt = new Date();
        mailItems = inb.r.items;
      } else {
        S.mcpOk = false;
        S.notes.mail = rt.mcpCopy(inb.e, 'your Outlook mail');
      }
      if (ch.ok) {
        S.teamsOk = true; S.notes.teams = null;
        teamItems = ch.r;
        if (inb.ok) S.syncAt = new Date();
      } else {
        S.teamsOk = false;
        /* The same failure as mail (no connector at all) needs no second line. */
        var same = !inb.ok && inb.e && ch.e && (inb.e.code === ch.e.code || ch.e.code === 'no_me');
        S.notes.teams = same ? null : ch.e && ch.e.code === 'no_me' ? 'Couldn’t tell which Teams messages are yours, so Teams is left out for now.' : teamsCopy(ch.e);
      }
      var all = mailItems.concat(teamItems), doneIds = {};
      var items = all.filter(function (m) {
        var done = S.doneDb && S.doneDb[m.key] && !S.doneNow[m.id];
        if (done) doneIds[m.id] = 1;
        return !done;
      });
      Object.keys(S.actions).forEach(function (docId) {
        var a = S.actions[docId], it = syncAction(mine.toItem(docId, a));
        if (a.done) doneIds[it.id] = 1; else items.push(it);
      });
      if (!items.length) return [items, cal, doneIds];
      return meet.load(S.me, now).then(function (r) { S.notes.cal = null; return [items, { ok: true, r: r }, doneIds]; },
        function () { S.notes.cal = 'Couldn’t read today’s calendar, so meetings aren’t weighed this time.'; return [items, { ok: false, r: S.meetings }, doneIds]; });
    }).then(function (got) {
      if (!got || seq !== loadSeq) return;
      var items = got[0], doneIds = got[2] || {};
      S.meetings = got[1].r || [];
      var keep = {};
      items.forEach(function (m) {
        keep[m.id] = 1;
        m.meeting = meet.forItem(m, S.meetings);
        var saved = S.rankings[m.key], meetKey = m.meeting ? m.meeting.key : '';
        var fix = function (t) {
          return m.src === 'teams' ? rank.normalizeChat(t, { sign: rank.signName(S.me) }) : rank.normalizeDraft(t, { senderFirst: m.senderName, sign: rank.signName(S.me) });
        };
        /* Drafts cached by an earlier version go through the same format safety net (idempotent).
           A ranking made without today's meeting (R5) is asked again. */
        if (saved && saved.v === 1 && (saved.meet || '') === meetKey) { m.r = saved; if (saved.draft) saved.draft = fix(saved.draft); }
        else if (saved && saved.v === 1 && saved.draft) m.lazyDraft = fix(saved.draft);
        else if (saved && saved.draftOnly && typeof saved.draft === 'string') m.lazyDraft = fix(saved.draft);
        var sent = S.sentDb && S.sentDb[m.key];
        if (sent && (!S.send[m.id] || S.send[m.id].phase === 'idle')) S.send[m.id] = { phase: 'sent', sentAt: new Date(sent.sentAt) };
        var ho = S.handoffDb && S.handoffDb[m.key];
        if (ho && !S.handoff[m.id]) S.handoff[m.id] = ho;
      });
      /* R8: an item merged into one that is done is done too. */
      items = items.filter(function (m) { return !(m.r && m.r.dupOf && doneIds[m.r.dupOf]); });
      S.items = items;
      Object.keys(S.doneNow).forEach(function (id) { if (!keep[id]) delete S.doneNow[id]; });
      /* R4 for Teams: once your own message is in the chat, the chat is no longer an item. */
      Object.keys(S.handoff).forEach(function (id) {
        var it = null;
        S.items.forEach(function (m) { if (m.id === id) it = m; });
        if (!it || it.key !== S.handoff[id].key) {
          if (S.handoff[id].key) { store.clearHandoff(S.handoff[id].key); if (S.handoffDb) delete S.handoffDb[S.handoff[id].key]; }
          delete S.handoff[id];
        }
      });
      S.byId = {}; S.items.forEach(function (m) { S.byId[m.id] = m; });
      S.loading = false; S.loaded = true;
      renderAll();
      return rankNew(false);
    });
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
    S.ranking = fresh.length; S.rankingTeams = fresh.some(isTeams); renderList();
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
    }).then(function () {
      S.ranking = 0; S.rankingTeams = false; S.rankRun = null;
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
    if (!it || isMine(it) || claudeDraft(it) || S.touched[it.id] || sendState(it.id).phase !== 'idle') return;
    var ds = S.drafting[it.id];
    if (ds === 'loading' || (ds && !again)) return;
    if (S.ranking && !it.r) return; /* the running ranking writes one; checked again when it ends */
    if (!rt.sample) return;
    var id = it.id;
    S.drafting[id] = 'loading';
    if (isCur(id)) rerenderItemKeepFocus();
    readDetail(it).then(function (d) {
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
    d.promise = (isTeams(it) ? teams.read(it) : mail.read(it)).then(function (x) {
      S.detail[it.id] = Object.assign({ state: 'ok' }, x);
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
    if (!isMine(it)) { readDetail(it); ensureDraft(it); }
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
    var text = String(S.drafts[id] || '').trim(); if (!text) return;
    var t = performance.now();
    if (st.phase === 'unclear') {
      if (t < (st.armAt || 0)) return;
      if (!st.confirm) { st.confirm = 1; st.armAt = t + 700; renderItem(); var b = $('sendBtn'); if (b) b.focus(); return; }
    }
    var reuse = st.draftId ? { draftId: st.draftId, link: st.draftLink, text: st.draftText } : null;
    S.send[id] = st = { phase: 'sending', draftId: st.draftId, draftLink: st.draftLink, draftText: st.draftText };
    renderItem(); renderFocus();
    var d = S.detail[id];
    var conv = d && d.state === 'ok' ? Promise.resolve(d) : readDetail(it);
    conv.then(function (dd) {
      if (!dd || dd.state !== 'ok' || !dd.conversationId) {
        return { phase: 'failed', step: flow.STEPS.original, code: dd && dd.state === 'ok' ? 'no_conversation_id' : (dd && dd.code) || 'unknown',
          detail: dd && dd.message || '', message: 'Couldn’t read the original mail from Outlook, so nothing was sent. Try again.' };
      }
      return flow.send({ item: it, text: text, conversationId: dd.conversationId, reuse: reuse });
    }).then(function (res) {
      var ns = S.send[id] = { phase: res.phase, message: res.message || '', sentAt: res.sentAt, draftId: res.draftId || '', draftLink: res.draftLink || '', draftText: res.draftText || '',
        step: res.step || '', code: res.code || '', detail: res.detail || '', safeDetail: res.safeDetail || '' };
      if (res.phase === 'unclear') { ns.confirm = 0; ns.armAt = performance.now() + 700; }
      if (res.phase === 'blocked' && !res.keepDraft) { ns.draftId = ''; }
      if (res.phase === 'sent') {
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
    var st = S.cur && S.send[S.cur]; if (!st || !st.step) return;
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
    var id = S.cur, it = S.byId[id]; if (!it || !isTeams(it)) return;
    var text = String(S.drafts[id] || '').trim(); if (!text) return;
    var p;
    try { p = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text) : Promise.reject(); } catch (e) { p = Promise.reject(); }
    var link = U.safeTeamsLink(it.webUrl);
    if (link) { try { window.open(link, '_blank', 'noopener,noreferrer'); } catch (e) { /* the Open in Teams link stays on the card */ } }
    var ho = S.handoff[id] = { at: new Date().toISOString(), key: it.key };
    if (S.handoffDb) S.handoffDb[it.key] = ho;
    store.setHandoff(it.key, ho);
    Promise.resolve(p).then(function () { return true; }, function () { return false; }).then(function (ok) {
      renderAll();
      if (ok) {
        toast(link ? 'Copied. Paste it in the Teams chat that just opened.' : 'Copied. Open the chat in Teams and paste it.');
      } else {
        var ta = $('draftText');
        if (ta && S.cur === id) { ta.focus({ preventScroll: true }); ta.select(); }
        toast('Couldn’t copy. The text is selected: press Ctrl+C (⌘C), then paste it in Teams.');
      }
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
    if (S.loaded) rankNew(false); else S.rankAgain = true;
    return true;
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
  function toggleChat() {
    S.chatOpen = !S.chatOpen; renderItem();
    if (S.chatOpen) { var ci = $('chatIn'); if (ci) { ci.focus({ preventScroll: true }); ci.scrollIntoView({ block: 'center' }); } }
  }
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
    S.doneNow[it.id] = { how: 'manual' };
    store.setDone(it.key, { at: new Date().toISOString(), how: 'manual' });
    back();
    toast('Marked done.', function () { undoDone(it.id); });
  }

  /* ---------------- Chat about this ---------------- */
  function chatSay(id, text) {
    var it = S.byId[id]; if (!it || !text) return;
    var c = S.chat[id] = S.chat[id] || { log: [] };
    if (c.busy) return;
    var history = c.log.slice();
    c.log.push({ u: true, t: text });
    var wait = { u: false, t: 'Thinking…', wait: true };
    c.log.push(wait); c.busy = true;
    rerenderItemKeepFocus();
    var d = S.detail[id];
    chat.ask({ me: S.me, now: new Date(), item: it, mailText: sourceText(it, d), draft: S.drafts[id] || '' }, history, text).then(function (a) {
      wait.t = a.reply; wait.wait = false;
      var st = sendState(id);
      if (a.draft && st.phase !== 'sent' && st.phase !== 'sending') S.drafts[id] = a.draft;
    }, function (e) {
      wait.t = rt.sampleCopy(e) + '. Try again in a moment.'; wait.wait = false; wait.err = true;
    }).then(function () {
      c.busy = false;
      if (S.view === 'item' && S.cur === id) { rerenderItemKeepFocus(); var ci = $('chatIn'); if (ci && document.activeElement === document.body) ci.focus({ preventScroll: true }); }
    });
  }

  /* ---------------- Events ---------------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('button, a');
    if (!t) return;
    if (t.tagName === 'A') return; /* only safe Outlook links are rendered as links */
    var id;
    if ((id = t.getAttribute('data-open'))) return openItem(id, false);
    if ((id = t.getAttribute('data-act'))) { var it = S.byId[id]; return openItem(id, !!(it && rk(it).kind === 'reply')); }
    if (t.id === 'restToggle') { S.restOpen = !S.restOpen; renderRest(); if (S.restOpen) $('q').focus(); return; }
    if (t.hasAttribute('data-back')) return back();
    if (t.hasAttribute('data-sync')) { if (!S.loading) load({ full: false }); return; }
    if ((id = t.getAttribute('data-retry'))) {
      if (id === 'mail') { S.notes.mail = null; return (rt.mcp ? Promise.resolve() : rt.retryUse('mcp')).then(function () { load({ full: false }); }); }
      if (id === 'teams') { S.notes.teams = null; renderNotes(); return (rt.mcp ? Promise.resolve() : rt.retryUse('mcp')).then(function () { if (!S.loading) load({ full: false }); }); }
      if (id === 'rank') { S.notes.rank = null; return (rt.sample ? Promise.resolve() : rt.retryUse('sample')).then(function () { rankNew(true); }); }
      return;
    }
    if (t.hasAttribute('data-reread') && S.cur) { delete S.detail[S.cur]; var ci0 = S.byId[S.cur]; if (ci0) readDetail(ci0); return; }
    if (t.hasAttribute('data-undo')) { var u = S.undo; S.undo = null; $('toastHost').innerHTML = ''; if (u) u(); return; }
    if (t.getAttribute('aria-disabled') === 'true') return;
    var cur = S.cur;
    if (t.hasAttribute('data-send') && cur) return onSend();
    if (t.hasAttribute('data-copyopen') && cur) return copyOpen();
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
    if (t.hasAttribute('data-chip') && cur) return chatSay(cur, t.getAttribute('data-chip'));
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
    if (e.target.hasAttribute('data-chatform')) {
      var inp = $('chatIn'), v = inp ? inp.value.trim() : '';
      if (v && S.cur) { inp.value = ''; chatSay(S.cur, v); }
    }
  });
  document.addEventListener('input', function (e) {
    if (e.target.id === 'q') { S.q = e.target.value; renderRest(); }
    if ((e.target.id === 'actText' || e.target.id === 'actNotes') && curAction()) {
      var ed = S.actEdit[curAction().docId] = S.actEdit[curAction().docId] || {};
      ed[e.target.id === 'actText' ? 'text' : 'notes'] = e.target.value;
    }
    if (e.target.id === 'draftText' && S.cur) {
      var first = !S.touched[S.cur];
      S.drafts[S.cur] = e.target.value; S.touched[S.cur] = true;
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
  });
  document.addEventListener('focusin', function (e) {
    if (S.view !== 'item') return;
    var p = $('listCol').contains(e.target) ? 'list' : $('itemCol').contains(e.target) ? 'item' : null;
    if (p && p !== S.pane) { S.pane = p; renderPane(); }
  });
  document.addEventListener('keydown', function (e) {
    var tg = (e.target.tagName || '').toLowerCase(), typing = tg === 'input' || (tg === 'textarea' && !e.target.readOnly);
    /* Esc in the draft only leaves the text field; a second Esc closes. */
    if (e.key === 'Escape') {
      if (e.target.id === 'draftText' || e.target.id === 'actText' || e.target.id === 'actNotes' || e.target.id === 'actDue') { e.target.blur(); return; }
      if (e.target.id === 'addIn') { e.target.blur(); return; }
      if (S.view === 'item') return back();
      return;
    }
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
    if (S.view !== 'item' || S.pane !== 'item' || !S.cur) return;
    var ph = sendState(S.cur).phase;
    if (ph === 'sent' || ph === 'sending') return;
    if (e.key === 'c') { e.preventDefault(); toggleChat(); }
    else if (e.key === 'n') { e.preventDefault(); notImportant(); }
    else if (e.key === 'd') { e.preventDefault(); markDone(); }
  });

  /* ---------------- Boot ---------------- */
  store.onError = function () { S.notes.store = 'Couldn’t save a change; it may be gone after a reload.'; renderNotes(); };
  renderAll();
  rt.init().then(function () { renderStatus(); return load({ full: true }); });
})(window.Droplet = window.Droplet || {});
