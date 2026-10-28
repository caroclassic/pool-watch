// model.js — pure view-model for the Matches page. No DOM, no fetch, no clock
// (callers pass `now`). Everything here is covered by tests/model.test.mjs.
//
// Spec map:
//   §4   tiers: fixed levels, effective tier at each status
//   §5   card hierarchy and status lifecycle
//   §6   pinning, "Not playing today", "Moved from your pins"
//   §7   day membership by ET date, empty days
//   dec 12  band order: pinned → Live now → Must-watch → Worth a look → Also today
//           (each in kickoff order) → postponed/cancelled → Earlier (finished).
//           Amended 2026-10-10: the spec left Worth a look inline with the rest;
//           it now has its own band, and the unbadged remainder is "Also today".

import { etDateKey, localTime, relativeMinutes, kickoffDisplay, addDays, daysBetween } from "./time.js";
import { chipName } from "./players-model.js";

export const LIVE_LEAD_MIN = 90;      // lineup window opens this long before kickoff
export const LIVE_TAIL_HOURS = 4;     // a match can be in play this long after kickoff
export const LINEUP_USUAL_MIN = 30;   // lineups usually post about 30 min before kickoff
export const OVERDUE_MIN = 30;        // still "scheduled" this long after kickoff = status unknown, probably playing
export const DROP_HOURS = 3;          // ...and this long after, it leaves the day's main list for Earlier
export const COLLAPSED_CHIPS = 3;
export const POOL_ESTIMATE_MAX = 8;

export const TIER_WORD = { must_watch: "Must-watch", worth_a_look: "Worth a look" };
export const TIER_PIPS = { must_watch: 3, worth_a_look: 2 };
const PART_WORD = { starts: "Starts", bench: "Bench", not_in_squad: "Not in squad" };
const DISRUPTED = new Set(["postponed", "cancelled"]);

// ── merge ───────────────────────────────────────────────────────────────────

/** matches.json (schedule) + status.json (volatile) → one flat view per match. */
export function mergeFeeds(matchesFeed, statusFeed) {
  const sm = (statusFeed && statusFeed.matches) || {};
  return ((matchesFeed && matchesFeed.matches) || []).map((m, idx) => {
    const s = sm[m.matchId];
    const has = (k) => s && Object.prototype.hasOwnProperty.call(s, k);
    return {
      id: String(m.matchId),
      order: idx,                       // position in matches.json: kickoff, then highest match score first
      kickoffUtc: m.kickoff_utc,
      etDay: etDateKey(m.kickoff_utc),
      competition: m.competition,
      home: m.home,
      away: m.away,
      fixtureKind: m.fixture_kind,
      broadcast: m.broadcast || null,
      playersBasis: m.players_basis || null,
      status: s ? s.status : m.status,
      tier: has("tier") ? s.tier : m.tier,
      tierAtKickoff: has("tier_at_kickoff") ? s.tier_at_kickoff : m.tier_at_kickoff,
      lineupsConfirmed: s ? !!s.lineups_confirmed : false,
      participation: (s && s.participation) || {},
      carried: !!(s && s.carried_over),
      poolPlayers: m.pool_players || [],
    };
  });
}

export const tiersEnabled = (matchesFeed) =>
  !!(matchesFeed && matchesFeed.tier_thresholds && matchesFeed.tier_thresholds.enabled);

/** The tier a card shows: frozen value once the match has started (spec §4). */
export function effectiveTier(v, enabled) {
  if (!enabled || DISRUPTED.has(v.status)) return null;
  if (v.status === "live" || v.status === "full_time") return v.tierAtKickoff ?? v.tier ?? null;
  return v.tier ?? null;
}

// ── freshness (spec §5.2 "Poll stale") ──────────────────────────────────────

/**
 * Is the status feed too old to trust for this match? Only matters while the
 * match can be changing. A dead poller must never show a false "Live".
 */
