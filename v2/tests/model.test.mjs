import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../js/model.js";
import { indexPlayers } from "../js/players-model.js";

const TZ = "America/Los_Angeles";
const NOW = new Date("2026-10-09T17:00:00Z");           // Fri 1:00 PM ET
const TODAY = "2026-10-09";
const iso = (h, dayOffsetHours = 0) => new Date(+NOW + (h * 3600 + dayOffsetHours) * 1000).toISOString();

const players = indexPlayers({ players: [
  { playerId: "11", short_name: "C. Pulisic", score: 70 },
  { playerId: "12", short_name: "G. Reyna", score: 60 },
  { playerId: "13", short_name: "T. Weah", score: 50 },
  { playerId: "14", short_name: "A. Zed", score: 5 },
  { playerId: "15", short_name: "B. Able", score: 5 },
]});

const pm = (id, side = "home") => ({ playerId: String(id), side });
const match = (id, o = {}) => ({
  matchId: String(id), kickoff_utc: o.ko ?? iso(3), competition: "Premier League",
  home: o.home ?? "Chelsea", away: o.away ?? "Fulham", fixture_kind: o.kind ?? "club",
  status: o.status ?? "scheduled", tier: o.tier ?? null, tier_at_kickoff: o.tak ?? null,
  players_basis: o.basis ?? null, broadcast: o.bc ?? null, pool_players: o.pool ?? [pm(11)],
});
const feed = (matches, o = {}) => ({ schema_version: 1, window: { start: TODAY, end: "2026-10-23" },
  tier_thresholds: { enabled: o.tiers ?? true }, matches });
const sfeed = (matches = {}, o = {}) => ({ schema_version: 1, updated_at: o.at ?? iso(0, -60), active: !!o.active, matches });
const ctx = (views, o = {}) => ({ views, dayKey: o.day ?? TODAY, todayKey: TODAY, follows: new Set(o.follows ?? []),
  players, now: o.now ?? NOW, tz: TZ, statusFeed: o.statusFeed ?? sfeed(), staleMinutes: 15, tiersEnabled: o.tiers ?? true });
const view = (mf, sf) => M.mergeFeeds(mf, sf);

test("mergeFeeds: status wins, including an explicit null tier; baseline otherwise", () => {
  const mf = feed([match(1, { tier: "worth_a_look" }), match(2, { tier: "worth_a_look" })]);
  const sf = sfeed({ "1": { status: "live", tier: null, tier_at_kickoff: null, lineups_confirmed: true, participation: { 11: "starts" } } });
  const [a, b] = view(mf, sf);
  assert.equal(a.status, "live"); assert.equal(a.tier, null); assert.equal(a.lineupsConfirmed, true);
  assert.equal(a.participation["11"], "starts");
  assert.equal(b.status, "scheduled"); assert.equal(b.tier, "worth_a_look"); assert.equal(b.lineupsConfirmed, false);
});

test("effectiveTier: frozen value once started; none for postponed or when tiers are off", () => {
  const base = { tier: "worth_a_look", tierAtKickoff: "must_watch" };
  assert.equal(M.effectiveTier({ ...base, status: "scheduled" }, true), "worth_a_look");
  assert.equal(M.effectiveTier({ ...base, status: "live" }, true), "must_watch");
  assert.equal(M.effectiveTier({ ...base, status: "full_time" }, true), "must_watch");
  assert.equal(M.effectiveTier({ tier: "must_watch", tierAtKickoff: null, status: "live" }, true), "must_watch"); // first 30 min
  assert.equal(M.effectiveTier({ ...base, status: "postponed" }, true), null);
  assert.equal(M.effectiveTier({ ...base, status: "scheduled" }, false), null);
});

