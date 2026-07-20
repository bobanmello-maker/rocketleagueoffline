#!/usr/bin/env python3
"""
Povlači sve replay-e iz jedne (ili vise) ballchasing.com grupa i pravi
flat JSON fajl (data.json) koji dashboard (index.html) direktno cita.
DODATAK: Automatsko preuzimanje replay-a + subtr-actor za heatmap, ghost car.
"""

import os
import sys
import time
import json
import glob
import shutil
import requests
from pathlib import Path

# ================================================================
#  SUBTR-ACTOR IMPORTS
# ================================================================

try:
    from subtr_actor import ReplayProcessor
    from subtr_actor.collectors import NDArrayCollector
    SUBTR_ACTOR_AVAILABLE = True
    print("✅ subtr-actor je dostupan!")
except ImportError:
    SUBTR_ACTOR_AVAILABLE = False
    print("⚠️ subtr-actor nije instaliran. Instaliraj: pip install subtr-actor-py")

try:
    import numpy as np
    NUMPY_AVAILABLE = True
except ImportError:
    NUMPY_AVAILABLE = False
    print("⚠️ numpy nije instaliran. Instaliraj: pip install numpy")

# ================================================================
#  KONFIGURACIJA
# ================================================================

API_BASE = "https://ballchasing.com/api"
TOKEN = os.environ.get("BALLCHASING_TOKEN")
GROUPS = [g.strip() for g in os.environ.get("BALLCHASING_GROUPS", "").split(",") if g.strip()]
ONLINE_GROUP = os.environ.get("BALLCHASING_ONLINE_GROUP", "")
OFFLINE_GROUP = os.environ.get("BALLCHASING_OFFLINE_GROUP", "")
OUTPUT_FILE = os.environ.get("OUTPUT_FILE", "data.json")
CACHE_FILE = os.environ.get("CACHE_FILE", "replay_cache.json")

# Folder za privremene replay fajlove
TEMP_REPLAY_FOLDER = os.path.join(os.path.dirname(__file__), "temp_replays")
os.makedirs(TEMP_REPLAY_FOLDER, exist_ok=True)

# subtr-actor keš (da ne parsira svaki put)
SUBTR_CACHE_FILE = os.environ.get("SUBTR_CACHE_FILE", "subtr_cache.json")

SLEEP_BETWEEN_CALLS = 0.6

if not TOKEN:
    print("GRESKA: BALLCHASING_TOKEN nije postavljen.", file=sys.stderr)
    sys.exit(1)

if not GROUPS:
    print("GRESKA: BALLCHASING_GROUPS nije postavljen.", file=sys.stderr)
    sys.exit(1)

HEADERS = {"Authorization": TOKEN}

# ================================================================
#  SUBTR-ACTOR FUNKCIJE
# ================================================================

def load_subtr_cache():
    """Učitaj keš za subtr-actor podatke."""
    if os.path.exists(SUBTR_CACHE_FILE):
        try:
            with open(SUBTR_CACHE_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_subtr_cache(cache):
    with open(SUBTR_CACHE_FILE, 'w', encoding='utf-8') as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)

def process_replay_with_subtr_actor(replay_path):
    """Parsira .replay fajl sa subtr-actor-om."""
    if not SUBTR_ACTOR_AVAILABLE or not NUMPY_AVAILABLE:
        return None
    
    try:
        processor = ReplayProcessor()
        collector = NDArrayCollector()
        replay_data = processor.process(replay_path, collector)
        
        result = {}
        for player_id, data in replay_data.players.items():
            name = data.name
            positions = data.positions
            velocities = data.velocities
            
            if positions is not None and len(positions) > 0:
                # Ograniči podatke za performanse (max 1000 frejmova)
                max_frames = min(len(positions), 1000)
                
                result[name] = {
                    'positions': positions[:max_frames].tolist() if hasattr(positions, 'tolist') else list(positions[:max_frames]),
                    'velocities': velocities[:max_frames].tolist() if hasattr(velocities, 'tolist') else list(velocities[:max_frames]),
                    'boost': data.boost_amounts[:max_frames].tolist() if hasattr(data.boost_amounts, 'tolist') else list(data.boost_amounts[:max_frames]),
                    'heatmap': generate_heatmap(positions),
                    'avg_speed': calculate_avg_speed(velocities),
                    'max_speed': calculate_max_speed(velocities),
                    'total_frames': len(positions),
                }
        
        return result
    except Exception as e:
        print(f"  ⚠️ subtr-actor greška za {os.path.basename(replay_path)}: {e}")
        return None

