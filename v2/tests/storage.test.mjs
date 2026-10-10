import test from "node:test";
import assert from "node:assert/strict";
import * as S from "../js/storage.js";
import * as P from "../js/players-model.js";

const fakeWin = () => { const m = new Map(); return { localStorage: { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) } }; };
const brokenWin = { get localStorage() { throw new Error("blocked"); } };

test("storage falls back to memory when localStorage is blocked", () => {
  const st = S.createStorage(brokenWin);
  assert.equal(st.persistent, false);
  st.set("a", "1"); assert.equal(st.get("a"), "1"); st.remove("a"); assert.equal(st.get("a"), null);
});

test("follows: add / remove / persist across a reload", () => {
  const win = fakeWin();
  let s = S.createFollowsStore(S.createStorage(win));
  assert.equal(s.count(), 0);
  assert.equal(s.add(11), true); assert.equal(s.add("11"), false); s.add("12");
  assert.deepEqual([...s.ids()].sort(), ["11", "12"]);
  s = S.createFollowsStore(S.createStorage(win));           // "reload"
  assert.deepEqual([...s.ids()].sort(), ["11", "12"]);
  assert.equal(s.remove("11"), true); assert.equal(s.remove("11"), false);
  assert.deepEqual([...S.createFollowsStore(S.createStorage(win)).ids()], ["12"]);
});

test("stored shape is versioned, notify stays false", () => {
  const win = fakeWin(); const st = S.createStorage(win);
  S.createFollowsStore(st, () => new Date("2026-10-09T19:00:00Z")).add("p_001");
  assert.deepEqual(JSON.parse(st.get("sxi.follows")), { v: 1, follows: [{ playerId: "p_001", at: "2026-10-09T19:00:00.000Z", notify: false }] });
});

test("merge and replace", () => {
  const s = S.createFollowsStore(S.createStorage(fakeWin()));
  s.add("1"); s.add("2");
  assert.equal(s.merge(["2", "3", "4"]), 2);
  assert.deepEqual([...s.ids()].sort(), ["1", "2", "3", "4"]);
  s.replace(["9", "9", "8"]);
  assert.deepEqual([...s.ids()].sort(), ["8", "9"]);
});

test("subscribers are told; a throwing listener does not break saving", () => {
  const s = S.createFollowsStore(S.createStorage(fakeWin()));
  let n = 0; s.subscribe(() => { throw new Error("x"); }); s.subscribe(() => { n += 1; });
  s.add("1"); assert.equal(n, 1); assert.equal(s.count(), 1);
});

test("migrate: garbage, duplicates, bare ids, and a newer version are all safe", () => {
  assert.deepEqual(S.migrate("not json").follows, []);
  assert.deepEqual(S.migrate(null).follows, []);
  assert.deepEqual(S.migrate({ v: 1, follows: [{ playerId: 1 }, { playerId: "1" }, "2", null, {}] }).follows.map((f) => f.playerId), ["1", "2"]);
  const fut = S.migrate({ v: 2, follows: [{ playerId: "5" }] });
  assert.equal(fut.readOnly, true); assert.deepEqual(fut.follows.map((f) => f.playerId), ["5"]);
  const win = fakeWin(); win.localStorage.setItem("sxi.follows", JSON.stringify({ v: 2, follows: [{ playerId: "5" }], extra: 1 }));
  const s = S.createFollowsStore(S.createStorage(win)); s.add("6");
  assert.equal(JSON.parse(win.localStorage.getItem("sxi.follows")).v, 2);       // never overwritten
});

test("share codes round-trip and reject junk", () => {
  const code = S.encodeShare(["11", "p_002", "13"]);
  assert.match(code, /^v1\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(S.decodeShare(code), ["11", "p_002", "13"]);
  assert.deepEqual(S.decodeShare(`  ${code} `), ["11", "p_002", "13"]);
  assert.equal(S.decodeShare("v2.abc"), null);
  assert.equal(S.decodeShare("v1.!!!"), null);
  assert.equal(S.decodeShare("v1." + Buffer.from('{"f":"no"}').toString("base64url")), null);
  assert.deepEqual(S.decodeShare("v1." + Buffer.from('{"f":["ok","<script>","a b"]}').toString("base64url")), ["ok"]);
  assert.deepEqual(S.decodeShare(S.encodeShare([])), []);
  assert.equal(S.decodeShare(undefined), null);
});

test("hash read/write keeps day and follows apart", () => {
  const code = S.encodeShare(["1"]);
  const h = S.buildHash({ d: "2026-10-12", f: code });
  assert.deepEqual(S.parseHash(h), { d: "2026-10-12", f: code });
  assert.equal(S.buildHash({}), "");
  assert.deepEqual(S.parseHash(""), { d: null, f: null });
});

test("flags", () => {
  const f = S.createFlags(S.createStorage(fakeWin()));
  assert.equal(f.get("intro"), false); f.set("intro"); assert.equal(f.get("intro"), true);
});

test("players-model: tier labels, descriptors, last-named line", () => {
  assert.equal(P.tierLabel({ tier: "core" }), "Core");
  assert.equal(P.tierLabel({ tier: "in_the_mix" }), "In the mix");
  assert.equal(P.tierLabel({ is_prospect: true, youth_level: "U20", tier: "wider_pool" }), "Prospect · U20");
  assert.match(P.tierDescriptor({ is_prospect: true }), /Youth international/);
  assert.ok(!/(appearance|capped|played|caps?\b|last )/i.test(Object.values(P.TIER_DESCRIPTOR).join(" ")));      // spec 8.1: no squad-history claims
  const now = new Date("2026-10-09T12:00:00Z");
  const a = P.lastNamedLine({ last_named: { date: "2025-09-09", competition: "Friendly", opponent: "Japan" } }, now);
  assert.equal(a.text, "Last named: Sep 9, 2025 · Friendly vs Japan"); assert.equal(a.rel, "13 months ago"); assert.equal(a.muted, true);
  assert.equal(P.lastNamedLine({ last_named: { date: "2026-09-01", competition: "Friendly", opponent: null } }, now).muted, false);
  assert.equal(P.lastNamedLine({ last_named: { date: "2026-09-01", competition: "World Cup qualifier", opponent: null } }, now).text, "Last named: Sep 1, 2026 · World Cup qualifier");
  assert.equal(P.lastNamedLine({ last_named: null }, now).text, "Not yet named to a senior squad");
  assert.equal(P.lastNamedLine({ last_named: null, is_prospect: true, youth_level: "U20" }, now).text, "Youth level: U20");
  assert.equal(P.chipName(P.indexPlayers({ players: [{ playerId: 5, short_name: "A. B" }] }), "5"), "A. B");
  assert.equal(P.chipName(new Map(), "9"), "Player 9");
});
