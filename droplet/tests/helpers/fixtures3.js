/* Invented data for increment 3 (R3 waits, R6 transcripts, next steps).
   No real people, subjects or addresses. */
const { m, T, tm, ME } = require('./fixtures');

const SAM = 'sam.devries@planonsoftware.com';
const ANNA = { name: 'Anna Jansen', address: 'anna.jansen@planonsoftware.com' };
const BAS = { name: 'Bas Visser', address: 'bas.visser@planonsoftware.com' };
const PETER = 'peter@monitorco.example';
const WE = 'W. Europe Standard Time';
const at = (day, hhmm) => ({ dateTime: `${day}T${hhmm}:00.0000000`, timeZone: WE });

/* Your sent mail: an ask to Anna on Tue 29 Sep (due Fri 2 Oct) and one to
   Bas on Wed 30 Sep (not due yet), and a thank-you that asks nothing. */
function sent(id, to, subject, summary, when) {
  return m(id, SAM, subject, summary, when, { recipients: [to], isRead: true });
}
const SENT = [
  sent('s1-ask', ANNA.address, 'SIEM test plan', 'Anna, can you send me the SIEM test plan before the pilot starts?', T('07:00', '2026-09-29')),
  sent('s2-ask', BAS.address, 'Release checklist', 'Bas, could you update the release checklist for 26.4?', T('07:00', '2026-09-30')),
  sent('s3-thanks', ANNA.address, 'Thanks', 'Thanks for the demo yesterday!', T('08:00', '2026-09-28'))
];
const ASKS = {
  's1-ask': [{ who: { name: 'Anna Jansen', email: ANNA.address }, what: 'Send the SIEM test plan', project: 'SIEM Integration' }],
  's2-ask': [{ who: { name: 'Bas Visser', email: BAS.address }, what: 'Update the release checklist for 26.4', project: 'Release management' }],
  's3-thanks': []
};
const WAIT1 = 'wait:s1-ask-0', WAIT2 = 'wait:s2-ask-0';
const WAIT_PLAN = {
  [WAIT1]: { group: 'now', rank: 1, project: 'SIEM Integration', why: 'ignored', action: 'reply', label: 'Chase Anna in Teams',
    draft: 'Hi Anna,\n\nAny news on the SIEM test plan? I need it before the pilot starts.\n\nKR\nSam' }
};
function waitsConfig(over = {}) {
  const { RANK_PLAN } = require('./fixtures');
  const plan = Object.assign(JSON.parse(JSON.stringify(RANK_PLAN)), JSON.parse(JSON.stringify(WAIT_PLAN)), over.planExtra || {});
  const o = Object.assign({ sent: JSON.parse(JSON.stringify(SENT)), asksPlan: JSON.parse(JSON.stringify(ASKS)), rankPlan: plan }, over);
  delete o.planExtra;
  return o;
}

/* Meetings: ended ones with and without a transcript, and busy time ahead. */
const VTT = [
  'WEBVTT', '',
  '00:10:01.000 --> 00:10:05.000', '<v Bas Visser>Who turns this into the final DoD?</v>', '',
  '00:10:06.000 --> 00:10:12.000', '<v Sam de Vries>Ik plan een vervolg met Anna en Bas om het af te tekenen.</v>', '',
  '00:10:13.000 --> 00:10:15.000', '<v Anna Jansen>Prima, ochtenden zijn het beste.</v>', ''
].join('\n');
function ev(id, subject, start, end, extra = {}) {
  return Object.assign({ id, subject, start, end, organizer: { name: 'Sam de Vries', address: SAM }, people: [ANNA, BAS], showAs: 'busy' }, extra);
}
const MEETINGS = [
  ev('ev-dod', 'DoD alignment', at('2026-10-01', '10:00'), at('2026-10-01', '10:45'), { transcript: VTT }),
  ev('ev-none', 'Coffee with Bas', at('2026-09-30', '15:00'), at('2026-09-30', '15:30'), { people: [BAS] }),
  ev('ev-fail', 'Vendor call', at('2026-10-02', '08:00'), at('2026-10-02', '08:30'), { transcript: 'FAIL' }),
  ev('ev-old', 'Old sync', at('2026-09-25', '10:00'), at('2026-09-25', '10:30'), { transcript: VTT }),          // outside the window
  ev('ev-cancel', 'Cancelled sync', at('2026-10-01', '13:00'), at('2026-10-01', '13:30'), { transcript: VTT, isCancelled: true })
];
const BUSY = [
  ev('b-today', 'Workshop', at('2026-10-02', '11:00'), at('2026-10-02', '17:00')),
  ev('b-mon', 'Planning', at('2026-10-05', '08:30'), at('2026-10-05', '10:00')),
  ev('b-tue', 'Offsite', at('2026-10-06', '08:00'), at('2026-10-06', '12:00')),
  ev('b-free', 'Focus time', at('2026-10-07', '08:30'), at('2026-10-07', '12:00'), { showAs: 'free' })
];
const ANNA_CAL = [ev('a-wed', 'Anna busy', at('2026-10-07', '08:00'), at('2026-10-07', '09:30'))];
const COMMIT = {
  'DoD alignment': [{ kind: 'meeting', what: 'Plan een vervolg met Anna en Bas over de DoD', who: ['Anna', 'Bas'], due: null, project: 'Release management',
    quote: 'Ik plan een vervolg met Anna en Bas om het af te tekenen.' }]
};
function meetingsConfig(over = {}) {
  return Object.assign({
    calendar: JSON.parse(JSON.stringify(MEETINGS.concat(BUSY))), othersCalendars: { [ANNA.address]: JSON.parse(JSON.stringify(ANNA_CAL)) },
    commitPlan: JSON.parse(JSON.stringify(COMMIT)),
    actionPlan: { 'vervolg': { group: 'now', rank: 1, project: 'Release management', why: 'Your promise in the DoD meeting.', next: 'Plan a meeting with Anna and Bas', nextKind: 'meeting', nextWho: ['Anna', 'Bas'] } }
  }, over);
}

module.exports = { SAM, ANNA, BAS, PETER, WE, at, sent, SENT, ASKS, WAIT1, WAIT2, WAIT_PLAN, waitsConfig, VTT, ev, MEETINGS, BUSY, ANNA_CAL, COMMIT, meetingsConfig, m, T, tm, ME };
