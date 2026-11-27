// data.js — the data layer. The UI only ever talks to a "source" with three
// methods (getMatches, getStatus, getPlayers) and a poller; where the bytes come
// from is this file's business. Accounts or an API later mean a different
// source, not a different front end.

import { SCHEMA_VERSION, POLL_ACTIVE_MS, POLL_IDLE_MS, FULL_REFRESH_MS, SCHEDULE_REFRESH_MS } from "./config.js";
import { LIVE_LEAD_MIN, LIVE_TAIL_HOURS } from "./model.js";

export class FeedError extends Error {
  constructor(message, kind) { super(message); this.kind = kind; }
}

/** Static JSON next to the page. Cache-busted by the minute so the CDN cannot hold a stale status. */
export function createHttpSource({ base, fetchImpl = (...a) => fetch(...a), clock = () => Date.now() }) {
  async function getJson(name) {
    const url = new URL(name, base);
    url.searchParams.set("t", String(Math.floor(clock() / 60000)));
    let res;
    try { res = await fetchImpl(url.href, { cache: "no-store" }); }
    catch (e) { throw new FeedError(`${name}: network error`, "network"); }
    if (!res.ok) throw new FeedError(`${name}: HTTP ${res.status}`, "http");
    let json;
    try { json = await res.json(); } catch { throw new FeedError(`${name}: not valid JSON`, "parse"); }
    if (!json || json.schema_version !== SCHEMA_VERSION) {
      throw new FeedError(`${name}: unsupported schema_version ${json && json.schema_version}`, "schema");
    }
    return json;
  }
  return {
    getMatches: () => getJson("matches.json"),
    getStatus: () => getJson("status.json"),
    getPlayers: () => getJson("players.json"),
    getSchedule: () => getJson("schedule.json"),          // optional: the page works without it (no far-ahead calendar)
  };
}

/**
 * Is anything about to change, or changing? True while status.json says it is
 * active, or any match is live / inside [kickoff − 90 min, kickoff + 4 h].
 */
export function shouldPollFast(views, statusFeed, now) {
  if (statusFeed && statusFeed.active) return true;
  const t = +now;
  return views.some((v) => {
    if (v.status === "live") return true;
    if (v.status !== "scheduled") return false;
    const ko = Date.parse(v.kickoffUtc);
    return t >= ko - LIVE_LEAD_MIN * 60000 && t <= ko + LIVE_TAIL_HOURS * 3600000;
  });
}

export const pollDelay = (fast) => (fast ? POLL_ACTIVE_MS : POLL_IDLE_MS);

/**
 * Loads everything once, then keeps status.json fresh. Pauses while the tab is
 * hidden and catches up the moment it is shown again.
 *
 * The page draws from matches, status and players alone: schedule.json (large, optional, only for days beyond the
 * feed and the calendar) is fetched beside them but never waited for. When it lands, `onSchedule(data)` is called
 * (not `onData`, so its arrival is never a first load and never clears an error). `data.scheduleState` says where
 * it stands: "loading" (no copy yet, a fetch pending), "ready" (a copy, even if a later refresh failed),
 * "unavailable" (no copy: the source has none, or the last fetch failed).
 */
export function createPoller({ source, delay, onData, onError, onSchedule = () => {}, doc = document, timers = { setTimeout: (...a) => setTimeout(...a), clearTimeout: (...a) => clearTimeout(...a) }, clock = () => Date.now() }) {
  let data = { matches: null, status: null, players: null, schedule: null, scheduleState: source.getSchedule ? "loading" : "unavailable" };
  let timer = null, lastFull = 0, lastSched = 0, lastRun = 0, running = false, stopped = true, nextDelay = POLL_IDLE_MS, schedPending = false;

  const hidden = () => doc && doc.visibilityState === "hidden";
  const clear = () => { if (timer !== null) { timers.clearTimeout(timer); timer = null; } };
  const schedule = (ms) => { clear(); if (!stopped && !hidden()) timer = timers.setTimeout(tick, ms); };

  // The schedule is optional: if it fails the page keeps working (and keeps the last good copy, if it has one).
  // It is large and rebuilt daily, so it is re-read only when we have none (at most once per full refresh) or
  // every few hours. Its result is handed over on its own; before the first full load it is only stored.
  function loadSchedule() {
    schedPending = true;
    if (!data.schedule) data = { ...data, scheduleState: "loading" };
    return source.getSchedule().catch(() => null).then((sched) => {
      schedPending = false; lastSched = clock();
      data = { ...data, schedule: sched || data.schedule, scheduleState: sched || data.schedule ? "ready" : "unavailable" };
      if (data.matches !== null) onSchedule(data);
    });
  }

  async function tick({ full = false } = {}) {
    if (running) return;
    running = true; clear();
    const first = data.matches === null;
    try {
      if (first || full || clock() - lastFull >= FULL_REFRESH_MS) {
        if (source.getSchedule && !schedPending && (!data.schedule || clock() - lastSched >= SCHEDULE_REFRESH_MS)) loadSchedule();
        const [matches, status, players] = await Promise.all([source.getMatches(), source.getStatus(), source.getPlayers()]);
        data = { ...data, matches, status, players }; lastFull = clock();
      } else {
        data = { ...data, status: await source.getStatus() };
      }
      lastRun = clock();
      onData(data, { first });
      nextDelay = delay(data);
    } catch (e) {
      lastRun = clock();
      onError(e, { first });
      nextDelay = first ? POLL_IDLE_MS : Math.min(nextDelay, POLL_ACTIVE_MS);
    } finally {
      running = false;
      schedule(nextDelay);
    }
  }

  const onVisibility = () => {
    if (stopped) return;
    if (hidden()) { clear(); return; }
    const age = clock() - lastRun;
    if (age >= nextDelay) tick(); else schedule(nextDelay - age);
  };

  return {
    start() { stopped = false; doc && doc.addEventListener && doc.addEventListener("visibilitychange", onVisibility); return tick(); },
    stop() { stopped = true; clear(); doc && doc.removeEventListener && doc.removeEventListener("visibilitychange", onVisibility); },
    refresh: (opts) => tick({ full: true, ...opts }),
    get data() { return data; },
  };
}
