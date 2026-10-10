#!/usr/bin/env python3
"""Sample feeds for looking at the page without the pipeline.

    python3 dev/make_fixtures.py        -> dev/matches.json status.json players.json
                                           dev/carry/...  (live match carried past midnight ET)
    open  index.html?data=dev/&now=2026-10-09T17:00:00Z&tz=America/Los_Angeles
          index.html?data=dev/carry/&now=2026-10-09T04:30:00Z

Names are real public USMNT players so the page reads like the real thing; the
matches, tiers and lineups are invented.
"""
import json, os
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
Z = lambda dt: dt.strftime("%Y-%m-%dT%H:%M:%SZ")
P = [  # id, display, short, pos, club, score, tier, prospect, youth
    (1, "Christian Pulisic", "C. Pulisic", "FW", "AC Milan", 100, "core", False, None),
    (2, "Weston McKennie", "W. McKennie", "MF", "Juventus", 88, "core", False, None),
    (3, "Tyler Adams", "T. Adams", "MF", "Bournemouth", 84, "core", False, None),
    (4, "Antonee Robinson", "A. Robinson", "DF", "Fulham", 82, "core", False, None),
    (5, "Matt Turner", "M. Turner", "GK", "Nottingham Forest", 70, "core", False, None),
    (6, "Folarin Balogun", "F. Balogun", "FW", "Monaco", 80, "core", False, None),
    (7, "Tim Weah", "T. Weah", "FW", "Marseille", 76, "core", False, None),
    (8, "Sergiño Dest", "S. Dest", "DF", "PSV", 72, "core", False, None),
    (9, "Yunus Musah", "Y. Musah", "MF", "Atalanta", 68, "core", False, None),
    (10, "Ricardo Pepi", "R. Pepi", "FW", "PSV", 66, "contender", False, None),
    (11, "Gio Reyna", "G. Reyna", "MF", "Borussia Mönchengladbach", 62, "contender", False, None),
    (12, "Chris Richards", "C. Richards", "DF", "Crystal Palace", 64, "contender", False, None),
    (13, "Johnny Cardoso", "J. Cardoso", "MF", "Atlético Madrid", 61, "contender", False, None),
    (14, "Brenden Aaronson", "B. Aaronson", "MF", "Leeds United", 55, "contender", False, None),
    (15, "Joe Scally", "J. Scally", "DF", "Borussia Mönchengladbach", 50, "contender", False, None),
    (16, "Diego Luna", "D. Luna", "MF", "Real Salt Lake", 44, "contender", False, None),
    (17, "Malik Tillman", "M. Tillman", "MF", "Bayer Leverkusen", 52, "contender", False, None),
    (18, "Cade Cowell", "C. Cowell", "FW", "Chivas Guadalajara", 30, "in_the_mix", False, None),
    (19, "Alex Freeman", "A. Freeman", "MF", "Villarreal", 33, "in_the_mix", False, None),
    (20, "Patrick Agyemang", "P. Agyemang", "FW", "Derby County", 28, "in_the_mix", False, None),
    (21, "Mark McKenzie", "M. McKenzie", "DF", "Toulouse", 36, "in_the_mix", False, None),
    (22, "Jack McGlynn", "J. McGlynn", "MF", "Houston Dynamo", 24, "in_the_mix", False, None),
    (23, "Quinn Sullivan", "Q. Sullivan", "MF", "Philadelphia Union", 18, "in_the_mix", False, None),
    (24, "Jonathan Gómez", "J. Gómez", "DF", "Real Sociedad", 20, "in_the_mix", False, None),
    (25, "Nick Lima", "N. Lima", "DF", "San Jose Earthquakes", 9, "wider_pool", False, None),
    (26, "Brian White", "B. White", "FW", "Vancouver Whitecaps", 12, "wider_pool", False, None),
    (27, "Jack de Vries", "J. de Vries", "MF", "Unattached", 6, "wider_pool", False, None),
    (28, "Cavan Sullivan", "C. Sullivan", "MF", "Philadelphia Union", 15, "wider_pool", True, "U20"),
    (29, "Obed Vargas", "O. Vargas", "MF", "Atlético Madrid", 19, "wider_pool", True, "U20"),
    (30, "Peyton Miller", "P. Miller", "DF", "Philadelphia Union", 5, "wider_pool", True, "U17"),
]


