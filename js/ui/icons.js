// icons.js — the brand icon set (docs/brand/decisions-addendum.md §6): a 24 px grid, 1.75 px stroke, round caps and
// joins, currentColor. They replace every text glyph (⌖ ⓘ ☀ ✕ ▾), which drew differently on every device. An icon is
// always decoration (aria-hidden): the button around it carries the words.

const SVG_NS = "http://www.w3.org/2000/svg";

// [tag, attributes] per shape. "fill: currentColor" only where the set calls for it (the Auto half, the live dot).
const SHAPES = {
  following: [["path", { d: "M9 3h6l-1 6 3.5 3.5h-11L10 9z" }], ["path", { d: "M12 12.5V21" }]],
  info: [["circle", { cx: 12, cy: 12, r: 9 }], ["path", { d: "M12 11v6M12 7.5v.2" }]],
  theme_auto: [["circle", { cx: 12, cy: 12, r: 8 }], ["path", { d: "M12 4a8 8 0 0 0 0 16z", fill: "currentColor" }]],
  theme_light: [["circle", { cx: 12, cy: 12, r: 4 }],
    ["path", { d: "M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" }]],
  theme_dark: [["path", { d: "M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" }]],
  search: [["circle", { cx: 11, cy: 11, r: 6.5 }], ["path", { d: "M16 16l4.5 4.5" }]],
  live: [["circle", { cx: 12, cy: 12, r: 3, fill: "currentColor" }], ["path", { d: "M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 7.5a6.4 6.4 0 0 1 0 9" }]],
  calendar: [["rect", { x: 4, y: 5, width: 16, height: 15, rx: 2 }], ["path", { d: "M4 10h16M9 3v4M15 3v4" }]],
  close: [["path", { d: "M6 6l12 12M18 6L6 18" }]],
  // added on the same grid (components.md: "Add new icons on the same grid and stroke")
  check: [["path", { d: "M5 12.5l4.5 4.5L19 7.5" }]],
  chevron_down: [["path", { d: "M6 9l6 6 6-6" }]],
  chevron_left: [["path", { d: "M15 6l-6 6 6 6" }]],
  chevron_right: [["path", { d: "M9 6l6 6-6 6" }]],
};
export const ICON_NAMES = Object.keys(SHAPES);

/** An <svg> icon: 22 px in the header, 20 px in fields, 16 px inline. */
export function icon(name, size = 22, doc = document) {
  const shapes = SHAPES[name];
  if (!shapes) throw new Error(`unknown icon ${name}`);
  const svg = doc.createElementNS(SVG_NS, "svg");
  const attrs = { viewBox: "0 0 24 24", width: size, height: size, fill: "none", stroke: "currentColor", "stroke-width": 1.75,
                  "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false", class: `icon icon-${name}` };
  for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, String(v));
  for (const [tag, a] of shapes) {
    const el = doc.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(a)) el.setAttribute(k, String(v));
    svg.append(el);
  }
  return svg;
}

/** The header's Following button: a count badge when anyone is followed, and the count in its accessible name. */
export function setFollowButton(btn, badge, n) {
  if (!btn) return;
  btn.setAttribute("aria-label", n ? `Following, ${n} ${n === 1 ? "player" : "players"}` : "Following");
  if (badge) { badge.textContent = n ? String(n) : ""; badge.hidden = !n; }
}
