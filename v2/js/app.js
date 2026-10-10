// app.js — the Matches page. Wires data → model → DOM. All decisions live in
// model.js; all markup in ui/*. This file owns state and the render loop.

import { dataBase, STALE_MINUTES, STRIP_BACK, STRIP_AHEAD } from "./config.js";
import { createHttpSource, createPoller, shouldPollFast, pollDelay } from "./data.js";
import {
  mergeFeeds, tiersEnabled, buildDay, dayFacts, stripDays, inWindow,
  nextMatchDay, nextMatchFor, followedChanges,
} from "./model.js";
import { createStorage, createFollowsStore, createFlags, parseHash, buildHash, decodeShare, readLegacyFollows } from "./storage.js";
import { indexPlayers } from "./players-model.js";
import { etDateKey, dayHeader, dayHeading, weekdayLong, relativeMinutes, localTime, addDays } from "./time.js";
import { INTRO } from "./copy.js";
import { h, clear } from "./ui/dom.js";
import { renderCard } from "./ui/card.js";
import { renderStrip } from "./ui/strip.js";
import { playerSheet, followingSheet, legendSheet, saveSheet, importSheet, closeSheet } from "./ui/sheets.js";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// ── environment (dev overrides only on localhost) ───────────────────────────
const params = new URLSearchParams(location.search);
const isLocal = ["localhost", "127.0.0.1", ""].includes(location.hostname);
const devTz = isLocal && params.get("tz");
const devNow = isLocal && params.get("now") ? Date.parse(params.get("now")) : null;
const bootedAt = Date.now();
const clockMs = () => (devNow !== null && !Number.isNaN(devNow) ? devNow + (Date.now() - bootedAt) : Date.now());
const nowDate = () => new Date(clockMs());
const viewerTz = () => devTz || Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";

// ── state ───────────────────────────────────────────────────────────────────
const storage = createStorage();
const follows = createFollowsStore(storage, nowDate);
const flags = createFlags(storage);
if (!follows.count() && !flags.get("legacy-follows")) { follows.merge(readLegacyFollows(storage)); flags.set("legacy-follows"); }

const S = {
  data: null,            // { matches, status, players }
  views: [],
  players: new Map(),
  error: null,
  selected: null,        // ET day key on screen
  anchorToday: etDateKey(nowDate()),   // the "today" the person is looking at (rollover banner)
  expanded: new Set(),
  introGone: flags.get("intro"),
};

const $ = (id) => document.getElementById(id);
const els = { main: $("main"), strip: $("strip"), head: $("follow-count"), live: $("aria-live"), banners: $("banners") };

const todayKey = () => etDateKey(nowDate());

function ctx(dayKey) {
  return {
    views: S.views, dayKey, todayKey: todayKey(), follows: follows.ids(), players: S.players,
    now: nowDate(), tz: viewerTz(), statusFeed: S.data && S.data.status,
    staleMinutes: STALE_MINUTES, tiersEnabled: tiersEnabled(S.data && S.data.matches),
  };
}

// ── actions ─────────────────────────────────────────────────────────────────
function selectDay(key, { focus = false } = {}) {
  if (!DAY_RE.test(key)) return;
  S.selected = key;
  try { history.replaceState(null, "", location.pathname + location.search + buildHash({ d: key === todayKey() ? null : key })); } catch { /* file:// etc. */ }
  render();
  if (focus) { const t = els.strip.querySelector(`[data-day="${key}"]`); if (t) t.focus(); }
}

function toggleFollow(id) {
  if (follows.has(id)) { follows.remove(id); return false; }
  follows.add(id);
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch { /* best effort */ }
  return true;
}

function openPlayer(id, el) {
  const card = el && el.closest && el.closest(".card");
  const sel = card ? `[data-id="${CSS.escape(card.dataset.id)}"] [data-pid="${CSS.escape(String(id))}"]` : null;
  const from = sel ? () => document.querySelector(sel) || el : el;
  playerSheet(S.players.get(String(id)) || null, String(id), {
    followed: follows.has(id), onToggle: toggleFollow, now: nowDate(), from,
  });
}

function openFollowing(from) {
  followingSheet({
    follows, players: S.players, from,
    nextFor: (id) => nextMatchFor(S.views, id, nowDate(), viewerTz()),
    onUnfollow: (id) => follows.remove(id),
    onSave: () => openSave(from),
  });
}

function openSave(from) {
  saveSheet({
    follows, players: S.players, from, baseUrl: location.origin + location.pathname,
    onImport: (ids) => openImport(ids),
  });
}

function openImport(ids) {
  importSheet({
    ids, follows, players: S.players,
    onMerge: () => follows.merge(ids),
    onReplace: () => follows.replace(ids),
  });
}

