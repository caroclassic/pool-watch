// card.js — one match card (spec §5). Takes a cardView() model; owns no state.

import { h } from "./dom.js";
import { term } from "./popover.js";


function header(c, ui) {
  const s = c.header;
  // "pre" (lineups not due yet) is the same on every card, so it is said once
  // under the day heading instead (app.js). The freshness stamp for live
  // matches likewise lives on the Live band / footer, not on each card.
  const status = s.kind === "pre" ? null
    : s.kind === "live"
    ? h("span", { class: "status status-live" }, h("span", { class: "live-dot", "aria-hidden": "true" }), "LIVE")
    : s.kind === "lineups" && ui.termSeen && !ui.termSeen.has("lineups")
      ? (ui.termSeen.add("lineups"), h("span", { class: "status status-lineups" }, term("Lineups confirmed", "lineups"), " ✓"))
      : h("span", { class: `status status-${s.kind}` }, s.text);
  // The Must-watch / Worth a look bands already name the tier in their heading,
  // so cards there skip the badge (ui.showTier === false). Elsewhere (Your
  // players, Live now, Earlier) the badge is the only place the tier shows.
  const badge = c.tier && ui.showTier !== false
    ? h("span", { class: `badge badge-${c.tier}` }, c.tierWord.toUpperCase())
    : null;
  return badge || status ? h("div", { class: "card-head" }, badge, status) : null;
}

function chip(c, onPlayer) {
  const shape = !!c.participation;
  const label = c.word ? `${c.name}, ${c.word}` : c.name;
  return h("li", null, h("button", {
    type: "button", dataset: { pid: c.playerId },
    class: `chip${c.followed ? " chip-followed" : ""}${c.participation ? ` chip-${c.participation}` : ""}`,
    "aria-label": `${label}${c.followed ? ", followed" : ""}. Open player`,
    onclick: (e) => onPlayer(c.playerId, e.currentTarget),
  },
    shape ? h("span", { class: `shape shape-${c.participation}`, "aria-hidden": "true" }) : null,
    h("span", { class: "chip-name" }, c.name),
    c.word ? h("span", { class: "chip-word" }, c.word) : null));
}

/**
 * @param c         cardView model
 * @param ui        { expanded:Set, onPlayer(id, el), onToggleExpand(cardId) }
 */
export function renderCard(c, ui) {
  const open = ui.expanded.has(c.id);
  const shown = open ? c.chips : c.chips.slice(0, c.collapsedCount);
  const hidden = c.chips.length - c.collapsedCount;
  const k = c.kickoff;

  return h("article", {
    class: ["card", c.tier ? `tier-${c.tier}` : "", c.pinned ? "is-pinned" : "", c.dim ? "is-dim" : "", `st-${c.status}`].filter(Boolean).join(" "),
    "aria-label": c.ariaLabel, dataset: { id: c.id },
  },
    header(c, ui),
    h("h4", { class: "teams" }, c.home, h("span", { class: "vs" }, " vs "), c.away),
    h("p", { class: "meta" },
      h("span", { class: "comp" }, c.competition),
      c.youth ? h("span", { class: "tag-youth" }, "Youth") : null,
      h("span", { class: "ko" }, k.text),
      k.slateTag ? h("span", { class: "slate-tag" }, k.slateTag) : null,
      c.broadcast ? h("span", { class: "bc" }, c.broadcast) : null),
    c.pinned || c.movedFromPins
      ? h("p", { class: "pin-line" },
          c.pinned ? h("span", { class: "pin-tag" }, h("span", { "aria-hidden": "true" }, "⌖ "), `Following: ${c.followingNames.join(", ")}`) : null,
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
    c.note ? h("p", { class: "note" }, c.note) : null);
}
