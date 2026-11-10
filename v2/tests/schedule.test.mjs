import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../js/model.js";
import { indexPlayers } from "../js/players-model.js";

const NOW = new Date("2026-11-10T15:00:00Z");
const row = (id, ko, pool = ["11"]) => ({ matchId: String(id), kickoff_utc: ko, competition: "Premier League", home: "A", away: "B",
  fixture_kind: "club", pool_players: pool.map((p) => ({ playerId: p, side: "home" })) });
const players = indexPlayers({ players: [{ playerId: "11", short_name: "C. Pulisic", score: 70 }, { playerId: "12", short_name: "G. Reyna", score: 60 },
  { playerId: "13", short_name: "A. Able", score: 60 }] });

test("scheduleIndex groups by the ET day of kickoff, in kickoff order", () => {
  const idx = M.scheduleIndex({ matches: [row(2, "2026-11-22T20:00:00Z"), row(3, "2026-11-23T02:30:00Z"), row(1, "2026-11-22T14:00:00Z")] });
  assert.deepEqual([...idx.keys()], ["2026-11-22"]);                          // 02:30Z on the 23rd is still the 22nd in New York
  assert.deepEqual(idx.get("2026-11-22").map((r) => r.matchId), ["1", "2", "3"]);
  assert.equal(M.scheduleIndex(null).size, 0); assert.equal(M.scheduleIndex({}).size, 0);
});

test("timeFirm trusts a kickoff time only within 30 days", () => {
  assert.equal(M.timeFirm("2026-12-10T15:00:00Z", NOW), true);                // exactly 30 days
  assert.equal(M.timeFirm("2026-12-10T15:00:01Z", NOW), false);
  assert.equal(M.timeFirm("2026-11-11T15:00:00Z", NOW), true);
});

test("monthWeeks lays a month out Sunday-first with null padding", () => {
  const nov = M.monthWeeks("2026-11");                                        // Nov 1, 2026 is a Sunday
  assert.equal(nov.length, 5); assert.ok(nov.every((w) => w.length === 7));
  assert.equal(nov[0][0], "2026-11-01"); assert.equal(nov[4][1], "2026-11-30"); assert.equal(nov[4][2], null);
  const feb = M.monthWeeks("2027-02");                                        // Feb 1, 2027 is a Monday
  assert.equal(feb[0][0], null); assert.equal(feb[0][1], "2027-02-01"); assert.equal(feb.flat().filter(Boolean).length, 28);
});

test("shiftMonth and shiftMonthDay cross years and clamp the day", () => {
  assert.equal(M.shiftMonth("2026-12", 1), "2027-01"); assert.equal(M.shiftMonth("2026-01", -1), "2025-12"); assert.equal(M.shiftMonth("2026-11", 7), "2027-06");
  assert.equal(M.shiftMonthDay("2027-01-31", 1), "2027-02-28"); assert.equal(M.shiftMonthDay("2026-03-31", -1), "2026-02-28");
  assert.equal(M.shiftMonthDay("2026-11-10", 1), "2026-12-10");
});

test("moveFocus follows the grid keyboard pattern", () => {
  const k = "2026-11-10";                                                     // a Tuesday
  assert.equal(M.moveFocus(k, "ArrowLeft"), "2026-11-09"); assert.equal(M.moveFocus(k, "ArrowRight"), "2026-11-11");
  assert.equal(M.moveFocus(k, "ArrowUp"), "2026-11-03"); assert.equal(M.moveFocus(k, "ArrowDown"), "2026-11-17");
  assert.equal(M.moveFocus(k, "Home"), "2026-11-08"); assert.equal(M.moveFocus(k, "End"), "2026-11-14");      // Sunday and Saturday of that week
  assert.equal(M.moveFocus(k, "PageUp"), "2026-10-10"); assert.equal(M.moveFocus(k, "PageDown"), "2026-12-10");
  assert.equal(M.moveFocus(k, "Enter"), null); assert.equal(M.moveFocus("2026-12-31", "ArrowRight"), "2027-01-01");
});

test("calendarBounds runs from the window's month to the schedule's last month", () => {
  const mf = { window: { start: "2026-11-07", end: "2026-11-24" } };
  assert.deepEqual(M.calendarBounds("2026-11-10", mf, { window: { end: "2027-05-31" } }), { min: "2026-11", max: "2027-05" });
  assert.deepEqual(M.calendarBounds("2026-11-10", mf, null), { min: "2026-11", max: "2026-11" });          // no schedule: the feed window only
  assert.deepEqual(M.calendarBounds("2026-11-10", {}, null), { min: "2026-11", max: "2026-11" });
});

test("nextForFollows: each followed player's next matches, best-known players first", () => {
  const schedule = { matches: [row(1, "2026-11-09T12:00:00Z", ["11"]),                       // already played: skipped
    row(2, "2026-11-21T12:00:00Z", ["11", "12"]), row(3, "2026-11-28T12:00:00Z", ["11"]), row(4, "2026-12-05T12:00:00Z", ["11"]),
    row(5, "2026-11-22T12:00:00Z", ["13"])] };
  const r = M.nextForFollows(schedule, new Set(["11", "12", "13", "99"]), NOW, players);
  assert.deepEqual(r.map((x) => x.playerId), ["11", "13", "12"]);                           // score 70, then 60 (Able before Reyna), unknown 99 has no match
  assert.deepEqual(r[0].items.map((m) => m.matchId), ["2", "3"]);                           // two per player by default
  assert.deepEqual(M.nextForFollows(schedule, new Set(), NOW, players), []);
  assert.deepEqual(M.nextForFollows(null, new Set(["11"]), NOW, players), []);
  assert.equal(M.nextForFollows(schedule, new Set(["11", "12", "13"]), NOW, players, { maxPlayers: 2 }).length, 2);
});
