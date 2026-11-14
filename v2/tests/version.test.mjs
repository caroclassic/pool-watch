import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Cache versioning (dev/stamp_version.py): every page carries one version, the hash of the scripts and
// stylesheets it loads, on its links, its entry script and an import map covering every module. A change to
// js/ or css/ without re-stamping fails here, so a push cannot ship mixed old/new files to an open browser.

const V2 = join(dirname(fileURLToPath(import.meta.url)), "..");
const PAGES = ["index.html", "players.html", "about.html"];

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const rel = (p) => relative(V2, p).split("\\").join("/");
const assets = [...walk(join(V2, "js")).filter((p) => p.endsWith(".js")), ...walk(join(V2, "css")).filter((p) => p.endsWith(".css"))]
  .map(rel).sort();

function version() {          // the same computation as stamp_version.py
  const h = createHash("sha256");
  for (const r of assets) {
    h.update(Buffer.concat([Buffer.from(r), Buffer.from([0])]));
    h.update(Buffer.concat([readFileSync(join(V2, r)), Buffer.from([0])]));
  }
  return h.digest("hex").slice(0, 10);
}

test("every page is stamped with the current version (run python3 v2/dev/stamp_version.py)", () => {
  const v = version();
  for (const page of PAGES) {
    const html = readFileSync(join(V2, page), "utf8");
    const m = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
    assert.ok(m, `${page}: no import map`);
    const map = JSON.parse(m[1]).imports;
    for (const r of assets.filter((a) => a.endsWith(".js"))) {
      assert.equal(map[`./${r}`], `./${r}?v=${v}`, `${page}: ${r} is not mapped to the current version`);
    }
    for (const href of html.matchAll(/href="(css\/[^"]+)"/g)) assert.ok(href[1].endsWith(`?v=${v}`), `${page}: ${href[1]}`);
    for (const src of html.matchAll(/<script type="module" src="([^"]+)"/g)) assert.ok(src[1].endsWith(`?v=${v}`), `${page}: ${src[1]}`);
    assert.ok(html.indexOf('type="importmap"') < html.indexOf('type="module"'), `${page}: the import map must come before any module script`);
  }
});
