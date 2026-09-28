#!/usr/bin/env node
// Print de `files`-map voor publicatie als Artifact: elk ondersteunend bestand onder src/ (behalve index.html),
// als {"app/x.js": "src/app/x.js", "styles/y.css": "src/styles/y.css", ...}. Paden relatief aan index.html
// (sleutel) en aan de repo-root (waarde). Gebruik: node tools/files-map.js
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src");
const SKIP = /(^|\/)(\.|index\.html$)/; // verborgen bestanden en de pagina zelf

function walk(dir, out) {
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    const rel = path.relative(SRC, full).split(path.sep).join("/");
    if (SKIP.test(rel)) continue;
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else out[rel] = "src/" + rel;
  }
  return out;
}

process.stdout.write(JSON.stringify(walk(SRC, {}), null, 1) + "\n");
