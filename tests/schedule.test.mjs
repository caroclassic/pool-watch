import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../js/model.js";
import { indexPlayers } from "../js/players-model.js";

const NOW = new Date("2026-11-10T15:00:00Z");
const row = (id, ko, pool = ["11"]) => ({ matchId: String(id), kickoff_utc: ko, competition: "Premier League", home: "A", away: "B",
  fixture_kind: "club", pool_players: pool.map((p) => ({ playerId: p, side: "home" })) });
const players = indexPlayers({ players: [{ playerId: "11", short_name: "C. Pulisic", score: 70 }, { playerId: "13", short_name: "A. Able", score: 60 },
  { playerId: "12", short_name: "G. Reyna", score: 60 }] });   // feed order: tied players A-Z

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

test("nextForFollows: one next match per followed player, merged by match, in kickoff order", () => {
  const schedule = { matches: [row(1, "2026-11-09T12:00:00Z", ["11"]),                       // already played: skipped
    row(4, "2026-12-05T12:00:00Z", ["11"]), row(3, "2026-11-28T12:00:00Z", ["11"]),           // out of order on purpose
    row(2, "2026-11-21T12:00:00Z", ["11", "12"]), row(5, "2026-11-22T12:00:00Z", ["13"])] };
  const r = M.nextForFollows(schedule, new Set(["11", "12", "13"]), NOW, players);
  assert.deepEqual(r.matches.map((g) => g.match.matchId), ["2", "5"]);                       // 11's later matches are not listed
  assert.deepEqual(r.matches[0].playerIds, ["11", "12"]);                                    // teammates share one row, most relevant first
  assert.deepEqual(r.none, []);
  const empty = { matches: [], none: [] };
  assert.deepEqual(M.nextForFollows(schedule, new Set(), NOW, players), empty);
  assert.deepEqual(M.nextForFollows(null, new Set(["11"]), NOW, players), empty);
});

test("nextForFollows never drops a followed player: a 7th+ is listed, and nothing scheduled is said", () => {
  const ids = ["21", "22", "23", "24", "25", "26", "27", "28", "29"];
  const many = indexPlayers({ players: ids.map((id) => ({ playerId: id, short_name: `P. ${id}` })) });
  const schedule = { matches: ids.slice(0, 8).map((id, i) => row(30 + i, `2026-11-${12 + i}T12:00:00Z`, [id])) };
  const r = M.nextForFollows(schedule, new Set([...ids, "99"]), NOW, many);
  assert.equal(r.matches.length, 8);                                                         // every player with a match, not six
  assert.deepEqual(r.matches.flatMap((g) => g.playerIds).sort(), ids.slice(0, 8));
  assert.deepEqual(r.none, ["29"]);                                                          // no match: named, not hidden
  // "99" is not in players.json: in neither list (the Players page shows those)
  assert.ok(!r.matches.some((g) => g.playerIds.includes("99")) && !r.none.includes("99"));
});

test("emptyDayInfo: the next match day from the feed, else the schedule, with 'in N days' only in a quiet stretch", () => {
  const v = (id, day, kind = "club", status = "scheduled") => ({ id, etDay: day, fixtureKind: kind, status });
  const sched = M.scheduleIndex({ matches: [row(1, "2027-01-03T15:00:00Z")] });
  // a match two days on, inside the feed: the plain link, no count
  let r = M.emptyDayInfo([v("a", "2026-11-12")], sched, "2026-11-10", "2026-11-10");
  assert.deepEqual([r.next, r.source, r.inDays], ["2026-11-12", "feed", null]);
  // today, nothing left in the feed: the schedule's next day, with the count
  r = M.emptyDayInfo([v("p", "2026-11-12", "club", "postponed")], sched, "2026-11-10", "2026-11-10");
  assert.deepEqual([r.next, r.source, r.inDays], ["2027-01-03", "schedule", 54]);
  // any other day: no count (a count from today would read as counted from that day)
  r = M.emptyDayInfo([], sched, "2026-12-20", "2026-11-10");
  assert.deepEqual([r.next, r.inDays], ["2027-01-03", null]);
  // nothing anywhere
  r = M.emptyDayInfo([], new Map(), "2026-11-10", "2026-11-10");
  assert.deepEqual([r.next, r.source, r.inDays, r.intlBreak], [null, null, null, false]);
});

test("emptyDayInfo: an international break only with a senior national match within 7 days, and when clubs resume", () => {
  const v = (id, day, kind) => ({ id, etDay: day, fixtureKind: kind, status: "scheduled" });
  const views = [v("usa", "2026-11-14", "national_senior"), v("club", "2026-11-21", "club")];
  let r = M.emptyDayInfo(views, new Map(), "2026-11-12", "2026-11-10");
  assert.deepEqual([r.intlBreak, r.clubResume, r.next], [true, "2026-11-21", "2026-11-14"]);
  r = M.emptyDayInfo(views, new Map(), "2026-11-05", "2026-11-05");           // 9 days before the national match
  assert.equal(r.intlBreak, false);
  // a U20 match is not a senior one; and the schedule counts too
  r = M.emptyDayInfo([v("u20", "2026-11-14", "national_youth")], new Map(), "2026-11-12", "2026-11-10");
  assert.equal(r.intlBreak, false);
  const sched = M.scheduleIndex({ matches: [{ ...row(9, "2027-03-26T23:00:00Z"), fixture_kind: "national_senior" }] });
  r = M.emptyDayInfo([], sched, "2027-03-24", "2026-11-10");
  assert.deepEqual([r.intlBreak, r.clubResume], [true, null]);                // break, but no club match known yet
});
