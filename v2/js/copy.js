// copy.js — public wording from spec §8.6. One place, so the Legend, About and
// popovers cannot drift apart. No outbound links; nothing implies alerts exist;
// nothing mentions the trajectory score.

export const TAGLINE = "Every match. Every USMNT player.";
export const TAGLINE_2 = "Follow the chase for the shirt. Track who's in the picture.";

export const INTRO = {
  lead: "The pool",
  body: " = players in the picture for the US men's national team. ",
  strong: "Tap any player",
  tail: " to follow them; their matches pin to the top.",
};

export const ET_NOTE = "Days follow US Eastern time so everyone sees the same slate.";

// Each section: title, optional lead rows [marker, meaning], optional footnote.
export const LEGEND = [
  { title: "Match levels", rows: [
    ["MUST-WATCH ●●●", "A big night for the pool: top players expected to play, or confirmed in the lineup."],
    ["WORTH A LOOK ●●○", "Pool players in action, worth catching if you can."],
    ["(no label)", "Pool players are involved, with a smaller expected role."],
  ], note: "Levels are fixed, not a daily ranking, so some days have no Must-watch matches. Before lineups, levels assume expected players play. They update when lineups are confirmed." },
  { title: "Players in a match", rows: [
    ["Name only", "Lineups aren't out yet. A listed player is expected to be involved."],
    ["● Starts", "In the starting lineup."],
    ["◐ Bench", "In the matchday squad, on the bench."],
    ["⊘ Not in squad", "Not in the matchday squad."],
  ] },
  { title: "Match status", rows: [
    ["Lineups ~30 min before kickoff", "Lineups usually post about 30 minutes before the match."],
    ["Lineups confirmed ✓", "Lineups are in, and player statuses are final."],
    ["● LIVE", "In progress. We don't show scores or minutes."],
    ["Full time", "Finished. The match moves to the Earlier group."],
    ["Postponed / Cancelled", "Not being played as scheduled."],
    ["Status as of 2:41 PM", "Our latest update. If it's old, the match may have moved on."],
  ] },
  { title: "Days and times", rows: [
    ["Fri, Oct 9 · ET slate", "Days follow U.S. Eastern Time. A match belongs to the day it kicks off in Eastern time."],
    ["Times in PT", "Kickoffs are shown in your time zone. (Shown only when you're not on Eastern.)"],
    ["Fri 10:00 PM PT · Sat slate", "It's still Friday where you are, but this match belongs to Saturday's slate."],
  ] },
  { title: "Following", rows: [
    ["⌖ 2 on a day", "Two matches that day include players you follow."],
    ["Moved from your pins", "A player you follow isn't in the squad, so this match left your pinned list."],
    ["Not playing today", "Followed players with no match listed today."],
  ] },
  { title: "Players page", rows: [
    ["Pool relevance 94/100", "How close a player is to the national team picture right now. Higher means closer."],
    ["Core", "Top of the pool: the players most likely to be in the squad."],
    ["Contender", "Strong candidate: firmly in the squad conversation."],
    ["In the mix", "In the conversation: could be named when the squad changes."],
    ["Wider pool", "Tracked, but not close right now."],
    ["Prospect · U20", "Youth international in the pool."],
    ["Last named", "The most recent matchday squad he was in, including unused substitutes."],
  ] },
];

export const ABOUT = [
  { h: "How Stateside XI works" },
  { em: "Follow the chase for the shirt. Track who's in the picture." },
  { p: "Every day, Stateside XI answers one question: <b>which games should I put on to watch the pool?</b>" },
  { p: "<b>The pool</b> is the group of players in the picture for the U.S. men's national team: established regulars, players pushing for a spot, and young prospects. They play for clubs all over the world, so the games worth watching are scattered across dozens of leagues." },
  { p: "We list each day's matches that feature pool players, flag the ones that matter most, and confirm the starting lineups about 30 minutes before kickoff, so you know who's actually playing before you pick a game." },
  { p: "<b>Relevance</b> is a 1 to 100 score showing how close each player is to the national team picture right now. Matches are rated by which pool players are likely to play." },
  { p: "<b>Follow</b> players to pin their matches to the top of the page. Your follows are saved on this device." },
  { p: "<b>What we don't do:</b> scores, stats, standings or match analysis. We're only here to help you pick the game." },
  { p: "Days follow U.S. Eastern Time so everyone sees the same slate. Kickoff times show in your own time zone." },
];
