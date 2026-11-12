import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../js/model.js";
import { indexPlayers } from "../js/players-model.js";
import { LEGEND } from "../js/copy.js";

// Live on-pitch states: status.json may carry `live_states` and `live_tier` for a live match in a
// competition whose live updates are published. Everything here is about what the page does with them,
// and above all about falling back to the lineup pills whenever they cannot be trusted.

const TZ = "America/New_York";
const NOW = new Date("2026-11-21T20:10:00Z");
const TODAY = "2026-11-21";
const ago = (min) => new Date(+NOW - min * 60000).toISOString();

// feed order is the relevance order: 11 highest ... 17 lowest
const players = indexPlayers({ players: [11, 12, 13, 14, 15, 16, 17].map((id) => ({ playerId: String(id), short_name: `P${id}` })) });
const POOL = [11, 12, 13, 14, 15, 16, 17].map((id) => ({ playerId: String(id), side: "home" }));
const mf = (o = {}) => ({ schema_version: 1, window: { start: TODAY, end: "2026-12-05" }, tier_thresholds: { enabled: o.tiers ?? true },
  matches: [{ matchId: "1", kickoff_utc: ago(70), competition: "Serie A", home: "Sassuolo", away: "AC Milan", fixture_kind: "club",
    status: "scheduled", tier: "must_watch", tier_at_kickoff: null, players_basis: null, broadcast: null, pool_players: POOL }] });
// 11 starts and is still on; 12 started and was taken off; 13 started and was sent off; 14 came off the bench;
// 15 is an unused substitute; 16 is not in the squad; 17 has no lineup status (the other side's lineup never posted).
const PART = { 11: "starts", 12: "starts", 13: "starts", 14: "bench", 15: "bench", 16: "not_in_squad" };
const LIVE = { 12: "subbed_off", 13: "sent_off", 14: "subbed_on" };
const sf = (o = {}) => ({ schema_version: 1, updated_at: o.at ?? ago(1), active: true, matches: { "1": {
  status: o.status ?? "live", status_updated_at: null, lineups_confirmed: true, tier: "must_watch", tier_at_kickoff: "must_watch",
  participation: o.part ?? PART, ...("live" in o ? (o.live === undefined ? {} : { live_states: o.live }) : { live_states: LIVE }),
  ...("liveTier" in o ? { live_tier: o.liveTier } : {}), ...("peak" in o ? { tier_peak: o.peak } : {}),
  ...("tak" in o ? { tier_at_kickoff: o.tak, tier: o.tak } : {}) } } });
const day = (status, o = {}) => {
  const views = M.mergeFeeds(mf(o), status);
  return M.buildDay({ views, dayKey: TODAY, todayKey: TODAY, follows: new Set(o.follows ?? []), players, now: NOW, tz: TZ,
    statusFeed: status, staleMinutes: 15, tiersEnabled: o.tiers ?? true });
};
const card = (status, o = {}) => { const d = day(status, o); return [...d.pinned, ...d.live, ...d.must, ...d.worth, ...d.rest, ...d.disrupted, ...d.earlier][0]; };
const words = (c) => Object.fromEntries(c.chips.map((x) => [x.playerId, x.word]));
const ids = (c) => c.chips.map((x) => x.playerId);

test("the three live words, each with its own shape; everyone else keeps his lineup word", () => {
  const c = card(sf());
  assert.deepEqual(words(c), { 11: "Starts", 12: "Subbed off", 13: "Sent off", 14: "Subbed on", 15: "Bench", 16: "Not in squad", 17: null });
  const shape = Object.fromEntries(c.chips.map((x) => [x.playerId, x.shape]));
  assert.deepEqual(shape, { 11: "starts", 12: "subbed_off", 13: "sent_off", 14: "subbed_on", 15: "bench", 16: "not_in_squad", 17: null });
  for (const x of c.chips) assert.equal(!!x.shape, !!x.word, "a shape never appears without its word, or a word without its shape");
  assert.deepEqual(Object.values(M.LIVE_WORD).sort(), ["Sent off", "Subbed off", "Subbed on"]);
});

test("the lineup status underneath is kept, so pinning and 'not playing' rules do not change", () => {
  const c = card(sf());
  assert.equal(c.chips.find((x) => x.playerId === "12").participation, "starts");
  assert.equal(c.chips.find((x) => x.playerId === "14").participation, "bench");
});

