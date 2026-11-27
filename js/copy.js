// copy.js — public wording from spec §8.6. One place, so the Legend, About and
// popovers cannot drift apart. No outbound links; nothing implies alerts exist;
// nothing explains how players are scored.

export const FEEDBACK_EMAIL = "feedback@statesidexi.com";
export const FEEDBACK_SUBJECT = "Stateside XI feedback";
export const DISCLAIMER = "Unofficial fan project, not affiliated with U.S. Soccer.";

export const TAGLINE = "Every match. Every USMNT player.";
export const TAGLINE_2 = "Follow the chase for the shirt. Track who's in the picture.";

export const INTRO = {
  lead: "The pool",
  body: " = players in the picture for the U.S. men's national team. ",
  strong: "Tap any player",
  tail: " to follow them; their matches pin to the top.",
};

// The calendar (month view) and the schedule-only day. Plain strings, held to the copy rules in tests/copy.test.mjs.
export const CALENDAR = {
  open: "Open the calendar",
  title: "Calendar",
  prev: "Previous month",
  next: "Next month",
  legendMust: "Must-watch match",
  legendSched: "Pool match, schedule only",
  timesNote: "Kickoff times more than a month ahead are placeholders until the leagues confirm them.",
  followsTitle: "Next for the players you follow",
  followsNote: "Each player's next match on the schedule. Who plays is decided closer to the day.",
  followsNone: "Nothing on the schedule yet:",
  tbc: "Time to be confirmed",
  noSchedule: "The longer schedule isn't available right now.",
  loading: "Loading the longer schedule…",
  loadingDay: "Loading the schedule for this day…",
  schedNote: "Schedule only. Who plays, confirmed times and where to watch appear closer to the day.",
};

// Where to watch (a card's broadcast line). The card names at most one provider; the link opens the full list.
// A match with no listing shows nothing at all: never a line saying it isn't on anywhere.
export const WATCH = {
  title: "Where to watch",
  link: "Where to watch",
  more: (n) => `+ ${n} more`,
  // Spoken names for the two links. Each starts with the words on screen and names the match, so the link makes
  // sense when a screen reader lists it out of its card.
  moreLabel: (n, match) => `+ ${n} more, every place to watch ${match}`,
  linkLabel: (match) => `Where to watch ${match}`,
};

export const LINEUP_NOTE = "Lineups usually post ~30 min before kickoff.";

// An empty day (approved 2026-11-23). Only what the feed and the schedule show: never a season date or a reason
// the data cannot back up. `label` is a day heading such as "Sat, Jan 3".
export const EMPTY = {
  nextDay: (label) => `Next match day: ${label}`,
  nextOnSchedule: (label) => `Next match on the schedule: ${label}`,
  inDays: (n) => ` (in ${n} days)`,
  intlBreak: "International break.",
  clubResume: (label) => `Club matches resume ${label}.`,
  nothingScheduled: "Nothing else is on the schedule yet.",
};
// A card in a competition whose lineups rarely reach the site (matches.json lineups_expected: false). It replaces
// "Lineup not posted yet", which implied one was coming.
export const LINEUPS_UNAVAILABLE = "Lineups usually unavailable";

// When something fails (approved 2026-11-23). `t` is a local time such as "2:41 PM".
export const ERRORS = {
  loadMatches: "Couldn't load matches right now. Check your connection, or try again in a minute.",
  loadPlayers: "Couldn't load players right now. Check your connection, or try again in a minute.",
  refreshAt: (t) => `Couldn't refresh just now. Showing the update from ${t}.`,
  refresh: "Couldn't refresh just now. Showing the last update we have.",
  // the whole page is behind while a match is live or about to start (the same 15-minute rule as a card's
  // "Status as of"): the pipeline has stopped, not the viewer's connection
  late: "Updates are running late. Statuses below may be out of date.",
  tryAgain: "Try again",
};

export const ET_NOTE = "Days follow U.S. Eastern Time so everyone sees the same slate.";

