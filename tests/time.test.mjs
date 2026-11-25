import test from "node:test";
import assert from "node:assert/strict";
import * as T from "../js/time.js";

test("etDateKey: late-evening UTC is still the previous ET date", () => {
  assert.equal(T.etDateKey("2026-10-10T01:30:00Z"), "2026-10-09");
  assert.equal(T.etDateKey("2026-10-10T05:00:00Z"), "2026-10-10");
  assert.equal(T.etDateKey("2026-10-10T03:59:59Z"), "2026-10-09"); // 11:59:59 PM EDT
  assert.equal(T.etDateKey("2026-10-10T04:00:00Z"), "2026-10-10"); // midnight EDT
});

test("etDateKey follows the DST switch without hardcoded offsets", () => {
  // US fall back is Nov 1 2026: midnight ET moves from 04:00Z to 05:00Z.
  assert.equal(T.etDateKey("2026-11-02T04:30:00Z"), "2026-11-01");
  assert.equal(T.etDateKey("2026-11-02T05:00:00Z"), "2026-11-02");
});

test("addDays / daysBetween across month and DST boundaries", () => {
  assert.equal(T.addDays("2026-10-30", 3), "2026-11-02");
  assert.equal(T.addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(T.addDays("2026-10-31", 2), "2026-11-02");
  assert.equal(T.daysBetween("2026-10-09", "2026-10-23"), 14);
  assert.equal(T.daysBetween("2026-11-02", "2026-10-30"), -3);
});

test("labels", () => {
  assert.equal(T.weekdayShort("2026-10-09"), "Fri");
  assert.equal(T.dayHeading("2026-10-09"), "Fri, Oct 9");
  assert.equal(T.dayOfMonth("2026-10-09"), 9);
});

// The three worked examples in spec §7.2 (Oct 2026: EDT, PDT and BST are all in effect).
test("§7.2 example 1: PT viewer, no flag", () => {
  const k = T.kickoffDisplay("2026-10-10T01:30:00Z", "America/Los_Angeles");
  assert.equal(k.differs, false);
  assert.equal(k.text, "6:30 PM PT");
  assert.equal(T.etDateKey("2026-10-10T01:30:00Z"), "2026-10-09"); // Fri slate
});

test("§7.2 example 2: PT viewer, local Fri but Sat slate", () => {
  const k = T.kickoffDisplay("2026-10-10T05:00:00Z", "America/Los_Angeles");
  assert.equal(k.differs, true);
  assert.equal(k.text, "Fri 10:00 PM PT");
  assert.equal(k.slateTag, "Sat slate");
});

test("§7.2 example 3: London viewer, local Sat but Fri slate", () => {
  const k = T.kickoffDisplay("2026-10-10T00:30:00Z", "Europe/London");
  assert.equal(k.differs, true);
  assert.equal(k.text, "Sat 1:30 AM BST");
  assert.equal(k.slateTag, "Fri slate");
});

test("ET viewer never sees a flag", () => {
  for (const iso of ["2026-10-10T01:30:00Z", "2026-10-10T05:00:00Z", "2026-10-10T23:59:00Z"]) {
    const k = T.kickoffDisplay(iso, "America/New_York");
    assert.equal(k.differs, false);
    assert.match(k.text, /ET$/);
  }
});

test("zone abbreviations: US generic, elsewhere platform short name", () => {
  const summer = new Date("2026-07-15T12:00:00Z"), winter = new Date("2026-01-15T12:00:00Z");
  assert.equal(T.zoneAbbr(summer, "America/Los_Angeles"), "PT");
  assert.equal(T.zoneAbbr(winter, "America/Los_Angeles"), "PT");
  assert.equal(T.zoneAbbr(summer, "America/Chicago"), "CT");
  assert.equal(T.zoneAbbr(winter, "America/Denver"), "MT");
  assert.equal(T.zoneAbbr(summer, "America/New_York"), "ET");
  assert.equal(T.zoneAbbr(summer, "Europe/London"), "BST");
});

test("isEtZone", () => {
  assert.equal(T.isEtZone("America/New_York"), true);
  assert.equal(T.isEtZone("America/Detroit"), true);
  assert.equal(T.isEtZone("America/Chicago"), false);
  assert.equal(T.isEtZone("Europe/London"), false);
  assert.equal(T.isEtZone("America/Los_Angeles"), false);
});

test("dayHeader adds the zone note only for non-ET viewers", () => {
  const now = new Date("2026-10-09T18:00:00Z");
  assert.deepEqual(T.dayHeader("2026-10-09", "America/New_York", now), { title: "Fri, Oct 9 · ET slate", zoneNote: null });
  assert.equal(T.dayHeader("2026-10-09", "America/Los_Angeles", now).zoneNote, "Times in PT");
});

test("relativeMinutes / monthsBetween", () => {
  const now = new Date("2026-10-09T18:00:00Z");
  assert.equal(T.relativeMinutes("2026-10-09T17:59:40Z", now), "just now");
  assert.equal(T.relativeMinutes("2026-10-09T17:58:00Z", now), "2 min ago");
  assert.equal(T.relativeMinutes("2026-10-09T15:00:00Z", now), "3 hours ago");
  assert.equal(T.monthsBetween("2025-09-09", "2026-10-09"), 13);
  assert.equal(T.monthsBetween("2025-09-10", "2026-10-09"), 12);
});