def generate_heatmap(positions):
    """Generiše heatmap-u iz pozicija (2D histogram)."""
    if positions is None or len(positions) == 0 or not NUMPY_AVAILABLE:
        return []
    
    try:
        xs = np.array([p[0] for p in positions])
        ys = np.array([p[1] for p in positions])
        
        # Grid: 20x10 binova (prilagođeno RL terenu)
        x_bins = np.linspace(-4000, 4000, 21)
        y_bins = np.linspace(-3000, 3000, 11)
        
        heatmap, _, _ = np.histogram2d(xs, ys, bins=[x_bins, y_bins])
        
        if heatmap.max() > 0:
            heatmap = heatmap / heatmap.max()
        
        return heatmap.tolist()
    except:
        return []

def calculate_avg_speed(velocities):
    """Izračunaj prosečnu brzinu iz vektora brzine."""
    if velocities is None or len(velocities) == 0 or not NUMPY_AVAILABLE:
        return 0
    try:
        speeds = np.sqrt(velocities[:, 0]**2 + velocities[:, 1]**2 + velocities[:, 2]**2)
        return float(np.mean(speeds))
    except:
        return 0

def calculate_max_speed(velocities):
    """Izračunaj maksimalnu brzinu."""
    if velocities is None or len(velocities) == 0 or not NUMPY_AVAILABLE:
        return 0
    try:
        speeds = np.sqrt(velocities[:, 0]**2 + velocities[:, 1]**2 + velocities[:, 2]**2)
        return float(np.max(speeds))
    except:
        return 0

# ================================================================
#  PREUZIMANJE REPLAY-A SA BALLCHASING.COM
# ================================================================

