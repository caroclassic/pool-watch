// sheets.js — the one bottom-sheet and what goes in it: player, following, legend,
// save/import follows. Built on <dialog> for focus trapping and Esc; the back
// gesture closes it too (spec §10).

import { h, clear } from "./dom.js";
import { LEGEND, ET_NOTE } from "../copy.js";
import { tierLabel, tierDescriptor, lastNamedLine, chipName } from "../players-model.js";
import { encodeShare, decodeShare } from "../storage.js";

let dlg = null, opener = null, pushed = false, onCloseCb = null;

function ensure() {
  if (dlg) return dlg;
  dlg = h("dialog", { class: "sheet", "aria-labelledby": "sheet-title" });
  document.body.append(dlg);
  dlg.addEventListener("close", () => {
    if (pushed) { pushed = false; history.back(); }
    const cb = onCloseCb; onCloseCb = null;
    if (cb) cb();
    const el = typeof opener === "function" ? opener() : opener;
    if (el && el.isConnected) el.focus();
    opener = null;
  });
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });   // tap the backdrop
  window.addEventListener("popstate", () => { if (dlg.open && pushed) { pushed = false; dlg.close(); } });
  return dlg;
}

/** Open the sheet with a title and body nodes. `from` is the element to give focus back to. */
export function openSheet(title, body, { from = null, onClose = null } = {}) {
  const d = ensure();
  if (d.open) d.close();
  opener = from || document.activeElement;
  onCloseCb = onClose;
  clear(d).append(
    h("div", { class: "sheet-bar" },
      h("h2", { id: "sheet-title", class: "sheet-title" }, title),
      h("button", { type: "button", class: "sheet-close", "aria-label": "Close", onclick: () => d.close() }, "✕")),
    h("div", { class: "sheet-body", tabindex: "0" }, body));
  d.showModal();
  history.pushState({ sheet: true }, "");
  pushed = true;
  d.querySelector(".sheet-close").focus();
  return { el: d, close: () => d.open && d.close(), replace: (nodes) => clear(d.querySelector(".sheet-body")).append(nodes) };
}

export const closeSheet = () => dlg && dlg.open && dlg.close();

// ── player ──────────────────────────────────────────────────────────────────

export function playerSheet(p, id, { followed, onToggle, now, from }) {
  const name = p ? p.display_name : `Player ${id}`;
  const btn = h("button", { type: "button", class: "btn btn-follow", "aria-pressed": String(followed) }, followed ? "Following ✓" : "Follow");
  let on = followed;
  btn.addEventListener("click", () => {
    on = onToggle(id);
    btn.setAttribute("aria-pressed", String(on));
    btn.textContent = on ? "Following ✓" : "Follow";
  });
  const body = [];
  if (p) {
    const ln = lastNamedLine(p, now);
    body.push(
      h("div", { class: "player-head" },
        p.photo ? h("img", { class: "photo", src: p.photo, alt: "", width: 72, height: 72, loading: "lazy", referrerpolicy: "no-referrer" }) : h("div", { class: "photo ph", "aria-hidden": "true" }),
        h("div", null,
          h("p", { class: "tier-line" }, h("b", null, tierLabel(p)), h("span", { class: "tier-num" }, ` · Pool relevance ${p.score}/100`)),
          h("p", { class: "dim" }, tierDescriptor(p)),
          p.position || p.club ? h("p", { class: "dim" }, [p.position, p.club].filter(Boolean).join(" · ")) : null)),
      h("p", { class: `last-named${ln.muted ? " is-muted" : ""}` }, ln.text, ln.rel ? ` · ${ln.rel}` : ""),
      h("p", { class: "dim small" }, "Named = in the matchday squad, including unused substitutes."));
  } else {
    body.push(h("p", { class: "dim" }, "This player isn't in the pool list right now."));
  }
  body.push(btn);
  return openSheet(name, body, { from });
}

// ── following ───────────────────────────────────────────────────────────────

export function followingSheet({ follows, players, nextFor, onUnfollow, onSave, from }) {
  const list = h("ul", { class: "follow-list" });
  const fill = () => {
    clear(list);
    const ids = [...follows.ids()];
    if (!ids.length) {
      list.append(h("li", { class: "dim" }, "You aren't following anyone yet. Tap any player to follow them."));
      return;
    }
    for (const id of ids) {
      const p = players.get(id);
      const nx = p ? nextFor(id) : null;   // undefined = not known (matches not loaded)
      list.append(h("li", { class: "follow-row" },
        h("div", null,
          h("b", null, p ? p.display_name : chipName(players, id)),
          h("p", { class: "dim small" },
            !p && players.size ? "No longer in the pool"
              : nx === undefined ? ""
              : nx ? `${nx.live ? "Live now" : nx.kickoff.text} · ${nx.home} vs ${nx.away}`
              : "No match in the next 7 days")),
        h("button", { type: "button", class: "btn btn-quiet", "aria-label": `Unfollow ${p ? p.display_name : id}`,
          onclick: () => { onUnfollow(id); fill(); } }, "Unfollow")));
    }
  };
  fill();
  return openSheet("Following", [
    list,
    h("button", { type: "button", class: "btn", onclick: onSave }, "Save your follows"),
  ], { from });
}

