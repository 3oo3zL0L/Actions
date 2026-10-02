/* Droplet · slice 1 app: Outlook mail → ranked focus list → suggested
   action → your click. Markup, classes and interactions follow the
   approved Lambda v3 design. */
(function (D) {
  "use strict";
  var U = D.util, rt = D.rt, store = D.store, mail = D.mail, rank = D.rank, flow = D.sendflow, chat = D.chat;
  var esc = U.esc, pad = U.pad;
  var FOCUS_MAX = 5;

  /* ---------------- Icons (from the design) ---------------- */
  var P = {
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6 8.5-6"/>',
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
    out: '<path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5"/>'
  };
  function ico(name, cls) { return '<svg class="ico ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + P[name] + '</svg>'; }

  /* ---------------- State ---------------- */
  var S = {
    view: 'list', cur: null, pane: 'list', restOpen: false, q: '', chatOpen: false, scrollY: 0, toastTimer: null, anim: false,
    me: null, items: [], byId: {}, loading: true, loaded: false, ranking: 0, syncAt: null, mcpOk: null,
    notes: { mail: null, rank: null, store: null }, rankings: {}, feedback: [], verdict: {}, doneNow: {},
    drafts: {}, touched: {}, drafting: {}, send: {}, detail: {}, chat: {}, undo: null
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
    return g;
  }
  function GI(g) { return g === 'now' ? 0 : g === 'later' ? 1 : 2; }
  function cmp(a, b) {
    var x, y;
    if ((x = a.standstill ? 0 : 1) !== (y = b.standstill ? 0 : 1)) return x - y;
    if ((x = S.verdict[a.id] === 'down' ? 1 : 0) !== (y = S.verdict[b.id] === 'down' ? 1 : 0)) return x - y;
    if ((x = S.verdict[a.id] === 'up' ? 0 : 1) !== (y = S.verdict[b.id] === 'up' ? 0 : 1)) return x - y;
    if ((x = GI(groupOf(a))) !== (y = GI(groupOf(b)))) return x - y;
    x = a.r && isFinite(a.r.pos) ? a.r.pos : Infinity; y = b.r && isFinite(b.r.pos) ? b.r.pos : Infinity;
    if (x !== y) return x < y ? -1 : 1;
    return String(b.received).localeCompare(String(a.received));
  }
  function visible() {
    return S.items.filter(function (it) {
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
    S.items.forEach(function (o) { if (o !== it && rk(o).dupOf === it.id) n += 1 + (o.merged || []).length; });
    return n;
  }
  function sendState(id) { return S.send[id] || (S.send[id] = { phase: 'idle' }); }
  function isSent(id) { return sendState(id).phase === 'sent'; }
  function isClosed(id) { return !!S.doneNow[id]; }
  function isCur(id) { return S.view === 'item' && S.cur === id; }
  function project(it) { return rk(it).project || (it.internal ? 'Inbox' : 'Outside Planon'); }
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
  function tag(it) { return U.firstName(it.senderName) || it.senderName || 'Mail'; }

  /* ---------------- Render: list ---------------- */
  function renderStatus() {
    var m = S.mcpOk, cl = !!rt.sample;
    $('status').innerHTML =
      '<span><i' + (m === false ? ' class="off"' : '') + '></i>M365 link</span>' +
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
    if (S.ranking) line('ranking', 'Claude is ranking ' + S.ranking + ' new mail' + (S.ranking === 1 ? '' : 's') + '…', false);
    else if (S.notes.rank) line('rank', S.notes.rank, true);
    if (S.notes.store) line('store', S.notes.store, false);
    $('notes').innerHTML = h;
  }
  function renderHeader() {
    var top = topItems(), open = top.filter(function (it) { return !isClosed(it.id); }).length, rest = restItems().length;
    $('sub').textContent = S.loading && !S.loaded ? 'Reading your inbox…' :
      open ? open + ' action' + (open === 1 ? '' : 's') + ' queued · ' + rest + ' deferred' : 'All clear · ' + rest + ' deferred';
    renderStatus(); renderNotes();
  }
  function srcHTML() { return '<span class="src">' + ico('mail') + 'Mail</span>'; }
  function stateChip(id) {
    var s = sendState(id);
    if (s.phase === 'sent') return '<span class="state-chip">' + ico('check') + 'Sent ' + U.hhmm(s.sentAt) + ' · done</span>';
    if (S.doneNow[id]) return '<span class="state-chip">' + ico('check') + 'Done</span>';
    return '';
  }
  function renderFocus() {
    var items = topItems(), h = '';
    var firstOpen = items.filter(function (it) { return !isClosed(it.id); })[0];
    items.forEach(function (it, i) {
      var cur = isCur(it.id), r = rk(it), n = dupCount(it), fl = flag(it);
      var cls = 'fi' + (it === firstOpen ? ' is-first' : '') + (isClosed(it.id) ? ' is-closed' : '') + (cur ? ' is-current' : '');
      h += '<li class="' + cls + '" data-id="' + esc(it.id) + '">' +
        '<button class="fi-open" data-open="' + esc(it.id) + '"' + (cur ? ' aria-current="true"' : '') + ' aria-label="Open ' + (i + 1) + ': ' + esc(it.subject) + '">' +
          '<span class="fi-rank" aria-hidden="true">' + pad(i + 1) + '</span>' +
          '<span class="fi-body">' +
            '<span class="fi-meta">' + srcHTML() + '<span class="sep" aria-hidden="true">·</span><span>' + esc(project(it)) + '</span>' +
              (fl ? '<span class="flag">' + esc(fl) + '</span>' : '') +
              (n ? '<span>+' + n + ' in thread</span>' : '') +
              '<span class="cur-tag" aria-hidden="true">In panel</span></span>' +
            '<span class="fi-title">' + esc(it.subject || '(no subject)') + '</span>' +
            '<span class="fi-why">' + ico('spark') + '<span>' + esc(r.why) + '</span></span>' +
          '</span>' +
        '</button>' +
        '<div class="fi-act">' + (isClosed(it.id) ? stateChip(it.id) : '<button class="btn-act" data-act="' + esc(it.id) + '">' + esc(r.label) + '</button>') + '</div>' +
      '</li>';
    });
    if (!items.length) h = S.loading && !S.loaded ? '<li class="loading-line">Loading mail…</li>' : '<li class="allclear">All clear. Nothing needs you right now.</li>';
    $('focus').innerHTML = h;
  }
  function renderRest() {
    var all = restItems(), q = S.q.trim().toLowerCase(), base = topItems().length;
    $('restCount').textContent = all.length;
    var list = all.filter(function (it) {
      if (!q) return true;
      return (it.subject + ' ' + project(it) + ' ' + it.senderName + ' ' + it.sender + ' ' + rk(it).why + ' Mail').toLowerCase().indexOf(q) !== -1;
    });
    var h = '';
    list.forEach(function (it) {
      var n = all.indexOf(it) + base + 1, cur = isCur(it.id);
      h += '<li><button class="rr' + (isClosed(it.id) ? ' is-closed' : '') + (cur ? ' is-current' : '') + '" data-open="' + esc(it.id) + '"' + (cur ? ' aria-current="true"' : '') + '>' +
        '<span class="rr-n">' + pad(n) + '</span>' + ico('mail') +
        '<span class="rr-t"><span class="rr-title">' + esc(it.subject || '(no subject)') + '</span><span class="rr-sub">Mail · ' + esc(project(it)) + ' · ' + esc(it.senderName) +
        (S.verdict[it.id] === 'down' ? ' · marked not important' : '') + '</span></span></button></li>';
    });
    if (!list.length) h = '<li class="rest-empty">' + (q ? 'Nothing matches “' + esc(S.q) + '”.' : 'Nothing else right now.') + '</li>';
    $('restList').innerHTML = h;
    $('restToggle').setAttribute('aria-expanded', String(S.restOpen));
    $('restPanel').hidden = !S.restOpen;
  }

  /* ---------------- Render: item view ---------------- */
  function sourceHTML(it) {
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
    if (locked) return 'Sent once. This draft is locked.';
    if (busy) return 'Sending… Don’t close this page.';
    if (ds === 'loading' && !S.touched[it.id]) return 'Claude is writing a draft in your style…';
    if (ds && ds.error && !S.touched[it.id] && !String(S.drafts[it.id] || '').trim()) {
      return esc(ds.error) + '. Write your own, or <button data-redraft>Try again</button>';
    }
    return 'Click the text to edit it. Nothing is sent until you press Send.';
  }
  function renderItem() {
    var col = $('itemCol');
    var it = S.cur && S.byId[S.cur];
    col.classList.toggle('is-idle', S.view !== 'item' || !it);
    if (S.view !== 'item' || !it) { col.innerHTML = emptyHTML(); return; }
    var r = rk(it), st = sendState(it.id), locked = st.phase === 'sent', busy = st.phase === 'sending';
    var top = topItems(), rankIdx = top.indexOf(it), inFocus = rankIdx > -1;
    var n = inFocus ? rankIdx + 1 : restItems().indexOf(it) + top.length + 1;
    var fl = flag(it), outside = !U.isInternal(it.sender, mail.meDomain ? [mail.meDomain] : []);
    var editable = !locked && !busy;
    var draftRows = '<div class="draft-row"><span class="k">To</span><span class="chips"><span class="chip addr" data-to>' + esc(it.sender) + '</span></span></div>' +
      '<div class="draft-row"><span class="k">Subject</span><span>' + esc(/^re:/i.test(it.subject) ? it.subject : 'RE: ' + it.subject) + '</span></div>';
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
        '<div class="iv-meta">' + srcHTML() + '<span class="sep" aria-hidden="true">·</span><span>' + esc(project(it)) + '</span>' +
          (fl ? '<span class="flag">' + esc(fl) + '</span>' : '') + '<span class="sep" aria-hidden="true">·</span><span>' + esc(U.when(it.received, new Date())) + '</span></div>' +
        '<h2 class="iv-title" id="ivTitle" tabindex="-1">' + esc(it.subject || '(no subject)') + '</h2>' +
        '<div class="iv-why"><span class="who" aria-hidden="true">' + ico('spark') + '</span><p><span class="sr">Claude: </span>' + esc(r.why) + '</p></div>' +
        '<div class="sec-label">' + ico('mail') + 'From your inbox</div>' +
        '<div class="card src-card">' + sourceHTML(it) + '</div>' +
        '<div class="sec-label">' + ico('spark') + (claudeDraft(it) ? 'Prepared draft' : 'Your reply') + ' · Reply · mail</div>' +
        '<div class="card draft' + (locked ? ' is-locked' : '') + '">' + draftRows +
          '<label class="sr" for="draftText">Draft text</label>' +
          '<textarea id="draftText"' + (editable ? '' : ' readonly') + (writing ? ' aria-busy="true"' : '') + ' placeholder="' + (writing ? 'Claude is writing a draft…' : 'Write your reply…') + '">' + esc(draftOf(it)) + '</textarea>' +
          (outside ? '<div class="warn" data-outside>' + ico('warn', 'ico-sm') + 'Goes outside Planon. Check before sending.</div>' : '') +
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
    var empty = !String(S.drafts[it.id] || '').trim(), btn;
    if (locked) btn = '<button class="btn-send is-sent" id="sendBtn" aria-disabled="true">Sent ✓ ' + U.hhmm(st.sentAt) + ' · locked</button>';
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
  function load(opts) {
    opts = opts || {};
    var seq = ++loadSeq, now = new Date();
    S.loading = true; renderList();
    var me = S.me ? Promise.resolve(S.me) : mail.getMe();
    var saved = S.loaded && !opts.full ? Promise.resolve(null) : store.loadAll();
    var inbox = mail.loadInbox(now).then(function (r) { return { ok: true, r: r }; }, function (e) { return { ok: false, e: e }; });
    return Promise.all([me, saved, inbox]).then(function (res) {
      if (seq !== loadSeq) return;
      S.me = res[0] || S.me;
      if (res[1]) {
        S.rankings = res[1].rankings; S.doneDb = res[1].done; S.feedback = res[1].feedback; S.sentDb = res[1].sent || {};
        S.verdict = {};
        S.feedback.forEach(function (f) { if (f.msgId && !S.verdict[f.msgId]) S.verdict[f.msgId] = f.verdict; });
        if (!res[1].ok) S.notes.store = 'Couldn’t read what Droplet remembers; ranking and done marks start fresh.';
        else if (!rt.db) S.notes.store = 'Droplet can’t save here, so done marks and ranking reset when you reload.';
      }
      var inb = res[2];
      if (inb.ok) {
        S.mcpOk = true; S.notes.mail = null; S.syncAt = new Date();
        var keep = {};
        S.items = inb.r.items.filter(function (m) {
          if (S.doneDb && S.doneDb[m.key] && !S.doneNow[m.id]) return false;
          return true;
        });
        S.items.forEach(function (m) {
          keep[m.id] = 1;
          var saved = S.rankings[m.key];
          /* Drafts cached by an earlier version go through the same format safety net (idempotent). */
          var fix = function (t) { return rank.normalizeDraft(t, { senderFirst: m.senderName, sign: rank.signName(S.me) }); };
          if (saved && saved.v === 1) { m.r = saved; if (saved.draft) saved.draft = fix(saved.draft); }
          else if (saved && saved.draftOnly && typeof saved.draft === 'string') m.lazyDraft = fix(saved.draft);
          var sent = S.sentDb && S.sentDb[m.key];
          if (sent && (!S.send[m.id] || S.send[m.id].phase === 'idle')) S.send[m.id] = { phase: 'sent', sentAt: new Date(sent.sentAt) };
        });
        Object.keys(S.doneNow).forEach(function (id) { if (!keep[id]) delete S.doneNow[id]; });
      } else {
        S.mcpOk = false;
        S.notes.mail = rt.mcpCopy(inb.e, 'your Outlook mail');
      }
      S.byId = {}; S.items.forEach(function (m) { S.byId[m.id] = m; });
      S.loading = false; S.loaded = true;
      renderAll();
      return rankNew(false);
    });
  }

  function rankNew(refresh) {
    var fresh = S.items.filter(function (m) { return !m.r; });
    if (!fresh.length) { S.notes.rank = null; renderList(); return Promise.resolve(); }
    if (!rt.sample) {
      S.notes.rank = 'Claude isn’t available here, so new mail is newest first.';
      renderAll();
      return Promise.resolve();
    }
    S.ranking = fresh.length; renderList();
    var ranked = visible().filter(function (m) { return m.r; }).map(function (m) { return { subject: m.subject, senderName: m.senderName, group: groupOf(m) }; });
    return rank.ask({ me: S.me, now: new Date(), items: fresh, ranked: ranked, feedback: S.feedback }, refresh).then(function (v) {
      var existing = S.items.filter(function (m) { return m.r && isFinite(m.r.pos); }).map(function (m) { return { id: m.id, pos: m.r.pos }; });
      var got = Object.keys(v.byId).map(function (id) { return { id: id, rank: v.byId[id].rank }; });
      var pos = rank.assignPositions(existing, got);
      var at = new Date().toISOString(), writes = [];
      Object.keys(v.byId).forEach(function (id) {
        var m = S.byId[id]; if (!m) return;
        var r = Object.assign({ v: 1, pos: pos[id], rankedAt: at }, v.byId[id]);
        if (!r.draft && m.lazyDraft) r.draft = m.lazyDraft;
        m.r = r; S.rankings[m.key] = r;
        applyClaudeDraft(m);
        writes.push([m.key, r]);
      });
      writes.reduce(function (p, w) { return p.then(function () { return store.putRanking(w[0], w[1]); }); }, Promise.resolve());
      var missing = fresh.filter(function (m) { return !m.r; }).length;
      S.notes.rank = missing ? 'Claude skipped ' + missing + ' mail' + (missing === 1 ? '' : 's') + '; those are newest first.' : null;
    }, function (e) {
      S.notes.rank = rt.sampleCopy(e) + ', so new mail is newest first.';
    }).then(function () {
      S.ranking = 0; renderAll();
      var cur = S.view === 'item' && S.byId[S.cur];
      if (cur) ensureDraft(cur);
    });
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
    if (!it || claudeDraft(it) || S.touched[it.id] || sendState(it.id).phase !== 'idle') return;
    var ds = S.drafting[it.id];
    if (ds === 'loading' || (ds && !again)) return;
    if (S.ranking && !it.r) return; /* the running ranking writes one; checked again when it ends */
    if (!rt.sample) return;
    var id = it.id;
    S.drafting[id] = 'loading';
    if (isCur(id)) rerenderItemKeepFocus();
    readDetail(it).then(function (d) {
      return rank.askDraft({ me: S.me, now: new Date(), item: it, mailText: d && d.state === 'ok' ? d.text : '' });
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
    d.promise = mail.read(it).then(function (x) {
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
  function openItem(id, focusDraft) {
    var it = S.byId[id]; if (!it) return;
    if (S.view === 'list') S.scrollY = window.scrollY;
    S.cur = id; S.view = 'item'; S.pane = 'item'; S.anim = true; S.chatOpen = false;
    draftOf(it);
    renderAll();
    readDetail(it);
    ensureDraft(it);
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
    chat.ask({ me: S.me, now: new Date(), item: it, mailText: d && d.state === 'ok' ? d.text : '', draft: S.drafts[id] || '' }, history, text).then(function (a) {
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
      if (id === 'rank') { S.notes.rank = null; return (rt.sample ? Promise.resolve() : rt.retryUse('sample')).then(function () { rankNew(true); }); }
      return;
    }
    if (t.hasAttribute('data-reread') && S.cur) { delete S.detail[S.cur]; var ci0 = S.byId[S.cur]; if (ci0) readDetail(ci0); return; }
    if (t.hasAttribute('data-undo')) { var u = S.undo; S.undo = null; $('toastHost').innerHTML = ''; if (u) u(); return; }
    if (t.getAttribute('aria-disabled') === 'true') return;
    var cur = S.cur;
    if (t.hasAttribute('data-send') && cur) return onSend();
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
    if (e.target.hasAttribute('data-chatform')) {
      var inp = $('chatIn'), v = inp ? inp.value.trim() : '';
      if (v && S.cur) { inp.value = ''; chatSay(S.cur, v); }
    }
  });
  document.addEventListener('input', function (e) {
    if (e.target.id === 'q') { S.q = e.target.value; renderRest(); }
    if (e.target.id === 'draftText' && S.cur) {
      var first = !S.touched[S.cur];
      S.drafts[S.cur] = e.target.value; S.touched[S.cur] = true;
      if (first) { var ft = document.querySelector('.draft-foot'), cit = S.byId[S.cur]; if (ft && cit) ft.innerHTML = draftFoot(cit, false, false); }
      var b = $('sendBtn'), st = sendState(S.cur);
      if (b && b.hasAttribute('data-send') && st.phase !== 'unclear') {
        if (e.target.value.trim()) b.removeAttribute('aria-disabled'); else b.setAttribute('aria-disabled', 'true');
      }
    }
  });
  document.addEventListener('focusin', function (e) {
    if (S.view !== 'item') return;
    var p = $('listCol').contains(e.target) ? 'list' : $('itemCol').contains(e.target) ? 'item' : null;
    if (p && p !== S.pane) { S.pane = p; renderPane(); }
  });
  document.addEventListener('keydown', function (e) {
    var tg = (e.target.tagName || '').toLowerCase(), typing = tg === 'input' || (tg === 'textarea' && !e.target.readOnly);
    /* Esc in the draft only leaves the text field; a second Esc closes. */
    if (e.key === 'Escape') { if (e.target.id === 'draftText') { e.target.blur(); return; } if (S.view === 'item') return back(); return; }
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
