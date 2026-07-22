"""
build_heatmaps_local.py (v7) - Ispravan API za sprocket-boxcars-py
"""

import json
import os
import sys
import time
from pathlib import Path

import requests

# Podesavanja
REPLAY_CACHE = Path("replay_cache.json")
REPLAY_DIR = Path("replays_cache")
DATA_FILE = Path("heatmap_data.json")
PROCESSED_FILE = Path("heatmap_processed.json")

FIELD_X_MIN, FIELD_X_MAX = -4200, 4200
FIELD_Y_MIN, FIELD_Y_MAX = -5300, 5300
GRID_COLS, GRID_ROWS = 64, 80

def new_grid():
    return [[0 for _ in range(GRID_COLS)] for _ in range(GRID_ROWS)]

def add_point(grid, x, y):
    if x is None or y is None:
        return
    if not (FIELD_X_MIN <= x <= FIELD_X_MAX and FIELD_Y_MIN <= y <= FIELD_Y_MAX):
        return
    col = int((x - FIELD_X_MIN) / (FIELD_X_MAX - FIELD_X_MIN) * GRID_COLS)
    row = int((y - FIELD_Y_MIN) / (FIELD_Y_MAX - FIELD_Y_MIN) * GRID_ROWS)
    col = min(max(col, 0), GRID_COLS - 1)
    row = min(max(row, 0), GRID_ROWS - 1)
    grid[row][col] += 1

def process_replay(replay_path):
    """Procesira replay fajl koristeci sprocket-boxcars-py"""
    import sprocket_boxcars_py as sb
    
    ball_grid = new_grid()
    player_grid = new_grid()
    
    # Učitaj replay
    replay = sb.load(str(replay_path))
    if replay is None:
        raise RuntimeError("Ne mogu da učitam replay fajl")
    
    # Dohvati sve frejmove
    frames = replay.get_frames()
    if not frames:
        raise RuntimeError("Nema frejmova u replay-u")
    
    # Prođi kroz sve frejmove
    for frame in frames:
        # Pozicija lopte - probaj različite načine
        try:
            ball = frame.get_ball()
            if ball:
                pos = ball.get_position()
                if pos:
                    add_point(ball_grid, pos[0], pos[1])
        except:
            pass
        
        # Pozicije igrača
        try:
            players = replay.get_players()
            for player in players:
                pos = frame.get_player_position(player.get_id())
                if pos:
                    add_point(player_grid, pos[0], pos[1])
        except:
            pass
    
    return ball_grid, player_grid

def merge_grid(target, addition):
    for r in range(len(target)):
        for c in range(len(target[r])):
            target[r][c] += addition[r][c]

def download_replay(replay_id, dest_path, token):
    """Dohvata replay sa Ballchasing API"""
    url = f"https://ballchasing.com/api/replays/{replay_id}/file"
    headers = {"Authorization": token}
    resp = requests.get(url, headers=headers, timeout=60)
    resp.raise_for_status()
    dest_path.write_bytes(resp.content)

def main():
    # Učitaj replay_cache.json od fetch_stats.py
    if not REPLAY_CACHE.exists():
        print(f"Upozorenje: {REPLAY_CACHE} ne postoji. Pokreni fetch_stats.py prvo.")
        return
    
    with open(REPLAY_CACHE, 'r') as f:
        cache = json.load(f)
    
    # Izvuci sve replay ID-eve iz keša
    all_replay_ids = list(cache.keys())
    print(f"Nadjeno {len(all_replay_ids)} replay-a u kešu")
    
    # Učitaj već obrađene
    processed = set()
    if PROCESSED_FILE.exists():
        with open(PROCESSED_FILE, 'r') as f:
            processed = set(json.load(f))
    
    todo = [rid for rid in all_replay_ids if rid not in processed]
    print(f"Novih za obradu: {len(todo)}")
    
    # Učitaj postojeći heatmap ili kreiraj novi
    if DATA_FILE.exists():
        with open(DATA_FILE, 'r') as f:
            data = json.load(f)
    else:
        data = {
            "grid_cols": GRID_COLS,
            "grid_rows": GRID_ROWS,
            "field_x": [FIELD_X_MIN, FIELD_X_MAX],
            "field_y": [FIELD_Y_MIN, FIELD_Y_MAX],
            "ball_grid": new_grid(),
            "player_grid": new_grid(),
            "replays_included": 0,
        }
    
    REPLAY_DIR.mkdir(exist_ok=True)
    token = os.environ.get("BALLCHASING_TOKEN")
    
    ok_count = 0
    err_count = 0
    
    for i, replay_id in enumerate(todo, 1):
        print(f"[{i}/{len(todo)}] {replay_id} ... ", end="", flush=True)
        replay_path = REPLAY_DIR / f"{replay_id}.replay"
        
        try:
            # Ako replay fajl ne postoji, dohvati ga (sa pauzom za rate limit)
            if not replay_path.exists():
                if not token:
                    raise RuntimeError("BALLCHASING_TOKEN nije podesen")
                download_replay(replay_id, replay_path, token)
                time.sleep(2)  # Pauza za rate limit
            
            ball_grid, player_grid = process_replay(replay_path)
            merge_grid(data["ball_grid"], ball_grid)
            merge_grid(data["player_grid"], player_grid)
            
            processed.add(replay_id)
            data["replays_included"] += 1
            ok_count += 1
            print("OK")
        except Exception as e:
            err_count += 1
            print(f"GRESKA: {type(e).__name__}: {e}")
        
        # Cuvaj progres posle svakog replay-a
        DATA_FILE.write_text(json.dumps(data), encoding="utf-8")
        PROCESSED_FILE.write_text(json.dumps(sorted(processed)), encoding="utf-8")
        
        # Pauza između replay-a za rate limit
        time.sleep(1)
    
    print(f"\nGotovo. Uspesno: {ok_count}. Greske: {err_count}.")

if __name__ == "__main__":
    main()
