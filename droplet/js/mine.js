/* Droplet · your own actions (backlog 14): saved first, then ranked.
   Collection actions/<docId>: {text, created, done, doneAt, due, dueBy, notes}.
   due is a date (YYYY-MM-DD, Europe/Amsterdam); dueBy says who set it:
   "you" (always wins), "claude", or "parser" (the local fallback). */
(function (D) {
  "use strict";
  var U = D.util;
  var mine = D.mine = {};
  mine.TZ = "Europe/Amsterdam";
  mine.MAX_TEXT = 300;

  var fDate = new Intl.DateTimeFormat("en-CA", { timeZone: mine.TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  /* Today's date in Amsterdam, whatever the viewer's zone. */
  mine.today = function (now) { return fDate.format(now || new Date()); };
  function parts(iso) { var m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(String(iso || "")); return m ? [+m[1], +m[2] - 1, +m[3]] : null; }
  function addDays(iso, n) {
    var p = parts(iso), d = new Date(Date.UTC(p[0], p[1], p[2] + n));
    return d.toISOString().slice(0, 10);
  }
  function dow(iso) { var p = parts(iso); return new Date(Date.UTC(p[0], p[1], p[2])).getUTCDay(); }
  mine.validDate = function (s) {
    var p = parts(s);
    if (!p) return false;
    var d = new Date(Date.UTC(p[0], p[1], p[2]));
    return d.getUTCFullYear() === p[0] && d.getUTCMonth() === p[1] && d.getUTCDate() === p[2];
  };
  mine.diffDays = function (a, b) {
    var x = parts(a), y = parts(b);
    return Math.round((Date.UTC(y[0], y[1], y[2]) - Date.UTC(x[0], x[1], x[2])) / 864e5);
  };

  /* Working days (Mon-Fri, Europe/Amsterdam), for R3 and R6. */
  mine.isWorkday = function (iso) { var d = dow(iso); return d >= 1 && d <= 5; };
  /* Working days d with from < d <= to (both YYYY-MM-DD). An ask on Tue
     counts 3 on Fri; weekends are skipped. */
  mine.workdaysBetween = function (from, to) {
    if (!parts(from) || !parts(to) || to <= from) return 0;
    var n = 0, d = from;
    for (var guard = 0; guard < 400 && d < to; guard++) { d = addDays(d, 1); if (mine.isWorkday(d)) n++; }
    return n;
  };
  mine.addWorkdays = function (iso, n) {
    var d = iso;
    for (var i = 0; i < n; ) { d = addDays(d, 1); if (mine.isWorkday(d)) i++; }
    return d;
  };
  /* The n-th working day before iso (n = 0: iso itself). */
  mine.workdaysBack = function (iso, n) {
    var d = iso;
    for (var i = 0; i < n; ) { d = addDays(d, -1); if (mine.isWorkday(d)) i++; }
    return d;
  };
  mine.addDays = function (iso, n) { return addDays(iso, n); };
  mine.dayOf = function (t) { var d = new Date(t); return isNaN(d) ? "" : fDate.format(d); };

  var DAYS = [["sunday", "zondag", "sun", "zo"], ["monday", "maandag", "mon", "ma"], ["tuesday", "dinsdag", "tue", "di"],
    ["wednesday", "woensdag", "wed", "wo"], ["thursday", "donderdag", "thu", "do"], ["friday", "vrijdag", "fri", "vr"], ["saturday", "zaterdag", "sat", "za"]];
  var MONTHS = [["january", "januari", "jan"], ["february", "februari", "feb"], ["march", "maart", "mar", "mrt"], ["april", "apr"],
    ["may", "mei"], ["june", "juni", "jun"], ["july", "juli", "jul"], ["august", "augustus", "aug"], ["september", "sept", "sep"],
    ["october", "oktober", "oct", "okt"], ["november", "nov"], ["december", "dec"]];
  function monthOf(w) {
    for (var i = 0; i < MONTHS.length; i++) if (MONTHS[i].indexOf(w) >= 0) return i;
    return -1;
  }
  var B = "(?:^|[^\\p{L}\\p{N}])", E = "(?![\\p{L}\\p{N}])";
  function word(w) { return new RegExp(B + w + E, "u"); }

  /* A small parser for the common Dutch and English day words. A weekday
     means its next occurrence (today when it is today); "next <day>" /
     "volgende <dag>" is a week after that. Resolves YYYY-MM-DD or null. */
  mine.parseDue = function (text, now) {
    var t = String(text || "").toLowerCase(), today = mine.today(now), m;
    if ((m = /(?:^|[^\d])(\d{4})-(\d\d)-(\d\d)(?!\d)/.exec(t)) && mine.validDate(m[1] + "-" + m[2] + "-" + m[3])) return m[1] + "-" + m[2] + "-" + m[3];
    if (word("overmorgen").test(t) || word("day after tomorrow").test(t)) return addDays(today, 2);
    if (word("(?:tomorrow|morgen|tmrw)").test(t)) return addDays(today, 1);
    if (word("(?:today|vandaag|tonight|vanavond|eod|end of day)").test(t)) return today;
    if (word("(?:end of (?:the )?week|eind van de week|einde van de week|eow)").test(t)) return nextDow(today, 5, false);
    for (var d = 0; d < 7; d++) {
      var names = DAYS[d].slice(0, 2).join("|");
      var re = new RegExp(B + "(?:(next|volgende(?: week)?|komende)\\s+)?(?:on\\s+|op\\s+)?(" + names + ")" + E, "u");
      if ((m = re.exec(t))) return nextDow(today, d, !!m[1] && m[1] !== "komende");
    }
    /* "9 oct", "9 oktober", "oct 9", "9/10" (day first). */
    var y = parts(today)[0];
    if ((m = new RegExp(B + "(\\d{1,2})\\s+(\\p{L}{3,9})\\.?" + E, "u").exec(t)) && monthOf(m[2]) >= 0) return dated(y, monthOf(m[2]), +m[1], today);
    if ((m = new RegExp(B + "(\\p{L}{3,9})\\.?\\s+(\\d{1,2})(?!\\d)", "u").exec(t)) && monthOf(m[1]) >= 0) return dated(y, monthOf(m[1]), +m[2], today);
    if ((m = /(?:^|[^\d/])(\d{1,2})[/-](\d{1,2})(?![\d/])/.exec(t)) && +m[2] >= 1 && +m[2] <= 12) return dated(y, +m[2] - 1, +m[1], today);
    if (word("(?:next week|volgende week)").test(t)) return nextDow(addDays(today, 1), 1, false);
    return null;
  };
  function nextDow(today, d, skipWeek) {
    var n = (d - dow(today) + 7) % 7;
    return addDays(today, n + (skipWeek ? 7 : 0));
  }
  /* A date without a year: this year, or next year when it is long past. */
  function dated(y, mo, day, today) {
    var s = y + "-" + U.pad(mo + 1) + "-" + U.pad(day);
    if (!mine.validDate(s)) return null;
    if (mine.diffDays(today, s) < -60) s = (y + 1) + s.slice(4);
    return mine.validDate(s) ? s : null;
  }

  /* "Next step" when the text clearly implies one (no action yet). */
  var NAMES = "(\\p{Lu}[\\p{L}'-]*(?:\\s*(?:,|&|and|en)\\s*\\p{Lu}[\\p{L}'-]*)*)";
  mine.nextStep = function (text) {
    var t = String(text || ""), low = t.toLowerCase(), m;
    if (/\b(?:plan|schedule|set up|organi[sz]e|book|arrange|inplannen|plannen|regel|regelen)\b/.test(low) &&
        /\b(?:meeting|call|follow-?up|sync|catch-?up|overleg|vervolg|afspraak|1:1)\b/.test(low) &&
        (m = new RegExp("(?:\\b[Ww]ith|\\b[Mm]et)\\s+" + NAMES, "u").exec(t))) return "Plan a meeting with " + m[1];
    if ((m = new RegExp("(?:^|\\s)(?:[Mm]ail(?:en)?|[Ee]-?mail)\\s+(?:to\\s+|naar\\s+)?" + NAMES, "u").exec(t))) return "Draft a mail to " + m[1];
    return null;
  };

  mine.clean = function (s) { return U.clip(String(s || "").replace(/\s+/g, " ").trim(), mine.MAX_TEXT); };
  mine.newId = function () { return "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); };

  /* One stored action → a list item. */
  mine.toItem = function (docId, a) {
    return {
      src: "mine", id: "mine:" + docId, key: "mine-" + docId, docId: docId,
      subject: a.text, senderName: "You", sender: "", received: a.created, internal: true, summary: a.notes || "",
      recipients: 0, importance: "normal"
    };
  };

  var fDue = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "short" });
  mine.dueLabel = function (due, now) {
    if (!due || !mine.validDate(due)) return "";
    var n = mine.diffDays(mine.today(now), due);
    if (n === 0) return "Due today";
    if (n === 1) return "Due tomorrow";
    if (n < 0) return "Overdue · " + fDue.format(new Date(due + "T12:00:00Z")).replace(/,/g, "");
    return "Due " + fDue.format(new Date(due + "T12:00:00Z")).replace(/,/g, "");
  };
})(window.Droplet = window.Droplet || {});
