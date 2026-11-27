// card.js — one match card (spec §5). Takes a cardView() model; owns no state.

import { h } from "./dom.js";
import { term, listTerm } from "./popover.js";
import { WATCH } from "../copy.js";
import { levelMark } from "../model.js";
import { icon } from "./icons.js";


// States the time column says (LIVE and the phase, Full time, Postponed, Cancelled) are not repeated in the head line.
const IN_COLUMN = new Set(["live", "full_time", "postponed", "cancelled"]);
// Long words in a 64 px column break at a marked point rather than overflow ("Inter- / rupted").
const SOFT = { Interrupted: "Inter\u00ADrupted", Suspended: "Sus\u00ADpended", Postponed: "Post\u00ADponed", Cancelled: "Can\u00ADcelled" };
const soft = (w) => SOFT[w] || w;

/** The 64 px time column (model.js timeColumn). */
function column(c) {
  const col = c.column;
  if (col.kind === "time") return h("div", { class: "tcol" }, h("span", { class: "tc-time" }, col.time), h("span", { class: "tc-zone" }, col.zone));
  if (col.kind === "live") {
    return h("div", { class: "tcol tcol-live" }, h("span", { class: "tc-live" }, col.word), col.phase ? h("span", { class: "tc-phase" }, soft(col.phase)) : null);
  }
  return h("div", { class: `tcol tcol-${col.kind}` }, h("span", { class: "tc-word" }, soft(col.word)));
}

function header(c, ui) {
  const s = c.header;
  // "pre" (lineups not due yet) is the same on every card, so it is said once
  // under the day heading instead (app.js). The freshness stamp for live
  // matches likewise lives on the Live band / footer, not on each card.
  const status = s.kind === "pre" || IN_COLUMN.has(s.kind) ? null
    : s.kind === "lineups" && ui.termSeen && !ui.termSeen.has("lineups")
      ? (ui.termSeen.add("lineups"), h("span", { class: "status status-lineups" }, term("Lineups confirmed", "lineups"), icon("check", 14)))
      : s.kind === "lineups" ? h("span", { class: "status status-lineups" }, s.text.replace(/\s*✓$/, ""), icon("check", 14))
      : h("span", { class: `status status-${s.kind}` }, s.text);
  // Worth a look outside its own band: a small label here (Must-watch gets the banner instead; model.js levelMark).
  const label = levelMark(c.tier, ui.band) === "label" ? h("span", { class: "level-label" }, c.tierWord) : null;
  return label || status ? h("div", { class: "card-head" }, label, status) : null;
}

// Where to watch: ONE provider named on the card, the rest behind "+ N more"; with no listing, nothing. (A plain
// string is the older feed's line, shown as it is. A listing with no primary, which the feed sends for senior
// national matches for now, shows the "Where to watch" link alone.)
function broadcast(c) {
  const b = c.broadcast, match = `${c.home} vs ${c.away}`;
  if (!b) return null;
  if (b.text) return h("span", { class: "bc" }, b.text);
  if (!b.primary) return h("span", { class: "bc" }, listTerm(WATCH.link, WATCH.title, b.providers, WATCH.linkLabel(match)));
  return h("span", { class: "bc" }, b.primary,
    b.more > 0 ? [" ", listTerm(WATCH.more(b.more), WATCH.title, b.providers, WATCH.moreLabel(b.more, match))] : null);
}

function chip(c, onPlayer) {
  // `shape` is the lineup status, or the live state when there is one; the word beside it always says the same thing.
  const shape = c.shape || c.participation;
  const label = c.word ? `${c.name}, ${c.word}` : c.name;
  return h("li", null, h("button", {
    type: "button", dataset: { pid: c.playerId },
    class: `chip${c.followed ? " chip-followed" : ""}${shape ? ` chip-${shape}` : ""}`,
    "aria-label": `${label}${c.followed ? ", followed" : ""}. Open player`,
    onclick: (e) => onPlayer(c.playerId, e.currentTarget),
  },
    shape ? h("span", { class: `shape shape-${shape}`, "aria-hidden": "true" }) : null,
    h("span", { class: "chip-name" }, c.name),
    c.word ? h("span", { class: "chip-word" }, c.word) : null));
}

/**
 * @param c         cardView model
 * @param ui        { expanded:Set, onPlayer(id, el), onToggleExpand(cardId), headLevel?: 3 | 4 (default 4),
 *                    band?: "must_watch" | "worth_a_look" | null (the band the card is drawn in) }
 */
export function renderCard(c, ui) {
  const open = ui.expanded.has(c.id);
  const shown = open ? c.chips : c.chips.slice(0, c.collapsedCount);
  const hidden = c.chips.length - c.collapsedCount;
  const k = c.kickoff;

  const mt = c.metaTime;
  return h("article", {
    class: ["card", c.tier ? `tier-${c.tier}` : "", c.pinned ? "is-pinned" : "", c.dim ? "is-dim" : "", `st-${c.status}`].filter(Boolean).join(" "),
    "aria-label": c.ariaLabel, dataset: { id: c.id },
  },
   // Must-watch outside the Must-watch band: a full-width coral banner (the only coral on a card)
   levelMark(c.tier, ui.band) === "banner" ? h("div", { class: "mw-banner" }, c.tierWord) : null,
   h("div", { class: "card-in" },
    column(c),
    h("div", { class: "card-body" },
    header(c, ui),
    h(ui.headLevel === 3 ? "h3" : "h4", { class: "teams" }, c.home, h("span", { class: "vs" }, " vs "), c.away),
    // competition · kickoff (once the column holds something else; struck when the match is off) · a long match's
    // ending · where to watch
    h("p", { class: "meta" },
      h("span", { class: "comp" }, c.competition),
      c.youth ? h("span", { class: "tag-youth" }, "Youth") : null,
      mt ? h("span", { class: "ko" }, mt.struck ? h("s", null, mt.text) : mt.text) : null,
      mt && mt.extra ? h("span", { class: "ko-extra" }, mt.extra) : null,
      k.slateTag ? h("span", { class: "slate-tag" }, k.slateTag) : null,
      broadcast(c)),
    c.pinned || c.movedFromPins
      ? h("p", { class: "pin-line" },
          c.pinned ? h("span", { class: "pin-tag" }, icon("following", 16), `Following: ${c.followingNames.join(", ")}`) : null,
          c.movedFromPins ? h("span", { class: "moved-tag" }, "Moved from your pins") : null)
      : null,
    h("ul", { class: "chips" },
      shown.map((x) => chip(x, ui.onPlayer)),
      hidden > 0 && !open
        ? h("li", null, h("button", { type: "button", class: "chip chip-more", "aria-expanded": "false",
            "aria-label": `Show ${hidden} more players`, onclick: () => ui.onToggleExpand(c.id) }, `+${hidden} more`))
        : null,
      hidden > 0 && open
        ? h("li", null, h("button", { type: "button", class: "chip chip-more", "aria-expanded": "true",
            onclick: () => ui.onToggleExpand(c.id) }, "Show fewer"))
        : null),
    c.note ? h("p", { class: "note" }, c.note) : null)));
}
