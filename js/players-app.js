// players-app.js — the Players page. Same data layer, follows store and sheets
// as Matches; the list logic is in players-list.js.

import { dataBase, FULL_REFRESH_MS } from "./config.js";
import { createHttpSource } from "./data.js";
import { createStorage, createFollowsStore, createFlags, readLegacyFollows } from "./storage.js";
import { indexPlayers, tierLabel, lastNamedLine, ageLine, rowTier } from "./players-model.js";
import { mergeFeeds, nextMatchFor } from "./model.js";
import { prepare, visible, missingFollows, initials, involvementBands, FILTERS, FILTER_LABEL } from "./players-list.js";
import { h, clear } from "./ui/dom.js";
import { setFollowButton, setFollowState, icon } from "./ui/icons.js";
import { term } from "./ui/popover.js";
import { playerSheet, followingSheet, legendSheet, saveSheet, importSheet } from "./ui/sheets.js";
import { parseHash, decodeShare } from "./storage.js";
import { mountThemeButton } from "./theme.js";
import { ERRORS } from "./copy.js";
import { localTime } from "./time.js";

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
// One row (brand refresh, issue 7): photo, then name, details and "Last named" in one column, Follow centred. In the
// Involvement view the band heading states a senior's tier, so the row does not; elsewhere the tier leads the
// details line, except for a prospect never named to a senior squad, whose third line is the tier (rowTier).
function tile(p, inBand) {
  const followed = follows.has(p.playerId);
  const ln = lastNamedLine(p, nowDate());
  const { tierInDetails: tierHere, tierLine } = rowTier(p, inBand);
  const age = ageLine(p);
  // "Age 24" never splits, and a dot stays with the word before it when the line wraps
  const sub = [p.position, p.club, age && age.replace(" ", "\u00a0")].filter(Boolean).join("\u00a0· ");
  const photo = p.photo
    ? h("img", { src: p.photo, alt: "", width: 52, height: 52, loading: "lazy", decoding: "async", referrerpolicy: "no-referrer", onerror: (e) => e.target.remove() })
    : null;
  return h("li", { class: `ptile${followed ? " is-followed" : ""}`, dataset: { pid: p.playerId } },
    h("span", { class: "avatar", "aria-hidden": "true" }, h("span", { class: "initials" }, initials(p.display_name)), photo),
    h("div", { class: "pt-body" },
      h("button", { type: "button", class: "pt-name", onclick: (e) => openPlayer(p.playerId, e.currentTarget) }, p.display_name),
      tierHere || sub ? h("p", { class: "pt-sub" }, tierHere ? h("span", { class: "pt-tier" }, tierLabel(p)) : null, tierHere && sub ? "\u00a0· " : null, sub) : null,
      tierLine
        ? h("p", { class: "pt-last" }, h("span", { class: "pt-tier" }, tierLabel(p)))   // "PROSPECT · U21" (the card keeps "Youth level: U21")
        : h("p", { class: `pt-last${ln.muted ? " is-muted" : ""}` }, ln.text, ln.rel ? ` · ${ln.rel}` : "")),
    followBtn(p, followed));
}

function followBtn(p, followed) {
  const b = h("button", { type: "button", dataset: { size: "sm" }, onclick: () => { toggleFollow(p.playerId); } });
  setFollowState(b, followed, p.display_name);
  return b;
}

function missingTile(id) {
  return h("li", { class: "ptile is-followed", dataset: { pid: id } },
    h("span", { class: "avatar", "aria-hidden": "true" }, h("span", { class: "initials" }, "?")),
    h("div", { class: "pt-body" },
      h("p", { class: "pt-name-static" }, `Player ${id}`),
      h("p", { class: "pt-last is-muted" }, "No longer in the pool")),
    h("button", { type: "button", class: "btn btn-secondary btn-sm", "aria-label": `Unfollow player ${id}`, onclick: () => follows.remove(id) }, "Unfollow"));
}

