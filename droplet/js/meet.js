/* Droplet · R5 "meeting today": today's calendar, only to raise the open
   items of people you meet today. Never rows of its own. */
(function (D) {
  "use strict";
  var U = D.util, rt = D.rt;
  var meet = D.meet = {};

  /* Outlook names Windows time zones; Intl needs IANA names. */
  meet.ZONES = {
    "W. Europe Standard Time": "Europe/Amsterdam", "Romance Standard Time": "Europe/Paris",
    "Central Europe Standard Time": "Europe/Budapest", "Central European Standard Time": "Europe/Warsaw",
    "GMT Standard Time": "Europe/London", "Greenwich Standard Time": "Atlantic/Reykjavik",
    "UTC": "UTC", "Coordinated Universal Time": "UTC", "India Standard Time": "Asia/Kolkata",
    "Eastern Standard Time": "America/New_York", "Central Standard Time": "America/Chicago",
    "Mountain Standard Time": "America/Denver", "Pacific Standard Time": "America/Los_Angeles",
    "Singapore Standard Time": "Asia/Singapore", "China Standard Time": "Asia/Shanghai",
    "Tokyo Standard Time": "Asia/Tokyo", "AUS Eastern Standard Time": "Australia/Sydney"
  };
  var fmts = {};
  function fmt(tz) {
    return fmts[tz] || (fmts[tz] = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit"
    }));
  }
  /* How far the zone's wall clock is ahead of UTC at instant t (ms), or null. */
  function offsetAt(tz, t) {
    try {
      var p = {};
      fmt(tz).formatToParts(new Date(t)).forEach(function (x) { p[x.type] = x.value; });
      return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(t / 1000) * 1000;
    } catch (e) { return null; }
  }
  /* {dateTime: "2026-10-02T09:00:00.0000000", timeZone} → epoch ms (NaN when unknown).
     The dateTime is the wall clock in that zone. */
  meet.toInstant = function (dt) {
    if (!dt) return NaN;
    if (typeof dt === "string") dt = { dateTime: dt };
    var s = String(dt.dateTime || "").trim();
    if (/(?:Z|[+-]\d\d:?\d\d)$/i.test(s)) return Date.parse(s);
    var m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d)(?:\.\d+)?)?$/.exec(s);
    if (!m) return NaN;
    var name = String(dt.timeZone || "UTC").trim(), tz = meet.ZONES[name] || name;
    var wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    if (/^(utc|etc\/utc|gmt|z)$/i.test(tz)) return wall;
    var off = offsetAt(tz, wall);
    if (off == null) return NaN;
    var t = wall - off, off2 = offsetAt(tz, t);
    return off2 != null && off2 !== off ? wall - off2 : t;
  };

  function addr(x) {
    if (!x) return "";
    if (typeof x === "string") return x.trim().toLowerCase();
    var e = x.emailAddress || x;
    return String(e.address || e.email || "").trim().toLowerCase();
  }
  /* One event, or null when it doesn't count: cancelled, free, all-day, not
     today, or already over. */
  meet.normalize = function (o, me, now) {
    if (!o || typeof o !== "object") return null;
    if (o.isCancelled === true || o.isAllDay === true) return null;
    if (String(o.showAs || "").toLowerCase() === "free") return null;
    var start = meet.toInstant(o.start), end = meet.toInstant(o.end);
    if (!isFinite(start)) return null;
    if (!isFinite(end) || end < start) end = start + 30 * 6e4;
    now = now || new Date();
    if (!U.sameDay(new Date(start), now) || end <= now.getTime()) return null;
    var mine = String(me && me.mail || "").toLowerCase();
    var people = [addr(o.organizer)].concat((Array.isArray(o.attendees) ? o.attendees : []).map(addr))
      .filter(function (a, i, all) { return a && a !== mine && all.indexOf(a) === i; });
    return { id: String(o.id || ""), start: start, end: end, people: people };
  };

  /* Today's meetings that still count. Resolves a list; rejects with the connector error. */
  meet.load = function (me, now) {
    /* me may be a function: who you are when the answer arrives (get_me may still be on its way). */
    return rt.call("outlook_calendar_search", { query: "*", afterDateTime: "today", beforeDateTime: "tomorrow", limit: 25 }).then(function (res) {
      if (typeof me === "function") me = me();
      return U.resultObjects(res).filter(function (o) { return o.start || o.subject !== undefined; })
        .map(function (o) { return meet.normalize(o, me, now); }).filter(Boolean)
        .sort(function (a, b) { return a.start - b.start; });
    });
  };

  /* The first meeting today with the item's sender or chat participants. */
  meet.forItem = function (it, meetings) {
    var who = it.src === "teams" ? (it.participants || []).map(function (a, i) { return [a, (it.people || [])[i]]; }) : [[it.sender, it.senderName]];
    who = who.map(function (w) { return [String(w[0] || "").toLowerCase(), w[1]]; }).filter(function (w) { return w[0]; });
    for (var i = 0; i < (meetings || []).length; i++) {
      var ev = meetings[i];
      for (var j = 0; j < who.length; j++) {
        if (ev.people.indexOf(who[j][0]) >= 0) {
          var name = who[j][1] || U.nameFromAddress(who[j][0]);
          return { hhmm: U.hhmm(new Date(ev.start)), at: ev.start, name: U.firstName(name) || name, key: ev.id + "@" + ev.start };
        }
      }
    }
    return null;
  };
})(window.Droplet = window.Droplet || {});