export function freshness(v, statusFeed, now, staleMinutes) {
  const t = +now;
  const ko = Date.parse(v.kickoffUtc);
  const movable = v.status === "live" ||
    (v.status === "scheduled" && t >= ko - LIVE_LEAD_MIN * 60000 && t <= ko + LIVE_TAIL_HOURS * 3600000);
  const asOf = (statusFeed && statusFeed.updated_at) || null;
  if (!movable) return { stale: false, asOf };
  if (!asOf) return { stale: true, asOf: null };
  return { stale: t - Date.parse(asOf) > staleMinutes * 60000, asOf };
}

/**
 * A match the feed still calls "scheduled" well after kickoff. The poller
 * missing a match must not read as "lineup not posted yet" for hours, so the
 * clock decides what to show — but it never claims LIVE, because we don't know.
 *   "probable" — OVERDUE_MIN..DROP_HOURS after kickoff: shown in Live now, "status not confirmed"
 *   "dropped"  — beyond DROP_HOURS: shown under Earlier
 * Any confirmed status (live / full_time / postponed / cancelled) overrides this.
 */
export function overdueState(v, now) {
  if (v.status !== "scheduled" || !now) return null;
  const mins = (+now - Date.parse(v.kickoffUtc)) / 60000;
  if (mins >= DROP_HOURS * 60) return "dropped";
  if (mins >= OVERDUE_MIN) return "probable";
  return null;
}

// ── pinning ─────────────────────────────────────────────────────────────────

const part = (v, id) => v.participation[String(id)] ?? null;

/** A followed player is in this match and not confirmed out. */
function followedIn(v, follows) {
  return v.poolPlayers.filter((p) => follows.has(p.playerId) && part(v, p.playerId) !== "not_in_squad");
}

export function isPinned(v, follows, now) {
  if (!follows.size) return false;
  if (v.status === "full_time" || DISRUPTED.has(v.status)) return false;
  if (overdueState(v, now) === "dropped") return false;
  return followedIn(v, follows).length > 0;
}

/** A followed player was confirmed out, and nobody else you follow keeps the match pinned. */
export function isMovedFromPins(v, follows, now) {
  if (!follows.size || v.status === "full_time" || DISRUPTED.has(v.status)) return false;
  if (overdueState(v, now) === "dropped") return false;
  const out = v.poolPlayers.some((p) => follows.has(p.playerId) && part(v, p.playerId) === "not_in_squad");
  return out && !isPinned(v, follows, now);
}

// ── cards ───────────────────────────────────────────────────────────────────

// Once lineups are out, who is actually playing leads. Players with no status yet
// (the other team's lineup hasn't posted, or the match is pre-lineup) sit between
// starters and the bench: they are still expected to play. With no statuses at all
// every player is in the same group and the order is the old one: relevance score.
const PART_GROUP = { starts: 0, bench: 2, not_in_squad: 3 };       // no status = 1

/**
 * Pill order: a followed player first (unless he is not in the squad, then he
 * sorts to the end with the other absentees), then starters, unconfirmed,
 * bench, not in squad; within a group by relevance score, then name.
 */
export function orderedPool(v, follows, players) {
  const score = (id) => (players.get(String(id)) || {}).score ?? 0;
  const group = (id) => PART_GROUP[part(v, id)] ?? 1;
  const lead = (id) => follows.has(id) && group(id) < 3;           // followed, and not known to be out
  return [...v.poolPlayers].sort((a, b) =>
    (lead(b.playerId) - lead(a.playerId)) ||
    (group(a.playerId) - group(b.playerId)) ||
    (score(b.playerId) - score(a.playerId)) ||
    chipName(players, a.playerId).localeCompare(chipName(players, b.playerId)));
}

