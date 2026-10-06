// Plain Node, no Chrome: node test/schedule.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../schedule.js');

const iso = ms => new Date(ms).toISOString();
const at = s => Date.parse(s);

test('next run is the coming Monday 13:00 Amsterdam (CEST = UTC+2)', () => {
  // Fri 2 Oct 2026 10:00 Amsterdam
  assert.equal(iso(S.nextRun(at('2026-10-02T10:00:00+02:00'))), '2026-10-05T11:00:00.000Z');
  // Monday morning: today 13:00
  assert.equal(iso(S.nextRun(at('2026-10-05T09:00:00+02:00'))), '2026-10-05T11:00:00.000Z');
  // Monday 13:00 exactly or later: next week
  assert.equal(iso(S.nextRun(at('2026-10-05T13:00:00+02:00'))), '2026-10-12T11:00:00.000Z');
  assert.equal(iso(S.nextRun(at('2026-10-05T18:00:00+02:00'))), '2026-10-12T11:00:00.000Z');
  // Sunday 23:30 Amsterdam is still the old week (UTC says Sunday 21:30)
  assert.equal(iso(S.nextRun(at('2026-10-11T23:30:00+02:00'))), '2026-10-12T11:00:00.000Z');
});

test('DST: the last Monday of summer time and the first of winter time both run at 13:00 local', () => {
  // Summer time ends Sun 25 Oct 2026 03:00 → 02:00. Monday 19 Oct is CEST, Monday 26 Oct is CET.
  assert.equal(iso(S.nextRun(at('2026-10-19T08:00:00+02:00'))), '2026-10-19T11:00:00.000Z');
  assert.equal(iso(S.nextRun(at('2026-10-20T08:00:00+02:00'))), '2026-10-26T12:00:00.000Z');
  // Summer time starts Sun 28 Mar 2027 02:00 → 03:00. Monday 22 Mar CET, Monday 29 Mar CEST.
  assert.equal(iso(S.nextRun(at('2027-03-23T08:00:00+01:00'))), '2027-03-29T11:00:00.000Z');
  assert.equal(iso(S.runTimeOfWeek(at('2027-03-24T08:00:00+01:00'))), '2027-03-22T12:00:00.000Z');
  // A day of 23 or 25 hours doesn't shift the run
  for (const t of ['2026-10-25T01:30:00+02:00', '2026-10-25T02:30:00+01:00', '2027-03-28T04:00:00+02:00']) {
    const n = S.parts(S.nextRun(at(t)));
    assert.deepEqual([n.h, n.mi], [13, 0], t);
  }
});

test('catch-up: a laptop that was off on Monday runs as soon as Chrome is back, that same week', () => {
  const tue = at('2026-10-06T08:15:00+02:00');
  assert.equal(S.isDue(tue, '2026-W40'), true);   // last run was the week before
  assert.equal(S.isDue(tue, ''), true);           // never ran
  assert.equal(S.isDue(at('2026-10-11T22:00:00+02:00'), '2026-W40'), true); // Sunday evening still catches up
  // Not before Monday 13:00
  assert.equal(S.isDue(at('2026-10-05T12:59:00+02:00'), '2026-W40'), false);
  assert.equal(S.isDue(at('2026-10-05T13:00:00+02:00'), '2026-W40'), true);
});

test('once per ISO week', () => {
  const mon = at('2026-10-05T13:00:00+02:00');
  assert.equal(S.weekKey(mon), '2026-W41');
  assert.equal(S.isDue(mon, '2026-W41'), false);
  assert.equal(S.isDue(at('2026-10-07T09:00:00+02:00'), '2026-W41'), false);
  assert.equal(S.isDue(at('2026-10-12T13:01:00+02:00'), '2026-W41'), true); // next week again
  // The week turns on Amsterdam midnight, not UTC midnight
  assert.equal(S.weekKey(at('2026-10-12T00:30:00+02:00')), '2026-W42');
  assert.equal(S.weekKey(at('2026-10-11T23:30:00+02:00')), '2026-W41');
});

test('the previous ISO week (what the hours check covers)', () => {
  assert.deepEqual(S.previousWeek(at('2026-10-05T13:00:00+02:00')), { week: '2026-W40', start: '2026-09-28', end: '2026-10-04' });
  // Across a year end: Monday 4 Jan 2027 → week 53 of 2026
  assert.deepEqual(S.previousWeek(at('2027-01-04T13:00:00+01:00')), { week: '2026-W53', start: '2026-12-28', end: '2027-01-03' });
  assert.equal(S.weekOfDate('2026-09-21'), '2026-W39');
  assert.equal(S.weekOfDate('nonsense'), '');
});
