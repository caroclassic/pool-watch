// players-model.js — pure helpers for how a player is described. Shared by the
// Matches page (player sheet) and the Players page.
//
// Spec §8: tier word + number; descriptors describe position in the pool, never
// squad history; "Last named" is its own line.

import { monthsBetween } from "./time.js";

export const TIER_WORD = {
  core: "Core",
  contender: "Contender",
  in_the_mix: "In the mix",
  wider_pool: "Wider pool",
};

export const TIER_DESCRIPTOR = {
  core: "Top of the pool: the players most likely to be in the squad",
  contender: "Strong candidate: firmly in the squad conversation",
  in_the_mix: "In the conversation: could be named when the squad changes",
  wider_pool: "Tracked, but not close right now",
  prospect: "Youth international in the pool",
};

/** The label shown in place of a tier word: "Prospect · U20" or "Core". */
export function tierLabel(p) {
  if (p.is_prospect) return `Prospect · ${p.youth_level || "Youth"}`;
  return TIER_WORD[p.tier] || TIER_WORD.wider_pool;
}

export function tierDescriptor(p) {
  if (p.is_prospect) return TIER_DESCRIPTOR.prospect;
  return TIER_DESCRIPTOR[p.tier] || TIER_DESCRIPTOR.wider_pool;
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