function statusHeader(v, fresh, now, tz) {
  if (v.status === "postponed") return { kind: "postponed", text: "Postponed" };
  if (v.status === "cancelled") return { kind: "cancelled", text: "Cancelled" };
  if (v.status === "full_time") return { kind: "full_time", text: "Full time" };
  const asOfTime = fresh.asOf ? localTime(fresh.asOf, tz) : null;
  if (fresh.stale) {
    return { kind: "stale", text: asOfTime ? `Status as of ${asOfTime}` : "Status not available" };
  }
  if (v.status === "live") {
    return { kind: "live", text: "LIVE", sub: fresh.asOf ? `Updated ${relativeMinutes(fresh.asOf, now)}` : null };
  }
  const od = overdueState(v, now);
  if (od) {
    return { kind: "unconfirmed", text: od === "probable" ? "Probably in progress · status not confirmed" : "Status not confirmed" };
  }
  if (v.lineupsConfirmed) return { kind: "lineups", text: "Lineups confirmed ✓" };
  const minsToKo = (Date.parse(v.kickoffUtc) - +now) / 60000;
  if (minsToKo <= LINEUP_USUAL_MIN) {
    return { kind: "waiting", text: asOfTime ? `Lineup not posted yet · checked ${asOfTime}` : "Lineup not posted yet" };
  }
  return { kind: "pre", text: `Lineups ~${LINEUP_USUAL_MIN} min before kickoff` };
}

function ariaLabel(card) {
  const bits = [`${card.home} vs ${card.away}`];
  if (card.tier) bits.push(TIER_WORD[card.tier]);
  const s = card.header;
  bits.push({ live: "live", lineups: "lineups confirmed", full_time: "full time", postponed: "postponed",
              cancelled: "cancelled", unconfirmed: "status not confirmed", stale: s.text.toLowerCase(), waiting: "lineup not posted yet",
              pre: "lineups not out yet" }[s.kind]);
  const starting = card.chips.filter((c) => c.followed && c.participation === "starts").length;
  if (starting) bits.push(`${starting} of your players starting`);
  return bits.join(", ");
}

/**
 * One card's worth of display data. `ctx` = { follows:Set, players:Map,
 * now:Date, tz, statusFeed, staleMinutes, tiersEnabled }.
 */
export function cardView(v, ctx) {
  const fresh = freshness(v, ctx.statusFeed, ctx.now, ctx.staleMinutes);
  const tier = effectiveTier(v, ctx.tiersEnabled);
  const pinned = isPinned(v, ctx.follows, ctx.now);
  const pool = orderedPool(v, ctx.follows, ctx.players);
  const chips = pool.map((p) => {
    const pt = part(v, p.playerId);
    return {
      playerId: p.playerId,
      name: chipName(ctx.players, p.playerId),
      participation: pt,
      word: pt ? PART_WORD[pt] : null,
      followed: ctx.follows.has(p.playerId),
    };
  });
  const cap = v.playersBasis === "pool_estimate" ? POOL_ESTIMATE_MAX : Infinity;
  const expandable = chips.slice(0, cap);
  const followedNames = chips.filter((c) => c.followed && c.participation !== "not_in_squad").map((c) => c.name);

  const card = {
    id: v.id, home: v.home, away: v.away, competition: v.competition, broadcast: v.broadcast,
    kickoff: kickoffDisplay(v.kickoffUtc, ctx.tz), kickoffUtc: v.kickoffUtc,
    youth: v.fixtureKind === "national_youth",
    status: v.status, tier, tierWord: tier ? TIER_WORD[tier] : null, pips: tier ? TIER_PIPS[tier] : 0,
    header: statusHeader(v, fresh, ctx.now, ctx.tz),
    stale: fresh.stale,
    pinned, followingNames: pinned ? followedNames : [],
    movedFromPins: isMovedFromPins(v, ctx.follows, ctx.now),
    chips: expandable,
    collapsedCount: Math.min(COLLAPSED_CHIPS, expandable.length),
    note: v.playersBasis === "pool_estimate" ? "Call-up not announced yet"
        : v.playersBasis === "prior_window" ? "Based on the previous squad" : null,
    dim: v.status === "full_time" || DISRUPTED.has(v.status) || overdueState(v, ctx.now) === "dropped",
  };
  card.ariaLabel = ariaLabel(card);
  return card;
}

// ── a day ───────────────────────────────────────────────────────────────────

// Same kickoff: the feed's own order (highest match score first), then id.
const byKickoff = (a, b) => (Date.parse(a.kickoffUtc) - Date.parse(b.kickoffUtc)) || ((a.order ?? 0) - (b.order ?? 0)) || a.id.localeCompare(b.id);

