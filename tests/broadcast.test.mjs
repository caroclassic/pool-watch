import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../js/model.js";
import { WATCH } from "../js/copy.js";
import { indexPlayers } from "../js/players-model.js";

// Where to watch (Fixed decision 11): the card names ONE provider and puts the rest behind "+ N more"; no listing
// shows nothing, never "not broadcast". A listing with no primary (senior national matches, for now) shows the
// "Where to watch" link alone, with every provider behind it.

const NOW = new Date("2026-10-09T17:00:00Z");
const players = indexPlayers({ players: [{ playerId: "11", short_name: "C. Pulisic", score: 70 }] });
const card = (broadcast) => {
  const mf = { schema_version: 1, window: { start: "2026-10-09", end: "2026-10-23" }, tier_thresholds: { enabled: true },
    matches: [{ matchId: "1", kickoff_utc: "2026-10-09T20:00:00Z", competition: "Serie A", home: "Atalanta", away: "Napoli",
      fixture_kind: "club", status: "scheduled", tier: null, tier_at_kickoff: null, players_basis: null, broadcast,
      pool_players: [{ playerId: "11", side: "home" }] }] };
  const sf = { schema_version: 1, updated_at: NOW.toISOString(), active: false, matches: {} };
  const views = M.mergeFeeds(mf, sf);
  return M.cardView(views[0], { views, dayKey: "2026-10-09", todayKey: "2026-10-09", follows: new Set(), players, now: NOW,
    tz: "America/New_York", statusFeed: sf, staleMinutes: 15, tiersEnabled: true });
};

test("a primary and other providers: the card names one, and the rest are counted for the link", () => {
  const b = card({ primary: "Paramount+", providers: ["Paramount+", "CBS Sports Network", "Peacock (Español)"] }).broadcast;
  assert.deepEqual(b, { text: null, primary: "Paramount+", providers: ["Paramount+", "CBS Sports Network", "Peacock (Español)"], more: 2 });
  assert.equal(WATCH.more(b.more), "+ 2 more");
});

test("a primary that is the only provider: no link at all", () => {
  const b = card({ primary: "Apple TV", providers: ["Apple TV"] }).broadcast;
  assert.equal(b.primary, "Apple TV");
  assert.equal(b.more, 0);
});

test("a listing with no primary (senior national matches, for now): the Where to watch link alone, every provider behind it", () => {
  const b = card({ primary: null, providers: ["USA Network", "Peacock (Español)"] }).broadcast;
  assert.equal(b.primary, null);
  assert.equal(b.more, 2);
  assert.deepEqual(b.providers, ["USA Network", "Peacock (Español)"]);
  assert.equal(WATCH.link, "Where to watch");
});

test("a match listed only on a Spanish-language feed names it, as the feed spells it", () => {
  const b = card({ primary: "Peacock (Español)", providers: ["Peacock (Español)", "Telemundo"] }).broadcast;
  assert.equal(b.primary, "Peacock (Español)");
  assert.equal(b.more, 1);
});

test("no listing shows nothing: null, a missing key, an empty list, or a shape we do not know", () => {
  for (const x of [null, undefined, "", "   ", { primary: "Peacock", providers: [] }, { primary: "Peacock" }, { providers: "Peacock" }, 7, []]) {
    assert.equal(card(x).broadcast, null, JSON.stringify(x));
  }
});

test("a primary that is not in the match's own list is never named", () => {
  assert.equal(card({ primary: "Peacock", providers: ["USA Network"] }).broadcast.primary, null);
  assert.equal(card({ primary: 7, providers: ["USA Network"] }).broadcast.primary, null);
});

test("junk and repeats in the list are dropped", () => {
  const b = card({ primary: "Peacock", providers: ["Peacock", "", null, 3, "NBC", "Peacock", { name: "x" }] }).broadcast;
  assert.deepEqual(b.providers, ["Peacock", "NBC"]);
  assert.equal(b.more, 1);
});

test("the older feed's plain string is shown as it is, with no link", () => {
  assert.deepEqual(card("Paramount+ / CBS").broadcast, { text: "Paramount+ / CBS", primary: null, providers: [], more: 0 });
});

test("the wording never claims a match is not broadcast", () => {
  const all = [WATCH.title, WATCH.link, WATCH.more(1), WATCH.more(4), WATCH.moreLabel(4, "Arsenal vs Leeds"), WATCH.linkLabel("Arsenal vs Leeds")].join(" | ").toLowerCase();
  assert.ok(!/not (broadcast|televised|available|shown|on tv)|no broadcast|unavailable|unknown/.test(all), all);
  // the spoken name starts with the words on screen and names the match
  assert.equal(WATCH.moreLabel(2, "Arsenal vs Leeds"), "+ 2 more, every place to watch Arsenal vs Leeds");
  assert.equal(WATCH.linkLabel("Arsenal vs Leeds"), "Where to watch Arsenal vs Leeds");
});
