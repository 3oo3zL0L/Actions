/* Droplet · Agenda in Today. Two kinds of calendar items, never ranked by
   Claude, each with only Open and Done:
   - today: your appointments of today with the Green, Blue or Red category
     (Outlook's default names, also Dutch), until they have ended;
   - ahead: STEERCO and the quarterly release plan, from 14 days before.
   Read-only: nothing in the calendar is changed. */
(function (D) {
  "use strict";
  var U = D.util, rt = D.rt, meet = D.meet, mine = D.mine;
  var ag = D.agenda = {};
  ag.AHEAD_DAYS = 14;
  var COLOR = [["green", /^(green|groene?)\b/i], ["blue", /^(blue|blauwe?)\b/i], ["red", /^(red|rode?)\b/i]];
  ag.colorOf = function (cats) {
    var list = Array.isArray(cats) ? cats : [];
    for (var i = 0; i < COLOR.length; i++) {
      for (var j = 0; j < list.length; j++) {
        var c = String(list[j] || "").trim();
        if (COLOR[i][1].test(c) && /(category|categorie)$/i.test(c)) return COLOR[i][0];
      }
    }
    return null;
  };
  ag.kindAhead = function (subject) {
    var s = String(subject || "");
    if (/steer\s*co/i.test(s)) return "steerco";
    if (/release\s*plan\s*q[1-4]\b|\bq[1-4]\s*release|release\s*q[1-4]\b/i.test(s)) return "release";
    return null;
  };
  /* A short, stable document key (letters and digits only). */
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(36);
  }
  function addr(x) { var e = x && (x.emailAddress || x); return typeof e === "string" ? e : String(e && (e.address || e.email) || ""); }
  function norm(o) {
    if (!o || typeof o !== "object" || !o.id || !o.start) return null;
    if (o.isCancelled === true) return null;
    var start = meet.toInstant(o.start), end = meet.toInstant(o.end);
    if (!isFinite(start)) return null;
    if (!isFinite(end) || end < start) end = start + 30 * 6e4;
    return { id: String(o.id), subject: U.clip(String(o.subject || "(no subject)"), 200), start: start, end: end, allDay: o.isAllDay === true,
      location: U.clip(String(o.location && (o.location.displayName || o.location) || ""), 120), organizer: addr(o.organizer),
      people: Array.isArray(o.attendees) ? o.attendees.length : 0, cats: Array.isArray(o.categories) ? o.categories : [],
      webLink: U.safeOutlookLink(o.webLink) };
  }
  function search(input) {
    return rt.call("outlook_calendar_search", input).then(function (res) {
      return U.resultObjects(res).map(norm).filter(Boolean);
    });
  }
  /* Today's coloured appointments (not yet ended) and STEERCO / Q release
     plan within the next 14 days. One answer; a failed part is left out. */
  ag.load = function (now) {
    now = now || new Date();
    var today = mine.today(now), until = mine.addDays(today, ag.AHEAD_DAYS + 1);
    var parts = [
      search({ query: "*", afterDateTime: "today", beforeDateTime: "tomorrow", limit: 25, order: "oldest" }),
      search({ query: "steerco", afterDateTime: today, beforeDateTime: until, limit: 25 }),
      search({ query: "release", afterDateTime: today, beforeDateTime: until, limit: 25 })
    ];
    return Promise.all(parts.map(function (p) { return p.then(function (v) { return { ok: true, v: v }; }, function (e) { return { ok: false, e: e }; }); })).then(function (rs) {
      if (!rs.some(function (r) { return r.ok; })) throw rs[0].e;
      var out = [], seen = {}, t = now.getTime(), horizon = t + (ag.AHEAD_DAYS + 1) * 864e5;
      rs[0].ok && rs[0].v.forEach(function (e) {
        var c = ag.colorOf(e.cats);
        if (!c || !U.sameDay(new Date(e.start), now) || e.end <= t || e.allDay) return;
        seen[e.id + "@" + e.start] = 1;
        out.push(Object.assign({ kind: "today", color: c }, e));
      });
      [rs[1], rs[2]].forEach(function (r) {
        if (!r.ok) return;
        r.v.forEach(function (e) {
          var k = ag.kindAhead(e.subject);
          if (!k || e.end <= t || e.start > horizon || seen[e.id + "@" + e.start]) return;
          seen[e.id + "@" + e.start] = 1;
          out.push(Object.assign({ kind: k, color: ag.colorOf(e.cats) }, e));
        });
      });
      return out.sort(function (a, b) { return a.start - b.start; });
    });
  };
  ag.daysUntil = function (start, now) { return mine.diffDays(mine.today(now), mine.today(new Date(start))); };
  ag.key = function (e) { return "cal-" + hash(e.id + "@" + e.start); };
})(window.Droplet = window.Droplet || {});