test("live pill order: on the pitch, no status yet, bench, taken off or sent off, not in squad; relevance inside a group", () => {
  // on the pitch: 11 (starter still on), 14 (came on); no status: 17; bench: 15; off: 12, 13; not in squad: 16
  assert.deepEqual(ids(card(sf())), ["11", "14", "17", "15", "12", "13", "16"]);
});

test("a followed player leads even after he has gone off; a followed player who is not in the squad does not", () => {
  assert.deepEqual(ids(card(sf(), { follows: ["13"] })), ["13", "11", "14", "17", "15", "12", "16"]);   // sent off, still first
  assert.deepEqual(ids(card(sf(), { follows: ["15"] })), ["15", "11", "14", "17", "12", "13", "16"]);   // on the bench, first
  assert.deepEqual(ids(card(sf(), { follows: ["16"] }))[6], "16");                                      // not in squad: last
  assert.deepEqual(ids(card(sf(), { follows: ["16"] })).slice(0, 2), ["11", "14"]);
});

test("no live data: the card is exactly what it was (words, order, badge)", () => {
  const c = card(sf({ live: undefined }));
  assert.deepEqual(words(c), { 11: "Starts", 12: "Starts", 13: "Starts", 14: "Bench", 15: "Bench", 16: "Not in squad", 17: null });
  assert.deepEqual(ids(c), ["11", "12", "13", "17", "14", "15", "16"]);          // starters, no status, bench, not in squad
  assert.equal(c.tier, "must_watch");
  assert.ok(c.chips.every((x) => x.live === null));
});

test("a stale status feed drops every live state and the live tier", () => {
  const stale = sf({ at: ago(16), liveTier: "worth_a_look" });
  const c = card(stale);
  assert.deepEqual(words(c), { 11: "Starts", 12: "Starts", 13: "Starts", 14: "Bench", 15: "Bench", 16: "Not in squad", 17: null });
  assert.deepEqual(ids(c), ["11", "12", "13", "17", "14", "15", "16"]);
  assert.equal(c.tier, "must_watch");                       // the kickoff tier
  assert.equal(c.header.kind, "stale");
  assert.equal(day(stale).live.length, 0);                  // and, as before, a stale match is not in Live now
});

test("anything unexpected in live_states is ignored, player by player", () => {
  const bad = { 11: "subbed_on",        // a starter cannot be subbed on
                12: "unknown", 13: 83, 14: { state: "subbed_on", minute: 60 },
                15: "SUBBED_ON", 16: "sent_off",   // not in the squad cannot be sent off
                17: "subbed_off" };                // no lineup status: nothing to change
  const c = card(sf({ live: bad }));
  assert.deepEqual(words(c), { 11: "Starts", 12: "Starts", 13: "Starts", 14: "Bench", 15: "Bench", 16: "Not in squad", 17: null });
  for (const shape of [[], "subbed_on", 7, null]) {
    assert.ok(card(sf({ live: shape })).chips.every((x) => x.live === null), `live_states = ${JSON.stringify(shape)}`);
  }
  assert.equal(M.liveState({ status: "live", liveStates: { toString: "subbed_on" }, participation: { toString: "bench" } }, "constructor"), null);
});

test("live states never show on a match that has not started or is not being played", () => {
  for (const status of ["scheduled", "postponed", "cancelled"]) {
    const c = card(sf({ status }));
    assert.ok(c.chips.every((x) => x.live === null), status);
    assert.equal(c.chips.find((x) => x.playerId === "14").word, "Bench", status);
  }
});

test("at full time each player keeps the word he ended on, in the ordinary lineup order", () => {
  const c = card(sf({ status: "full_time" }));
  assert.deepEqual(words(c), { 11: "Starts", 12: "Subbed off", 13: "Sent off", 14: "Subbed on", 15: "Bench", 16: "Not in squad", 17: null });
  assert.equal(c.header.kind, "full_time");
  // not the live order: starters (11, 12, 13), no status (17), bench (14, 15), not in squad (16)
  assert.deepEqual(ids(c), ["11", "12", "13", "17", "14", "15", "16"]);
  // an old status feed does not matter for a finished match: its words are final
  assert.deepEqual(words(card(sf({ status: "full_time", at: ago(600) }))), words(c));
  // and a finished match with no live data is unchanged
  assert.deepEqual(words(card(sf({ status: "full_time", live: undefined }))),
    { 11: "Starts", 12: "Starts", 13: "Starts", 14: "Bench", 15: "Bench", 16: "Not in squad", 17: null });
});

