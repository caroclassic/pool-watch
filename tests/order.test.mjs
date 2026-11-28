import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../js/model.js";
import { indexPlayers } from "../js/players-model.js";

// Cards at the same kickoff are ordered by the level the card shows (decided 2026-11-28): a live match that rises to
// Must-watch moves ahead of a Worth a look match that kicked off with it. Kickoff time still leads; equal levels keep
// the feed's order (matches.json position: kickoff, then highest match score first).

const TZ = "America/New_York";
const NOW = new Date("2026-11-28T20:10:00Z");
const TODAY = "2026-11-28";
const ago = (min) => new Date(+NOW - min * 60000).toISOString();
const players = indexPlayers({ players: [11, 12, 13, 14].map((id) => ({ playerId: String(id), short_name: `P${id}` })) });

// Feed order: A, B, C kick off together (A has the highest pre-match score); E kicked off earlier.
const KICK = ago(40), EARLY = ago(70);
const MATCHES = [
  { id: "E", kick: EARLY, tier: null,          pid: 14 },
  { id: "A", kick: KICK,  tier: "worth_a_look", pid: 11 },
  { id: "B", kick: KICK,  tier: "worth_a_look", pid: 12 },
  { id: "C", kick: KICK,  tier: null,          pid: 13 },
];
const mf = () => ({ schema_version: 1, window: { start: TODAY, end: "2026-12-12" }, tier_thresholds: { enabled: true },
  matches: MATCHES.map((m) => ({ matchId: m.id, kickoff_utc: m.kick, competition: "Serie A", home: `H${m.id}`, away: `A${m.id}`,
    fixture_kind: "club", status: "scheduled", tier: m.tier, tier_at_kickoff: null, players_basis: null, broadcast: null,
    pool_players: [{ playerId: String(m.pid), side: "home" }] })) });
// status.json: every match in `o.status` (default live), with live tiers or peaks from `o.live` / `o.peak`.
const sf = (o = {}) => ({ schema_version: 1, updated_at: o.at ?? ago(1), active: true, matches: Object.fromEntries(MATCHES.map((m) => [m.id, {
  status: o.status ?? "live", status_updated_at: null, lineups_confirmed: true, tier: m.tier, tier_at_kickoff: m.tier,
  participation: { [m.pid]: "starts" }, live_states: {},
  ...(o.live && m.id in o.live ? { live_tier: o.live[m.id] } : {}),
  ...(o.peak && m.id in o.peak ? { tier_peak: o.peak[m.id] } : {}) }])) });
const day = (status, o = {}) => M.buildDay({ views: M.mergeFeeds(mf(), status), dayKey: o.day ?? TODAY, todayKey: TODAY,
  follows: new Set(o.follows ?? []), players, now: NOW, tz: TZ, statusFeed: status, staleMinutes: 15, tiersEnabled: true });
const ids = (cards) => cards.map((c) => c.id);

test("Live now: a match that rises to Must-watch moves ahead of the others that kicked off with it", () => {
  assert.deepEqual(ids(day(sf()).live), ["E", "A", "B", "C"]);                               // nothing changed: the feed's order
  assert.deepEqual(ids(day(sf({ live: { C: "must_watch" } })).live), ["E", "C", "A", "B"]);
  // A lost its level: now unbadged like C, so A and C keep the feed's order behind B
  assert.deepEqual(ids(day(sf({ live: { B: "must_watch", A: null } })).live), ["E", "B", "A", "C"]);
  assert.deepEqual(ids(day(sf({ live: { A: null } })).live), ["E", "B", "A", "C"]);            // B Worth a look, A and C none
});

test("kickoff time still leads: an earlier match stays first whatever the levels", () => {
  const d = day(sf({ live: { A: "must_watch", B: "must_watch", C: "must_watch" } }));
  assert.deepEqual(ids(d.live), ["E", "A", "B", "C"]);
});

test("equal levels keep the feed's order", () => {
  assert.deepEqual(ids(day(sf({ live: { B: "must_watch", C: "must_watch" } })).live), ["E", "B", "C", "A"]);
});

test("a stale status feed shows the kickoff levels, and they order the cards", () => {
  const d = day(sf({ at: ago(20), live: { C: "must_watch" } }));
  // stale: the matches are not shown as live, so they sit in the bands by kickoff level; C's live tier is not used
  assert.deepEqual(ids(d.worth), ["A", "B"]);
  assert.deepEqual(ids(d.rest), ["E", "C"]);
});

test("Earlier: a finished match that peaked at Must-watch goes ahead of one that did not", () => {
  const d = day(sf({ status: "full_time", peak: { B: "must_watch" } }));
  assert.deepEqual(ids(d.earlier), ["E", "B", "A", "C"]);
});

test("Your players: the same rule among pinned matches", () => {
  const d = day(sf({ live: { B: "must_watch" } }), { follows: ["11", "12"] });
  assert.deepEqual(ids(d.pinned), ["B", "A"]);
});

test("the comparator: kickoff first, then the higher shown level", () => {
  const c = (id, kickoffUtc, tier) => ({ id, kickoffUtc, tier });
  const got = [c("x", KICK, null), c("y", KICK, "worth_a_look"), c("z", EARLY, null), c("w", KICK, "must_watch")].sort(M.byShownLevel);
  assert.deepEqual(ids(got), ["z", "w", "y", "x"]);
});