test("freshness: stale only while a match can be changing", () => {
  const live = { status: "live", kickoffUtc: iso(-1) };
  assert.equal(M.freshness(live, sfeed({}, { at: iso(0, -14 * 60) }), NOW, 15).stale, false);
  assert.equal(M.freshness(live, sfeed({}, { at: iso(0, -16 * 60) }), NOW, 15).stale, true);
  const farFuture = { status: "scheduled", kickoffUtc: iso(30) };
  assert.equal(M.freshness(farFuture, sfeed({}, { at: iso(-5) }), NOW, 15).stale, false);
  const soon = { status: "scheduled", kickoffUtc: iso(1) };               // inside the 90 min lineup window
  assert.equal(M.freshness(soon, sfeed({}, { at: iso(0, -40 * 60) }), NOW, 15).stale, true);
  assert.equal(M.freshness(soon, null, NOW, 15).stale, true);
  assert.equal(M.freshness({ status: "full_time", kickoffUtc: iso(-4) }, null, NOW, 15).stale, false);
});

test("pinning rules", () => {
  const mk = (part, status = "scheduled", pool = [pm(11), pm(12)]) =>
    view(feed([match(1, { pool })]), sfeed({ "1": { status, lineups_confirmed: true, participation: part } }))[0];
  const f = new Set(["11"]);
  assert.equal(M.isPinned(mk({}), f), true);                              // unconfirmed
  assert.equal(M.isPinned(mk({ 11: "starts" }), f), true);
  assert.equal(M.isPinned(mk({ 11: "bench" }), f), true);
  assert.equal(M.isPinned(mk({ 11: "not_in_squad" }), f), false);
  assert.equal(M.isMovedFromPins(mk({ 11: "not_in_squad" }), f), true);
  assert.equal(M.isPinned(mk({ 11: "not_in_squad", 12: "starts" }), new Set(["11", "12"])), true);
  assert.equal(M.isMovedFromPins(mk({ 11: "not_in_squad", 12: "starts" }), new Set(["11", "12"])), false);
  assert.equal(M.isPinned(mk({ 11: "starts" }, "full_time"), f), false);
  assert.equal(M.isPinned(mk({}, "postponed"), f), false);
  assert.equal(M.isPinned(mk({}), new Set()), false);                     // no follows: nothing pinned
});

test("band order and one appearance per match", () => {
  const mf = feed([
    match(1, { ko: iso(1), tier: "worth_a_look", pool: [pm(12)] }),
    match(2, { ko: iso(2), tier: "must_watch", pool: [pm(11)] }),
    match(3, { ko: iso(-1), status: "live", tak: "must_watch", tier: "must_watch", pool: [pm(13)] }),
    match(4, { ko: iso(-4), status: "full_time", pool: [pm(14)] }),
    match(5, { ko: iso(4), pool: [pm(15)] }),
    match(6, { ko: iso(5), status: "postponed", pool: [pm(14)] }),
    match(7, { ko: iso(6), tier: "worth_a_look", pool: [pm(12)] }),
  ]);
  const sf = sfeed({
    "3": { status: "live", tier: "must_watch", tier_at_kickoff: "must_watch", lineups_confirmed: true, participation: {} },
    "4": { status: "full_time", tier: null, tier_at_kickoff: null, lineups_confirmed: true, participation: {} },
  });
  const d = M.buildDay(ctx(view(mf, sf), { statusFeed: sf, follows: ["12"] }));
  const ids = (a) => a.map((c) => c.id);
  assert.deepEqual(ids(d.pinned), ["1", "7"]);          // followed player 12, kickoff order
  assert.deepEqual(ids(d.live), ["3"]);
  assert.deepEqual(ids(d.must), ["2"]);
  assert.deepEqual(ids(d.rest), ["5"]);
  assert.deepEqual(ids(d.disrupted), ["6"]);
  assert.deepEqual(ids(d.earlier), ["4"]);
  const all = [...d.pinned, ...d.live, ...d.must, ...d.rest, ...d.disrupted, ...d.earlier].map((c) => c.id);
  assert.equal(new Set(all).size, all.length); assert.equal(all.length, 7);
});

