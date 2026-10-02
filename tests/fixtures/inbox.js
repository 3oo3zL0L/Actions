// Fixtures voor B2 (Inbox) en B3 (Teams-kanalen), bovenop buildMock uit ./index.js. Alles is verzonnen.
// Referentie-nu = vandaag 10:15 (Europe/Amsterdam), zoals in ./index.js.
//
// Mensen en hun rol in de tests:
// - Sanne Dekker: vergadert vandaag met Thomas (kleine sessie) -> automatisch bovenaan.
// - Joost Kramer: zit alleen in een grote sessie (> 15 deelnemers) -> niet bovenaan.
// - Femke Bos: niet in een vergadering; wordt in tests met "Zet ... bovenaan" (of prefs vip) bovenaan gezet.
// - Pieter Jansen: mail met bijlagen en HTML-inhoud; staat in het adresboek voor Doorsturen.
// - Lotte Visser: 1-op-1 Teams-chat (deeplink met e-mail). Mark Bakker: groepschat. Daan de Vries: kanaalbericht.
const { buildMock, referenceNow } = require("./index");

const M365 = "Microsoft 365";
const TEAM = "mock-team-platform-0001";
const CH_REL = "19:mock-releases-0001@thread.tacv2";
const CH_ARCH = "19:mock-architectuur-0002@thread.tacv2";
const LOTTE_CHAT = "19:mock-lotte_thomas@unq.gbl.spaces";
const GROUP_CHAT = "19:mock-object-store-kern@thread.v2";
const chUri = (team, ch, id) => `teams:///teams/${team}/channels/${encodeURIComponent(ch)}/messages/${id}`;

const MAILS = [
  { id: "ib-m1", subject: "Offerte licenties buildserver", sender: "joost.kramer@example.com", minutesAgo: 10, isRead: false,
    summary: "Hierbij de offerte voor de licenties." },
  { id: "ib-m2", subject: "Architectuurschets OIDC-koppeling", sender: "pieter.jansen@example.com", minutesAgo: 60, isRead: false, hasAttachments: true,
    summary: "Zie de schets in de bijlage.", cc: ["noor.mulder@example.com"] },
  { id: "ib-m3", subject: "Voorstel roadmap Q1", sender: "sanne.dekker@example.com", minutesAgo: 200, isRead: false,
    summary: "Kun je voor morgen reageren op het roadmapvoorstel?" },
  { id: "ib-m4", subject: "Contractverlenging Object Store", sender: "femke.bos@example.com", minutesAgo: 300, isRead: true,
    summary: "De verlenging loopt eind van de maand af." },
  { id: "ib-m5", subject: "Je wekelijkse samenvatting", sender: "noreply@notifications.example.com", minutesAgo: 400, isRead: false,
    summary: "Dit gebeurde er deze week." },
];

function mailItems(ref) {
  return MAILS.map((m) => ({
    uri: `mail:///messages/${m.id}`, id: m.id, subject: m.subject, sender: m.sender, recipients: ["thomas@example.com"],
    receivedDateTime: new Date(ref - m.minutesAgo * 60000).toISOString().replace(/\.\d{3}Z$/, ".000Z"),
    summary: m.summary, hasAttachments: !!m.hasAttachments, importance: "normal", isRead: !!m.isRead,
    webLink: `https://outlook.example.com/owa/?ItemID=${m.id}`,
  }));
}
// read_resource per mail: één JSON-blok met HTML-body, ontvangers en (bij ib-m2) bijlagen.
function mailResources() {
  return MAILS.map((m) => ({
    when: { uri: `mail:///messages/${m.id}` },
    payload: {
      subject: m.subject,
      from: { emailAddress: { name: nameOf(m.sender), address: m.sender } },
      toRecipients: [{ emailAddress: { name: "Thomas Testpersoon", address: "thomas@example.com" } }],
      ccRecipients: (m.cc || []).map((a) => ({ emailAddress: { name: nameOf(a), address: a } })),
      hasAttachments: !!m.hasAttachments,
      attachments: m.hasAttachments ? [{ name: "schets-oidc.pdf" }, { name: "sequentie.png" }] : [],
      body: { contentType: "html", content: `<html><head><style>p{color:red}</style></head><body><p>Hoi Thomas,</p><p>${m.summary}</p>` +
        `<p>Volledige tekst van ${m.id}: tweede alinea met <b>details</b> &amp; meer.</p><div>Groet,<br>${nameOf(m.sender)}</div></body></html>` },
    },
  }));
}
function nameOf(addr) { return addr.split("@")[0].split(/[._-]+/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" "); }

