#!/usr/bin/env node
// Controleert de gedeelde top-level namen van src/app/*.js (klassieke scripts, één globale scope).
// Meldt: (1) namen die in meer dan één bestand gedeclareerd worden, (2) namen die botsen met
// eigenschappen van window in de browser (bv. `status`, `name`, `top`). Exitcode 1 bij een probleem.
// Gebruik: node tools/check-globals.js [--list]
const fs = require("fs");
const path = require("path");

function loadAcorn() {
  const tries = ["acorn", "/opt/node22/lib/node_modules/eslint/node_modules/acorn"];
  for (const t of tries) { try { return require(t); } catch (e) { /* volgende */ } }
  return null;
}
const acorn = loadAcorn();

// Eigenschappen van window die een top-level var/function kapot maken of stil overschrijven.
const WINDOW_NAMES = new Set(("window self document name location history customElements locationbar menubar personalbar " +
  "scrollbars statusbar toolbar status closed frames length top opener parent frameElement navigator origin external " +
  "screen innerWidth innerHeight scrollX pageXOffset scrollY pageYOffset visualViewport screenX screenY outerWidth " +
  "outerHeight devicePixelRatio event clientInformation screenLeft screenTop styleMedia onsearch isSecureContext " +
  "trustedTypes performance crypto indexedDB sessionStorage localStorage caches speechSynthesis scheduler navigation " +
  "close stop focus blur open alert confirm prompt print postMessage queueMicrotask requestAnimationFrame " +
  "cancelAnimationFrame captureEvents releaseEvents getComputedStyle matchMedia moveTo moveBy resizeTo resizeBy scroll " +
  "scrollTo scrollBy getSelection find fetch btoa atob setTimeout clearTimeout setInterval clearInterval " +
  "createImageBitmap structuredClone reportError getScreenDetails queryLocalFonts showOpenFilePicker " +
  "showSaveFilePicker showDirectoryPicker cookieStore documentPictureInPicture launchQueue sharedStorage fence " +
  "credentialless crossOriginIsolated originAgentCluster onerror onload onmessage onfocus onblur onresize onscroll " +
  "chrome webkitStorageInfo Image Option Audio Node Element Event Text Range Selection Notification Request Response " +
  "Headers URL Blob File FormData Worker Map Set Date Math JSON Promise Proxy Reflect Symbol Error Array Object String " +
  "Number Boolean RegExp Function undefined NaN Infinity eval isNaN isFinite parseInt parseFloat globalThis").split(/\s+/));

function topLevelNames(code, file) {
  const out = [];
  if (!acorn) {
    // Terugval zonder parser: declaraties op kolom 0.
    code.split("\n").forEach((l) => {
      const m = /^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|^(?:var|let|const)\s+(.*)/.exec(l);
      if (m && m[1]) out.push(m[1]);
      else if (m && m[2]) m[2].split(",").forEach((p) => { const n = /^\s*([A-Za-z_$][\w$]*)\s*(=|;|$)/.exec(p); if (n) out.push(n[1]); });
    });
    return out;
  }
  const ast = acorn.parse(code, { ecmaVersion: 2022, sourceType: "script", locations: true });
  const addPattern = (p) => {
    if (!p) return;
    if (p.type === "Identifier") out.push(p.name);
    else if (p.type === "ObjectPattern") p.properties.forEach((x) => addPattern(x.value || x.argument));
    else if (p.type === "ArrayPattern") p.elements.forEach(addPattern);
    else if (p.type === "AssignmentPattern") addPattern(p.left);
    else if (p.type === "RestElement") addPattern(p.argument);
  };
  // var in blokken op top-level is ook globaal (hoisting); let/const alleen direct op top-level.
  const walk = (node, top) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach((n) => walk(n, top)); return; }
    switch (node.type) {
      case "FunctionDeclaration": if (top) out.push(node.id.name); return;
      case "ClassDeclaration": if (top) out.push(node.id.name); return;
      case "FunctionExpression": case "ArrowFunctionExpression": case "ClassExpression": return;
      case "VariableDeclaration":
        if (node.kind === "var" || top) node.declarations.forEach((d) => addPattern(d.id));
        node.declarations.forEach((d) => walk(d.init, false));
        return;
      default:
        for (const k of Object.keys(node)) {
          if (k === "type" || k === "loc" || k === "start" || k === "end") continue;
          const v = node[k];
          if (v && typeof v === "object") walk(v, false);
        }
    }
  };
  ast.body.forEach((s) => walk(s, true));
  return out;
}

const dir = path.join(__dirname, "..", "src", "app");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".js")).sort();
const owner = {};
let problems = 0;
for (const f of files) {
  const names = topLevelNames(fs.readFileSync(path.join(dir, f), "utf8"), f);
  const seen = new Set();
  for (const n of names) {
    if (seen.has(n)) continue; // var-herdeclaratie binnen één bestand is dezelfde variabele
    seen.add(n);
    (owner[n] = owner[n] || []).push(f);
    if (WINDOW_NAMES.has(n)) { console.log("BOTSING met window: " + n + " in " + f); problems++; }
  }
}
for (const [n, fs2] of Object.entries(owner)) {
  if (fs2.length > 1) { console.log("DUBBEL: " + n + " in " + fs2.join(", ")); problems++; }
}
if (process.argv.includes("--list")) {
  for (const f of files) console.log(f + ": " + Object.keys(owner).filter((n) => owner[n].includes(f)).sort().join(" "));
}
console.log((acorn ? "acorn" : "regex") + ": " + files.length + " bestanden, " + Object.keys(owner).length + " top-level namen, " + problems + " problemen");
process.exit(problems ? 1 : 0);
