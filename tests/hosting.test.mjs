import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Azure Static Web Apps hosting (2026-11-23): staticwebapp.config.json at the repo root, deployed by
// .github/workflows/azure-static-web-apps.yml.
const root = new URL("../", import.meta.url);
const cfg = JSON.parse(readFileSync(new URL("staticwebapp.config.json", root), "utf8"));
const maxAge = (v) => Number((/max-age=(\d+)/.exec(v || "") || [])[1]);

test("pages are never cached stale: the default is no-cache", () => {
  assert.equal(cfg.globalHeaders["Cache-Control"], "no-cache");
  assert.equal(cfg.globalHeaders["X-Content-Type-Options"], "nosniff");
});

test("scripts and styles cache for at most a day", () => {
  // The ?v= stamps change the URL on every release, but a browser without import-map support loads the modules
  // without them, so a long cache could pin it to old code. One day bounds that.
  for (const r of ["/js/*", "/css/*"]) {
    const rule = cfg.routes.find((x) => x.route === r);
    assert.ok(rule, `${r} has a rule`);
    assert.ok(maxAge(rule.headers["Cache-Control"]) <= 86400, `${r} caches for a day or less`);
  }
});

// The cutover (2026-11-24 rehearsal; cutover-plan.md) moved the pages from /v2/ to the root. The old /v2 addresses
// redirect to their new homes; /dev/ (sample feeds) and /tests/ are not served. Every other rule only sets headers.
// "/v2" also matches "/v2/": Azure ignores a trailing slash when it compares routes and refuses a config that lists both.
const REDIRECTS = { "/v2": "/", "/v2/index.html": "/", "/v2/players.html": "/players.html", "/v2/about.html": "/about.html", "/v2/*": "/" };
const HIDDEN = ["/dev/*", "/tests/*"];

test("the old /v2 addresses redirect (301) to the same page at the root, specific ones before the catch-all", () => {
  for (const [from, to] of Object.entries(REDIRECTS))
    assert.deepEqual(cfg.routes.find((x) => x.route === from), { route: from, redirect: to, statusCode: 301 }, from);
  const at = (r) => cfg.routes.findIndex((x) => x.route === r);
  for (const r of Object.keys(REDIRECTS)) if (r !== "/v2/*") assert.ok(at(r) < at("/v2/*"), `${r} comes before /v2/*`);
});

test("no two route rules are the same route once a trailing slash is ignored (the deploy step refuses duplicates)", () => {
  const seen = cfg.routes.map((x) => x.route.length > 1 ? x.route.replace(/\/$/, "") : x.route);
  assert.equal(new Set(seen).size, seen.length, seen.join(" "));
});

test("/dev/ and /tests/ are not served", () => {
  for (const r of HIDDEN) assert.deepEqual(cfg.routes.find((x) => x.route === r), { route: r, statusCode: 404 });
});

test("every other route rule only sets headers: nothing is rewritten, redirected or hidden by accident", () => {
  for (const r of cfg.routes.filter((x) => !(x.route in REDIRECTS) && !HIDDEN.includes(x.route)))
    assert.deepEqual(Object.keys(r).sort(), ["headers", "route"], r.route);
  assert.equal(cfg.routes.length, Object.keys(REDIRECTS).length + HIDDEN.length + 4);
});