function toggleExpand(cardId) {
  if (S.expanded.has(cardId)) S.expanded.delete(cardId); else S.expanded.add(cardId);
  render();
  const btn = document.querySelector(`[data-id="${CSS.escape(cardId)}"] .chip-more`);
  if (btn) btn.focus();
}

// ── rendering ───────────────────────────────────────────────────────────────
let lastSig = { main: "", strip: "", banners: "", head: "" };

function section(label, cards, { cls = "", sub = null } = {}) {
  if (!cards.length) return null;
  const ui = { expanded: S.expanded, onPlayer: openPlayer, onToggleExpand: toggleExpand };
  return h("section", { class: `band ${cls}`, "aria-label": label },
    label ? h("h2", { class: "band-title" }, label, sub ? h("span", { class: "band-sub" }, ` ${sub}`) : null) : null,
    cards.map((c) => renderCard(c, ui)));
}

function emptyState(day, c) {
  const w = weekdayLong(day);
  if (!inWindow(S.data.matches, day)) {
    return h("div", { class: "empty" },
      h("p", { class: "empty-title" }, "This day isn't published yet."),
      h("p", { class: "dim" }, "Matches appear here closer to the date."));
  }
  const next = nextMatchDay(S.views, day);
  return h("div", { class: "empty" },
    h("p", { class: "empty-title" }, `No pool matches on ${w}.`),
    next ? h("p", null, h("button", { type: "button", class: "btn-link", onclick: () => selectDay(next) }, `Next match day: ${dayHeading(next)}`)) : null);
}

function renderMain() {
  const day = S.selected;
  const c = ctx(day);
  const d = buildDay(c);
  const today = day === c.todayKey;
  const head = dayHeader(day, c.tz, c.now);
  const ui = { expanded: S.expanded, onPlayer: openPlayer, onToggleExpand: toggleExpand };

  const intro = !S.introGone && follows.count() === 0
    ? h("aside", { class: "intro", "aria-label": "How to follow players" },
        h("p", null, h("b", null, INTRO.lead), INTRO.body, h("b", null, INTRO.strong), INTRO.tail),
        h("button", { type: "button", class: "btn-link", onclick: () => { flags.set("intro"); S.introGone = true; render(); } }, "Got it"))
    : null;

  const nodes = [
    intro,
    h("div", { class: "day-head" },
      h("h2", { class: "day-title" }, head.title),
      head.zoneNote ? h("span", { class: "zone-note" }, head.zoneNote) : null),
  ];

  if (today && d.stillLive.length) {
    const byDay = d.stillLive.map((x) => x.card);
    nodes.push(section(`Still live from ${weekdayLong(d.stillLive[0].day)}`, byDay, { cls: "band-live" }));
  }

  if (d.total === 0 && !d.stillLive.length) {
    nodes.push(emptyState(day, c));
  } else {
    nodes.push(section("Your players", d.pinned, { cls: "band-pinned" }));
    nodes.push(section("Live now", d.live, { cls: "band-live" }));
    nodes.push(section("Must-watch", d.must, { cls: "band-must" }));
    if (d.noMustCopy) nodes.push(h("p", { class: "no-must" }, d.noMustCopy));
    const hasAbove = d.pinned.length || d.live.length || d.must.length;
    nodes.push(section(hasAbove ? "Everything else" : "", d.rest));
    nodes.push(section("Postponed or cancelled", d.disrupted, { cls: "band-disrupted" }));
    if (d.earlier.length) {
      nodes.push(h("details", { class: "earlier" },
        h("summary", null, `Earlier (${d.earlier.length})`),
        d.earlier.map((x) => renderCard(x, ui))));
    }
  }

  if (d.notPlaying.length) {
    nodes.push(h("p", { class: "not-playing" },
      h("b", null, today ? "Not playing today: " : "Not playing this day: "),
      d.notPlaying.map((x, i) => [i ? "; " : "", `${x.name} (${x.reason})`])));
  }

  nodes.push(footer());
  return { nodes, sig: JSON.stringify([d, head, today, S.introGone, follows.count() === 0, [...S.expanded], Math.floor(clockMs() / 60000)]) };
}

function footer() {
  const st = S.data && S.data.status;
  const upd = st && st.updated_at ? `Updated ${localTime(st.updated_at, viewerTz())} · ${relativeMinutes(st.updated_at, nowDate())}` : null;
  return h("footer", { class: "foot" },
    upd ? h("p", { class: "dim small" }, upd) : null,
    h("p", { class: "small" }, h("a", { href: "about.html" }, "About"), " · ", h("button", { type: "button", class: "btn-link", onclick: (e) => legendSheet({ from: e.currentTarget }) }, "Legend")));
}

