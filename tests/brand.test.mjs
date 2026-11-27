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

// Every CSS rule as [selector, body], comments removed (enough for this stylesheet: no nested rules except @media/@container).
const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]]);

test("coral (--accent) is used only for Must-watch and the logo's XI", () => {
  // the wordmark's XI, the Must-watch day dot, the Must-watch banner (README: "One job per color")
  const ALLOWED = new Set([".brand .xi", ".t-must", ".mw-banner"]);
  const users = rules.filter(([, body]) => /var\(--accent\)/.test(body)).map(([sel]) => sel);
  assert.ok(users.length >= 3, "the allowed uses are present");
  for (const sel of users) assert.ok(ALLOWED.has(sel), `--accent used by "${sel}"`);
});

test("focus rings use --focus (ink), never coral", () => {
  const focus = rules.filter(([sel]) => /:focus-visible/.test(sel));
  assert.ok(focus.length);
  for (const [sel, body] of focus) assert.match(body, /var\(--focus\)/, sel);
  assert.doesNotMatch(css, /--blue/, "the old --blue name is gone");
});

test("tags, buttons, segments and tabs are at least 44 px tall", () => {
  assert.match(css, /--touch:\s*44px/);
  for (const sel of [".chip", ".btn", ".btn-text", ".btn-link", ".icon-btn", ".seg-opt", ".sitenav a", ".search", ".cal-step", ".term.term-info"]) {
    const r = rules.find(([s]) => s === sel);
    assert.ok(r, `${sel} has its own rule`);
    assert.match(r[1], /(min-)?height:\s*(var\(--touch\)|4[4-9]px)/, `${sel} is at least 44 px`);
  }
});

test("only filter chips may be pills: no other rule uses a pill radius", () => {
  for (const [sel, body] of rules) {
    if (/border-radius:[^;]*(var\(--radius-pill\)|\b(2[2-9]|[3-9]\d|\d{3,})px)/.test(body)) assert.fail(`pill radius on "${sel}"`);
  }
});

test("every page uses the XI mark: 16 px master, 32 px mark, 180 px home-screen icon, and no old icon", () => {
  for (const page of ["index.html", "players.html", "about.html"]) {
    const html = readFileSync(new URL(page, root), "utf8");
    assert.match(html, /<link rel="icon" type="image\/png" sizes="16x16" href="favicon-16.png">/, page);
    assert.match(html, /<link rel="icon" type="image\/png" sizes="32x32" href="favicon-32.png">/, page);
    assert.match(html, /<link rel="apple-touch-icon" href="apple-touch-icon.png">/, page);
    assert.doesNotMatch(html, /rel="icon"[^>]*data:/, `${page}: the old inline icon is gone`);
  }
  for (const f of ["favicon-16.png", "favicon-32.png", "apple-touch-icon.png"]) assert.ok(readFileSync(new URL(f, root)).length > 50, f);
});
