// calendar.js — the month calendar, opened from the strip's date button. It replaces the browser's own date
// input (whose popup cannot show anything of ours). A month grid with a mark on every day a pool club plays:
//   * days the feed covers (matches.json): a count, plus the Must-watch dot where there is one;
//   * days beyond it (schedule.json): a ring and a count, "schedule only".
// Below the grid: the next matches for the players you follow. Built on the shared <dialog> sheet, so focus
// is trapped, Esc closes it and the back gesture closes it. Keyboard in the grid: arrows move by day and week,
// Home / End to the week's ends, PageUp / PageDown by month. Never colour alone: marks are shapes plus a count.

import { h } from "./dom.js";
import { openSheet } from "./sheets.js";
import { CALENDAR } from "../copy.js";
import { dayHeading, dayOfMonth, etDateKey, kickoffDisplay, monthTitle } from "../time.js";
import { monthWeeks, shiftMonth, moveFocus, nextForFollows, timeFirm } from "../model.js";
import { TIME_FIRM_DAYS } from "../config.js";
import { chipName } from "../players-model.js";

const WEEKDAYS = [["Sun", "Sunday"], ["Mon", "Monday"], ["Tue", "Tuesday"], ["Wed", "Wednesday"], ["Thu", "Thursday"], ["Fri", "Friday"], ["Sat", "Saturday"]];

/** "7:00 PM ET" for a kickoff inside the trusted range, otherwise the plain "time to be confirmed". */
export function scheduleTime(row, now, tz) {
  return timeFirm(row.kickoff_utc, now, TIME_FIRM_DAYS) ? kickoffDisplay(row.kickoff_utc, tz).text : CALENDAR.tbc;
}

/**
 * @param o { selected, todayKey, facts:Map, inWindow(key), scheduleIdx:Map, schedule, bounds:{min,max},
 *            follows:Set, players:Map, now:Date, tz, onPick(key), from() }
 */
