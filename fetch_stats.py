#!/usr/bin/env python3
"""
Povlači sve replay-e iz jedne (ili vise) ballchasing.com grupa i pravi
flat JSON fajl (data.json) koji dashboard (index.html) direktno cita.

Token se NIKAD ne pise u ovaj fajl - cita se iz environment varijable
BALLCHASING_TOKEN (u GitHub Actions se to postavlja preko Secrets).

Pokretanje lokalno (za test):
    export BALLCHASING_TOKEN="tvoj_token"
    export BALLCHASING_GROUPS="online-30wp20uwjv,analiza-allua49smi"
    python fetch_stats.py
"""

import os
import sys
import time
import json
import requests

API_BASE = "https://ballchasing.com/api"
TOKEN = os.environ.get("BALLCHASING_TOKEN")
GROUPS = [g.strip() for g in os.environ.get("BALLCHASING_GROUPS", "").split(",") if g.strip()]
ONLINE_GROUP = os.environ.get("BALLCHASING_ONLINE_GROUP", "")
OFFLINE_GROUP = os.environ.get("BALLCHASING_OFFLINE_GROUP", "")
OUTPUT_FILE = os.environ.get("OUTPUT_FILE", "data.json")
CACHE_FILE = os.environ.get("CACHE_FILE", "replay_cache.json")


def mode_for_group(group_id):
    if group_id == ONLINE_GROUP:
        return "online"
    if group_id == OFFLINE_GROUP:
        return "offline"
    return group_id  # nepoznata grupa - koristi njen ID kao naziv rezima

# Ballchasing rate limit za "regular" (non-patreon) nalog: 2 poziva/sekundi.
# Stavljamo malo vece kasnjenje da budemo sigurni da ne udarimo u 429.
SLEEP_BETWEEN_CALLS = 0.6


def normalize(name):
    """'ExMirage (1)' / 'ExMirage(1)' -> 'exmirage1' - da poredjenje ne zavisi
    od razmaka/velikih slova/zagrada."""
    return "".join(ch for ch in (name or "").lower() if ch.isalnum())


# ---- Igraci koje zelimo da vidimo u statistici. Svi ostali (online protivnici,
# nasumicni ranked partneri i sl.) se automatski odbacuju i NIKAD ne zavrsavaju
# u data.json. Dodaj ovde jos nekog ako npr. redovno igrate sa jos nekim.
KNOWN_PLAYERS = {normalize(n) for n in [
    "ExMirage", "ExMirage(1)", "ExMirage(2)", "ExMirage(3)",
    "Zbunjena Inila", "Zbunjena Inila(1)", "Zbunjena Inila(2)", "Zbunjena Inila(3)",
    "Rarely_Sober",
]}

if not TOKEN:
    print("GRESKA: BALLCHASING_TOKEN nije postavljen.", file=sys.stderr)
    sys.exit(1)

if not GROUPS:
    print("GRESKA: BALLCHASING_GROUPS nije postavljen (npr. 'online-30wp20uwjv').", file=sys.stderr)
    sys.exit(1)

HEADERS = {"Authorization": TOKEN}


def api_get(path, params=None):
    url = f"{API_BASE}{path}"
    while True:
        r = requests.get(url, headers=HEADERS, params=params)
        if r.status_code == 429:
            print("Rate limited, cekam 5s...")
            time.sleep(5)
            continue
        r.raise_for_status()
        time.sleep(SLEEP_BETWEEN_CALLS)
        return r.json()


def list_replay_ids(group_id):
    """Vrati listu svih replay ID-jeva unutar grupe (uz paginaciju)."""
    ids = []
    params = {"group": group_id, "count": 200}
    next_url = None
    while True:
        if next_url:
            r = requests.get(next_url, headers=HEADERS)
            time.sleep(SLEEP_BETWEEN_CALLS)
            data = r.json()
        else:
            data = api_get("/replays", params=params)
        for replay in data.get("list", []):
            ids.append(replay["id"])
        next_url = data.get("next")
        if not next_url:
            break
    return ids


def safe_get(d, *keys, default=None):
    for k in keys:
        if not isinstance(d, dict) or k not in d:
            return default
        d = d[k]
    return d


CORE_FIELDS = ["shots", "shots_against", "goals", "goals_against", "saves", "assists",
               "score", "mvp", "shooting_percentage"]

BOOST_FIELDS = ["bpm", "bcpm", "avg_amount", "amount_collected", "amount_stolen",
                "amount_collected_big", "amount_stolen_big", "amount_collected_small",
                "amount_stolen_small", "count_collected_big", "count_stolen_big",
                "count_collected_small", "count_stolen_small", "amount_overfill",
                "amount_overfill_stolen", "amount_used_while_supersonic",
                "time_zero_boost", "percent_zero_boost", "time_full_boost", "percent_full_boost",
                "time_boost_0_25", "time_boost_25_50", "time_boost_50_75", "time_boost_75_100",
                "percent_boost_0_25", "percent_boost_25_50", "percent_boost_50_75", "percent_boost_75_100"]