def download_replay_from_ballchasing(replay_id):
    """Preuzmi replay sa ballchasing.com (public replay-i)."""
    replay_path = os.path.join(TEMP_REPLAY_FOLDER, f"{replay_id}.replay")
    
    # Ako već postoji, vrati ga
    if os.path.exists(replay_path):
        print(f"  📦 Replay {replay_id} već postoji u kešu")
        return replay_path
    
    try:
        # 1. Pokušaj sa API tokenom
        url = f"https://ballchasing.com/api/replays/{replay_id}/file"
        headers = {"Authorization": TOKEN}
        
        response = requests.get(url, headers=headers, stream=True, timeout=30)
        
        if response.status_code == 200:
            with open(replay_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            print(f"  ✅ Replay {replay_id} preuzet (API)")
            return replay_path
        
        # 2. Ako ne radi, probaj javni download (bez tokena)
        url_public = f"https://ballchasing.com/dl/replay/{replay_id}"
        response = requests.post(url_public, stream=True, timeout=30)
        
        if response.status_code == 200:
            with open(replay_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            print(f"  ✅ Replay {replay_id} preuzet (javni)")
            return replay_path
        else:
            print(f"  ⚠️ Ne mogu da preuzmem replay {replay_id}: {response.status_code}")
            return None
            
    except Exception as e:
        print(f"  ⚠️ Greška pri preuzimanju {replay_id}: {e}")
        return None

def cleanup_temp_replays():
    """Obriši privremene replay fajlove (starije od 1h)."""
    import time
    try:
        current_time = time.time()
        for filename in os.listdir(TEMP_REPLAY_FOLDER):
            file_path = os.path.join(TEMP_REPLAY_FOLDER, filename)
            if os.path.isfile(file_path):
                # Obriši fajlove starije od 1 sat
                if current_time - os.path.getmtime(file_path) > 3600:
                    os.remove(file_path)
                    print(f"  🧹 Obrisan stari replay: {filename}")
    except Exception as e:
        print(f"  ⚠️ Greška pri čišćenju: {e}")

# ================================================================
#  BALCHASING API FUNKCIJE (standardne)
# ================================================================

def api_get(path, params=None, url=None):
    while True:
        r = requests.get(url or f"{API_BASE}{path}", headers=HEADERS, params=params)
        if r.status_code == 429:
            print("Rate limited, cekam 5s...")
            time.sleep(5)
            continue
        r.raise_for_status()
        time.sleep(SLEEP_BETWEEN_CALLS)
        return r.json()

def normalize(name):
    return "".join(ch for ch in (name or "").lower() if ch.isalnum())

KNOWN_PLAYERS = {normalize(n) for n in [
    "ExMirage", "ExMirage(1)", "ExMirage(2)", "ExMirage(3)",
    "Zbunjena Inila", "Zbunjena Inila(1)", "Zbunjena Inila(2)", "Zbunjena Inila(3)",
    "Rarely_Sober",
]}

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

def safe_get(d, *keys, default=None):
    for k in keys:
        if not isinstance(d, dict) or k not in d:
            return default
        d = d[k]
    return d

def extract_category(stats_dict, category, fields):
    src = stats_dict.get(category, {}) or {}
    return {f: src.get(f, 0) for f in fields}

def flatten_replay(replay, subtr_data=None):
    """Pretvori jedan detaljan replay JSON u listu redova."""
    rows = []
    date = replay.get("date")
    map_name = replay.get("map_name", replay.get("map_code", "?"))
    playlist = replay.get("playlist_name", replay.get("playlist_id", "?"))
    duration = replay.get("duration")
    replay_id = replay.get("id")
    overtime = replay.get("overtime", False)

    for color in ("blue", "orange"):
        team = replay.get(color)
        if not team:
            continue
        other_color = "orange" if color == "blue" else "blue"
        team_goals = safe_get(replay, color, "stats", "core", "goals", default=team.get("goals", 0))
        other_team = replay.get(other_color, {})
        opp_goals = safe_get(replay, other_color, "stats", "core", "goals", default=other_team.get("goals", 0))
        teammates = [pl.get("name", "?") for pl in team.get("players", [])]

        for p in team.get("players", []):
            player_name = p.get("name", "?")
            if normalize(player_name) not in KNOWN_PLAYERS:
                continue

            stats = p.get("stats", {}) or {}
            core = extract_category(stats, "core", CORE_FIELDS)
            core["mvp"] = bool(core.get("mvp", False))

            subtr_player_data = {}
            if subtr_data and player_name in subtr_data:
                subtr_player_data = subtr_data[player_name]

            rows.append({
                "replay_id": replay_id,
                "date": date,
                "map": map_name,
                "playlist": playlist,
                "duration": duration,
                "team_color": color,
                "team_goals": team_goals,
                "opponent_goals": opp_goals,
                "win": (team_goals or 0) > (opp_goals or 0),
                "overtime": overtime,
                "player": player_name,
                "platform": safe_get(p, "id", "platform", default="offline"),
                "teammates": [t for t in teammates if t != player_name],
                "core": core,
                "boost": extract_category(stats, "boost", BOOST_FIELDS),
                "movement": extract_category(stats, "movement", MOVEMENT_FIELDS),
                "positioning": extract_category(stats, "positioning", POSITIONING_FIELDS),
                "demo": extract_category(stats, "demo", DEMO_FIELDS),
                # ===== SUBTR-ACTOR DODACI =====
                "heatmap": subtr_player_data.get("heatmap", []),
                "ghost_car": {
                    "positions": subtr_player_data.get("positions", []),
                    "speeds": subtr_player_data.get("velocities", []),
                    "boost": subtr_player_data.get("boost", []),
                },
                "advanced_metrics": {
                    "avg_speed": subtr_player_data.get("avg_speed", 0),
                    "max_speed": subtr_player_data.get("max_speed", 0),
                    "total_frames": subtr_player_data.get("total_frames", 0),
                }
            })
    return rows

def list_replay_ids(group_id):
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

def load_cache():
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

def mode_for_group(group_id):
    if group_id == ONLINE_GROUP:
        return "online"
    if group_id == OFFLINE_GROUP:
        return "offline"
    return group_id

# ================================================================
#  MAIN
# ================================================================

def main():
    print("\n" + "="*60)
    print("  🚀 FETCH STATS SA SUBTR-ACTOR + AUTO DOWNLOAD")
    print("="*60 + "\n")

    cache = load_cache()
    print(f"📦 Keš: {len(cache)} vec obradjenih replay-a od ranije")

    subtr_cache = load_subtr_cache()
    print(f"📦 subtr-actor keš: {len(subtr_cache)} replay-a")

    print(f"📁 Privremeni replay folder: {TEMP_REPLAY_FOLDER}")
    print(f"📁 Trenutno fajlova u folderu: {len(glob.glob(os.path.join(TEMP_REPLAY_FOLDER, '*.replay')))}")

    all_rows = []
    seen_ids = set()
    new_count = 0
    cached_count = 0
    subtr_processed = 0
    downloaded_replays = 0

    for group_id in GROUPS:
        print(f"\n📂 Grupa: {group_id}")
        try:
            replay_ids = list_replay_ids(group_id)
        except requests.HTTPError as e:
            print(f"  ❌ Ne mogu da ucitam grupu {group_id}: {e}", file=sys.stderr)
            continue

        print(f"  📊 Nadjeno {len(replay_ids)} replay-a")
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
                    print(f"  ⚠️ Preskacem {rid}: {e}", file=sys.stderr)
                    continue

                if replay.get("status") not in (None, "ok"):
                    print(f"  ⚠️ Preskacem {rid}: status={replay.get('status')}", file=sys.stderr)
                    continue

                # ===== SUBTR-ACTOR OBRADA =====
                subtr_data = None
                if rid in subtr_cache:
                    subtr_data = subtr_cache[rid]
                    print(f"  📦 subtr-actor: keširano za {rid}")
                else:
                    # ===== PREUZMI REPLAY SA BALLCHASING.COM =====
                    print(f"  🔽 Preuzimam replay {rid} sa ballchasing.com...")
                    replay_path = download_replay_from_ballchasing(rid)
                    
                    if replay_path and os.path.exists(replay_path):
                        print(f"  🔍 Procesiram replay: {os.path.basename(replay_path)}")
                        subtr_data = process_replay_with_subtr_actor(replay_path)
                        if subtr_data:
                            subtr_cache[rid] = subtr_data
                            save_subtr_cache(subtr_cache)
                            subtr_processed += 1
                            downloaded_replays += 1
                            print(f"  ✅ subtr-actor: obrađen ({len(subtr_data)} igrača)")
                        else:
                            print(f"  ⚠️ subtr-actor: nema podataka za {rid}")
                    else:
                        print(f"  ⚠️ Replay {rid} nije moguće preuzeti")

                rows = flatten_replay(replay, subtr_data)
                cache[rid] = rows
                new_count += 1
                print(f"  + {rid} (novo, {len(rows)} redova)")

            for row in rows:
                if mode == "online":
                    teammate_norms = {normalize(t) for t in row.get("teammates", [])}
                    has_friend_teammate = bool(teammate_norms & KNOWN_PLAYERS)
                    row["mode"] = "online_team" if has_friend_teammate else "online_solo"
                else:
                    row["mode"] = mode
                all_rows.append(row)

    all_rows.sort(key=lambda r: r.get("date") or "")

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(all_rows, f, ensure_ascii=False, indent=2)

    save_cache(cache)

    print("\n" + "="*60)
    print("  ✅ ZAVRŠENO!")
    print("="*60)
    print(f"📊 Sacuvano {len(all_rows)} redova (igrac x mec) u {OUTPUT_FILE}")
    print(f"📦 {new_count} novih replay-a fetch-ovano, {cached_count} uzeto iz keša")
    print(f"🔽 {downloaded_replays} replay-a preuzeto sa ballchasing.com")
    print(f"🎯 subtr-actor: {subtr_processed} replay-a obrađeno, {len(subtr_cache)} u kešu")
    print("="*60 + "\n")

if __name__ == "__main__":
    main()