test("no follows: nothing pinned, Must-watch band then kickoff order", () => {
  const mf = feed([match(1, { ko: iso(1), tier: "worth_a_look" }), match(2, { ko: iso(2), tier: "must_watch" }), match(3, { ko: iso(3) })]);
  const d = M.buildDay(ctx(view(mf, sfeed())));
  assert.equal(d.pinned.length, 0);
  assert.deepEqual(d.must.map((c) => c.id), ["2"]);
  assert.deepEqual(d.rest.map((c) => c.id), ["1", "3"]);
});

test("tiers off: no badges, no Must-watch band, no empty copy", () => {
  const mf = feed([match(1, { tier: "must_watch" }), match(2, { tier: "worth_a_look" })], { tiers: false });
  const d = M.buildDay(ctx(view(mf, sfeed()), { tiers: false }));
  assert.equal(d.must.length, 0); assert.equal(d.noMustCopy, null);
  assert.ok(d.rest.every((c) => c.tier === null && c.pips === 0));
});

test("empty Must-watch copy: only with a Worth a look and nothing above it", () => {
  const worthOnly = feed([match(1, { tier: "worth_a_look" })]);
  assert.match(M.buildDay(ctx(view(worthOnly, sfeed()))).noMustCopy, /^No Must-watch matches today\./);
  assert.match(M.buildDay(ctx(view(worthOnly, sfeed()), { day: "2026-10-09", }) ).noMustCopy, /Worth a look below/);
  const none = feed([match(1, { tier: null })]);
  assert.equal(M.buildDay(ctx(view(none, sfeed()))).noMustCopy, null);
  const hasMust = feed([match(1, { tier: "must_watch" }), match(2, { tier: "worth_a_look" })]);
  assert.equal(M.buildDay(ctx(view(hasMust, sfeed()))).noMustCopy, null);
  const emptyDay = M.buildDay(ctx(view(worthOnly, sfeed()), { day: "2026-10-10" }));
  assert.equal(emptyDay.total, 0); assert.equal(emptyDay.noMustCopy, null);
});

test("a live Must-watch match in its own band still counts as 'has Must-watch'", () => {
  const mf = feed([match(1, { ko: iso(-1), status: "live", tak: "must_watch" }), match(2, { tier: "worth_a_look" })]);
  const sf = sfeed({ "1": { status: "live", tier: "must_watch", tier_at_kickoff: "must_watch", lineups_confirmed: true, participation: {} } });
  assert.equal(M.buildDay(ctx(view(mf, sf), { statusFeed: sf })).noMustCopy, null);
});

test("a stale 'live' match is not put in Live now and does not claim LIVE", () => {
  const mf = feed([match(1, { ko: iso(-1), status: "live" })]);
  const sf = sfeed({ "1": { status: "live", tier: null, tier_at_kickoff: null, lineups_confirmed: true, participation: {} } },
                   { at: iso(0, -40 * 60) });
  const d = M.buildDay(ctx(view(mf, sf), { statusFeed: sf }));
  assert.equal(d.live.length, 0);
  assert.equal(d.rest[0].header.kind, "stale");
  assert.match(d.rest[0].header.text, /^Status as of /);
});

