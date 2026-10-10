import test from "node:test";
import assert from "node:assert/strict";
import * as L from "../js/players-list.js";
import { createStorage, readLegacyFollows } from "../js/storage.js";

const P = (id, name, score, extra = {}) => ({ playerId: String(id), display_name: name, short_name: name, club: "X FC", score, is_prospect: false, ...extra });
const list = L.prepare([
  P(1, "Chris Richards", 100), P(2, "Lucas de la Torre", 60), P(3, "Słonina Gabriel", 12),
  P(4, "Tim Weah", 60), P(5, "Cavan Sullivan", 15, { is_prospect: true, youth_level: "U20" }),
  P(6, "Matt Freese", 60, { club: "Évian" }),
]);

test("fold handles accents and non-decomposing letters", () => {
  assert.equal(L.fold("Słonina Évian Ø"), "slonina evian o");
});
test("surname key keeps particles with the surname", () => {
  assert.equal(L.surnameKey("Lucas de la Torre"), "de la torre lucas");
  assert.equal(L.surnameKey("Chris Richards"), "richards chris");
  assert.equal(L.surnameKey("Pelé"), "pele");
});
test("initials", () => {
  assert.equal(L.initials("Chris Richards"), "CR");
  assert.equal(L.initials("Pelé"), "P");
  assert.equal(L.initials(""), "?");
});
test("relevance sort: ties share a number and fall back to A-Z surname", () => {
  const out = L.sortPlayers(list, "rel").map((p) => p.display_name);
  assert.deepEqual(out.slice(0, 4), ["Chris Richards", "Lucas de la Torre", "Matt Freese", "Tim Weah"]);
});
test("A-Z sort is by surname", () => {
  const out = L.sortPlayers(list, "az").map((p) => p.display_name);
  assert.equal(out[0], "Lucas de la Torre");   // "de la Torre" sorts under D
  assert.equal(out[out.length - 1], "Tim Weah");
});
test("filters: prospects are exactly the badge wearers; capped prospects are seniors", () => {
  const f = new Set();
  assert.deepEqual(L.visible(list, { filter: "prospects", query: "", sort: "az", follows: f }).map((p) => p.playerId), ["5"]);
  assert.equal(L.visible(list, { filter: "seniors", query: "", sort: "az", follows: f }).length, 5);
});
test("following filter + counts", () => {
  const f = new Set(["1", "5", "99"]);
  assert.deepEqual(L.counts(list, f), { all: 6, seniors: 5, prospects: 1, following: 2 });
  assert.equal(L.visible(list, { filter: "following", query: "", sort: "rel", follows: f }).length, 2);
  assert.deepEqual(L.missingFollows(list, f), ["99"]);
});
test("search: every word, accent-insensitive, name or club", () => {
  const f = new Set();
  const q = (query) => L.visible(list, { filter: "all", query, sort: "az", follows: f }).map((p) => p.playerId);
  assert.deepEqual(q("slonina"), ["3"]);
  assert.deepEqual(q("evian freese"), ["6"]);
  assert.deepEqual(q("torre lucas"), ["2"]);
  assert.deepEqual(q("zzz"), []);
  assert.equal(q("  ").length, 6);
});
test("legacy follows are read, junk is dropped", () => {
  const st = createStorage({ localStorage: null });
  st.set("slate-follows", JSON.stringify([123, "456", "bad id!", null]));
  assert.deepEqual(readLegacyFollows(st), ["123", "456"]);
  st.set("slate-follows", "not json");
  assert.deepEqual(readLegacyFollows(st), []);
});
