import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Everything under v2/ except tests is served to the public, comments included.
// copy.test.mjs only checks the exported strings; this reads the raw source.
const V2 = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEXT = /\.(html|js|mjs|css|json|py|webmanifest|svg)$/;

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "tests" ? [] : files(p);
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
  for (const f of files(V2)) {
    const text = readFileSync(f, "utf8");
    for (const [re, why] of BANNED) {
      if (re.test(text)) hits.push(`${relative(V2, f)}: ${why}`);
    }
  }
  assert.deepEqual(hits, []);
});
