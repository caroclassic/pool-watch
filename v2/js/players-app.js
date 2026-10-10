// players-app.js — the Players page. Same data layer, follows store and sheets
// as Matches; the list logic is in players-list.js.

import { dataBase, FULL_REFRESH_MS } from "./config.js";
import { createHttpSource } from "./data.js";
import { createStorage, createFollowsStore, createFlags, readLegacyFollows } from "./storage.js";
import { indexPlayers, tierLabel, lastNamedLine } from "./players-model.js";
import { mergeFeeds, nextMatchFor } from "./model.js";
import { prepare, counts, visible, missingFollows, initials, FILTERS, FILTER_LABEL } from "./players-list.js";
import { h, clear } from "./ui/dom.js";
import { playerSheet, followingSheet, legendSheet, saveSheet, importSheet } from "./ui/sheets.js";
import { parseHash, decodeShare } from "./storage.js";

const isLocal = ["localhost", "127.0.0.1", ""].includes(location.hostname);
const params = new URLSearchParams(location.search);
const devNow = isLocal && params.get("now") ? Date.parse(params.get("now")) : null;
const bootedAt = Date.now();
const clockMs = () => (devNow !== null && !Number.isNaN(devNow) ? devNow + (Date.now() - bootedAt) : Date.now());
const nowDate = () => new Date(clockMs());
const viewerTz = () => (isLocal && params.get("tz")) || Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";

const storage = createStorage();
const follows = createFollowsStore(storage, nowDate);
const flags = createFlags(storage);
if (!follows.count() && !flags.get("legacy-follows")) { follows.merge(readLegacyFollows(storage)); flags.set("legacy-follows"); }

const S = {
  list: [], map: new Map(), feed: null, updatedAt: null,
  views: null,                 // merged matches, once matches.json has loaded (null = unknown)
  filter: "all", query: "", sort: storage.get("sxi.players.sort") === "az" ? "az" : "rel",
  error: null, loaded: false,
};
const $ = (id) => document.getElementById(id);
const els = { controls: $("controls"), list: $("list"), count: $("count"), banners: $("banners"), head: $("follow-count") };

const source = createHttpSource({ base: dataBase(), clock: clockMs });

// ── actions ─────────────────────────────────────────────────────────────────
function toggleFollow(id) {
  if (follows.has(id)) { follows.remove(id); return false; }
  follows.add(id);
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch { /* best effort */ }
  return true;
}
const openPlayer = (id, from) => playerSheet(S.map.get(String(id)) || null, String(id), {
  followed: follows.has(id), onToggle: toggleFollow, now: nowDate(), from,
});
const openSave = (from) => saveSheet({
  follows, players: S.map, from, baseUrl: location.origin + location.pathname,
  onImport: (ids) => importSheet({ ids, follows, players: S.map, onMerge: () => follows.merge(ids), onReplace: () => follows.replace(ids) }),
});
const openFollowing = (from) => followingSheet({
  follows, players: S.map, from, onSave: () => openSave(from), onUnfollow: (id) => follows.remove(id),
  nextFor: (id) => (S.views ? nextMatchFor(S.views, id, nowDate(), viewerTz()) : undefined),
});

// ── rendering ───────────────────────────────────────────────────────────────
function tile(p) {
  const followed = follows.has(p.playerId);
  const ln = lastNamedLine(p, nowDate());
  const sub = [p.position, p.club].filter(Boolean).join(" · ");
  const photo = p.photo
    ? h("img", { src: p.photo, alt: "", width: 52, height: 52, loading: "lazy", decoding: "async", referrerpolicy: "no-referrer", onerror: (e) => e.target.remove() })
    : null;
  return h("li", { class: `ptile${followed ? " is-followed" : ""}`, dataset: { pid: p.playerId } },
    h("span", { class: "avatar", "aria-hidden": "true" }, h("span", { class: "initials" }, initials(p.display_name)), photo),
    h("div", { class: "pt-body" },
      h("button", { type: "button", class: "pt-name", onclick: (e) => openPlayer(p.playerId, e.currentTarget) }, p.display_name),
      h("p", { class: "pt-tier" },
        h("span", { class: `pt-word${p.is_prospect ? " is-prospect" : ""}` }, tierLabel(p)),
        h("span", { class: "pt-num" }, " · ", h("span", { class: "sr-only" }, "Pool relevance "), String(p.score))),
      sub ? h("p", { class: "pt-sub" }, sub) : null,
      h("p", { class: `pt-last${ln.muted ? " is-muted" : ""}` }, ln.text, ln.rel ? ` · ${ln.rel}` : "")),
    h("button", {
      type: "button", class: "btn btn-follow btn-sm", "aria-pressed": String(followed),
      "aria-label": `${followed ? "Unfollow" : "Follow"} ${p.display_name}`,
      onclick: () => { toggleFollow(p.playerId); },
    }, followed ? "Following ✓" : "Follow"));
}