function teamsItems(ref) {
  const at = (min) => new Date(ref - min * 60000).toISOString();
  return [
    { uri: `teams:///chats/${LOTTE_CHAT}/messages/ib-t1`, id: "ib-t1", chatId: LOTTE_CHAT, subject: "", createdDateTime: at(5),
      summary: "Kun je de demo om 14:00 openen?", from: { displayName: "Lotte Visser", email: "lotte.visser@example.com" },
      webUrl: `https://teams.example.com/l/message/${encodeURIComponent(LOTTE_CHAT)}/ib-t1` },
    { uri: `teams:///chats/${GROUP_CHAT}/messages/ib-t2`, id: "ib-t2", chatId: GROUP_CHAT, subject: "", createdDateTime: at(25),
      summary: "Heeft iemand de benchmarkcijfers van gisteren?", from: { displayName: "Mark Bakker", email: "mark.bakker@example.com" },
      webUrl: `https://teams.example.com/l/message/${encodeURIComponent(GROUP_CHAT)}/ib-t2` },
    { uri: chUri(TEAM, CH_REL, "ib-c1"), id: "ib-c1", subject: "Release 26.4", createdDateTime: at(40),
      summary: "Release 26.4 staat klaar voor de acceptatietest.", from: { displayName: "Daan de Vries", email: "daan.devries@example.com" },
      webUrl: "https://teams.example.com/l/message/releases/ib-c1" },
    { uri: chUri(TEAM, CH_ARCH, "ib-c2"), id: "ib-c2", subject: "", createdDateTime: at(600),
      summary: "Wie neemt de review van de storage-ADR?", from: { displayName: "Noor Mulder", email: "noor.mulder@example.com" },
      webUrl: "https://teams.example.com/l/message/architectuur/ib-c2" },
    // Eigen bericht van Thomas: hoort niet in zijn Inbox.
    { uri: `teams:///chats/${GROUP_CHAT}/messages/ib-t9`, id: "ib-t9", chatId: GROUP_CHAT, subject: "", createdDateTime: at(3),
      summary: "Ik kijk er vanmiddag naar.", from: { displayName: "Thomas Testpersoon", email: "thomas@example.com" },
      webUrl: `https://teams.example.com/l/message/${encodeURIComponent(GROUP_CHAT)}/ib-t9` },
  ];
}
function chats(ref) {
  return [
    { id: LOTTE_CHAT, chatType: "oneOnOne", topic: null, lastUpdatedDateTime: new Date(ref - 5 * 60000).toISOString(), memberCount: 2,
      members: [{ displayName: "Lotte Visser", email: "lotte.visser@example.com" }, { displayName: "Thomas Testpersoon", email: "thomas@example.com" }] },
    { id: GROUP_CHAT, chatType: "group", topic: "Object Store kernteam", lastUpdatedDateTime: new Date(ref - 3 * 60000).toISOString(), memberCount: 5,
      members: [{ displayName: "Mark Bakker", email: "mark.bakker@example.com" }, { displayName: "Thomas Testpersoon", email: "thomas@example.com" }] },
  ];
}
// Agenda vandaag: kleine sessie met Sanne (VIP), grote sessie met Joost + 19 anderen (telt niet).
function calendar(ref) {
  const big = Array.from({ length: 19 }, (_, i) => `collega${i + 1}@example.com`);
  const ev = (id, subject, startMin, endMin, attendees) => ({
    uri: `calendar:///events/${id}`, id, subject, organizer: attendees[0], attendees,
    start: { dateTime: new Date(ref + startMin * 60000).toISOString(), timeZone: "UTC" },
    end: { dateTime: new Date(ref + endMin * 60000).toISOString(), timeZone: "UTC" },
    location: "Microsoft Teams Meeting", summary: "", importance: "normal", showAs: "busy", isAllDay: false, isCancelled: false,
    isOrganizer: false, webLink: `https://outlook.example.com/owa/?itemid=${id}`,
  });
  return [
    ev("ib-e1", "Roadmap-afstemming", 60, 90, ["sanne.dekker@example.com", "thomas@example.com"]),
    ev("ib-e2", "Kwartaalpresentatie", 180, 240, ["joost.kramer@example.com", "thomas@example.com", ...big]),
  ];
}
// Kanaalberichten die teams_list_channel_messages voor een gevolgd kanaal teruggeeft (Graph-vorm met HTML-body).
function channelMessages(ref) {
  const at = (min) => new Date(ref - min * 60000).toISOString();
  return [
    { id: "ib-k1", messageType: "message", createdDateTime: at(2), replyToId: null, subject: "Nieuwe ADR",
      from: { user: { displayName: "Noor Mulder", id: "mock-user-noor" } },
      body: { contentType: "html", content: "<p>Nieuwe ADR voor de <b>Object Store</b> staat klaar.</p>" },
      webUrl: "https://teams.example.com/l/message/architectuur/ib-k1" },
    { id: "ib-k0", messageType: "systemEventMessage", createdDateTime: at(20), from: null, body: { contentType: "html", content: "" } },
    { id: "ib-k-oud", messageType: "message", createdDateTime: at(60 * 24 * 5), subject: "",
      from: { user: { displayName: "Noor Mulder" } }, body: { contentType: "text", content: "Heel oud bericht." }, webUrl: "https://teams.example.com/l/message/architectuur/oud" },
  ];
}

