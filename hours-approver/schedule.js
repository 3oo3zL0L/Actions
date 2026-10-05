// When the weekly run is due. Pure functions, no Chrome APIs: background.js loads this
// with importScripts(), and test/schedule.test.js runs it in plain Node.
//
// The run is every Monday at 13:00 Europe/Amsterdam (CET in winter, CEST in summer).
// It checks the hours of the PREVIOUS ISO week. A week runs at most once: lastRunWeek
// holds the ISO week (e.g. "2026-W41") of the last run that started.

(function (root) {
  const TZ = 'Europe/Amsterdam';
  const RUN_DAY = 1;   // Monday (ISO)
  const RUN_HOUR = 13;
  const RUN_MINUTE = 0;

  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  // The wall-clock date and time in Amsterdam for an instant (ms).
  function parts(ms) {
    const p = {};
    for (const { type, value } of fmt.formatToParts(new Date(ms))) p[type] = value;
    return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
  }

  // Amsterdam's offset from UTC (ms) at an instant.
  function offsetAt(ms) {
    const p = parts(ms);
    return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
  }

  // The instant of an Amsterdam wall-clock time (13:00 always exists: DST switches at 02:00/03:00).
  function zoned(y, m, d, h, mi) {
    const guess = Date.UTC(y, m - 1, d, h, mi);
    let t = guess - offsetAt(guess);
    t = guess - offsetAt(t);
    return t;
  }

  const pad = n => String(n).padStart(2, '0');
  const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

  // ISO week of a calendar date ("2026-W41").
  function isoWeekOfDate(y, m, d) {
    const t = new Date(Date.UTC(y, m - 1, d));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const wy = t.getUTCFullYear();
    const w = Math.ceil(((t - Date.UTC(wy, 0, 1)) / 864e5 + 1) / 7);
    return `${wy}-W${pad(w)}`;
  }

  // ISO week of an instant, by its Amsterdam date.
  function weekKey(ms) {
    const p = parts(ms);
    return isoWeekOfDate(p.y, p.m, p.d);
  }

  // The Monday (Amsterdam calendar date) of the ISO week containing the instant.
  function mondayOf(ms) {
    const p = parts(ms);
    const t = new Date(Date.UTC(p.y, p.m - 1, p.d));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() - (day - RUN_DAY));
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }

  // Monday 13:00 Amsterdam of the ISO week containing the instant.
  function runTimeOfWeek(ms) {
    const mo = mondayOf(ms);
    return zoned(mo.y, mo.m, mo.d, RUN_HOUR, RUN_MINUTE);
  }

  // The next Monday 13:00 strictly after the instant.
  function nextRun(ms) {
    const thisWeek = runTimeOfWeek(ms);
    if (thisWeek > ms) return thisWeek;
    const mo = mondayOf(ms);
    const next = new Date(Date.UTC(mo.y, mo.m - 1, mo.d + 7));
    return zoned(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), RUN_HOUR, RUN_MINUTE);
  }

  // Due when it is past Monday 13:00 of this week and this week hasn't run yet.
  // This is also the catch-up: a laptop that was off on Monday runs as soon as Chrome is back.
  function isDue(ms, lastRunWeek) {
    return ms >= runTimeOfWeek(ms) && weekKey(ms) !== lastRunWeek;
  }

  // The previous ISO week of the instant: {week, start, end} with Monday and Sunday dates.
  function previousWeek(ms) {
    const mo = mondayOf(ms);
    const a = new Date(Date.UTC(mo.y, mo.m - 1, mo.d - 7));
    const b = new Date(Date.UTC(mo.y, mo.m - 1, mo.d - 1));
    const A = [a.getUTCFullYear(), a.getUTCMonth() + 1, a.getUTCDate()];
    const B = [b.getUTCFullYear(), b.getUTCMonth() + 1, b.getUTCDate()];
    return { week: isoWeekOfDate(...A), start: ymd(...A), end: ymd(...B) };
  }

  // The ISO week of a "YYYY-MM-DD" date.
  function weekOfDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    return m ? isoWeekOfDate(+m[1], +m[2], +m[3]) : '';
  }

  const api = { TZ, parts, zoned, weekKey, runTimeOfWeek, nextRun, isDue, previousWeek, weekOfDate };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HoursSchedule = api;
})(typeof self !== 'undefined' ? self : this);