/**
 * The whole page body for one ET day, in band order.
 * ctx adds: dayKey, todayKey, views (from mergeFeeds).
 */
export function buildDay(ctx) {
  const { views, dayKey, todayKey, follows, players } = ctx;
  const dayViews = views.filter((v) => v.etDay === dayKey).sort(byKickoff);
  const card = (v) => cardView(v, ctx);

  const live = [], must = [], worth = [], rest = [], disrupted = [], earlier = [], pinned = [];
  for (const v of dayViews) {
    const fresh = freshness(v, ctx.statusFeed, ctx.now, ctx.staleMinutes);
    const od = overdueState(v, ctx.now);
    if (isPinned(v, follows, ctx.now)) { pinned.push(card(v)); continue; }
    if (v.status === "full_time" || od === "dropped") { earlier.push(card(v)); continue; }
    if (DISRUPTED.has(v.status)) { disrupted.push(card(v)); continue; }
    if ((v.status === "live" || od === "probable") && !fresh.stale) { live.push(card(v)); continue; }
    const c = card(v);
    (c.tier === "must_watch" ? must : c.tier === "worth_a_look" ? worth : rest).push(c);
  }

  // Followed players with no pinned match this day.
  const notPlaying = [];
  const pinnedIds = new Set(pinned.flatMap((c) => c.chips.filter((x) => x.followed && x.participation !== "not_in_squad").map((x) => x.playerId)));
  for (const id of follows) {
    if (pinnedIds.has(id)) continue;
    const name = chipName(players, id);
    const inMatches = dayViews.filter((v) => v.poolPlayers.some((p) => p.playerId === id));
    if (inMatches.some((v) => (v.status === "full_time" || overdueState(v, ctx.now) === "dropped") && part(v, id) !== "not_in_squad")) continue; // he played (or probably did); see Earlier
    if (inMatches.some((v) => part(v, id) === "not_in_squad")) { notPlaying.push({ playerId: id, name, reason: "not in squad" }); continue; }
    if (inMatches.some((v) => DISRUPTED.has(v.status))) { notPlaying.push({ playerId: id, name, reason: "match postponed or cancelled" }); continue; }
    notPlaying.push({ playerId: id, name, reason: "no match listed" });
  }
  notPlaying.sort((a, b) => a.name.localeCompare(b.name));

  // Empty-Must-watch copy (spec §4): only when tiers are on, the day has matches,
  // nothing qualifies, and there is at least a Worth a look to point at.
  const all = [...pinned, ...live, ...must, ...worth, ...rest, ...earlier];
  const hasMust = all.some((c) => c.tier === "must_watch");
  // Where is the Worth a look match the message points at? The "Worth a look" band is
  // below the message; a Worth a look match can also sit ABOVE it, pinned in Your
  // players or in Live now (those cards carry the badge). One that has already
  // finished sits in Earlier and is not something to point a viewer at.
  const worthBelow = worth.length > 0;
  const worthAbove = [...pinned, ...live].some((c) => c.tier === "worth_a_look");
  const when = dayKey === todayKey ? "today" : "this day";
  const noMustCopy = ctx.tiersEnabled && dayViews.length > 0 && !hasMust && (worthBelow || worthAbove)
    ? (worthBelow ? `No Must-watch matches ${when}. Best of the day is Worth a look below.`
                  : `No Must-watch matches ${when}. Best of the day is Worth a look, shown above.`)
    : null;

  const stillLive = dayKey === todayKey
    ? views.filter((v) => v.carried && v.status === "live" && !freshness(v, ctx.statusFeed, ctx.now, ctx.staleMinutes).stale)
        .sort(byKickoff).map((v) => ({ day: v.etDay, card: card(v) }))
    : [];

  return {
    dayKey, total: dayViews.length,
    pinned, live, must, worth, rest, disrupted, earlier, notPlaying, noMustCopy, stillLive,
  };
}

// ── the "it's now <day>" roll-over banner ───────────────────────────────────

