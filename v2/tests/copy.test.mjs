import test from "node:test";
import assert from "node:assert/strict";
import { ABOUT, LEGEND, POPOVERS, INTRO, FEEDBACK_EMAIL, DISCLAIMER } from "../js/copy.js";

// Every public string in one blob, to hold the standing copy rules (CLAUDE.md).
const everything = JSON.stringify([ABOUT, LEGEND, POPOVERS, INTRO, DISCLAIMER]).toLowerCase();

test("public copy never mentions trajectory or the competitor, and implies no alerts or accounts", () => {
  assert.ok(!everything.includes("trajectory"), "trajectory must never appear in public copy");
  assert.ok(!everything.includes("usmnt-tracker"), "the competitor is never named");
  assert.ok(!/\b(notification|notify|alerts?)\b/.test(everything.replace(/no accounts/g, "")), "nothing may imply alerts exist");
});

test("feedback address is well-formed and the disclaimer is in place", () => {
  assert.match(FEEDBACK_EMAIL, /^[a-z]+@statesidexi\.com$/);
  assert.equal(FEEDBACK_EMAIL, "feedback@statesidexi.com");
  assert.match(DISCLAIMER, /not affiliated with U\.S\. Soccer/);
  assert.ok(ABOUT.some((b) => b.p && /unofficial/i.test(b.p)), "About carries the unofficial paragraph");
  assert.ok(ABOUT.some((b) => b.mail), "About carries the feedback paragraph");
  assert.ok(ABOUT.some((b) => b.p && /no accounts/i.test(b.p) && !/analytics/i.test(b.p)), "privacy line present and makes no analytics claim until analytics is installed");
});
