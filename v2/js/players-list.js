// players-list.js — pure list logic for the Players page: search folding, A-Z
// order, filters, counts. No DOM. Covered by tests/players-list.test.mjs.
//
// Spec §8: filters All | Seniors | Prospects | Following; sort Relevance | A-Z;
// ties share a number and fall back to A-Z. "Prospects" is exactly the players
// who wear the Prospect badge (no senior cap); capped prospects are Seniors.

// Letters that do not decompose under NFD (same table as players_page.py).
const FOLD = { "ł": "l", "ø": "o", "đ": "d", "ı": "i", "ß": "ss", "æ": "ae", "œ": "oe" };
export const fold = (s) => String(s ?? "").toLowerCase()
  .replace(/[łøđıßæœ]/g, (c) => FOLD[c])
  .normalize("NFD").replace(/[̀-ͯ]/g, "");

const PARTICLES = new Set(["de", "da", "di", "del", "della", "van", "von", "der", "den", "la", "le", "dos", "das", "du", "al", "el", "bin", "ter", "ten"]);

/** "Lucas de la Torre" -> "de la torre lucas"; "Chris Richards" -> "richards chris". */
export function surnameKey(display) {
  const toks = String(display || "").trim().split(/\s+/).filter(Boolean);
  if (toks.length < 2) return fold(display);
  let i = toks.length - 1;
  while (i > 0 && PARTICLES.has(toks[i - 1].toLowerCase())) i -= 1;
  return fold([...toks.slice(i), ...toks.slice(0, i)].join(" "));
}

export function initials(display) {
  const toks = String(display || "").replace(/-/g, " ").split(/\s+/).filter(Boolean);
  if (!toks.length) return "?";
  if (toks.length === 1) return toks[0][0].toUpperCase();
  return (toks[0][0] + toks[toks.length - 1][0]).toUpperCase();
}

export const FILTERS = ["all", "seniors", "prospects", "following"];
export const FILTER_LABEL = { all: "All", seniors: "Seniors", prospects: "Prospects", following: "Following" };

/** Decorate once: adds the sort and search keys. */
export function prepare(players) {
  return players.map((p, i) => ({
    ...p, _i: i,
    _name: surnameKey(p.display_name),
    _search: fold(`${p.display_name} ${p.club || ""}`),
  }));
}

const inFilter = (p, filter, follows) =>
  filter === "seniors" ? !p.is_prospect
  : filter === "prospects" ? !!p.is_prospect
  : filter === "following" ? follows.has(String(p.playerId))
  : true;

export function counts(list, follows) {
  const c = { all: list.length, seniors: 0, prospects: 0, following: 0 };
  for (const p of list) {
    if (p.is_prospect) c.prospects += 1; else c.seniors += 1;
    if (follows.has(String(p.playerId))) c.following += 1;
  }
  return c;
}

/** Every word typed must appear in the name or club (accent-insensitive). */
export function matchesQuery(p, query) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return words.every((w) => p._search.includes(w));
}

export function sortPlayers(list, mode) {
  const az = (a, b) => a._name.localeCompare(b._name) || a._i - b._i;
  const out = list.slice();
  out.sort(mode === "az" ? az : (a, b) => (b.score - a.score) || az(a, b));
  return out;
}

/** Followed ids that are no longer in players.json (kept, never silently deleted: spec §6.3). */
export function missingFollows(list, follows) {
  const have = new Set(list.map((p) => String(p.playerId)));
  return [...follows].filter((id) => !have.has(id));
}

export function visible(list, { filter, query, sort, follows }) {
  return sortPlayers(list.filter((p) => inFilter(p, filter, follows) && matchesQuery(p, query)), sort);
}