test("header copy across the lifecycle", () => {
  const h = (m, s, o = {}) => M.buildDay(ctx(view(feed([m]), s), { statusFeed: s, ...o }));
  const first = (d) => [...d.pinned, ...d.live, ...d.must, ...d.rest, ...d.earlier, ...d.disrupted][0].header;
  assert.equal(first(h(match(1, { ko: iso(5) }), sfeed())).kind, "pre");
  assert.equal(first(h(match(1, { ko: iso(0, 30 * 60) }), sfeed({}, { at: iso(0, -2 * 60) }))).kind, "waiting");
  assert.match(first(h(match(1, { ko: iso(0, 30 * 60) }), sfeed({}, { at: iso(0, -2 * 60) }))).text, /^Lineup not posted yet · checked /);
  const conf = sfeed({ "1": { status: "scheduled", tier: null, tier_at_kickoff: null, lineups_confirmed: true, participation: {} } });
  assert.equal(first(h(match(1, { ko: iso(1) }), conf)).text, "Lineups confirmed ✓");
  const live = sfeed({ "1": { status: "live", tier: null, tier_at_kickoff: null, lineups_confirmed: true, participation: {} } }, { at: iso(0, -120) });
  const lh = first(h(match(1, { ko: iso(-1), status: "live" }), live));
  assert.equal(lh.kind, "live"); assert.equal(lh.sub, "Updated 2 min ago");
  assert.equal(first(h(match(1, { ko: iso(-4), status: "full_time" }), sfeed({ "1": { status: "full_time", lineups_confirmed: true, participation: {} } }))).text, "Full time");
  assert.equal(first(h(match(1, { status: "postponed" }), sfeed())).text, "Postponed");
  assert.equal(first(h(match(1, { status: "cancelled" }), sfeed())).text, "Cancelled");
});

test("chips: followed first, then relevance; unconfirmed names carry no status word", () => {
  const mf = feed([match(1, { pool: [pm(14), pm(11), pm(13), pm(12), pm(15)] })]);
  const d = M.buildDay(ctx(view(mf, sfeed()), { follows: ["15"] }));
  const c = d.pinned[0];
  assert.deepEqual(c.chips.map((x) => x.playerId), ["15", "11", "12", "13", "14"]);
  assert.ok(c.chips.every((x) => x.word === null));
  assert.equal(c.collapsedCount, 3);
  assert.deepEqual(c.followingNames, ["B. Able"]);
});

test("confirmed participation words", () => {
  const mf = feed([match(1, { pool: [pm(11), pm(12), pm(13)] })]);
  const sf = sfeed({ "1": { status: "scheduled", tier: null, tier_at_kickoff: null, lineups_confirmed: true,
    participation: { 11: "starts", 12: "bench", 13: "not_in_squad" } } });
  const c = M.buildDay(ctx(view(mf, sf), { statusFeed: sf })).rest[0];
  assert.deepEqual(c.chips.map((x) => x.word), ["Starts", "Bench", "Not in squad"]);
});

test("national pool_estimate: at most 8 printable, note shown", () => {
  const pool = Array.from({ length: 40 }, (_, i) => pm(100 + i));
  const c = M.buildDay(ctx(view(feed([match(1, { kind: "national_senior", basis: "pool_estimate", pool })]), sfeed()))).rest[0];
  assert.equal(c.chips.length, 8); assert.equal(c.collapsedCount, 3);
  assert.equal(c.note, "Call-up not announced yet");
  const c2 = M.buildDay(ctx(view(feed([match(1, { pool: pool.slice(0, 12) })]), sfeed()))).rest[0];
  assert.equal(c2.chips.length, 12); assert.equal(c2.note, null);
});

test("Not playing today: reasons", () => {
  const mf = feed([
    match(1, { ko: iso(1), pool: [pm(12)] }),                       // 12 is out
    match(2, { ko: iso(2), pool: [pm(14)] }),                       // 14 postponed
    match(3, { ko: iso(-4), status: "full_time", pool: [pm(15)] }), // 15 already played
  ]);
  mf.matches[1].status = "postponed";
  const sf = sfeed({
    "1": { status: "scheduled", lineups_confirmed: true, participation: { 12: "not_in_squad" } },
    "3": { status: "full_time", lineups_confirmed: true, participation: { 15: "starts" } },
  });
  const d = M.buildDay(ctx(view(mf, sf), { statusFeed: sf, follows: ["11", "12", "14", "15"] }));
  const by = Object.fromEntries(d.notPlaying.map((n) => [n.playerId, n.reason]));
  assert.equal(by["11"], "no match listed");
  assert.equal(by["12"], "not in squad");
  assert.equal(by["14"], "match postponed or cancelled");
  assert.equal(by["15"], undefined);                                  // played: lives in Earlier, not here
  assert.equal(d.pinned.length, 0);
  const moved = [...d.rest].find((c) => c.id === "1");
  assert.equal(moved.movedFromPins, true);
});