test("the pages live at the root, with no relative path climbing out of it", () => {
  for (const p of ["index.html", "players.html", "about.html"]) {
    const html = readFileSync(new URL(p, root), "utf8");
    assert.ok(!/(?:href|src)="\.\.\//.test(html), `${p}: no ../ links`);
    assert.match(html, /<meta name="robots" content="noindex">/, `${p}: noindex stays until launch day`);
  }
});

test("the deploy workflow uploads the repo as it is, from main", () => {
  const wf = readFileSync(new URL(".github/workflows/azure-static-web-apps.yml", root), "utf8");
  assert.match(wf, /branches: \[main\]/);
  assert.match(wf, /skip_app_build: true/);
  assert.match(wf, /secrets\.AZURE_STATIC_WEB_APPS_API_TOKEN/);
});

// Cloudflare Web Analytics (installed 2026-11-24; decided 2026-10-12): page views only, no cookies, disclosed in the
// About privacy line (copy.test.mjs). The site is DNS-only at Cloudflare, so the beacon is added by the pages themselves,
// and only on the public domain, so local copies and test runs are never counted.
const PAGES = ["index.html", "players.html", "about.html"];
const BEACON = "https://static.cloudflareinsights.com/beacon.min.js";
const TOKEN = "f8bee1618b654a2880278360fbfb6a67";
const loader = (html) => (/<script>(\(function\(\)\{if\(location\.hostname!=="statesidexi\.com"\)return;[^<]*)<\/script>/.exec(html) || [])[1];

test("every page loads the analytics beacon, the same way, with the site's token", () => {
  const found = PAGES.map((p) => loader(readFileSync(new URL(p, root), "utf8")));
  for (const [i, l] of found.entries()) assert.ok(l, `${PAGES[i]} has the analytics loader`);
  assert.equal(new Set(found).size, 1, "the three pages carry the identical loader");
  assert.ok(found[0].includes(BEACON) && found[0].includes(`{"token": "${TOKEN}"}`));
});

test("the beacon loads only on statesidexi.com, deferred, with its config on the element", () => {
  const l = loader(readFileSync(new URL("index.html", root), "utf8"));
  const run = (hostname) => {
    const added = [];
    const el = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
    const document = { createElement: (t) => (el.tag = t, el), body: { appendChild: (e) => added.push(e) } };
    new Function("location", "document", l)({ hostname }, document);
    return added;
  };
  const [b] = run("statesidexi.com");
  assert.equal(b.tag, "script"); assert.equal(b.src, BEACON); assert.equal(b.defer, true);
  assert.deepEqual(JSON.parse(b.attrs["data-cf-beacon"]), { token: TOKEN });
  for (const h of ["www.statesidexi.com", "localhost", "127.0.0.1", "ambitious-ocean-0f58a8310.4.azurestaticapps.net", "caroclassic.github.io"])
    assert.equal(run(h).length, 0, `${h} does not load it`);
});

test("no page loads any other outside script", () => {
  for (const p of PAGES) {
    const html = readFileSync(new URL(p, root), "utf8");
    const outside = [...html.matchAll(/https?:\/\/[a-z0-9.-]+/gi)].map((m) => m[0])
      .filter((u) => !/^https:\/\/(statesidexi\.com|statesidexicus\.blob\.core\.windows\.net|static\.cloudflareinsights\.com)$/.test(u));
    assert.deepEqual(outside, [], `${p}: only our own hosts and the beacon`);
  }
});

test("the pages that read the feeds preconnect to the feeds' origin (data-base), with crossorigin for fetch()", () => {
  // Load speed (launch-plan step 2b, 2026-11-27): the feed fetches start only once the scripts run, so the
  // connection to the blob is opened early. A preconnect to the wrong origin, or without crossorigin (fetch() uses
  // an anonymous connection), would be silently wasted.
  for (const page of ["index.html", "players.html"]) {
    const html = readFileSync(new URL(page, root), "utf8");
    const base = (/<html[^>]*\sdata-base="([^"]+)"/.exec(html) || [])[1];
    assert.ok(base, `${page} has a data-base`);
    const pre = [...html.matchAll(/<link rel="preconnect" href="([^"]+)"([^>]*)>/g)];
    assert.equal(pre.length, 1, `${page} has one preconnect`);
    assert.equal(pre[0][1], new URL(base).origin, `${page} preconnects to its data-base origin`);
    assert.match(pre[0][2], /\scrossorigin\b/, `${page} preconnect carries crossorigin`);
    assert.ok(html.indexOf(pre[0][0]) < html.indexOf('<link rel="stylesheet"'), `${page} preconnect comes before the stylesheets`);
  }
});