MOVEMENT_FIELDS = ["avg_speed", "total_distance", "time_supersonic_speed", "time_boost_speed",
                    "time_slow_speed", "time_ground", "time_low_air", "time_high_air",
                    "time_powerslide", "count_powerslide", "avg_powerslide_duration",
                    "percent_slow_speed", "percent_boost_speed", "percent_supersonic_speed",
                    "percent_ground", "percent_low_air", "percent_high_air"]

POSITIONING_FIELDS = ["avg_distance_to_ball", "avg_distance_to_ball_possession",
                       "avg_distance_to_ball_no_possession", "avg_distance_to_mates",
                       "time_defensive_third", "time_neutral_third", "time_offensive_third",
                       "time_defensive_half", "time_offensive_half", "time_behind_ball",
                       "time_infront_ball", "time_most_back", "time_most_forward",
                       "goals_against_while_last_defender", "time_closest_to_ball",
                       "time_farthest_from_ball", "percent_defensive_third", "percent_offensive_third",
                       "percent_neutral_third", "percent_defensive_half", "percent_offensive_half",
                       "percent_behind_ball", "percent_infront_ball", "percent_most_back",
                       "percent_most_forward", "percent_closest_to_ball", "percent_farthest_from_ball"]

DEMO_FIELDS = ["inflicted", "taken"]


def extract_category(stats_dict, category, fields):
    src = stats_dict.get(category, {}) or {}
    return {f: src.get(f, 0) for f in fields}


def build_goal_timeline(replay):
    """Vrati listu golova u hronoloskom redosledu: [{'frame':int,'color':'blue'/'orange','player':str}, ...]
    Ako replay nema 'goals' podatke (stariji format, ili API promena), vraca prazan niz -
    sve sto zavisi od ovoga onda samo ne dobija te dodatne uvide, ne pada ceo skript."""
    try:
        player_to_color = {}
        for color in ("blue", "orange"):
            team = replay.get(color) or {}
            for p in team.get("players", []):
                name = p.get("name")
                if name:
                    player_to_color[name] = color

        events = []
        for g in (replay.get("goals") or []):
            name = g.get("player_name")
            color = player_to_color.get(name)
            frame = g.get("frame")
            if color is None or frame is None:
                continue
            events.append({"frame": frame, "color": color, "player": name})
        events.sort(key=lambda e: e["frame"])
        return events
    except Exception:
        return []


def compute_match_narrative(goal_events, team_goals, opponent_goals, team_color, overtime):
    """Racuna dodatne uvide za JEDAN tim (perspektiva 'team_color') u jednom mecu:
    - scored_first: da li je NJIHOV tim dao prvi gol meca (None ako nema golova/podataka)
    - max_deficit_overcome: najveci zaostatak koji su bili u minusu PRE nego sto su na kraju
      pobedili (0 ako nisu pobedili, ili ako nikad nisu bili u minusu)
    - max_lead_lost: najveca prednost koju su imali PRE nego sto su na kraju izgubili
      (0 ako nisu izgubili, ili ako nikad nisu vodili)
    - ot_goal_scorer: ime igraca koji je dao pobednicki gol u produzetku (samo ako je overtime=True)
    Sve vraca 0/None ako nema goal_events podataka (npr. stariji replay format) - nikad ne pada.
    """
    result = {
        "scored_first": None,
        "max_deficit_overcome": 0,
        "max_lead_lost": 0,
        "ot_goal_scorer": None,
    }
    if not goal_events:
        return result

    other_color = "orange" if team_color == "blue" else "blue"
    won = (team_goals or 0) > (opponent_goals or 0)

    result["scored_first"] = (goal_events[0]["color"] == team_color)

    my_score = 0
    opp_score = 0
    max_deficit = 0  # koliko su najvise bili U MINUSU (pozitivan broj = koliko golova nazad)
    max_lead = 0      # koliko su najvise bili U PLUSU

    for ev in goal_events:
        if ev["color"] == team_color:
            my_score += 1
        elif ev["color"] == other_color:
            opp_score += 1
        deficit = opp_score - my_score
        if deficit > max_deficit:
            max_deficit = deficit
        lead = my_score - opp_score
        if lead > max_lead:
            max_lead = lead

    if won and max_deficit >= 1:
        result["max_deficit_overcome"] = max_deficit
    if (not won) and max_lead >= 1:
        result["max_lead_lost"] = max_lead

    if overtime and goal_events:
        result["ot_goal_scorer"] = goal_events[-1]["player"]  # poslednji gol meca = pobednicki gol u OT

    return result


