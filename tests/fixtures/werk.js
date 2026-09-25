// Fixtures voor B6 Werk: Jira-issuedetail, transities, personen, projecten, issuetypen en Confluence-pagina's.
// Verzonnen data. De vormen volgen de echte Atlassian Rovo-connector (25 sep 2026):
//   getJiraIssue                      {issues:{nodes:[{id,key,self,fields:{…, comment:{comments:[…]}}, webUrl}]}, context:{atlassianAccountId}}
//   getTransitionsForJiraIssue        {transitions:[{id, name, to:{name, statusCategory}}]}
//   lookupJiraAccountId               {data:{users:{users:[{accountId, accountType, html, displayName}], total, header}}, statusCode}
//   getVisibleJiraProjects            {values:[{id, key, name}], startAt, maxResults, total, isLast}
//   getJiraProjectIssueTypesMetadata  {issueTypes:[{id, name, subtask, hierarchyLevel}], total}
//   getConfluencePage (markdown)      {content:{totalCount, nodes:[{id, type, title, space, body, webUrl, …}]}}
// De mock (tests/mock-claude.js, blok "B6 Werk") houdt hiermee per test een kleine staat bij: transities
// zetten de status, commentaar en toewijzen komen terug in getJiraIssue, createJiraIssue maakt een nieuw issue.
// Zet `werk: null` in buildMock-overrides om de werk-mock uit te zetten.

const cat = {
  new: { key: "new", colorName: "blue-gray", name: "To Do" },
  indeterminate: { key: "indeterminate", colorName: "yellow", name: "In Progress" },
  done: { key: "done", colorName: "green", name: "Done" },
};
const status = (name, c) => ({ name, statusCategory: cat[c] });

const users = [
  { accountId: "acc-thomas", displayName: "Thomas Testpersoon", email: "thomas@example.com" },
  { accountId: "acc-ruben", displayName: "Ruben Smit", email: "ruben.smit@example.com" },
  { accountId: "acc-noor", displayName: "Noor Mulder", email: "noor.mulder@example.com" },
  { accountId: "acc-daan", displayName: "Daan de Vries", email: "daan.devries@example.com" },
];
const person = (id) => { const u = users.find((x) => x.accountId === id); return u ? { accountId: u.accountId, displayName: u.displayName, emailAddress: u.email, active: true, accountType: "atlassian" } : null; };

const issues = {
  "PCORE-101": {
    id: "10101", summary: "Pipeline faalt op integratietests na upgrade", status: status("Review", "indeterminate"),
    assignee: "acc-thomas", reporter: "acc-ruben", priority: "Major", issuetype: "Bug", project: ["PCORE", "Platform Core"],
    created: "2026-09-21T08:12:00.000+0200", updated: "2026-09-24T09:23:53.024+0200",
    description: "Sinds de upgrade van de testcontainers falen de integratietests op de **main**-pipeline.\n\n" +
      "* Treedt alleen op bij de runners met 4 cores  \n* Lokaal niet te reproduceren\n* Log: `ConnectionRefused` op poort 5432\n\n" +
      "Zie ook [de build-dashboard](https://ci.example.com/dashboard) voor de laatste runs.",
    comments: [
      { id: "c1", author: "acc-ruben", created: "2026-09-22T10:05:00.000+0200", body: "Ik heb de testcontainers teruggezet naar 1.19; daarmee is de pipeline weer groen. Wil je de fix reviewen?" },
      { id: "c2", author: "acc-noor", created: "2026-09-24T09:20:00.000+0200", body: "Review gestart. Eén vraag: moeten we de **pinning** ook in de release-branch doen?" },
    ],
  },
  "CIACC-42": {
    id: "10242", summary: "Build-cache delen tussen runners", status: status("In Progress", "indeterminate"),
    assignee: "acc-ruben", reporter: "acc-thomas", priority: "Minor", issuetype: "Story", project: ["CIACC", "CI Acceleration"],
    created: "2026-09-15T14:00:00.000+0200", updated: "2026-09-23T16:02:10.000+0200",
    description: "Als ontwikkelaar wil ik dat runners een gedeelde build-cache gebruiken, zodat een build geen 12 minuten meer duurt.",
    comments: [
      { id: "c3", author: "acc-daan", created: "2026-09-23T16:00:00.000+0200", body: "Eerste meting: 12 min naar 7 min met de gedeelde cache." },
    ],
  },
  "OBJS-7": {
    id: "10307", summary: "Retentiebeleid voor object versies", status: status("To Do", "new"),
    assignee: null, reporter: "acc-noor", priority: "Major", issuetype: "Task", project: ["OBJS", "Object Store"],
    created: "2026-09-20T09:00:00.000+0200", updated: "2026-09-22T11:45:00.000+0200",
    description: "", comments: [],
  },
};