test("at full time the card shows the highest tier the match reached, kickoff or live", () => {
  const ft = (o) => card(sf({ status: "full_time", ...o }));
  assert.equal(ft({ tak: "worth_a_look", peak: "must_watch" }).tier, "must_watch");      // rose while live
  assert.equal(ft({ tak: "must_watch", peak: "must_watch" }).tier, "must_watch");
  assert.equal(ft({ tak: null, peak: "worth_a_look" }).tier, "worth_a_look");
  assert.equal(ft({ tak: "must_watch", peak: "worth_a_look" }).tier, "must_watch");      // never lower than the kickoff tier
  assert.equal(ft({ tak: "must_watch", peak: null }).tier, "must_watch");
  assert.equal(ft({ tak: "worth_a_look" }).tier, "worth_a_look");                        // no peak: kickoff tier, as before
  for (const odd of ["must", 2, {}, "toString"]) assert.equal(ft({ tak: "worth_a_look", peak: odd }).tier, "worth_a_look");
  // the kickoff tier itself is untouched, and the day strip keeps using it
  const status = sf({ status: "full_time", tak: "worth_a_look", peak: "must_watch" });
  const views = M.mergeFeeds(mf(), status);
  assert.equal(views[0].tierAtKickoff, "worth_a_look");
  const facts = M.dayFacts(views, { follows: new Set(), now: NOW, statusFeed: status, staleMinutes: 15, tiersEnabled: true });
  assert.equal(facts.get(TODAY).must, false);
  // a peak tier means nothing on a match that is still live
  assert.equal(card(sf({ tak: "worth_a_look", peak: "must_watch" })).tier, "worth_a_look");
});

test("live tier drives the badge of a live match; the kickoff tier is kept underneath", () => {
  const v = M.mergeFeeds(mf(), sf({ liveTier: "worth_a_look" }))[0];
  assert.equal(v.tierAtKickoff, "must_watch"); assert.equal(v.liveTier, "worth_a_look");
  assert.equal(M.effectiveTier(v, true, true), "worth_a_look");
  assert.equal(M.effectiveTier(v, true), "must_watch");                       // callers that have not checked freshness
  assert.equal(M.effectiveTier(v, false, true), null);                        // tiers off
  assert.equal(card(sf({ liveTier: "worth_a_look" })).tier, "worth_a_look");
  assert.equal(card(sf({ liveTier: null })).tier, null);                      // nobody of note left on the pitch: no badge
  assert.equal(card(sf({ liveTier: "must_watch" })).tier, "must_watch");
});

test("no live tier, or one this page does not know, leaves the kickoff tier on the badge", () => {
  assert.equal(card(sf()).tier, "must_watch");                                // live states without a live tier
  for (const odd of ["must", "MUST_WATCH", 3, {}, "toString"]) {
    assert.equal(card(sf({ liveTier: odd })).tier, "must_watch", JSON.stringify(odd));
  }
  assert.equal(card(sf({ live: undefined, liveTier: "worth_a_look" })).tier, "must_watch");   // a live tier with no live states is not used
});

test("a live match stays in Live now whatever its live tier, and the day strip keeps the kickoff tier", () => {
  for (const liveTier of ["must_watch", "worth_a_look", null]) {
    const d = day(sf({ liveTier }));
    assert.equal(d.live.length, 1); assert.equal(d.must.length + d.worth.length + d.rest.length, 0);
  }
  const views = M.mergeFeeds(mf(), sf({ liveTier: null }));
  const facts = M.dayFacts(views, { follows: new Set(), now: NOW, statusFeed: sf({ liveTier: null }), staleMinutes: 15, tiersEnabled: true });
  assert.equal(facts.get(TODAY).must, true);
});

test("the accessible name of a pill carries the live word through the same field as the lineup word", () => {
  const c = card(sf());
  const x = c.chips.find((p) => p.playerId === "13");
  assert.equal(`${x.name}, ${x.word}`, "P13, Sent off");
});

test("the Legend explains the three live words and promises no minutes", () => {
  const sec = LEGEND.find((s) => s.title === "Players in a match");
  const keys = sec.rows.map((r) => r[0].slice(1).trim());
  for (const w of ["Subbed on", "Subbed off", "Sent off"]) assert.ok(keys.includes(w), w);
  assert.equal(new Set(sec.rows.map((r) => r[0][0])).size, sec.rows.length, "every row starts with its own mark");
  assert.match(sec.note, /don't show minutes or scores/);
  assert.doesNotMatch(sec.note, /behind/);
});
