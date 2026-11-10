// strip.js — the day strip (spec §7.1): 3 days back to 14 ahead, opens on today's
// ET date, a Today button when away, a date picker for anything beyond.

import { h } from "./dom.js";
import { weekdayShort, dayOfMonth, monthDay, monthDayYear, dayHeading } from "../time.js";
import { CALENDAR } from "../copy.js";

/**
 * @param o { days, selected, today, facts:Map, inWindow(key):bool, inSchedule(key):bool, onSelect(key), onToday(), onOpenCalendar() }
 */
export function renderStrip(o) {
  const tabs = o.days.map((key) => {
    const f = o.facts.get(key) || { total: 0, pins: 0, must: false, live: false };
    const covered = o.inWindow(key);
    const schedOnly = !covered && !!(o.inSchedule && o.inSchedule(key));
    const isToday = key === o.today;
    const bits = [];
    if (f.live && isToday) bits.push(h("span", { class: "t-live" }, h("span", { class: "live-dot", "aria-hidden": "true" }), "LIVE"));
    if (f.pins) bits.push(h("span", { class: "t-pins", "aria-label": `${f.pins} ${f.pins === 1 ? "match" : "matches"} with your players` },
      h("span", { "aria-hidden": "true" }, `⌖${f.pins}`)));
    if (f.must) bits.push(h("span", { class: "t-must", role: "img", "aria-label": "Has a Must-watch match" }));
    const aria = `${dayHeading(key)}${isToday ? ", today" : ""}${covered ? `, ${f.total} ${f.total === 1 ? "match" : "matches"}` : schedOnly ? ", schedule only" : ", not published"}`;
    return h("button", {
      type: "button", "aria-pressed": key === o.selected ? "true" : "false",
      "aria-current": isToday ? "date" : null, tabindex: key === o.selected ? "0" : "-1", "aria-label": aria,
      class: `tile${key === o.selected ? " is-selected" : ""}${!covered ? (schedOnly ? " is-sched" : " is-na") : f.total === 0 ? " is-quiet" : ""}${isToday ? " is-today" : ""}`,
      dataset: { day: key }, onclick: () => o.onSelect(key),
      onkeydown: (e) => {
        const i = o.days.indexOf(key);
        const j = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? o.days.length - 1 : null;
        if (j === null || j < 0 || j >= o.days.length) return;
        e.preventDefault();
        o.onSelect(o.days[j], { focus: true });
      },
    },
      h("span", { class: "t-dow" }, isToday ? "Today" : weekdayShort(key)),
      h("span", { class: "t-num" }, dayOfMonth(key)),
      h("span", { class: "t-mon" }, dayOfMonth(key) === 1 || key === o.days[0] ? monthDay(key).split(" ")[0] : " "),
      h("span", { class: "t-marks" }, bits.length ? bits : " "));
  });

  const calBtn = h("button", { type: "button", class: "cal-open", "aria-haspopup": "dialog", "aria-label": `${CALENDAR.open}, ${monthDayYear(o.selected)} selected`,
    onclick: o.onOpenCalendar }, h("span", null, monthDayYear(o.selected)), h("span", { "aria-hidden": "true" }, " ▾"));

  return h("div", { class: "strip-wrap" },
    h("div", { class: "strip", role: "toolbar", "aria-label": "Choose a day", "aria-orientation": "horizontal" }, tabs),
    h("div", { class: "strip-tools" },
      o.selected !== o.today ? h("button", { type: "button", class: "btn-link", onclick: o.onToday }, "Today") : null,
      calBtn));
}
