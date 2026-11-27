import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as M from "../js/model.js";

// The brand refresh (docs/brand/, applied 2026-11-27). The rules that are easy to break by accident.
const root = new URL("../", import.meta.url);
const css = readFileSync(new URL("css/app.css", root), "utf8");

test("Must-watch banner only outside the Must-watch band; Worth a look label only outside its own band", () => {
  // Your players, Live now, Still live, Earlier: no band of their own (null)
  assert.equal(M.levelMark("must_watch", null), "banner");
  assert.equal(M.levelMark("must_watch", "must_watch"), null);            // the heading already says it
  assert.equal(M.levelMark("worth_a_look", null), "label");
  assert.equal(M.levelMark("worth_a_look", "worth_a_look"), null);
  assert.equal(M.levelMark(null, null), null);                             // unbadged (or tiers off, or postponed)
  assert.equal(M.levelMark(null, "must_watch"), null);
});

test("the Must-watch rail and the filled card badge are gone", () => {
  assert.doesNotMatch(css, /border-left:\s*5px/, "no 5 px rail");
  assert.doesNotMatch(css, /\.badge-must_watch/, "no filled card badge");
});