let lastCtl = "";
const SORT_LABEL = { rel: "Involvement", az: "A–Z" };
function renderControls() {
  const sig = JSON.stringify([S.filter, S.sort]);
  if (sig === lastCtl) return;
  lastCtl = sig;
  const hadFocus = els.controls.contains(document.activeElement) ? document.activeElement.dataset.k : null;
  const q = els.controls.querySelector("input[type=search]");
  const qv = q ? q.value : S.query, qFocus = q && document.activeElement === q;
  const other = S.sort === "rel" ? "az" : "rel";
  clear(els.controls).append(
    h("div", { class: "search-wrap" }, icon("search", 20),
      h("input", { type: "search", class: "search", id: "q", placeholder: "Search players or clubs", autocomplete: "off", "aria-label": "Search players or clubs", value: qv, dataset: { k: "q" },
        oninput: (e) => { S.query = e.target.value; renderList(); } })),
    // one choice from four: native radios styled as segments (addendum §5), so arrows, checked state and announcements come free
    h("fieldset", { class: "seg" }, h("legend", { class: "sr-only" }, "Filter players"),
      FILTERS.map((f) => h("label", { class: "seg-opt" },
        h("input", { type: "radio", name: "pfilter", value: f, checked: S.filter === f, dataset: { k: `f-${f}` }, onchange: () => { S.filter = f; render(); } }),
        h("span", null, FILTER_LABEL[f])))),
    h("div", { class: "sort" },
      h("button", { type: "button", class: "btn-text", dataset: { k: "sort" }, "aria-label": `Sort: ${SORT_LABEL[S.sort]}. Press to sort by ${SORT_LABEL[other]}.`,
        onclick: () => { S.sort = other; storage.set("sxi.players.sort", other); render(); } }, `Sort: ${SORT_LABEL[S.sort]}`, icon("chevron_down", 16))));
  const target = qFocus ? els.controls.querySelector("input[type=search]") : hadFocus ? els.controls.querySelector(`[data-k="${hadFocus}"]`) : null;
  if (target) target.focus();
}

function renderList() {
  const fol = follows.ids();
  const rows = visible(S.list, { filter: S.filter, query: S.query, sort: S.sort, follows: fol });
  const gone = S.filter === "following" && !S.query.trim() ? missingFollows(S.list, fol) : [];
  const total = rows.length + gone.length;
  els.count.textContent = `${total} ${total === 1 ? "player" : "players"}`;   // the result count, once, above the list (addendum §4)

  const keep = focusInList();
  clear(els.list);
  if (!total) {
    const msg = S.filter === "following" && !S.query.trim()
      ? "You aren't following anyone yet. Tap Follow on any player and they'll show up here."
      : "No players match that search.";
    els.list.append(h("li", { class: "empty" }, msg));
  } else if (S.sort === "rel") {
    // Involvement: the tier is stated once, as a band heading (prospects stay inside the surrounding band)
    for (const b of involvementBands(rows, (p) => tierLabel(p))) {
      if (b.label) els.list.append(h("li", { class: "pband" }, h("h3", { class: "pband-title" }, b.label)));
      els.list.append(...b.rows.map((p) => tile(p, true)));
    }
    els.list.append(...gone.map(missingTile));
  } else {
    els.list.append(...rows.map((p) => tile(p, false)), ...gone.map(missingTile));
  }
  if (keep) restoreFocus(keep);
}

// The list is rebuilt on every Follow / Unfollow, which would drop a keyboard user's focus to the top of the page.
// Put it back on the same player's same button; if that tile is gone (unfollowed under "Following"), on the tile now
// in its place; if the list is empty, on the page's main region.
function focusInList() {
  const a = document.activeElement;
  const li = a && els.list.contains(a) ? a.closest("li") : null;
  if (!li) return null;
  return { pid: li.dataset.pid, name: a.classList.contains("pt-name"), idx: [...els.list.children].indexOf(li) };
}
function restoreFocus(k) {
  const li = [...els.list.children].find((n) => n.dataset.pid === k.pid);
  let t = li && (k.name ? li.querySelector(".pt-name") : li.querySelector(".btn-sm"));
  if (!t) {   // the tile is gone: the next row's Follow button (band headings have none), else the last one
    const kids = [...els.list.children];
    const n = kids.slice(Math.min(k.idx, kids.length - 1)).find((x) => x.querySelector(".btn-sm")) || kids.reverse().find((x) => x.querySelector(".btn-sm"));
    t = n && n.querySelector(".btn-sm");
  }
  (t || $("main")).focus();
}

function render() {
  if (!S.loaded) return;
  renderControls();
  setFollowButton($("follow-btn"), els.head, follows.count());
  renderList();
  const stamp = $("stamp");
  if (stamp && S.updatedAt) stamp.textContent = `Updated ${new Date(S.updatedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: viewerTz() })}`;
}

function banner() {
  clear(els.banners);
  // "Loading players…" would contradict "Couldn't load players" right above it
  const loading = els.list.querySelector(".loading");
  if (loading) loading.hidden = !!S.error;
  if (!S.error) return;
  els.banners.append(S.loaded
    ? h("div", { class: "banner", role: "status" }, S.updatedAt ? ERRORS.refreshAt(localTime(S.updatedAt, viewerTz())) : ERRORS.refresh)
    : h("div", { class: "banner banner-error", role: "alert" }, h("p", null, ERRORS.loadPlayers),
        h("button", { type: "button", class: "btn", onclick: load }, ERRORS.tryAgain)));
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
  clear($("scope")).append("The USMNT player pool, ranked by ", term("squad involvement", "involvement"), ". ", term("Follow", "follow"), " a player to pin his matches to the top of Matches.");
  mountThemeButton($("theme-btn"), storage);
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
