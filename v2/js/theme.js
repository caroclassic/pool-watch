// theme.js — Auto / Light / Dark. "Auto" is the default and follows the device
// (the stylesheet's prefers-color-scheme block); Light and Dark override it by
// setting data-theme on <html>. The choice lives on this device only, like
// follows. A tiny inline script in each page's <head> applies a saved Light/Dark
// before first paint (otherwise a light choice on a dark phone would flash dark);
// everything else is here.

export const THEMES = ["auto", "light", "dark"];
export const THEME_KEY = "sxi.theme";
const LABEL = { auto: "Auto", light: "Light", dark: "Dark" };
const ICON = { auto: "◐", light: "☀", dark: "☾" };
// Browser UI colour (mobile address bar) per explicit theme; must match --bg in app.css.
const BROWSER_COLOR = { light: "#EDEAE2", dark: "#161614" };

export const themeLabel = (t) => LABEL[t] || LABEL.auto;

/** The saved theme, or "auto" for anything missing, unreadable or unrecognised. */
export function readTheme(storage) {
  try {
    const v = storage && storage.get(THEME_KEY);
    return THEMES.includes(v) ? v : "auto";
  } catch { return "auto"; }
}

/** auto → light → dark → auto */
export function nextTheme(cur) {
  const i = THEMES.indexOf(cur);
  return THEMES[(i + 1) % THEMES.length];
}

/** Set (or clear) data-theme and keep the browser's theme-color meta tags in step. */
export function applyTheme(theme, doc = document) {
  const root = doc.documentElement;
  if (theme === "light" || theme === "dark") root.setAttribute("data-theme", theme);
  else root.removeAttribute("data-theme");
  for (const m of doc.querySelectorAll('meta[name="theme-color"]')) {
    if (m.getAttribute("data-sxi-orig") === null) m.setAttribute("data-sxi-orig", m.getAttribute("content") || "");
    m.setAttribute("content", BROWSER_COLOR[theme] || m.getAttribute("data-sxi-orig"));
  }
}

/** Wire the header button: shows the current theme in words, cycles on press, saves the choice.
 *  Never throws: a problem here must not take the rest of the page (Following, Legend) down,
 *  and it is logged to the console so a misbehaving browser leaves a trace. */
export function mountThemeButton(btn, storage, doc = document) {
  if (!btn) return;
  try {
    let cur = readTheme(storage);
    const render = () => {
      const next = nextTheme(cur);
      btn.textContent = "";
      const icon = doc.createElement("span");
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = ICON[cur];
      btn.append(icon, ` ${themeLabel(cur)}`);
      btn.setAttribute("aria-label", `Theme: ${themeLabel(cur)}${cur === "auto" ? ", follows your device" : ""}. Press to switch to ${themeLabel(next)}.`);
      btn.title = `Theme: ${themeLabel(cur)}`;
    };
    applyTheme(cur, doc);
    render();
    btn.addEventListener("click", () => {
      try {
        cur = nextTheme(cur);
        storage.set(THEME_KEY, cur);
        applyTheme(cur, doc);
        render();
      } catch (err) { console.error("theme button:", err); }
    });
  } catch (err) { console.error("theme button failed to start:", err); }
}