// Each section: title, optional lead rows [marker, meaning], optional footnote.
export const LEGEND = [
  { title: "Match levels", rows: [
    ["MUST-WATCH", "A big match for the pool: heavy pool involvement expected, or confirmed in the lineup."],
    ["WORTH A LOOK", "Pool players in action, worth catching if you can."],
    ["(no label)", "Pool players are involved, with a smaller expected role."],
  ], note: "Levels are fixed, not a daily ranking, so some days have no Must-watch matches. Before lineups, levels assume expected players play. They update when lineups are confirmed, and during a match as players come on or off (some competitions only). After full time, a card shows the highest level the match reached." },
  { title: "Players in a match", rows: [
    ["Name only", "Lineups aren't out yet. A listed player is expected to be involved."],
    ["● Starts / Started", "In the starting lineup. Started once the match has kicked off."],
    ["◐ Bench", "In the matchday squad, on the bench."],
    ["⊘ Not in squad", "Not in the matchday squad."],
    ["⊕ Subbed on", "Came on as a substitute during the match."],
    ["⊖ Subbed off", "Taken off during the match."],
    ["▮ Sent off", "Shown a red card."],
  ], note: "Changes during a match are shown for some competitions only. Where they aren't shown, a player keeps his lineup label (Started or Bench). We don't show minutes or scores." },
  { title: "Match status", rows: [
    ["Lineups usually post ~30 min before kickoff", "Said once under the day heading. A card only mentions lineups when they're confirmed, late, or usually unavailable for that competition."],
    ["Lineups confirmed ✓", "Lineups are in: who starts and who's on the bench is confirmed."],
    ["Lineups usually unavailable", "This competition rarely publishes lineups to our data source, so names stay as expected players and won't change to Starts or Bench."],
    ["● LIVE · 2nd half", "In progress, with the part of the match when we know it: 1st half, Half-time, 2nd half, Extra time, ET break, Penalties. We don't show scores or minutes."],
    ["Probably in progress · status not confirmed", "Kickoff was over 30 minutes ago but our feed hasn't confirmed the match yet. After 3 hours it moves to Earlier."],
    ["Full time", "Finished. The match moves to the Earlier group. \"After extra time\" or \"on penalties\" when it went that far."],
    ["Postponed / Cancelled", "Not being played as scheduled."],
    ["Where to watch", "U.S. listings only. A card names one provider; the link lists every one. Listings appear about a week ahead, and a match without one shows nothing."],
    ["Status as of 2:41 PM", "Our latest update. If it's old, the match may have moved on."],
  ] },
  { title: "Days and times", rows: [
    ["Fri, Oct 9 · ET slate", "Days follow U.S. Eastern Time. A match belongs to the day it kicks off in Eastern Time."],
    ["Times in PT", "Kickoffs are shown in your time zone. (Shown only when you're not on Eastern.)"],
    ["Fri 10:00 PM PT · Sat slate", "It's still Friday where you are, but this match belongs to Saturday's slate."],
  ] },
  { title: "Following", rows: [
    ["⌖ 2 on a day", "Two matches that day include players you follow."],
    ["Moved from your pins", "A player you follow isn't in the squad, so this match left your pinned list."],
    ["Not playing today", "Followed players with no match listed today."],
  ] },
  { title: "Players page", rows: [
    ["Squad involvement", "How embedded a player is in the national team squad. The list is ordered by it, most involved first. It measures presence in the squad, not quality or importance."],
    ["Core", "The most involved in the national team squad."],
    ["Established", "Firmly in the squad, just below Core."],
    ["In the mix", "Moderate squad involvement: part of the squad conversation."],
    ["Wider pool", "Less squad involvement overall."],
    ["Prospect · U20", "Youth international in the pool."],
    ["Last named", "The most recent matchday squad he was in, including unused substitutes."],
  ] },
];

export const ABOUT = [
  { h: "How Stateside XI works" },
  { em: "Follow the chase for the shirt. Track who's in the picture." },
  { p: "Every day, Stateside XI answers one question: <b>which games should I put on to watch the pool?</b>" },
  { p: "<b>The pool</b> is the group of players in the picture for the U.S. men's national team: regulars, players pushing for a spot, and young prospects. They play for clubs all over the world, so the games worth watching are scattered across dozens of leagues." },
  { p: "We list each day's matches that feature pool players, flag the ones that matter most, show where to watch them in the U.S., and confirm the starting lineups about 30 minutes before kickoff, so you know who's actually playing before you pick a game. In some competitions we also show who comes on or goes off during the match." },
  { p: "<b>Squad involvement</b> is how embedded each player is in the national team squad, and it sets the order of the Players list. It measures presence, not quality or importance. Matches are rated by which pool players are likely to play." },
  { p: "<b>Follow</b> players to pin their matches to the top of the page. Your follows are saved on this device." },
  { p: "<b>What we don't do:</b> scores, stats, standings or match analysis. We're only here to help you pick the game." },
  { p: "Days follow U.S. Eastern Time so everyone sees the same slate. Kickoff times show in your own time zone." },
  { p: "<b>Privacy.</b> Stateside XI has no accounts. The players you follow and your light/dark choice are saved on this device only; we never see them. We count page views with Cloudflare Web Analytics, which sets no cookies and collects no personal information." },
  { p: "<b>Unofficial.</b> Stateside XI is an unofficial fan project. It is not affiliated with or endorsed by U.S. Soccer, the U.S. Men's National Team, or any club, league or broadcaster." },
  { mail: "<b>Spotted a mistake?</b> If a match, a player, a lineup status or a where-to-watch listing looks wrong, email" },
];

// Dotted-underline terms (spec §8.6). 1–2 sentences each.
export const POPOVERS = {
  pool: "Players in the picture for the U.S. men's national team, from regulars to young prospects.",
  must_watch: "A big match for the pool: heavy pool involvement expected, or confirmed in the lineup. Levels are fixed, so some days have none.",
  worth_a_look: "Pool players in action, worth catching if you can. Levels are fixed, so some days have none.",
  lineups: "Lineups usually post about 30 minutes before kickoff. Until then, a listed player is expected to play.",
  involvement: "How embedded a player is in the national team squad, and the order of this list: presence, not quality or importance.",
  follow: "Pins a player's matches to the top. Saved on this device.",
};

// The tier-name popovers on the player card reuse the Legend's wording, so the two can never drift apart.
const PLAYER_ROWS = LEGEND.find((s) => s.title === "Players page").rows;
const legendRow = (label) => PLAYER_ROWS.find((r) => r[0] === label)[1];
POPOVERS.tier_core = legendRow("Core");
POPOVERS.tier_contender = legendRow("Established");   // key kept: it is the feed's tier value
POPOVERS.tier_in_the_mix = legendRow("In the mix");
POPOVERS.tier_wider_pool = legendRow("Wider pool");
POPOVERS.tier_prospect = legendRow("Prospect · U20");