def players_feed(now):
    ln = {1: ("2026-09-06", "Friendly", "Japan"), 2: ("2026-09-06", "Friendly", "Japan"),
          3: ("2026-09-06", "Friendly", "Japan"), 10: ("2026-06-14", "World Cup", "Paraguay"),
          18: ("2025-03-20", "Nations League", "Panama"), 25: ("2024-01-20", "Friendly", "Slovenia")}
    out = []
    for pid, dn, sn, pos, club, sc, tier, pro, yl in P:
        l = ln.get(pid)
        out.append({"playerId": str(pid), "display_name": dn, "short_name": sn, "position": pos, "club": club,
                    "photo": None, "score": sc, "tier": tier, "is_prospect": pro, "youth_level": yl,
                    "last_named": {"date": l[0], "competition": l[1], "opponent": l[2]} if l else None})
    return {"schema_version": 1, "updated_at": Z(now), "top_score": 100,
            "player_tiers_note": "dev", "player_tier_bands": {"core_min": 61, "contender_min": 42, "in_the_mix_min": 17},
            "players": out}


def pp(ids, side=None):
    return [{"playerId": str(i), "side": side} for i in ids]


def build(now, kind):
    et = now - timedelta(hours=4)  # Oct: EDT
    day0 = datetime(et.year, et.month, et.day, tzinfo=timezone.utc)
    at = lambda days, h, m=0: day0 + timedelta(days=days, hours=h + 4, minutes=m)  # ET wall clock -> UTC
    M, S = [], {}

    def add(mid, ko, comp, home, away, status="scheduled", tier=None, basis=None, fk="club", bc=None, players=(), st=None):
        M.append({"matchId": str(mid), "kickoff_utc": Z(ko), "competition": comp, "home": home, "away": away,
                  "fixture_kind": fk, "status": status, "tier": tier, "tier_at_kickoff": None,
                  "players_basis": basis, "broadcast": bc, "pool_players": players})
        if st is not None:
            S[str(mid)] = st

    if kind == "main":
        # past days
        add(901, at(-2, 15), "Eredivisie", "PSV", "Ajax", "full_time", "worth_a_look", players=pp([8, 10]))
        add(902, at(-1, 14), "Premier League", "Fulham", "Brighton", "full_time", None, players=pp([4]))
        # today (ET Fri)
        add(101, at(0, 9, 30), "Ligue 1", "Marseille", "Lille", "full_time", "worth_a_look", players=pp([7]), st=dict(status="full_time", status_updated_at=Z(now), lineups_confirmed=True, participation={"7": "starts"}))
        add(102, at(0, 11, 30), "Serie A", "Atalanta", "Napoli", "scheduled", "must_watch", players=pp([9, 2, 6]), bc="Paramount+",
            st=dict(status="live", status_updated_at=Z(now - timedelta(minutes=1)), lineups_confirmed=True, tier="must_watch", tier_at_kickoff="must_watch", participation={"9": "starts", "2": "bench", "6": "not_in_squad"}))
        add(103, at(0, 14, 0), "Premier League", "Fulham", "Crystal Palace", "scheduled", "must_watch", players=pp([4, 12, 5]), bc="Peacock", st=dict(status="scheduled", status_updated_at=None, lineups_confirmed=False, tier="must_watch", participation={}))
        add(104, at(0, 15, 0), "La Liga", "Villarreal", "Girona", "scheduled", "worth_a_look", players=pp([19]),
            st=dict(status="scheduled", status_updated_at=Z(now), lineups_confirmed=True, tier="worth_a_look", participation={"19": "starts"}))
        add(105, at(0, 14, 30), "Championship", "Derby County", "Leeds United", "postponed", None, players=pp([20, 14]))
        add(106, at(0, 19, 30), "MLS", "Philadelphia Union", "LAFC", "scheduled", None, players=pp([22, 23, 28]))
        add(107, at(0, 21, 0), "Liga MX", "Chivas", "Club América", "scheduled", "worth_a_look", players=pp([18, 24, 26]))
        # Sat ET (01:00 ET Sat = Fri 10 pm PT)
        add(201, at(1, 1, 0), "Liga MX", "Tijuana", "Pachuca", "scheduled", None, players=pp([18]))
        add(202, at(1, 10, 0), "Premier League", "Bournemouth", "Brentford", "scheduled", "must_watch", players=pp([3, 14, 15]), bc="USA Network")
        add(203, at(1, 15, 0), "Bundesliga", "B. Mönchengladbach", "Bayer Leverkusen", "scheduled", "must_watch", players=pp([11, 15, 17]))
        add(205, at(1, 12, 30), "Premier League", "Brighton", "Everton", "scheduled", "worth_a_look", players=pp([21]))
        add(206, at(1, 11, 0), "Eredivisie", "PSV", "Feyenoord", "scheduled", "worth_a_look", players=pp([8, 10]))
        add(204, at(1, 15, 0), "Serie A", "AC Milan", "Juventus", "scheduled", "must_watch", players=pp([1, 2]), bc="Paramount+")
        # Sun: youth
        add(301, at(2, 12, 0), "U20 Friendly", "USA U20", "Mexico U20", fk="national_youth", players=pp([28, 29], "home"))
        # Wed: national, pool estimate
        add(401, at(5, 19, 30), "Friendly", "USA", "Ecuador", fk="national_senior", basis="pool_estimate", tier="must_watch", bc="TNT",
            players=pp(range(1, 28), "home"))
        # Thu: only Worth a look
        add(501, at(6, 14, 0), "Premier League", "Fulham", "Everton", tier="worth_a_look", players=pp([4]))
        # window end day 14: a match
        add(601, at(14, 14, 0), "Ligue 1", "Monaco", "Lens", tier="worth_a_look", players=pp([6]))
        win = (day0 - timedelta(days=3)).strftime("%Y-%m-%d"), (day0 + timedelta(days=14)).strftime("%Y-%m-%d")
        # 103 lineup-window state: kickoff 14:00 ET = 18:00Z, now = 17:00Z
        active = True
    else:  # carry: 00:30 ET, a late match is still live from yesterday
        add(701, at(-1, 21, 30), "MLS", "LAFC", "Seattle Sounders", "scheduled", "worth_a_look", players=pp([22, 26]),
            st=dict(status="live", status_updated_at=Z(now - timedelta(minutes=1)), lineups_confirmed=True, tier="worth_a_look", tier_at_kickoff="worth_a_look", carried_over=True, participation={"22": "starts", "26": "bench"}))
        add(702, at(0, 9, 0), "Premier League", "Fulham", "Wolves", tier="worth_a_look", players=pp([4]))
        win = (day0 - timedelta(days=3)).strftime("%Y-%m-%d"), (day0 + timedelta(days=14)).strftime("%Y-%m-%d")
        active = True

    # matches.json carries schedule-level tiers; a frozen tier belongs to matches already started
    for m in M:
        s = S.get(m["matchId"])
        if s and s.get("tier_at_kickoff"):
            m["tier_at_kickoff"] = s["tier_at_kickoff"]
    for m in M:
        if m["matchId"] not in S and m["kickoff_utc"][:10] >= Z(now)[:10] and (m["kickoff_utc"] < Z(now + timedelta(days=1))):
            S[m["matchId"]] = dict(status=m["status"], status_updated_at=None, lineups_confirmed=False, tier=m["tier"], participation={})

    matches = {"schema_version": 1, "updated_at": Z(now), "reference_tz": "America/New_York",
               "window": {"start": win[0], "end": win[1]},
               "tier_thresholds": {"schema_version": 1, "enabled": True, "must_watch_min": 6, "worth_a_look_min": 3},
               "matches": M}
    status = {"schema_version": 1, "updated_at": Z(now - timedelta(minutes=1)), "active": active, "matches": S}
    return matches, status


def main():
    jobs = [("", datetime(2026, 10, 9, 17, 0, tzinfo=timezone.utc), "main"),
            ("carry", datetime(2026, 10, 9, 4, 30, tzinfo=timezone.utc), "carry")]
    for sub, now, kind in jobs:
        d = os.path.join(HERE, sub)
        os.makedirs(d, exist_ok=True)
        m, s = build(now, kind)
        for name, obj in (("matches.json", m), ("status.json", s), ("players.json", players_feed(now))):
            with open(os.path.join(d, name), "w") as f:
                json.dump(obj, f, indent=1, ensure_ascii=False)
    print("wrote dev feeds")


if __name__ == "__main__":
    main()