def flatten_replay(replay):
    """Pretvori jedan detaljan replay JSON u listu redova (jedan red = jedan igrac)."""
    rows = []
    date = replay.get("date")
    map_name = replay.get("map_name", replay.get("map_code", "?"))
    playlist = replay.get("playlist_name", replay.get("playlist_id", "?"))
    duration = replay.get("duration")
    overtime = bool(replay.get("overtime", False))
    replay_id = replay.get("id")
    goal_events = build_goal_timeline(replay)

    for color in ("blue", "orange"):
        team = replay.get(color)
        if not team:
            continue
        other_color = "orange" if color == "blue" else "blue"
        team_goals = safe_get(replay, color, "stats", "core", "goals", default=team.get("goals", 0))
        other_team = replay.get(other_color, {})
        opp_goals = safe_get(replay, other_color, "stats", "core", "goals", default=other_team.get("goals", 0))
        teammates = [pl.get("name", "?") for pl in team.get("players", [])]
        narrative = compute_match_narrative(goal_events, team_goals, opp_goals, color, overtime)

        for p in team.get("players", []):
            player_name = p.get("name", "?")
            if normalize(player_name) not in KNOWN_PLAYERS:
                continue  # protivnik / nasumican saigrac - ne zanima nas

            stats = p.get("stats", {}) or {}
            core = extract_category(stats, "core", CORE_FIELDS)
            core["mvp"] = bool(core.get("mvp", False))

            rows.append({
                "replay_id": replay_id,
                "date": date,
                "map": map_name,
                "playlist": playlist,
                "duration": duration,
                "overtime": overtime,
                "team_color": color,
                "team_goals": team_goals,
                "opponent_goals": opp_goals,
                "win": (team_goals or 0) > (opp_goals or 0),
                "player": player_name,
                "car_name": p.get("car_name"),
                "platform": safe_get(p, "id", "platform", default="offline"),
                "teammates": [t for t in teammates if t != player_name],
                "scored_first": narrative["scored_first"],
                "max_deficit_overcome": narrative["max_deficit_overcome"],
                "max_lead_lost": narrative["max_lead_lost"],
                "ot_goal_scorer": narrative["ot_goal_scorer"],
                "core": core,
                "boost": extract_category(stats, "boost", BOOST_FIELDS),
                "movement": extract_category(stats, "movement", MOVEMENT_FIELDS),
                "positioning": extract_category(stats, "positioning", POSITIONING_FIELDS),
                "demo": extract_category(stats, "demo", DEMO_FIELDS),
            })
    return rows


def load_cache():
    """Ucita vec obradjene replay-e sa proslog pokretanja - da ne moramo
    ponovo da ih fetch-ujemo (ustedjuje vreme i API pozive)."""
    if not os.path.exists(CACHE_FILE):
        return {}
    try:
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        print(f"  Upozorenje: {CACHE_FILE} je ostecen, pravim novi keš od nule.", file=sys.stderr)
        return {}


def save_cache(cache):
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False)


def main():
    cache = load_cache()
    print(f"Keš: {len(cache)} vec obradjenih replay-a od ranije")

    all_rows = []
    seen_ids = set()
    new_count = 0
    cached_count = 0

    for group_id in GROUPS:
        print(f"Grupa: {group_id}")
        try:
            replay_ids = list_replay_ids(group_id)
        except requests.HTTPError as e:
            print(f"  Ne mogu da ucitam grupu {group_id}: {e}", file=sys.stderr)
            continue

        print(f"  Nadjeno {len(replay_ids)} replay-a")
        mode = mode_for_group(group_id)

        for rid in replay_ids:
            if rid in seen_ids:
                continue
            seen_ids.add(rid)

            if rid in cache:
                rows = cache[rid]
                cached_count += 1
            else:
                try:
                    replay = api_get(f"/replays/{rid}")
                except requests.HTTPError as e:
                    print(f"  Preskacem {rid}: {e}", file=sys.stderr)
                    continue
                if replay.get("status") not in (None, "ok"):
                    print(f"  Preskacem {rid}: status={replay.get('status')}", file=sys.stderr)
                    continue
                rows = flatten_replay(replay)
                cache[rid] = rows
                new_count += 1
                print(f"  + {rid} (novo, {len(rows)} redova)")

            for row in rows:
                if mode == "online":
                    # da li je iko od nase ekipe bio saigrac u ovom mecu (bez obzira
                    # na protivnike, koji se ne nalaze u KNOWN_PLAYERS pa se ignorisu)
                    teammate_norms = {normalize(t) for t in row.get("teammates", [])}
                    has_friend_teammate = bool(teammate_norms & KNOWN_PLAYERS)
                    row["mode"] = "online_team" if has_friend_teammate else "online_solo"
                else:
                    row["mode"] = mode
            all_rows.extend(rows)

    all_rows.sort(key=lambda r: r.get("date") or "")

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(all_rows, f, ensure_ascii=False, indent=2)

    save_cache(cache)

    print(f"\nSacuvano {len(all_rows)} redova (igrac x mec) u {OUTPUT_FILE}")
    print(f"({new_count} novih replay-a fetch-ovano, {cached_count} uzeto iz keša)")


if __name__ == "__main__":
    main()
