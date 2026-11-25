import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Everything in the site repo except tests/, dev/ (not served since the cutover) and dot-folders is served to the public,
// comments included. dev/ is still checked: it was public under /v2/dev/ before.
// copy.test.mjs only checks the exported strings; this reads the raw source.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEXT = /\.(html|js|mjs|css|json|py|webmanifest|svg)$/;

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "tests" || name.startsWith(".") ? [] : files(p);
    return TEXT.test(name) ? [p] : [];
  });
}

const BANNED = [
  [/trajectory/i, "trajectory is never mentioned publicly"],
  [/usmnt-tracker/i, "the competitor is never named"],
  [/pool_score/i, "raw pool score is never published"],
  [/derek/i, "no personal names in served source"],
];

test("served v2 source (comments included) holds no banned terms", () => {
  const hits = [];
  for (const f of files(ROOT)) {
    const text = readFileSync(f, "utf8");
    for (const [re, why] of BANNED) {
      if (re.test(text)) hits.push(`${relative(ROOT, f)}: ${why}`);
    }
  }
  assert.deepEqual(hits, []);
});
