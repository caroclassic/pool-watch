// config.js — the few knobs that are not the data.
//
// DATA_BASE is where matches.json / status.json / players.json live. The shell
// reads it from <html data-base="…">, so cutting over from /v2/ to the site
// root (or to an API later) is one attribute, not a code change. For local
// development only, ?data=dev/ points it at the sample feeds.

export const POLL_ACTIVE_MS = 60_000;      // a match is live or inside its lineup window
export const POLL_IDLE_MS = 600_000;       // nothing happening: just notice if that changes
export const FULL_REFRESH_MS = 600_000;    // matches.json + players.json re-read this often
// Spec §5.2 suggests ~10 min. status.json is committed every ~8 min while a match
// is active and takes a minute or two to appear on GitHub Pages, so 10 would
// raise false "Status as of" alarms. Tune against real poll logs.
export const STALE_MINUTES = 15;
export const STRIP_BACK = 3;
export const STRIP_AHEAD = 14;
export const SCHEMA_VERSION = 1;

export function dataBase(doc = document, loc = location) {
  const q = new URLSearchParams(loc.search).get("data");
  const local = ["localhost", "127.0.0.1", ""].includes(loc.hostname);
  const attr = (doc.documentElement && doc.documentElement.dataset.base) || "./";
  return new URL(q && local ? q : attr, loc.href).href;
}