export function calendarSheet(o) {
  const horizonEnd = (o.schedule && o.schedule.window && o.schedule.window.end) || null;
  const lo = `${o.bounds.min}-01`;
  const hi = `${shiftMonth(o.bounds.max, 1)}-01`;                       // first day after the last month
  let month = o.selected.slice(0, 7);
  if (month < o.bounds.min) month = o.bounds.min;
  if (month > o.bounds.max) month = o.bounds.max;
  let focusKey = o.selected.startsWith(month) ? o.selected : o.todayKey.startsWith(month) ? o.todayKey : `${month}-01`;
  let sheet = null;

  const cellInfo = (key) => {
    const f = o.facts.get(key);
    const covered = o.inWindow(key);
    const sched = o.scheduleIdx.get(key) || [];
    const n = covered ? (f ? f.total : 0) : sched.length;
    return { n, must: covered ? !!(f && f.must) : sched.some((r) => r.fixture_kind === "national_senior"),   // a senior national match is Must-watch by rule
             schedOnly: !covered && sched.length > 0,
             outside: !covered && sched.length === 0 && (!horizonEnd || key > horizonEnd) };
  };

  // Picking a day closes the sheet first and changes the URL hash after the sheet's history step (see closeSheetThen).
  function pick(key) { sheet.closeThen(() => o.onPick(key)); }

  function goTo(key) {
    if (key < lo || key >= hi) return;                                  // outside the months the calendar covers
    focusKey = key;
    month = key.slice(0, 7);
    paint();
    const b = sheet.el.querySelector(`.cal-day[data-day="${key}"]`);
    if (b) b.focus();
  }

  function dayButton(key) {
    const i = cellInfo(key);
    const aria = [dayHeading(key) + (key === o.todayKey ? ", today" : ""),
      i.n ? `${i.n} ${i.n === 1 ? "match" : "matches"}` : i.outside ? "not published" : "no pool matches",
      i.must ? "includes a Must-watch match" : null, i.schedOnly ? "schedule only" : null].filter(Boolean).join(", ");
    const marks = [];
    if (i.must) marks.push(h("span", { class: "t-must", "aria-hidden": "true" }));
    if (i.schedOnly) marks.push(h("span", { class: "cal-ring", "aria-hidden": "true" }));
    if (i.n) marks.push(h("span", { class: "cal-count", "aria-hidden": "true" }, String(i.n)));
    return h("button", {
      type: "button", class: `cal-day${key === o.selected ? " is-selected" : ""}${key === o.todayKey ? " is-today" : ""}${i.outside ? " is-na" : ""}`,
      tabindex: key === focusKey ? "0" : "-1", "aria-label": aria, "aria-pressed": key === o.selected ? "true" : "false",
      "aria-current": key === o.todayKey ? "date" : null, dataset: { day: key }, onclick: () => pick(key),
      onkeydown: (e) => { const to = moveFocus(key, e.key); if (to) { e.preventDefault(); goTo(to); } },
    }, h("span", { class: "cal-num" }, dayOfMonth(key)), h("span", { class: "cal-marks" }, marks.length ? marks : " "));
  }

  function followsBlock() {
    if (!o.follows.size) return null;
    if (!o.schedule) return null;                       // the calendar's own note already says the schedule is unavailable
    const list = nextForFollows(o.schedule, o.follows, o.now, o.players);
    if (!list.length) return null;
    return h("section", { class: "cal-follows", "aria-label": CALENDAR.followsTitle },
      h("h3", { class: "cal-h" }, CALENDAR.followsTitle),
      h("p", { class: "dim small" }, CALENDAR.followsNote),
      h("ul", { class: "cal-list" }, list.map(({ playerId, items }) =>
        h("li", null, h("b", null, chipName(o.players, playerId)),
          h("ul", null, items.map((m) => {
            const key = etDateKey(m.kickoff_utc);
            return h("li", null, h("button", { type: "button", class: "btn-link cal-go", onclick: () => pick(key) },
              `${dayHeading(key)} · ${m.home} v ${m.away} · ${scheduleTime(m, o.now, o.tz)}`));
          }))))));
  }

  function body() {
    const title = monthTitle(month);
    const prevOk = shiftMonth(month, -1) >= o.bounds.min, nextOk = shiftMonth(month, 1) <= o.bounds.max;
    return [
      h("div", { class: "cal" },
        h("div", { class: "cal-nav" },
          h("button", { type: "button", class: "cal-step", "aria-label": CALENDAR.prev, disabled: !prevOk, onclick: () => goTo(`${shiftMonth(month, -1)}-01`) }, "‹"),
          h("h3", { class: "cal-month", id: "cal-month", "aria-live": "polite" }, title),
          h("button", { type: "button", class: "cal-step", "aria-label": CALENDAR.next, disabled: !nextOk, onclick: () => goTo(`${shiftMonth(month, 1)}-01`) }, "›")),
        h("table", { class: "cal-grid", role: "grid", "aria-labelledby": "cal-month" },
          h("thead", null, h("tr", null, WEEKDAYS.map(([s, l]) => h("th", { scope: "col", abbr: l }, s)))),
          h("tbody", null, monthWeeks(month).map((week) =>
            h("tr", null, week.map((key) => h("td", { role: "gridcell" }, key ? dayButton(key) : null)))))),
        h("ul", { class: "cal-legend" },
          h("li", null, h("span", { class: "t-must", "aria-hidden": "true" }), ` ${CALENDAR.legendMust}`),
          h("li", null, h("span", { class: "cal-ring", "aria-hidden": "true" }), ` ${CALENDAR.legendSched}`)),
        h("p", { class: "dim small" }, CALENDAR.timesNote),
        !o.schedule ? h("p", { class: "dim small" }, CALENDAR.noSchedule) : null,
        followsBlock()),
    ];
  }

  function paint() { sheet.replace(...body()); }

  sheet = openSheet(CALENDAR.title, body(), { from: o.from });
  const first = sheet.el.querySelector(`.cal-day[tabindex="0"]`) || sheet.el.querySelector(".cal-day");
  if (first) first.focus();
  return sheet;
}
