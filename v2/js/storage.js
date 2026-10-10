// storage.js — the storage adapter and the follows store.
//
// Follows live on this device for now (spec §2.2, §6.4). Everything that
// touches storage goes through here so accounts can replace the backend later
// without the UI changing:
//   createStorage()          key/value over localStorage, falling back to memory
//   createFollowsStore(st)   versioned follows, merge-friendly, observable
//   encodeShare / decodeShare   "v1.<base64url>" codes for the share link and export

const FOLLOWS_KEY = "sxi.follows";
const VERSION = 1;

/** localStorage when it works, an in-memory map when it does not (private mode, blocked storage). */
export function createStorage(win = globalThis) {
  const mem = new Map();
  let ls = null;
  try {
    const probe = "__sxi_probe__";
    win.localStorage.setItem(probe, "1");
    win.localStorage.removeItem(probe);
    ls = win.localStorage;
  } catch { ls = null; }
  return {
    persistent: ls !== null,
    get(key) {
      try { return ls ? ls.getItem(key) : (mem.has(key) ? mem.get(key) : null); } catch { return mem.get(key) ?? null; }
    },
    set(key, value) {
      try { if (ls) { ls.setItem(key, value); return true; } } catch { /* fall through */ }
      mem.set(key, value);
      return false;
    },
    remove(key) {
      try { if (ls) ls.removeItem(key); } catch { /* ignore */ }
      mem.delete(key);
    },
  };
}

/** Normalise whatever was stored into { v, follows[] }; never throws. */
export function migrate(raw) {
  let obj = null;
  try { obj = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { obj = null; }
  if (!obj || typeof obj !== "object") return { v: VERSION, follows: [], readOnly: false };
  const list = Array.isArray(obj.follows) ? obj.follows : [];
  const seen = new Set();
  const follows = [];
  for (const f of list) {
    const raw = f && typeof f === "object" ? f.playerId : f;
    if (raw === null || raw === undefined) continue;
    const id = String(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    follows.push({
      playerId: id,
      at: (f && f.at) || new Date(0).toISOString(),
      notify: false, // no alerts exist yet; stored so accounts can use it later, never rendered
    });
  }
  // A newer version than we understand: keep what we can read, but never overwrite it.
  return { v: VERSION, follows, readOnly: Number(obj.v) > VERSION };
}

export function createFollowsStore(storage, now = () => new Date()) {
  let state = migrate(storage.get(FOLLOWS_KEY));
  const subs = new Set();

  const save = () => {
    if (!state.readOnly) storage.set(FOLLOWS_KEY, JSON.stringify({ v: VERSION, follows: state.follows }));
    subs.forEach((fn) => { try { fn(); } catch { /* a listener must not break the store */ } });
  };

  return {
    list: () => state.follows.map((f) => ({ ...f })),
    ids: () => new Set(state.follows.map((f) => f.playerId)),
    count: () => state.follows.length,
    has: (id) => state.follows.some((f) => f.playerId === String(id)),
    add(id) {
      id = String(id);
      if (state.follows.some((f) => f.playerId === id)) return false;
      state.follows.push({ playerId: id, at: now().toISOString(), notify: false });
      save();
      return true;
    },
    remove(id) {
      id = String(id);
      const n = state.follows.length;
      state.follows = state.follows.filter((f) => f.playerId !== id);
      if (state.follows.length !== n) { save(); return true; }
      return false;
    },
    /** Union with another list (the share-link "Merge"). Returns how many were new. */
    merge(ids) {
      let added = 0;
      for (const id of ids) {
        const s = String(id);
        if (!state.follows.some((f) => f.playerId === s)) {
          state.follows.push({ playerId: s, at: now().toISOString(), notify: false });
          added += 1;
        }
      }
      if (added) save();
      return added;
    },
    /** Replace everything with another list (the share-link "Replace"). */
    replace(ids) {
      const at = now().toISOString();
      const seen = new Set();
      state.follows = [];
      for (const id of ids) {
        const s = String(id);
        if (seen.has(s)) continue;
        seen.add(s);
        state.follows.push({ playerId: s, at, notify: false });
      }
      save();
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    get readOnly() { return state.readOnly; },
  };
}

// ── share codes ─────────────────────────────────────────────────────────────

const b64url = {
  enc: (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  dec: (s) => {
    const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
    return new TextDecoder().decode(Uint8Array.from(atob(pad), (c) => c.charCodeAt(0)));
  },
};

/** "v1.<base64url of {"f":[ids]}>". Safe to put in a URL hash; never sent to a server. */
export function encodeShare(ids) {
  return `v${VERSION}.` + b64url.enc(JSON.stringify({ f: [...ids].map(String) }));
}

/** ids, or null if the code is not one we can read. */
export function decodeShare(code) {
  if (typeof code !== "string") return null;
  const m = /^v(\d+)\.([A-Za-z0-9_-]+)$/.exec(code.trim());
  if (!m || Number(m[1]) !== VERSION) return null;
  try {
    const obj = JSON.parse(b64url.dec(m[2]));
    if (!obj || !Array.isArray(obj.f)) return null;
    const ids = obj.f.map(String).filter((s) => /^[A-Za-z0-9_-]{1,40}$/.test(s));
    return [...new Set(ids)];
  } catch { return null; }
}

/** Read "#d=2026-10-12&f=v1...." into { d, f }. */
export function parseHash(hash) {
  const p = new URLSearchParams(String(hash || "").replace(/^#/, ""));
  return { d: p.get("d"), f: p.get("f") };
}

export function buildHash({ d, f }) {
  const p = new URLSearchParams();
  if (d) p.set("d", d);
  if (f) p.set("f", f);
  const s = p.toString();
  return s ? `#${s}` : "";
}

// ── small per-viewer flags (intro card dismissed, etc.) ─────────────────────

export function createFlags(storage) {
  return {
    get: (name) => storage.get(`sxi.flag.${name}`) === "1",
    set: (name) => storage.set(`sxi.flag.${name}`, "1"),
  };
}

// ── the previous site's follows ─────────────────────────────────────────────

/** Ids from the old static pages (`slate-follows`: a JSON array of player ids), or []. */
export function readLegacyFollows(storage) {
  try {
    const arr = JSON.parse(storage.get("slate-follows") || "[]");
    return Array.isArray(arr) ? arr.filter((x) => x !== null && x !== undefined).map(String).filter((s) => /^[A-Za-z0-9_-]{1,40}$/.test(s)) : [];
  } catch { return []; }
}