function missingTile(id) {
  return h("li", { class: "ptile is-followed", dataset: { pid: id } },
    h("span", { class: "avatar", "aria-hidden": "true" }, h("span", { class: "initials" }, "?")),
    h("div", { class: "pt-body" },
      h("p", { class: "pt-name-static" }, `Player ${id}`),
      h("p", { class: "pt-last is-muted" }, "No longer in the pool")),
    h("button", { type: "button", class: "btn btn-quiet btn-sm", "aria-label": `Unfollow player ${id}`, onclick: () => follows.remove(id) }, "Unfollow"));
}

let lastCtl = "";
function renderControls(c) {
  const sig = JSON.stringify([S.filter, S.sort, c]);
  if (sig === lastCtl) return;
  lastCtl = sig;
  const hadFocus = els.controls.contains(document.activeElement) ? document.activeElement.dataset.k : null;
  const q = els.controls.querySelector("input");
  const qv = q ? q.value : S.query, qFocus = q && document.activeElement === q;
  clear(els.controls).append(
    h("input", { type: "search", class: "search", id: "q", placeholder: "Search players or clubs", autocomplete: "off", "aria-label": "Search players or clubs", value: qv, dataset: { k: "q" },
      oninput: (e) => { S.query = e.target.value; renderList(); } }),
    h("div", { class: "filters", role: "group", "aria-label": "Show" },
      FILTERS.map((f) => h("button", { type: "button", class: "fchip", dataset: { k: `f-${f}` }, "aria-pressed": String(S.filter === f),
        onclick: () => { S.filter = f; render(); } }, `${FILTER_LABEL[f]} `, h("span", { class: "fnum" }, String(c[f]))))),
    h("div", { class: "sort", role: "group", "aria-label": "Sort players" },
      [["rel", "Relevance"], ["az", "A–Z"]].map(([k, label]) => h("button", { type: "button", dataset: { k: `s-${k}` }, "aria-pressed": String(S.sort === k),
        onclick: () => { S.sort = k; storage.set("sxi.players.sort", k); render(); } }, label))));
  const target = qFocus ? els.controls.querySelector("input") : hadFocus ? els.controls.querySelector(`[data-k="${hadFocus}"]`) : null;
  if (target) target.focus();
}

function renderList() {
  const fol = follows.ids();
  const rows = visible(S.list, { filter: S.filter, query: S.query, sort: S.sort, follows: fol });
  const gone = S.filter === "following" && !S.query.trim() ? missingFollows(S.list, fol) : [];
  const total = rows.length + gone.length;
  els.count.textContent = S.query.trim() || S.filter !== "all" ? `${total} of ${S.list.length} players` : `${S.list.length} players`;

  clear(els.list);
  if (!total) {
    const msg = S.filter === "following" && !S.query.trim()
      ? "You aren't following anyone yet. Tap Follow on any player and they'll show up here."
      : "No players match that search.";
    els.list.append(h("li", { class: "empty" }, msg));
    return;
  }
  els.list.append(...rows.map(tile), ...gone.map(missingTile));
}

function render() {
  if (!S.loaded) return;
  const fol = follows.ids();
  renderControls(counts(S.list, fol));
  els.head.textContent = follows.count() ? `Following · ${follows.count()}` : "Following";
  renderList();
  const stamp = $("stamp");
  if (stamp && S.updatedAt) stamp.textContent = `Updated ${new Date(S.updatedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: viewerTz() })}`;
}

function banner() {
  clear(els.banners);
  if (!S.error) return;
  els.banners.append(S.loaded
    ? h("div", { class: "banner", role: "status" }, "Couldn't refresh just now. Showing the last update we have.")
    : h("div", { class: "banner banner-error", role: "alert" }, h("p", null, "Couldn't load players right now."),
        h("button", { type: "button", class: "btn", onclick: load }, "Try again")));
}

// ── data ────────────────────────────────────────────────────────────────────
async function load() {
  try {
    const feed = await source.getPlayers();
    S.feed = feed; S.list = prepare(feed.players || []); S.map = indexPlayers(feed);
    S.updatedAt = feed.updated_at; S.error = null; S.loaded = true;
    $("main").removeAttribute("aria-busy");
  } catch (e) { S.error = e; }
  banner(); render();
}

// matches.json is only needed for "next match" in the Following sheet; a failure there is silent.
async function loadMatches() {
  try {
    const [m, s] = await Promise.all([source.getMatches(), source.getStatus().catch(() => null)]);
    S.views = mergeFeeds(m, s);
  } catch { S.views = null; }
}

function boot() {
  $("legend-btn").addEventListener("click", (e) => legendSheet({ from: e.currentTarget }));
  $("follow-btn").addEventListener("click", (e) => openFollowing(e.currentTarget));
  follows.subscribe(render);
  window.addEventListener("storage", () => location.reload());   // another tab changed follows
  const h0 = parseHash(location.hash);
  load().then(() => {
    const ids = h0.f ? decodeShare(h0.f) : null;
    if (h0.f) { try { history.replaceState(null, "", location.pathname + location.search); } catch { /* ignore */ } }
    if (ids && ids.length) importSheet({ ids, follows, players: S.map, onMerge: () => follows.merge(ids), onReplace: () => follows.replace(ids) });
  });
  loadMatches();
  setInterval(() => { if (document.visibilityState !== "hidden") { load(); loadMatches(); } }, FULL_REFRESH_MS);
}
boot();
