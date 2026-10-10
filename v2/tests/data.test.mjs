import test from "node:test";
import assert from "node:assert/strict";
import * as D from "../js/data.js";

const NOW = new Date("2026-10-09T17:00:00Z");
const v = (status, hoursFromNow) => ({ status, kickoffUtc: new Date(+NOW + hoursFromNow * 3600000).toISOString() });

test("shouldPollFast: live, lineup window, active flag", () => {
  assert.equal(D.shouldPollFast([v("live", -1)], null, NOW), true);
  assert.equal(D.shouldPollFast([v("scheduled", 1)], null, NOW), true);        // 60 min out
  assert.equal(D.shouldPollFast([v("scheduled", 1.6)], null, NOW), false);     // 96 min out
  assert.equal(D.shouldPollFast([v("scheduled", 5)], null, NOW), false);
  assert.equal(D.shouldPollFast([v("full_time", -3)], null, NOW), false);
  assert.equal(D.shouldPollFast([v("scheduled", 5)], { active: true }, NOW), true);
  assert.equal(D.shouldPollFast([v("scheduled", -0.2)], null, NOW), true);     // just kicked off, not yet live
  assert.equal(D.shouldPollFast([], null, NOW), false);
});

test("http source: cache-busts, validates schema, maps failures", async () => {
  const seen = [];
  const mk = (res) => D.createHttpSource({ base: "https://x.test/v2/", clock: () => 120_000 * 3, fetchImpl: async (u) => { seen.push(u); return res; } });
  const ok = mk({ ok: true, json: async () => ({ schema_version: 1, matches: [] }) });
  await ok.getMatches();
  assert.equal(seen[0], "https://x.test/v2/matches.json?t=6");
  await assert.rejects(mk({ ok: false, status: 404 }).getStatus(), (e) => e.kind === "http");
  await assert.rejects(mk({ ok: true, json: async () => ({ schema_version: 2 }) }).getPlayers(), (e) => e.kind === "schema");
  await assert.rejects(mk({ ok: true, json: async () => { throw new Error("bad"); } }).getPlayers(), (e) => e.kind === "parse");
  const down = D.createHttpSource({ base: "https://x.test/", fetchImpl: async () => { throw new Error("offline"); } });
  await assert.rejects(down.getMatches(), (e) => e.kind === "network");
});

function harness(over = {}) {
  let t = 0; const timers = []; const listeners = {};
  const doc = { visibilityState: "visible", addEventListener: (n, f) => { listeners[n] = f; }, removeEventListener: () => {} };
  const calls = { full: 0, status: 0 }; const events = [];
  const source = {
    getMatches: async () => { calls.full++; return { m: 1 }; },
    getStatus: async () => { calls.status++; if (over.failStatus) throw new D.FeedError("down", "network"); return { s: calls.status }; },
    getPlayers: async () => ({ p: 1 }),
  };
  const p = D.createPoller({
    source, doc, clock: () => t, delay: () => over.delay ?? 60_000,
    timers: { setTimeout: (fn, ms) => { const h = { fn, ms }; timers.push(h); return h; }, clearTimeout: (h) => { if (h) h.cancelled = true; } },
    onData: (d, i) => events.push(["data", i.first]), onError: (e, i) => events.push(["error", i.first]),
  });
  const live = () => timers.filter((x) => !x.cancelled && !x.fired);
  const fire = async () => { const h = live().at(-1); h.fired = true; await h.fn(); };
  return { p, calls, events, timers, live, fire, doc, listeners, advance: (ms) => { t += ms; }, set hidden(b) { doc.visibilityState = b ? "hidden" : "visible"; } };
}

test("poller: first load is full; later ticks refresh status only", async () => {
  const h = harness(); await h.p.start();
  assert.deepEqual(h.calls, { full: 1, status: 1 }); assert.deepEqual(h.events[0], ["data", true]);
  assert.equal(h.live().length, 1); assert.equal(h.live()[0].ms, 60_000);
  h.advance(60_000); await h.fire();
  assert.deepEqual(h.calls, { full: 1, status: 2 });
});

test("poller: matches + players re-read after the full-refresh interval", async () => {
  const h = harness(); await h.p.start();
  h.advance(11 * 60_000); await h.fire();
  assert.equal(h.calls.full, 2);
});

test("poller: pauses while hidden, catches up when shown", async () => {
  const h = harness(); await h.p.start();
  h.hidden = true; h.listeners.visibilitychange();
  assert.equal(h.live().length, 0);
  h.advance(5 * 60_000); h.hidden = false; h.listeners.visibilitychange();
  await new Promise((r) => setImmediate(r));
  assert.equal(h.calls.status, 2);                                   // refreshed at once
  const h2 = harness(); await h2.p.start(); h2.advance(10_000);
  h2.hidden = true; h2.listeners.visibilitychange(); h2.hidden = false; h2.listeners.visibilitychange();
  assert.equal(h2.live().at(-1).ms, 50_000);                         // recent: just waits out the rest
});

test("poller: an error keeps polling and reports first-load failures", async () => {
  const h = harness({ failStatus: true }); await h.p.start();
  assert.deepEqual(h.events[0], ["error", true]); assert.equal(h.live().length, 1);
});

test("poller: stop cancels the timer", async () => {
  const h = harness(); await h.p.start(); h.p.stop();
  assert.equal(h.live().length, 0);
});
