import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../js/model.js";
import { indexPlayers } from "../js/players-model.js";
import { LEGEND } from "../js/copy.js";

// The match phase (status.json `phase`, decided 2026-11-24): "LIVE · 2nd half" next to the LIVE dot, "Full time · on
// penalties" after a long match; and the lineup word "Starts" reads "Started" once the match has kicked off. A phase,
// never a minute: anything this page does not know is ignored and the card reads as before.

const TZ = "America/New_York";
const NOW = new Date("2026-11-21T20:10:00Z");
const TODAY = "2026-11-21";
const ago = (min) => new Date(+NOW - min * 60000).toISOString();
const players = indexPlayers({ players: [11, 12].map((id) => ({ playerId: String(id), short_name: `P${id}` })) });
const mf = (ko = ago(70)) => ({ schema_version: 1, window: { start: TODAY, end: "2026-12-05" }, tier_thresholds: { enabled: true },
  matches: [{ matchId: "1", kickoff_utc: ko, competition: "Serie A", home: "Sassuolo", away: "AC Milan", fixture_kind: "club",
    status: "scheduled", tier: null, tier_at_kickoff: null, players_basis: null, broadcast: null,
    pool_players: [{ playerId: "11", side: "home" }, { playerId: "12", side: "home" }] }] });
const sf = (status, phase, o = {}) => ({ schema_version: 1, updated_at: o.at ?? ago(1), active: true, matches: { "1": {
  status, status_updated_at: null, lineups_confirmed: true, tier: null, tier_at_kickoff: null,
  participation: { 11: "starts", 12: "bench" }, ...(phase === undefined ? {} : { phase }) } } });
const card = (status, o = {}) => {
  const views = M.mergeFeeds(mf(o.ko), status);
  const d = M.buildDay({ views, dayKey: TODAY, todayKey: TODAY, follows: new Set(o.follows ?? []), players, now: NOW, tz: TZ,
    statusFeed: status, staleMinutes: 15, tiersEnabled: true });
  return [...d.pinned, ...d.live, ...d.must, ...d.worth, ...d.rest, ...d.disrupted, ...d.earlier][0];
};
const word = (c, id) => c.chips.find((x) => x.playerId === id).word;

const LIVE = {
  first_half: ["1st half", "first half"], half_time: ["Half-time", "half-time"], second_half: ["2nd half", "second half"],
  extra_time: ["Extra time", "extra time"], extra_time_break: ["ET break", "extra-time break"],
  penalties: ["Penalties", "penalties"], interrupted: ["Interrupted", "interrupted"], suspended: ["Suspended", "suspended"],
};

test("a live match shows its phase right after LIVE, and says it to a screen reader", () => {
  for (const [phase, [shown, spoken]] of Object.entries(LIVE)) {
    const c = card(sf("live", phase));
    assert.equal(c.header.kind, "live", phase);
    assert.equal(c.header.text, `LIVE · ${shown}`, phase);
    assert.match(c.ariaLabel, new RegExp(`, live, ${spoken}(,|$)`), phase);
    assert.match(c.header.sub, /^Updated /, "the freshness line stays");
  }
});

test("no phase, or one this page does not know, is plain LIVE as before", () => {
  for (const phase of [undefined, null, "2H", "67", 67, "after_penalties", { half: 2 }, "__proto__", "toString"]) {
    const c = card(sf("live", phase));
    assert.equal(c.header.text, "LIVE", String(phase));
    assert.match(c.ariaLabel, /, live(,|$)/);
  }
});

test("a stale status feed shows no phase: the card says how old its status is instead", () => {
  const c = card(sf("live", "second_half", { at: ago(30) }));
  assert.equal(c.header.kind, "stale");
  assert.doesNotMatch(c.header.text, /half/i);
});

test("full time says how it ended only when it went beyond 90 minutes; it is final, so freshness does not matter", () => {
  assert.equal(card(sf("full_time", "after_extra_time")).header.text, "Full time · after extra time");
  assert.equal(card(sf("full_time", "after_penalties", { at: ago(300) })).header.text, "Full time · on penalties");
  assert.match(card(sf("full_time", "after_penalties")).ariaLabel, /, full time, on penalties(,|$)/);
  for (const phase of [undefined, "second_half", "half_time", "AET", "penalties"]) {
    const c = card(sf("full_time", phase));
    assert.equal(c.header.text, "Full time", String(phase));
    assert.match(c.ariaLabel, /, full time(,|$)/);
  }
});

test("a match that has not kicked off, or is not being played, never shows a phase", () => {
  assert.doesNotMatch(card(sf("scheduled", "first_half"), { ko: ago(-60) }).header.text, /half/i);
  assert.equal(card(sf("postponed", "first_half")).header.text, "Postponed");
  assert.equal(card(sf("cancelled", "after_penalties")).header.text, "Cancelled");
});

