import test from "node:test";
import assert from "node:assert/strict";
import { THEMES, THEME_KEY, readTheme, nextTheme, applyTheme, themeLabel } from "../js/theme.js";

const store = (v) => ({ get: (k) => (k === THEME_KEY ? v : null) });

// A just-enough DOM: <html> attributes plus two theme-color metas.
function fakeDoc() {
  const attrs = new Map();
  const mk = (content) => { const a = new Map([["content", content]]);
    return { getAttribute: (k) => (a.has(k) ? a.get(k) : null), setAttribute: (k, v) => a.set(k, v) }; };
  const metas = [mk("#EDEAE2"), mk("#161614")];
  return { metas, attrs, documentElement: { setAttribute: (k, v) => attrs.set(k, v), removeAttribute: (k) => attrs.delete(k) },
           querySelectorAll: () => metas };
}

test("readTheme: saved value, or auto for missing / junk / a throwing store", () => {
  assert.equal(readTheme(store("dark")), "dark");
  assert.equal(readTheme(store("light")), "light");
  assert.equal(readTheme(store("auto")), "auto");
  assert.equal(readTheme(store(null)), "auto");
  assert.equal(readTheme(store("purple")), "auto");
  assert.equal(readTheme(null), "auto");
  assert.equal(readTheme({ get() { throw new Error("blocked"); } }), "auto");
});

test("nextTheme cycles auto → light → dark → auto", () => {
  assert.deepEqual(THEMES, ["auto", "light", "dark"]);
  assert.equal(nextTheme("auto"), "light");
  assert.equal(nextTheme("light"), "dark");
  assert.equal(nextTheme("dark"), "auto");
  assert.equal(nextTheme("junk"), "auto");
});

test("applyTheme: explicit choices set data-theme and browser colour; auto clears and restores", () => {
  const d = fakeDoc();
  applyTheme("dark", d);
  assert.equal(d.attrs.get("data-theme"), "dark");
  assert.deepEqual(d.metas.map((m) => m.getAttribute("content")), ["#161614", "#161614"]);
  applyTheme("light", d);
  assert.equal(d.attrs.get("data-theme"), "light");
  assert.deepEqual(d.metas.map((m) => m.getAttribute("content")), ["#EDEAE2", "#EDEAE2"]);
  applyTheme("auto", d);
  assert.equal(d.attrs.has("data-theme"), false);
  assert.deepEqual(d.metas.map((m) => m.getAttribute("content")), ["#EDEAE2", "#161614"]);   // the originals, per media query
});

test("every state has a word label (never icon alone)", () => {
  assert.deepEqual(THEMES.map(themeLabel), ["Auto", "Light", "Dark"]);
});