// Geldige transities per huidige status (zoals de workflow in Jira).
const transitionsByStatus = {
  "To Do": [{ id: "11", name: "Start werk", to: status("In Progress", "indeterminate") }],
  "In Progress": [
    { id: "21", name: "Klaar voor review", to: status("Review", "indeterminate") },
    { id: "31", name: "Terug naar backlog", to: status("To Do", "new") },
  ],
  "Review": [
    { id: "41", name: "Goedkeuren", to: status("Done", "done") },
    { id: "51", name: "Afkeuren", to: status("In Progress", "indeterminate") },
  ],
  "Done": [{ id: "61", name: "Heropenen", to: status("To Do", "new") }],
};

const issueTypes = [
  { id: "1", name: "Bug", subtask: false, hierarchyLevel: 0 },
  { id: "3", name: "Task", subtask: false, hierarchyLevel: 0 },
  { id: "7", name: "Story", subtask: false, hierarchyLevel: 0 },
  { id: "10000", name: "Epic", subtask: false, hierarchyLevel: 1 },
  { id: "10003", name: "Sub-task", subtask: true, hierarchyLevel: -1 },
];
const projects = [
  { id: "20001", key: "CIACC", name: "CI Acceleration" },
  { id: "20002", key: "JAKM", name: "Jakarta migratie" },
  { id: "20003", key: "OBJS", name: "Object Store" },
  { id: "20004", key: "OIDC", name: "OIDC" },
  { id: "20005", key: "PCORE", name: "Platform Core" },
];

// Confluence: markdown zoals de connector hem levert, met tabellen (lege kopregel), escapes, code, links,
// een afbeelding, een scheidingslijn en een losse HTML-tag. De leesweergave mag hiervan niets rauw tonen.
const pages = {
  "900101": {
    title: "Migratieplan Jakarta EE 10", space: { key: "DEV", name: "Development" }, lastModified: "yesterday at 9:28 AM",
    author: "Daan de Vries",
    body: "# Doel\n\nAlle modules gaan naar **Jakarta EE 10** voor de release van Q1. Dit plan beschrijft de volgorde en de risico's.\n\n" +
      "## Volgorde per module\n\n" +
      "|  |  |  |\n| --- | --- | --- |\n| **Module** | **Eigenaar** | **Status** |\n| core-api | Ruben Smit | Klaar |\n| web-ui | Noor Mulder | Bezig, zie [PCORE-101](https://jira.example.com/browse/PCORE-101) |\n| batch \\| jobs | Daan de Vries | `javax.*` nog aanwezig |\n\n" +
      "## Risico's\n\n* Oude `javax.servlet`-imports in plug-ins\n* Build-tijd stijgt tijdelijk \\> 10 min\n* Naamgeving met onderstreping: batch\\_jobs\\_v2\n\n" +
      "---\n\n![architectuurschets](https://wiki.example.com/download/schets.png)\n\n" +
      "> Besluit: we migreren eerst de API, daarna de UI.<br>Vastgelegd in het architectuurboard.\n\n" +
      "1. Afhankelijkheden bijwerken\n2. Imports omzetten met het script\n3. Integratietests draaien\n\n" +
      "```\nmvn -pl core-api verify\n```\n",
  },
  "900202": {
    title: "OIDC ontwerpkeuzes", space: { key: "SEC", name: "Security" }, lastModified: "Sep 22, 2026", author: "Noor Mulder",
    body: "## Token-levensduur\n\nAccess tokens leven **15 minuten**; refresh tokens 8 uur.\n\n## Scopes\n\n- `openid` en `profile` altijd\n- `partner.read` alleen voor het partnerportaal\n",
  },
};

/** Staat voor de mock (window.__MOCK__.werk). */
function werkState() {
  return JSON.parse(JSON.stringify({
    me: "acc-thomas", site: "https://jira.example.com", wiki: "https://wiki.example.com",
    users, issues, transitionsByStatus, issueTypes, projects, pages, created: 0,
  }));
}

module.exports = { werkState, users, issues, transitionsByStatus, issueTypes, projects, pages, person };
