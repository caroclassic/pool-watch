// time.js — pure date/time helpers. No DOM, no globals except Intl.
//
// Rules (spec §2.3, §7):
//   * Kickoffs are UTC instants. Nothing here ever stores or assumes an offset.
//   * A "day" is a calendar date in America/New_York ("ET date key", YYYY-MM-DD).
//   * Times shown to the viewer use the viewer's own zone.

export const ET = "America/New_York";
const LOCALE = "en-US";

const cache = new Map();
function fmt(tz, opts, tag) {
  const key = `${tag}|${tz}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(LOCALE, { timeZone: tz, ...opts });
    cache.set(key, f);
  }
  return f;
}

export const toDate = (v) => (v instanceof Date ? v : new Date(v));

/** YYYY-MM-DD of an instant in a given IANA zone. */
export function dateKeyIn(date, tz) {
  const parts = fmt(tz, { year: "numeric", month: "2-digit", day: "2-digit" }, "key")
    .formatToParts(toDate(date));
  const g = (t) => parts.find((p) => p.type === t).value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}

export const etDateKey = (v) => dateKeyIn(toDate(v), ET);

/** Add n days to a date key. Calendar arithmetic only, so DST never matters. */
export function addDays(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  const t = (k) => { const [y, m, d] = k.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((t(b) - t(a)) / 86400000);
}

/** A date key as a noon-UTC Date, so formatting it in UTC always lands on that date. */
const keyToNoon = (key) => { const [y, m, d] = key.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); };

export const weekdayShort = (key) => fmt("UTC", { weekday: "short" }, "wd").format(keyToNoon(key));
export const weekdayLong = (key) => fmt("UTC", { weekday: "long" }, "wdl").format(keyToNoon(key));
export const monthDay = (key) => fmt("UTC", { month: "short", day: "numeric" }, "md").format(keyToNoon(key));
export const dayOfMonth = (key) => Number(key.slice(8, 10));

/** "Fri, Oct 9" */
export const dayHeading = (key) => `${weekdayShort(key)}, ${monthDay(key)}`;

/** "6:30 PM" in the given zone. */
export function localTime(date, tz) {
  return fmt(tz, { hour: "numeric", minute: "2-digit" }, "time").format(toDate(date));
}

/** Weekday of an instant in the given zone ("Fri"). */
export function weekdayIn(date, tz) {
  return fmt(tz, { weekday: "short" }, "wdz").format(toDate(date));
}

/**
 * Short zone name. US zones read as the generic "PT"/"ET" (not "PDT"), as the
 * spec's examples do; everywhere else the platform's own short name is used
 * ("BST", "CEST", "GMT+9").
 */
export function zoneAbbr(date, tz) {
  const d = toDate(date);
  const us = fmt(tz, { timeZoneName: "short" }, "zn").formatToParts(d)
    .find((p) => p.type === "timeZoneName")?.value ?? tz;
  const m = /^(E|C|M|P)[SD]T$/.exec(us);
  if (m) return `${m[1]}T`;
  if (/^AK[SD]T$/.test(us)) return "AKT";
  if (/^H[AD]?ST$/.test(us)) return "HT";
  // en-US prints "GMT+1" for London; en-GB has the real names (BST, CEST).
  const key = `zn-gb|${tz}`;
  let f = cache.get(key);
  if (!f) { f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, timeZoneName: "short" }); cache.set(key, f); }
  return f.formatToParts(d).find((p) => p.type === "timeZoneName")?.value ?? us;
}

/** Is this zone on Eastern time year-round (same clock as New York)? */
export function isEtZone(tz) {
  const probes = [Date.UTC(2026, 0, 15, 17, 0), Date.UTC(2026, 6, 15, 17, 0)];
  const clock = (z, t) => fmt(z, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", day: "2-digit" }, "clk").format(new Date(t));
  return probes.every((t) => clock(tz, t) === clock(ET, t));
}

/**
 * How a kickoff reads to a viewer (spec §7.2).
 *   same local and ET date:   "6:30 PM PT"
 *   different:                "Fri 10:00 PM PT" + slateTag "Sat slate"
 */
export function kickoffDisplay(utcIso, viewerTz) {
  const d = toDate(utcIso);
  const time = localTime(d, viewerTz);
  const zone = zoneAbbr(d, viewerTz);
  const localKey = dateKeyIn(d, viewerTz);
  const etKey = etDateKey(d);
  if (localKey === etKey) {
    return { time, zone, differs: false, text: `${time} ${zone}`, weekday: null, slateTag: null };
  }
  const wd = weekdayIn(d, viewerTz);
  return {
    time, zone, differs: true,
    text: `${wd} ${time} ${zone}`,
    weekday: wd,
    slateTag: `${weekdayShort(etKey)} slate`,
  };
}

/** "Fri, Oct 9 · ET slate", plus the viewer's zone when they are not on ET. */
export function dayHeader(key, viewerTz, now = new Date()) {
  return {
    title: `${dayHeading(key)} · ET slate`,
    zoneNote: isEtZone(viewerTz) ? null : `Times in ${zoneAbbr(now, viewerTz)}`,
  };
}

/** "2 min ago", "just now". */
export function relativeMinutes(from, now) {
  const mins = Math.floor((toDate(now) - toDate(from)) / 60000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  return h === 1 ? "1 hour ago" : `${h} hours ago`;
}

/** Whole months between two dates ("14 months ago"). */
export function monthsBetween(from, to) {
  const a = toDate(from), b = toDate(to);
  let m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) m -= 1;
  return Math.max(0, m);
}