// ── legend ──────────────────────────────────────────────────────────────────

const SHAPE_CLASS = { "●": "starts", "◐": "bench", "⊘": "not_in_squad" };
/** Participation glyphs in legend keys are drawn, not typed, so they look the same as on the chips. */
function marker(k) {
  const m = SHAPE_CLASS[k[0]];
  if (!m) return k;
  return [h("span", { class: `shape shape-${m} shape-inline`, "aria-hidden": "true" }), k.slice(1).trim()];
}

export function legendSheet({ from }) {
  const body = LEGEND.map((s) => h("section", { class: "legend-sec" },
    h("h3", null, s.title),
    h("dl", null, s.rows.flatMap(([k, v]) => [h("dt", null, marker(k)), h("dd", null, v)])),
    s.note ? h("p", { class: "dim small" }, s.note) : null));
  body.push(h("p", { class: "dim small" }, ET_NOTE));
  return openSheet("Legend", body, { from });
}

// ── save / import follows ───────────────────────────────────────────────────

async function copyText(text, el) {
  try { await navigator.clipboard.writeText(text); }
  catch { el.focus(); el.select(); document.execCommand && document.execCommand("copy"); }
}

export function saveSheet({ follows, players, onImport, from, baseUrl }) {
  const code = encodeShare([...follows.ids()]);
  const link = `${baseUrl}#f=${code}`;
  const field = (value, label) => {
    const input = h("input", { type: "text", readonly: true, value, class: "mono", "aria-label": label });
    const btn = h("button", { type: "button", class: "btn btn-quiet", onclick: async () => { await copyText(value, input); btn.textContent = "Copied"; setTimeout(() => (btn.textContent = "Copy"), 1500); } }, "Copy");
    return h("div", { class: "field" }, input, btn);
  };
  const paste = h("textarea", { rows: 2, class: "mono", placeholder: "Paste a code that starts with v1.", "aria-label": "Paste a follows code" });
  const msg = h("p", { class: "dim small", role: "status" });
  return openSheet("Save your follows", [
    h("p", null, "Your follows are saved on this device. To move them to another device or keep a backup, open this link there:"),
    follows.count() ? field(link, "Share link") : h("p", { class: "dim" }, "Follow a player first, then come back here."),
    follows.count() ? h("p", { class: "dim small" }, "Or copy the code:") : null,
    follows.count() ? field(code, "Follows code") : null,
    h("p", { class: "dim small" }, "The link keeps your follows in the part of the address that is never sent to a server."),
    h("h3", null, "Have a code?"),
    paste,
    h("button", { type: "button", class: "btn", onclick: () => {
      const ids = decodeShare(paste.value);
      if (!ids) { msg.textContent = "That code didn't work. It should start with v1."; return; }
      onImport(ids);
    } }, "Import"),
    msg,
    h("p", { class: "dim small" }, "On iPhone, adding this site to your Home Screen stops Safari clearing your follows after a week away."),
  ], { from });
}

/** Merge / Replace / Cancel for follows arriving by link or code. */
export function importSheet({ ids, follows, players, onMerge, onReplace }) {
  const names = ids.slice(0, 8).map((id) => chipName(players, id));
  const more = ids.length - names.length;
  const sheet = openSheet("Follows in this link", [
    h("p", null, `${ids.length} ${ids.length === 1 ? "player" : "players"}: ${names.join(", ")}${more > 0 ? ` and ${more} more` : ""}.`),
    follows.count() ? h("p", { class: "dim" }, `You already follow ${follows.count()}.`) : null,
    h("div", { class: "btn-row" },
      h("button", { type: "button", class: "btn", onclick: () => { onMerge(); sheet.close(); } }, follows.count() ? "Merge" : "Add them"),
      follows.count() ? h("button", { type: "button", class: "btn btn-quiet", onclick: () => { onReplace(); sheet.close(); } }, "Replace mine") : null,
      h("button", { type: "button", class: "btn btn-quiet", onclick: () => sheet.close() }, "Cancel")),
  ]);
  return sheet;
}
