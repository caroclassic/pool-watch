// players-model.js — pure helpers for how a player is described. Shared by the
// Matches page (player sheet) and the Players page.
//
// Spec §8: tier word + number; the tier definitions (in copy.js) describe position in the pool,
// never squad history; "Last named" is its own line.

import { monthsBetween } from "./time.js";

export const TIER_WORD = {
  core: "Core",
  contender: "Contender",
  in_the_mix: "In the mix",
  wider_pool: "Wider pool",
};

/** The label shown in place of a tier word: "Prospect · U20" or "Core". */
export function tierLabel(p) {
  if (p.is_prospect) return `Prospect · ${p.youth_level || "Youth"}`;
  return TIER_WORD[p.tier] || TIER_WORD.wider_pool;
}

/** POPOVERS key for the tier name on the player card (the definition lives in copy.js). */
export function tierPopoverKey(p) {
  if (p.is_prospect) return "tier_prospect";
  return `tier_${TIER_WORD[p.tier] ? p.tier : "wider_pool"}`;
}

/** "Age 28" for the card, or null when the feed has no usable age (the line is then left out, never guessed). */
export function ageLine(p) {
  const a = p && p.age;
  return Number.isInteger(a) && a >= 10 && a <= 60 ? `Age ${a}` : null;
}

/**
 * The "Last named" line (spec §8.3).
 * Returns { text, muted }. Never blank.
 */
export function lastNamedLine(p, now = new Date()) {
  const ln = p.last_named;
  if (!ln || !ln.date) {
    if (p.is_prospect && p.youth_level) return { text: `Youth level: ${p.youth_level}`, muted: false };
    return { text: "Not yet named to a senior squad", muted: true };
  }
  const [y, m, d] = ln.date.split("-").map(Number);
  const when = new Date(Date.UTC(y, m - 1, d, 12));
  const dateText = when.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
  const bits = [dateText];
  const what = ln.opponent ? `${ln.competition || "Match"} vs ${ln.opponent}` : (ln.competition || "");
  if (what) bits.push(what);
  const months = monthsBetween(when, now);
  let rel = "";
  if (months >= 1) rel = months === 1 ? "1 month ago" : `${months} months ago`;
  return { text: `Last named: ${bits.join(" · ")}`, rel, muted: months >= 12 };
}

/** Index players.json by playerId. */
export function indexPlayers(feed) {
  const map = new Map();
  for (const p of (feed && feed.players) || []) map.set(String(p.playerId), p);
  return map;
}

/** Name for a chip: "F. Last", with a quiet fallback for an id we do not know. */
export function chipName(map, id) {
  const p = map.get(String(id));
  return p ? p.short_name : `Player ${id}`;
}