test("Still live from yesterday: only on today, only when fresh", () => {
  const mf = feed([match(9, { ko: iso(-20), status: "scheduled" })]);   // Thu 5 PM ET: yesterday's slate
  const sf = sfeed({ "9": { status: "live", tier: null, tier_at_kickoff: null, lineups_confirmed: true, participation: {}, carried_over: true } });
  const v = view(mf, sf);
  assert.equal(M.buildDay(ctx(v, { statusFeed: sf })).stillLive.length, 1);
  assert.equal(M.buildDay(ctx(v, { statusFeed: sf, day: "2026-10-10" })).stillLive.length, 0);
  const stale = sfeed(sf.matches, { at: iso(0, -60 * 60) });
  assert.equal(M.buildDay(ctx(view(mf, stale), { statusFeed: stale })).stillLive.length, 0);
  assert.equal(M.buildDay(ctx(v, { statusFeed: sf })).rest.length + M.buildDay(ctx(v, { statusFeed: sf })).live.length, 0); // not in today's list
});

test("accessible name matches the spec's example", () => {
  const mf = feed([match(1, { tier: "must_watch", pool: [pm(11), pm(12)] })]);
  const sf = sfeed({ "1": { status: "scheduled", tier: "must_watch", tier_at_kickoff: null, lineups_confirmed: true,
    participation: { 11: "starts", 12: "starts" } } });
  const c = M.buildDay(ctx(view(mf, sf), { statusFeed: sf, follows: ["11", "12"] })).pinned[0];
  assert.equal(c.ariaLabel, "Chelsea vs Fulham, Must-watch, lineups confirmed, 2 of your players starting");
});

test("day facts, strip and next-match jump", () => {
  const mf = feed([match(1, { tier: "must_watch" }), match(2, { ko: iso(26) }), match(3, { ko: iso(80), status: "cancelled" }), match(4, { ko: iso(0, 3 * 86400) })]);
  const v = view(mf, sfeed());
  const f = M.dayFacts(v, ctx(v, { follows: ["11"] }));
  assert.equal(f.get(TODAY).total, 1); assert.equal(f.get(TODAY).pins, 1); assert.equal(f.get(TODAY).must, true);
  const days = M.stripDays(TODAY);
  assert.equal(days.length, 18); assert.equal(days[0], "2026-10-06"); assert.equal(days[3], TODAY); assert.equal(days[17], "2026-10-23");
  assert.equal(M.nextMatchDay(v, TODAY), "2026-10-10");
  assert.equal(M.nextMatchDay(v, "2026-10-12"), null);                 // cancelled match does not count
  assert.equal(M.inWindow(mf, "2026-10-08"), false); assert.equal(M.inWindow(mf, TODAY), true); assert.equal(M.inWindow({}, "2020-01-01"), true);
});

test("nextMatchFor and followedChanges", () => {
  const mf = feed([match(1, { ko: iso(30), pool: [pm(11)] }), match(2, { ko: iso(200), pool: [pm(11)] }), match(3, { ko: iso(5), pool: [pm(12)] })]);
  const v = view(mf, sfeed());
  assert.equal(M.nextMatchFor(v, "11", NOW, TZ).id, "1");
  assert.equal(M.nextMatchFor(v, "13", NOW, TZ), null);
  const sf2 = sfeed({ "1": { status: "scheduled", lineups_confirmed: true, participation: { 11: "starts" } } });
  const v2 = view(mf, sf2);
  assert.deepEqual(M.followedChanges(v, v2, new Set(["11"]), players), ["C. Pulisic is starting in Chelsea vs Fulham"]);
  assert.deepEqual(M.followedChanges(v, v2, new Set(["12"]), players), []);
  assert.deepEqual(M.followedChanges(v2, v2, new Set(["11"]), players), []);
});