/** The banner shows while the "today" the person last looked at differs from the real today. */
export const rolledOver = (anchorToday, todayKey) => anchorToday !== todayKey;

/**
 * Landing on the real today, by ANY route (the banner's link, the Today button, a strip
 * tile, the date picker, the arrow keys, browser back), acknowledges the new day, so the
 * banner has nothing left to say. Any other day leaves it as it was.
 */
export const nextAnchorToday = (anchorToday, selectedKey, todayKey) =>
  (selectedKey === todayKey ? todayKey : anchorToday);

// ── day strip ───────────────────────────────────────────────────────────────

/** Per-day facts for the strip tiles. */
export function dayFacts(views, ctx) {
  const out = new Map();
  const get = (k) => { if (!out.has(k)) out.set(k, { total: 0, pins: 0, must: false, live: false }); return out.get(k); };
  for (const v of views) {
    const f = get(v.etDay);
    f.total += 1;
    if (isPinned(v, ctx.follows, ctx.now)) f.pins += 1;
    if (effectiveTier(v, ctx.tiersEnabled) === "must_watch") f.must = true;
    if (v.status === "live" && !freshness(v, ctx.statusFeed, ctx.now, ctx.staleMinutes).stale) f.live = true;
  }
  return out;
}

/** The strip's days: 3 back to 14 ahead of today's ET date (spec decision 15). */
export function stripDays(todayKey, back = 3, ahead = 14) {
  const days = [];
  for (let i = -back; i <= ahead; i++) days.push(addDays(todayKey, i));
  return days;
}

/** Is `dayKey` inside the dates the feed says it covers? */
export function inWindow(matchesFeed, dayKey) {
  const w = matchesFeed && matchesFeed.window;
  if (!w) return true; // older feed without a window: assume covered
  return dayKey >= w.start && dayKey <= w.end;
}

/** First ET day after `fromKey` that has any match, or null. */
export function nextMatchDay(views, fromKey) {
  let best = null;
  for (const v of views) {
    if (DISRUPTED.has(v.status)) continue;
    if (v.etDay > fromKey && (best === null || v.etDay < best)) best = v.etDay;
  }
  return best;
}

// ── following ───────────────────────────────────────────────────────────────

/** A followed player's next match within `withinDays`, or null. */
export function nextMatchFor(views, playerId, now, tz, withinDays = 7) {
  const id = String(playerId);
  const limit = +now + withinDays * 86400000;
  let best = null;
  for (const v of views) {
    if (v.status !== "scheduled" && v.status !== "live") continue;
    if (!v.poolPlayers.some((p) => p.playerId === id)) continue;
    if (part(v, id) === "not_in_squad") continue;
    const ko = Date.parse(v.kickoffUtc);
    if (ko > limit) continue;
    if (v.status === "scheduled" && ko < +now - LIVE_TAIL_HOURS * 3600000) continue;
    if (!best || ko < Date.parse(best.kickoffUtc)) best = v;
  }
  if (!best) return null;
  return { id: best.id, home: best.home, away: best.away, kickoff: kickoffDisplay(best.kickoffUtc, tz),
           live: best.status === "live", dayKey: best.etDay };
}

/** Changes in followed players' confirmed status between two merged snapshots, for aria-live. */
export function followedChanges(prevViews, nextViews, follows, players) {
  const key = (v, id) => `${v.id}|${id}`;
  const before = new Map();
  for (const v of prevViews) for (const p of v.poolPlayers) if (follows.has(p.playerId)) before.set(key(v, p.playerId), part(v, p.playerId));
  const msgs = [];
  for (const v of nextViews) {
    for (const p of v.poolPlayers) {
      if (!follows.has(p.playerId)) continue;
      const was = before.get(key(v, p.playerId));
      const now = part(v, p.playerId);
      if (was === undefined || was === now || now === null) continue;
      const name = chipName(players, p.playerId);
      const verb = { starts: "is starting", bench: "is on the bench", not_in_squad: "is not in the squad" }[now];
      msgs.push(`${name} ${verb} in ${v.home} vs ${v.away}`);
    }
  }
  return msgs;
}

export { daysBetween };
