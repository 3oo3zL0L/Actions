// B4 Agenda: mock-configuratie met morgen, uitnodigingen en volledige afspraken (read_resource), bovenop buildMock.
// Alle namen, adressen en ids zijn verzonnen. Tijden zijn wandkloktijd "W. Europe Standard Time"; referentie-nu = vandaag 10:15.
const { buildMock, referenceNow } = require("./index");

const TZ = "Europe/Amsterdam";
const WIN_TZ = "W. Europe Standard Time";
const pad = (n) => String(n).padStart(2, "0");

function amsParts(epoch) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" });
  const o = Object.fromEntries(f.formatToParts(new Date(epoch)).map((p) => [p.type, p.value]));
  return { y: +o.year, mo: +o.month, d: +o.day, wd: o.weekday };
}
/** Wandklok "YYYY-MM-DDTHH:MM:00.0000000" op dag `offset` (0 = vandaag) na ref. */
function wall(ref, hhmm, offset = 0) {
  const p = amsParts(ref + offset * 86400000);
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${hhmm}:00.0000000`;
}
/** Dag-offsets (vanaf morgen) van de eerstvolgende n werkdagen. */
function nextWorkdays(ref, n) {
  const out = [];
  for (let k = 1; out.length < n && k < 20; k++) if (!["Sat", "Sun"].includes(amsParts(ref + k * 86400000).wd)) out.push(k);
  return out;
}

// Extra afspraken: een uitnodiging vandaag, en twee afspraken morgen (waarvan één uitnodiging).
const EXTRA = [
  { id: "evt-101", day: 0, subject: "Kwartaalplanning Platform Stability", start: "14:30", end: "15:00", organizer: "eva.jansen@example.com",
    attendees: ["eva.jansen@example.com", "thomas@example.com", "ruben.smit@example.com"], location: "Microsoft Teams Meeting",
    summary: "Voorstel voor de planning van Q4.", invite: true },
  { id: "evt-201", day: 1, subject: "Roadmapsessie Jakarta migratie", start: "09:30", end: "10:30", organizer: "daan.devries@example.com",
    attendees: ["daan.devries@example.com", "thomas@example.com"], location: "Microsoft Teams Meeting", summary: "Volgorde van de modules." },
  { id: "evt-202", day: 1, subject: "Demo CI Acceleration", start: "13:00", end: "13:45", organizer: "ruben.smit@example.com",
    attendees: ["ruben.smit@example.com", "thomas@example.com", "lotte.visser@example.com"], location: "Kamer 3.02", summary: "Demo van de gedeelde build-cache.", invite: true },
];

function calItem(ref, e) {
  return {
    uri: `calendar:///events/${e.id}`, id: e.id, subject: e.subject, organizer: e.organizer, attendees: e.attendees,
    start: { dateTime: wall(ref, e.start, e.day), timeZone: WIN_TZ }, end: { dateTime: wall(ref, e.end, e.day), timeZone: WIN_TZ },
    location: e.location, summary: e.summary, importance: "normal", showAs: e.invite ? "tentative" : "busy", isAllDay: false, isCancelled: false,
    isOrganizer: false, recurrence: null, webLink: `https://outlook.example.com/owa/?itemid=${e.id}`, categories: null,
    ...(e.invite ? { responseStatus: { response: "notResponded", time: "0001-01-01T00:00:00Z" } } : {}),
  };
}
/** Volledige afspraak zoals read_resource hem geeft: één JSON-blok met body (HTML), deelnemers en Teams-link. */
function fullEvent(ref, e, { invite = false } = {}) {
  const who = (a) => ({ emailAddress: { name: a.split("@")[0].split(".").map((x) => x[0].toUpperCase() + x.slice(1)).join(" "), address: a } });
  return { payload: {
    id: e.id, subject: e.subject, bodyPreview: e.summary,
    body: { contentType: "html", content: `<html><body><p>${e.summary}</p><p>Agenda:<br>1. Stand van zaken<br>2. Besluit</p>` +
      `<p><a href="https://teams.microsoft.com/l/meetup-join/19%3ameeting_${e.id}%40thread.v2/0?context=x">Deelnemen aan de vergadering</a></p></body></html>` },
    organizer: who(e.organizer), attendees: e.attendees.map((a) => ({ ...who(a), type: "required", status: { response: "none", time: "0001-01-01T00:00:00Z" } })),
    start: { dateTime: wall(ref, e.start, e.day || 0), timeZone: WIN_TZ }, end: { dateTime: wall(ref, e.end, e.day || 0), timeZone: WIN_TZ },
    location: { displayName: e.location }, isOnlineMeeting: /teams/i.test(e.location),
    onlineMeeting: /teams/i.test(e.location) ? { joinUrl: `https://teams.example.com/l/meetup-join/${e.id}` } : null,
    responseStatus: { response: invite ? "notResponded" : "accepted", time: "2026-09-20T08:00:00Z" },
    webLink: `https://outlook.example.com/owa/?itemid=${e.id}`,
  } };
}