test("Starts reads Started from kickoff, live or finished, with or without live data; Bench is unchanged", () => {
  assert.equal(word(card(sf("scheduled"), { ko: ago(-60) }), "11"), "Starts");
  for (const s of [sf("live", "first_half"), sf("live"), sf("live", "half_time", { at: ago(30) }), sf("full_time", "after_penalties"), sf("full_time")]) {
    const c = card(s);
    assert.equal(word(c, "11"), "Started", c.header.text);
    assert.equal(word(c, "12"), "Bench");
    assert.equal(c.chips.find((x) => x.playerId === "11").participation, "starts", "the lineup fact underneath is unchanged");
  }
  assert.equal(word(card(sf("postponed")), "11"), "Starts");
});

test("the spoken count of your starters is past tense once the match has kicked off", () => {
  assert.match(card(sf("scheduled"), { ko: ago(-60), follows: ["11"] }).ariaLabel, /1 of your players starting$/);
  assert.match(card(sf("live", "second_half"), { follows: ["11"] }).ariaLabel, /1 of your players started$/);
  assert.match(card(sf("full_time"), { follows: ["11"] }).ariaLabel, /1 of your players started$/);
});

test("the Legend shows the phase, both words for a starter, and still promises no minutes or scores", () => {
  const status = LEGEND.find((s) => s.title === "Match status").rows;
  const live = status.find((r) => r[0].includes("LIVE"));
  assert.equal(live[0], "LIVE · 2nd half");   // no ● before it: in the Legend that mark means Starts
  for (const w of ["1st half", "Half-time", "2nd half", "Extra time", "ET break", "Penalties"]) assert.ok(live[1].includes(w), w);
  assert.match(live[1], /don't show scores or minutes/);
  const ft = status.find((r) => r[0] === "Full time");
  assert.match(ft[1], /after extra time/i); assert.match(ft[1], /on penalties/i);
  const players = LEGEND.find((s) => s.title === "Players in a match");
  assert.ok(players.rows.some((r) => r[0] === "● Starts / Started"));
  assert.match(players.note, /don't show minutes or scores/);
});

// ── the card's 64 px time column (brand refresh, 2026-11-27; docs/brand/decisions.md, addendum §1-2) ──────────────
test("time column: a live card shows LIVE and the phase in the column, and its kickoff moves to the metadata line", () => {
  const c = card(sf("live", "second_half"));
  assert.deepEqual(c.column, { kind: "live", word: "LIVE", phase: "2nd half" });
  assert.deepEqual(c.metaTime, { text: "2:00 PM ET", struck: false, extra: null });
  assert.deepEqual(card(sf("live")).column, { kind: "live", word: "LIVE", phase: null });            // no phase known: LIVE alone
});

test("time column: an upcoming card shows the kickoff over the zone and nothing in the metadata line", () => {
  const c = card(sf("scheduled"), { ko: new Date(+NOW + 3 * 3600000).toISOString() });
  assert.deepEqual(c.column, { kind: "time", time: "6:10", zone: "PM ET" });
  assert.equal(c.metaTime, null);
});

test("time column: interrupted or suspended shows the word alone (never LIVE), and the card stays in Live now", () => {
  for (const [phase, w] of [["interrupted", "Interrupted"], ["suspended", "Suspended"]]) {
    const status = sf("live", phase);
    const views = M.mergeFeeds(mf(), status);
    const d = M.buildDay({ views, dayKey: TODAY, todayKey: TODAY, follows: new Set(), players, now: NOW, tz: TZ, statusFeed: status, staleMinutes: 15, tiersEnabled: true });
    assert.equal(d.live.length, 1, phase);
    assert.deepEqual(d.live[0].column, { kind: "halted", word: w }, phase);
  }
});

test("time column: full time, postponed and cancelled put the word in the column and the kickoff in the metadata line", () => {
  assert.deepEqual(card(sf("full_time")).column, { kind: "full_time", word: "Full time" });
  assert.deepEqual(card(sf("full_time", "after_penalties")).metaTime, { text: "2:00 PM ET", struck: false, extra: "On penalties" });
  assert.deepEqual(card(sf("full_time", "after_extra_time")).metaTime.extra, "After extra time");
  for (const st of ["postponed", "cancelled"]) {
    const c = card(sf(st));
    assert.equal(c.column.kind, st); assert.equal(c.metaTime.struck, true, st);
  }
});

test("time column: an unconfirmed state is never shown as live; the column keeps the kickoff time", () => {
  const stale = card(sf("live", "second_half", { at: ago(40) }));        // the status feed is 40 minutes old
  assert.equal(stale.column.kind, "time"); assert.equal(stale.header.kind, "stale");
  const probable = card(sf("scheduled"), { ko: ago(45) });                 // still "scheduled" 45 minutes after kickoff
  assert.equal(probable.column.kind, "time"); assert.equal(probable.header.kind, "unconfirmed");
});
