// Bouwt de mock-configuratie (window.__MOCK__) uit de JSON-fixtures, rond een
// referentie-"nu" van vandaag 10:15 in Europe/Amsterdam. De test zet de
// browserklok (page.clock.install) op hetzelfde moment, zodat "nu" en
// "volgende" in de agenda deterministisch zijn.
const agenda = require("./agenda.json");
const mail = require("./mail.json");
const teams = require("./teams.json");
const jira = require("./jira.json");
const confluence = require("./confluence.json");
const me = require("./me.json");
const acties = require("./acties.json");

const TZ = "Europe/Amsterdam";
const REF_HOUR = 10;
const REF_MINUTE = 15;

const pad = (n, w = 2) => String(n).padStart(w, "0");

function amsParts(epoch) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  const o = Object.fromEntries(f.formatToParts(new Date(epoch)).map((p) => [p.type, p.value]));
  return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour, mi: +o.minute };
}

/** Epoch-ms van een Amsterdamse wandkloktijd. */
function amsToEpoch(y, mo, d, h, mi) {
  const want = Date.UTC(y, mo - 1, d, h, mi);
  let t = want;
  for (let i = 0; i < 3; i++) {
    const p = amsParts(t);
    t -= Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - want;
  }
  return t;
}

/** Referentie-nu: vandaag (Amsterdamse datum) 10:15. */
function referenceNow(realNow = Date.now()) {
  const p = amsParts(realNow);
  return amsToEpoch(p.y, p.mo, p.d, REF_HOUR, REF_MINUTE);
}

function wallClock(refEpoch, hhmm, dayOffset = 0) {
  const p = amsParts(refEpoch + dayOffset * 86400000);
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${hhmm}:00.0000000`;
}

function buildCalendarItems(ref) {
  return agenda.events.map((e) => ({
    uri: `calendar:///events/${e.id}`,
    id: e.id,
    subject: e.subject,
    organizer: e.organizer,
    attendees: e.attendees,
    start: { dateTime: wallClock(ref, e.start), timeZone: agenda.timeZone },
    end: { dateTime: wallClock(ref, e.end), timeZone: agenda.timeZone },
    location: e.location,
    summary: e.summary,
    importance: "normal",
    showAs: e.isCancelled ? "free" : "busy",
    isAllDay: false,
    isCancelled: !!e.isCancelled,
    isOrganizer: !!e.isOrganizer,
    recurrence: null,
    webLink: `https://outlook.example.com/owa/?itemid=${e.id}`,
    categories: null,
  }));
}

function buildMailItems(ref) {
  return mail.messages.map((m) => ({
    uri: `mail:///messages/${m.id}`,
    id: m.id,
    subject: m.subject,
    sender: m.sender,
    recipients: ["thomas@example.com"],
    receivedDateTime: new Date(ref - m.minutesAgo * 60000).toISOString().replace(/\.\d{3}Z$/, ".000Z"),
    summary: m.summary,
    hasAttachments: !!m.hasAttachments,
    importance: m.importance || "normal",
    isRead: !!m.isRead,
    webLink: `https://outlook.example.com/owa/?ItemID=${m.id}`,
  }));
}

function buildTeamsItems(ref) {
  return teams.messages.map((m) => ({
    uri: `teams:///chats/${m.chatId}/messages/${m.id}`,
    id: m.id,
    chatId: m.chatId,
    subject: "",
    summary: m.summary,
    createdDateTime: new Date(ref - m.minutesAgo * 60000).toISOString(),
    from: m.from,
    importance: "normal",
    webUrl: `https://teams.example.com/l/message/${encodeURIComponent(m.chatId)}/${m.id}`,
  }));
}

function buildChats(ref) {
  return teams.chats.map((c) => ({
    id: c.id, chatType: c.chatType, topic: c.topic,
    lastUpdatedDateTime: new Date(ref - c.minutesAgo * 60000).toISOString(),
    memberCount: c.memberCount, members: c.members,
  }));
}

/**
 * Volledige mock-config met realistische data. `overrides` wordt ondiep
 * samengevoegd; `overrides.tools` per server/tool.
 */
function buildMock(overrides = {}) {
  const ref = referenceNow();
  const base = {
    refNow: ref,
    capabilities: { mcp: true, sample: true, db: true, permissions: true },
    connected: ["Microsoft 365", "Atlassian Rovo"],
    tools: {
      "Microsoft 365": {
        // M365: één text-blok per item + paginatieblok; payload = alleen eerste item.
        outlook_calendar_search: { items: buildCalendarItems(ref), pagination: { moreResults: false } },
        outlook_email_search: { items: buildMailItems(ref), pagination: { moreResults: true, nextOffset: mail.messages.length } },
        chat_message_search: { items: buildTeamsItems(ref), pagination: { moreResults: true, nextCursor: "mock-cursor-2" } },
        teams_list_chats: { items: buildChats(ref), pagination: { moreResults: false } },
        get_me: { payload: me },
      },
      "Atlassian Rovo": {
        // Atlassian: één blok.
        searchJiraIssuesUsingJql: { payload: jira },
        searchConfluenceUsingCql: { payload: confluence },
      },
    },
    sample: {
      context: { messageId: "mail-003", chatId: teams.messages[0].chatId, issueKey: "PCORE-101" },
      rules: [],
      default: { text: "Mock-antwoord van Claude: je hebt vandaag vijf afspraken." },
    },
    db: { docs: JSON.parse(JSON.stringify(acties)) },
  };
  const out = { ...base, ...overrides };
  if (overrides.tools) {
    out.tools = JSON.parse(JSON.stringify(base.tools));
    for (const [srv, t] of Object.entries(overrides.tools)) out.tools[srv] = { ...(out.tools[srv] || {}), ...t };
  }
  if (overrides.sample) out.sample = { ...base.sample, ...overrides.sample };
  return out;
}

/** Mock-config zonder enige capability: elke use() -> null. */
function emptyMock(extra = {}) {
  return { refNow: referenceNow(), capabilities: {}, ...extra };
}

module.exports = {
  buildMock, emptyMock, referenceNow,
  data: { agenda, mail, teams, jira, confluence, me, acties },
};