/** find_available_time-resultaat met sloten op (werkdag-index, tijd, zekerheid, iedereen vrij). */
function freeSlots(ref, specs, dur = 30) {
  const days = nextWorkdays(ref, 5);
  return { payload: { nowDateTime: new Date(ref).toISOString(), unavailableParticipants: [], availableTimes: specs.map(([wd, hhmm, confidence, allFree = true]) => {
    const [h, m] = hhmm.split(":").map(Number);
    const endMin = h * 60 + m + dur;
    return { start: { dateTime: wall(ref, hhmm, days[wd]), timeZone: WIN_TZ }, end: { dateTime: wall(ref, `${pad(Math.floor(endMin / 60))}:${pad(endMin % 60)}`, days[wd]), timeZone: WIN_TZ },
      confidence, organizerAvailability: "free", attendeeAvailability: [{ email: "lotte.visser@example.com", availability: allFree ? "free" : "tentative" }] };
  }) } };
}

/**
 * Mock met vandaag + morgen + uitnodigingen + volledige afspraken. `overrides` zoals buildMock; tools per server
 * worden samengevoegd (eigen fixtures van de test winnen).
 */
function buildAgendaMock(overrides = {}) {
  const ref = referenceNow();
  const base = buildMock();
  const cal = base.tools["Microsoft 365"].outlook_calendar_search.items.concat(EXTRA.map((e) => calItem(ref, e)));
  const evt003 = { id: "evt-003", subject: "Architectuuroverleg Object Store", start: "10:00", end: "11:00", organizer: "mark.bakker@example.com",
    attendees: ["mark.bakker@example.com", "thomas@example.com", "noor.mulder@example.com"], location: "Microsoft Teams Meeting", summary: "Keuze storage-backend en migratiepad." };
  const tools = {
    "Microsoft 365": {
      outlook_calendar_search: { items: cal, pagination: { moreResults: false } },
      read_resource: { byInput: [
        { when: { uri: "calendar:///events/evt-003" }, ...fullEvent(ref, evt003) },
        { when: { uri: "calendar:///events/evt-101" }, ...fullEvent(ref, EXTRA[0], { invite: true }) },
        { when: { uri: "calendar:///events/evt-201" }, ...fullEvent(ref, EXTRA[1]) },
        { when: { uri: "calendar:///events/evt-202" }, ...fullEvent(ref, EXTRA[2], { invite: true }) },
      ] },
    },
  };
  const merged = { ...tools["Microsoft 365"], ...((overrides.tools || {})["Microsoft 365"] || {}) };
  return buildMock({ ...overrides, tools: { ...(overrides.tools || {}), "Microsoft 365": merged } });
}

module.exports = { buildAgendaMock, freeSlots, nextWorkdays, wall, EXTRA };
