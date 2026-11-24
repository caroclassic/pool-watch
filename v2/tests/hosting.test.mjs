import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Azure Static Web Apps hosting (2026-11-23): staticwebapp.config.json at the repo root, deployed by
// .github/workflows/azure-static-web-apps.yml.
const root = new URL("../../", import.meta.url);
const cfg = JSON.parse(readFileSync(new URL("staticwebapp.config.json", root), "utf8"));
const maxAge = (v) => Number((/max-age=(\d+)/.exec(v || "") || [])[1]);

test("pages are never cached stale: the default is no-cache", () => {
  assert.equal(cfg.globalHeaders["Cache-Control"], "no-cache");
  assert.equal(cfg.globalHeaders["X-Content-Type-Options"], "nosniff");
});

test("scripts and styles cache for at most a day", () => {
  // The ?v= stamps change the URL on every release, but a browser without import-map support loads the modules
  // without them, so a long cache could pin it to old code. One day bounds that.
  for (const r of ["/v2/js/*", "/v2/css/*"]) {
    const rule = cfg.routes.find((x) => x.route === r);
    assert.ok(rule, `${r} has a rule`);
    assert.ok(maxAge(rule.headers["Cache-Control"]) <= 86400, `${r} caches for a day or less`);
  }
});

test("every route rule only sets headers: nothing is rewritten, redirected or hidden by accident", () => {
  for (const r of cfg.routes) assert.deepEqual(Object.keys(r).sort(), ["headers", "route"]);
});

test("/v2 without the slash sends the browser to /v2/, as GitHub Pages did", () => {
  // Static Web Apps serves v2/index.html at /v2 itself, where its relative css/, js/ and fonts/ links resolve to the site
  // root and 404 (found 2026-11-24). A route rule for "/v2" never fires (tried, dd64e7e), so the page redirects itself,
  // first thing in <head>, keeping the query and hash.
  const html = readFileSync(new URL("v2/index.html", root), "utf8");
  const m = /<script>(if\(\/\^\\\/v2\$\/i\.test\(location\.pathname\)\)location\.replace\("\/v2\/"\+location\.search\+location\.hash\))<\/script>/.exec(html);
  assert.ok(m, "the redirect script is in v2/index.html");
  assert.equal(html.indexOf("<script"), html.indexOf(m[0]), "it is the page's first script");
  const go = (pathname, search = "", hash = "") => {
    let to = null;
    new Function("location", m[1])({ pathname, search, hash, replace: (u) => { to = u; } });
    return to;
  };
  assert.equal(go("/v2", "?day=2026-11-24", "#main"), "/v2/?day=2026-11-24#main");
  assert.equal(go("/V2"), "/v2/");
  for (const p of ["/v2/", "/v2/index.html", "/v2/players.html", "/", "/v20"]) assert.equal(go(p), null, p);
});

test("the deploy workflow uploads the repo as it is, from main", () => {
  const wf = readFileSync(new URL(".github/workflows/azure-static-web-apps.yml", root), "utf8");
  assert.match(wf, /branches: \[main\]/);
  assert.match(wf, /skip_app_build: true/);
  assert.match(wf, /secrets\.AZURE_STATIC_WEB_APPS_API_TOKEN/);
});