/**
 * Mock-config voor de Inbox-tests. `overrides` zoals bij buildMock; `overrides.tools["Microsoft 365"]` wint per tool.
 * Standaard (zoals bij Thomas) falen Teams-schrijftools met "Missing scope"; zet teamsSendBlocked: false om ze toe te staan.
 */
function inboxMock(overrides = {}) {
  const ref = referenceNow();
  const own = {
    outlook_email_search: { items: mailItems(ref), pagination: { moreResults: false } },
    outlook_calendar_search: { items: calendar(ref), pagination: { moreResults: false } },
    chat_message_search: { items: teamsItems(ref), pagination: { moreResults: false } },
    teams_list_chats: { items: chats(ref), pagination: { moreResults: false } },
    read_resource: { byInput: mailResources(), otherwise: { error: { code: "tool_error", message: "Resource not found" } } },
    teams_list_channels: { byInput: [{ when: { teamId: TEAM }, items: [{ id: CH_REL, displayName: "Releases" }, { id: CH_ARCH, displayName: "Architectuur" }], pagination: null }] },
    teams_list_channel_messages: { byInput: [{ when: { teamId: TEAM, channelId: CH_ARCH }, items: channelMessages(ref), pagination: null }], otherwise: { items: [], pagination: null } },
  };
  const tools = { [M365]: { ...own, ...((overrides.tools || {})[M365] || {}) } };
  for (const [srv, t] of Object.entries(overrides.tools || {})) if (srv !== M365) tools[srv] = t;
  return buildMock({ ...overrides, tools });
}

module.exports = { inboxMock, TEAM, CH_REL, CH_ARCH, LOTTE_CHAT, GROUP_CHAT, chUri, MAILS };
