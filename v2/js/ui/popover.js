// popover.js — dotted-underline terms with a 1–2 sentence explanation (spec §8.5).
// A term is a real <button> (keyboard and touch), one popover at a time, closed by
// Esc, a tap elsewhere, or resize. The text is announced as a status when it opens.

import { h } from "./dom.js";
import { POPOVERS } from "../copy.js";

let pop = null, owner = null, wired = false;

export function closePopover({ restoreFocus = false } = {}) {
  if (!pop) return;
  const b = owner;
  pop.remove(); pop = null; owner = null;
  if (b && b.isConnected) { b.setAttribute("aria-expanded", "false"); if (restoreFocus) b.focus(); }
}

function open(btn, key) {
  closePopover();
  const host = btn.closest("dialog") || document.body;
  pop = h("div", { class: "popover", role: "status" }, POPOVERS[key]);
  host.append(pop);
  owner = btn;
  btn.setAttribute("aria-expanded", "true");
  const r = btn.getBoundingClientRect();
  const hr = host === document.body ? { left: -window.scrollX, top: -window.scrollY } : host.getBoundingClientRect();
  const width = Math.min(280, window.innerWidth - 24);
  pop.style.width = `${width}px`;
  const left = Math.max(12, Math.min(r.left, window.innerWidth - width - 12));
  pop.style.left = `${left - hr.left}px`;
  pop.style.top = `${r.bottom - hr.top + 6}px`;
}

function wire() {
  if (wired) return;
  wired = true;
  document.addEventListener("click", (e) => { if (pop && !pop.contains(e.target) && !e.target.closest(".term")) closePopover(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && pop) { e.stopPropagation(); closePopover({ restoreFocus: true }); } }, true);
  window.addEventListener("resize", () => closePopover());
}

/** A term the reader can tap. `key` is a POPOVERS entry. */
export function term(label, key) {
  wire();
  return h("button", {
    type: "button", class: "term", "aria-expanded": "false", dataset: { term: key },
    onclick: (e) => { e.stopPropagation(); if (owner === e.currentTarget) closePopover(); else open(e.currentTarget, key); },
  }, label);
}

/** After a re-render: drop the popover if the term it belonged to is gone. */
export function syncPopover() { if (pop && owner && !owner.isConnected) closePopover(); }