function renderBanners() {
  const out = [];
  if (S.error && !S.data) {
    out.push(h("div", { class: "banner banner-error", role: "alert" },
      h("p", null, "Couldn't load matches right now."),
      h("button", { type: "button", class: "btn", onclick: () => poller.refresh() }, "Try again")));
  } else if (S.error) {
    out.push(h("div", { class: "banner", role: "status" }, "Couldn't refresh just now. Showing the last update we have."));
  }
  const t = todayKey();
  if (S.data && t !== S.anchorToday) {
    out.push(h("div", { class: "banner banner-roll", role: "status" },
      h("span", null, `It's now ${dayHeading(t)}.`),
      h("button", { type: "button", class: "btn-link", onclick: () => { S.anchorToday = t; selectDay(t); } }, "Go to today")));
  }
  return out;
}

function render() {
  if (!S.data) {
    const b = renderBanners();
    clear(els.banners).append(...b);
    if (!S.error) els.main.setAttribute("aria-busy", "true");
    return;
  }
  els.main.removeAttribute("aria-busy");

  if (!S.selected) S.selected = todayKey();

  // banners
  const bn = renderBanners();
  const bsig = bn.map((n) => n.textContent).join("|");
  if (bsig !== lastSig.banners) { clear(els.banners).append(...bn); lastSig.banners = bsig; }

  // header chip
  const hsig = String(follows.count());
  if (hsig !== lastSig.head) {
    els.head.textContent = follows.count() ? `Following · ${follows.count()}` : "Following";
    lastSig.head = hsig;
  }

  // strip
  const c = ctx(S.selected);
  const days = stripDays(c.todayKey, STRIP_BACK, STRIP_AHEAD);
  if (!days.includes(S.selected)) days.push(S.selected), days.sort();
  const facts = dayFacts(S.views, c);
  const ssig = JSON.stringify([S.selected, c.todayKey, days, [...facts]]);
  if (ssig !== lastSig.strip) {
    const prev = els.strip.querySelector(".strip");
    const left = prev ? prev.scrollLeft : null;
    clear(els.strip).append(renderStrip({
      days, selected: S.selected, today: c.todayKey, facts,
      inWindow: (k) => inWindow(S.data.matches, k),
      onSelect: selectDay, onToday: () => selectDay(c.todayKey), onPick: selectDay,
    }));
    const strip = els.strip.querySelector(".strip");
    const sel = strip.querySelector(".is-selected");
    if (left !== null && !S.scrollStrip) strip.scrollLeft = left;
    else if (sel) strip.scrollLeft = Math.max(0, sel.offsetLeft - (strip.clientWidth - sel.offsetWidth) / 2);
    S.scrollStrip = false;
    lastSig.strip = ssig;
  }

  // body
  const { nodes, sig } = renderMain();
  if (sig !== lastSig.main) {
    const y = window.scrollY;
    clear(els.main).append(...nodes.flat().filter(Boolean));
    lastSig.main = sig;
    if (y) window.scrollTo(0, y);
  }
}

// ── data flow ───────────────────────────────────────────────────────────────
const source = createHttpSource({ base: dataBase(), clock: clockMs });
let poller;

function onData(data, { first }) {
  const prevViews = S.views;
  S.data = data;
  S.views = mergeFeeds(data.matches, data.status);
  S.players = indexPlayers(data.players);
  S.error = null;

  if (!first) {
    const msgs = followedChanges(prevViews, S.views, follows.ids(), S.players);
    if (msgs.length) els.live.textContent = msgs.join(". ");
  }
  if (first) {
    const hash = parseHash(location.hash);
    S.selected = hash.d && DAY_RE.test(hash.d) ? hash.d : todayKey();
    S.scrollStrip = true;
    handleShare(hash.f);
  }
  render();
}

function onError(err) {
  S.error = err;
  render();
}

function handleShare(code) {
  if (!code) return;
  const ids = decodeShare(code);
  try { history.replaceState(null, "", location.pathname + location.search + buildHash({ d: parseHash(location.hash).d })); } catch { /* ignore */ }
  if (ids && ids.length) openImport(ids);
}

// ── boot ────────────────────────────────────────────────────────────────────
function boot() {
  $("legend-btn").addEventListener("click", (e) => legendSheet({ from: e.currentTarget }));
  $("follow-btn").addEventListener("click", (e) => openFollowing(e.currentTarget));
  follows.subscribe(() => render());
  window.addEventListener("hashchange", () => {
    const hash = parseHash(location.hash);
    if (hash.f) handleShare(hash.f);
    else if (hash.d && DAY_RE.test(hash.d) && hash.d !== S.selected && S.data) selectDay(hash.d);
  });
  window.addEventListener("pageshow", (e) => { if (e.persisted) poller.refresh(); });

  poller = createPoller({
    source, clock: clockMs,
    delay: (data) => pollDelay(shouldPollFast(mergeFeeds(data.matches, data.status), data.status, nowDate())),
    onData, onError,
  });
  poller.start();
  setInterval(() => { if (S.data && document.visibilityState !== "hidden") render(); }, 30_000);
  render();
}

boot();
